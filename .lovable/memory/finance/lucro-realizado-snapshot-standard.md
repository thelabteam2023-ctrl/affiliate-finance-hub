---
name: lucro-realizado-snapshot-standard
description: Snapshot imutável de lucro/ROI em apostas_unificada congelado por trigger na transição para LIQUIDADA
type: feature
---

# Snapshot de Lucro Realizado (apostas_unificada)

## Colunas
- `lucro_realizado numeric` — cópia imutável de `pl_consolidado` no instante da liquidação.
- `roi_realizado numeric`   — `(pl_consolidado / stake_consolidado) * 100` congelado junto.
- `lucro_realizado_at timestamptz` — timestamp do congelamento.

## Disparo
Trigger `trg_snapshot_lucro_realizado` (BEFORE UPDATE) chama `public.fn_snapshot_lucro_realizado()`:
- Atua quando `NEW.status='LIQUIDADA'` e `pl_consolidado IS NOT NULL` e
  (transição de status, mudança de `pl_consolidado` por reliquidação, ou snapshot ainda nulo).
- Backfill único aplicado para liquidadas pré-existentes.

## Leitura no SurebetCard
```ts
const lucroExibir = isLiquidada
  ? (surebet.lucro_realizado ?? lucroConsolidadoEfetivo ?? surebet.lucro_real)
  : (piorCenarioCalculado?.lucro ?? surebet.lucro_esperado ?? null);
```
- **Liquidada:** snapshot é fonte primária — operações fechadas são imutáveis,
  protegidas contra qualquer regressão futura no motor de cálculo.
- **Pendente:** mantém prioridade runtime (`calcularCenarios`) conforme
  `mem://finance/surebet-card-runtime-priority-standard`.

## Selects obrigatórios
Todas as abas que alimentam `SurebetCard` devem incluir `lucro_realizado, roi_realizado`
no `select(...)`: ProjetoSurebetTab, ProjetoApostasTab, ProjetoValueBetTab,
ProjetoPunterTab, ProjetoDuploGreenTab.

## Responsabilidade (liability) — derivada, não persistida
`liability = stake * (odd - 1)` é sempre calculado em runtime via `exposureOf` em
`src/utils/pernaLayHelpers.ts`. Como `stake` e `odd` da perna já são congelados
na criação, a derivação é tão imutável quanto uma coluna persistida — sem custo
de schema nem risco de divergência.