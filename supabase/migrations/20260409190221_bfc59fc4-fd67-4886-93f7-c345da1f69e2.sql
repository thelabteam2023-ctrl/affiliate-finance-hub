
-- 1. Update trigger with ALL missing handlers
CREATE OR REPLACE FUNCTION fn_cash_ledger_generate_financial_events()
RETURNS TRIGGER AS $$
DECLARE
    v_bookmaker_record RECORD;
    v_idempotency_key TEXT;
    v_valor_efetivo NUMERIC;
    v_bk_id UUID;
    v_is_virtual BOOLEAN;
    v_event_scope public.event_scope;
BEGIN
    IF NEW.status IN ('DUPLICADO_CORRIGIDO', 'DUPLICADO_BLOQUEADO', 'CANCELADO', 'FAILED') THEN
        RETURN NEW;
    END IF;
    IF NEW.status != 'CONFIRMADO' THEN
        RETURN NEW;
    END IF;
    IF NEW.financial_events_generated = TRUE THEN
        RETURN NEW;
    END IF;

    -- Ignorar ajustes técnicos legados
    IF NEW.tipo_transacao = 'AJUSTE_SALDO'
       AND COALESCE(NEW.descricao, '') ILIKE 'Reconciliação: reset saldo negativo para zero%'
    THEN
        NEW.financial_events_generated := TRUE;
        NEW.balance_processed_at := NOW();
        RETURN NEW;
    END IF;

    v_is_virtual := NEW.tipo_transacao IN ('DEPOSITO_VIRTUAL', 'SAQUE_VIRTUAL');
    v_event_scope := CASE WHEN v_is_virtual THEN 'VIRTUAL'::public.event_scope ELSE 'REAL'::public.event_scope END;

    -- DEPOSITO / DEPOSITO_VIRTUAL
    IF NEW.tipo_transacao IN ('DEPOSITO', 'DEPOSITO_VIRTUAL') AND NEW.destino_bookmaker_id IS NOT NULL THEN
        v_idempotency_key := 'ledger_deposit_' || NEW.id::TEXT;
        IF NOT EXISTS (SELECT 1 FROM financial_events WHERE idempotency_key = v_idempotency_key) THEN
            SELECT moeda INTO v_bookmaker_record FROM bookmakers WHERE id = NEW.destino_bookmaker_id;
            v_valor_efetivo := COALESCE(NEW.valor_destino, NEW.valor);
            INSERT INTO financial_events (bookmaker_id, workspace_id, tipo_evento, tipo_uso, origem, valor, moeda, idempotency_key, descricao, metadata, processed_at, created_by, event_scope)
            VALUES (
                NEW.destino_bookmaker_id, NEW.workspace_id, 'DEPOSITO', 'NORMAL', NEW.tipo_transacao,
                v_valor_efetivo, COALESCE(v_bookmaker_record.moeda, NEW.moeda), v_idempotency_key,
                CASE WHEN v_is_virtual THEN 'Baseline virtual (sem impacto saldo) #' ELSE 'Depósito via cash_ledger #' END || NEW.id::TEXT,
                jsonb_build_object('ledger_id', NEW.id, 'scope', v_event_scope::TEXT),
                NOW(), NEW.user_id, v_event_scope
            );
        END IF;
    END IF;

    -- SAQUE / SAQUE_VIRTUAL
    IF NEW.tipo_transacao IN ('SAQUE', 'SAQUE_VIRTUAL') AND NEW.origem_bookmaker_id IS NOT NULL THEN
        v_idempotency_key := 'ledger_withdraw_' || NEW.id::TEXT;
        IF NOT EXISTS (SELECT 1 FROM financial_events WHERE idempotency_key = v_idempotency_key) THEN
            SELECT moeda INTO v_bookmaker_record FROM bookmakers WHERE id = NEW.origem_bookmaker_id;
            v_valor_efetivo := COALESCE(NEW.valor_origem, NEW.valor);
            INSERT INTO financial_events (bookmaker_id, workspace_id, tipo_evento, tipo_uso, origem, valor, moeda, idempotency_key, descricao, metadata, processed_at, created_by, event_scope)
            VALUES (
                NEW.origem_bookmaker_id, NEW.workspace_id, 'SAQUE', 'NORMAL', NULL,
                -v_valor_efetivo, COALESCE(v_bookmaker_record.moeda, NEW.moeda), v_idempotency_key,
                CASE WHEN v_is_virtual THEN 'Saque virtual (sem impacto saldo) #' ELSE 'Saque via cash_ledger #' END || NEW.id::TEXT,
                jsonb_build_object('ledger_id', NEW.id, 'scope', v_event_scope::TEXT),
                NOW(), NEW.user_id, v_event_scope
            );
        END IF;
    END IF;

    -- BONUS_CREDITADO (sempre REAL)
    IF NEW.tipo_transacao = 'BONUS_CREDITADO' AND NEW.destino_bookmaker_id IS NOT NULL THEN
        v_idempotency_key := 'ledger_bonus_' || NEW.id::TEXT;
        IF NOT EXISTS (SELECT 1 FROM financial_events WHERE idempotency_key = v_idempotency_key) THEN
            SELECT moeda INTO v_bookmaker_record FROM bookmakers WHERE id = NEW.destino_bookmaker_id;
            v_valor_efetivo := COALESCE(NEW.valor_destino, NEW.valor);
            INSERT INTO financial_events (bookmaker_id, workspace_id, tipo_evento, tipo_uso, origem, valor, moeda, idempotency_key, descricao, metadata, processed_at, created_by, event_scope)
            VALUES (
                NEW.destino_bookmaker_id, NEW.workspace_id, 'BONUS', 'NORMAL', 'BONUS_CREDITADO',
                v_valor_efetivo, COALESCE(v_bookmaker_record.moeda, NEW.moeda), v_idempotency_key,
                COALESCE(NEW.descricao, 'Bônus via cash_ledger'),
                jsonb_build_object('ledger_id', NEW.id), NOW(), NEW.user_id, 'REAL'::public.event_scope
            );
        END IF;
    END IF;

    -- BONUS_ESTORNO (sempre REAL) - débito de bônus
    IF NEW.tipo_transacao = 'BONUS_ESTORNO' AND NEW.origem_bookmaker_id IS NOT NULL THEN
        v_idempotency_key := 'ledger_bonus_estorno_' || NEW.id::TEXT;
        IF NOT EXISTS (SELECT 1 FROM financial_events WHERE idempotency_key = v_idempotency_key) THEN
            SELECT moeda INTO v_bookmaker_record FROM bookmakers WHERE id = NEW.origem_bookmaker_id;
            v_valor_efetivo := COALESCE(NEW.valor_origem, NEW.valor);
            INSERT INTO financial_events (bookmaker_id, workspace_id, tipo_evento, tipo_uso, origem, valor, moeda, idempotency_key, descricao, metadata, processed_at, created_by, event_scope)
            VALUES (
                NEW.origem_bookmaker_id, NEW.workspace_id, 'REVERSAL', 'NORMAL', 'BONUS_ESTORNO',
                -v_valor_efetivo, COALESCE(v_bookmaker_record.moeda, NEW.moeda), v_idempotency_key,
                COALESCE(NEW.descricao, 'Estorno de bônus via cash_ledger'),
                jsonb_build_object('ledger_id', NEW.id), NOW(), NEW.user_id, 'REAL'::public.event_scope
            );
        END IF;
    END IF;

    -- CASHBACK_MANUAL (sempre REAL)
    IF NEW.tipo_transacao = 'CASHBACK_MANUAL' AND NEW.destino_bookmaker_id IS NOT NULL THEN
        v_idempotency_key := 'ledger_cashback_' || NEW.id::TEXT;
        IF NOT EXISTS (SELECT 1 FROM financial_events WHERE idempotency_key = v_idempotency_key) THEN
            SELECT moeda INTO v_bookmaker_record FROM bookmakers WHERE id = NEW.destino_bookmaker_id;
            v_valor_efetivo := COALESCE(NEW.valor_destino, NEW.valor);
            INSERT INTO financial_events (bookmaker_id, workspace_id, tipo_evento, tipo_uso, origem, valor, moeda, idempotency_key, descricao, metadata, processed_at, created_by, event_scope)
            VALUES (
                NEW.destino_bookmaker_id, NEW.workspace_id, 'CASHBACK', 'NORMAL', 'CASHBACK_MANUAL',
                v_valor_efetivo, COALESCE(v_bookmaker_record.moeda, NEW.moeda), v_idempotency_key,
                COALESCE(NEW.descricao, 'Cashback via cash_ledger'),
                jsonb_build_object('ledger_id', NEW.id), NOW(), NEW.user_id, 'REAL'::public.event_scope
            );
        END IF;
    END IF;

    -- CASHBACK_ESTORNO (sempre REAL)
    IF NEW.tipo_transacao = 'CASHBACK_ESTORNO' AND NEW.origem_bookmaker_id IS NOT NULL THEN
        v_idempotency_key := 'ledger_cashback_estorno_' || NEW.id::TEXT;
        IF NOT EXISTS (SELECT 1 FROM financial_events WHERE idempotency_key = v_idempotency_key) THEN
            SELECT moeda INTO v_bookmaker_record FROM bookmakers WHERE id = NEW.origem_bookmaker_id;
            v_valor_efetivo := COALESCE(NEW.valor_origem, NEW.valor);
            INSERT INTO financial_events (bookmaker_id, workspace_id, tipo_evento, tipo_uso, origem, valor, moeda, idempotency_key, descricao, metadata, processed_at, created_by, event_scope)
            VALUES (
                NEW.origem_bookmaker_id, NEW.workspace_id, 'CASHBACK', 'NORMAL', 'CASHBACK_ESTORNO',
                -v_valor_efetivo, COALESCE(v_bookmaker_record.moeda, NEW.moeda), v_idempotency_key,
                COALESCE(NEW.descricao, 'Estorno cashback via cash_ledger'),
                jsonb_build_object('ledger_id', NEW.id), NOW(), NEW.user_id, 'REAL'::public.event_scope
            );
        END IF;
    END IF;

    -- GIRO_GRATIS (sempre REAL)
    IF NEW.tipo_transacao = 'GIRO_GRATIS' AND NEW.destino_bookmaker_id IS NOT NULL THEN
        v_idempotency_key := 'ledger_giro_' || NEW.id::TEXT;
        IF NOT EXISTS (SELECT 1 FROM financial_events WHERE idempotency_key = v_idempotency_key) THEN
            SELECT moeda INTO v_bookmaker_record FROM bookmakers WHERE id = NEW.destino_bookmaker_id;
            v_valor_efetivo := COALESCE(NEW.valor_destino, NEW.valor);
            INSERT INTO financial_events (bookmaker_id, workspace_id, tipo_evento, tipo_uso, origem, valor, moeda, idempotency_key, descricao, metadata, processed_at, created_by, event_scope)
            VALUES (
                NEW.destino_bookmaker_id, NEW.workspace_id, 'PAYOUT', 'NORMAL', 'GIRO_GRATIS',
                v_valor_efetivo, COALESCE(v_bookmaker_record.moeda, NEW.moeda), v_idempotency_key,
                COALESCE(NEW.descricao, 'Giro grátis via cash_ledger'),
                jsonb_build_object('ledger_id', NEW.id), NOW(), NEW.user_id, 'REAL'::public.event_scope
            );
        END IF;
    END IF;

    -- AJUSTE_MANUAL (sempre REAL)
    IF NEW.tipo_transacao = 'AJUSTE_MANUAL' THEN
        v_bk_id := COALESCE(NEW.destino_bookmaker_id, NEW.origem_bookmaker_id);
        IF v_bk_id IS NOT NULL THEN
            v_idempotency_key := 'ledger_ajuste_' || NEW.id::TEXT;
            IF NOT EXISTS (SELECT 1 FROM financial_events WHERE idempotency_key = v_idempotency_key) THEN
                SELECT moeda INTO v_bookmaker_record FROM bookmakers WHERE id = v_bk_id;
                v_valor_efetivo := COALESCE(NEW.valor_destino, NEW.valor_origem, NEW.valor);
                IF NEW.ajuste_direcao = 'SAIDA' THEN v_valor_efetivo := -ABS(v_valor_efetivo); END IF;
                INSERT INTO financial_events (bookmaker_id, workspace_id, tipo_evento, tipo_uso, origem, valor, moeda, idempotency_key, descricao, metadata, processed_at, created_by, event_scope)
                VALUES (
                    v_bk_id, NEW.workspace_id, 'AJUSTE', 'NORMAL', 'AJUSTE_MANUAL',
                    v_valor_efetivo, COALESCE(v_bookmaker_record.moeda, NEW.moeda), v_idempotency_key,
                    COALESCE(NEW.descricao, 'Ajuste manual'),
                    jsonb_build_object('ledger_id', NEW.id, 'direcao', NEW.ajuste_direcao),
                    NOW(), NEW.user_id, 'REAL'::public.event_scope
                );
            END IF;
        END IF;
    END IF;

    -- AJUSTE_SALDO (sempre REAL)
    IF NEW.tipo_transacao = 'AJUSTE_SALDO' THEN
        v_bk_id := COALESCE(NEW.destino_bookmaker_id, NEW.origem_bookmaker_id);
        IF v_bk_id IS NOT NULL THEN
            v_idempotency_key := 'ledger_ajuste_saldo_' || NEW.id::TEXT;
            IF NOT EXISTS (SELECT 1 FROM financial_events WHERE idempotency_key = v_idempotency_key) THEN
                SELECT moeda INTO v_bookmaker_record FROM bookmakers WHERE id = v_bk_id;
                v_valor_efetivo := COALESCE(NEW.valor_destino, NEW.valor_origem, NEW.valor);
                IF NEW.ajuste_direcao = 'SAIDA' THEN v_valor_efetivo := -ABS(v_valor_efetivo); END IF;
                INSERT INTO financial_events (bookmaker_id, workspace_id, tipo_evento, tipo_uso, origem, valor, moeda, idempotency_key, descricao, metadata, processed_at, created_by, event_scope)
                VALUES (
                    v_bk_id, NEW.workspace_id, 'AJUSTE', 'NORMAL', 'AJUSTE_SALDO',
                    v_valor_efetivo, COALESCE(v_bookmaker_record.moeda, NEW.moeda), v_idempotency_key,
                    COALESCE(NEW.descricao, 'Ajuste de saldo'),
                    jsonb_build_object('ledger_id', NEW.id, 'direcao', NEW.ajuste_direcao, 'motivo', NEW.ajuste_motivo),
                    NOW(), NEW.user_id, 'REAL'::public.event_scope
                );
            END IF;
        END IF;
    END IF;

    -- AJUSTE_RECONCILIACAO (sempre REAL)
    IF NEW.tipo_transacao = 'AJUSTE_RECONCILIACAO' THEN
        v_bk_id := COALESCE(NEW.destino_bookmaker_id, NEW.origem_bookmaker_id);
        IF v_bk_id IS NOT NULL THEN
            v_idempotency_key := 'ledger_reconciliacao_' || NEW.id::TEXT;
            IF NOT EXISTS (SELECT 1 FROM financial_events WHERE idempotency_key = v_idempotency_key) THEN
                SELECT moeda INTO v_bookmaker_record FROM bookmakers WHERE id = v_bk_id;
                v_valor_efetivo := COALESCE(NEW.valor_destino, NEW.valor_origem, NEW.valor);
                IF NEW.ajuste_direcao = 'SAIDA' THEN v_valor_efetivo := -ABS(v_valor_efetivo); END IF;
                INSERT INTO financial_events (bookmaker_id, workspace_id, tipo_evento, tipo_uso, origem, valor, moeda, idempotency_key, descricao, metadata, processed_at, created_by, event_scope)
                VALUES (
                    v_bk_id, NEW.workspace_id, 'AJUSTE', 'NORMAL', 'AJUSTE_RECONCILIACAO',
                    v_valor_efetivo, COALESCE(v_bookmaker_record.moeda, NEW.moeda), v_idempotency_key,
                    COALESCE(NEW.descricao, 'Reconciliação de saldo'),
                    jsonb_build_object('ledger_id', NEW.id, 'direcao', NEW.ajuste_direcao, 'motivo', NEW.ajuste_motivo, 'tipo', 'RECONCILIACAO'),
                    NOW(), NEW.user_id, 'REAL'::public.event_scope
                );
            END IF;
        END IF;
    END IF;

    -- PERDA_CAMBIAL (sempre REAL) - débito por variação cambial
    IF NEW.tipo_transacao = 'PERDA_CAMBIAL' THEN
        v_bk_id := COALESCE(NEW.origem_bookmaker_id, NEW.destino_bookmaker_id);
        IF v_bk_id IS NOT NULL THEN
            v_idempotency_key := 'ledger_perda_cambial_' || NEW.id::TEXT;
            IF NOT EXISTS (SELECT 1 FROM financial_events WHERE idempotency_key = v_idempotency_key) THEN
                SELECT moeda INTO v_bookmaker_record FROM bookmakers WHERE id = v_bk_id;
                v_valor_efetivo := COALESCE(NEW.valor_origem, NEW.valor);
                INSERT INTO financial_events (bookmaker_id, workspace_id, tipo_evento, tipo_uso, origem, valor, moeda, idempotency_key, descricao, metadata, processed_at, created_by, event_scope)
                VALUES (
                    v_bk_id, NEW.workspace_id, 'AJUSTE', 'NORMAL', 'PERDA_CAMBIAL',
                    -ABS(v_valor_efetivo), COALESCE(v_bookmaker_record.moeda, NEW.moeda), v_idempotency_key,
                    COALESCE(NEW.descricao, 'Perda cambial'),
                    jsonb_build_object('ledger_id', NEW.id, 'tipo', 'FX_LOSS'),
                    NOW(), NEW.user_id, 'REAL'::public.event_scope
                );
            END IF;
        END IF;
    END IF;

    -- GANHO_CAMBIAL (sempre REAL) - crédito por variação cambial
    IF NEW.tipo_transacao = 'GANHO_CAMBIAL' THEN
        v_bk_id := COALESCE(NEW.destino_bookmaker_id, NEW.origem_bookmaker_id);
        IF v_bk_id IS NOT NULL THEN
            v_idempotency_key := 'ledger_ganho_cambial_' || NEW.id::TEXT;
            IF NOT EXISTS (SELECT 1 FROM financial_events WHERE idempotency_key = v_idempotency_key) THEN
                SELECT moeda INTO v_bookmaker_record FROM bookmakers WHERE id = v_bk_id;
                v_valor_efetivo := COALESCE(NEW.valor_destino, NEW.valor);
                INSERT INTO financial_events (bookmaker_id, workspace_id, tipo_evento, tipo_uso, origem, valor, moeda, idempotency_key, descricao, metadata, processed_at, created_by, event_scope)
                VALUES (
                    v_bk_id, NEW.workspace_id, 'AJUSTE', 'NORMAL', 'GANHO_CAMBIAL',
                    ABS(v_valor_efetivo), COALESCE(v_bookmaker_record.moeda, NEW.moeda), v_idempotency_key,
                    COALESCE(NEW.descricao, 'Ganho cambial'),
                    jsonb_build_object('ledger_id', NEW.id, 'tipo', 'FX_GAIN'),
                    NOW(), NEW.user_id, 'REAL'::public.event_scope
                );
            END IF;
        END IF;
    END IF;

    -- PERDA_OPERACIONAL (sempre REAL) - débito por perda operacional
    IF NEW.tipo_transacao = 'PERDA_OPERACIONAL' THEN
        v_bk_id := COALESCE(NEW.origem_bookmaker_id, NEW.destino_bookmaker_id);
        IF v_bk_id IS NOT NULL THEN
            v_idempotency_key := 'ledger_perda_operacional_' || NEW.id::TEXT;
            IF NOT EXISTS (SELECT 1 FROM financial_events WHERE idempotency_key = v_idempotency_key) THEN
                SELECT moeda INTO v_bookmaker_record FROM bookmakers WHERE id = v_bk_id;
                v_valor_efetivo := COALESCE(NEW.valor_origem, NEW.valor);
                INSERT INTO financial_events (bookmaker_id, workspace_id, tipo_evento, tipo_uso, origem, valor, moeda, idempotency_key, descricao, metadata, processed_at, created_by, event_scope)
                VALUES (
                    v_bk_id, NEW.workspace_id, 'AJUSTE', 'NORMAL', 'PERDA_OPERACIONAL',
                    -ABS(v_valor_efetivo), COALESCE(v_bookmaker_record.moeda, NEW.moeda), v_idempotency_key,
                    COALESCE(NEW.descricao, 'Perda operacional'),
                    jsonb_build_object('ledger_id', NEW.id),
                    NOW(), NEW.user_id, 'REAL'::public.event_scope
                );
            END IF;
        END IF;
    END IF;

    -- PERDA_REVERSAO (sempre REAL) - crédito ao reverter perda
    IF NEW.tipo_transacao = 'PERDA_REVERSAO' THEN
        v_bk_id := COALESCE(NEW.destino_bookmaker_id, NEW.origem_bookmaker_id);
        IF v_bk_id IS NOT NULL THEN
            v_idempotency_key := 'ledger_perda_reversao_' || NEW.id::TEXT;
            IF NOT EXISTS (SELECT 1 FROM financial_events WHERE idempotency_key = v_idempotency_key) THEN
                SELECT moeda INTO v_bookmaker_record FROM bookmakers WHERE id = v_bk_id;
                v_valor_efetivo := COALESCE(NEW.valor_destino, NEW.valor);
                INSERT INTO financial_events (bookmaker_id, workspace_id, tipo_evento, tipo_uso, origem, valor, moeda, idempotency_key, descricao, metadata, processed_at, created_by, event_scope)
                VALUES (
                    v_bk_id, NEW.workspace_id, 'AJUSTE', 'NORMAL', 'PERDA_REVERSAO',
                    ABS(v_valor_efetivo), COALESCE(v_bookmaker_record.moeda, NEW.moeda), v_idempotency_key,
                    COALESCE(NEW.descricao, 'Reversão de perda'),
                    jsonb_build_object('ledger_id', NEW.id),
                    NOW(), NEW.user_id, 'REAL'::public.event_scope
                );
            END IF;
        END IF;
    END IF;

    -- APOSTA_GREEN (legado, sempre REAL) - crédito de aposta ganha
    IF NEW.tipo_transacao = 'APOSTA_GREEN' THEN
        v_bk_id := COALESCE(NEW.destino_bookmaker_id, NEW.origem_bookmaker_id);
        IF v_bk_id IS NOT NULL THEN
            v_idempotency_key := 'ledger_aposta_green_' || NEW.id::TEXT;
            IF NOT EXISTS (SELECT 1 FROM financial_events WHERE idempotency_key = v_idempotency_key) THEN
                SELECT moeda INTO v_bookmaker_record FROM bookmakers WHERE id = v_bk_id;
                v_valor_efetivo := COALESCE(NEW.valor_destino, NEW.valor);
                INSERT INTO financial_events (bookmaker_id, workspace_id, tipo_evento, tipo_uso, origem, valor, moeda, idempotency_key, descricao, metadata, processed_at, created_by, event_scope)
                VALUES (
                    v_bk_id, NEW.workspace_id, 'PAYOUT', 'NORMAL', 'APOSTA_GREEN',
                    ABS(v_valor_efetivo), COALESCE(v_bookmaker_record.moeda, NEW.moeda), v_idempotency_key,
                    COALESCE(NEW.descricao, 'Aposta green (legado)'),
                    jsonb_build_object('ledger_id', NEW.id),
                    NOW(), NEW.user_id, 'REAL'::public.event_scope
                );
            END IF;
        END IF;
    END IF;

    -- APOSTA_REVERSAO (legado, sempre REAL) - débito de reversão
    IF NEW.tipo_transacao = 'APOSTA_REVERSAO' THEN
        v_bk_id := COALESCE(NEW.origem_bookmaker_id, NEW.destino_bookmaker_id);
        IF v_bk_id IS NOT NULL THEN
            v_idempotency_key := 'ledger_aposta_reversao_' || NEW.id::TEXT;
            IF NOT EXISTS (SELECT 1 FROM financial_events WHERE idempotency_key = v_idempotency_key) THEN
                SELECT moeda INTO v_bookmaker_record FROM bookmakers WHERE id = v_bk_id;
                v_valor_efetivo := COALESCE(NEW.valor_origem, NEW.valor);
                INSERT INTO financial_events (bookmaker_id, workspace_id, tipo_evento, tipo_uso, origem, valor, moeda, idempotency_key, descricao, metadata, processed_at, created_by, event_scope)
                VALUES (
                    v_bk_id, NEW.workspace_id, 'REVERSAL', 'NORMAL', 'APOSTA_REVERSAO',
                    -ABS(v_valor_efetivo), COALESCE(v_bookmaker_record.moeda, NEW.moeda), v_idempotency_key,
                    COALESCE(NEW.descricao, 'Reversão de aposta (legado)'),
                    jsonb_build_object('ledger_id', NEW.id),
                    NOW(), NEW.user_id, 'REAL'::public.event_scope
                );
            END IF;
        END IF;
    END IF;

    -- FREEBET_CREDIT (sempre REAL)
    IF NEW.tipo_transacao = 'FREEBET_CREDIT' AND NEW.destino_bookmaker_id IS NOT NULL THEN
        v_idempotency_key := 'ledger_freebet_' || NEW.id::TEXT;
        IF NOT EXISTS (SELECT 1 FROM financial_events WHERE idempotency_key = v_idempotency_key) THEN
            SELECT moeda INTO v_bookmaker_record FROM bookmakers WHERE id = NEW.destino_bookmaker_id;
            v_valor_efetivo := COALESCE(NEW.valor_destino, NEW.valor);
            INSERT INTO financial_events (bookmaker_id, workspace_id, tipo_evento, tipo_uso, origem, valor, moeda, idempotency_key, descricao, metadata, processed_at, created_by, event_scope)
            VALUES (
                NEW.destino_bookmaker_id, NEW.workspace_id, 'FREEBET_CREDIT', 'FREEBET', 'FREEBET_CREDIT',
                v_valor_efetivo, COALESCE(v_bookmaker_record.moeda, NEW.moeda), v_idempotency_key,
                COALESCE(NEW.descricao, 'Freebet creditado'),
                jsonb_build_object('ledger_id', NEW.id), NOW(), NEW.user_id, 'REAL'::public.event_scope
            );
        END IF;
    END IF;

    NEW.financial_events_generated := TRUE;
    NEW.balance_processed_at := NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- 2. Retrofix: BONUS_ESTORNO orphans
