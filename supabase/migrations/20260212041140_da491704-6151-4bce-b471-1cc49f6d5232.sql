
-- RPC para edição atômica de perna de surebet com reconciliação financeira
CREATE OR REPLACE FUNCTION public.editar_perna_surebet_atomica(
  p_perna_id UUID,
  p_new_stake NUMERIC DEFAULT NULL,
  p_new_odd NUMERIC DEFAULT NULL,
  p_new_bookmaker_id UUID DEFAULT NULL,
  p_new_selecao TEXT DEFAULT NULL,
  p_new_selecao_livre TEXT DEFAULT NULL
) RETURNS JSONB
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
BEGIN
  -- 1. Buscar perna atual com dados do pai
  SELECT ap.id, ap.aposta_id, ap.bookmaker_id, ap.stake, ap.odd, ap.moeda,
         ap.resultado, ap.fonte_saldo,
         au.workspace_id
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
  v_eff_stake := COALESCE(p_new_stake, v_old_stake);
  v_eff_odd := COALESCE(p_new_odd, v_old_odd);
  v_resultado := v_perna.resultado;
  v_moeda := v_perna.moeda;

  -- ============================================================
  -- A) BOOKMAKER CHANGE: Move all financial impact to new bookmaker
  -- ============================================================
  IF p_new_bookmaker_id IS NOT NULL AND p_new_bookmaker_id != v_old_bk THEN
    -- A1. Reverse stake on old bookmaker (credit)
    INSERT INTO financial_events (bookmaker_id, aposta_id, workspace_id, tipo_evento, tipo_uso, origem, valor, moeda, idempotency_key, descricao, processed_at)
    VALUES (v_old_bk, v_surebet_id, v_ws, 'REVERSAL', 'NORMAL', 'REVERSAL', v_old_stake, v_moeda,
            'edit_bk_rev_stake_' || p_perna_id || '_' || extract(epoch from now())::bigint,
            format('Reversão stake (mudança bookmaker): %s', v_old_stake), now());
    
    -- A2. Create stake on new bookmaker (debit)
    INSERT INTO financial_events (bookmaker_id, aposta_id, workspace_id, tipo_evento, tipo_uso, origem, valor, moeda, idempotency_key, descricao, processed_at)
    VALUES (p_new_bookmaker_id, v_surebet_id, v_ws, 'STAKE', 'NORMAL', 'APOSTA', -v_eff_stake, v_moeda,
            'edit_bk_new_stake_' || p_perna_id || '_' || extract(epoch from now())::bigint,
            format('Stake em novo bookmaker: %s', v_eff_stake), now());
    
    -- A3. If liquidated with payout, move payout too
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
        INSERT INTO financial_events (bookmaker_id, aposta_id, workspace_id, tipo_evento, tipo_uso, origem, valor, moeda, idempotency_key, descricao, processed_at)
        VALUES (v_old_bk, v_surebet_id, v_ws, 'REVERSAL', 'NORMAL', 'REVERSAL', -v_old_payout, v_moeda,
                'edit_bk_rev_payout_' || p_perna_id || '_' || extract(epoch from now())::bigint,
                'Reversão payout (mudança bookmaker)', now());
      END IF;
      
      IF v_new_payout > 0 THEN
        INSERT INTO financial_events (bookmaker_id, aposta_id, workspace_id, tipo_evento, tipo_uso, origem, valor, moeda, idempotency_key, descricao, processed_at)
        VALUES (p_new_bookmaker_id, v_surebet_id, v_ws, 'PAYOUT', 'NORMAL', 'LUCRO', v_new_payout, v_moeda,
                'edit_bk_new_payout_' || p_perna_id || '_' || extract(epoch from now())::bigint,
                'Payout em novo bookmaker', now());
      END IF;
    END IF;
  ELSE
    -- ============================================================
    -- B) SAME BOOKMAKER: Handle stake/odd changes with AJUSTE events
    -- ============================================================
    
    -- B1. Stake change
    IF p_new_stake IS NOT NULL AND p_new_stake != v_old_stake THEN
      v_stake_diff := p_new_stake - v_old_stake;
      INSERT INTO financial_events (bookmaker_id, aposta_id, workspace_id, tipo_evento, tipo_uso, origem, valor, moeda, idempotency_key, descricao, processed_at)
      VALUES (v_old_bk, v_surebet_id, v_ws, 'AJUSTE', 'NORMAL', 'AJUSTE', -v_stake_diff, v_moeda,
              'edit_stake_' || p_perna_id || '_' || extract(epoch from now())::bigint,
              format('Ajuste stake perna: %s → %s', v_old_stake, p_new_stake), now());
    END IF;
    
    -- B2. Odd/stake change on liquidated perna (affects payout)
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
        INSERT INTO financial_events (bookmaker_id, aposta_id, workspace_id, tipo_evento, tipo_uso, origem, valor, moeda, idempotency_key, descricao, processed_at)
        VALUES (v_old_bk, v_surebet_id, v_ws, 'AJUSTE', 'NORMAL', 'AJUSTE', v_payout_diff, v_moeda,
                'edit_payout_' || p_perna_id || '_' || extract(epoch from now())::bigint,
                format('Ajuste payout (odd %s→%s): %s → %s', v_old_odd, v_eff_odd, v_old_payout, v_new_payout), now());
      END IF;
    END IF;
  END IF;
  
  -- ============================================================
  -- C) UPDATE PERNA RECORD
  -- ============================================================
  UPDATE apostas_pernas SET
    stake = v_eff_stake,
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
  
  -- ============================================================
  -- D) RECALCULATE PARENT SUREBET
  -- ============================================================
  UPDATE apostas_unificada SET
    stake_total = (SELECT COALESCE(SUM(stake), 0) FROM apostas_pernas WHERE aposta_id = v_surebet_id),
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
    'new_odd', v_eff_odd
  );
END;
$$;
