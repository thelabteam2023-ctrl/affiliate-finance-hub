---
name: multi-entry-stake-misto-split-standard
description: Pernas multi-entry com stake misto (real + freebet) DEVEM gerar 2 eventos STAKE separados (NORMAL e FREEBET) para evitar PISO_ZERO
type: feature
---

# Multi-entry — Split obrigatório de STAKE em pernas mistas

## Regra
Em apostas multi-entry, sempre que `apostas_pernas.stake_real > 0` E `apostas_pernas.stake_freebet > 0` (perna MISTA), `liquidar_aposta_v4` e `reliquidar_aposta_v6` DEVEM emitir **DOIS eventos STAKE distintos** por perna:

1. `STAKE` (tipo_uso=NORMAL) com `valor = -stake_real`, idempotency_key `stake_<aposta>_perna_<perna>`
2. `FREEBET_STAKE` (tipo_uso=FREEBET) com `valor = -stake_freebet`, idempotency_key `stake_fb_<aposta>_perna_<perna>`

## Justificativa
Antes do fix, ambas RPCs criavam UM único STAKE classificado pela `fonte_saldo` da perna:
- Se FREEBET: tentava `-150 FREEBET` em saldo_freebet=50 → `PISO_ZERO: Operação bloqueada`
- Se REAL: nunca debitava a parte freebet, criando saldo_freebet fantasma

## Cálculo de PAYOUT por componente
| Resultado | payout_real (NORMAL) | payout_freebet (FREEBET_PAYOUT→NORMAL) |
|-----------|----------------------|----------------------------------------|
| GREEN     | stake_real × odd     | stake_freebet × (odd-1)                |
| MEIO_GREEN| stake_real + stake_real×(odd-1)/2 | stake_freebet × (odd-1)/2 |
| VOID      | stake_real           | 0 (freebet consumida)                  |
| MEIO_RED  | stake_real / 2       | 0                                      |
| RED       | 0                    | 0                                      |

## Reliquidação (reliquidar_aposta_v6)
Cria 2 AJUSTEs separados por perna mista:
- `reliq_perna_<perna>_real_<from>_to_<to>` → diferença real (NORMAL)
- `reliq_perna_<perna>_fb_<from>_to_<to>` → diferença freebet (NORMAL, vai para saldo)

Backfill de STAKE faltante usa as mesmas duas chaves para idempotência.