INSERT INTO financial_events (bookmaker_id, workspace_id, tipo_evento, tipo_uso, origem, valor, moeda, idempotency_key, descricao, metadata, created_by, event_scope)
SELECT 
    cl.origem_bookmaker_id,
    cl.workspace_id, 'REVERSAL', 'NORMAL', 'BONUS_ESTORNO',
    -ABS(COALESCE(cl.valor_origem, cl.valor)),
    cl.moeda, 'ledger_bonus_estorno_' || cl.id::TEXT,
    cl.descricao,
    jsonb_build_object('ledger_id', cl.id, 'retrofix', true),
    cl.user_id, 'REAL'::public.event_scope
FROM cash_ledger cl
WHERE cl.tipo_transacao = 'BONUS_ESTORNO' AND cl.status = 'CONFIRMADO'
  AND cl.origem_bookmaker_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM financial_events fe WHERE fe.idempotency_key = 'ledger_bonus_estorno_' || cl.id::TEXT);

-- 3. Retrofix: PERDA_CAMBIAL orphans
INSERT INTO financial_events (bookmaker_id, workspace_id, tipo_evento, tipo_uso, origem, valor, moeda, idempotency_key, descricao, metadata, created_by, event_scope)
SELECT 
    COALESCE(cl.origem_bookmaker_id, cl.destino_bookmaker_id),
    cl.workspace_id, 'AJUSTE', 'NORMAL', 'PERDA_CAMBIAL',
    -ABS(COALESCE(cl.valor_origem, cl.valor)),
    cl.moeda, 'ledger_perda_cambial_' || cl.id::TEXT,
    cl.descricao,
    jsonb_build_object('ledger_id', cl.id, 'tipo', 'FX_LOSS', 'retrofix', true),
    cl.user_id, 'REAL'::public.event_scope
