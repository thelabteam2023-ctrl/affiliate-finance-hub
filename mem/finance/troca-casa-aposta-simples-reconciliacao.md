---
name: Troca de casa em aposta simples reconcilia o ledger
description: Trigger que estorna a stake na casa antiga e debita na nova quando a bookmaker de uma aposta simples PENDENTE é alterada
type: feature
---

`fn_reconciliar_stake_aposta_simples(uuid)` + trigger `trg_reconciliar_stake_aposta_simples`
(AFTER UPDATE OF bookmaker_id, stake, stake_real, stake_freebet, fonte_saldo, usar_freebet
em `apostas_unificada`, apenas quando `status = 'PENDENTE'` e sem `apostas_pernas`).

Regra: a reconciliação compara, por (bookmaker, tipo_uso), o líquido de
`STAKE/FREEBET_STAKE/REVERSAL/AJUSTE` da aposta com o esperado
(`-stake_real` NORMAL, `-stake_freebet` FREEBET na casa corrente; 0 em qualquer outra casa)
e emite apenas o delta. Por ser baseada em delta, é idempotente: convive com
`atualizar_aposta_liquidada_atomica_v2` e com `sync_pending_aposta_stake_v1` sem duplicar eventos.

Causa raiz corrigida: o frontend salvava a troca de casa de aposta PENDENTE com UPDATE simples
em `apostas_unificada`; nenhum gatilho reagia a `bookmaker_id`, então o débito ficava preso na
casa antiga e a nova nunca era debitada.

Multi-entry (com pernas) e apostas LIQUIDADAS não passam por este gatilho — seguem pelos RPCs
próprios (`atualizar_aposta_liquidada_atomica_v2`, `reliquidar_aposta_v6`).

Regressão: `supabase/tests/triggers/09_troca_casa_aposta_simples_pendente.sql`.
