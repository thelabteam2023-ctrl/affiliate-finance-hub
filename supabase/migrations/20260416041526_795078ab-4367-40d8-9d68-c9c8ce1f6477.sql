
-- =============================================================================
-- FIX: criar_surebet_atomica - per-scenario lucro_esperado for multicurrency
-- The formula (1 - sum(1/odd)) is WRONG for multicurrency because different
-- legs have different exchange rates, making the "equal return" assumption invalid.
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
  -- Per-scenario analysis arrays
  v_leg_stakes NUMERIC[];
  v_leg_odds NUMERIC[];
  v_leg_rates NUMERIC[];
  v_leg_is_fb BOOLEAN[];
  v_leg_count INTEGER := 0;
  v_scenario_lucro NUMERIC;
  v_min_lucro NUMERIC;
  v_payout_consol NUMERIC;
  v_stake_real_consol NUMERIC := 0;
  v_i INTEGER;
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

  -- First pass: validate balances and accumulate totals + build arrays for scenario analysis
  FOR v_perna IN SELECT * FROM jsonb_array_elements(p_pernas) LOOP
    v_perna_idx := v_perna_idx + 1;
    v_leg_count := v_leg_count + 1;
    v_bookmaker_id := (v_perna->>'bookmaker_id')::UUID;
    v_stake := (v_perna->>'stake')::NUMERIC;
    v_odd := (v_perna->>'odd')::NUMERIC;
    v_moeda := COALESCE(v_perna->>'moeda', 'BRL');
    v_fonte_saldo := COALESCE(v_perna->>'fonte_saldo', 'REAL');
    v_cotacao_snapshot := (v_perna->>'cotacao_snapshot')::NUMERIC;

    -- Track currencies
    IF NOT (v_moeda = ANY(v_moedas)) THEN
      v_moedas := array_append(v_moedas, v_moeda);
    END IF;

    -- Validate bookmaker
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

    -- Calculate rate for this leg
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

    -- Build arrays for scenario analysis
    v_leg_stakes := array_append(v_leg_stakes, v_stake);
    v_leg_odds := array_append(v_leg_odds, v_odd);
    v_leg_rates := array_append(v_leg_rates, v_rate);
    v_leg_is_fb := array_append(v_leg_is_fb, (v_fonte_saldo = 'FREEBET'));
  END LOOP;
  
  v_is_multicurrency := (array_length(v_moedas, 1) > 1);

  -- ===================================================================
  -- PER-SCENARIO ANALYSIS: Calculate worst-case profit (lucro_esperado)
  -- For each perna winning, compute: payout_consolidated - cost_real_consolidated
  -- This is mathematically correct for multicurrency (unlike 1-sum(1/odd))
  -- ===================================================================
  v_stake_real_consol := 0;
  FOR v_i IN 1..v_leg_count LOOP
    IF NOT v_leg_is_fb[v_i] THEN
      v_stake_real_consol := v_stake_real_consol + (v_leg_stakes[v_i] * v_leg_rates[v_i]);
    END IF;
  END LOOP;

  v_min_lucro := NULL;
  FOR v_i IN 1..v_leg_count LOOP
    IF v_leg_odds[v_i] <= 1 OR v_leg_stakes[v_i] <= 0 THEN
      v_scenario_lucro := -v_stake_real_consol;
    ELSE
      -- SNR: Freebet payout = stake*(odd-1), Real payout = stake*odd
      IF v_leg_is_fb[v_i] THEN
        v_payout_consol := v_leg_stakes[v_i] * (v_leg_odds[v_i] - 1) * v_leg_rates[v_i];
      ELSE
        v_payout_consol := v_leg_stakes[v_i] * v_leg_odds[v_i] * v_leg_rates[v_i];
      END IF;
      v_scenario_lucro := v_payout_consol - v_stake_real_consol;
    END IF;
    
    IF v_min_lucro IS NULL OR v_scenario_lucro < v_min_lucro THEN
      v_min_lucro := v_scenario_lucro;
    END IF;
  END LOOP;

  v_lucro_esperado := COALESCE(v_min_lucro, 0);
  v_roi_esperado := CASE WHEN v_stake_real_consol > 0 
    THEN (v_lucro_esperado / v_stake_real_consol) * 100 
    ELSE 0 END;
  
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
'v12 - lucro_esperado agora usa análise por cenário (pior caso) em vez de 1-sum(1/odd). Correto para multimoeda.';

-- =============================================================================
-- FIX: Recalculate existing multicurrency surebets that were corrupted by
-- client-side recalcularConsolidacaoSurebet (which forced consolidation_currency=BRL)
-- =============================================================================
DO $$
DECLARE
  v_rec RECORD;
  v_result RECORD;
BEGIN
  FOR v_rec IN 
    SELECT au.id 
    FROM apostas_unificada au
    WHERE au.is_multicurrency = true 
      AND au.status = 'LIQUIDADA'
      AND au.forma_registro = 'ARBITRAGEM'
  LOOP
    BEGIN
      SELECT r.pl_consolidado, r.stake_consolidado, r.consolidation_currency, 
             r.lucro_total, r.resultado_final, r.is_multicurrency
      INTO v_result
      FROM fn_recalc_pai_surebet(v_rec.id) r;
      
      UPDATE apostas_unificada SET
        pl_consolidado = v_result.pl_consolidado,
        stake_consolidado = v_result.stake_consolidado,
        consolidation_currency = v_result.consolidation_currency,
        lucro_prejuizo = v_result.lucro_total,
        is_multicurrency = v_result.is_multicurrency,
        roi_real = CASE WHEN v_result.stake_consolidado > 0 
          THEN ROUND((v_result.lucro_total / v_result.stake_consolidado) * 100, 2) 
          ELSE NULL END,
        updated_at = now()
      WHERE id = v_rec.id;
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'Failed to recalc surebet %: %', v_rec.id, SQLERRM;
    END;
  END LOOP;
END $$;