FROM cash_ledger cl
WHERE cl.tipo_transacao = 'PERDA_CAMBIAL' AND cl.status = 'CONFIRMADO'
  AND (cl.origem_bookmaker_id IS NOT NULL OR cl.destino_bookmaker_id IS NOT NULL)
  AND NOT EXISTS (SELECT 1 FROM financial_events fe WHERE fe.idempotency_key = 'ledger_perda_cambial_' || cl.id::TEXT);

-- 4. Retrofix: GANHO_CAMBIAL orphans
INSERT INTO financial_events (bookmaker_id, workspace_id, tipo_evento, tipo_uso, origem, valor, moeda, idempotency_key, descricao, metadata, created_by, event_scope)
SELECT 
    COALESCE(cl.destino_bookmaker_id, cl.origem_bookmaker_id),
    cl.workspace_id, 'AJUSTE', 'NORMAL', 'GANHO_CAMBIAL',
    ABS(COALESCE(cl.valor_destino, cl.valor)),
    cl.moeda, 'ledger_ganho_cambial_' || cl.id::TEXT,
    cl.descricao,
    jsonb_build_object('ledger_id', cl.id, 'tipo', 'FX_GAIN', 'retrofix', true),
    cl.user_id, 'REAL'::public.event_scope
FROM cash_ledger cl
WHERE cl.tipo_transacao = 'GANHO_CAMBIAL' AND cl.status = 'CONFIRMADO'
  AND (cl.origem_bookmaker_id IS NOT NULL OR cl.destino_bookmaker_id IS NOT NULL)
  AND NOT EXISTS (SELECT 1 FROM financial_events fe WHERE fe.idempotency_key = 'ledger_ganho_cambial_' || cl.id::TEXT);

