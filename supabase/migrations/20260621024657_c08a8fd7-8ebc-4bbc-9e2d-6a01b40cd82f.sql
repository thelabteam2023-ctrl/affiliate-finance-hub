
DROP FUNCTION IF EXISTS public.editar_aposta_liquidada_v4(uuid, uuid, numeric, numeric, text, numeric, text);

CREATE OR REPLACE FUNCTION public.editar_aposta_liquidada_v4(
  p_aposta_id uuid,
  p_novo_bookmaker_id uuid DEFAULT NULL::uuid,
  p_novo_stake numeric DEFAULT NULL::numeric,
  p_nova_odd numeric DEFAULT NULL::numeric,
  p_novo_resultado text DEFAULT NULL::text,
  p_lucro_prejuizo numeric DEFAULT NULL::numeric,
  p_nova_moeda text DEFAULT NULL::text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_aposta apostas_unificada%ROWTYPE;
  v_workspace_id UUID;
  v_user_id UUID;
  v_fonte_saldo TEXT;
  v_tipo_uso TEXT;
  v_bookmaker_anterior_id UUID;
  v_bookmaker_novo_id UUID;
  v_stake_anterior NUMERIC;
  v_stake_novo NUMERIC;
  v_odd_anterior NUMERIC;
  v_odd_novo NUMERIC;
  v_moeda_anterior TEXT;
  v_moeda_nova TEXT;
  v_resultado_atual TEXT;
  v_resultado_novo TEXT;
  v_lucro_novo NUMERIC;
  v_payout_novo NUMERIC;
  v_refund_novo NUMERIC;
  v_idempotency_prefix TEXT;
  v_is_multipla BOOLEAN;
  v_has_real_freebet BOOLEAN;
  v_old_stake_real NUMERIC;
  v_old_stake_freebet NUMERIC;
  v_new_stake_real NUMERIC;
  v_new_stake_freebet NUMERIC;
  v_old_event RECORD;
  v_events_reverted INTEGER := 0;
  v_events_created INTEGER := 0;
BEGIN
  SELECT * INTO v_aposta FROM apostas_unificada WHERE id = p_aposta_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'APOSTA_NAO_ENCONTRADA');
  END IF;

  v_workspace_id := v_aposta.workspace_id;
  v_user_id := COALESCE(auth.uid(), v_aposta.user_id);
  v_fonte_saldo := COALESCE(v_aposta.fonte_saldo, 'REAL');

  v_has_real_freebet := FALSE;
  IF v_fonte_saldo = 'FREEBET' THEN
    SELECT EXISTS(
      SELECT 1 FROM financial_events
      WHERE bookmaker_id = COALESCE(p_novo_bookmaker_id, v_aposta.bookmaker_id)
        AND tipo_evento IN ('FREEBET_CREDIT', 'FREEBET_STAKE')
        AND tipo_uso = 'FREEBET'
      LIMIT 1
    ) INTO v_has_real_freebet;
  END IF;
  v_tipo_uso := CASE WHEN v_fonte_saldo = 'FREEBET' AND v_has_real_freebet THEN 'FREEBET' ELSE 'NORMAL' END;

  v_is_multipla := (v_aposta.odd_final IS NOT NULL);
  v_bookmaker_anterior_id := v_aposta.bookmaker_id;
  v_stake_anterior := COALESCE(v_aposta.stake, 0);
  v_odd_anterior := COALESCE(v_aposta.odd, v_aposta.odd_final, 1);
  v_moeda_anterior := COALESCE(v_aposta.moeda_operacao, 'BRL');
  v_bookmaker_novo_id := COALESCE(p_novo_bookmaker_id, v_bookmaker_anterior_id);
  v_stake_novo := COALESCE(p_novo_stake, v_stake_anterior);
  v_odd_novo := COALESCE(p_nova_odd, v_odd_anterior);
  v_moeda_nova := COALESCE(p_nova_moeda, v_moeda_anterior);

  v_old_stake_real := COALESCE(v_aposta.stake_real, v_stake_anterior);
  v_old_stake_freebet := COALESCE(v_aposta.stake_freebet, 0);

  IF p_novo_stake IS NOT NULL AND p_novo_stake != v_stake_anterior AND v_stake_anterior > 0 THEN
    v_new_stake_real := ROUND((v_old_stake_real / v_stake_anterior) * p_novo_stake, 2);
    v_new_stake_freebet := ROUND(p_novo_stake - v_new_stake_real, 2);
    IF v_new_stake_freebet < 0 THEN
      v_new_stake_real := p_novo_stake;
      v_new_stake_freebet := 0;
    END IF;
  ELSE
    v_new_stake_real := v_old_stake_real;
    v_new_stake_freebet := v_old_stake_freebet;
  END IF;

  -- Freebet inventory reconciliation (mantido do v4 anterior)
  IF v_old_stake_freebet > 0
     AND (p_novo_bookmaker_id IS NOT NULL AND p_novo_bookmaker_id != v_bookmaker_anterior_id
          OR v_new_stake_freebet < v_old_stake_freebet) THEN
    UPDATE freebets_recebidas
    SET utilizada = false, data_utilizacao = NULL, aposta_id = NULL
    WHERE aposta_id = p_aposta_id AND utilizada = true;
  END IF;

  v_idempotency_prefix := 'edit_v5_' || p_aposta_id::TEXT || '_' || EXTRACT(EPOCH FROM clock_timestamp())::BIGINT::TEXT;

  -- ================================================================
  -- 1) REVERSAL 1:1 de todos os eventos vivos da aposta
  -- ================================================================
  FOR v_old_event IN
    SELECT fe.id, fe.bookmaker_id, fe.tipo_evento, fe.tipo_uso, fe.valor, fe.moeda
    FROM financial_events fe
    WHERE fe.aposta_id = p_aposta_id
      AND fe.tipo_evento NOT IN ('REVERSAL')
      AND NOT EXISTS (
        SELECT 1 FROM financial_events r
        WHERE r.reversed_event_id = fe.id
      )
  LOOP
    INSERT INTO financial_events (
      bookmaker_id, aposta_id, workspace_id, tipo_evento, tipo_uso, origem,
      valor, moeda, idempotency_key, reversed_event_id, descricao, processed_at, created_by
    ) VALUES (
      v_old_event.bookmaker_id, p_aposta_id, v_workspace_id, 'REVERSAL', v_old_event.tipo_uso, 'REVERSAL',
      -v_old_event.valor, v_old_event.moeda,
      v_idempotency_prefix || '_rev_' || v_old_event.id,
      v_old_event.id, 'Reversão para edição de aposta (v5)', NOW(), v_user_id
    ) ON CONFLICT (idempotency_key) DO NOTHING;
    v_events_reverted := v_events_reverted + 1;
  END LOOP;

  -- ================================================================
  -- 2) Calcular novo lucro + payout
  -- ================================================================
  v_resultado_atual := v_aposta.resultado;
  v_resultado_novo := COALESCE(p_novo_resultado, v_resultado_atual);

  IF p_lucro_prejuizo IS NOT NULL THEN
    v_lucro_novo := p_lucro_prejuizo;
    v_payout_novo := v_stake_novo + p_lucro_prejuizo;
    v_refund_novo := 0;
  ELSE
    CASE v_resultado_novo
      WHEN 'GREEN' THEN
        v_lucro_novo := (v_stake_novo * v_odd_novo) - v_stake_novo;
        v_payout_novo := v_stake_novo * v_odd_novo;
        v_refund_novo := 0;
      WHEN 'RED' THEN
        v_lucro_novo := -v_stake_novo;
        v_payout_novo := 0;
        v_refund_novo := 0;
      WHEN 'VOID', 'CANCELADA' THEN
        v_lucro_novo := 0;
        v_payout_novo := 0;
        v_refund_novo := v_stake_novo;
      WHEN 'MEIO_GREEN' THEN
        v_lucro_novo := ((v_stake_novo * v_odd_novo) - v_stake_novo) / 2;
        v_payout_novo := v_stake_novo * (1 + (v_odd_novo - 1) / 2);
        v_refund_novo := 0;
      WHEN 'MEIO_RED' THEN
        v_lucro_novo := -v_stake_novo / 2;
        v_payout_novo := 0;
        v_refund_novo := v_stake_novo / 2;
      ELSE
        v_lucro_novo := 0;
        v_payout_novo := 0;
        v_refund_novo := 0;
    END CASE;
  END IF;

  -- Freebet: lucro vai como NORMAL (sem stake debit); stake nunca é debitada se freebet puro
  -- ================================================================
  -- 3) Novo STAKE (se for fonte REAL e stake>0)
  -- ================================================================
  IF v_stake_novo > 0 AND v_new_stake_real > 0 THEN
    INSERT INTO financial_events (
      bookmaker_id, aposta_id, workspace_id, tipo_evento, tipo_uso, origem,
      valor, moeda, idempotency_key, descricao, processed_at, created_by
    ) VALUES (
      v_bookmaker_novo_id, p_aposta_id, v_workspace_id, 'STAKE', 'NORMAL', 'STAKE',
      -v_new_stake_real, v_moeda_nova,
      v_idempotency_prefix || '_stake_new',
      'Stake re-lançado por edição (v5)', NOW(), v_user_id
    ) ON CONFLICT (idempotency_key) DO NOTHING;
    v_events_created := v_events_created + 1;
  END IF;

  IF v_new_stake_freebet > 0 THEN
    INSERT INTO financial_events (
      bookmaker_id, aposta_id, workspace_id, tipo_evento, tipo_uso, origem,
      valor, moeda, idempotency_key, descricao, processed_at, created_by
    ) VALUES (
      v_bookmaker_novo_id, p_aposta_id, v_workspace_id, 'FREEBET_STAKE', 'FREEBET', 'FREEBET',
      -v_new_stake_freebet, v_moeda_nova,
      v_idempotency_prefix || '_stake_fb_new',
      'Freebet stake re-lançado por edição (v5)', NOW(), v_user_id
    ) ON CONFLICT (idempotency_key) DO NOTHING;
    v_events_created := v_events_created + 1;
  END IF;

  -- ================================================================
  -- 4) Novo PAYOUT / VOID_REFUND conforme resultado
  -- ================================================================
  IF v_payout_novo > 0 THEN
    INSERT INTO financial_events (
      bookmaker_id, aposta_id, workspace_id, tipo_evento, tipo_uso, origem,
      valor, moeda, idempotency_key, descricao, processed_at, created_by
    ) VALUES (
      v_bookmaker_novo_id, p_aposta_id, v_workspace_id,
      CASE WHEN v_fonte_saldo = 'FREEBET' THEN 'FREEBET_PAYOUT' ELSE 'PAYOUT' END,
      CASE WHEN v_fonte_saldo = 'FREEBET' THEN 'FREEBET' ELSE 'NORMAL' END,
      'LUCRO',
      -- Em freebet puro, o payout é só o lucro (não devolve stake)
      CASE WHEN v_fonte_saldo = 'FREEBET' AND v_new_stake_real = 0
           THEN GREATEST(v_lucro_novo, 0)
           ELSE v_payout_novo
      END,
      v_moeda_nova,
      v_idempotency_prefix || '_pay_new',
      format('Payout re-lançado por edição (%s) v5', v_resultado_novo),
      NOW(), v_user_id
    ) ON CONFLICT (idempotency_key) DO NOTHING;
    v_events_created := v_events_created + 1;
  END IF;

  IF v_refund_novo > 0 THEN
    INSERT INTO financial_events (
      bookmaker_id, aposta_id, workspace_id, tipo_evento, tipo_uso, origem,
      valor, moeda, idempotency_key, descricao, processed_at, created_by
    ) VALUES (
      v_bookmaker_novo_id, p_aposta_id, v_workspace_id, 'VOID_REFUND',
      CASE WHEN v_fonte_saldo = 'FREEBET' AND v_new_stake_real = 0 THEN 'FREEBET' ELSE 'NORMAL' END,
      'ESTORNO', v_refund_novo, v_moeda_nova,
      v_idempotency_prefix || '_void_new',
      format('Reembolso re-lançado por edição (%s) v5', v_resultado_novo),
      NOW(), v_user_id
    ) ON CONFLICT (idempotency_key) DO NOTHING;
    v_events_created := v_events_created + 1;
  END IF;

  -- ================================================================
  -- 5) Atualizar aposta + snapshots
  -- ================================================================
  UPDATE apostas_unificada
  SET
    bookmaker_id = v_bookmaker_novo_id,
    stake = v_stake_novo,
    stake_real = v_new_stake_real,
    stake_freebet = v_new_stake_freebet,
    stake_total = v_stake_novo,
    odd = CASE WHEN NOT v_is_multipla THEN v_odd_novo ELSE odd END,
    odd_final = CASE WHEN v_is_multipla THEN v_odd_novo ELSE odd_final END,
    moeda_operacao = v_moeda_nova,
    resultado = v_resultado_novo,
    lucro_prejuizo = v_lucro_novo,
    lucro_realizado = v_lucro_novo,
    valor_retorno = CASE
      WHEN v_fonte_saldo = 'FREEBET' AND v_new_stake_real = 0 THEN GREATEST(v_lucro_novo, 0)
      ELSE v_stake_novo + v_lucro_novo
    END,
    roi_real = CASE WHEN v_stake_novo > 0 THEN (v_lucro_novo / v_stake_novo) * 100 ELSE 0 END,
    roi_realizado = CASE WHEN v_stake_novo > 0 THEN (v_lucro_novo / v_stake_novo) * 100 ELSE 0 END,
    status = CASE WHEN v_resultado_novo IS NULL OR v_resultado_novo = 'PENDENTE' THEN 'PENDENTE' ELSE 'LIQUIDADA' END,
    updated_at = NOW()
  WHERE id = p_aposta_id;

  -- Sincronizar saldos das bookmakers afetadas
  PERFORM public.sync_bookmaker_balance_from_ledger(v_bookmaker_novo_id);
  IF v_bookmaker_anterior_id IS DISTINCT FROM v_bookmaker_novo_id THEN
    PERFORM public.sync_bookmaker_balance_from_ledger(v_bookmaker_anterior_id);
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'message', 'Aposta editada com REVERSAL + relançamento (v5)',
    'events_reverted', v_events_reverted,
    'events_created', v_events_created,
    'lucro_novo', v_lucro_novo,
    'payout_novo', v_payout_novo
  );
END;
$function$;
