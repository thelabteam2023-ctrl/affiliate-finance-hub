# Memory: finance/bonus-exclusion-from-lucro-kpi
Updated: 2026-03-06

O KPI de "Lucro" na Visão Geral do projeto **exclui obrigatoriamente** apostas vinculadas a bônus (`bonus_id IS NOT NULL` ou `estrategia = 'EXTRACAO_BONUS'`). Isso se aplica tanto ao cálculo de lucro (`grossProfitFromBets`) quanto ao de volume (`totalStaked`) e aos breakdowns por módulo (`useKpiBreakdowns`).

**Justificativa**: Bônus são capital operacional, não lucro realizado. O resultado de bônus só se materializa como lucro quando sacado. As estratégias operacionais (Surebet, ValueBet, Duplo Green) representam lucro independente de saque, enquanto bônus dependem do fluxo de caixa para sua realização.

**Regra**: O resultado de bônus é tratado exclusivamente na aba Bônus, com suas próprias métricas (ROI Operacional, Resultado Líquido, Performance vs Potencial). O KPI geral reflete apenas o lucro das estratégias puras.

**Filtros aplicados** em `useProjetoResultado`, `useKpiBreakdowns` e `fetchApostasResumo` (ProjetoDetalhe):
- `.is('bonus_id', null)`
- `.neq('estrategia', 'EXTRACAO_BONUS')`
