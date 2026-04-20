-- Phase 4: Multi-entry guard for atualizar_aposta_liquidada_atomica_v2
-- When the bet has apostas_pernas (multi-bookmaker), this function cannot safely
-- edit stake/odd/bookmaker on the parent (they live in the consolidation currency).
-- For result-only changes, delegate to reliquidar_aposta_v6 which iterates per perna.
-- For stake/odd/bookmaker changes, return an instructive error suggesting revert+recreate.

CREATE OR REPLACE FUNCTION public.atualizar_aposta_liquidada_atomica_v2(
  p_aposta_id uuid,
  p_novo_bookmaker_id uuid DEFAULT NULL::uuid,
  p_novo_stake numeric DEFAULT NULL::numeric,
  p_nova_odd numeric DEFAULT NULL::numeric,
  p_novo_resultado text DEFAULT NULL::text,
  p_nova_moeda text DEFAULT NULL::text,
  p_lucro_prejuizo numeric DEFAULT NULL::numeric
)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_aposta RECORD;
  v_workspace_id UUID;
  v_user_id UUID;
  v_resultado_atual TEXT;
  v_bookmaker_anterior_id UUID;
  v_stake_anterior NUMERIC;
  v_odd_anterior NUMERIC;
  v_moeda_anterior TEXT;
  v_lucro_anterior NUMERIC;
  v_bookmaker_novo_id UUID;
  v_stake_novo NUMERIC;
  v_odd_novo NUMERIC;
  v_moeda_nova TEXT;
  v_resultado_novo TEXT;
  v_lucro_novo NUMERIC;
  v_fonte_saldo TEXT;
  v_tipo_uso TEXT;
  v_idempotency_prefix TEXT;
  v_impacto_anterior NUMERIC;
  v_impacto_novo NUMERIC;
  v_diferenca NUMERIC;
  v_is_multipla BOOLEAN;
  v_stake_diff NUMERIC;
  v_net_old NUMERIC;
  v_old_stake_real NUMERIC;
  v_old_stake_freebet NUMERIC;
  v_new_stake_real NUMERIC;
  v_new_stake_freebet NUMERIC;
  v_has_pernas BOOLEAN;
  v_reliq_result JSONB;
