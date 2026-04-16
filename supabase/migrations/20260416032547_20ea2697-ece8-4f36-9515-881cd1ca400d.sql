
-- =============================================================================
-- FIX 1: Trigger de normalização - skip validação para ARBITRAGEM
-- =============================================================================
CREATE OR REPLACE FUNCTION public.normalize_apostas_unificada_stake_split()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_total NUMERIC;
  v_real NUMERIC;
  v_freebet NUMERIC;
BEGIN
  -- Para ARBITRAGEM (surebets), as stakes são em moedas diferentes.
  -- A validação total = real + freebet NÃO se aplica porque stake_total
  -- pode ser o valor consolidado enquanto stake_real é a soma bruta.
  IF NEW.forma_registro = 'ARBITRAGEM' THEN
    -- Apenas garantir que stake_freebet tem valor default
    NEW.stake_freebet := COALESCE(NEW.stake_freebet, 0);
    RETURN NEW;
  END IF;

  v_total := COALESCE(NEW.stake_total, NEW.stake, 0);

  v_real := COALESCE(NULLIF(NEW.stake_real, 0), NULL);
  v_freebet := COALESCE(NULLIF(NEW.stake_freebet, 0), NULL);

  IF v_real IS NULL AND v_freebet IS NULL THEN
    IF NEW.fonte_saldo = 'FREEBET' OR NEW.usar_freebet = TRUE THEN
      v_real := 0;
      v_freebet := v_total;
    ELSE
      v_real := v_total;
      v_freebet := 0;
    END IF;
  ELSIF v_real IS NULL THEN
    v_real := GREATEST(v_total - v_freebet, 0);
  ELSIF v_freebet IS NULL THEN
    v_freebet := GREATEST(v_total - v_real, 0);
  END IF;

  v_real := GREATEST(0, v_real);
  v_freebet := GREATEST(0, v_freebet);

  IF v_total = 0 THEN
    v_total := v_real + v_freebet;
  END IF;

  IF ABS(v_total - (v_real + v_freebet)) > 0.02 THEN
    RAISE EXCEPTION 'Stake split inválido em apostas_unificada: total %, real %, freebet %', v_total, v_real, v_freebet;
  END IF;

  IF ABS(v_total - (v_real + v_freebet)) > 0 AND ABS(v_total - (v_real + v_freebet)) <= 0.02 THEN
    v_real := v_total - v_freebet;
  END IF;

  NEW.stake_total := ROUND(v_total, 2);
  NEW.stake_real := ROUND(v_real, 2);
  NEW.stake_freebet := ROUND(v_freebet, 2);
  NEW.stake := ROUND(v_total, 2);

  RETURN NEW;
END;
$$;

-- =============================================================================
-- FIX 2: liquidar_perna_surebet_v1 - não sobrescrever stake_total com consolidado
-- =============================================================================
DROP FUNCTION IF EXISTS public.liquidar_perna_surebet_v1(UUID, TEXT, UUID);

