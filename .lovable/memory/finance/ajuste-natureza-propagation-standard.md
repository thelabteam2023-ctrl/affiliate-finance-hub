---
name: ajuste-natureza-propagation-standard
description: Propagação canônica de AJUSTE_SALDO por ajuste_natureza em KPIs, gráfico de Evolução do Lucro e serviço de extras
type: feature
---
# Propagação do Ajuste de Saldo por Natureza (V17)

## Regra
Somente `ajuste_natureza = 'RECONCILIACAO_OPERACIONAL'` (default) entra no Lucro Operacional,
nos KPIs canônicos e no gráfico de Evolução do Lucro.
`EFEITO_FINANCEIRO` e `EXTRAORDINARIO` ficam fora — vivem em Indicadores Financeiros.

## Consumidores alinhados (paridade obrigatória)
- `get_projeto_lucro_operacional_daily` → CTE `ajustes_daily` (gráfico).
- `get_projetos_lucro_operacional(uuid[],text,text,jsonb)` → bucket `ajustes`.
  A sobrecarga de 3 args foi **removida** (ambiguidade PostgREST).
- `src/services/fetchProjetoExtras.ts` → `fetchAjustesSaldo`.
- `src/hooks/useKpiBreakdowns.ts` → bucket `ajuste_saldo`.

## Anti-dupla-contagem
Todos excluem `ajuste_motivo IN ('BONUS_CANCELAMENTO','PROMO_LIMIT')` do bucket genérico —
essas perdas já são contabilizadas pelo bucket de perdas de bônus.

## Direções válidas
`cash_ledger.ajuste_direcao` só aceita `ENTRADA` / `SAIDA`.
Filtros com `CREDITO`/`DEBITO` são bug (zeram o bucket silenciosamente).

## UI
`AjusteSaldoDialog.tsx` exige a escolha da natureza (default RECONCILIACAO_OPERACIONAL)
e propaga via `registrarAjusteViaLedger({ natureza })`.
