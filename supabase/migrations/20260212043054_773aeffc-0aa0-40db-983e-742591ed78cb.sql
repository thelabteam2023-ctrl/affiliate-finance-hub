
-- =====================================================
-- 1) ADICIONAR VALIDAÇÃO DE SALDO na edição de perna
-- 2) CRIAR RPC deletar_perna_surebet_v1
-- =====================================================

-- ==========================================================
-- RPC: editar_perna_surebet_atomica (v2 - com validação saldo)
-- ==========================================================
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
  v_user_id UUID;
  v_edit_count INT;
  v_saldo_atual NUMERIC;
  v_stake_increase NUMERIC;
  v_target_bk UUID;
BEGIN
  -- 1. Buscar perna
  SELECT ap.id, ap.aposta_id, ap.bookmaker_id, ap.stake, ap.odd, ap.moeda,
         ap.resultado, ap.fonte_saldo,
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
  v_eff_stake := COALESCE(p_new_stake, v_old_stake);
  v_eff_odd := COALESCE(p_new_odd, v_old_odd);
  v_resultado := v_perna.resultado;
  v_moeda := v_perna.moeda;
  v_user_id := v_perna.user_id;

  -- ============================================================
  -- VALIDAÇÃO DE SALDO: se stake aumenta, verificar disponível
  -- ============================================================
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

  -- Contador de edições para idempotency key única
  SELECT COUNT(*) INTO v_edit_count
  FROM financial_events
  WHERE aposta_id = v_surebet_id
    AND idempotency_key LIKE 'edit_perna_' || p_perna_id || '_%';

  -- ============================================================
  -- A) BOOKMAKER CHANGE
  -- ============================================================
  IF p_new_bookmaker_id IS NOT NULL AND p_new_bookmaker_id != v_old_bk THEN
    -- A1. Reverse stake on old bookmaker (credit back)
    INSERT INTO financial_events (id, bookmaker_id, aposta_id, workspace_id, user_id, tipo_evento, tipo_uso, origem, valor, moeda, idempotency_key, descricao, processed_at)
    VALUES (gen_random_uuid(), v_old_bk, v_surebet_id, v_ws, v_user_id, 'REVERSAL', 'NORMAL', 'REVERSAL', v_old_stake, v_moeda,
            'edit_perna_' || p_perna_id || '_bk_rev_stake_n' || v_edit_count,
            format('Reversão stake (mudança bookmaker): %s', v_old_stake), now());
    
    -- A2. Create stake on new bookmaker (debit)
    INSERT INTO financial_events (id, bookmaker_id, aposta_id, workspace_id, user_id, tipo_evento, tipo_uso, origem, valor, moeda, idempotency_key, descricao, processed_at)
    VALUES (gen_random_uuid(), p_new_bookmaker_id, v_surebet_id, v_ws, v_user_id, 'STAKE', 'NORMAL', 'APOSTA', -v_eff_stake, v_moeda,
            'edit_perna_' || p_perna_id || '_bk_new_stake_n' || v_edit_count,
            format('Stake em novo bookmaker: %s', v_eff_stake), now());
    
    -- A3. If liquidated with payout, move payout
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
        INSERT INTO financial_events (id, bookmaker_id, aposta_id, workspace_id, user_id, tipo_evento, tipo_uso, origem, valor, moeda, idempotency_key, descricao, processed_at)
        VALUES (gen_random_uuid(), v_old_bk, v_surebet_id, v_ws, v_user_id, 'REVERSAL', 'NORMAL', 'REVERSAL', -v_old_payout, v_moeda,
                'edit_perna_' || p_perna_id || '_bk_rev_payout_n' || v_edit_count,
                'Reversão payout (mudança bookmaker)', now());
      END IF;
      
      IF v_new_payout > 0 THEN
        INSERT INTO financial_events (id, bookmaker_id, aposta_id, workspace_id, user_id, tipo_evento, tipo_uso, origem, valor, moeda, idempotency_key, descricao, processed_at)
        VALUES (gen_random_uuid(), p_new_bookmaker_id, v_surebet_id, v_ws, v_user_id, 'PAYOUT', 'NORMAL', 'LUCRO', v_new_payout, v_moeda,
                'edit_perna_' || p_perna_id || '_bk_new_payout_n' || v_edit_count,
                'Payout em novo bookmaker', now());
      END IF;
    END IF;
  ELSE
    -- ============================================================
    -- B) SAME BOOKMAKER: AJUSTE events
    -- ============================================================
    
    -- B1. Stake change
    IF p_new_stake IS NOT NULL AND p_new_stake != v_old_stake THEN
      v_stake_diff := p_new_stake - v_old_stake;
      INSERT INTO financial_events (id, bookmaker_id, aposta_id, workspace_id, user_id, tipo_evento, tipo_uso, origem, valor, moeda, idempotency_key, descricao, processed_at)
      VALUES (gen_random_uuid(), v_old_bk, v_surebet_id, v_ws, v_user_id, 'AJUSTE', 'NORMAL', 'AJUSTE', -v_stake_diff, v_moeda,
              'edit_perna_' || p_perna_id || '_stake_' || v_old_stake || '_to_' || p_new_stake || '_n' || v_edit_count,
              format('Ajuste stake perna: %s → %s', v_old_stake, p_new_stake), now());
    END IF;
    
    -- B2. Payout change on liquidated perna
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
        INSERT INTO financial_events (id, bookmaker_id, aposta_id, workspace_id, user_id, tipo_evento, tipo_uso, origem, valor, moeda, idempotency_key, descricao, processed_at)
        VALUES (gen_random_uuid(), v_old_bk, v_surebet_id, v_ws, v_user_id, 'AJUSTE', 'NORMAL', 'AJUSTE', v_payout_diff, v_moeda,
                'edit_perna_' || p_perna_id || '_payout_' || v_old_odd || '_to_' || v_eff_odd || '_n' || v_edit_count,
                format('Ajuste payout (odd %s→%s): %s → %s', v_old_odd, v_eff_odd, v_old_payout, v_new_payout), now());
      END IF;
    END IF;
  END IF;
  
  -- C) UPDATE PERNA
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
  
  -- D) RECALCULATE PARENT
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
    'new_odd', v_eff_odd,
    'saldo_validado', true
  );