-- 5. Retrofix: PERDA_OPERACIONAL orphans
INSERT INTO financial_events (bookmaker_id, workspace_id, tipo_evento, tipo_uso, origem, valor, moeda, idempotency_key, descricao, metadata, created_by, event_scope)
SELECT 
    COALESCE(cl.origem_bookmaker_id, cl.destino_bookmaker_id),
    cl.workspace_id, 'AJUSTE', 'NORMAL', 'PERDA_OPERACIONAL',
    -ABS(COALESCE(cl.valor_origem, cl.valor)),
    cl.moeda, 'ledger_perda_operacional_' || cl.id::TEXT,
    cl.descricao,
    jsonb_build_object('ledger_id', cl.id, 'retrofix', true),
    cl.user_id, 'REAL'::public.event_scope
FROM cash_ledger cl
WHERE cl.tipo_transacao = 'PERDA_OPERACIONAL' AND cl.status = 'CONFIRMADO'
  AND (cl.origem_bookmaker_id IS NOT NULL OR cl.destino_bookmaker_id IS NOT NULL)
  AND NOT EXISTS (SELECT 1 FROM financial_events fe WHERE fe.idempotency_key = 'ledger_perda_operacional_' || cl.id::TEXT);

-- 6. Retrofix: PERDA_REVERSAO orphans
INSERT INTO financial_events (bookmaker_id, workspace_id, tipo_evento, tipo_uso, origem, valor, moeda, idempotency_key, descricao, metadata, created_by, event_scope)
SELECT 
    COALESCE(cl.destino_bookmaker_id, cl.origem_bookmaker_id),
    cl.workspace_id, 'AJUSTE', 'NORMAL', 'PERDA_REVERSAO',
    ABS(COALESCE(cl.valor_destino, cl.valor)),
    cl.moeda, 'ledger_perda_reversao_' || cl.id::TEXT,
    cl.descricao,
    jsonb_build_object('ledger_id', cl.id, 'retrofix', true),
    cl.user_id, 'REAL'::public.event_scope
