-- 1. Atualizar o gatilho V6 para suportar GANHO_CAMBIAL e PERDA_CAMBIAL
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

    -- PERDA_OPERACIONAL
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

    -- PERDA_REVERSAO
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

    -- AJUSTE_MANUAL / AJUSTE_SALDO / AJUSTE_RECONCILIACAO
    IF NEW.tipo_transacao IN ('AJUSTE_MANUAL', 'AJUSTE_SALDO', 'AJUSTE_RECONCILIACAO') AND (NEW.destino_bookmaker_id IS NOT NULL OR NEW.origem_bookmaker_id IS NOT NULL) THEN
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
                        'AJUSTE', 'NORMAL', NEW.tipo_transacao,
                        v_ajuste_valor, COALESCE(v_bookmaker_record.moeda, NEW.moeda),
                        v_idempotency_key,
                        CASE 
                            WHEN NEW.tipo_transacao = 'AJUSTE_SALDO' THEN 'Ajuste de saldo via Vínculos #' || NEW.id::TEXT
                            ELSE 'Ajuste manual via cash_ledger #' || NEW.id::TEXT
                        END || ' - ' || COALESCE(NEW.ajuste_motivo, ''),
                        jsonb_build_object('ledger_id', NEW.id, 'direcao', NEW.ajuste_direcao, 'motivo', NEW.ajuste_motivo, 'tipo_transacao', NEW.tipo_transacao),
                        NOW(), NEW.user_id
                    );
                END IF;
            END IF;
        END;
    END IF;

    -- GANHO_CAMBIAL / PERDA_CAMBIAL (NOVO)
    IF NEW.tipo_transacao IN ('GANHO_CAMBIAL', 'PERDA_CAMBIAL') AND (NEW.destino_bookmaker_id IS NOT NULL OR NEW.origem_bookmaker_id IS NOT NULL) THEN
        DECLARE
            v_target_id UUID;
            v_fx_valor NUMERIC;
        BEGIN
            v_target_id := COALESCE(NEW.destino_bookmaker_id, NEW.origem_bookmaker_id);
            v_fx_valor := CASE WHEN NEW.tipo_transacao = 'GANHO_CAMBIAL' THEN NEW.valor ELSE -NEW.valor END;

            v_idempotency_key := 'ledger_fx_' || NEW.id::TEXT;
            IF NOT EXISTS (SELECT 1 FROM financial_events WHERE idempotency_key = v_idempotency_key) THEN
                SELECT moeda INTO v_bookmaker_record FROM bookmakers WHERE id = v_target_id;
                INSERT INTO financial_events (
                    bookmaker_id, workspace_id, tipo_evento, tipo_uso, origem,
                    valor, moeda, idempotency_key, descricao, metadata, processed_at, created_by
                ) VALUES (
                    v_target_id, NEW.workspace_id,
                    'AJUSTE', 'NORMAL', NEW.tipo_transacao,
                    v_fx_valor, COALESCE(v_bookmaker_record.moeda, NEW.moeda),
                    v_idempotency_key,
                    COALESCE(NEW.descricao, 'Ajuste cambial via conciliação #' || NEW.id::TEXT),
                    jsonb_build_object('ledger_id', NEW.id, 'tipo_transacao', NEW.tipo_transacao),
                    NOW(), NEW.user_id
                );
            END IF;
        END;
    END IF;

    -- Marcar como processado
    NEW.financial_events_generated := TRUE;
    
    RETURN NEW;
END;
$function$;

-- 2. Regularização Retroativa: Criar eventos financeiros para ajustes cambiais órfãos
DO $$
DECLARE
    r RECORD;
BEGIN
    FOR r IN 
        SELECT cl.*, b.moeda as bk_moeda 
        FROM public.cash_ledger cl
        JOIN public.bookmakers b ON b.id = COALESCE(cl.destino_bookmaker_id, cl.origem_bookmaker_id)
        WHERE cl.tipo_transacao IN ('GANHO_CAMBIAL', 'PERDA_CAMBIAL')
          AND cl.status = 'CONFIRMADO'
          AND NOT EXISTS (
            SELECT 1 FROM public.financial_events fe 
            WHERE fe.idempotency_key = 'ledger_fx_' || cl.id::TEXT
          )
    LOOP
        INSERT INTO public.financial_events (
            bookmaker_id, workspace_id, tipo_evento, tipo_uso, origem,
            valor, moeda, idempotency_key, descricao, metadata, processed_at, created_by
        ) VALUES (
            COALESCE(r.destino_bookmaker_id, r.origem_bookmaker_id), r.workspace_id,
            'AJUSTE', 'NORMAL', r.tipo_transacao,
            CASE WHEN r.tipo_transacao = 'GANHO_CAMBIAL' THEN r.valor ELSE -r.valor END,
            COALESCE(r.bk_moeda, r.moeda),
            'ledger_fx_' || r.id::TEXT,
            COALESCE(r.descricao, 'Regularização: Ajuste cambial via conciliação #' || r.id::TEXT),
            jsonb_build_object('ledger_id', r.id, 'tipo_transacao', r.tipo_transacao, 'is_regularizacao', true),
            NOW(), r.user_id
        );
    END LOOP;
END $$;
