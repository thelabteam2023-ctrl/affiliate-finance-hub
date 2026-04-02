
DO $$
DECLARE
    r RECORD;
    v_reversal_key TEXT;
BEGIN
    FOR r IN 
        SELECT ev.id, ev.bookmaker_id, ev.workspace_id, ev.valor, ev.moeda, ev.tipo_evento, ev.idempotency_key, ev.created_by
        FROM financial_events ev
        JOIN cash_ledger cl ON cl.id = (ev.metadata->>'ledger_id')::uuid
        WHERE cl.tipo_transacao IN ('SAQUE_VIRTUAL', 'DEPOSITO_VIRTUAL')
        AND NOT EXISTS (
            SELECT 1 FROM financial_events rev 
            WHERE rev.idempotency_key = 'reversal_virtual_' || ev.id::TEXT
        )
    LOOP
        v_reversal_key := 'reversal_virtual_' || r.id::TEXT;
        INSERT INTO financial_events (
            bookmaker_id, workspace_id, tipo_evento, tipo_uso, origem, 
            valor, moeda, idempotency_key, descricao, metadata, processed_at, created_by
        ) VALUES (
            r.bookmaker_id,
            r.workspace_id,
            'REVERSAL',
            'NORMAL',
            'CORRECAO_VIRTUAL',
            -r.valor,
            r.moeda,
            v_reversal_key,
            'Correção: reversão de evento virtual indevido (original: ' || r.id::TEXT || ')',
            jsonb_build_object('original_event_id', r.id, 'reason', 'virtual_no_balance_impact'),
            NOW(),
            r.created_by
        );
    END LOOP;
END $$;
