# Memory: finance/lucro-real-payment-standard
Updated: 2026-03-10

## Lucro Realizado (Fluxo Líquido Ajustado) — Fórmula Canônica

```
LUCRO_REALIZADO = (Saques + Saques Virtuais) - (Depósitos + Depósitos Virtuais)
```

### Regra Absoluta
**TODOS** os locais que calculam Lucro Realizado / Fluxo Líquido devem usar:
- `.in("tipo_transacao", ["SAQUE", "SAQUE_VIRTUAL"])` para saques
- `.in("tipo_transacao", ["DEPOSITO", "DEPOSITO_VIRTUAL"])` para depósitos

**PROIBIDO** usar `.eq("tipo_transacao", "SAQUE")` ou `.eq("tipo_transacao", "DEPOSITO")` isoladamente para cálculo de lucro realizado.

### Transações Virtuais
- `SAQUE_VIRTUAL`: Criado ao desvincular bookmaker de um projeto (extrai saldo contábil)
- `DEPOSITO_VIRTUAL`: Criado ao vincular bookmaker a um projeto (estabelece baseline de capital)
- Ambos possuem `projeto_id_snapshot` e `origem/destino_bookmaker_id`

### Locais Padronizados ✅
- `calcularMetricasPeriodo.ts` — serviço canônico de métricas por período
- `FinancialMetricsPopover.tsx` — popover de indicadores financeiros
- `FinancialSummaryCompact.tsx` — resumo compacto no header
- `GestaoProjetos.tsx` — listagem/kanban de projetos
- `useProjetoPerformance.ts` — hook de performance por projeto
- `useBookmakerAnalise.ts` — análise financeira por casa

### Créditos Extras (informacional apenas)
Cashback + Giros + Bônus + Ajustes + FX são exibidos como informação complementar mas **NÃO** são subtraídos da fórmula de lucro realizado.
