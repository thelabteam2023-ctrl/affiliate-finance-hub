
-- ============================================================================
-- FIX 1: atualizar_aposta_liquidada_atomica_v2
-- Problema: UPDATE em stake sem stake_real causa erro no trigger normalize
-- ============================================================================

DROP FUNCTION IF EXISTS public.atualizar_aposta_liquidada_atomica_v2(UUID, UUID, NUMERIC, NUMERIC, TEXT, TEXT, NUMERIC);

CREATE OR REPLACE FUNCTION public.atualizar_aposta_liquidada_atomica_v2(
  p_aposta_id UUID,
  p_novo_bookmaker_id UUID DEFAULT NULL,
  p_novo_stake NUMERIC DEFAULT NULL,
  p_nova_odd NUMERIC DEFAULT NULL,
  p_novo_resultado TEXT DEFAULT NULL,
  p_nova_moeda TEXT DEFAULT NULL,
  p_lucro_prejuizo NUMERIC DEFAULT NULL
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
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
  -- NEW: stake split tracking
  v_old_stake_real NUMERIC;
  v_old_stake_freebet NUMERIC;
  v_new_stake_real NUMERIC;
  v_new_stake_freebet NUMERIC;
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

  -- Calculate new stake_real/stake_freebet proportionally
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

  -- ================================================================
  -- PENDENTE: handle stake/bookmaker changes with financial events
  -- ================================================================
  IF v_aposta.status != 'LIQUIDADA' THEN
    v_idempotency_prefix := 'edit_pend_' || p_aposta_id::TEXT || '_' || EXTRACT(EPOCH FROM NOW())::TEXT;
    
    IF p_novo_bookmaker_id IS NOT NULL AND p_novo_bookmaker_id != v_bookmaker_anterior_id THEN
      IF v_stake_anterior > 0 THEN
        INSERT INTO financial_events (
          bookmaker_id, aposta_id, workspace_id, tipo_evento, tipo_uso, origem,
          valor, moeda, idempotency_key, descricao, processed_at, created_by
        ) VALUES (
          v_bookmaker_anterior_id, p_aposta_id, v_workspace_id,
          'REVERSAL', v_tipo_uso, 'REVERSAL',
          v_stake_anterior, v_moeda_anterior,
          v_idempotency_prefix || '_rev_old_bk',
          'Reversão stake por mudança de bookmaker na edição',
          NOW(), v_user_id
        );
      END IF;
      
      INSERT INTO financial_events (
        bookmaker_id, aposta_id, workspace_id, tipo_evento, tipo_uso, origem,
        valor, moeda, idempotency_key, descricao, processed_at, created_by
      ) VALUES (
        v_bookmaker_novo_id, p_aposta_id, v_workspace_id,
        'STAKE', v_tipo_uso, 'STAKE',
        -v_stake_novo, v_moeda_nova,
        v_idempotency_prefix || '_stake_new_bk',
        'Stake debitada em novo bookmaker por edição',
        NOW(), v_user_id
      );
      
    ELSIF p_novo_stake IS NOT NULL AND p_novo_stake != v_stake_anterior THEN
      v_stake_diff := v_stake_anterior - v_stake_novo;
      
      IF v_stake_diff != 0 THEN
        INSERT INTO financial_events (
          bookmaker_id, aposta_id, workspace_id, tipo_evento, tipo_uso, origem,
          valor, moeda, idempotency_key, descricao, processed_at, created_by
        ) VALUES (
          v_bookmaker_anterior_id, p_aposta_id, v_workspace_id,
          'AJUSTE', v_tipo_uso, 'AJUSTE',
          v_stake_diff, v_moeda_anterior,
          v_idempotency_prefix || '_stake_adj',
          'Ajuste de stake por edição: ' || v_stake_anterior || ' → ' || v_stake_novo,
          NOW(), v_user_id
        );
      END IF;
    END IF;
    
    UPDATE apostas_unificada
    SET 
      bookmaker_id = v_bookmaker_novo_id,
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

  -- ================================================================
  -- LIQUIDADA: full impact calculation
  -- ================================================================
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
      INSERT INTO financial_events (
        bookmaker_id, aposta_id, workspace_id, tipo_evento, tipo_uso, origem,
        valor, moeda, idempotency_key, descricao, processed_at, created_by
      ) VALUES (
        v_bookmaker_anterior_id, p_aposta_id, v_workspace_id,
        'REVERSAL', v_tipo_uso, 'REVERSAL',
        -v_net_old, v_moeda_anterior,
        v_idempotency_prefix || '_rev_old',
        'Reversão total por mudança de bookmaker na edição',
        NOW(), v_user_id
      );
    END IF;
    
    INSERT INTO financial_events (
      bookmaker_id, aposta_id, workspace_id, tipo_evento, tipo_uso, origem,
      valor, moeda, idempotency_key, descricao, processed_at, created_by
    ) VALUES (
      v_bookmaker_novo_id, p_aposta_id, v_workspace_id,
      'STAKE', v_tipo_uso, 'STAKE',
      -v_stake_novo, v_moeda_nova,
      v_idempotency_prefix || '_stake_new',
      'Stake na nova bookmaker por edição',
      NOW(), v_user_id
    );
    
    IF v_impacto_novo > 0 THEN
      INSERT INTO financial_events (
        bookmaker_id, aposta_id, workspace_id, tipo_evento, tipo_uso, origem,
        valor, moeda, idempotency_key, descricao, processed_at, created_by
      ) VALUES (
        v_bookmaker_novo_id, p_aposta_id, v_workspace_id,
        'PAYOUT', v_tipo_uso, 'PAYOUT',
        v_impacto_novo, v_moeda_nova,
        v_idempotency_prefix || '_pay_new',
        'Payout na nova bookmaker por edição',
        NOW(), v_user_id
      );
    END IF;
  ELSE
    IF v_diferenca != 0 THEN
      INSERT INTO financial_events (
        bookmaker_id, aposta_id, workspace_id, tipo_evento, tipo_uso, origem,
        valor, moeda, idempotency_key, descricao, metadata, processed_at, created_by
      ) VALUES (
        v_bookmaker_novo_id, p_aposta_id, v_workspace_id,
        'AJUSTE', v_tipo_uso, 'AJUSTE',
        v_diferenca, v_moeda_nova,
        v_idempotency_prefix || '_adj',
        'Ajuste por edição de aposta liquidada',
        jsonb_build_object(
          'resultado_anterior', v_resultado_atual,
          'resultado_novo', v_resultado_novo,
          'stake_anterior', v_stake_anterior,
          'stake_novo', v_stake_novo,
          'odd_anterior', v_odd_anterior,
          'odd_novo', v_odd_novo,
          'pl_fornecido', p_lucro_prejuizo
        ),
        NOW(), v_user_id
      );
    END IF;
  END IF;

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
    valor_retorno = CASE 
      WHEN v_fonte_saldo = 'FREEBET' THEN GREATEST(v_lucro_novo, 0)
      ELSE v_stake_novo + v_lucro_novo
    END,
    roi_real = CASE WHEN v_stake_novo > 0 THEN (v_lucro_novo / v_stake_novo) * 100 ELSE 0 END,
    status = 'LIQUIDADA',
    updated_at = NOW()
  WHERE id = p_aposta_id;

  RETURN jsonb_build_object(
    'success', true,
    'message', 'Aposta atualizada com sucesso',
    'diferenca_aplicada', v_diferenca,
    'lucro_novo', v_lucro_novo,
    'impacto_anterior', v_impacto_anterior,
    'impacto_novo', v_impacto_novo,
    'pl_fornecido', p_lucro_prejuizo IS NOT NULL
  );

EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$;


-- ============================================================================
-- FIX 2: editar_aposta_liquidada_v4
-- Mesmo problema: UPDATE em stake sem stake_real
-- ============================================================================

CREATE OR REPLACE FUNCTION public.editar_aposta_liquidada_v4(
  p_aposta_id UUID,
  p_novo_bookmaker_id UUID DEFAULT NULL,
  p_novo_stake NUMERIC DEFAULT NULL,
  p_nova_odd NUMERIC DEFAULT NULL,
  p_novo_resultado TEXT DEFAULT NULL,
  p_lucro_prejuizo NUMERIC DEFAULT NULL,
  p_nova_moeda TEXT DEFAULT NULL
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
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
  v_lucro_anterior NUMERIC;
  v_lucro_novo NUMERIC;
  v_idempotency_prefix TEXT;
  v_impacto_anterior NUMERIC;
  v_impacto_novo NUMERIC;
  v_diferenca NUMERIC;
  v_is_multipla BOOLEAN;
  v_stake_diff NUMERIC;
  v_net_old NUMERIC;
  v_has_real_freebet BOOLEAN;
  -- NEW
  v_old_stake_real NUMERIC;
  v_old_stake_freebet NUMERIC;
  v_new_stake_real NUMERIC;
  v_new_stake_freebet NUMERIC;
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

  -- Calculate new stake split proportionally
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

  -- ================================================================
  -- PENDENTE
  -- ================================================================
  IF v_aposta.status != 'LIQUIDADA' THEN
    v_idempotency_prefix := 'edit_pend_' || p_aposta_id::TEXT || '_' || EXTRACT(EPOCH FROM NOW())::TEXT;
    
    IF p_novo_bookmaker_id IS NOT NULL AND p_novo_bookmaker_id != v_bookmaker_anterior_id THEN
      IF v_stake_anterior > 0 THEN
        INSERT INTO financial_events (
          bookmaker_id, aposta_id, workspace_id, tipo_evento, tipo_uso, origem,
          valor, moeda, idempotency_key, descricao, processed_at, created_by
        ) VALUES (
          v_bookmaker_anterior_id, p_aposta_id, v_workspace_id,
          'REVERSAL', v_tipo_uso, 'REVERSAL',
          v_stake_anterior, v_moeda_anterior,
          v_idempotency_prefix || '_rev_old_bk',
          'Reversão stake por mudança de bookmaker na edição',
          NOW(), v_user_id
        );
      END IF;
      
      INSERT INTO financial_events (
        bookmaker_id, aposta_id, workspace_id, tipo_evento, tipo_uso, origem,
        valor, moeda, idempotency_key, descricao, processed_at, created_by
      ) VALUES (
        v_bookmaker_novo_id, p_aposta_id, v_workspace_id,
        'STAKE', v_tipo_uso, 'STAKE',
        -v_stake_novo, v_moeda_nova,
        v_idempotency_prefix || '_stake_new_bk',
        'Stake debitada em novo bookmaker por edição',
        NOW(), v_user_id
      );
      
    ELSIF p_novo_stake IS NOT NULL AND p_novo_stake != v_stake_anterior THEN
      v_stake_diff := v_stake_anterior - v_stake_novo;
      
      IF v_stake_diff != 0 THEN
        INSERT INTO financial_events (
          bookmaker_id, aposta_id, workspace_id, tipo_evento, tipo_uso, origem,
          valor, moeda, idempotency_key, descricao, processed_at, created_by
        ) VALUES (
          v_bookmaker_anterior_id, p_aposta_id, v_workspace_id,
          'AJUSTE', v_tipo_uso, 'AJUSTE',
          v_stake_diff, v_moeda_anterior,
          v_idempotency_prefix || '_stake_adj',
          'Ajuste de stake por edição: ' || v_stake_anterior || ' → ' || v_stake_novo,
          NOW(), v_user_id
        );
      END IF;
    END IF;
    
    UPDATE apostas_unificada
    SET 
      bookmaker_id = v_bookmaker_novo_id,
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

  -- ================================================================
  -- LIQUIDADA
  -- ================================================================
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
      INSERT INTO financial_events (
        bookmaker_id, aposta_id, workspace_id, tipo_evento, tipo_uso, origem,
        valor, moeda, idempotency_key, descricao, processed_at, created_by
      ) VALUES (
        v_bookmaker_anterior_id, p_aposta_id, v_workspace_id,
        'REVERSAL', v_tipo_uso, 'REVERSAL',
        -v_net_old, v_moeda_anterior,
        v_idempotency_prefix || '_rev_old',
        'Reversão total por mudança de bookmaker na edição',
        NOW(), v_user_id
      );
    END IF;
    
    INSERT INTO financial_events (
      bookmaker_id, aposta_id, workspace_id, tipo_evento, tipo_uso, origem,
      valor, moeda, idempotency_key, descricao, processed_at, created_by
    ) VALUES (
      v_bookmaker_novo_id, p_aposta_id, v_workspace_id,
      'STAKE', v_tipo_uso, 'STAKE',
      -v_stake_novo, v_moeda_nova,
      v_idempotency_prefix || '_stake_new',
      'Stake na nova bookmaker por edição',
      NOW(), v_user_id
    );
    
    IF v_impacto_novo > 0 THEN
      INSERT INTO financial_events (
        bookmaker_id, aposta_id, workspace_id, tipo_evento, tipo_uso, origem,
        valor, moeda, idempotency_key, descricao, processed_at, created_by
      ) VALUES (
        v_bookmaker_novo_id, p_aposta_id, v_workspace_id,
        'PAYOUT', v_tipo_uso, 'PAYOUT',
        v_impacto_novo, v_moeda_nova,
        v_idempotency_prefix || '_pay_new',
        'Payout na nova bookmaker por edição',
        NOW(), v_user_id
      );
    END IF;
  ELSE
    IF v_diferenca != 0 THEN
      INSERT INTO financial_events (
        bookmaker_id, aposta_id, workspace_id, tipo_evento, tipo_uso, origem,
        valor, moeda, idempotency_key, descricao, metadata, processed_at, created_by
      ) VALUES (
        v_bookmaker_novo_id, p_aposta_id, v_workspace_id,
        'AJUSTE', v_tipo_uso, 'AJUSTE',
        v_diferenca, v_moeda_nova,
        v_idempotency_prefix || '_adj',
        'Ajuste por edição de aposta liquidada',
        jsonb_build_object(
          'resultado_anterior', v_resultado_atual,
          'resultado_novo', v_resultado_novo,
          'stake_anterior', v_stake_anterior,
          'stake_novo', v_stake_novo,
          'odd_anterior', v_odd_anterior,
          'odd_novo', v_odd_novo,
          'pl_fornecido', p_lucro_prejuizo
        ),
        NOW(), v_user_id
      );
    END IF;
  END IF;

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
    valor_retorno = CASE 
      WHEN v_fonte_saldo = 'FREEBET' THEN GREATEST(v_lucro_novo, 0)
      ELSE v_stake_novo + v_lucro_novo
    END,
    roi_real = CASE WHEN v_stake_novo > 0 THEN (v_lucro_novo / v_stake_novo) * 100 ELSE 0 END,
    status = 'LIQUIDADA',
    updated_at = NOW()
  WHERE id = p_aposta_id;

  RETURN jsonb_build_object(
    'success', true,
    'message', 'Aposta liquidada editada com sucesso',
    'impacto_anterior', v_impacto_anterior,
    'impacto_novo', v_impacto_novo,
    'diferenca', v_diferenca,
    'tipo_uso', v_tipo_uso
  );
END;
$$;


-- ============================================================================
-- FIX 3: editar_surebet_completa_v1
-- INSERT de novas pernas precisa incluir stake_real/stake_freebet
-- ============================================================================

CREATE OR REPLACE FUNCTION editar_surebet_completa_v1(
  p_aposta_id UUID,
  p_pernas JSONB,
  p_evento TEXT DEFAULT NULL,
  p_esporte TEXT DEFAULT NULL,
  p_mercado TEXT DEFAULT NULL,
  p_modelo TEXT DEFAULT NULL,
  p_estrategia TEXT DEFAULT NULL,
  p_contexto TEXT DEFAULT NULL,
  p_data_aposta TEXT DEFAULT NULL,
  p_stake_total NUMERIC DEFAULT NULL,
  p_stake_consolidado NUMERIC DEFAULT NULL,
  p_lucro_esperado NUMERIC DEFAULT NULL,
  p_roi_esperado NUMERIC DEFAULT NULL,
  p_lucro_prejuizo NUMERIC DEFAULT NULL,
  p_roi_real NUMERIC DEFAULT NULL,
  p_status TEXT DEFAULT NULL,
  p_resultado TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_aposta RECORD;
  v_perna RECORD;
  v_input JSONB;
  v_existing_ids UUID[];
  v_input_ids UUID[] := '{}';
  v_to_delete UUID[];
  v_perna_id UUID;
  v_workspace_id UUID;
  v_new_count INT := 0;
  v_edited_count INT := 0;
  v_deleted_count INT := 0;
  v_ordem INT := 0;
  v_elem JSONB;
  v_id_text TEXT;
  v_perna_stake NUMERIC;
  v_perna_stake_real NUMERIC;
  v_perna_stake_freebet NUMERIC;
BEGIN
  -- 1. Lock parent record
  SELECT * INTO v_aposta FROM apostas_unificada WHERE id = p_aposta_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Aposta não encontrada');
  END IF;

  v_workspace_id := v_aposta.workspace_id;

  -- 2. Get existing perna IDs
  SELECT COALESCE(array_agg(id), '{}') INTO v_existing_ids
  FROM apostas_pernas WHERE aposta_id = p_aposta_id;

  -- 3. Collect input IDs
  FOR v_elem IN SELECT * FROM jsonb_array_elements(p_pernas) LOOP
    v_id_text := v_elem->>'id';
    IF v_id_text IS NOT NULL AND v_id_text != '' THEN
      v_input_ids := array_append(v_input_ids, v_id_text::UUID);
    END IF;
  END LOOP;

  -- 4. Determine pernas to delete
  SELECT COALESCE(array_agg(existing_id), '{}') INTO v_to_delete
  FROM unnest(v_existing_ids) AS existing_id
  WHERE existing_id != ALL(v_input_ids);

  -- 5. Delete removed pernas
  IF array_length(v_to_delete, 1) > 0 THEN
    FOR v_perna_id IN SELECT unnest(v_to_delete) LOOP
      PERFORM deletar_perna_surebet_v1(v_perna_id);
      v_deleted_count := v_deleted_count + 1;
    END LOOP;
  END IF;

  -- 6. Process each input perna
  FOR v_elem IN SELECT * FROM jsonb_array_elements(p_pernas) LOOP
    v_ordem := v_ordem + 1;
    v_id_text := v_elem->>'id';

    IF v_id_text IS NOT NULL AND v_id_text != '' THEN
      v_perna_id := v_id_text::UUID;

      SELECT * INTO v_perna FROM apostas_pernas WHERE id = v_perna_id;

      IF FOUND THEN
        IF abs(v_perna.stake - (v_elem->>'stake')::NUMERIC) > 0.00001
          OR abs(v_perna.odd - (v_elem->>'odd')::NUMERIC) > 0.00001
          OR v_perna.bookmaker_id != (v_elem->>'bookmaker_id')::UUID
          OR v_perna.selecao IS DISTINCT FROM (v_elem->>'selecao')
          OR COALESCE(v_perna.selecao_livre, '') IS DISTINCT FROM COALESCE(v_elem->>'selecao_livre', '')
       THEN
         PERFORM editar_perna_surebet_atomica(
           p_perna_id := v_perna_id,
           p_new_stake := CASE WHEN abs(v_perna.stake - (v_elem->>'stake')::NUMERIC) > 0.00001 THEN (v_elem->>'stake')::NUMERIC ELSE NULL END,
           p_new_odd := CASE WHEN abs(v_perna.odd - (v_elem->>'odd')::NUMERIC) > 0.00001 THEN (v_elem->>'odd')::NUMERIC ELSE NULL END,
           p_new_bookmaker_id := CASE WHEN v_perna.bookmaker_id != (v_elem->>'bookmaker_id')::UUID THEN (v_elem->>'bookmaker_id')::UUID ELSE NULL END,
           p_new_selecao := CASE WHEN v_perna.selecao IS DISTINCT FROM (v_elem->>'selecao') THEN (v_elem->>'selecao') ELSE NULL END,
           p_new_selecao_livre := CASE WHEN COALESCE(v_perna.selecao_livre, '') IS DISTINCT FROM COALESCE(v_elem->>'selecao_livre', '') THEN (v_elem->>'selecao_livre') ELSE NULL END
         );
         v_edited_count := v_edited_count + 1;
       END IF;

       UPDATE apostas_pernas SET
         ordem = v_ordem,
         fonte_saldo = COALESCE(v_elem->>'fonte_saldo', fonte_saldo)
       WHERE id = v_perna_id;

     ELSE
       v_perna_id := NULL;
       v_id_text := NULL;
     END IF;
    END IF;

    -- New perna (no ID or ID not found)
    IF v_id_text IS NULL OR v_id_text = '' THEN
      -- Calculate stake_real/stake_freebet for new perna
      v_perna_stake := (v_elem->>'stake')::NUMERIC;
      IF COALESCE(v_elem->>'fonte_saldo', 'REAL') = 'FREEBET' THEN
        v_perna_stake_real := 0;
        v_perna_stake_freebet := v_perna_stake;
      ELSE
        v_perna_stake_real := v_perna_stake;
        v_perna_stake_freebet := 0;
      END IF;

      INSERT INTO apostas_pernas (
        aposta_id, bookmaker_id, stake, stake_real, stake_freebet, odd, moeda, selecao, selecao_livre,
        ordem, fonte_saldo, cotacao_snapshot, stake_brl_referencia
      ) VALUES (
        p_aposta_id,
        (v_elem->>'bookmaker_id')::UUID,
        v_perna_stake,
        v_perna_stake_real,
        v_perna_stake_freebet,
        (v_elem->>'odd')::NUMERIC,
        COALESCE(v_elem->>'moeda', 'BRL'),
        v_elem->>'selecao',
        v_elem->>'selecao_livre',
        v_ordem,
        COALESCE(v_elem->>'fonte_saldo', 'REAL'),
        CASE WHEN v_elem->>'cotacao_snapshot' IS NOT NULL THEN (v_elem->>'cotacao_snapshot')::NUMERIC ELSE NULL END,
        CASE WHEN v_elem->>'stake_brl_referencia' IS NOT NULL THEN (v_elem->>'stake_brl_referencia')::NUMERIC ELSE NULL END
      );

      -- Generate STAKE financial event for new perna
      INSERT INTO financial_events (
        workspace_id, bookmaker_id, event_type, amount, currency, reference_type, reference_id,
        idempotency_key, description, project_id
      ) VALUES (
        v_workspace_id,
        (v_elem->>'bookmaker_id')::UUID,
        'STAKE',
        -v_perna_stake,
        COALESCE(v_elem->>'moeda', 'BRL'),
        'APOSTA_PERNA',
        (SELECT id FROM apostas_pernas WHERE aposta_id = p_aposta_id AND ordem = v_ordem LIMIT 1),
        'stake_perna_' || p_aposta_id || '_new_' || v_ordem || '_' || extract(epoch from now()),
        'Stake nova perna (edição)',
        v_aposta.projeto_id
      );

      v_new_count := v_new_count + 1;
    END IF;
  END LOOP;

  -- 7. Update parent record
  UPDATE apostas_unificada SET
    evento = COALESCE(p_evento, evento),
    esporte = COALESCE(p_esporte, esporte),
    mercado = COALESCE(p_mercado, mercado),
    modelo = COALESCE(p_modelo, modelo),
    estrategia = COALESCE(p_estrategia, estrategia),
    contexto_operacional = COALESCE(p_contexto, contexto_operacional),
    data_aposta = CASE 
      WHEN p_data_aposta IS NOT NULL THEN p_data_aposta::timestamptz 
      ELSE data_aposta 
    END,
    stake_total = COALESCE(p_stake_total, stake_total),
    stake_real = (SELECT COALESCE(SUM(ap.stake_real), 0) FROM apostas_pernas ap WHERE ap.aposta_id = p_aposta_id),
    stake_freebet = (SELECT COALESCE(SUM(ap.stake_freebet), 0) FROM apostas_pernas ap WHERE ap.aposta_id = p_aposta_id),
    stake_consolidado = COALESCE(p_stake_consolidado, stake_consolidado),
    lucro_esperado = COALESCE(p_lucro_esperado, lucro_esperado),
    roi_esperado = COALESCE(p_roi_esperado, roi_esperado),
    lucro_prejuizo = COALESCE(p_lucro_prejuizo, lucro_prejuizo),
    roi_real = COALESCE(p_roi_real, roi_real),
    status = COALESCE(p_status, status),
    resultado = COALESCE(p_resultado, resultado),
    updated_at = now()
  WHERE id = p_aposta_id;

  -- 8. Return summary
  RETURN jsonb_build_object(
    'success', true,
    'edited', v_edited_count,
    'deleted', v_deleted_count,
    'created', v_new_count,
    'pernas', (
      SELECT jsonb_agg(jsonb_build_object(
        'id', p.id,
        'bookmaker_id', p.bookmaker_id,
        'selecao', p.selecao,
        'selecao_livre', p.selecao_livre,
        'odd', p.odd,
        'stake', p.stake,
        'stake_real', p.stake_real,
        'stake_freebet', p.stake_freebet,
        'resultado', p.resultado,
        'lucro_prejuizo', p.lucro_prejuizo,
        'gerou_freebet', p.gerou_freebet,
        'valor_freebet_gerada', p.valor_freebet_gerada
      ) ORDER BY p.ordem)
      FROM apostas_pernas p WHERE p.aposta_id = p_aposta_id
    )
  );
END;
$$;
