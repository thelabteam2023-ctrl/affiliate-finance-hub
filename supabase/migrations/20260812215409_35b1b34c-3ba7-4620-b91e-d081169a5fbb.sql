-- ====================================================================
-- REGULARIZAÇÃO DE SALDO: SMAN 365 (Lucas Pereira)
-- ====================================================================

DO $$
DECLARE
    v_bookmaker_id UUID := '50808c70-f697-4a5d-9812-b04cd7a41225';
    v_workspace_id UUID;
    v_user_id UUID;
    v_moeda TEXT;
    v_valor_perda NUMERIC := 1422.44;
    v_ledger_id UUID;
BEGIN
    -- 1) Buscar dados da bookmaker
    SELECT workspace_id, moeda INTO v_workspace_id, v_moeda FROM bookmakers WHERE id = v_bookmaker_id;
    
    -- 2) Identificar o ledger original (criado na resolução da ocorrência)
    -- Usando o ID que já sabemos ser o correto para evitar erros de coluna
    v_ledger_id := '521b5cca-efd9-4d0b-bd8e-acc3e989b2fd';
    SELECT user_id INTO v_user_id FROM cash_ledger WHERE id = v_ledger_id;

    -- 3) Forçar a geração do evento financeiro para este ledger específico
    -- Usando idempotency_key 'ledger_loss_' para alinhar com o novo trigger
    IF NOT EXISTS (SELECT 1 FROM financial_events WHERE idempotency_key = 'ledger_loss_' || v_ledger_id::TEXT) THEN
        INSERT INTO financial_events (
            bookmaker_id, workspace_id, tipo_evento, tipo_uso, origem,
            valor, moeda, idempotency_key, descricao, metadata, processed_at, created_by, event_scope
        ) VALUES (
            v_bookmaker_id, v_workspace_id,
            'LOSS', 'NORMAL', 'AJUSTE',
            -v_valor_perda, v_moeda,
            'ledger_loss_' || v_ledger_id::TEXT,
            'Regularização Financeira: Débito de Perda Operacional (Ocorrência 9ae8e437)',
            jsonb_build_object('ledger_id', v_ledger_id, 'ocorrencia_id', '9ae8e437-006e-40e2-ae43-993e09fb7e52'),
            NOW(), v_user_id, 'REAL'::public.event_scope
        );
        
        UPDATE cash_ledger SET financial_events_generated = TRUE WHERE id = v_ledger_id;
        
        RAISE NOTICE 'Saldo da bookmaker SMAN 365 regularizado com sucesso (-%).', v_valor_perda;
    ELSE
        RAISE NOTICE 'O evento financeiro para este ledger já existe.';
    END IF;
END $$;
