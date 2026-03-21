
-- ============================================================
-- FIX DEFINITIVO: AJUSTE_SALDO não gerava financial_events
-- ============================================================

-- PASSO 1: Atualizar trigger para incluir AJUSTE_SALDO e PERDA_OPERACIONAL
CREATE OR REPLACE FUNCTION public.fn_cash_ledger_generate_financial_events()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_bookmaker_record RECORD;
    v_idempotency_key TEXT;
    v_valor_efetivo NUMERIC;
    v_bk_id UUID;
BEGIN
    IF NEW.status IN ('DUPLICADO_CORRIGIDO', 'DUPLICADO_BLOQUEADO', 'CANCELADO', 'FAILED') THEN
        RETURN NEW;
    END IF;
    IF NEW.status != 'CONFIRMADO' THEN RETURN NEW; END IF;
    IF NEW.financial_events_generated = TRUE THEN RETURN NEW; END IF;

    -- DEPOSITO (includes DEPOSITO_VIRTUAL for broker baseline)
    IF NEW.tipo_transacao IN ('DEPOSITO', 'DEPOSITO_VIRTUAL') AND NEW.destino_bookmaker_id IS NOT NULL THEN
        v_idempotency_key := 'ledger_deposit_' || NEW.id::TEXT;
        IF NOT EXISTS (SELECT 1 FROM financial_events WHERE idempotency_key = v_idempotency_key) THEN
            SELECT moeda INTO v_bookmaker_record FROM bookmakers WHERE id = NEW.destino_bookmaker_id;
            v_valor_efetivo := COALESCE(NEW.valor_destino, NEW.valor);
            INSERT INTO financial_events (bookmaker_id, workspace_id, tipo_evento, tipo_uso, origem, valor, moeda, idempotency_key, descricao, metadata, processed_at, created_by)
            VALUES (NEW.destino_bookmaker_id, NEW.workspace_id, 'DEPOSITO', 'NORMAL', NEW.tipo_transacao, v_valor_efetivo, COALESCE(v_bookmaker_record.moeda, NEW.moeda), v_idempotency_key, 
                    CASE WHEN NEW.tipo_transacao = 'DEPOSITO_VIRTUAL' THEN 'Baseline broker via DEPOSITO_VIRTUAL #' ELSE 'Depósito via cash_ledger #' END || NEW.id::TEXT, 
                    jsonb_build_object('ledger_id', NEW.id), NOW(), NEW.user_id);
        END IF;
    END IF;

    -- SAQUE (includes SAQUE_VIRTUAL for broker devolution)
    IF NEW.tipo_transacao IN ('SAQUE', 'SAQUE_VIRTUAL') AND NEW.origem_bookmaker_id IS NOT NULL THEN
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
            VALUES (NEW.origem_bookmaker_id, NEW.workspace_id, 'CASHBACK', 'NORMAL', 'CASHBACK_ESTORNO', -v_valor_efetivo, COALESCE(v_bookmaker_record.moeda, NEW.moeda), v_idempotency_key, COALESCE(NEW.descricao, 'Estorno cashback via cash_ledger'), jsonb_build_object('ledger_id', NEW.id), NOW(), NEW.user_id);
        END IF;
    END IF;

    -- GIRO_GRATIS
    IF NEW.tipo_transacao = 'GIRO_GRATIS' AND NEW.destino_bookmaker_id IS NOT NULL THEN
        v_idempotency_key := 'ledger_giro_' || NEW.id::TEXT;
        IF NOT EXISTS (SELECT 1 FROM financial_events WHERE idempotency_key = v_idempotency_key) THEN
            SELECT moeda INTO v_bookmaker_record FROM bookmakers WHERE id = NEW.destino_bookmaker_id;
            v_valor_efetivo := COALESCE(NEW.valor_destino, NEW.valor);
            INSERT INTO financial_events (bookmaker_id, workspace_id, tipo_evento, tipo_uso, origem, valor, moeda, idempotency_key, descricao, metadata, processed_at, created_by)
            VALUES (NEW.destino_bookmaker_id, NEW.workspace_id, 'PAYOUT', 'NORMAL', 'GIRO_GRATIS', v_valor_efetivo, COALESCE(v_bookmaker_record.moeda, NEW.moeda), v_idempotency_key, COALESCE(NEW.descricao, 'Giro grátis via cash_ledger'), jsonb_build_object('ledger_id', NEW.id), NOW(), NEW.user_id);
        END IF;
    END IF;

    -- AJUSTE_MANUAL
    IF NEW.tipo_transacao = 'AJUSTE_MANUAL' THEN
        v_bk_id := COALESCE(NEW.destino_bookmaker_id, NEW.origem_bookmaker_id);
        IF v_bk_id IS NOT NULL THEN
            v_idempotency_key := 'ledger_ajuste_' || NEW.id::TEXT;
            IF NOT EXISTS (SELECT 1 FROM financial_events WHERE idempotency_key = v_idempotency_key) THEN
                SELECT moeda INTO v_bookmaker_record FROM bookmakers WHERE id = v_bk_id;
                v_valor_efetivo := COALESCE(NEW.valor_destino, NEW.valor_origem, NEW.valor);
                IF NEW.ajuste_direcao = 'SAIDA' THEN v_valor_efetivo := -ABS(v_valor_efetivo); END IF;
                INSERT INTO financial_events (bookmaker_id, workspace_id, tipo_evento, tipo_uso, origem, valor, moeda, idempotency_key, descricao, metadata, processed_at, created_by)
                VALUES (v_bk_id, NEW.workspace_id, 'AJUSTE', 'NORMAL', 'AJUSTE_MANUAL', v_valor_efetivo, COALESCE(v_bookmaker_record.moeda, NEW.moeda), v_idempotency_key, COALESCE(NEW.descricao, 'Ajuste manual'), jsonb_build_object('ledger_id', NEW.id, 'direcao', NEW.ajuste_direcao), NOW(), NEW.user_id);
            END IF;
        END IF;
    END IF;

    -- AJUSTE_SALDO (FIX: era completamente ignorado antes!)
    IF NEW.tipo_transacao = 'AJUSTE_SALDO' THEN
        v_bk_id := COALESCE(NEW.destino_bookmaker_id, NEW.origem_bookmaker_id);
        IF v_bk_id IS NOT NULL THEN
            v_idempotency_key := 'ledger_ajuste_saldo_' || NEW.id::TEXT;
            IF NOT EXISTS (SELECT 1 FROM financial_events WHERE idempotency_key = v_idempotency_key) THEN
                SELECT moeda INTO v_bookmaker_record FROM bookmakers WHERE id = v_bk_id;
                v_valor_efetivo := COALESCE(NEW.valor_destino, NEW.valor_origem, NEW.valor);
                IF NEW.ajuste_direcao = 'SAIDA' THEN v_valor_efetivo := -ABS(v_valor_efetivo); END IF;
                INSERT INTO financial_events (bookmaker_id, workspace_id, tipo_evento, tipo_uso, origem, valor, moeda, idempotency_key, descricao, metadata, processed_at, created_by)
                VALUES (v_bk_id, NEW.workspace_id, 'AJUSTE', 'NORMAL', 'AJUSTE_SALDO', v_valor_efetivo, COALESCE(v_bookmaker_record.moeda, NEW.moeda), v_idempotency_key, COALESCE(NEW.descricao, 'Ajuste de saldo'), jsonb_build_object('ledger_id', NEW.id, 'direcao', NEW.ajuste_direcao), NOW(), NEW.user_id);
            END IF;
        END IF;
    END IF;

    -- AJUSTE_RECONCILIACAO
    IF NEW.tipo_transacao = 'AJUSTE_RECONCILIACAO' THEN
        v_bk_id := COALESCE(NEW.destino_bookmaker_id, NEW.origem_bookmaker_id);
        IF v_bk_id IS NOT NULL THEN
            v_idempotency_key := 'ledger_reconciliacao_' || NEW.id::TEXT;
            IF NOT EXISTS (SELECT 1 FROM financial_events WHERE idempotency_key = v_idempotency_key) THEN
                SELECT moeda INTO v_bookmaker_record FROM bookmakers WHERE id = v_bk_id;
                v_valor_efetivo := COALESCE(NEW.valor_destino, NEW.valor_origem, NEW.valor);
                IF NEW.ajuste_direcao = 'SAIDA' THEN v_valor_efetivo := -ABS(v_valor_efetivo); END IF;
                INSERT INTO financial_events (bookmaker_id, workspace_id, tipo_evento, tipo_uso, origem, valor, moeda, idempotency_key, descricao, metadata, processed_at, created_by)
                VALUES (v_bk_id, NEW.workspace_id, 'AJUSTE', 'NORMAL', 'AJUSTE_RECONCILIACAO', v_valor_efetivo, COALESCE(v_bookmaker_record.moeda, NEW.moeda), v_idempotency_key, COALESCE(NEW.descricao, 'Reconciliação de saldo'), jsonb_build_object('ledger_id', NEW.id, 'direcao', NEW.ajuste_direcao), NOW(), NEW.user_id);
            END IF;
        END IF;
    END IF;

    -- PERDA_OPERACIONAL
    IF NEW.tipo_transacao = 'PERDA_OPERACIONAL' AND NEW.origem_bookmaker_id IS NOT NULL THEN
        v_idempotency_key := 'ledger_perda_' || NEW.id::TEXT;
        IF NOT EXISTS (SELECT 1 FROM financial_events WHERE idempotency_key = v_idempotency_key) THEN
            SELECT moeda INTO v_bookmaker_record FROM bookmakers WHERE id = NEW.origem_bookmaker_id;
            v_valor_efetivo := COALESCE(NEW.valor_origem, NEW.valor);
            INSERT INTO financial_events (bookmaker_id, workspace_id, tipo_evento, tipo_uso, origem, valor, moeda, idempotency_key, descricao, metadata, processed_at, created_by)
            VALUES (NEW.origem_bookmaker_id, NEW.workspace_id, 'AJUSTE', 'NORMAL', 'PERDA_OPERACIONAL', -v_valor_efetivo, COALESCE(v_bookmaker_record.moeda, NEW.moeda), v_idempotency_key, COALESCE(NEW.descricao, 'Perda operacional'), jsonb_build_object('ledger_id', NEW.id), NOW(), NEW.user_id);
        END IF;
    END IF;

    NEW.financial_events_generated := TRUE;
    NEW.balance_processed_at := NOW();
    RETURN NEW;