BEGIN
  SELECT * INTO v_aposta
  FROM apostas_unificada
  WHERE id = p_aposta_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'APOSTA_NAO_ENCONTRADA');
  END IF;

  v_workspace_id := v_aposta.workspace_id;
  v_user_id := v_aposta.user_id;

  -- ============================================================
  -- MULTI-ENTRY GUARD
  -- Detect bets with apostas_pernas (multi-bookmaker simple bets)
  -- ============================================================
  SELECT EXISTS(SELECT 1 FROM apostas_pernas WHERE aposta_id = p_aposta_id)
    INTO v_has_pernas;

  IF v_has_pernas THEN
    -- Determine if this is a stake/odd/bookmaker change vs result-only change
    DECLARE
      v_struct_change BOOLEAN := FALSE;
    BEGIN
      IF p_novo_bookmaker_id IS NOT NULL AND p_novo_bookmaker_id != COALESCE(v_aposta.bookmaker_id, p_novo_bookmaker_id) THEN
        v_struct_change := TRUE;
      END IF;
      IF p_novo_stake IS NOT NULL AND p_novo_stake != COALESCE(v_aposta.stake, p_novo_stake) THEN
        v_struct_change := TRUE;
      END IF;
      IF p_nova_odd IS NOT NULL AND p_nova_odd != COALESCE(v_aposta.odd, v_aposta.odd_final, p_nova_odd) THEN
        v_struct_change := TRUE;
      END IF;
      IF p_nova_moeda IS NOT NULL AND p_nova_moeda != COALESCE(v_aposta.moeda_operacao, p_nova_moeda) THEN
        v_struct_change := TRUE;
      END IF;

      IF v_struct_change THEN
        RETURN jsonb_build_object(
          'success', false,
          'error', 'MULTI_ENTRY_STRUCT_EDIT_NOT_SUPPORTED',
          'message', 'Esta aposta possui múltiplas entradas (multi-bookmaker). Para alterar stake, odd, bookmaker ou moeda, exclua e recadastre a aposta.',
          'has_pernas', true
        );
      END IF;

      -- Result-only change: delegate to reliquidar_aposta_v6 (handles per-perna AJUSTE)
      IF p_novo_resultado IS NOT NULL AND p_novo_resultado != COALESCE(v_aposta.resultado, '') THEN
        SELECT reliquidar_aposta_v6(p_aposta_id, p_novo_resultado) INTO v_reliq_result;
        RETURN v_reliq_result;
      END IF;

      RETURN jsonb_build_object('success', true, 'message', 'Nenhuma mudança detectada (multi-entry)');
    END;
  END IF;

  -- ============================================================
  -- LEGACY single-entry path (unchanged)
  -- ============================================================
  v_fonte_saldo := COALESCE(v_aposta.fonte_saldo, 'REAL');
  v_tipo_uso := CASE WHEN v_fonte_saldo = 'FREEBET' THEN 'FREEBET' ELSE 'NORMAL' END;
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

  IF v_aposta.status != 'LIQUIDADA' THEN
    v_idempotency_prefix := 'edit_pend_' || p_aposta_id::TEXT || '_' || EXTRACT(EPOCH FROM NOW())::TEXT;

    IF p_novo_bookmaker_id IS NOT NULL AND p_novo_bookmaker_id != v_bookmaker_anterior_id THEN
      IF v_stake_anterior > 0 THEN
        INSERT INTO financial_events (bookmaker_id, aposta_id, workspace_id, tipo_evento, tipo_uso, origem, valor, moeda, idempotency_key, descricao, processed_at, created_by)
        VALUES (v_bookmaker_anterior_id, p_aposta_id, v_workspace_id, 'REVERSAL', v_tipo_uso, 'REVERSAL', v_stake_anterior, v_moeda_anterior, v_idempotency_prefix || '_rev_old_bk', 'Reversão stake por mudança de bookmaker na edição', NOW(), v_user_id);
      END IF;
      INSERT INTO financial_events (bookmaker_id, aposta_id, workspace_id, tipo_evento, tipo_uso, origem, valor, moeda, idempotency_key, descricao, processed_at, created_by)
      VALUES (v_bookmaker_novo_id, p_aposta_id, v_workspace_id, 'STAKE', v_tipo_uso, 'STAKE', -v_stake_novo, v_moeda_nova, v_idempotency_prefix || '_stake_new_bk', 'Stake debitada em novo bookmaker por edição', NOW(), v_user_id);
    ELSIF p_novo_stake IS NOT NULL AND p_novo_stake != v_stake_anterior THEN
      v_stake_diff := v_stake_anterior - v_stake_novo;
      IF v_stake_diff != 0 THEN
        INSERT INTO financial_events (bookmaker_id, aposta_id, workspace_id, tipo_evento, tipo_uso, origem, valor, moeda, idempotency_key, descricao, processed_at, created_by)
        VALUES (v_bookmaker_anterior_id, p_aposta_id, v_workspace_id, 'AJUSTE', v_tipo_uso, 'AJUSTE', v_stake_diff, v_moeda_anterior, v_idempotency_prefix || '_stake_adj', 'Ajuste de stake por edição: ' || v_stake_anterior || ' → ' || v_stake_novo, NOW(), v_user_id);
      END IF;
    END IF;

    UPDATE apostas_unificada
    SET bookmaker_id = v_bookmaker_novo_id,
        stake = v_stake_novo,
        stake_real = v_new_stake_real,
        stake_freebet = v_new_stake_freebet,
        stake_total = v_stake_novo,
        odd = CASE WHEN NOT v_is_multipla THEN COALESCE(p_nova_odd, odd) ELSE odd END,
        odd_final = CASE WHEN v_is_multipla THEN COALESCE(p_nova_odd, odd_final) ELSE odd_final END,
        moeda_operacao = v_moeda_nova,
        resultado = COALESCE(p_novo_resultado, resultado),
        updated_at = NOW()
    WHERE id = p_aposta_id;

    RETURN jsonb_build_object('success', true, 'message', 'Aposta PENDENTE atualizada com ajuste financeiro');
  END IF;

  v_resultado_atual := v_aposta.resultado;
  v_lucro_anterior := COALESCE(v_aposta.lucro_prejuizo, 0);
  v_resultado_novo := COALESCE(p_novo_resultado, v_resultado_atual);

  IF v_bookmaker_novo_id = v_bookmaker_anterior_id
     AND v_stake_novo = v_stake_anterior
     AND v_odd_novo = v_odd_anterior
     AND v_resultado_novo = v_resultado_atual
     AND p_lucro_prejuizo IS NULL THEN
    RETURN jsonb_build_object('success', true, 'message', 'Nenhuma mudança detectada');
  END IF;

  v_idempotency_prefix := 'edit_v2_' || p_aposta_id::TEXT || '_' || EXTRACT(EPOCH FROM NOW())::TEXT;

  CASE v_resultado_atual
    WHEN 'GREEN' THEN v_impacto_anterior := v_stake_anterior * v_odd_anterior;
    WHEN 'RED' THEN v_impacto_anterior := 0;
    WHEN 'VOID' THEN v_impacto_anterior := v_stake_anterior;
    WHEN 'MEIO_GREEN' THEN v_impacto_anterior := v_stake_anterior * (1 + (v_odd_anterior - 1) / 2);
    WHEN 'MEIO_RED' THEN v_impacto_anterior := v_stake_anterior / 2;
    ELSE v_impacto_anterior := 0;
  END CASE;

  IF v_is_multipla AND v_lucro_anterior IS NOT NULL THEN
    v_impacto_anterior := v_stake_anterior + v_lucro_anterior;
  END IF;

  IF p_lucro_prejuizo IS NOT NULL THEN
    v_lucro_novo := p_lucro_prejuizo;
    v_impacto_novo := v_stake_novo + p_lucro_prejuizo;
  ELSE
    CASE v_resultado_novo
      WHEN 'GREEN' THEN
        v_lucro_novo := (v_stake_novo * v_odd_novo) - v_stake_novo;
        v_impacto_novo := v_stake_novo * v_odd_novo;
      WHEN 'RED' THEN
        v_lucro_novo := -v_stake_novo;
        v_impacto_novo := 0;
      WHEN 'VOID' THEN
        v_lucro_novo := 0;
        v_impacto_novo := v_stake_novo;
      WHEN 'MEIO_GREEN' THEN
        v_lucro_novo := ((v_stake_novo * v_odd_novo) - v_stake_novo) / 2;
        v_impacto_novo := v_stake_novo * (1 + (v_odd_novo - 1) / 2);
      WHEN 'MEIO_RED' THEN
        v_lucro_novo := -v_stake_novo / 2;
        v_impacto_novo := v_stake_novo / 2;
      ELSE
        v_lucro_novo := 0;
        v_impacto_novo := 0;
    END CASE;
  END IF;

  v_diferenca := v_impacto_novo - v_impacto_anterior;
  IF v_stake_novo != v_stake_anterior THEN
    v_diferenca := v_diferenca + (v_stake_anterior - v_stake_novo);
  END IF;

  IF v_bookmaker_novo_id != v_bookmaker_anterior_id THEN
    SELECT COALESCE(SUM(valor), 0) INTO v_net_old
    FROM financial_events
    WHERE aposta_id = p_aposta_id AND bookmaker_id = v_bookmaker_anterior_id;

    IF v_net_old != 0 THEN
      INSERT INTO financial_events (bookmaker_id, aposta_id, workspace_id, tipo_evento, tipo_uso, origem, valor, moeda, idempotency_key, descricao, processed_at, created_by)
      VALUES (v_bookmaker_anterior_id, p_aposta_id, v_workspace_id, 'REVERSAL', v_tipo_uso, 'REVERSAL', -v_net_old, v_moeda_anterior, v_idempotency_prefix || '_rev_old', 'Reversão total por mudança de bookmaker na edição', NOW(), v_user_id);
    END IF;

    INSERT INTO financial_events (bookmaker_id, aposta_id, workspace_id, tipo_evento, tipo_uso, origem, valor, moeda, idempotency_key, descricao, processed_at, created_by)
    VALUES (v_bookmaker_novo_id, p_aposta_id, v_workspace_id, 'STAKE', v_tipo_uso, 'STAKE', -v_stake_novo, v_moeda_nova, v_idempotency_prefix || '_stake_new', 'Stake na nova bookmaker por edição', NOW(), v_user_id);

    IF v_impacto_novo > 0 THEN
      INSERT INTO financial_events (bookmaker_id, aposta_id, workspace_id, tipo_evento, tipo_uso, origem, valor, moeda, idempotency_key, descricao, processed_at, created_by)
      VALUES (v_bookmaker_novo_id, p_aposta_id, v_workspace_id, 'PAYOUT', v_tipo_uso, 'PAYOUT', v_impacto_novo, v_moeda_nova, v_idempotency_prefix || '_pay_new', 'Payout na nova bookmaker por edição', NOW(), v_user_id);
    END IF;
  ELSE
    IF v_diferenca != 0 THEN
      INSERT INTO financial_events (bookmaker_id, aposta_id, workspace_id, tipo_evento, tipo_uso, origem, valor, moeda, idempotency_key, descricao, metadata, processed_at, created_by)
      VALUES (v_bookmaker_novo_id, p_aposta_id, v_workspace_id, 'AJUSTE', v_tipo_uso, 'AJUSTE', v_diferenca, v_moeda_nova, v_idempotency_prefix || '_adj', 'Ajuste por edição de aposta liquidada',
        jsonb_build_object('resultado_anterior', v_resultado_atual, 'resultado_novo', v_resultado_novo, 'stake_anterior', v_stake_anterior, 'stake_novo', v_stake_novo, 'odd_anterior', v_odd_anterior, 'odd_novo', v_odd_novo, 'pl_fornecido', p_lucro_prejuizo),
        NOW(), v_user_id);
    END IF;
  END IF;

  UPDATE apostas_unificada
  SET bookmaker_id = v_bookmaker_novo_id,
      stake = v_stake_novo,
      stake_real = v_new_stake_real,
      stake_freebet = v_new_stake_freebet,
      stake_total = v_stake_novo,
      odd = CASE WHEN NOT v_is_multipla THEN v_odd_novo ELSE odd END,
      odd_final = CASE WHEN v_is_multipla THEN v_odd_novo ELSE odd_final END,
      moeda_operacao = v_moeda_nova,
      resultado = v_resultado_novo,
      lucro_prejuizo = v_lucro_novo,
      valor_retorno = CASE WHEN v_fonte_saldo = 'FREEBET' THEN GREATEST(v_lucro_novo, 0) ELSE v_stake_novo + v_lucro_novo END,
      roi_real = CASE WHEN v_stake_novo > 0 THEN (v_lucro_novo / v_stake_novo) * 100 ELSE 0 END,
      status = 'LIQUIDADA',
      updated_at = NOW()
  WHERE id = p_aposta_id;

  RETURN jsonb_build_object('success', true, 'message', 'Aposta atualizada com sucesso', 'diferenca_aplicada', v_diferenca, 'lucro_novo', v_lucro_novo, 'impacto_anterior', v_impacto_anterior, 'impacto_novo', v_impacto_novo, 'pl_fornecido', p_lucro_prejuizo IS NOT NULL);

EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$function$;