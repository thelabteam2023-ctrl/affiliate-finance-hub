-- ================================================================
-- CORREÇÃO CRÍTICA: Adicionar suporte a CASHBACK_MANUAL e CASHBACK_ESTORNO
-- no trigger fn_cash_ledger_generate_financial_events
-- 
-- PROBLEMA: O trigger atual NÃO processa esses tipos de transação,
-- resultando em cashbacks que não atualizam o saldo operável.
-- ================================================================

CREATE OR REPLACE FUNCTION public.fn_cash_ledger_generate_financial_events()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
DECLARE
    v_bookmaker_record RECORD;
    v_idempotency_key TEXT;
    v_valor_efetivo NUMERIC;
BEGIN
    -- Skip processed or invalid statuses
    IF NEW.status IN ('DUPLICADO_CORRIGIDO', 'DUPLICADO_BLOQUEADO', 'CANCELADO', 'FAILED') THEN
        RETURN NEW;
    END IF;
    IF NEW.status != 'CONFIRMADO' THEN RETURN NEW; END IF;
    IF NEW.financial_events_generated = TRUE THEN RETURN NEW; END IF;

    -- ==============================================================
    -- DEPOSITO: Crédito na bookmaker de destino
    -- ==============================================================
    IF NEW.tipo_transacao = 'DEPOSITO' AND NEW.destino_bookmaker_id IS NOT NULL THEN
        v_idempotency_key := 'ledger_deposit_' || NEW.id::TEXT;
        IF NOT EXISTS (SELECT 1 FROM financial_events WHERE idempotency_key = v_idempotency_key) THEN
            SELECT moeda INTO v_bookmaker_record FROM bookmakers WHERE id = NEW.destino_bookmaker_id;
            v_valor_efetivo := COALESCE(NEW.valor_destino, NEW.valor);
            INSERT INTO financial_events (bookmaker_id, workspace_id, tipo_evento, tipo_uso, origem, valor, moeda, idempotency_key, descricao, metadata, processed_at, created_by)
            VALUES (NEW.destino_bookmaker_id, NEW.workspace_id, 'DEPOSITO', 'NORMAL', 'DEPOSITO', v_valor_efetivo, COALESCE(v_bookmaker_record.moeda, NEW.moeda), v_idempotency_key, 'Depósito via cash_ledger #' || NEW.id::TEXT, jsonb_build_object('ledger_id', NEW.id), NOW(), NEW.user_id);
        END IF;
    END IF;

    -- ==============================================================
    -- SAQUE: Débito na bookmaker de origem (valor negativo)
    -- ==============================================================
    IF NEW.tipo_transacao = 'SAQUE' AND NEW.origem_bookmaker_id IS NOT NULL THEN
        v_idempotency_key := 'ledger_withdraw_' || NEW.id::TEXT;
        IF NOT EXISTS (SELECT 1 FROM financial_events WHERE idempotency_key = v_idempotency_key) THEN
            SELECT moeda INTO v_bookmaker_record FROM bookmakers WHERE id = NEW.origem_bookmaker_id;
            v_valor_efetivo := COALESCE(NEW.valor_origem, NEW.valor);
            INSERT INTO financial_events (bookmaker_id, workspace_id, tipo_evento, tipo_uso, origem, valor, moeda, idempotency_key, descricao, metadata, processed_at, created_by)
            VALUES (NEW.origem_bookmaker_id, NEW.workspace_id, 'SAQUE', 'NORMAL', NULL, -v_valor_efetivo, COALESCE(v_bookmaker_record.moeda, NEW.moeda), v_idempotency_key, 'Saque via cash_ledger #' || NEW.id::TEXT, jsonb_build_object('ledger_id', NEW.id), NOW(), NEW.user_id);
        END IF;
    END IF;

    -- ==============================================================
    -- BONUS_CREDITADO: Crédito na bookmaker de destino
    -- ==============================================================
    IF NEW.tipo_transacao = 'BONUS_CREDITADO' AND NEW.destino_bookmaker_id IS NOT NULL THEN
        v_idempotency_key := 'ledger_bonus_' || NEW.id::TEXT;
        IF NOT EXISTS (SELECT 1 FROM financial_events WHERE idempotency_key = v_idempotency_key) THEN
            SELECT moeda INTO v_bookmaker_record FROM bookmakers WHERE id = NEW.destino_bookmaker_id;
            v_valor_efetivo := COALESCE(NEW.valor_destino, NEW.valor);
            INSERT INTO financial_events (bookmaker_id, workspace_id, tipo_evento, tipo_uso, origem, valor, moeda, idempotency_key, descricao, metadata, processed_at, created_by)
            VALUES (NEW.destino_bookmaker_id, NEW.workspace_id, 'BONUS', 'NORMAL', 'BONUS_CREDITADO', v_valor_efetivo, COALESCE(v_bookmaker_record.moeda, NEW.moeda), v_idempotency_key, COALESCE(NEW.descricao, 'Bônus via cash_ledger'), jsonb_build_object('ledger_id', NEW.id), NOW(), NEW.user_id);
        END IF;
    END IF;

    -- ==============================================================
    -- CASHBACK_MANUAL: Crédito na bookmaker de destino (NOVA IMPLEMENTAÇÃO)
    -- Cashback é lucro operacional que AUMENTA o saldo da casa
    -- ==============================================================
    IF NEW.tipo_transacao = 'CASHBACK_MANUAL' AND NEW.destino_bookmaker_id IS NOT NULL THEN
        v_idempotency_key := 'ledger_cashback_' || NEW.id::TEXT;
        IF NOT EXISTS (SELECT 1 FROM financial_events WHERE idempotency_key = v_idempotency_key) THEN
            SELECT moeda INTO v_bookmaker_record FROM bookmakers WHERE id = NEW.destino_bookmaker_id;
            v_valor_efetivo := COALESCE(NEW.valor_destino, NEW.valor);
            INSERT INTO financial_events (bookmaker_id, workspace_id, tipo_evento, tipo_uso, origem, valor, moeda, idempotency_key, descricao, metadata, processed_at, created_by)
            VALUES (
                NEW.destino_bookmaker_id, 
                NEW.workspace_id, 
                'CASHBACK',  -- tipo_evento: CASHBACK é reconhecido pelo fn_financial_events_sync_balance como CRÉDITO
                'NORMAL', 
                'CASHBACK_MANUAL', 
                v_valor_efetivo,  -- valor POSITIVO = crédito
                COALESCE(v_bookmaker_record.moeda, NEW.moeda), 
                v_idempotency_key, 
                COALESCE(NEW.descricao, 'Cashback via cash_ledger'), 
                jsonb_build_object('ledger_id', NEW.id), 
                NOW(), 
                NEW.user_id
            );
        END IF;
    END IF;

    -- ==============================================================
    -- CASHBACK_ESTORNO: Débito na bookmaker de origem (NOVA IMPLEMENTAÇÃO)
    -- Estorno REVERTE o cashback, diminuindo o saldo da casa
    -- ==============================================================
    IF NEW.tipo_transacao = 'CASHBACK_ESTORNO' AND NEW.origem_bookmaker_id IS NOT NULL THEN
        v_idempotency_key := 'ledger_cashback_estorno_' || NEW.id::TEXT;
        IF NOT EXISTS (SELECT 1 FROM financial_events WHERE idempotency_key = v_idempotency_key) THEN
            SELECT moeda INTO v_bookmaker_record FROM bookmakers WHERE id = NEW.origem_bookmaker_id;
            v_valor_efetivo := COALESCE(NEW.valor_origem, NEW.valor);
            INSERT INTO financial_events (bookmaker_id, workspace_id, tipo_evento, tipo_uso, origem, valor, moeda, idempotency_key, descricao, metadata, processed_at, created_by)
            VALUES (
                NEW.origem_bookmaker_id, 
                NEW.workspace_id, 
                'REVERSAL',  -- tipo_evento: REVERSAL é reconhecido como valor direto (já vem negativo)
                'NORMAL', 
                'CASHBACK_ESTORNO', 
                -v_valor_efetivo,  -- valor NEGATIVO = débito/estorno
                COALESCE(v_bookmaker_record.moeda, NEW.moeda), 
                v_idempotency_key, 
                COALESCE(NEW.descricao, 'Estorno de cashback via cash_ledger'), 
                jsonb_build_object('ledger_id', NEW.id, 'tipo_original', 'CASHBACK'), 
                NOW(), 
                NEW.user_id
            );
        END IF;
    END IF;

    -- ==============================================================
    -- GIRO_GRATIS_ESTORNO: Débito na bookmaker de origem
    -- Estorno de giro grátis diminui o saldo da casa
    -- ==============================================================
    IF NEW.tipo_transacao = 'GIRO_GRATIS_ESTORNO' AND NEW.origem_bookmaker_id IS NOT NULL THEN
        v_idempotency_key := 'ledger_giro_estorno_' || NEW.id::TEXT;
        IF NOT EXISTS (SELECT 1 FROM financial_events WHERE idempotency_key = v_idempotency_key) THEN
            SELECT moeda INTO v_bookmaker_record FROM bookmakers WHERE id = NEW.origem_bookmaker_id;
            v_valor_efetivo := COALESCE(NEW.valor_origem, NEW.valor);
            INSERT INTO financial_events (bookmaker_id, workspace_id, tipo_evento, tipo_uso, origem, valor, moeda, idempotency_key, descricao, metadata, processed_at, created_by)
            VALUES (
                NEW.origem_bookmaker_id, 
                NEW.workspace_id, 
                'REVERSAL',
                'NORMAL', 
                'GIRO_GRATIS_ESTORNO', 
                -v_valor_efetivo,
                COALESCE(v_bookmaker_record.moeda, NEW.moeda), 
                v_idempotency_key, 
                COALESCE(NEW.descricao, 'Estorno de giro grátis via cash_ledger'), 
                jsonb_build_object('ledger_id', NEW.id, 'tipo_original', 'GIRO_GRATIS'), 
                NOW(), 
                NEW.user_id
            );
        END IF;
    END IF;

    -- ==============================================================
    -- BONUS_ESTORNO: Débito na bookmaker de origem
    -- Estorno de bônus diminui o saldo da casa
    -- ==============================================================
    IF NEW.tipo_transacao = 'BONUS_ESTORNO' AND NEW.origem_bookmaker_id IS NOT NULL THEN
        v_idempotency_key := 'ledger_bonus_estorno_' || NEW.id::TEXT;
        IF NOT EXISTS (SELECT 1 FROM financial_events WHERE idempotency_key = v_idempotency_key) THEN
            SELECT moeda INTO v_bookmaker_record FROM bookmakers WHERE id = NEW.origem_bookmaker_id;
            v_valor_efetivo := COALESCE(NEW.valor_origem, NEW.valor);
            INSERT INTO financial_events (bookmaker_id, workspace_id, tipo_evento, tipo_uso, origem, valor, moeda, idempotency_key, descricao, metadata, processed_at, created_by)
            VALUES (
                NEW.origem_bookmaker_id, 
                NEW.workspace_id, 
                'REVERSAL',
                'NORMAL', 
                'BONUS_ESTORNO', 
                -v_valor_efetivo,
                COALESCE(v_bookmaker_record.moeda, NEW.moeda), 
                v_idempotency_key, 
                COALESCE(NEW.descricao, 'Estorno de bônus via cash_ledger'), 
                jsonb_build_object('ledger_id', NEW.id, 'tipo_original', 'BONUS'), 
                NOW(), 
                NEW.user_id
            );
        END IF;
    END IF;

    NEW.financial_events_generated := TRUE;
    RETURN NEW;
END;
$function$;

-- Comentário explicativo
COMMENT ON FUNCTION fn_cash_ledger_generate_financial_events() IS 
'Trigger que gera financial_events a partir de cash_ledger. 
Suporta: DEPOSITO, SAQUE, BONUS_CREDITADO, BONUS_ESTORNO, 
CASHBACK_MANUAL, CASHBACK_ESTORNO, GIRO_GRATIS_ESTORNO.
Versão atualizada em 2026-02-05 para corrigir bug de estorno de cashback.';