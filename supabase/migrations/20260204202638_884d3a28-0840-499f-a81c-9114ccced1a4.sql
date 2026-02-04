
-- FIX: Corrigir bônus retroativos com tipo_uso = 'NORMAL' (não 'BONUS')
-- O trigger já foi atualizado, agora corrigir os dados pendentes

DO $$
DECLARE
    v_ledger RECORD;
BEGIN
    -- Buscar entradas de BONUS_CREDITADO confirmadas que não geraram eventos
    FOR v_ledger IN 
        SELECT cl.*, b.moeda as bookmaker_moeda
        FROM cash_ledger cl
        JOIN bookmakers b ON b.id = cl.destino_bookmaker_id
        WHERE cl.tipo_transacao = 'BONUS_CREDITADO'
          AND cl.status = 'CONFIRMADO'
          AND cl.destino_bookmaker_id IS NOT NULL
          AND (cl.financial_events_generated = FALSE OR cl.financial_events_generated IS NULL)
    LOOP
        -- Criar evento financeiro se não existe
        IF NOT EXISTS (
            SELECT 1 FROM financial_events 
            WHERE idempotency_key = 'ledger_bonus_' || v_ledger.id::TEXT
        ) THEN
            INSERT INTO financial_events (
                bookmaker_id, workspace_id, tipo_evento, tipo_uso, origem,
                valor, moeda, idempotency_key, descricao, metadata, processed_at, created_by
            ) VALUES (
                v_ledger.destino_bookmaker_id, 
                v_ledger.workspace_id,
                'BONUS',      -- tipo_evento = BONUS (válido)
                'NORMAL',     -- tipo_uso = NORMAL (não BONUS - inválido)
                'BONUS_CREDITADO',
                COALESCE(v_ledger.valor_destino, v_ledger.valor),
                COALESCE(v_ledger.bookmaker_moeda, v_ledger.moeda),
                'ledger_bonus_' || v_ledger.id::TEXT,
                COALESCE(v_ledger.descricao, 'Bônus creditado retroativo'),
                jsonb_build_object('ledger_id', v_ledger.id, 'retroativo', true),
                NOW(), 
                v_ledger.user_id
            );
            
            -- Marcar como processado
            UPDATE cash_ledger 
            SET financial_events_generated = TRUE 
            WHERE id = v_ledger.id;
        END IF;
    END LOOP;
END $$;

-- Atualizar o trigger para usar 'NORMAL' ao invés de 'BONUS' em tipo_uso
CREATE OR REPLACE FUNCTION public.fn_cash_ledger_generate_financial_events()
RETURNS TRIGGER AS $$
DECLARE
    v_bookmaker_record RECORD;
    v_idempotency_key TEXT;
    v_valor_efetivo NUMERIC;
BEGIN
    IF NEW.status != 'CONFIRMADO' THEN
        RETURN NEW;
    END IF;

    IF NEW.financial_events_generated = TRUE THEN
        RETURN NEW;
    END IF;

    -- DEPOSITO (valor POSITIVO - crédito)
    IF NEW.tipo_transacao = 'DEPOSITO' AND NEW.destino_bookmaker_id IS NOT NULL THEN
        v_idempotency_key := 'ledger_deposit_' || NEW.id::TEXT;
        IF NOT EXISTS (SELECT 1 FROM financial_events WHERE idempotency_key = v_idempotency_key) THEN
            SELECT moeda INTO v_bookmaker_record FROM bookmakers WHERE id = NEW.destino_bookmaker_id;
            v_valor_efetivo := COALESCE(NEW.valor_destino, NEW.valor);
            INSERT INTO financial_events (
                bookmaker_id, workspace_id, tipo_evento, tipo_uso, origem,
                valor, moeda, idempotency_key, descricao, metadata, processed_at, created_by
            ) VALUES (
                NEW.destino_bookmaker_id, NEW.workspace_id,
                'DEPOSITO', 'NORMAL', 'DEPOSITO',
                v_valor_efetivo,
                COALESCE(v_bookmaker_record.moeda, NEW.moeda),
                v_idempotency_key,
                'Depósito via cash_ledger #' || NEW.id::TEXT,
                jsonb_build_object('ledger_id', NEW.id),
                NOW(), NEW.user_id
            );
        END IF;
    END IF;

    -- SAQUE (valor NEGATIVO - débito)
    IF NEW.tipo_transacao = 'SAQUE' AND NEW.origem_bookmaker_id IS NOT NULL THEN
        v_idempotency_key := 'ledger_withdraw_' || NEW.id::TEXT;
        IF NOT EXISTS (SELECT 1 FROM financial_events WHERE idempotency_key = v_idempotency_key) THEN
            SELECT moeda INTO v_bookmaker_record FROM bookmakers WHERE id = NEW.origem_bookmaker_id;
            v_valor_efetivo := COALESCE(NEW.valor_origem, NEW.valor);
            INSERT INTO financial_events (
                bookmaker_id, workspace_id, tipo_evento, tipo_uso, origem,
                valor, moeda, idempotency_key, descricao, metadata, processed_at, created_by
            ) VALUES (
                NEW.origem_bookmaker_id, NEW.workspace_id,
                'SAQUE', 'NORMAL', NULL,
                -v_valor_efetivo,  -- NEGATIVO (débito)
                COALESCE(v_bookmaker_record.moeda, NEW.moeda),
                v_idempotency_key,
                'Saque via cash_ledger #' || NEW.id::TEXT,
                jsonb_build_object('ledger_id', NEW.id),
                NOW(), NEW.user_id
            );
        END IF;
    END IF;

    -- BONUS_CREDITADO (valor POSITIVO - crédito no saldo)
    IF NEW.tipo_transacao = 'BONUS_CREDITADO' AND NEW.destino_bookmaker_id IS NOT NULL THEN
        v_idempotency_key := 'ledger_bonus_' || NEW.id::TEXT;
        IF NOT EXISTS (SELECT 1 FROM financial_events WHERE idempotency_key = v_idempotency_key) THEN
            SELECT moeda INTO v_bookmaker_record FROM bookmakers WHERE id = NEW.destino_bookmaker_id;
            v_valor_efetivo := COALESCE(NEW.valor_destino, NEW.valor);
            INSERT INTO financial_events (
                bookmaker_id, workspace_id, tipo_evento, tipo_uso, origem,
                valor, moeda, idempotency_key, descricao, metadata, processed_at, created_by
            ) VALUES (
                NEW.destino_bookmaker_id, NEW.workspace_id,
                'BONUS', 'NORMAL', 'BONUS_CREDITADO',  -- tipo_uso = NORMAL
                v_valor_efetivo,  -- POSITIVO (crédito)
                COALESCE(v_bookmaker_record.moeda, NEW.moeda),
                v_idempotency_key,
                COALESCE(NEW.descricao, 'Bônus creditado via cash_ledger #' || NEW.id::TEXT),
                jsonb_build_object('ledger_id', NEW.id),
                NOW(), NEW.user_id
            );
        END IF;
    END IF;

    NEW.financial_events_generated := TRUE;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;
