# Memory: architecture/financial-indicators-cycle-attribution
Updated: 2026-03-10

## Indicadores Financeiros com Atribuição por Período

O `FinancialMetricsPopover` aceita um `dateRange` opcional (`{ from: string; to: string }` em formato ISO date) que filtra TODAS as queries do `cash_ledger` usando `data_transacao` (data do pedido, NÃO data de confirmação).

### Regra de Atribuição:
- **Saques**: Atribuídos ao ciclo pela `data_transacao` (data do pedido), não pela `data_confirmacao`
- **Depósitos**: Atribuídos ao ciclo pela `data_transacao`
- **Bônus**: Atribuídos pela `credited_at`
- **Demais transações** (cashback, giros, ajustes, perdas, FX): Atribuídos pela `data_transacao`

### Justificativa:
O modelo operacional fecha ciclos com base no que foi **produzido/operado** no período. Um saque solicitado no Ciclo 1 mas confirmado no Ciclo 2 pertence ao Ciclo 1 para fins de métricas financeiras.

### Arquitetura de Filtragem:
- **Header KPIs (ProjetoDetalhe)**: ALL-TIME — sem dateRange, mostra totais globais do projeto
- **Abas operacionais (Surebet, ValueBet, DuploGreen)**: Passam o `dateRange` do `useTabFilters`, que pode ser ciclo, mês, ano, etc.
- **BonusTab, FinancialSummaryCompact, KanbanCard**: ALL-TIME — sem filtro de período disponível

### Comportamento:
- Se o filtro da aba está em "Ciclo 3" → Indicadores Financeiros mostram apenas transações do Ciclo 3
- Se o filtro está em "Ano" → mostra o ano inteiro
- Header sempre mostra totais do projeto