END;
$$;

-- PASSO 2: Gerar financial_events retroativos para AJUSTE_SALDO existentes
DO $$
DECLARE
    r RECORD;
    v_bk_id UUID;
    v_valor NUMERIC;
    v_ikey TEXT;
    v_moeda TEXT;
    v_count INT := 0;
BEGIN
    FOR r IN
        SELECT cl.*, b.moeda as bk_moeda
        FROM public.cash_ledger cl
        LEFT JOIN public.bookmakers b ON COALESCE(cl.destino_bookmaker_id, cl.origem_bookmaker_id) = b.id
        WHERE cl.tipo_transacao = 'AJUSTE_SALDO'
        AND cl.status = 'CONFIRMADO'
    LOOP
        v_bk_id := COALESCE(r.destino_bookmaker_id, r.origem_bookmaker_id);
        IF v_bk_id IS NULL THEN CONTINUE; END IF;
        
        v_ikey := 'ledger_ajuste_saldo_' || r.id::TEXT;
        IF EXISTS (SELECT 1 FROM public.financial_events WHERE idempotency_key = v_ikey) THEN CONTINUE; END IF;
        
        v_valor := COALESCE(r.valor_destino, r.valor_origem, r.valor);
        IF r.ajuste_direcao = 'SAIDA' THEN v_valor := -ABS(v_valor); END IF;
        v_moeda := COALESCE(r.bk_moeda, r.moeda);
        
        INSERT INTO public.financial_events (bookmaker_id, workspace_id, tipo_evento, tipo_uso, origem, valor, moeda, idempotency_key, descricao, metadata, processed_at, created_by)
        VALUES (v_bk_id, r.workspace_id, 'AJUSTE', 'NORMAL', 'AJUSTE_SALDO', v_valor, v_moeda, v_ikey, COALESCE(r.descricao, 'Ajuste de saldo retroativo'), jsonb_build_object('ledger_id', r.id, 'direcao', r.ajuste_direcao, 'retroativo', true), NOW(), r.user_id);
        
        v_count := v_count + 1;
    END LOOP;
    RAISE LOG '[fix-ajuste-saldo] % financial_events retroativos criados para AJUSTE_SALDO', v_count;
