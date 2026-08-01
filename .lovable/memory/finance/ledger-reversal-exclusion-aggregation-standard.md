---
name: Ledger Reversal Exclusion (Agregações)
description: Toda somatória/KPI sobre cash_ledger exclui originais revertidos e espelhos de ESTORNO; listas de auditoria continuam exibindo ambos
type: feature
---

Qualquer agregação (somatórias, KPIs, gráficos, relatórios) sobre `cash_ledger`
DEVE desconsiderar:

1. o original anulado — `reversed_at IS NOT NULL`;
2. o espelho de estorno — `tipo_transacao = 'AJUSTE_RECONCILIACAO'` com
   `descricao LIKE 'ESTORNO:%'`.

Use `applyEffectiveFilter` (query) ou `classifyLedgerRow(row) === 'ORIGINAL_EFETIVO'`
(memória) de `src/lib/ledger/effective.ts`. No Histórico do Caixa Operacional
(`HistoricoMovimentacoes.tsx`) o filtro é aplicado no `useMemo` de `metricas`,
com nota "N lançamento(s) de reversão fora dos totais" no cabeçalho.

PROIBIDO aplicar o filtro em listas de auditoria, diálogos de edição/confirmação,
`useReverterMovimentacao` e validações pré-commit: essas trilhas precisam
enxergar a linha original e o estorno.