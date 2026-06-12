# Auditoria multi-tenant: isolamento por workspace em Parceiros

## 1. Causa raiz (confirmada no banco)

O erro **"Este endereço de wallet já está cadastrado para outro parceiro"** não vem do frontend nem de um índice UNIQUE — vem de uma **trigger BEFORE INSERT/UPDATE** em `wallets_crypto`:

- `validate_wallet_endereco_unique_trigger` → função `public.validate_wallet_endereco_unique()`
- E sua irmã, `validate_pix_key_unique_trigger` em `contas_bancarias` → `public.validate_pix_key_unique()`

Ambas escopam a unicidade por **`parceiros.user_id`** (dono da conta), e não por **`workspace_id`**. Quando o mesmo usuário é dono de múltiplos workspaces e replica um parceiro de um workspace para outro, o mesmo `user_id` aparece nos dois lados → a trigger encontra "duplicata" e bloqueia o salvamento. Esse é exatamente o sintoma reportado.

Trecho atual da trigger de wallet:

```sql
SELECT user_id INTO v_user_id FROM public.parceiros WHERE id = NEW.parceiro_id;
...
WHERE w.endereco = NEW.endereco
  AND p.user_id = v_user_id          -- ❌ escopo errado em multi-tenant
  AND w.id != COALESCE(NEW.id, ...);
```

A trigger de PIX (`validate_pix_key_unique`) tem exatamente o mesmo problema.

## 2. Demais constraints UNIQUE revisadas

Levantei todos os UNIQUE/índices únicos do schema `public`. **O restante já está correto**:

- `parceiros (cpf, workspace_id)` ✅
- `investidores (cpf, workspace_id)` ✅
- `operadores (cpf, workspace_id)` ✅
- `indicadores_referral (workspace_id, cpf)` ✅
- `bookmaker_grupos (workspace_id, nome)` ✅
- `fluxo_colunas (user_id, workspace_id, nome)` ✅
- demais tabelas compostas com `workspace_id` ✅

Não existe UNIQUE global em `wallets_crypto.endereco`, `contas_bancarias.pix_key`, `parceiros.email`, `telefone` ou `fornecedores.documento` — então o único vetor de violação de isolamento hoje são as duas triggers acima.

## 3. Impacto operacional

- Bloqueia replicação legítima de parceiros entre workspaces do mesmo owner (cenário reportado).
- Vaza informação cruzada (a mensagem revela que existe registro em outro workspace).
- Em workspaces compartilhados por múltiplos membros, a checagem por `user_id` (owner) também pode liberar duplicatas dentro do mesmo workspace se o owner mudar — inconsistência dos dois lados.

## 4. Correção proposta

Reescrever ambas as triggers para escopar por `workspace_id` do parceiro, ignorando `user_id`. Mantém o bloqueio dentro do workspace (regra de negócio desejada) e libera entre workspaces.

Esboço da nova função (a migration final fará o mesmo para PIX):

```sql
CREATE OR REPLACE FUNCTION public.validate_wallet_endereco_unique()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_ws uuid; v_exists boolean;
BEGIN
  SELECT workspace_id INTO v_ws FROM public.parceiros WHERE id = NEW.parceiro_id;
  IF v_ws IS NULL THEN RETURN NEW; END IF;

  SELECT EXISTS(
    SELECT 1
    FROM public.wallets_crypto w
    JOIN public.parceiros p ON p.id = w.parceiro_id
    WHERE w.endereco   = NEW.endereco
      AND p.workspace_id = v_ws                       -- ✅ escopo por tenant
      AND w.id <> COALESCE(NEW.id, '00000000-0000-0000-0000-000000000000'::uuid)
  ) INTO v_exists;

  IF v_exists THEN
    RAISE EXCEPTION 'Este endereço de wallet já está cadastrado para outro parceiro neste workspace'
      USING ERRCODE = '23505';
  END IF;
  RETURN NEW;
END $$;
```

Mesma transformação para `validate_pix_key_unique` (trocar `p.user_id = v_user_id` por `p.workspace_id = v_ws`).

Opcional (reforço de banco): criar índices únicos parciais para tornar a regra declarativa também:

```sql
CREATE UNIQUE INDEX wallets_crypto_endereco_workspace_unique
  ON public.wallets_crypto (endereco, (SELECT workspace_id FROM parceiros WHERE id = parceiro_id));
-- (Postgres não permite subselect em índice; alternativa é desnormalizar workspace_id na própria tabela)
```

Como Postgres não suporta subselect em índices, a forma robusta é **adicionar a coluna `workspace_id` denormalizada** em `wallets_crypto` e `contas_bancarias` (preenchida por trigger a partir do parceiro) e criar UNIQUE `(workspace_id, endereco)` / `(workspace_id, pix_key)`. Isso é opcional; a correção da trigger já resolve o bug imediato.

## 5. Migrations necessárias

1. **Crítica (resolve o bug):** `CREATE OR REPLACE FUNCTION` das duas funções acima. Nenhuma alteração de schema, nenhum risco de bloqueio.
2. **Opcional (defense-in-depth):** adicionar `workspace_id uuid` em `wallets_crypto` e `contas_bancarias` + backfill + trigger de preenchimento + índices UNIQUE compostos. Pode ficar para uma segunda rodada.

## 6. Frontend

Nenhuma mudança obrigatória. As mensagens em `ParceiroDialog.tsx` (linhas 897, 901, 1308) continuam válidas — apenas passarão a refletir conflito real dentro do workspace.

## 7. Testes de regressão recomendados

- Inserir mesma `endereco` de wallet em dois workspaces distintos (mesmo owner) → deve passar.
- Inserir mesma `endereco` no mesmo workspace em parceiros diferentes → deve falhar com 23505.
- UPDATE da própria wallet sem alterar endereço → deve passar.
- Mesmos três cenários para `pix_key` em `contas_bancarias`.
- Smoke test: editar parceiro existente sem tocar em wallets/PIX → salvar com sucesso.

## 8. Riscos arquiteturais residuais

- Mensagens de erro de unicidade não devem revelar existência cross-workspace (já tratado ao escopar por workspace).
- Recomenda-se padronizar: toda nova validação de unicidade deve usar `(workspace_id, campo)`. Adicionar isso ao memory de arquitetura após implementação.

Posso seguir para o modo build e aplicar a migration crítica (item 5.1)?