END;
$$;

-- ==========================================================
-- RPC: deletar_perna_surebet_v1
-- Deleta uma perna individual com reversal completo
-- ==========================================================
CREATE OR REPLACE FUNCTION public.deletar_perna_surebet_v1(
  p_perna_id UUID
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_perna RECORD;
  v_surebet_id UUID;
  v_ws UUID;
  v_user_id UUID;
  v_bk_id UUID;
  v_moeda TEXT;
  v_stake NUMERIC;
  v_odd NUMERIC;
  v_resultado TEXT;
  v_payout NUMERIC := 0;
  v_del_count INT;
  v_remaining_legs INT;
BEGIN
  -- 1. Buscar perna com dados completos
  SELECT ap.id, ap.aposta_id, ap.bookmaker_id, ap.stake, ap.odd, ap.moeda,
         ap.resultado, au.workspace_id, au.user_id
  INTO v_perna
  FROM apostas_pernas ap
  JOIN apostas_unificada au ON au.id = ap.aposta_id
  WHERE ap.id = p_perna_id;
  
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Perna não encontrada');
  END IF;
  
  v_surebet_id := v_perna.aposta_id;
  v_ws := v_perna.workspace_id;
  v_user_id := v_perna.user_id;
  v_bk_id := v_perna.bookmaker_id;
  v_moeda := v_perna.moeda;
  v_stake := v_perna.stake;
  v_odd := v_perna.odd;
  v_resultado := v_perna.resultado;
  
  -- Contador para idempotency
  SELECT COUNT(*) INTO v_del_count
  FROM financial_events
  WHERE aposta_id = v_surebet_id
    AND idempotency_key LIKE 'del_perna_' || p_perna_id || '_%';
  
  -- 2. REVERSAL da stake (devolver ao bookmaker)
  INSERT INTO financial_events (id, bookmaker_id, aposta_id, workspace_id, user_id, tipo_evento, tipo_uso, origem, valor, moeda, idempotency_key, descricao, processed_at)
  VALUES (gen_random_uuid(), v_bk_id, v_surebet_id, v_ws, v_user_id, 'REVERSAL', 'NORMAL', 'REVERSAL', v_stake, v_moeda,
          'del_perna_' || p_perna_id || '_rev_stake_n' || v_del_count,
          format('Reversão stake (delete perna): %s', v_stake), now());
  
  -- 3. Se liquidada com payout, reverter payout também
  IF v_resultado IS NOT NULL AND v_resultado NOT IN ('PENDENTE', 'RED') THEN
    v_payout := CASE v_resultado
      WHEN 'GREEN' THEN v_stake * v_odd
      WHEN 'MEIO_GREEN' THEN v_stake + (v_stake * (v_odd - 1) / 2)
      WHEN 'VOID' THEN v_stake
      WHEN 'MEIO_RED' THEN v_stake / 2
      ELSE 0
    END;
    
    IF v_payout > 0 THEN
      INSERT INTO financial_events (id, bookmaker_id, aposta_id, workspace_id, user_id, tipo_evento, tipo_uso, origem, valor, moeda, idempotency_key, descricao, processed_at)
      VALUES (gen_random_uuid(), v_bk_id, v_surebet_id, v_ws, v_user_id, 'REVERSAL', 'NORMAL', 'REVERSAL', -v_payout, v_moeda,
              'del_perna_' || p_perna_id || '_rev_payout_n' || v_del_count,
              format('Reversão payout (delete perna, %s): %s', v_resultado, v_payout), now());
    END IF;
  END IF;
  
  -- 4. Deletar a perna
  DELETE FROM apostas_pernas WHERE id = p_perna_id;
  
  -- 5. Contar pernas restantes
  SELECT COUNT(*) INTO v_remaining_legs
  FROM apostas_pernas WHERE aposta_id = v_surebet_id;
  
  -- 6. Recalcular parent ou deletar se não restam pernas
  IF v_remaining_legs = 0 THEN
    -- Sem pernas, cancelar a surebet inteira
    UPDATE apostas_unificada SET
      status = 'CANCELADA',
      stake_total = 0,
      lucro_prejuizo = 0,
      roi_real = 0,
      updated_at = now()
    WHERE id = v_surebet_id;
  ELSE
    -- Recalcular com pernas restantes
    UPDATE apostas_unificada SET
      stake_total = (SELECT COALESCE(SUM(stake), 0) FROM apostas_pernas WHERE aposta_id = v_surebet_id),
      lucro_prejuizo = CASE
        WHEN (SELECT bool_and(resultado IS NOT NULL AND resultado != 'PENDENTE') FROM apostas_pernas WHERE aposta_id = v_surebet_id)
        THEN (SELECT COALESCE(SUM(lucro_prejuizo), 0) FROM apostas_pernas WHERE aposta_id = v_surebet_id)
        ELSE NULL
      END,
      roi_real = CASE
        WHEN (SELECT bool_and(resultado IS NOT NULL AND resultado != 'PENDENTE') FROM apostas_pernas WHERE aposta_id = v_surebet_id)
             AND (SELECT COALESCE(SUM(stake), 0) FROM apostas_pernas WHERE aposta_id = v_surebet_id) > 0
        THEN ((SELECT COALESCE(SUM(lucro_prejuizo), 0) FROM apostas_pernas WHERE aposta_id = v_surebet_id)::NUMERIC
              / (SELECT COALESCE(SUM(stake), 0) FROM apostas_pernas WHERE aposta_id = v_surebet_id)) * 100
        ELSE NULL
      END,
      updated_at = now()
    WHERE id = v_surebet_id;
  END IF;
  
  RETURN jsonb_build_object(
    'success', true,
    'perna_id', p_perna_id,
    'surebet_id', v_surebet_id,
    'stake_revertida', v_stake,
    'payout_revertido', v_payout,
    'pernas_restantes', v_remaining_legs
  );
END;
$$;
