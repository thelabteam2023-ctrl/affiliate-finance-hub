-- ====================================================================
-- IMPLEMENTAÇÃO CONTROLADA: PERDA OPERACIONAL -> SALDO DA BOOKMAKER
-- Arquitetura V6: cash_ledger -> financial_events -> saldo_atual
-- ====================================================================

-- 1) Expandir os tipos de eventos financeiros permitidos (Incluindo os já existentes no banco)
DO $$
BEGIN
    -- Verifica se o constraint existe antes de tentar alterá-lo
    IF EXISTS (
        SELECT 1 
        FROM information_schema.constraint_column_usage 
        WHERE table_name = 'financial_events' AND constraint_name = 'financial_events_tipo_evento_check'
    ) THEN
        ALTER TABLE public.financial_events DROP CONSTRAINT financial_events_tipo_evento_check;
    END IF;

    ALTER TABLE public.financial_events ADD CONSTRAINT financial_events_tipo_evento_check 
    CHECK (tipo_evento IN (
        'STAKE', 'PAYOUT', 'VOID_REFUND', 'REVERSAL',
        'FREEBET_STAKE', 'FREEBET_PAYOUT', 'FREEBET_CREDIT', 'FREEBET_EXPIRE',
        'DEPOSITO', 'SAQUE', 'CASHBACK', 'BONUS', 'AJUSTE', 
        'LOSS', 'LOSS_REVERSAL', 'GIRO_GRATIS', 'BONUS_ESTORNO', 'CASHBACK_ESTORNO', 'PERDA_OPERACIONAL'
    ));
END $$;

-- 2) Atualizar o gatilho de geração de eventos financeiros do Ledger
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
        END IF;
    END IF;

    -- SAQUE
    IF NEW.tipo_transacao = 'SAQUE' AND NEW.origem_bookmaker_id IS NOT NULL THEN
        v_idempotency_key := 'ledger_withdraw_' || NEW.id::TEXT;
        IF NOT EXISTS (SELECT 1 FROM financial_events WHERE idempotency_key = v_idempotency_key) THEN
            SELECT moeda INTO v_bookmaker_record FROM bookmakers WHERE id = NEW.origem_bookmaker_id;
            v_valor_efetivo := -COALESCE(NEW.valor_origem, NEW.valor); -- Garante sinal negativo para débito
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
        END IF;
    END IF;

    -- PERDA_OPERACIONAL (Integração V6 para Ocorrências - Agora usando LOSS)
    IF NEW.tipo_transacao = 'PERDA_OPERACIONAL' AND NEW.origem_bookmaker_id IS NOT NULL THEN
        v_idempotency_key := 'ledger_loss_' || NEW.id::TEXT;
        IF NOT EXISTS (SELECT 1 FROM financial_events WHERE idempotency_key = v_idempotency_key) THEN
            SELECT moeda INTO v_bookmaker_record FROM bookmakers WHERE id = NEW.origem_bookmaker_id;
            v_valor_efetivo := -COALESCE(NEW.valor_origem, NEW.valor); -- Sinal negativo para débito
            INSERT INTO financial_events (
                bookmaker_id, workspace_id, tipo_evento, tipo_uso, origem,
                valor, moeda, idempotency_key, descricao, metadata, processed_at, created_by
            ) VALUES (
                NEW.origem_bookmaker_id, NEW.workspace_id,
                'LOSS', 'NORMAL', 'AJUSTE',
                v_valor_efetivo, COALESCE(v_bookmaker_record.moeda, NEW.moeda),
                v_idempotency_key,
                COALESCE(NEW.descricao, 'Perda operacional via cash_ledger #' || NEW.id::TEXT),
                jsonb_build_object('ledger_id', NEW.id, 'tipo_transacao', NEW.tipo_transacao),
                NOW(), NEW.user_id
            );
        END IF;
    END IF;

    -- PERDA_REVERSAO (Reversão auditável usando LOSS_REVERSAL)
    IF NEW.tipo_transacao = 'PERDA_REVERSAO' AND NEW.destino_bookmaker_id IS NOT NULL THEN
        v_idempotency_key := 'ledger_loss_rev_' || NEW.id::TEXT;
        IF NOT EXISTS (SELECT 1 FROM financial_events WHERE idempotency_key = v_idempotency_key) THEN
            SELECT moeda INTO v_bookmaker_record FROM bookmakers WHERE id = NEW.destino_bookmaker_id;
            v_valor_efetivo := COALESCE(NEW.valor_destino, NEW.valor); -- Sinal positivo para crédito
            INSERT INTO financial_events (
                bookmaker_id, workspace_id, tipo_evento, tipo_uso, origem,
                valor, moeda, idempotency_key, descricao, metadata, processed_at, created_by
            ) VALUES (
                NEW.destino_bookmaker_id, NEW.workspace_id,
                'LOSS_REVERSAL', 'NORMAL', 'AJUSTE',
                v_valor_efetivo, COALESCE(v_bookmaker_record.moeda, NEW.moeda),
                v_idempotency_key,
                COALESCE(NEW.descricao, 'Reversão de perda via cash_ledger #' || NEW.id::TEXT),
                jsonb_build_object('ledger_id', NEW.id, 'tipo_transacao', NEW.tipo_transacao),
                NOW(), NEW.user_id
            );
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
        END IF;
    END IF;

    -- GIRO_GRATIS
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
                END IF;
            END IF;
        END;
    END IF;

    -- Marcar como processado
    NEW.financial_events_generated := TRUE;
    
    RETURN NEW;
END;
$function$;

-- 3) Regularizar registros órfãos: PERDA_OPERACIONAL que já estão CONFIRMADAS mas sem evento financeiro V6
-- Nota: Registros antigos que tinham tipo_evento 'PERDA_OPERACIONAL' serão mantidos como 'LOSS' na sincronização de saldo
DO $$
DECLARE
    r RECORD;
BEGIN
    FOR r IN 
        SELECT cl.*, b.moeda as bk_moeda 
        FROM cash_ledger cl
        JOIN bookmakers b ON cl.origem_bookmaker_id = b.id
        WHERE cl.tipo_transacao = 'PERDA_OPERACIONAL'
          AND cl.status = 'CONFIRMADO'
          AND cl.financial_events_generated = FALSE
          AND NOT EXISTS (SELECT 1 FROM financial_events fe WHERE fe.idempotency_key = 'ledger_loss_' || cl.id::TEXT)
    LOOP
        INSERT INTO financial_events (
            bookmaker_id, workspace_id, tipo_evento, tipo_uso, origem,
            valor, moeda, idempotency_key, descricao, metadata, processed_at, created_by
        ) VALUES (
            r.origem_bookmaker_id, r.workspace_id,
            'LOSS', 'NORMAL', 'AJUSTE',
            -COALESCE(r.valor_origem, r.valor), COALESCE(r.bk_moeda, r.moeda),
            'ledger_loss_' || r.id::TEXT,
            COALESCE(r.descricao, 'Regularização: Perda operacional via cash_ledger #' || r.id::TEXT),
            jsonb_build_object('ledger_id', r.id, 'tipo_transacao', r.tipo_transacao),
            NOW(), r.user_id
        );
        
        UPDATE cash_ledger SET financial_events_generated = TRUE WHERE id = r.id;
    END LOOP;
END $$;
