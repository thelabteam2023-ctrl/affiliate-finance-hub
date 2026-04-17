---
name: surebet-card-runtime-priority-standard
description: SurebetCard prioriza cálculo runtime (calcularCenarios) sobre lucro_esperado/roi_esperado do banco em apostas pendentes
type: feature
---

# Surebet Card — Prioridade Runtime sobre Banco (Pendentes)

## Regra
Para apostas **PENDENTES**, o `SurebetCard` deve **priorizar** o resultado de `calcularCenarios()` (runtime) sobre os campos `lucro_esperado` e `roi_esperado` persistidos em `apostas_unificada`.

```ts
// CORRETO
const lucroExibir = isLiquidada
  ? lucroConsolidadoEfetivo ?? surebet.lucro_real
  : (piorCenarioCalculado?.lucro ?? surebet.lucro_esperado ?? null);
```

## Justificativa
`lucro_esperado` é gravado **uma única vez** na criação/edição da aposta. Apostas legadas criadas antes das correções de:
- Detecção canônica de freebet (`mem://finance/surebet-freebet-detection-canonical`)
- Pernas multi-entrada (mesma seleção em 2+ casas)
- Snapshot de cotação por perna

…possuem `lucro_esperado` **divergente da realidade**, frequentemente negativo (somando freebets como custo) quando o cenário real é positivo.

A função SQL `fn_recalc_pai_surebet` **NÃO** tem a lógica completa de detecção de freebet/SNR no nível de perna, então re-rodá-la não corrige.

## Liquidadas
Para apostas **liquidadas**, a regra anterior se mantém: priorizar `pl_consolidado` (RPC atômica do motor financeiro) > `lucro_real` > fallback runtime.

## Cor do badge
Quando há faixa (mín → máx), a cor do badge segue o **pior cenário** (`piorLucro`). Se o pior já é positivo, a operação é lucrativa em todos os cenários → verde.
