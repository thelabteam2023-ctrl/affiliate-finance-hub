## Contexto

O mesmo usuário (ex.: MARCIO, `auth_user_id=58d961f5...`) pode atuar como operador em **N workspaces**. O modelo atual já cobre isso:

- Tabela `operadores` tem uma linha **por workspace** (id de operador diferente, mesmo `auth_user_id`):
  - MARCIO no workspace `41718476...` → `operador_id=4baa422e...`
  - MARCIO no workspace `feee9758...` → `operador_id=84e44c29...`
- Cada `operador.id` é local ao seu `workspace_id`. Lançamentos (`despesas_administrativas`, `pagamentos_operador`, `operador_projetos`, etc.) referenciam o **operador_id**, não o `auth_user_id`.

Conclusão: o ID do operador **muda** por workspace; o `auth_user_id` é o elo comum (somente identidade da pessoa). Já existe isolamento natural. Os problemas residuais são:

1. **UI/seleção de operador** pode listar/escolher um operador de outro workspace (causa do bug original que vimos: despesa do MARCIO apontava para o `operador_id` do workspace errado).
2. **Falta de blindagem em outras tabelas com `operador_id`** (já cobrimos `despesas_administrativas` e `pagamentos_operador` na migration anterior).
3. **Auto-provisionamento**: quando um `auth_user_id` aparece em um workspace novo, precisamos garantir que exista a linha em `operadores` daquele workspace antes de qualquer lançamento — nunca reusar `operador_id` de outro workspace.

## Plano

### 1. Blindagem de banco (defesa em profundidade)
Estender o trigger `enforce_operador_workspace_match()` (já criado) para TODAS as tabelas com FK para `operadores.id`:

- `operador_projetos`
- `entregas`
- `apostas_unificada` (se referenciar operador)
- `apostas_pernas` (idem)
- `pagamentos_propostos`
- qualquer outra surgida no levantamento

Cada tabela ganha trigger `BEFORE INSERT OR UPDATE OF operador_id, workspace_id` chamando a mesma função. Erro claro se workspaces divergem.

### 2. View canônica `operadores_do_workspace`
Padronizar leitura no frontend via uma única query (ou hook) que **sempre** filtra `operadores.workspace_id = currentWorkspaceId`. Eliminar selects diretos sem filtro.

### 3. Hook `useOperadoresWorkspace(workspaceId)`
Garantir que todo seletor (`<Select operadores>`) consuma este hook. Auditar componentes que hoje fazem `from('operadores').select()` cru e migrar.

### 4. Auto-provisionamento determinístico
RPC `ensure_operador_for_user(_auth_user_id uuid, _workspace_id uuid)`:
- Retorna `operador_id` existente daquela combinação `(auth_user_id, workspace_id)`.
- Se não existir, cria com `nome = display_name || email`, `status=ATIVO`, `tipo_contrato` default.
- Usar em: `VincularOperadorDialog`, `ProjectPostCreateWizard`, `ProjectCreationWizard` — em vez de inserir manualmente.

### 5. Constraint de unicidade
`UNIQUE (workspace_id, auth_user_id) WHERE auth_user_id IS NOT NULL` em `operadores` para impedir duplicatas no mesmo workspace.

### 6. Auditoria de dados existentes
Rodar relatório (read-only) listando lançamentos em qualquer tabela cujo `operador_id.workspace_id ≠ tabela.workspace_id`. Reportar antes de corrigir. Não fazer retrofix em massa (política anti-retrofix).

### 7. Documentação / memória
Salvar memória `mem://architecture/security/operador-multi-workspace-isolation-standard` com as regras: 1 linha de `operadores` por `(auth_user_id, workspace_id)`; FKs sempre validadas por trigger; seletores sempre filtrados.

## Entregáveis (ordem)

1. Migration: trigger replicado nas demais tabelas + UNIQUE constraint + RPC `ensure_operador_for_user`.
2. Refactor frontend: hook `useOperadoresWorkspace` + adoção nos 3 wizards/seletores.
3. Relatório de auditoria (SELECT) — sem alterações de dados.
4. Memória persistente.

## Fora de escopo
- Mass-fix de lançamentos legados (será tratado pontualmente após o relatório).
- Mudar `operador_id` para chave composta (quebraria muito código).

Quer que eu prossiga com o passo 1 (migration) ou prefere começar pelo relatório de auditoria?
