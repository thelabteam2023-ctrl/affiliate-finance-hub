# Memory: architecture/financial-indicators-cycle-attribution
Updated: 2026-03-10

## Indicadores Financeiros com Atribuição por Ciclo

O `FinancialMetricsPopover` agora aceita um `dateRange` opcional (`{ from: string; to: string }` em formato ISO date) que filtra TODAS as queries do `cash_ledger` usando `data_transacao` (data do pedido, NÃO data de confirmação).

### Regra de Atribuição:
- **Saques**: Atribuídos ao ciclo pela `data_transacao` (data do pedido), não pela `data_confirmacao`
- **Depósitos**: Atribuídos ao ciclo pela `data_transacao`
- **Bônus**: Atribuídos pela `credited_at`
- **Demais transações** (cashback, giros, ajustes, perdas, FX): Atribuídos pela `data_transacao`

### Justificativa:
O modelo operacional do usuário fecha ciclos com base no que foi **produzido/operado** no período. Um saque solicitado no Ciclo 1 mas confirmado no Ciclo 2 pertence ao Ciclo 1 para fins de métricas financeiras. Isso evita a inflação artificial de ciclos futuros.

### Consumidores:
- `ProjetoDetalhe.tsx` — passa `data_inicio` e `data_fim_prevista` do ciclo ativo
- `ProjetoSurebetTab.tsx`, `ProjetoValueBetTab.tsx`, `ProjetoDuploGreenTab.tsx` — passam `dateRange` do `useTabFilters`
- `ProjetoBonusTab.tsx`, `FinancialSummaryCompact.tsx`, `ProjetoKanbanCard.tsx` — sem filtro (mostram ALL-TIME)

### Comportamento quando sem dateRange:
Quando `dateRange` é `null/undefined`, o popover mostra dados ALL-TIME (comportamento original preservado).
