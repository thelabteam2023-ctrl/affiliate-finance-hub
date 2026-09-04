---
name: Visibilidade de apostas com data futura
description: Presets de período cobrem o período civil completo e a aba Apostas tem rede de segurança para eventos com data_aposta futura em qualquer status
type: feature
---

`getDateRangeFromPeriod` (`src/hooks/useTabFilters.ts` e `src/contexts/OperationalFiltersContext.tsx` — devem permanecer idênticos):
- `mes_atual` = 1º ao último dia do mês; `ano` = 1º/jan a 31/dez (não mais `endOfDay(now)`).
- `1dia` e `7dias` continuam fechando hoje.

`ProjetoApostasTab.tsx`: além da query complementar de PENDENTES sem filtro de data, existe uma query de segurança com `.gt("data_aposta", endUTC)` (qualquer status) nas três formas de registro (SIMPLES, MULTIPLA, ARBITRAGEM), deduplicada por id. Motivo: aposta LIQUIDADA com data futura ficava invisível no histórico.

`ApostaCard` exibe badge "Evento futuro" quando `data_aposta > agora`.
