
-- =================================================================
-- RECONCILIAÇÃO: Suporte a AJUSTE_RECONCILIACAO no motor financeiro
-- =================================================================

-- 1. Adicionar coluna reconciled_at nas entidades
ALTER TABLE public.bookmakers ADD COLUMN IF NOT EXISTS reconciled_at TIMESTAMPTZ;
ALTER TABLE public.wallets_crypto ADD COLUMN IF NOT EXISTS reconciled_at TIMESTAMPTZ;
ALTER TABLE public.contas_bancarias ADD COLUMN IF NOT EXISTS reconciled_at TIMESTAMPTZ;

-- 2. Atualizar validate_ajuste_manual para incluir AJUSTE_RECONCILIACAO
CREATE OR REPLACE FUNCTION public.validate_ajuste_manual()
RETURNS TRIGGER AS $$
BEGIN
  -- Apenas validar para tipos que REQUEREM motivo
  IF NEW.tipo_transacao IN ('AJUSTE_MANUAL', 'AJUSTE_SALDO', 'ESTORNO', 'CONCILIACAO', 'AJUSTE_RECONCILIACAO') THEN
    -- Motivo pode vir de ajuste_motivo OU descricao
    IF (NEW.ajuste_motivo IS NULL OR NEW.ajuste_motivo = '') 
       AND (NEW.descricao IS NULL OR NEW.descricao = '') THEN
      RAISE EXCEPTION 'Ajustes manuais requerem motivo (ajuste_motivo ou descricao)';
    END IF;
    
    -- Direção pode vir de ajuste_direcao OU ser inferida de origem/destino
    IF NEW.ajuste_direcao IS NULL OR NEW.ajuste_direcao = '' THEN
      IF NEW.destino_bookmaker_id IS NOT NULL OR NEW.destino_conta_bancaria_id IS NOT NULL OR NEW.destino_wallet_id IS NOT NULL THEN
        NEW.ajuste_direcao := 'ENTRADA';
      ELSIF NEW.origem_bookmaker_id IS NOT NULL OR NEW.origem_conta_bancaria_id IS NOT NULL OR NEW.origem_wallet_id IS NOT NULL THEN
        NEW.ajuste_direcao := 'SAIDA';
      END IF;
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

