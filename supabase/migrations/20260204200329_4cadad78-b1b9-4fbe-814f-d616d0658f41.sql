
-- CORREÇÃO MANUAL: BetVip saque com sinal errado
-- Evento corrompido: ledger_withdraw_8cb5ba2f-29aa-402b-8c8b-3681513e9411 (valor +3202.16)
-- Correção: criar REVERSAL + SAQUE correto

DO $$
DECLARE
    v_evento RECORD;
BEGIN
    -- Buscar o evento corrompido
    SELECT fe.*, b.workspace_id as ws_id 
    INTO v_evento
    FROM financial_events fe
    JOIN bookmakers b ON b.id = fe.bookmaker_id
    WHERE fe.idempotency_key = 'ledger_withdraw_8cb5ba2f-29aa-402b-8c8b-3681513e9411';
    
    IF v_evento IS NOT NULL THEN
        -- 1. REVERSAL para anular o crédito indevido (+3202.16 → 0)
        INSERT INTO financial_events (
            bookmaker_id, workspace_id, tipo_evento, tipo_uso,
            valor, moeda, idempotency_key, descricao, 
            reversed_event_id, processed_at, created_by
        ) VALUES (
            v_evento.bookmaker_id,
            v_evento.workspace_id,
            'REVERSAL', 'NORMAL',
            -v_evento.valor,  -- -3202.16 para anular o +3202.16
            v_evento.moeda,
            'reversal_fix_saque_betvip_' || v_evento.id::TEXT,
            'Correção: Reversão de saque com sinal incorreto (bug fix)',
            v_evento.id,
            NOW(),
            v_evento.created_by
        );
        
        -- 2. Novo SAQUE com valor CORRETO (negativo)
        INSERT INTO financial_events (
            bookmaker_id, workspace_id, tipo_evento, tipo_uso, origem,
            valor, moeda, idempotency_key, descricao, processed_at, created_by
        ) VALUES (
            v_evento.bookmaker_id,
            v_evento.workspace_id,
            'SAQUE', 'NORMAL', NULL,
            -v_evento.valor,  -- -3202.16 (débito correto)
            v_evento.moeda,
            'corrected_withdraw_betvip_' || v_evento.id::TEXT,
            'Correção: Saque com sinal correto (débito)',
            NOW(),
            v_evento.created_by
        );
        
        RAISE NOTICE 'Correção aplicada para BetVip: REVERSAL + SAQUE correto';
    ELSE
        RAISE NOTICE 'Evento não encontrado';
    END IF;
END $$;
