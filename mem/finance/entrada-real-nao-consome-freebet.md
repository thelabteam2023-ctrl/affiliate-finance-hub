---
name: Entrada real nunca consome freebet
description: Validação de saldo em arbitragem/apostas separa saldo real (saldo_disponivel) de freebet (saldo_freebet); saldo_operavel é proibido para validação
type: feature
---

`get_bookmaker_saldos.saldo_operavel` = saldo_disponivel + saldo_freebet. Usar `saldo_operavel`
para validar entradas é PROIBIDO (permitia registrar entrada REAL com saldo real zerado, caso
GASTON RED: real 0,00 + freebet 100 → entrada real de 100 aceita).

Regra canônica:
- entrada REAL (fonteSaldo != FREEBET) valida contra `saldo_disponivel`;
- entrada FREEBET valida contra `saldo_freebet`;
- LAY reserva liability = stake × (odd − 1) (`capitalComprometido`).

Frontend: fonte única `validateBalance` em `src/utils/surebetBalanceValidation.ts`
(consumida por SurebetModalRoot e SurebetDialogTable); `useSafeApostaSave.validateOnly`
também usa `saldo_disponivel`.

Backend (autoridade final, fail-closed): `fn_sync_stake_event_v1` — funil único de débito —
faz a trava antes do INSERT em `financial_events`, validando o delta (novo − já debitado) contra
`saldo_atual` (NORMAL) ou `saldo_freebet` (FREEBET), com `RAISE EXCEPTION 'SALDO_INSUFICIENTE: ...'`.
Cobre criação, edição (inclusive troca de casa/fonte/moeda) e chamada direta da RPC.
