

## Diagnóstico

Você está 100% certo. A memória `architecture/caixa-operacional-virtual-partner` é explícita:

> *"O parceiro caixa é **filtrado** das listagens de parceiros reais"*

O `Caixa Operacional` foi colocado na tabela `parceiros` apenas como **truque de reúso de infraestrutura** (contas bancárias, wallets, ledger, views de saldo). Ele **NÃO é um parceiro real** e não deve aparecer em nenhuma UI voltada ao usuário onde se escolhe/lista parceiros.

## Causa raiz do bug do screenshot

`src/hooks/usePlanningData.ts → useParceirosLite()` (linhas 157-173) consulta `parceiros` filtrando só por `workspace_id` e `status = ativo`, **sem excluir `is_caixa_operacional = true`**. Esse hook alimenta:

1. **`RecursosManager.tsx → PerfisList`** (modal "Gerenciar recursos → Perfis") — onde o vazamento aparece no screenshot
2. **`PlanejamentoCalendario.tsx`** — usado para resolver labels (aqui pode causar exibição do "Caixa Operacional" como nome de perfil em cards)
3. **`CampanhaDialog.tsx`** — seletor de parceiro/perfil ao criar/editar campanha

## Correção

### 1. Fix definitivo na fonte (`useParceirosLite`)
Adicionar `.eq("is_caixa_operacional", false)` no hook. Isso resolve os 3 consumidores de uma vez, mantendo o padrão dos demais hooks já corretos no projeto (`useParceirosData.ts`, `GestaoBookmakers.tsx`, `useCentralAlertsCount.ts` — todos já filtram).

### 2. Auditoria preventiva
Varrer todas as outras consultas a `parceiros` que ainda não excluem o caixa em contextos de listagem ao usuário, e corrigir as que estiverem expostas. Já mapeei os arquivos que usam `is_caixa_operacional` (14 arquivos), a maioria já filtra corretamente — vou validar os que faltam.

### 3. Memória reforçada
Atualizar `mem://architecture/caixa-operacional-virtual-partner` para listar explicitamente o **padrão obrigatório**: *toda* query a `parceiros` em hook/componente que serve seleção/listagem ao usuário **deve** incluir `.eq("is_caixa_operacional", false)`. A única exceção continua sendo lookup maps (resolução de label em transações já registradas).

## Arquivos a editar

- `src/hooks/usePlanningData.ts` — adicionar filtro em `useParceirosLite`
- `.lovable/memory/architecture/caixa-operacional-virtual-partner.md` — reforçar regra
- (Possíveis outros, após auditoria — vou listar e corrigir se houver vazamento)

## Detalhes técnicos

**Mudança no hook (1 linha):**
```ts
.from("parceiros")
.select("id, nome, email, endereco, cidade")
.eq("workspace_id", workspaceId!)
.eq("status", "ativo")
.eq("is_caixa_operacional", false)  // ← novo
.order("nome");
```

Sem migração de banco. Sem mudança de schema. Sem impacto em ledger/saldos. É apenas filtro de leitura na camada de UI.