CREATE OR REPLACE FUNCTION public.liquidar_perna_surebet_v1(
  p_perna_id UUID,
  p_resultado TEXT,
  p_workspace_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_perna RECORD;
  v_surebet_id UUID;
  v_stake_val NUMERIC;
  v_odd_val NUMERIC;
  v_moeda TEXT;
  v_bookmaker_id UUID;
  v_payout NUMERIC := 0;
  v_old_resultado TEXT;
  v_old_payout NUMERIC;
  v_fonte_saldo TEXT;
  v_is_freebet BOOLEAN;
  v_total_pernas INT;
  v_pernas_liquidadas INT;
  v_resultado_final TEXT;
  v_event_count INT;
  -- Recalc variables
  v_todas_liquidadas BOOLEAN;
  v_lucro_total NUMERIC;
  v_stake_total NUMERIC;
  v_is_multicurrency BOOLEAN;
  v_pl_consolidado NUMERIC;
  v_stake_consolidado NUMERIC;
  v_consolidation_currency TEXT;
BEGIN
  -- 1. Get perna data
  SELECT ap.aposta_id, ap.stake, ap.odd, ap.moeda, ap.bookmaker_id, ap.resultado,
         ap.lucro_prejuizo, COALESCE(ap.fonte_saldo, 'REAL')
  INTO v_surebet_id, v_stake_val, v_odd_val, v_moeda, v_bookmaker_id, v_old_resultado,
       v_old_payout, v_fonte_saldo
  FROM apostas_pernas ap
  WHERE ap.id = p_perna_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Perna não encontrada');
  END IF;

  -- Guard clause: same result = no-op
  IF v_old_resultado = p_resultado THEN
    RETURN jsonb_build_object('success', true, 'message', 'Resultado já é o mesmo', 'perna_id', p_perna_id);
  END IF;

  v_is_freebet := (v_fonte_saldo = 'FREEBET');

  -- 2. Reverse previous payout if re-liquidation
  IF v_old_resultado IS NOT NULL AND v_old_resultado NOT IN ('PENDENTE', '') THEN
    -- Reverse old payout
    IF v_old_payout IS NOT NULL AND v_old_payout != 0 THEN
      INSERT INTO financial_events (
        bookmaker_id, aposta_id, workspace_id, created_by,
        tipo_evento, tipo_uso, origem, valor, moeda,
        idempotency_key, descricao
      ) VALUES (
        v_bookmaker_id, v_surebet_id, p_workspace_id,
        (SELECT user_id FROM apostas_unificada WHERE id = v_surebet_id),
        'REVERSAL', 'NORMAL', 'REVERSAL',
        -(v_old_payout + v_stake_val), v_moeda,
        'reversal_perna_' || p_perna_id || '_' || extract(epoch from now()),
        'Reversão payout perna (reliquidação)'
      );
    END IF;

    -- Reverse VOID refund if old was VOID
    IF v_old_resultado = 'VOID' THEN
      INSERT INTO financial_events (
        bookmaker_id, aposta_id, workspace_id, created_by,
        tipo_evento, tipo_uso, origem, valor, moeda,
        idempotency_key, descricao
      ) VALUES (
        v_bookmaker_id, v_surebet_id, p_workspace_id,
        (SELECT user_id FROM apostas_unificada WHERE id = v_surebet_id),
        'REVERSAL', 'NORMAL', 'REVERSAL',
        -v_stake_val, v_moeda,
        'reversal_void_perna_' || p_perna_id || '_' || extract(epoch from now()),
        'Reversão VOID refund perna (reliquidação)'
      );
    END IF;
  END IF;

  -- 3. Calculate payout based on resultado
  IF p_resultado = 'GREEN' THEN
    v_payout := CASE WHEN v_is_freebet THEN v_stake_val * (v_odd_val - 1) ELSE v_stake_val * v_odd_val END;
  ELSIF p_resultado = 'MEIO_GREEN' THEN
    v_payout := CASE WHEN v_is_freebet THEN (v_stake_val * (v_odd_val - 1)) / 2 ELSE v_stake_val + ((v_stake_val * v_odd_val) - v_stake_val) / 2 END;
  ELSIF p_resultado = 'MEIO_RED' THEN
    v_payout := v_stake_val / 2;
  ELSIF p_resultado = 'VOID' THEN
    v_payout := v_stake_val;
  ELSE -- RED
    v_payout := 0;
  END IF;

  -- 4. Create PAYOUT or VOID_REFUND event
  IF p_resultado = 'VOID' THEN
    INSERT INTO financial_events (
      bookmaker_id, aposta_id, workspace_id, created_by,
      tipo_evento, tipo_uso, origem, valor, moeda,
      idempotency_key, descricao
    ) VALUES (
      v_bookmaker_id, v_surebet_id, p_workspace_id,
      (SELECT user_id FROM apostas_unificada WHERE id = v_surebet_id),
      'VOID_REFUND', CASE WHEN v_is_freebet THEN 'FREEBET' ELSE 'NORMAL' END, 'VOID_REFUND',
      v_stake_val, v_moeda,
      'void_perna_' || p_perna_id || '_' || extract(epoch from now()),
      'VOID refund perna surebet'
    );
  ELSIF v_payout > 0 THEN
    INSERT INTO financial_events (
      bookmaker_id, aposta_id, workspace_id, created_by,
      tipo_evento, tipo_uso, origem, valor, moeda,
      idempotency_key, descricao
    ) VALUES (
      v_bookmaker_id, v_surebet_id, p_workspace_id,
      (SELECT user_id FROM apostas_unificada WHERE id = v_surebet_id),
      'PAYOUT', CASE WHEN v_is_freebet THEN 'FREEBET' ELSE 'NORMAL' END, 'PAYOUT',
      v_payout, v_moeda,
      'payout_perna_' || p_perna_id || '_' || extract(epoch from now()),
      format('Payout perna surebet (%s)', p_resultado)
    );
  END IF;

  -- 5. Update perna
  UPDATE apostas_pernas SET
    resultado = p_resultado,
    lucro_prejuizo = v_payout - v_stake_val,
    updated_at = now()
  WHERE id = p_perna_id;

  -- 6. Check if all legs resolved
  SELECT COUNT(*), COUNT(*) FILTER (WHERE resultado IS NOT NULL AND resultado NOT IN ('PENDENTE', ''))
  INTO v_total_pernas, v_pernas_liquidadas
  FROM apostas_pernas WHERE aposta_id = v_surebet_id;

  IF v_pernas_liquidadas = v_total_pernas THEN
    -- All legs resolved: use fn_recalc_pai_surebet
    BEGIN
      SELECT r.todas_liquidadas, r.lucro_total, r.stake_total, r.resultado_final,
             r.is_multicurrency, r.pl_consolidado, r.stake_consolidado, r.consolidation_currency
      INTO v_todas_liquidadas, v_lucro_total, v_stake_total, v_resultado_final,
           v_is_multicurrency, v_pl_consolidado, v_stake_consolidado, v_consolidation_currency
      FROM fn_recalc_pai_surebet(v_surebet_id) r;
    EXCEPTION WHEN undefined_function THEN
      -- Manual fallback
      SELECT 
        CASE WHEN SUM(CASE WHEN ap.lucro_prejuizo > 0 THEN 1 ELSE 0 END) > 0 
             AND SUM(ap.lucro_prejuizo) >= 0 THEN 'GREEN'
             WHEN SUM(ap.lucro_prejuizo) > 0 THEN 'GREEN'
             WHEN SUM(ap.lucro_prejuizo) < 0 THEN 'RED'
             ELSE 'VOID' END
      INTO v_resultado_final
      FROM apostas_pernas ap WHERE ap.aposta_id = v_surebet_id;
      
      v_lucro_total := NULL;
      v_stake_total := NULL;
      v_is_multicurrency := NULL;
      v_pl_consolidado := NULL;
      v_stake_consolidado := NULL;
      v_consolidation_currency := NULL;
    END;

    -- CRITICAL: Do NOT set stake_total to consolidated value!
    -- stake_total must remain as the raw sum of pernas.
    -- Use stake_consolidado for the converted value.
    UPDATE apostas_unificada SET
      resultado = COALESCE(v_resultado_final, 'GREEN'),
      status = 'LIQUIDADA',
      lucro_prejuizo = v_lucro_total,
      pl_consolidado = v_pl_consolidado,
      stake_consolidado = v_stake_consolidado,
      is_multicurrency = COALESCE(v_is_multicurrency, is_multicurrency),
      consolidation_currency = COALESCE(v_consolidation_currency, consolidation_currency),
      roi_real = CASE WHEN v_stake_total > 0 THEN ROUND((v_lucro_total / v_stake_total) * 100, 2) ELSE 0 END,
      updated_at = now()
    WHERE id = v_surebet_id;
  ELSE
    -- Not all legs resolved
    UPDATE apostas_unificada SET
      status = 'PENDENTE',
      updated_at = now()
    WHERE id = v_surebet_id;
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'perna_id', p_perna_id,
    'resultado', p_resultado,
    'payout', v_payout,
    'lucro_prejuizo', v_payout - v_stake_val
  );
