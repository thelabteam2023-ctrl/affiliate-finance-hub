
-- Create function to regenerate bet financial events for a workspace
-- This handles: SIMPLES, MULTIPLA (from apostas_unificada) and ARBITRAGEM pernas (from apostas_pernas)
CREATE OR REPLACE FUNCTION public.regenerar_eventos_apostas_workspace(p_workspace_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_bet RECORD;
  v_perna RECORD;
  v_created INT := 0;
  v_skipped INT := 0;
  v_stake_val NUMERIC;
  v_payout_val NUMERIC;
  v_tipo_uso TEXT;
  v_idem_key TEXT;
BEGIN
  -- Process SIMPLES and MULTIPLA bets (non-arbitrage, non-multicurrency)
  FOR v_bet IN
    SELECT a.id, a.bookmaker_id, a.stake, a.odd, a.resultado, a.forma_registro,
           a.fonte_saldo, a.moeda_operacao, a.usar_freebet, a.is_multicurrency,
           a.workspace_id, a.user_id
    FROM apostas_unificada a
    WHERE a.workspace_id = p_workspace_id
      AND a.cancelled_at IS NULL
      AND a.status = 'LIQUIDADA'
      AND a.bookmaker_id IS NOT NULL
      AND a.resultado IS NOT NULL
      AND a.resultado != 'PENDENTE'
      AND a.forma_registro != 'ARBITRAGEM'
      AND (a.is_multicurrency IS NULL OR a.is_multicurrency = false)
  LOOP
    v_tipo_uso := CASE WHEN v_bet.usar_freebet = true OR v_bet.fonte_saldo = 'FREEBET' THEN 'FREEBET' ELSE 'NORMAL' END;
    
    -- STAKE event
    v_idem_key := 'stake_' || v_bet.id;
    IF NOT EXISTS (SELECT 1 FROM financial_events WHERE idempotency_key = v_idem_key) THEN
      INSERT INTO financial_events (bookmaker_id, aposta_id, workspace_id, tipo_evento, tipo_uso, valor, moeda, idempotency_key, descricao, created_by, created_at)
      VALUES (v_bet.bookmaker_id, v_bet.id, v_bet.workspace_id, 'STAKE', v_tipo_uso, -v_bet.stake, v_bet.moeda_operacao,
              v_idem_key, 'Débito de stake (regenerado)', v_bet.user_id, NOW());
      v_created := v_created + 1;
    ELSE
      v_skipped := v_skipped + 1;
    END IF;
    
    -- PAYOUT/VOID event based on resultado
    IF v_bet.resultado IN ('GREEN', 'MEIO_GREEN', 'VOID', 'MEIO_RED') THEN
      v_idem_key := 'payout_' || v_bet.id || '_' || v_bet.resultado;
      
      IF NOT EXISTS (SELECT 1 FROM financial_events WHERE idempotency_key = v_idem_key) THEN
        v_payout_val := CASE v_bet.resultado
          WHEN 'GREEN' THEN v_bet.stake * v_bet.odd
          WHEN 'MEIO_GREEN' THEN v_bet.stake * (1 + (v_bet.odd - 1) / 2)
          WHEN 'VOID' THEN v_bet.stake
          WHEN 'MEIO_RED' THEN v_bet.stake / 2
        END;
        
        INSERT INTO financial_events (bookmaker_id, aposta_id, workspace_id, tipo_evento, tipo_uso, origem, valor, moeda, idempotency_key, descricao, created_by, created_at)
        VALUES (v_bet.bookmaker_id, v_bet.id, v_bet.workspace_id,
                CASE WHEN v_bet.resultado = 'VOID' THEN 'VOID_REFUND' ELSE 'PAYOUT' END,
                v_tipo_uso, 'LUCRO',
                ROUND(v_payout_val, 2),
                v_bet.moeda_operacao,
                v_idem_key,
                CASE v_bet.resultado
                  WHEN 'GREEN' THEN format('Payout GREEN: %s (odd=%s)', ROUND(v_payout_val, 2), v_bet.odd)
                  WHEN 'MEIO_GREEN' THEN format('Payout MEIO_GREEN: %s', ROUND(v_payout_val, 2))
                  WHEN 'VOID' THEN format('Payout VOID: %s', v_bet.stake)
                  WHEN 'MEIO_RED' THEN format('Payout MEIO_RED: %s', ROUND(v_payout_val, 2))
                END,
                v_bet.user_id, NOW());
        v_created := v_created + 1;
      ELSE
        v_skipped := v_skipped + 1;
      END IF;
    END IF;
    -- RED: no payout event needed (stake is lost)
  END LOOP;

  -- Process ARBITRAGEM pernas (surebet legs)
  FOR v_perna IN
    SELECT ap.id as perna_id, ap.aposta_id, ap.bookmaker_id, ap.stake, ap.odd, ap.resultado,
           ap.moeda, ap.fonte_saldo,
           au.workspace_id, au.user_id
    FROM apostas_pernas ap
    JOIN apostas_unificada au ON au.id = ap.aposta_id
    WHERE au.workspace_id = p_workspace_id
      AND au.cancelled_at IS NULL
      AND au.status = 'LIQUIDADA'
      AND ap.resultado IS NOT NULL
      AND ap.resultado != 'PENDENTE'
      AND (au.forma_registro = 'ARBITRAGEM' OR au.is_multicurrency = true)
  LOOP
    v_tipo_uso := CASE WHEN v_perna.fonte_saldo = 'FREEBET' THEN 'FREEBET' ELSE 'NORMAL' END;
    
    -- STAKE event for perna
    v_idem_key := 'stake_' || v_perna.aposta_id || '_leg_' || v_perna.perna_id;
    IF NOT EXISTS (SELECT 1 FROM financial_events WHERE idempotency_key = v_idem_key) THEN
      -- Also check old format without _leg_ suffix
      IF NOT EXISTS (SELECT 1 FROM financial_events WHERE idempotency_key = 'stake_' || v_perna.aposta_id AND bookmaker_id = v_perna.bookmaker_id) THEN
        INSERT INTO financial_events (bookmaker_id, aposta_id, workspace_id, tipo_evento, tipo_uso, valor, moeda, idempotency_key, descricao, created_by, created_at)
        VALUES (v_perna.bookmaker_id, v_perna.aposta_id, v_perna.workspace_id, 'STAKE', v_tipo_uso, -v_perna.stake, v_perna.moeda,
                v_idem_key, 'Débito de stake perna (regenerado)', v_perna.user_id, NOW());
        v_created := v_created + 1;
      ELSE
        v_skipped := v_skipped + 1;
      END IF;
    ELSE
      v_skipped := v_skipped + 1;
    END IF;
    
    -- PAYOUT for perna
    IF v_perna.resultado IN ('GREEN', 'MEIO_GREEN', 'VOID', 'MEIO_RED') THEN
      v_idem_key := 'payout_' || v_perna.aposta_id || '_leg_' || v_perna.perna_id || '_' || v_perna.resultado;
      IF NOT EXISTS (SELECT 1 FROM financial_events WHERE idempotency_key = v_idem_key) THEN
        v_payout_val := CASE v_perna.resultado
          WHEN 'GREEN' THEN v_perna.stake * v_perna.odd
          WHEN 'MEIO_GREEN' THEN v_perna.stake * (1 + (v_perna.odd - 1) / 2)
          WHEN 'VOID' THEN v_perna.stake
          WHEN 'MEIO_RED' THEN v_perna.stake / 2
        END;
        
        INSERT INTO financial_events (bookmaker_id, aposta_id, workspace_id, tipo_evento, tipo_uso, origem, valor, moeda, idempotency_key, descricao, created_by, created_at)
        VALUES (v_perna.bookmaker_id, v_perna.aposta_id, v_perna.workspace_id,
                CASE WHEN v_perna.resultado = 'VOID' THEN 'VOID_REFUND' ELSE 'PAYOUT' END,
                v_tipo_uso, 'LUCRO',
                ROUND(v_payout_val, 2),
                v_perna.moeda,
                v_idem_key,
                format('Payout %s perna: %s (regenerado)', v_perna.resultado, ROUND(v_payout_val, 2)),
                v_perna.user_id, NOW());
        v_created := v_created + 1;
      ELSE
        v_skipped := v_skipped + 1;
      END IF;
    END IF;
  END LOOP;

  RETURN jsonb_build_object(
    'success', true,
    'events_created', v_created,
    'events_skipped', v_skipped,
    'workspace_id', p_workspace_id
  );
END;
$$;

-- Also update reprocessar_ledger_workspace to include bet events regeneration
CREATE OR REPLACE FUNCTION public.reprocessar_ledger_workspace(p_workspace_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_ledger RECORD;
    v_processed_count INT := 0;
    v_bookmaker_count INT := 0;
    v_events_created INT := 0;
    v_events_deleted INT := 0;
    v_bet_result jsonb;
BEGIN
    -- 1. Reset all bookmaker balances
    UPDATE bookmakers 
    SET saldo_atual = 0, saldo_freebet = 0, updated_at = NOW()
    WHERE workspace_id = p_workspace_id;
    GET DIAGNOSTICS v_bookmaker_count = ROW_COUNT;
    
    -- 2. Delete ALL financial events (cash + bet)
    DELETE FROM financial_events WHERE workspace_id = p_workspace_id;
    GET DIAGNOSTICS v_events_deleted = ROW_COUNT;
    
    -- 3. Reset cash_ledger processing flags
    UPDATE cash_ledger 
    SET financial_events_generated = FALSE, balance_processed_at = NULL
    WHERE workspace_id = p_workspace_id;
    
    -- 4. Re-trigger cash_ledger events by touching each record
    FOR v_ledger IN 
        SELECT id FROM cash_ledger 
        WHERE workspace_id = p_workspace_id AND status = 'CONFIRMADO'
        ORDER BY data_transacao ASC, created_at ASC
    LOOP
        UPDATE cash_ledger SET updated_at = NOW() WHERE id = v_ledger.id;
        v_processed_count := v_processed_count + 1;
    END LOOP;
    
    -- 5. CRITICAL: Regenerate bet financial events (STAKE, PAYOUT, VOID_REFUND)
    v_bet_result := regenerar_eventos_apostas_workspace(p_workspace_id);
    
    SELECT COUNT(*) INTO v_events_created FROM financial_events WHERE workspace_id = p_workspace_id;
    
    -- 6. Update locked balances on crypto wallets
    UPDATE wallets_crypto wc
    SET balance_locked = COALESCE((
        SELECT SUM(COALESCE(cl.valor_origem, cl.valor))
        FROM cash_ledger cl
        WHERE cl.origem_wallet_id = wc.id AND cl.status = 'PENDENTE' AND cl.workspace_id = p_workspace_id
    ), 0), balance_locked_updated_at = NOW()
    FROM parceiros p
    WHERE wc.parceiro_id = p.id AND p.workspace_id = p_workspace_id;
    
    RETURN jsonb_build_object(
        'success', TRUE, 'workspace_id', p_workspace_id,
        'bookmakers_reset', v_bookmaker_count, 'events_deleted', v_events_deleted,
        'ledger_entries_processed', v_processed_count, 'financial_events_created', v_events_created,
        'bet_events', v_bet_result,
        'processed_at', NOW()
    );
END;
$$;
