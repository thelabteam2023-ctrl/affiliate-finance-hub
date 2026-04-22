---
name: bonus-calendar-perdas-cancelamento-standard
description: O calendário de Resultado Líquido de Bônus DEVE incluir perdasCancelamento para paridade com o KPI Performance de Bônus
type: feature
---
O `calendarApostas` do `BonusResultadoLiquidoChart` deve agregar 4 fontes:
1. Bônus creditados (excluindo FREEBET)
2. Juice (P&L apostas com bonus_id ou EXTRACAO_BONUS)
3. Ajustes pós-limitação (cash_ledger AJUSTE_POS_LIMITACAO)
4. **Perdas por cancelamento** (cash_ledger BONUS_CANCELAMENTO) — antes faltava

A omissão de perdasCancelamento no calendário causa divergência exata entre:
- Card KPI "Performance de Bônus" (inclui perdas) 
- Calendário/Gráfico (sem perdas)

Sempre que adicionar nova fonte ao bonusPerformance do KPI, propagar para o calendário.