END;
$function$;

-- =============================================================================
-- FIX 3: criar_surebet_atomica - lucro_esperado consolidado para multimoeda
-- =============================================================================
DROP FUNCTION IF EXISTS public.criar_surebet_atomica(
  p_workspace_id uuid, p_user_id uuid, p_projeto_id uuid,
  p_evento text, p_esporte text, p_mercado text, p_modelo text,
  p_estrategia text, p_contexto_operacional text, p_data_aposta text, p_pernas jsonb
);

CREATE OR REPLACE FUNCTION public.criar_surebet_atomica(
  p_workspace_id uuid,
  p_user_id uuid,
  p_projeto_id uuid,
  p_evento text,
  p_esporte text DEFAULT NULL,
  p_mercado text DEFAULT NULL,
  p_modelo text DEFAULT NULL,
  p_estrategia text DEFAULT 'SUREBET',
  p_contexto_operacional text DEFAULT 'NORMAL',
  p_data_aposta text DEFAULT NULL,
  p_pernas jsonb DEFAULT '[]'
)
RETURNS TABLE(success boolean, aposta_id uuid, events_created integer, message text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_aposta_id UUID;
  v_perna JSONB;
  v_perna_idx INTEGER := 0;
  v_bookmaker_id UUID;
  v_stake NUMERIC;
  v_odd NUMERIC;
  v_moeda TEXT;
  v_selecao TEXT;
  v_selecao_livre TEXT;
  v_saldo_atual NUMERIC;
  v_saldo_freebet NUMERIC;
  v_bookmaker_status TEXT;
  v_stake_total NUMERIC := 0;
  v_stake_real_total NUMERIC := 0;
  v_stake_freebet_total NUMERIC := 0;
  v_stake_consolidado NUMERIC := 0;
  v_events_created INTEGER := 0;
  v_perna_id UUID;
  v_event_id UUID;
  v_roi_esperado NUMERIC;
  v_lucro_esperado NUMERIC;
  v_inverse_sum NUMERIC := 0;
  v_cotacao_snapshot NUMERIC;
  v_stake_brl_referencia NUMERIC;
  v_fonte_saldo TEXT;
  v_data_aposta timestamptz;
  v_perna_stake_real NUMERIC;
  v_perna_stake_freebet NUMERIC;
  v_moeda_consolidacao TEXT;
  v_is_multicurrency BOOLEAN := FALSE;
  v_moedas TEXT[] := '{}';
  v_snapshot_brl_consol NUMERIC;
  v_rate NUMERIC;
BEGIN
  IF p_data_aposta IS NULL OR btrim(p_data_aposta) = '' THEN
    v_data_aposta := now();
  ELSE
    v_data_aposta := p_data_aposta::timestamptz;
  END IF;

  IF jsonb_array_length(p_pernas) < 2 THEN
    RETURN QUERY SELECT FALSE::BOOLEAN, NULL::UUID, 0::INTEGER, 'Surebet requer no mínimo 2 pernas'::TEXT;
    RETURN;
  END IF;

  -- Get project consolidation currency
  SELECT COALESCE(p.moeda_consolidacao, 'BRL') INTO v_moeda_consolidacao
  FROM projetos p WHERE p.id = p_projeto_id;
  v_moeda_consolidacao := COALESCE(v_moeda_consolidacao, 'BRL');

  -- Get BRL rate for consolidation currency (if not BRL)
  IF v_moeda_consolidacao != 'BRL' THEN
    FOR v_perna IN SELECT * FROM jsonb_array_elements(p_pernas) LOOP
      IF (v_perna->>'moeda') = v_moeda_consolidacao AND (v_perna->>'cotacao_snapshot') IS NOT NULL THEN
        v_snapshot_brl_consol := (v_perna->>'cotacao_snapshot')::NUMERIC;
        EXIT;
      END IF;
    END LOOP;
  END IF;

  -- First pass: validate balances and accumulate totals
  FOR v_perna IN SELECT * FROM jsonb_array_elements(p_pernas) LOOP
    v_perna_idx := v_perna_idx + 1;
    v_bookmaker_id := (v_perna->>'bookmaker_id')::UUID;
    v_stake := (v_perna->>'stake')::NUMERIC;
    v_odd := (v_perna->>'odd')::NUMERIC;
    v_moeda := COALESCE(v_perna->>'moeda', 'BRL');
    v_fonte_saldo := COALESCE(v_perna->>'fonte_saldo', 'REAL');
    v_cotacao_snapshot := (v_perna->>'cotacao_snapshot')::NUMERIC;

    -- Track currencies for multicurrency detection
    IF NOT (v_moeda = ANY(v_moedas)) THEN
      v_moedas := array_append(v_moedas, v_moeda);
    END IF;

    SELECT b.saldo_atual, b.saldo_freebet, b.status 
    INTO v_saldo_atual, v_saldo_freebet, v_bookmaker_status
    FROM bookmakers b WHERE b.id = v_bookmaker_id AND b.workspace_id = p_workspace_id;
    
    IF NOT FOUND THEN
      RETURN QUERY SELECT FALSE::BOOLEAN, NULL::UUID, 0::INTEGER, 
        format('Perna %s: Bookmaker não encontrada', v_perna_idx)::TEXT;
      RETURN;
    END IF;
    
    IF LOWER(v_bookmaker_status) NOT IN ('ativo', 'limitada') THEN
      RETURN QUERY SELECT FALSE::BOOLEAN, NULL::UUID, 0::INTEGER, 
        format('Perna %s: Bookmaker com status "%s" não permite apostas', v_perna_idx, v_bookmaker_status)::TEXT;
      RETURN;
    END IF;
    
    IF v_fonte_saldo = 'FREEBET' THEN
      IF v_stake > COALESCE(v_saldo_freebet, 0) THEN
        RETURN QUERY SELECT FALSE::BOOLEAN, NULL::UUID, 0::INTEGER, 
          format('Perna %s: Saldo freebet insuficiente (stake: %s, disponível: %s)', v_perna_idx, v_stake, COALESCE(v_saldo_freebet, 0))::TEXT;
        RETURN;
      END IF;
      v_stake_freebet_total := v_stake_freebet_total + v_stake;
    ELSE
      IF v_stake > v_saldo_atual THEN
        RETURN QUERY SELECT FALSE::BOOLEAN, NULL::UUID, 0::INTEGER, 
          format('Perna %s: Saldo insuficiente (stake: %s, disponível: %s)', v_perna_idx, v_stake, v_saldo_atual)::TEXT;
        RETURN;
      END IF;
      v_stake_real_total := v_stake_real_total + v_stake;
    END IF;
    
    v_stake_total := v_stake_total + v_stake;
    v_inverse_sum := v_inverse_sum + (1.0 / v_odd);

    -- Calculate consolidated stake
    IF v_moeda = v_moeda_consolidacao THEN
      v_rate := 1;
    ELSIF v_moeda_consolidacao = 'BRL' THEN
      v_rate := COALESCE(v_cotacao_snapshot, 1);
    ELSE
      IF v_cotacao_snapshot IS NOT NULL AND v_cotacao_snapshot > 0
         AND v_snapshot_brl_consol IS NOT NULL AND v_snapshot_brl_consol > 0 THEN
        v_rate := v_cotacao_snapshot / v_snapshot_brl_consol;
      ELSE
        v_rate := 1;
      END IF;
    END IF;
    v_stake_consolidado := v_stake_consolidado + (v_stake * v_rate);
  END LOOP;
  
  v_is_multicurrency := (array_length(v_moedas, 1) > 1);
  v_roi_esperado := (1.0 - v_inverse_sum) * 100;
  -- Use consolidated stake for lucro_esperado (correct for multicurrency)
  v_lucro_esperado := v_stake_consolidado * (v_roi_esperado / 100);
  
  INSERT INTO apostas_unificada (
    workspace_id, user_id, projeto_id,
    forma_registro, estrategia, contexto_operacional,
    evento, esporte, mercado, modelo,
    data_aposta, stake_total, stake_real, stake_freebet,
    stake_consolidado, is_multicurrency, consolidation_currency,
    lucro_esperado, roi_esperado,
    status, resultado
  ) VALUES (
    p_workspace_id, p_user_id, p_projeto_id,
    'ARBITRAGEM', p_estrategia, p_contexto_operacional,
    p_evento, p_esporte, p_mercado, p_modelo,
    v_data_aposta, v_stake_total, v_stake_real_total, v_stake_freebet_total,
    ROUND(v_stake_consolidado, 2), v_is_multicurrency, v_moeda_consolidacao,
    ROUND(v_lucro_esperado, 2), ROUND(v_roi_esperado, 4),
    'PENDENTE', 'PENDENTE'
  )
  RETURNING id INTO v_aposta_id;

  -- Second pass: insert legs and financial events
  v_perna_idx := 0;
  
  FOR v_perna IN SELECT * FROM jsonb_array_elements(p_pernas) LOOP
    v_perna_idx := v_perna_idx + 1;
    v_bookmaker_id := (v_perna->>'bookmaker_id')::UUID;
    v_stake := (v_perna->>'stake')::NUMERIC;
    v_odd := (v_perna->>'odd')::NUMERIC;
    v_moeda := COALESCE(v_perna->>'moeda', 'BRL');
    v_selecao := COALESCE(v_perna->>'selecao', '');
    v_selecao_livre := v_perna->>'selecao_livre';
    v_cotacao_snapshot := (v_perna->>'cotacao_snapshot')::NUMERIC;
    v_stake_brl_referencia := (v_perna->>'stake_brl_referencia')::NUMERIC;
    v_fonte_saldo := COALESCE(v_perna->>'fonte_saldo', 'REAL');

    IF v_fonte_saldo = 'FREEBET' THEN
      v_perna_stake_real := 0;
      v_perna_stake_freebet := v_stake;
    ELSE
      v_perna_stake_real := v_stake;
      v_perna_stake_freebet := 0;
    END IF;
    
    INSERT INTO apostas_pernas (
      aposta_id, bookmaker_id, ordem, selecao, selecao_livre,
      odd, stake, stake_real, stake_freebet,
      moeda, cotacao_snapshot, stake_brl_referencia, 
      resultado, fonte_saldo
    ) VALUES (
      v_aposta_id, v_bookmaker_id, v_perna_idx, v_selecao, v_selecao_livre,
      v_odd, v_stake, v_perna_stake_real, v_perna_stake_freebet,
      v_moeda, v_cotacao_snapshot, v_stake_brl_referencia, 
      NULL, v_fonte_saldo
    )
    RETURNING id INTO v_perna_id;
    
    INSERT INTO financial_events (
      bookmaker_id, aposta_id, workspace_id,
      tipo_evento, tipo_uso, origem, valor, moeda,
      idempotency_key, descricao, processed_at, created_by
    ) VALUES (
      v_bookmaker_id, v_aposta_id, p_workspace_id,
      'STAKE',
      CASE WHEN v_fonte_saldo = 'FREEBET' THEN 'FREEBET' ELSE 'NORMAL' END,
      'STAKE',
      -v_stake,
      v_moeda,
      'stake_' || v_aposta_id || '_leg' || v_perna_idx,
      'Stake Surebet Perna ' || v_perna_idx || CASE WHEN v_fonte_saldo = 'FREEBET' THEN ' (FB)' ELSE '' END,
      NOW(), p_user_id
    )
    RETURNING id INTO v_event_id;
    
    v_events_created := v_events_created + 1;
  END LOOP;

  RETURN QUERY SELECT 
    TRUE::BOOLEAN, v_aposta_id, v_events_created,
    format('Surebet criada com %s pernas', v_events_created)::TEXT;
    
EXCEPTION
  WHEN OTHERS THEN
    RETURN QUERY SELECT 
      FALSE::BOOLEAN, NULL::UUID, 0::INTEGER, 
      format('Erro: %s', SQLERRM)::TEXT;
END;
$function$;

COMMENT ON FUNCTION criar_surebet_atomica IS 
'v11 - Corrigido: (1) lucro_esperado usa stake consolidado para multimoeda. (2) Grava stake_consolidado, is_multicurrency, consolidation_currency no registro pai.';
