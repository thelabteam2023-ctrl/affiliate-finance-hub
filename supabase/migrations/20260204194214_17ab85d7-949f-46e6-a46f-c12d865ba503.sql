-- CORREÇÃO: Bug de duplicação de saldo em SAQUE
-- Causa: fn_cash_ledger_generate_financial_events inseria SAQUE com valor POSITIVO
-- O trigger fn_financial_events_sync_balance espera valor NEGATIVO para débitos

CREATE OR REPLACE FUNCTION public.fn_cash_ledger_generate_financial_events()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
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

    -- SAQUE (valor NEGATIVO - débito) - CORREÇÃO APLICADA!
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
                -v_valor_efetivo,  -- NEGATIVO (débito) - BUG CORRIGIDO!
                COALESCE(v_bookmaker_record.moeda, NEW.moeda),
                v_idempotency_key,
                'Saque via cash_ledger #' || NEW.id::TEXT,
                jsonb_build_object('ledger_id', NEW.id),
                NOW(), NEW.user_id
            );
        END IF;
    END IF;

    NEW.financial_events_generated := TRUE;
    RETURN NEW;
END;
$function$;

-- CORREÇÃO DO SALDO BETVIP
-- Reverter o evento corrompido criando um REVERSAL
DO $$
DECLARE
    v_evento_corrompido RECORD;
BEGIN
    -- Identificar o evento de saque corrompido (BETVIP com valor positivo)
    SELECT fe.* INTO v_evento_corrompido
    FROM financial_events fe
    JOIN bookmakers b ON b.id = fe.bookmaker_id
    WHERE b.nome ILIKE '%betvip%'
      AND fe.tipo_evento = 'SAQUE'
      AND fe.valor > 0
      AND fe.created_at >= '2026-02-02'
    ORDER BY fe.created_at DESC
    LIMIT 1;
    
    IF v_evento_corrompido IS NOT NULL THEN
        -- Criar evento de reversão para anular o crédito indevido
        INSERT INTO financial_events (
            bookmaker_id, workspace_id, tipo_evento, tipo_uso,
            valor, moeda, idempotency_key, descricao, 
            reversed_event_id, processed_at, created_by
        ) VALUES (
            v_evento_corrompido.bookmaker_id,
            v_evento_corrompido.workspace_id,
            'REVERSAL', 'NORMAL',
            -v_evento_corrompido.valor,
            v_evento_corrompido.moeda,
            'reversal_fix_' || v_evento_corrompido.id::TEXT,
            'Correção: Reversão de saque com sinal incorreto',
            v_evento_corrompido.id,
            NOW(),
            v_evento_corrompido.created_by
        );
        
        -- Criar o evento correto de saque (negativo)
        INSERT INTO financial_events (
            bookmaker_id, workspace_id, tipo_evento, tipo_uso,
            valor, moeda, idempotency_key, descricao, processed_at, created_by
        ) VALUES (
            v_evento_corrompido.bookmaker_id,
            v_evento_corrompido.workspace_id,
            'SAQUE', 'NORMAL',
            -v_evento_corrompido.valor,
            v_evento_corrompido.moeda,
            'corrected_withdraw_' || v_evento_corrompido.id::TEXT,
            'Correção: Saque com sinal correto',
            NOW(),
            v_evento_corrompido.created_by
        );
        
        RAISE NOTICE 'Evento corrompido corrigido: % | Valor original: % | Novo valor: %', 
            v_evento_corrompido.id, v_evento_corrompido.valor, -v_evento_corrompido.valor;
    ELSE
        RAISE NOTICE 'Nenhum evento corrompido encontrado para BETVIP';
    END IF;
END $$;