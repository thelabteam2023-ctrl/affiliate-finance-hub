
-- ============================================================
-- Fix: Use 'AJUSTE' (valid tipo_evento) instead of 'AJUSTE_MANUAL'
-- ============================================================
CREATE OR REPLACE FUNCTION public.fn_cash_ledger_generate_financial_events()
RETURNS TRIGGER AS $$
DECLARE
    v_bookmaker_record RECORD;
    v_idempotency_key TEXT;
    v_valor_efetivo NUMERIC;
BEGIN
    IF NEW.status IN ('DUPLICADO_CORRIGIDO', 'DUPLICADO_BLOQUEADO', 'CANCELADO', 'FAILED') THEN
        RETURN NEW;
    END IF;
    IF NEW.status != 'CONFIRMADO' THEN RETURN NEW; END IF;
    IF NEW.financial_events_generated = TRUE THEN RETURN NEW; END IF;

    -- DEPOSITO
    IF NEW.tipo_transacao = 'DEPOSITO' AND NEW.destino_bookmaker_id IS NOT NULL THEN
        v_idempotency_key := 'ledger_deposit_' || NEW.id::TEXT;
        IF NOT EXISTS (SELECT 1 FROM financial_events WHERE idempotency_key = v_idempotency_key) THEN
            SELECT moeda INTO v_bookmaker_record FROM bookmakers WHERE id = NEW.destino_bookmaker_id;
            v_valor_efetivo := COALESCE(NEW.valor_destino, NEW.valor);
            INSERT INTO financial_events (bookmaker_id, workspace_id, tipo_evento, tipo_uso, origem, valor, moeda, idempotency_key, descricao, metadata, processed_at, created_by)
            VALUES (NEW.destino_bookmaker_id, NEW.workspace_id, 'DEPOSITO', 'NORMAL', 'DEPOSITO', v_valor_efetivo, COALESCE(v_bookmaker_record.moeda, NEW.moeda), v_idempotency_key, 'Depósito via cash_ledger #' || NEW.id::TEXT, jsonb_build_object('ledger_id', NEW.id), NOW(), NEW.user_id);
        END IF;
    END IF;

    -- SAQUE
    IF NEW.tipo_transacao = 'SAQUE' AND NEW.origem_bookmaker_id IS NOT NULL THEN
        v_idempotency_key := 'ledger_withdraw_' || NEW.id::TEXT;
        IF NOT EXISTS (SELECT 1 FROM financial_events WHERE idempotency_key = v_idempotency_key) THEN
            SELECT moeda INTO v_bookmaker_record FROM bookmakers WHERE id = NEW.origem_bookmaker_id;
            v_valor_efetivo := COALESCE(NEW.valor_origem, NEW.valor);
            INSERT INTO financial_events (bookmaker_id, workspace_id, tipo_evento, tipo_uso, origem, valor, moeda, idempotency_key, descricao, metadata, processed_at, created_by)
            VALUES (NEW.origem_bookmaker_id, NEW.workspace_id, 'SAQUE', 'NORMAL', NULL, -v_valor_efetivo, COALESCE(v_bookmaker_record.moeda, NEW.moeda), v_idempotency_key, 'Saque via cash_ledger #' || NEW.id::TEXT, jsonb_build_object('ledger_id', NEW.id), NOW(), NEW.user_id);
        END IF;
    END IF;

    -- BONUS_CREDITADO
    IF NEW.tipo_transacao = 'BONUS_CREDITADO' AND NEW.destino_bookmaker_id IS NOT NULL THEN
        v_idempotency_key := 'ledger_bonus_' || NEW.id::TEXT;
        IF NOT EXISTS (SELECT 1 FROM financial_events WHERE idempotency_key = v_idempotency_key) THEN
            SELECT moeda INTO v_bookmaker_record FROM bookmakers WHERE id = NEW.destino_bookmaker_id;
            v_valor_efetivo := COALESCE(NEW.valor_destino, NEW.valor);
            INSERT INTO financial_events (bookmaker_id, workspace_id, tipo_evento, tipo_uso, origem, valor, moeda, idempotency_key, descricao, metadata, processed_at, created_by)
            VALUES (NEW.destino_bookmaker_id, NEW.workspace_id, 'BONUS', 'NORMAL', 'BONUS_CREDITADO', v_valor_efetivo, COALESCE(v_bookmaker_record.moeda, NEW.moeda), v_idempotency_key, COALESCE(NEW.descricao, 'Bônus via cash_ledger'), jsonb_build_object('ledger_id', NEW.id), NOW(), NEW.user_id);
        END IF;
    END IF;

    -- CASHBACK_MANUAL
    IF NEW.tipo_transacao = 'CASHBACK_MANUAL' AND NEW.destino_bookmaker_id IS NOT NULL THEN
        v_idempotency_key := 'ledger_cashback_' || NEW.id::TEXT;
        IF NOT EXISTS (SELECT 1 FROM financial_events WHERE idempotency_key = v_idempotency_key) THEN
            SELECT moeda INTO v_bookmaker_record FROM bookmakers WHERE id = NEW.destino_bookmaker_id;
            v_valor_efetivo := COALESCE(NEW.valor_destino, NEW.valor);
            INSERT INTO financial_events (bookmaker_id, workspace_id, tipo_evento, tipo_uso, origem, valor, moeda, idempotency_key, descricao, metadata, processed_at, created_by)
            VALUES (NEW.destino_bookmaker_id, NEW.workspace_id, 'CASHBACK', 'NORMAL', 'CASHBACK_MANUAL', v_valor_efetivo, COALESCE(v_bookmaker_record.moeda, NEW.moeda), v_idempotency_key, COALESCE(NEW.descricao, 'Cashback via cash_ledger'), jsonb_build_object('ledger_id', NEW.id), NOW(), NEW.user_id);
        END IF;
    END IF;

    -- CASHBACK_ESTORNO
    IF NEW.tipo_transacao = 'CASHBACK_ESTORNO' AND NEW.origem_bookmaker_id IS NOT NULL THEN
        v_idempotency_key := 'ledger_cashback_estorno_' || NEW.id::TEXT;
        IF NOT EXISTS (SELECT 1 FROM financial_events WHERE idempotency_key = v_idempotency_key) THEN
            SELECT moeda INTO v_bookmaker_record FROM bookmakers WHERE id = NEW.origem_bookmaker_id;
            v_valor_efetivo := COALESCE(NEW.valor_origem, NEW.valor);
            INSERT INTO financial_events (bookmaker_id, workspace_id, tipo_evento, tipo_uso, origem, valor, moeda, idempotency_key, descricao, metadata, processed_at, created_by)
            VALUES (NEW.origem_bookmaker_id, NEW.workspace_id, 'REVERSAL', 'NORMAL', 'CASHBACK_ESTORNO', -v_valor_efetivo, COALESCE(v_bookmaker_record.moeda, NEW.moeda), v_idempotency_key, COALESCE(NEW.descricao, 'Estorno de cashback via cash_ledger'), jsonb_build_object('ledger_id', NEW.id, 'tipo_original', 'CASHBACK'), NOW(), NEW.user_id);
        END IF;
    END IF;

    -- GIRO_GRATIS
    IF NEW.tipo_transacao = 'GIRO_GRATIS' AND NEW.destino_bookmaker_id IS NOT NULL THEN
        v_idempotency_key := 'ledger_giro_gratis_' || NEW.id::TEXT;
        IF NOT EXISTS (SELECT 1 FROM financial_events WHERE idempotency_key = v_idempotency_key) THEN
            SELECT moeda INTO v_bookmaker_record FROM bookmakers WHERE id = NEW.destino_bookmaker_id;
            v_valor_efetivo := COALESCE(NEW.valor_destino, NEW.valor);
            INSERT INTO financial_events (bookmaker_id, workspace_id, tipo_evento, tipo_uso, origem, valor, moeda, idempotency_key, descricao, metadata, processed_at, created_by)
            VALUES (NEW.destino_bookmaker_id, NEW.workspace_id, 'CASHBACK', 'NORMAL', 'GIRO_GRATIS', v_valor_efetivo, COALESCE(v_bookmaker_record.moeda, NEW.moeda), v_idempotency_key, COALESCE(NEW.descricao, 'Giro Grátis via cash_ledger'), jsonb_build_object('ledger_id', NEW.id), NOW(), NEW.user_id);
        END IF;
    END IF;

    -- GIRO_GRATIS_ESTORNO
    IF NEW.tipo_transacao = 'GIRO_GRATIS_ESTORNO' AND NEW.origem_bookmaker_id IS NOT NULL THEN
        v_idempotency_key := 'ledger_giro_estorno_' || NEW.id::TEXT;
        IF NOT EXISTS (SELECT 1 FROM financial_events WHERE idempotency_key = v_idempotency_key) THEN
            SELECT moeda INTO v_bookmaker_record FROM bookmakers WHERE id = NEW.origem_bookmaker_id;
            v_valor_efetivo := COALESCE(NEW.valor_origem, NEW.valor);
            INSERT INTO financial_events (bookmaker_id, workspace_id, tipo_evento, tipo_uso, origem, valor, moeda, idempotency_key, descricao, metadata, processed_at, created_by)
            VALUES (NEW.origem_bookmaker_id, NEW.workspace_id, 'REVERSAL', 'NORMAL', 'GIRO_GRATIS_ESTORNO', -v_valor_efetivo, COALESCE(v_bookmaker_record.moeda, NEW.moeda), v_idempotency_key, COALESCE(NEW.descricao, 'Estorno de giro grátis via cash_ledger'), jsonb_build_object('ledger_id', NEW.id, 'tipo_original', 'GIRO_GRATIS'), NOW(), NEW.user_id);
        END IF;
    END IF;

    -- BONUS_ESTORNO
    IF NEW.tipo_transacao = 'BONUS_ESTORNO' AND NEW.origem_bookmaker_id IS NOT NULL THEN
        v_idempotency_key := 'ledger_bonus_estorno_' || NEW.id::TEXT;
        IF NOT EXISTS (SELECT 1 FROM financial_events WHERE idempotency_key = v_idempotency_key) THEN
            SELECT moeda INTO v_bookmaker_record FROM bookmakers WHERE id = NEW.origem_bookmaker_id;
            v_valor_efetivo := COALESCE(NEW.valor_origem, NEW.valor);
            INSERT INTO financial_events (bookmaker_id, workspace_id, tipo_evento, tipo_uso, origem, valor, moeda, idempotency_key, descricao, metadata, processed_at, created_by)
            VALUES (NEW.origem_bookmaker_id, NEW.workspace_id, 'REVERSAL', 'NORMAL', 'BONUS_ESTORNO', -v_valor_efetivo, COALESCE(v_bookmaker_record.moeda, NEW.moeda), v_idempotency_key, COALESCE(NEW.descricao, 'Estorno de bônus via cash_ledger'), jsonb_build_object('ledger_id', NEW.id, 'tipo_original', 'BONUS'), NOW(), NEW.user_id);
        END IF;
    END IF;

    -- ==============================================================
    -- AJUSTE_SALDO / AJUSTE_MANUAL: Ajuste manual no saldo
    -- Uses tipo_evento = 'AJUSTE' (valid check constraint value)
    -- ==============================================================
    IF NEW.tipo_transacao IN ('AJUSTE_SALDO', 'AJUSTE_MANUAL') THEN
        -- SAIDA: Débito na bookmaker de origem
        IF NEW.ajuste_direcao = 'SAIDA' AND NEW.origem_bookmaker_id IS NOT NULL THEN
            v_idempotency_key := 'ledger_ajuste_' || NEW.id::TEXT;
            IF NOT EXISTS (SELECT 1 FROM financial_events WHERE idempotency_key = v_idempotency_key) THEN
                SELECT moeda INTO v_bookmaker_record FROM bookmakers WHERE id = NEW.origem_bookmaker_id;
                v_valor_efetivo := COALESCE(NEW.valor_origem, NEW.valor);
                INSERT INTO financial_events (bookmaker_id, workspace_id, tipo_evento, tipo_uso, origem, valor, moeda, idempotency_key, descricao, metadata, processed_at, created_by)
                VALUES (
                    NEW.origem_bookmaker_id, NEW.workspace_id, 'AJUSTE', 'NORMAL', COALESCE(NEW.ajuste_motivo, 'AJUSTE_SALDO'),
                    -v_valor_efetivo, COALESCE(v_bookmaker_record.moeda, NEW.moeda), v_idempotency_key,
                    COALESCE(NEW.descricao, 'Ajuste de saldo via cash_ledger'),
                    jsonb_build_object('ledger_id', NEW.id, 'direcao', 'SAIDA', 'motivo', COALESCE(NEW.ajuste_motivo, 'AJUSTE_SALDO')), NOW(), NEW.user_id
                );
            END IF;
        END IF;
        -- ENTRADA: Crédito na bookmaker de destino
        IF NEW.ajuste_direcao = 'ENTRADA' AND NEW.destino_bookmaker_id IS NOT NULL THEN
            v_idempotency_key := 'ledger_ajuste_' || NEW.id::TEXT;
            IF NOT EXISTS (SELECT 1 FROM financial_events WHERE idempotency_key = v_idempotency_key) THEN
                SELECT moeda INTO v_bookmaker_record FROM bookmakers WHERE id = NEW.destino_bookmaker_id;
                v_valor_efetivo := COALESCE(NEW.valor_destino, NEW.valor);
                INSERT INTO financial_events (bookmaker_id, workspace_id, tipo_evento, tipo_uso, origem, valor, moeda, idempotency_key, descricao, metadata, processed_at, created_by)
                VALUES (
                    NEW.destino_bookmaker_id, NEW.workspace_id, 'AJUSTE', 'NORMAL', COALESCE(NEW.ajuste_motivo, 'AJUSTE_SALDO'),
                    v_valor_efetivo, COALESCE(v_bookmaker_record.moeda, NEW.moeda), v_idempotency_key,
                    COALESCE(NEW.descricao, 'Ajuste de saldo via cash_ledger'),
                    jsonb_build_object('ledger_id', NEW.id, 'direcao', 'ENTRADA', 'motivo', COALESCE(NEW.ajuste_motivo, 'AJUSTE_SALDO')), NOW(), NEW.user_id
                );
            END IF;
        END IF;
    END IF;

    -- AJUSTE_RECONCILIACAO
    IF NEW.tipo_transacao = 'AJUSTE_RECONCILIACAO' THEN
        IF NEW.destino_bookmaker_id IS NOT NULL THEN
            v_idempotency_key := 'ledger_reconciliacao_' || NEW.id::TEXT;
            IF NOT EXISTS (SELECT 1 FROM financial_events WHERE idempotency_key = v_idempotency_key) THEN
                SELECT moeda INTO v_bookmaker_record FROM bookmakers WHERE id = NEW.destino_bookmaker_id;
                v_valor_efetivo := COALESCE(NEW.valor_destino, NEW.valor);
                INSERT INTO financial_events (bookmaker_id, workspace_id, tipo_evento, tipo_uso, origem, valor, moeda, idempotency_key, descricao, metadata, processed_at, created_by)
                VALUES (NEW.destino_bookmaker_id, NEW.workspace_id, 'AJUSTE', 'NORMAL', 'RECONCILIACAO', v_valor_efetivo, COALESCE(v_bookmaker_record.moeda, NEW.moeda), v_idempotency_key, COALESCE(NEW.descricao, 'Reconciliação via cash_ledger'), jsonb_build_object('ledger_id', NEW.id, 'tipo', 'RECONCILIACAO'), NOW(), NEW.user_id);
                UPDATE bookmakers SET reconciled_at = NOW() WHERE id = NEW.destino_bookmaker_id;
            END IF;
        END IF;
        IF NEW.origem_bookmaker_id IS NOT NULL THEN
            v_idempotency_key := 'ledger_reconciliacao_' || NEW.id::TEXT;
            IF NOT EXISTS (SELECT 1 FROM financial_events WHERE idempotency_key = v_idempotency_key) THEN
                SELECT moeda INTO v_bookmaker_record FROM bookmakers WHERE id = NEW.origem_bookmaker_id;
                v_valor_efetivo := COALESCE(NEW.valor_origem, NEW.valor);
                INSERT INTO financial_events (bookmaker_id, workspace_id, tipo_evento, tipo_uso, origem, valor, moeda, idempotency_key, descricao, metadata, processed_at, created_by)
                VALUES (NEW.origem_bookmaker_id, NEW.workspace_id, 'AJUSTE', 'NORMAL', 'RECONCILIACAO', -v_valor_efetivo, COALESCE(v_bookmaker_record.moeda, NEW.moeda), v_idempotency_key, COALESCE(NEW.descricao, 'Reconciliação via cash_ledger'), jsonb_build_object('ledger_id', NEW.id, 'tipo', 'RECONCILIACAO'), NOW(), NEW.user_id);
                UPDATE bookmakers SET reconciled_at = NOW() WHERE id = NEW.origem_bookmaker_id;
            END IF;
        END IF;
        IF NEW.destino_wallet_id IS NOT NULL THEN
            UPDATE wallets_crypto SET reconciled_at = NOW() WHERE id = NEW.destino_wallet_id;
        END IF;
        IF NEW.origem_wallet_id IS NOT NULL THEN
            UPDATE wallets_crypto SET reconciled_at = NOW() WHERE id = NEW.origem_wallet_id;
        END IF;
        IF NEW.destino_conta_bancaria_id IS NOT NULL THEN
            UPDATE contas_bancarias SET reconciled_at = NOW() WHERE id = NEW.destino_conta_bancaria_id;
        END IF;
        IF NEW.origem_conta_bancaria_id IS NOT NULL THEN
            UPDATE contas_bancarias SET reconciled_at = NOW() WHERE id = NEW.origem_conta_bancaria_id;
        END IF;
    END IF;

    NEW.financial_events_generated := TRUE;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;