END;
$$;

-- PASSO 3: Gerar PERDA_OPERACIONAL retroativos
DO $$
DECLARE
    r RECORD;
    v_ikey TEXT;
    v_valor NUMERIC;
    v_moeda TEXT;
    v_count INT := 0;
BEGIN
    FOR r IN
        SELECT cl.*, b.moeda as bk_moeda
        FROM public.cash_ledger cl
        LEFT JOIN public.bookmakers b ON cl.origem_bookmaker_id = b.id
        WHERE cl.tipo_transacao = 'PERDA_OPERACIONAL'
        AND cl.status = 'CONFIRMADO'
        AND cl.origem_bookmaker_id IS NOT NULL
    LOOP
        v_ikey := 'ledger_perda_' || r.id::TEXT;
        IF EXISTS (SELECT 1 FROM public.financial_events WHERE idempotency_key = v_ikey) THEN CONTINUE; END IF;
        
        v_valor := -ABS(COALESCE(r.valor_origem, r.valor));
        v_moeda := COALESCE(r.bk_moeda, r.moeda);
        
        INSERT INTO public.financial_events (bookmaker_id, workspace_id, tipo_evento, tipo_uso, origem, valor, moeda, idempotency_key, descricao, metadata, processed_at, created_by)
        VALUES (r.origem_bookmaker_id, r.workspace_id, 'AJUSTE', 'NORMAL', 'PERDA_OPERACIONAL', v_valor, v_moeda, v_ikey, COALESCE(r.descricao, 'Perda operacional retroativa'), jsonb_build_object('ledger_id', r.id, 'retroativo', true), NOW(), r.user_id);
        
        v_count := v_count + 1;
    END LOOP;
    RAISE LOG '[fix-perda-op] % financial_events retroativos criados para PERDA_OPERACIONAL', v_count;
