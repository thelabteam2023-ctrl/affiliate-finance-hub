# Memory: finance/project-financial-scope-isolation
Updated: 2026-03-04

## Isolamento Financeiro entre Projetos

KPIs e métricas de lucro nos dashboards de projeto são obrigatoriamente filtrados pelo `projeto_id_snapshot` no `cash_ledger`.

### Transações Virtuais (SAQUE_VIRTUAL / DEPOSITO_VIRTUAL)

Para garantir resultado fidedigno quando uma bookmaker é transferida entre projetos:

1. **Ao desvincular** (Projeto A): Gera `SAQUE_VIRTUAL` com o `saldo_atual` da bookmaker, atribuído ao `projeto_id_snapshot = Projeto A`. Isso "fecha" o P&L do projeto.

2. **Ao vincular** (Projeto B): Gera `DEPOSITO_VIRTUAL` com o `saldo_atual` da bookmaker, atribuído ao `projeto_id_snapshot = Projeto B`. Isso estabelece o baseline de capital.

### Regras Críticas

- **Contábil apenas**: SAQUE_VIRTUAL e DEPOSITO_VIRTUAL NÃO movimentam saldo real (o trigger `fn_cash_ledger_generate_financial_events` não possui handler para esses tipos).
- **projeto_id_snapshot explícito**: SAQUE_VIRTUAL define o snapshot manualmente porque a bookmaker já terá `projeto_id = NULL` no momento da inserção.
- **Saldo zero**: Se `saldo_atual <= 0`, nenhuma transação virtual é gerada.
- **Fórmula P&L do projeto**: `(Saques + Saques Virtuais + Saldo Atual) - (Depósitos + Depósitos Virtuais)`.

### Atribuição Retroativa

No momento da vinculação, transações órfãs (`projeto_id_snapshot IS NULL`) são retroativamente atribuídas ao novo projeto. Transações de outros projetos nunca são tocadas.

### Frontend

Queries em `ProjetoFinancialMetricsCard` e `HistoricoVinculosTab` usam `.in("tipo_transacao", ["DEPOSITO", "DEPOSITO_VIRTUAL"])` e `.in("tipo_transacao", ["SAQUE", "SAQUE_VIRTUAL"])` para incluir ambos tipos no cálculo.

### Locais de Implementação

- `src/lib/ledgerService.ts` — `registrarSaqueVirtualViaLedger()`, `registrarDepositoVirtualViaLedger()`
- `src/hooks/useProjetoVinculos.ts` — `useRemoveVinculo`, `useAddVinculos`
- `src/components/parceiros/ParceiroDetalhesPanel.tsx` — `handleVincularProjeto`, `handleDesvincularProjeto`