FROM cash_ledger cl
WHERE cl.tipo_transacao = 'PERDA_REVERSAO' AND cl.status = 'CONFIRMADO'
  AND (cl.origem_bookmaker_id IS NOT NULL OR cl.destino_bookmaker_id IS NOT NULL)
  AND NOT EXISTS (SELECT 1 FROM financial_events fe WHERE fe.idempotency_key = 'ledger_perda_reversao_' || cl.id::TEXT);

-- 7. Retrofix: APOSTA_GREEN orphan
INSERT INTO financial_events (bookmaker_id, workspace_id, tipo_evento, tipo_uso, origem, valor, moeda, idempotency_key, descricao, metadata, created_by, event_scope)
SELECT 
    COALESCE(cl.destino_bookmaker_id, cl.origem_bookmaker_id),
    cl.workspace_id, 'PAYOUT', 'NORMAL', 'APOSTA_GREEN',
    ABS(COALESCE(cl.valor_destino, cl.valor)),
    cl.moeda, 'ledger_aposta_green_' || cl.id::TEXT,
    cl.descricao,
    jsonb_build_object('ledger_id', cl.id, 'retrofix', true),
    cl.user_id, 'REAL'::public.event_scope
FROM cash_ledger cl
WHERE cl.tipo_transacao = 'APOSTA_GREEN' AND cl.status = 'CONFIRMADO'
  AND (cl.origem_bookmaker_id IS NOT NULL OR cl.destino_bookmaker_id IS NOT NULL)
  AND NOT EXISTS (SELECT 1 FROM financial_events fe WHERE fe.idempotency_key = 'ledger_aposta_green_' || cl.id::TEXT);

-- 8. Retrofix: APOSTA_REVERSAO orphan
INSERT INTO financial_events (bookmaker_id, workspace_id, tipo_evento, tipo_uso, origem, valor, moeda, idempotency_key, descricao, metadata, created_by, event_scope)
SELECT 
    COALESCE(cl.origem_bookmaker_id, cl.destino_bookmaker_id),
    cl.workspace_id, 'REVERSAL', 'NORMAL', 'APOSTA_REVERSAO',
    -ABS(COALESCE(cl.valor_origem, cl.valor)),
    cl.moeda, 'ledger_aposta_reversao_' || cl.id::TEXT,
    cl.descricao,
    jsonb_build_object('ledger_id', cl.id, 'retrofix', true),
    cl.user_id, 'REAL'::public.event_scope
FROM cash_ledger cl
WHERE cl.tipo_transacao = 'APOSTA_REVERSAO' AND cl.status = 'CONFIRMADO'
  AND (cl.origem_bookmaker_id IS NOT NULL OR cl.destino_bookmaker_id IS NOT NULL)
  AND NOT EXISTS (SELECT 1 FROM financial_events fe WHERE fe.idempotency_key = 'ledger_aposta_reversao_' || cl.id::TEXT);
