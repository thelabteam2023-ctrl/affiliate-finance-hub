-- 05_surebet_freebet_snr_payout_normal.sql
-- Garante que FREEBET_PAYOUT nunca seja gravado com tipo_uso <> 'NORMAL'.
-- Cobre o guardrail chk_freebet_payout_tipo_uso_normal e valida a política:
-- lucro de freebet SNR vai SEMPRE para saldo real.

BEGIN;

DO $$
DECLARE
  v_has_guardrail BOOLEAN;
  v_def TEXT;
BEGIN
  -- (1) O guardrail deve existir na tabela financial_events.
  SELECT EXISTS (
    SELECT 1
      FROM pg_constraint c
      JOIN pg_class t ON t.oid = c.conrelid
     WHERE t.relname = 'financial_events'
       AND c.conname = 'chk_freebet_payout_tipo_uso_normal'
       AND c.contype = 'c'
  ) INTO v_has_guardrail;

  IF NOT v_has_guardrail THEN
    RAISE EXCEPTION 'Guardrail chk_freebet_payout_tipo_uso_normal AUSENTE em financial_events';
  END IF;

  -- (2) A definição deve exigir tipo_uso = NORMAL quando tipo_evento = FREEBET_PAYOUT.
  SELECT pg_get_constraintdef(c.oid)
    INTO v_def
    FROM pg_constraint c
    JOIN pg_class t ON t.oid = c.conrelid
   WHERE t.relname = 'financial_events'
     AND c.conname = 'chk_freebet_payout_tipo_uso_normal';

  IF v_def !~* 'FREEBET_PAYOUT' OR v_def !~* 'NORMAL' THEN
    RAISE EXCEPTION 'Definição do guardrail inesperada: %', v_def;
  END IF;

  -- (3) Nenhum evento vivo (não revertido) pode existir violando a regra.
  IF EXISTS (
    SELECT 1
      FROM financial_events fe
     WHERE fe.tipo_evento = 'FREEBET_PAYOUT'
       AND fe.tipo_uso <> 'NORMAL'
       AND NOT EXISTS (
         SELECT 1 FROM financial_events r
          WHERE r.tipo_evento = 'REVERSAL'
            AND r.reversed_event_id = fe.id
       )
  ) THEN
    RAISE EXCEPTION 'Existem FREEBET_PAYOUT vivos com tipo_uso <> NORMAL (fluxo de correção histórica pendente)';
  END IF;

  RAISE NOTICE '✅ 05_surebet_freebet_snr_payout_normal: OK';
END $$;

ROLLBACK;