END;
$$;

-- PASSO 4: Recalcular TODOS os saldos de bookmakers com financial_events
DO $$
DECLARE
    r RECORD;
    v_new_balance NUMERIC;
    v_new_freebet NUMERIC;
    v_count INT := 0;
BEGIN
    FOR r IN
        SELECT DISTINCT fe.bookmaker_id
        FROM public.financial_events fe
    LOOP
        SELECT COALESCE(SUM(CASE WHEN tipo_uso = 'NORMAL' THEN valor ELSE 0 END), 0),
               COALESCE(SUM(CASE WHEN tipo_uso = 'FREEBET' THEN valor ELSE 0 END), 0)
        INTO v_new_balance, v_new_freebet
        FROM public.financial_events
        WHERE bookmaker_id = r.bookmaker_id;
        
        UPDATE public.bookmakers
        SET saldo_atual = ROUND(v_new_balance::numeric, 2),
            saldo_freebet = ROUND(v_new_freebet::numeric, 2),
            updated_at = NOW()
        WHERE id = r.bookmaker_id
        AND (ROUND(saldo_atual::numeric, 2) != ROUND(v_new_balance::numeric, 2)
             OR ROUND(saldo_freebet::numeric, 2) != ROUND(v_new_freebet::numeric, 2));
        
        IF FOUND THEN v_count := v_count + 1; END IF;
    END LOOP;
    RAISE LOG '[fix-balances] % bookmakers com saldo recalculado', v_count;
END;
$$
