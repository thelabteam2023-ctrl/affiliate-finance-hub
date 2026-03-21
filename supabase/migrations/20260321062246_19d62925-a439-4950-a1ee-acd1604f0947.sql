
CREATE OR REPLACE FUNCTION reprocessar_ledger_workspace(p_workspace_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_bookmaker RECORD;
    v_ledger RECORD;
    v_processed_count INT := 0;
    v_bookmaker_count INT := 0;
    v_events_created INT := 0;
    v_events_deleted INT := 0;
BEGIN
    UPDATE bookmakers 
    SET saldo_atual = 0,
        saldo_freebet = 0,
        updated_at = NOW()
    WHERE workspace_id = p_workspace_id;
    
    GET DIAGNOSTICS v_bookmaker_count = ROW_COUNT;
    
    DELETE FROM financial_events 
    WHERE workspace_id = p_workspace_id;
    
    GET DIAGNOSTICS v_events_deleted = ROW_COUNT;
    
    UPDATE cash_ledger 
    SET financial_events_generated = FALSE
    WHERE workspace_id = p_workspace_id;
    
    FOR v_ledger IN 
        SELECT * FROM cash_ledger 
        WHERE workspace_id = p_workspace_id 
          AND status = 'CONFIRMADO'
        ORDER BY data_transacao ASC, created_at ASC
    LOOP
        UPDATE cash_ledger 
        SET financial_events_generated = FALSE
        WHERE id = v_ledger.id;
        
        UPDATE cash_ledger 
        SET updated_at = NOW()
        WHERE id = v_ledger.id 
          AND status = 'CONFIRMADO';
        
        v_processed_count := v_processed_count + 1;
    END LOOP;
    
    SELECT COUNT(*) INTO v_events_created
    FROM financial_events 
    WHERE workspace_id = p_workspace_id;
    
    UPDATE wallets_crypto wc
    SET balance_locked = COALESCE((
        SELECT SUM(COALESCE(cl.valor_origem, cl.valor))
        FROM cash_ledger cl
        WHERE cl.origem_wallet_id = wc.id
          AND cl.status = 'PENDENTE'
          AND cl.workspace_id = p_workspace_id
    ), 0),
    balance_locked_updated_at = NOW()
    FROM parceiros p
    WHERE wc.parceiro_id = p.id
      AND p.workspace_id = p_workspace_id;
    
    RETURN jsonb_build_object(
        'success', TRUE,
        'workspace_id', p_workspace_id,
        'bookmakers_reset', v_bookmaker_count,
        'events_deleted', v_events_deleted,
        'ledger_entries_processed', v_processed_count,
        'financial_events_created', v_events_created,
        'processed_at', NOW()
    );
END;
$$;