-- 3. Atualizar fn_cash_ledger_generate_financial_events para gerar eventos de AJUSTE_RECONCILIACAO para bookmakers
CREATE OR REPLACE FUNCTION public.fn_cash_ledger_generate_financial_events()
RETURNS TRIGGER AS $$
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
    -- CASHBACK_MANUAL: Crédito na bookmaker de destino
    -- ==============================================================
    IF NEW.tipo_transacao = 'CASHBACK_MANUAL' AND NEW.destino_bookmaker_id IS NOT NULL THEN
        v_idempotency_key := 'ledger_cashback_' || NEW.id::TEXT;
        IF NOT EXISTS (SELECT 1 FROM financial_events WHERE idempotency_key = v_idempotency_key) THEN
            SELECT moeda INTO v_bookmaker_record FROM bookmakers WHERE id = NEW.destino_bookmaker_id;
            v_valor_efetivo := COALESCE(NEW.valor_destino, NEW.valor);
            INSERT INTO financial_events (bookmaker_id, workspace_id, tipo_evento, tipo_uso, origem, valor, moeda, idempotency_key, descricao, metadata, processed_at, created_by)
            VALUES (
                NEW.destino_bookmaker_id, NEW.workspace_id, 'CASHBACK', 'NORMAL', 'CASHBACK_MANUAL',
                v_valor_efetivo, COALESCE(v_bookmaker_record.moeda, NEW.moeda), v_idempotency_key,
                COALESCE(NEW.descricao, 'Cashback via cash_ledger'),
                jsonb_build_object('ledger_id', NEW.id), NOW(), NEW.user_id
            );
        END IF;
    END IF;

    -- ==============================================================
    -- CASHBACK_ESTORNO: Débito na bookmaker de origem
    -- ==============================================================
    IF NEW.tipo_transacao = 'CASHBACK_ESTORNO' AND NEW.origem_bookmaker_id IS NOT NULL THEN
        v_idempotency_key := 'ledger_cashback_estorno_' || NEW.id::TEXT;
        IF NOT EXISTS (SELECT 1 FROM financial_events WHERE idempotency_key = v_idempotency_key) THEN
            SELECT moeda INTO v_bookmaker_record FROM bookmakers WHERE id = NEW.origem_bookmaker_id;
            v_valor_efetivo := COALESCE(NEW.valor_origem, NEW.valor);
            INSERT INTO financial_events (bookmaker_id, workspace_id, tipo_evento, tipo_uso, origem, valor, moeda, idempotency_key, descricao, metadata, processed_at, created_by)
            VALUES (
                NEW.origem_bookmaker_id, NEW.workspace_id, 'REVERSAL', 'NORMAL', 'CASHBACK_ESTORNO',
                -v_valor_efetivo, COALESCE(v_bookmaker_record.moeda, NEW.moeda), v_idempotency_key,
                COALESCE(NEW.descricao, 'Estorno de cashback via cash_ledger'),
                jsonb_build_object('ledger_id', NEW.id, 'tipo_original', 'CASHBACK'), NOW(), NEW.user_id
            );
        END IF;
    END IF;

    -- ==============================================================
    -- GIRO_GRATIS: Crédito na bookmaker de destino
    -- ==============================================================
    IF NEW.tipo_transacao = 'GIRO_GRATIS' AND NEW.destino_bookmaker_id IS NOT NULL THEN
        v_idempotency_key := 'ledger_giro_gratis_' || NEW.id::TEXT;
        IF NOT EXISTS (SELECT 1 FROM financial_events WHERE idempotency_key = v_idempotency_key) THEN
            SELECT moeda INTO v_bookmaker_record FROM bookmakers WHERE id = NEW.destino_bookmaker_id;
            v_valor_efetivo := COALESCE(NEW.valor_destino, NEW.valor);
            INSERT INTO financial_events (bookmaker_id, workspace_id, tipo_evento, tipo_uso, origem, valor, moeda, idempotency_key, descricao, metadata, processed_at, created_by)
            VALUES (
                NEW.destino_bookmaker_id, NEW.workspace_id, 'CASHBACK', 'NORMAL', 'GIRO_GRATIS',
                v_valor_efetivo, COALESCE(v_bookmaker_record.moeda, NEW.moeda), v_idempotency_key,
                COALESCE(NEW.descricao, 'Giro Grátis via cash_ledger'),
                jsonb_build_object('ledger_id', NEW.id), NOW(), NEW.user_id
            );
        END IF;
    END IF;

    -- ==============================================================
    -- GIRO_GRATIS_ESTORNO: Débito na bookmaker de origem
    -- ==============================================================
    IF NEW.tipo_transacao = 'GIRO_GRATIS_ESTORNO' AND NEW.origem_bookmaker_id IS NOT NULL THEN
        v_idempotency_key := 'ledger_giro_estorno_' || NEW.id::TEXT;
        IF NOT EXISTS (SELECT 1 FROM financial_events WHERE idempotency_key = v_idempotency_key) THEN
            SELECT moeda INTO v_bookmaker_record FROM bookmakers WHERE id = NEW.origem_bookmaker_id;
            v_valor_efetivo := COALESCE(NEW.valor_origem, NEW.valor);
            INSERT INTO financial_events (bookmaker_id, workspace_id, tipo_evento, tipo_uso, origem, valor, moeda, idempotency_key, descricao, metadata, processed_at, created_by)
            VALUES (
                NEW.origem_bookmaker_id, NEW.workspace_id, 'REVERSAL', 'NORMAL', 'GIRO_GRATIS_ESTORNO',
                -v_valor_efetivo, COALESCE(v_bookmaker_record.moeda, NEW.moeda), v_idempotency_key,
                COALESCE(NEW.descricao, 'Estorno de giro grátis via cash_ledger'),
                jsonb_build_object('ledger_id', NEW.id, 'tipo_original', 'GIRO_GRATIS'), NOW(), NEW.user_id
            );
        END IF;
    END IF;

    -- ==============================================================
    -- BONUS_ESTORNO: Débito na bookmaker de origem
    -- ==============================================================
    IF NEW.tipo_transacao = 'BONUS_ESTORNO' AND NEW.origem_bookmaker_id IS NOT NULL THEN
        v_idempotency_key := 'ledger_bonus_estorno_' || NEW.id::TEXT;
        IF NOT EXISTS (SELECT 1 FROM financial_events WHERE idempotency_key = v_idempotency_key) THEN
            SELECT moeda INTO v_bookmaker_record FROM bookmakers WHERE id = NEW.origem_bookmaker_id;
            v_valor_efetivo := COALESCE(NEW.valor_origem, NEW.valor);
            INSERT INTO financial_events (bookmaker_id, workspace_id, tipo_evento, tipo_uso, origem, valor, moeda, idempotency_key, descricao, metadata, processed_at, created_by)
            VALUES (
                NEW.origem_bookmaker_id, NEW.workspace_id, 'REVERSAL', 'NORMAL', 'BONUS_ESTORNO',
                -v_valor_efetivo, COALESCE(v_bookmaker_record.moeda, NEW.moeda), v_idempotency_key,
                COALESCE(NEW.descricao, 'Estorno de bônus via cash_ledger'),
                jsonb_build_object('ledger_id', NEW.id, 'tipo_original', 'BONUS'), NOW(), NEW.user_id
            );
        END IF;
    END IF;

    -- ==============================================================
    -- AJUSTE_RECONCILIACAO: Ajuste de reconciliação para bookmakers
    -- Gera financial_event de AJUSTE com origem RECONCILIACAO
    -- ==============================================================
    IF NEW.tipo_transacao = 'AJUSTE_RECONCILIACAO' THEN
        -- Crédito no destino (ENTRADA)
        IF NEW.destino_bookmaker_id IS NOT NULL THEN
            v_idempotency_key := 'ledger_reconciliacao_' || NEW.id::TEXT;
            IF NOT EXISTS (SELECT 1 FROM financial_events WHERE idempotency_key = v_idempotency_key) THEN
                SELECT moeda INTO v_bookmaker_record FROM bookmakers WHERE id = NEW.destino_bookmaker_id;
                v_valor_efetivo := COALESCE(NEW.valor_destino, NEW.valor);
                INSERT INTO financial_events (bookmaker_id, workspace_id, tipo_evento, tipo_uso, origem, valor, moeda, idempotency_key, descricao, metadata, processed_at, created_by)
                VALUES (
                    NEW.destino_bookmaker_id, NEW.workspace_id, 'AJUSTE_MANUAL', 'NORMAL', 'RECONCILIACAO',
                    v_valor_efetivo, COALESCE(v_bookmaker_record.moeda, NEW.moeda), v_idempotency_key,
                    COALESCE(NEW.descricao, 'Reconciliação via cash_ledger'),
                    jsonb_build_object('ledger_id', NEW.id, 'tipo', 'RECONCILIACAO'), NOW(), NEW.user_id
                );
                -- Marcar bookmaker como reconciliado
                UPDATE bookmakers SET reconciled_at = NOW() WHERE id = NEW.destino_bookmaker_id;
            END IF;
        END IF;
        -- Débito na origem (SAIDA)
        IF NEW.origem_bookmaker_id IS NOT NULL THEN
            v_idempotency_key := 'ledger_reconciliacao_' || NEW.id::TEXT;
            IF NOT EXISTS (SELECT 1 FROM financial_events WHERE idempotency_key = v_idempotency_key) THEN
                SELECT moeda INTO v_bookmaker_record FROM bookmakers WHERE id = NEW.origem_bookmaker_id;
                v_valor_efetivo := COALESCE(NEW.valor_origem, NEW.valor);
                INSERT INTO financial_events (bookmaker_id, workspace_id, tipo_evento, tipo_uso, origem, valor, moeda, idempotency_key, descricao, metadata, processed_at, created_by)
                VALUES (
                    NEW.origem_bookmaker_id, NEW.workspace_id, 'AJUSTE_MANUAL', 'NORMAL', 'RECONCILIACAO',
                    -v_valor_efetivo, COALESCE(v_bookmaker_record.moeda, NEW.moeda), v_idempotency_key,
                    COALESCE(NEW.descricao, 'Reconciliação via cash_ledger'),
                    jsonb_build_object('ledger_id', NEW.id, 'tipo', 'RECONCILIACAO'), NOW(), NEW.user_id
                );
                -- Marcar bookmaker como reconciliado
                UPDATE bookmakers SET reconciled_at = NOW() WHERE id = NEW.origem_bookmaker_id;
            END IF;
        END IF;
        -- Para wallets e contas bancárias, o saldo é calculado via views do cash_ledger
        -- então apenas marcar como reconciliado
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
$$ LANGUAGE plpgsql SET search_path = public;
