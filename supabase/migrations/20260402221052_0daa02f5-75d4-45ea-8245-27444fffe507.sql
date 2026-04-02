
CREATE OR REPLACE FUNCTION public.editar_perna_surebet_atomica(
  p_perna_id UUID,
  p_new_stake NUMERIC DEFAULT NULL,
  p_new_odd NUMERIC DEFAULT NULL,
  p_new_bookmaker_id UUID DEFAULT NULL,
  p_new_selecao TEXT DEFAULT NULL,
  p_new_selecao_livre TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_perna RECORD;
  v_ws UUID;
  v_surebet_id UUID;
  v_old_stake NUMERIC;
  v_old_odd NUMERIC;
  v_old_bk UUID;
  v_eff_stake NUMERIC;
  v_eff_odd NUMERIC;
  v_resultado TEXT;
  v_old_payout NUMERIC := 0;
  v_new_payout NUMERIC := 0;
  v_payout_diff NUMERIC;
  v_stake_diff NUMERIC;
  v_moeda TEXT;
  v_user_id UUID;
  v_edit_count INT;
  v_saldo_atual NUMERIC;
  v_stake_increase NUMERIC;
  v_target_bk UUID;
  v_old_stake_real NUMERIC;
  v_old_stake_freebet NUMERIC;
  v_new_stake_real NUMERIC;
  v_new_stake_freebet NUMERIC;
BEGIN
  SELECT ap.id, ap.aposta_id, ap.bookmaker_id, ap.stake, ap.odd, ap.moeda,
         ap.resultado, ap.fonte_saldo, ap.stake_real, ap.stake_freebet,
         au.workspace_id, au.user_id
  INTO v_perna
  FROM apostas_pernas ap
  JOIN apostas_unificada au ON au.id = ap.aposta_id
  WHERE ap.id = p_perna_id;
  
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Perna não encontrada');
  END IF;
  
  v_ws := v_perna.workspace_id;
  v_surebet_id := v_perna.aposta_id;
  v_old_stake := v_perna.stake;
  v_old_odd := v_perna.odd;
  v_old_bk := v_perna.bookmaker_id;
  v_old_stake_real := COALESCE(v_perna.stake_real, v_old_stake);
  v_old_stake_freebet := COALESCE(v_perna.stake_freebet, 0);
  v_eff_stake := COALESCE(p_new_stake, v_old_stake);
  v_eff_odd := COALESCE(p_new_odd, v_old_odd);
  v_resultado := v_perna.resultado;
  v_moeda := v_perna.moeda;
  v_user_id := v_perna.user_id;

  -- Calcular novo stake_real e stake_freebet proporcionalmente
  IF p_new_stake IS NOT NULL AND p_new_stake != v_old_stake THEN
    IF v_old_stake > 0 THEN
      v_new_stake_real := ROUND((v_old_stake_real / v_old_stake) * p_new_stake, 2);
      v_new_stake_freebet := ROUND(p_new_stake - v_new_stake_real, 2);
      IF v_new_stake_freebet < 0 THEN
        v_new_stake_real := p_new_stake;
        v_new_stake_freebet := 0;
      END IF;
    ELSE
      v_new_stake_real := p_new_stake;
      v_new_stake_freebet := 0;
    END IF;
  ELSE
    v_new_stake_real := v_old_stake_real;
    v_new_stake_freebet := v_old_stake_freebet;
  END IF;

  -- VALIDAÇÃO DE SALDO
  v_target_bk := COALESCE(p_new_bookmaker_id, v_old_bk);
  
  IF v_eff_stake > v_old_stake THEN
    v_stake_increase := v_eff_stake - v_old_stake;
    
    SELECT saldo_atual INTO v_saldo_atual
    FROM bookmakers
    WHERE id = v_target_bk;
    
    IF v_saldo_atual IS NULL THEN
      RETURN jsonb_build_object('success', false, 'error', 'Bookmaker não encontrado');
    END IF;
    
    IF v_saldo_atual < v_stake_increase THEN
      RETURN jsonb_build_object(
        'success', false, 
        'error', format('Saldo insuficiente. Disponível: %s, necessário: %s', v_saldo_atual, v_stake_increase),
        'saldo_disponivel', v_saldo_atual,
        'stake_aumento', v_stake_increase
      );
    END IF;
  END IF;

  SELECT COUNT(*) INTO v_edit_count
  FROM financial_events
  WHERE aposta_id = v_surebet_id
    AND idempotency_key LIKE 'edit_perna_' || p_perna_id || '_%';

  -- A) BOOKMAKER CHANGE
  IF p_new_bookmaker_id IS NOT NULL AND p_new_bookmaker_id != v_old_bk THEN
    INSERT INTO financial_events (id, bookmaker_id, aposta_id, workspace_id, created_by, tipo_evento, tipo_uso, origem, valor, moeda, idempotency_key, descricao, processed_at)
    VALUES (gen_random_uuid(), v_old_bk, v_surebet_id, v_ws, v_user_id, 'REVERSAL', 'NORMAL', 'REVERSAL', v_old_stake, v_moeda,
            'edit_perna_' || p_perna_id || '_bk_rev_stake_n' || v_edit_count,
            format('Reversão stake (mudança bookmaker): %s', v_old_stake), now());
    
    INSERT INTO financial_events (id, bookmaker_id, aposta_id, workspace_id, created_by, tipo_evento, tipo_uso, origem, valor, moeda, idempotency_key, descricao, processed_at)
    VALUES (gen_random_uuid(), p_new_bookmaker_id, v_surebet_id, v_ws, v_user_id, 'STAKE', 'NORMAL', 'APOSTA', -v_eff_stake, v_moeda,
            'edit_perna_' || p_perna_id || '_bk_new_stake_n' || v_edit_count,
            format('Stake em novo bookmaker: %s', v_eff_stake), now());
    
    IF v_resultado IS NOT NULL AND v_resultado NOT IN ('PENDENTE', 'RED') THEN
      v_old_payout := CASE v_resultado
        WHEN 'GREEN' THEN v_old_stake * v_old_odd
        WHEN 'MEIO_GREEN' THEN v_old_stake + (v_old_stake * (v_old_odd - 1) / 2)
        WHEN 'VOID' THEN v_old_stake
        WHEN 'MEIO_RED' THEN v_old_stake / 2
        ELSE 0
      END;
      
      v_new_payout := CASE v_resultado
        WHEN 'GREEN' THEN v_eff_stake * v_eff_odd
        WHEN 'MEIO_GREEN' THEN v_eff_stake + (v_eff_stake * (v_eff_odd - 1) / 2)
        WHEN 'VOID' THEN v_eff_stake
        WHEN 'MEIO_RED' THEN v_eff_stake / 2
        ELSE 0
      END;
      
      IF v_old_payout > 0 THEN
        INSERT INTO financial_events (id, bookmaker_id, aposta_id, workspace_id, created_by, tipo_evento, tipo_uso, origem, valor, moeda, idempotency_key, descricao, processed_at)
        VALUES (gen_random_uuid(), v_old_bk, v_surebet_id, v_ws, v_user_id, 'REVERSAL', 'NORMAL', 'REVERSAL', -v_old_payout, v_moeda,
                'edit_perna_' || p_perna_id || '_bk_rev_payout_n' || v_edit_count,
                'Reversão payout (mudança bookmaker)', now());
      END IF;
      
      IF v_new_payout > 0 THEN
        INSERT INTO financial_events (id, bookmaker_id, aposta_id, workspace_id, created_by, tipo_evento, tipo_uso, origem, valor, moeda, idempotency_key, descricao, processed_at)
        VALUES (gen_random_uuid(), p_new_bookmaker_id, v_surebet_id, v_ws, v_user_id, 'PAYOUT', 'NORMAL', 'LUCRO', v_new_payout, v_moeda,
                'edit_perna_' || p_perna_id || '_bk_new_payout_n' || v_edit_count,
                'Payout em novo bookmaker', now());
      END IF;
    END IF;
  ELSE
    -- B) SAME BOOKMAKER: AJUSTE events
    IF p_new_stake IS NOT NULL AND p_new_stake != v_old_stake THEN
      v_stake_diff := p_new_stake - v_old_stake;
      INSERT INTO financial_events (id, bookmaker_id, aposta_id, workspace_id, created_by, tipo_evento, tipo_uso, origem, valor, moeda, idempotency_key, descricao, processed_at)
      VALUES (gen_random_uuid(), v_old_bk, v_surebet_id, v_ws, v_user_id, 'AJUSTE', 'NORMAL', 'AJUSTE', -v_stake_diff, v_moeda,
              'edit_perna_' || p_perna_id || '_stake_' || v_old_stake || '_to_' || p_new_stake || '_n' || v_edit_count,
              format('Ajuste stake perna: %s → %s', v_old_stake, p_new_stake), now());
    END IF;
    
    IF v_resultado IS NOT NULL AND v_resultado NOT IN ('PENDENTE', 'RED') THEN
      v_old_payout := CASE v_resultado
        WHEN 'GREEN' THEN v_old_stake * v_old_odd
        WHEN 'MEIO_GREEN' THEN v_old_stake + (v_old_stake * (v_old_odd - 1) / 2)
        WHEN 'VOID' THEN v_old_stake
        WHEN 'MEIO_RED' THEN v_old_stake / 2
        ELSE 0
      END;
      
      v_new_payout := CASE v_resultado
        WHEN 'GREEN' THEN v_eff_stake * v_eff_odd
        WHEN 'MEIO_GREEN' THEN v_eff_stake + (v_eff_stake * (v_eff_odd - 1) / 2)
        WHEN 'VOID' THEN v_eff_stake
        WHEN 'MEIO_RED' THEN v_eff_stake / 2
        ELSE 0
      END;
      
      v_payout_diff := v_new_payout - v_old_payout;
      
      IF v_payout_diff != 0 THEN
        INSERT INTO financial_events (id, bookmaker_id, aposta_id, workspace_id, created_by, tipo_evento, tipo_uso, origem, valor, moeda, idempotency_key, descricao, processed_at)
        VALUES (gen_random_uuid(), v_old_bk, v_surebet_id, v_ws, v_user_id, 'AJUSTE', 'NORMAL', 'AJUSTE', v_payout_diff, v_moeda,
                'edit_perna_' || p_perna_id || '_payout_' || v_old_odd || '_to_' || v_eff_odd || '_n' || v_edit_count,
                format('Ajuste payout (odd %s→%s): %s → %s', v_old_odd, v_eff_odd, v_old_payout, v_new_payout), now());
      END IF;
    END IF;
  END IF;
  
  -- C) UPDATE PERNA (agora inclui stake_real e stake_freebet)
  UPDATE apostas_pernas SET
    stake = v_eff_stake,
    stake_real = v_new_stake_real,
    stake_freebet = v_new_stake_freebet,
    odd = v_eff_odd,
    bookmaker_id = COALESCE(p_new_bookmaker_id, bookmaker_id),
    selecao = COALESCE(p_new_selecao, selecao),
    selecao_livre = COALESCE(p_new_selecao_livre, selecao_livre),
    lucro_prejuizo = CASE
      WHEN v_resultado IS NOT NULL AND v_resultado != 'PENDENTE' THEN
        CASE v_resultado
          WHEN 'GREEN' THEN v_eff_stake * (v_eff_odd - 1)
          WHEN 'MEIO_GREEN' THEN (v_eff_stake * (v_eff_odd - 1)) / 2
          WHEN 'RED' THEN -v_eff_stake
          WHEN 'MEIO_RED' THEN -v_eff_stake / 2
          WHEN 'VOID' THEN 0
          ELSE lucro_prejuizo
        END
      ELSE lucro_prejuizo
    END,
    updated_at = now()
  WHERE id = p_perna_id;
  
  -- D) RECALCULATE PARENT (agora inclui stake_real e stake_freebet)
  UPDATE apostas_unificada SET
    stake_total = (SELECT COALESCE(SUM(stake), 0) FROM apostas_pernas WHERE aposta_id = v_surebet_id),
    stake_real = (SELECT COALESCE(SUM(stake_real), 0) FROM apostas_pernas WHERE aposta_id = v_surebet_id),
    stake_freebet = (SELECT COALESCE(SUM(stake_freebet), 0) FROM apostas_pernas WHERE aposta_id = v_surebet_id),
    lucro_prejuizo = CASE
      WHEN (SELECT bool_and(resultado IS NOT NULL AND resultado != 'PENDENTE') FROM apostas_pernas WHERE aposta_id = v_surebet_id)
      THEN (SELECT COALESCE(SUM(lucro_prejuizo), 0) FROM apostas_pernas WHERE aposta_id = v_surebet_id)
      ELSE lucro_prejuizo
    END,
    roi_real = CASE
      WHEN (SELECT bool_and(resultado IS NOT NULL AND resultado != 'PENDENTE') FROM apostas_pernas WHERE aposta_id = v_surebet_id)
           AND (SELECT COALESCE(SUM(stake), 0) FROM apostas_pernas WHERE aposta_id = v_surebet_id) > 0
      THEN ((SELECT COALESCE(SUM(lucro_prejuizo), 0) FROM apostas_pernas WHERE aposta_id = v_surebet_id)::NUMERIC
            / (SELECT COALESCE(SUM(stake), 0) FROM apostas_pernas WHERE aposta_id = v_surebet_id)) * 100
      ELSE roi_real
    END,
    updated_at = now()
  WHERE id = v_surebet_id;
  
  RETURN jsonb_build_object(
    'success', true,
    'perna_id', p_perna_id,
    'old_stake', v_old_stake,
    'new_stake', v_eff_stake,
    'old_odd', v_old_odd,
    'new_odd', v_eff_odd,
    'stake_real', v_new_stake_real,
    'stake_freebet', v_new_stake_freebet,
    'saldo_validado', true
  );
END;
$$;
