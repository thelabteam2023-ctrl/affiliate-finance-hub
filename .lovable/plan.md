## Bônus Órfãos em Migração de Bookmaker entre Projetos

### Contexto / Diagnóstico

Quando uma bookmaker (já existente em outro projeto) é vinculada a um **novo projeto**, o sistema:
- ✅ Cria `DEPOSITO_VIRTUAL` (BACKFILL/MIGRACAO) no projeto destino com a parte real
- ✅ Cria `SAQUE_VIRTUAL` no projeto origem
- ❌ **NÃO** migra registros ativos de `project_bookmaker_link_bonuses` (status `credited`)

### Caso real (Diego/Everygame – bookmaker `8de2ba2c`)

Origem: projeto `8d836024` → tinha `BONUS_CREDITADO` ($200, "Boas-vindas 50%") em 2026-03-16.
Destino: projeto Fênix `438cef89` → recebeu `DEPOSITO_VIRTUAL` $400 (parte real) mas **zero** registros em `project_bookmaker_link_bonuses`.

Consequências:
- Tentativa de excluir o bônus na UI gerou `BONUS_ESTORNO` ($200) no ledger (já existe, ID `1ca6f54f`), mas **nada** mudou na UI/KPIs porque não havia registro em `project_bookmaker_link_bonuses` para deletar.
- KPI Performance de Bônus continua mostrando o $200 antigo porque a fonte (ledger no projeto origem) ainda tem `BONUS_CREDITADO` ativo.
- Bookmaker some do "Por Casa" do projeto Fênix porque o filtro `getBookmakersWithAnyBonus` exigia ≥1 registro em `project_bookmaker_link_bonuses`.

### Plano de Ação

#### Parte A — Restauração pontual (Diego/Everygame em Fênix)

1. **Criar registro órfão** em `project_bookmaker_link_bonuses` para o bookmaker `8de2ba2c` no projeto Fênix `438cef89`, replicando os dados do bônus original ($200, "Boas-vindas 50%", status `credited`, currency USD, created_at preservado).
2. **Não gerar novo `BONUS_CREDITADO`** no ledger — o histórico financeiro já existe no projeto origem (não duplicar).
3. **Reverter o `BONUS_ESTORNO` indevido** (`1ca6f54f`) gerado pela tentativa anterior de exclusão (cancelar via `cancelled_at`/`cancelled_by_rpc` para não contaminar caixa).

#### Parte B — Correção sistêmica (migração automática de bônus)

1. **Ajustar `fn_ensure_deposito_virtual_on_link`** (trigger que dispara em UPDATE de `bookmakers.projeto_id`):
   - Quando detectar tipo MIGRACAO (bookmaker vindo de outro projeto), ler todos os bônus com status `credited` no projeto origem para esse bookmaker.
   - Para cada bônus ativo, **inserir uma cópia** em `project_bookmaker_link_bonuses` apontando para o `project_id` destino, preservando todos os campos (amount, type, currency, rollover, etc.).
   - **Manter o registro original** no projeto origem com status atualizado para `migrated` (novo valor permitido) OU adicionar coluna `migrated_to_project_id` para rastreabilidade — sem gerar `BONUS_ESTORNO`/`BONUS_CREDITADO` (não duplica ledger).
2. **Adicionar enum value** `migrated` ao status (se for enum) ou validar via CHECK constraint.
3. **Criar índice** para acelerar busca de bônus ativos por `(bookmaker_id, status)`.

#### Parte C — Auditoria de outros casos órfãos

Rodar query para detectar TODOS os bookmakers que sofreram migração (origem com `BONUS_CREDITADO` + destino com `DEPOSITO_VIRTUAL` MIGRACAO + zero registros em `project_bookmaker_link_bonuses` no destino) e listar para decisão de remediação em batch.

#### Parte D — Memória

- `mem://architecture/bonus-tab-unified-resolution-flow` → adicionar nota: "Bônus ativos migram automaticamente quando bookmaker é vinculada a novo projeto via trigger `fn_ensure_deposito_virtual_on_link`."
- Nova memória `mem://finance/bonus-migration-cross-project-standard.md`.

### Arquivos / Migrations afetados

- **Migration 1** (Parte A): INSERT no `project_bookmaker_link_bonuses` + UPDATE `cash_ledger` (cancelar estorno indevido).
- **Migration 2** (Parte B): `CREATE OR REPLACE FUNCTION fn_ensure_deposito_virtual_on_link` (estendida) + possível ALTER no enum/CHECK de status.
- **Auditoria** (Parte C): query SELECT-only via tool `read_query` — sem mudança de código.
- Nenhuma mudança no frontend é necessária (após migração os hooks existentes leem corretamente).

### Resultado esperado

- ✅ Diego/Everygame volta a aparecer em "Por Casa" no Fênix com bônus de $200 ativo.
- ✅ KPIs de Performance de Bônus do Fênix passam a refletir corretamente esse bônus migrado.
- ✅ Exclusão do bônus pela UI funciona normalmente (existe registro para deletar + idempotência do estorno).
- ✅ Toda futura vinculação de bookmaker que carrega bônus ativos preserva metadados automaticamente.
