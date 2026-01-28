
-- CORREÇÃO: Remover UPDATE direto de saldo no trigger fn_cash_ledger_generate_financial_events
-- O saldo deve ser atualizado APENAS pelo trigger fn_financial_events_sync_balance
-- Arquitetura: cash_ledger → financial_events → (trigger) → bookmakers.saldo_*

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
    -- Só processa transações CONFIRMADAS
    IF NEW.status != 'CONFIRMADO' THEN
        RETURN NEW;
    END IF;

    -- Idempotência: não reprocessar
    IF NEW.financial_events_generated = TRUE THEN
        RETURN NEW;
    END IF;

    -- DEPÓSITO
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
                v_valor_efetivo, COALESCE(v_bookmaker_record.moeda, NEW.moeda),
                v_idempotency_key,
                'Depósito via cash_ledger #' || NEW.id::TEXT,
                jsonb_build_object('ledger_id', NEW.id, 'tipo_transacao', NEW.tipo_transacao),
                NOW(), NEW.user_id
            );
            -- REMOVIDO: UPDATE direto em bookmakers.saldo_atual
            -- O saldo será atualizado pelo trigger tr_financial_events_sync_balance
        END IF;
    END IF;

    -- SAQUE
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
                v_valor_efetivo, COALESCE(v_bookmaker_record.moeda, NEW.moeda),
                v_idempotency_key,
                'Saque via cash_ledger #' || NEW.id::TEXT,
                jsonb_build_object('ledger_id', NEW.id, 'tipo_transacao', NEW.tipo_transacao),
                NOW(), NEW.user_id
            );
            -- REMOVIDO: UPDATE direto em bookmakers.saldo_atual
        END IF;
    END IF;

    -- BONUS / FREEBET
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
                CASE WHEN NEW.usar_freebet = TRUE THEN 'FREEBET_CREDIT' ELSE 'BONUS' END,
                CASE WHEN NEW.usar_freebet = TRUE THEN 'FREEBET' ELSE 'NORMAL' END,
                'BONUS',
                v_valor_efetivo, COALESCE(v_bookmaker_record.moeda, NEW.moeda),
                v_idempotency_key,
                'Bônus via cash_ledger #' || NEW.id::TEXT,
                jsonb_build_object('ledger_id', NEW.id, 'evento_tipo', NEW.evento_promocional_tipo),
                NOW(), NEW.user_id
            );
            -- REMOVIDO: UPDATE direto em bookmakers.saldo_* 
        END IF;
    END IF;

    -- GIRO_GRATIS (Payout de spin promocional)
    IF NEW.tipo_transacao = 'GIRO_GRATIS' AND NEW.destino_bookmaker_id IS NOT NULL THEN
        v_idempotency_key := 'ledger_spin_' || NEW.id::TEXT;
        IF NOT EXISTS (SELECT 1 FROM financial_events WHERE idempotency_key = v_idempotency_key) THEN
            SELECT moeda INTO v_bookmaker_record FROM bookmakers WHERE id = NEW.destino_bookmaker_id;
            v_valor_efetivo := COALESCE(NEW.valor_destino, NEW.valor);
            INSERT INTO financial_events (
                bookmaker_id, workspace_id, tipo_evento, tipo_uso, origem,
                valor, moeda, idempotency_key, descricao, metadata, processed_at, created_by
            ) VALUES (
                NEW.destino_bookmaker_id, NEW.workspace_id,
                'PAYOUT', 'NORMAL', 'GIRO_GRATIS',
                v_valor_efetivo, COALESCE(v_bookmaker_record.moeda, NEW.moeda),
                v_idempotency_key,
                'Giro grátis via cash_ledger #' || NEW.id::TEXT,
                jsonb_build_object('ledger_id', NEW.id),
                NOW(), NEW.user_id
            );
            -- REMOVIDO: UPDATE direto
        END IF;
    END IF;

    -- CASHBACK_MANUAL
    IF NEW.tipo_transacao = 'CASHBACK_MANUAL' AND NEW.destino_bookmaker_id IS NOT NULL THEN
        v_idempotency_key := 'ledger_cashback_' || NEW.id::TEXT;
        IF NOT EXISTS (SELECT 1 FROM financial_events WHERE idempotency_key = v_idempotency_key) THEN
            SELECT moeda INTO v_bookmaker_record FROM bookmakers WHERE id = NEW.destino_bookmaker_id;
            v_valor_efetivo := COALESCE(NEW.valor_destino, NEW.valor);
            INSERT INTO financial_events (
                bookmaker_id, workspace_id, tipo_evento, tipo_uso, origem,
                valor, moeda, idempotency_key, descricao, metadata, processed_at, created_by
            ) VALUES (
                NEW.destino_bookmaker_id, NEW.workspace_id,
                'CASHBACK', 'NORMAL', 'CASHBACK',
                v_valor_efetivo, COALESCE(v_bookmaker_record.moeda, NEW.moeda),
                v_idempotency_key,
                'Cashback via cash_ledger #' || NEW.id::TEXT,
                jsonb_build_object('ledger_id', NEW.id),
                NOW(), NEW.user_id
            );
            -- REMOVIDO: UPDATE direto
        END IF;
    END IF;

    -- AJUSTE_MANUAL
    IF NEW.tipo_transacao = 'AJUSTE_MANUAL' AND (NEW.destino_bookmaker_id IS NOT NULL OR NEW.origem_bookmaker_id IS NOT NULL) THEN
        DECLARE
            v_target_bookmaker_id UUID;
            v_ajuste_valor NUMERIC;
        BEGIN
            IF NEW.ajuste_direcao = 'ENTRADA' THEN
                v_target_bookmaker_id := NEW.destino_bookmaker_id;
                v_ajuste_valor := COALESCE(NEW.valor_destino, NEW.valor);
            ELSE
                v_target_bookmaker_id := NEW.origem_bookmaker_id;
                v_ajuste_valor := -COALESCE(NEW.valor_origem, NEW.valor);
            END IF;
            
            IF v_target_bookmaker_id IS NOT NULL THEN
                v_idempotency_key := 'ledger_ajuste_' || NEW.id::TEXT;
                IF NOT EXISTS (SELECT 1 FROM financial_events WHERE idempotency_key = v_idempotency_key) THEN
                    SELECT moeda INTO v_bookmaker_record FROM bookmakers WHERE id = v_target_bookmaker_id;
                    INSERT INTO financial_events (
                        bookmaker_id, workspace_id, tipo_evento, tipo_uso, origem,
                        valor, moeda, idempotency_key, descricao, metadata, processed_at, created_by
                    ) VALUES (
                        v_target_bookmaker_id, NEW.workspace_id,
                        'AJUSTE', 'NORMAL', 'AJUSTE_MANUAL',
                        v_ajuste_valor, COALESCE(v_bookmaker_record.moeda, NEW.moeda),
                        v_idempotency_key,
                        'Ajuste manual via cash_ledger #' || NEW.id::TEXT || ' - ' || COALESCE(NEW.ajuste_motivo, ''),
                        jsonb_build_object('ledger_id', NEW.id, 'direcao', NEW.ajuste_direcao, 'motivo', NEW.ajuste_motivo),
                        NOW(), NEW.user_id
                    );
                    -- REMOVIDO: UPDATE direto
                END IF;
            END IF;
        END;
    END IF;

    -- TRANSFERENCIA entre bookmakers
    IF NEW.tipo_transacao = 'TRANSFERENCIA' AND NEW.origem_bookmaker_id IS NOT NULL AND NEW.destino_bookmaker_id IS NOT NULL THEN
        -- Débito na origem
        v_idempotency_key := 'ledger_transfer_out_' || NEW.id::TEXT;
        IF NOT EXISTS (SELECT 1 FROM financial_events WHERE idempotency_key = v_idempotency_key) THEN
            SELECT moeda INTO v_bookmaker_record FROM bookmakers WHERE id = NEW.origem_bookmaker_id;
            v_valor_efetivo := COALESCE(NEW.valor_origem, NEW.valor);
            INSERT INTO financial_events (
                bookmaker_id, workspace_id, tipo_evento, tipo_uso, origem,
                valor, moeda, idempotency_key, descricao, metadata, processed_at, created_by
            ) VALUES (
                NEW.origem_bookmaker_id, NEW.workspace_id,
                'SAQUE', 'NORMAL', 'TRANSFERENCIA',
                v_valor_efetivo, COALESCE(v_bookmaker_record.moeda, NEW.moeda),
                v_idempotency_key,
                'Transferência saída via cash_ledger #' || NEW.id::TEXT,
                jsonb_build_object('ledger_id', NEW.id, 'destino', NEW.destino_bookmaker_id),
                NOW(), NEW.user_id
            );
            -- REMOVIDO: UPDATE direto
        END IF;

        -- Crédito no destino
        v_idempotency_key := 'ledger_transfer_in_' || NEW.id::TEXT;
        IF NOT EXISTS (SELECT 1 FROM financial_events WHERE idempotency_key = v_idempotency_key) THEN
            SELECT moeda INTO v_bookmaker_record FROM bookmakers WHERE id = NEW.destino_bookmaker_id;
            v_valor_efetivo := COALESCE(NEW.valor_destino, NEW.valor);
            INSERT INTO financial_events (
                bookmaker_id, workspace_id, tipo_evento, tipo_uso, origem,
                valor, moeda, idempotency_key, descricao, metadata, processed_at, created_by
            ) VALUES (
                NEW.destino_bookmaker_id, NEW.workspace_id,
                'DEPOSITO', 'NORMAL', 'TRANSFERENCIA',
                v_valor_efetivo, COALESCE(v_bookmaker_record.moeda, NEW.moeda),
                v_idempotency_key,
                'Transferência entrada via cash_ledger #' || NEW.id::TEXT,
                jsonb_build_object('ledger_id', NEW.id, 'origem', NEW.origem_bookmaker_id),
                NOW(), NEW.user_id
            );
            -- REMOVIDO: UPDATE direto
        END IF;
    END IF;

    -- Marcar como processado
    NEW.financial_events_generated := TRUE;
    
    RETURN NEW;
END;
$function$;

-- COMENTÁRIO DE AUDITORIA:
-- Esta correção remove todos os UPDATEs diretos em bookmakers.saldo_*
-- A atualização de saldo agora é feita EXCLUSIVAMENTE pelo trigger tr_financial_events_sync_balance
-- Fluxo correto: cash_ledger → financial_events → (trigger) → bookmakers
