-- Hotfix: impedir que reprocessamentos reativem ajustes técnicos legados
-- e restaurar o estado anterior das casas ressuscitadas às 19:52 de 2026-03-21.

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
    IF NEW.status != 'CONFIRMADO' THEN
        RETURN NEW;
    END IF;
    IF NEW.financial_events_generated = TRUE THEN
        RETURN NEW;
    END IF;

    -- Ignorar ajustes técnicos legados usados apenas para reset operacional / dados de teste.
    -- Esses lançamentos históricos não podem mais regenerar saldo em reprocessamentos.
    IF NEW.tipo_transacao = 'AJUSTE_SALDO'
       AND COALESCE(NEW.descricao, '') ILIKE 'Reconciliação: reset saldo negativo para zero%'
    THEN
        NEW.financial_events_generated := TRUE;
        NEW.balance_processed_at := NOW();
        RETURN NEW;
    END IF;

    IF NEW.tipo_transacao IN ('DEPOSITO', 'DEPOSITO_VIRTUAL') AND NEW.destino_bookmaker_id IS NOT NULL THEN
        v_idempotency_key := 'ledger_deposit_' || NEW.id::TEXT;
        IF NOT EXISTS (SELECT 1 FROM financial_events WHERE idempotency_key = v_idempotency_key) THEN
            SELECT moeda INTO v_bookmaker_record FROM bookmakers WHERE id = NEW.destino_bookmaker_id;
            v_valor_efetivo := COALESCE(NEW.valor_destino, NEW.valor);
            INSERT INTO financial_events (bookmaker_id, workspace_id, tipo_evento, tipo_uso, origem, valor, moeda, idempotency_key, descricao, metadata, processed_at, created_by)
            VALUES (
                NEW.destino_bookmaker_id,
                NEW.workspace_id,
                'DEPOSITO',
                'NORMAL',
                NEW.tipo_transacao,
                v_valor_efetivo,
                COALESCE(v_bookmaker_record.moeda, NEW.moeda),
                v_idempotency_key,
                CASE WHEN NEW.tipo_transacao = 'DEPOSITO_VIRTUAL' THEN 'Baseline broker via DEPOSITO_VIRTUAL #' ELSE 'Depósito via cash_ledger #' END || NEW.id::TEXT,
                jsonb_build_object('ledger_id', NEW.id),
                NOW(),
                NEW.user_id
            );
        END IF;
    END IF;

    IF NEW.tipo_transacao IN ('SAQUE', 'SAQUE_VIRTUAL') AND NEW.origem_bookmaker_id IS NOT NULL THEN
        v_idempotency_key := 'ledger_withdraw_' || NEW.id::TEXT;
        IF NOT EXISTS (SELECT 1 FROM financial_events WHERE idempotency_key = v_idempotency_key) THEN
            SELECT moeda INTO v_bookmaker_record FROM bookmakers WHERE id = NEW.origem_bookmaker_id;
            v_valor_efetivo := COALESCE(NEW.valor_origem, NEW.valor);
            INSERT INTO financial_events (bookmaker_id, workspace_id, tipo_evento, tipo_uso, origem, valor, moeda, idempotency_key, descricao, metadata, processed_at, created_by)
            VALUES (
                NEW.origem_bookmaker_id,
                NEW.workspace_id,
                'SAQUE',
                'NORMAL',
                NULL,
                -v_valor_efetivo,
                COALESCE(v_bookmaker_record.moeda, NEW.moeda),
                v_idempotency_key,
                'Saque via cash_ledger #' || NEW.id::TEXT,
                jsonb_build_object('ledger_id', NEW.id),
                NOW(),
                NEW.user_id
            );
        END IF;
    END IF;

    IF NEW.tipo_transacao = 'BONUS_CREDITADO' AND NEW.destino_bookmaker_id IS NOT NULL THEN
        v_idempotency_key := 'ledger_bonus_' || NEW.id::TEXT;
        IF NOT EXISTS (SELECT 1 FROM financial_events WHERE idempotency_key = v_idempotency_key) THEN
            SELECT moeda INTO v_bookmaker_record FROM bookmakers WHERE id = NEW.destino_bookmaker_id;
            v_valor_efetivo := COALESCE(NEW.valor_destino, NEW.valor);
            INSERT INTO financial_events (bookmaker_id, workspace_id, tipo_evento, tipo_uso, origem, valor, moeda, idempotency_key, descricao, metadata, processed_at, created_by)
            VALUES (
                NEW.destino_bookmaker_id,
                NEW.workspace_id,
                'BONUS',
                'NORMAL',
                'BONUS_CREDITADO',
                v_valor_efetivo,
                COALESCE(v_bookmaker_record.moeda, NEW.moeda),
                v_idempotency_key,
                COALESCE(NEW.descricao, 'Bônus via cash_ledger'),
                jsonb_build_object('ledger_id', NEW.id),
                NOW(),
                NEW.user_id
            );
        END IF;
    END IF;

    IF NEW.tipo_transacao = 'CASHBACK_MANUAL' AND NEW.destino_bookmaker_id IS NOT NULL THEN
        v_idempotency_key := 'ledger_cashback_' || NEW.id::TEXT;
        IF NOT EXISTS (SELECT 1 FROM financial_events WHERE idempotency_key = v_idempotency_key) THEN
            SELECT moeda INTO v_bookmaker_record FROM bookmakers WHERE id = NEW.destino_bookmaker_id;
            v_valor_efetivo := COALESCE(NEW.valor_destino, NEW.valor);
            INSERT INTO financial_events (bookmaker_id, workspace_id, tipo_evento, tipo_uso, origem, valor, moeda, idempotency_key, descricao, metadata, processed_at, created_by)
            VALUES (
                NEW.destino_bookmaker_id,
                NEW.workspace_id,
                'CASHBACK',
                'NORMAL',
                'CASHBACK_MANUAL',
                v_valor_efetivo,
                COALESCE(v_bookmaker_record.moeda, NEW.moeda),
                v_idempotency_key,
                COALESCE(NEW.descricao, 'Cashback via cash_ledger'),
                jsonb_build_object('ledger_id', NEW.id),
                NOW(),
                NEW.user_id
            );
        END IF;
    END IF;

    IF NEW.tipo_transacao = 'CASHBACK_ESTORNO' AND NEW.origem_bookmaker_id IS NOT NULL THEN
        v_idempotency_key := 'ledger_cashback_estorno_' || NEW.id::TEXT;
        IF NOT EXISTS (SELECT 1 FROM financial_events WHERE idempotency_key = v_idempotency_key) THEN
            SELECT moeda INTO v_bookmaker_record FROM bookmakers WHERE id = NEW.origem_bookmaker_id;
            v_valor_efetivo := COALESCE(NEW.valor_origem, NEW.valor);
            INSERT INTO financial_events (bookmaker_id, workspace_id, tipo_evento, tipo_uso, origem, valor, moeda, idempotency_key, descricao, metadata, processed_at, created_by)
            VALUES (
                NEW.origem_bookmaker_id,
                NEW.workspace_id,
                'CASHBACK',
                'NORMAL',
                'CASHBACK_ESTORNO',
                -v_valor_efetivo,
                COALESCE(v_bookmaker_record.moeda, NEW.moeda),
                v_idempotency_key,
                COALESCE(NEW.descricao, 'Estorno cashback via cash_ledger'),
                jsonb_build_object('ledger_id', NEW.id),
                NOW(),
                NEW.user_id
            );
        END IF;
    END IF;

    IF NEW.tipo_transacao = 'GIRO_GRATIS' AND NEW.destino_bookmaker_id IS NOT NULL THEN
        v_idempotency_key := 'ledger_giro_' || NEW.id::TEXT;
        IF NOT EXISTS (SELECT 1 FROM financial_events WHERE idempotency_key = v_idempotency_key) THEN
            SELECT moeda INTO v_bookmaker_record FROM bookmakers WHERE id = NEW.destino_bookmaker_id;
            v_valor_efetivo := COALESCE(NEW.valor_destino, NEW.valor);
            INSERT INTO financial_events (bookmaker_id, workspace_id, tipo_evento, tipo_uso, origem, valor, moeda, idempotency_key, descricao, metadata, processed_at, created_by)
            VALUES (
                NEW.destino_bookmaker_id,
                NEW.workspace_id,
                'PAYOUT',
                'NORMAL',
                'GIRO_GRATIS',
                v_valor_efetivo,
                COALESCE(v_bookmaker_record.moeda, NEW.moeda),
                v_idempotency_key,
                COALESCE(NEW.descricao, 'Giro grátis via cash_ledger'),
                jsonb_build_object('ledger_id', NEW.id),
                NOW(),
                NEW.user_id
            );
        END IF;
    END IF;

    IF NEW.tipo_transacao = 'AJUSTE_MANUAL' THEN
        v_bk_id := COALESCE(NEW.destino_bookmaker_id, NEW.origem_bookmaker_id);
        IF v_bk_id IS NOT NULL THEN
            v_idempotency_key := 'ledger_ajuste_' || NEW.id::TEXT;
            IF NOT EXISTS (SELECT 1 FROM financial_events WHERE idempotency_key = v_idempotency_key) THEN
                SELECT moeda INTO v_bookmaker_record FROM bookmakers WHERE id = v_bk_id;
                v_valor_efetivo := COALESCE(NEW.valor_destino, NEW.valor_origem, NEW.valor);
                IF NEW.ajuste_direcao = 'SAIDA' THEN v_valor_efetivo := -ABS(v_valor_efetivo); END IF;
                INSERT INTO financial_events (bookmaker_id, workspace_id, tipo_evento, tipo_uso, origem, valor, moeda, idempotency_key, descricao, metadata, processed_at, created_by)
                VALUES (
                    v_bk_id,
                    NEW.workspace_id,
                    'AJUSTE',
                    'NORMAL',
                    'AJUSTE_MANUAL',
                    v_valor_efetivo,
                    COALESCE(v_bookmaker_record.moeda, NEW.moeda),
                    v_idempotency_key,
                    COALESCE(NEW.descricao, 'Ajuste manual'),
                    jsonb_build_object('ledger_id', NEW.id, 'direcao', NEW.ajuste_direcao),
                    NOW(),
                    NEW.user_id
                );
            END IF;
        END IF;
    END IF;

    IF NEW.tipo_transacao = 'AJUSTE_SALDO' THEN
        v_bk_id := COALESCE(NEW.destino_bookmaker_id, NEW.origem_bookmaker_id);
        IF v_bk_id IS NOT NULL THEN
            v_idempotency_key := 'ledger_ajuste_saldo_' || NEW.id::TEXT;
            IF NOT EXISTS (SELECT 1 FROM financial_events WHERE idempotency_key = v_idempotency_key) THEN
                SELECT moeda INTO v_bookmaker_record FROM bookmakers WHERE id = v_bk_id;
                v_valor_efetivo := COALESCE(NEW.valor_destino, NEW.valor_origem, NEW.valor);
                IF NEW.ajuste_direcao = 'SAIDA' THEN v_valor_efetivo := -ABS(v_valor_efetivo); END IF;
                INSERT INTO financial_events (bookmaker_id, workspace_id, tipo_evento, tipo_uso, origem, valor, moeda, idempotency_key, descricao, metadata, processed_at, created_by)
                VALUES (
                    v_bk_id,
                    NEW.workspace_id,
                    'AJUSTE',
                    'NORMAL',
                    'AJUSTE_SALDO',
                    v_valor_efetivo,
                    COALESCE(v_bookmaker_record.moeda, NEW.moeda),
                    v_idempotency_key,
                    COALESCE(NEW.descricao, 'Ajuste de saldo'),
                    jsonb_build_object('ledger_id', NEW.id, 'direcao', NEW.ajuste_direcao),
                    NOW(),
                    NEW.user_id
                );
            END IF;
        END IF;
    END IF;

    IF NEW.tipo_transacao = 'AJUSTE_RECONCILIACAO' THEN
        v_bk_id := COALESCE(NEW.destino_bookmaker_id, NEW.origem_bookmaker_id);
        IF v_bk_id IS NOT NULL THEN
            v_idempotency_key := 'ledger_reconciliacao_' || NEW.id::TEXT;
            IF NOT EXISTS (SELECT 1 FROM financial_events WHERE idempotency_key = v_idempotency_key) THEN
                SELECT moeda INTO v_bookmaker_record FROM bookmakers WHERE id = v_bk_id;
                v_valor_efetivo := COALESCE(NEW.valor_destino, NEW.valor_origem, NEW.valor);
                IF NEW.ajuste_direcao = 'SAIDA' THEN v_valor_efetivo := -ABS(v_valor_efetivo); END IF;
                INSERT INTO financial_events (bookmaker_id, workspace_id, tipo_evento, tipo_uso, origem, valor, moeda, idempotency_key, descricao, metadata, processed_at, created_by)
                VALUES (
                    v_bk_id,
                    NEW.workspace_id,
                    'AJUSTE',
                    'NORMAL',
                    'AJUSTE_RECONCILIACAO',
                    v_valor_efetivo,
                    COALESCE(v_bookmaker_record.moeda, NEW.moeda),
                    v_idempotency_key,
                    COALESCE(NEW.descricao, 'Reconciliação de saldo'),
                    jsonb_build_object('ledger_id', NEW.id, 'direcao', NEW.ajuste_direcao),
                    NOW(),
                    NEW.user_id
                );
            END IF;
        END IF;
    END IF;

    IF NEW.tipo_transacao = 'PERDA_OPERACIONAL' AND NEW.origem_bookmaker_id IS NOT NULL THEN
        v_idempotency_key := 'ledger_perda_' || NEW.id::TEXT;
        IF NOT EXISTS (SELECT 1 FROM financial_events WHERE idempotency_key = v_idempotency_key) THEN
            SELECT moeda INTO v_bookmaker_record FROM bookmakers WHERE id = NEW.origem_bookmaker_id;
            v_valor_efetivo := COALESCE(NEW.valor_origem, NEW.valor);
            INSERT INTO financial_events (bookmaker_id, workspace_id, tipo_evento, tipo_uso, origem, valor, moeda, idempotency_key, descricao, metadata, processed_at, created_by)
            VALUES (
                NEW.origem_bookmaker_id,
                NEW.workspace_id,
                'AJUSTE',
                'NORMAL',
                'PERDA_OPERACIONAL',
                -v_valor_efetivo,
                COALESCE(v_bookmaker_record.moeda, NEW.moeda),
                v_idempotency_key,
                COALESCE(NEW.descricao, 'Perda operacional'),
                jsonb_build_object('ledger_id', NEW.id),
                NOW(),
                NEW.user_id
            );
        END IF;
    END IF;

    NEW.financial_events_generated := TRUE;
    NEW.balance_processed_at := NOW();
    RETURN NEW;
END;
$$;

-- Remover financial_events retroativos indevidos criados pela correção de 2026-03-21 19:52
DELETE FROM public.financial_events fe
USING public.cash_ledger cl
WHERE fe.metadata ->> 'ledger_id' = cl.id::text
  AND fe.origem = 'AJUSTE_SALDO'
  AND cl.tipo_transacao = 'AJUSTE_SALDO'
  AND COALESCE(cl.descricao, '') ILIKE 'Reconciliação: reset saldo negativo para zero%'
  AND fe.created_at >= '2026-03-21 19:52:00+00';

-- Recalcular os saldos após a limpeza dos eventos retroativos indevidos
DO $$
DECLARE
    r RECORD;
    v_new_balance NUMERIC;
    v_new_freebet NUMERIC;
BEGIN
    FOR r IN
        SELECT DISTINCT fe.bookmaker_id
        FROM public.financial_events fe
        WHERE fe.workspace_id = 'feee9758-a7f4-474c-b2b1-679b66ec1cd9'
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
        WHERE id = r.bookmaker_id;
    END LOOP;
END;
$$;