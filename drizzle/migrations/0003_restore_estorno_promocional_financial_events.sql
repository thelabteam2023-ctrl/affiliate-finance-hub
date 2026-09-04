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

    -- CRÉDITOS (IN)
    IF (NEW.tipo_transacao IN ('DEPOSITO', 'APORTE_FINANCEIRO', 'APORTE', 'PERDA_REVERSAO', 'BONUS_CREDITADO', 'GIRO_GRATIS', 'CASHBACK_MANUAL')
        OR (NEW.tipo_transacao = 'TRANSFERENCIA' AND NEW.destino_bookmaker_id IS NOT NULL))
       AND NEW.destino_bookmaker_id IS NOT NULL THEN

        v_idempotency_key := 'ledger_in_' || NEW.id::TEXT;
        IF NOT EXISTS (SELECT 1 FROM financial_events WHERE idempotency_key = v_idempotency_key) THEN
            SELECT moeda INTO v_bookmaker_record FROM bookmakers WHERE id = NEW.destino_bookmaker_id;
            v_valor_efetivo := COALESCE(NEW.valor_destino, NEW.valor);

            INSERT INTO financial_events (
                bookmaker_id, workspace_id, tipo_evento, tipo_uso, origem,
                valor, moeda, idempotency_key, descricao, metadata, processed_at, created_by
            ) VALUES (
                NEW.destino_bookmaker_id, NEW.workspace_id,
                CASE
                    WHEN NEW.tipo_transacao = 'PERDA_REVERSAO' THEN 'LOSS_REVERSAL'
                    WHEN NEW.tipo_transacao = 'BONUS_CREDITADO' THEN (CASE WHEN NEW.usar_freebet = TRUE THEN 'FREEBET_CREDIT' ELSE 'BONUS' END)
                    WHEN NEW.tipo_transacao = 'GIRO_GRATIS' THEN 'PAYOUT'
                    WHEN NEW.tipo_transacao = 'CASHBACK_MANUAL' THEN 'CASHBACK'
                    ELSE 'DEPOSITO'
                END,
                CASE WHEN NEW.tipo_transacao = 'BONUS_CREDITADO' AND NEW.usar_freebet = TRUE THEN 'FREEBET' ELSE 'NORMAL' END,
                CASE
                    WHEN NEW.tipo_transacao = 'PERDA_REVERSAO' THEN 'AJUSTE'
                    WHEN NEW.tipo_transacao = 'BONUS_CREDITADO' THEN 'BONUS'
                    WHEN NEW.tipo_transacao = 'GIRO_GRATIS' THEN 'GIRO_GRATIS'
                    WHEN NEW.tipo_transacao = 'CASHBACK_MANUAL' THEN 'CASHBACK'
                    ELSE 'DEPOSITO'
                END,
                v_valor_efetivo, COALESCE(v_bookmaker_record.moeda, NEW.moeda),
                v_idempotency_key,
                COALESCE(NEW.descricao, 'Entrada via ledger #' || NEW.id::TEXT),
                jsonb_build_object('ledger_id', NEW.id, 'tipo_transacao', NEW.tipo_transacao),
                NOW(), NEW.user_id
            );
        END IF;
    END IF;

    -- DÉBITOS (OUT)
    IF (NEW.tipo_transacao IN ('SAQUE', 'PERDA_OPERACIONAL', 'PERDA_ATIVO', 'LIQUIDACAO')
        OR (NEW.tipo_transacao = 'TRANSFERENCIA' AND NEW.origem_bookmaker_id IS NOT NULL))
       AND NEW.origem_bookmaker_id IS NOT NULL THEN

        v_idempotency_key := 'ledger_out_' || NEW.id::TEXT;
        IF NOT EXISTS (SELECT 1 FROM financial_events WHERE idempotency_key = v_idempotency_key) THEN
            SELECT moeda INTO v_bookmaker_record FROM bookmakers WHERE id = NEW.origem_bookmaker_id;
            v_valor_efetivo := -COALESCE(NEW.valor_origem, NEW.valor);

            INSERT INTO financial_events (
                bookmaker_id, workspace_id, tipo_evento, tipo_uso, origem,
                valor, moeda, idempotency_key, descricao, metadata, processed_at, created_by
            ) VALUES (
                NEW.origem_bookmaker_id, NEW.workspace_id,
                CASE
                    WHEN NEW.tipo_transacao IN ('PERDA_OPERACIONAL', 'PERDA_ATIVO') THEN 'LOSS'
                    ELSE 'SAQUE'
                END,
                'NORMAL',
                CASE
                    WHEN NEW.tipo_transacao IN ('PERDA_OPERACIONAL', 'PERDA_ATIVO') THEN 'AJUSTE'
                    ELSE NULL
                END,
                v_valor_efetivo, COALESCE(v_bookmaker_record.moeda, NEW.moeda),
                v_idempotency_key,
                COALESCE(NEW.descricao, 'Saída via ledger #' || NEW.id::TEXT),
                jsonb_build_object('ledger_id', NEW.id, 'tipo_transacao', NEW.tipo_transacao),
                NOW(), NEW.user_id
            );
        END IF;
    END IF;

    -- ESTORNOS PROMOCIONAIS (OUT) — bônus, cashback e giros grátis
    -- Regressão corrigida: sem esta ramificação o estorno não gerava evento
    -- financeiro e o saldo da bookmaker permanecia inflado.
    IF NEW.tipo_transacao IN ('BONUS_ESTORNO', 'CASHBACK_ESTORNO', 'GIRO_GRATIS_ESTORNO')
       AND NEW.origem_bookmaker_id IS NOT NULL THEN

        v_idempotency_key := CASE NEW.tipo_transacao
            WHEN 'BONUS_ESTORNO' THEN 'ledger_bonus_estorno_'
            WHEN 'CASHBACK_ESTORNO' THEN 'ledger_cashback_estorno_'
            ELSE 'ledger_giro_estorno_'
        END || NEW.id::TEXT;

        IF NOT EXISTS (SELECT 1 FROM financial_events WHERE idempotency_key = v_idempotency_key) THEN
            SELECT moeda INTO v_bookmaker_record FROM bookmakers WHERE id = NEW.origem_bookmaker_id;
            v_valor_efetivo := -COALESCE(NEW.valor_origem, NEW.valor);

            INSERT INTO financial_events (
                bookmaker_id, workspace_id, tipo_evento, tipo_uso, origem,
                valor, moeda, idempotency_key, descricao, metadata, processed_at, created_by
            ) VALUES (
                NEW.origem_bookmaker_id, NEW.workspace_id,
                NEW.tipo_transacao,
                CASE WHEN NEW.usar_freebet = TRUE THEN 'FREEBET' ELSE 'NORMAL' END,
                CASE
                    WHEN NEW.tipo_transacao = 'BONUS_ESTORNO' THEN 'BONUS'
                    WHEN NEW.tipo_transacao = 'CASHBACK_ESTORNO' THEN 'CASHBACK'
                    ELSE 'GIRO_GRATIS'
                END,
                v_valor_efetivo, COALESCE(v_bookmaker_record.moeda, NEW.moeda),
                v_idempotency_key,
                COALESCE(NEW.descricao, 'Estorno via ledger #' || NEW.id::TEXT),
                jsonb_build_object('ledger_id', NEW.id, 'tipo_transacao', NEW.tipo_transacao),
                NOW(), NEW.user_id
            );
        END IF;
    END IF;

    -- AJUSTES E FX
    IF NEW.tipo_transacao IN ('AJUSTE_MANUAL', 'AJUSTE_SALDO', 'AJUSTE_RECONCILIACAO', 'GANHO_CAMBIAL', 'PERDA_CAMBIAL') AND (NEW.destino_bookmaker_id IS NOT NULL OR NEW.origem_bookmaker_id IS NOT NULL) THEN
        DECLARE
            v_target_id UUID;
            v_val NUMERIC;
            v_key TEXT;
        BEGIN
            v_target_id := COALESCE(NEW.destino_bookmaker_id, NEW.origem_bookmaker_id);
            v_key := 'ledger_ajuste_' || NEW.id::TEXT;

            IF NEW.tipo_transacao IN ('GANHO_CAMBIAL', 'PERDA_CAMBIAL') THEN
                v_val := CASE WHEN NEW.tipo_transacao = 'GANHO_CAMBIAL' THEN NEW.valor ELSE -NEW.valor END;
                v_key := 'ledger_fx_' || NEW.id::TEXT;
            ELSE
                v_val := CASE WHEN NEW.ajuste_direcao = 'ENTRADA' THEN COALESCE(NEW.valor_destino, NEW.valor) ELSE -COALESCE(NEW.valor_origem, NEW.valor) END;
            END IF;

            IF NOT EXISTS (SELECT 1 FROM financial_events WHERE idempotency_key = v_key) THEN
                SELECT moeda INTO v_bookmaker_record FROM bookmakers WHERE id = v_target_id;
                INSERT INTO financial_events (
                    bookmaker_id, workspace_id, tipo_evento, tipo_uso, origem,
                    valor, moeda, idempotency_key, descricao, metadata, processed_at, created_by
                ) VALUES (
                    v_target_id, NEW.workspace_id,
                    'AJUSTE', 'NORMAL', NEW.tipo_transacao,
                    v_val, COALESCE(v_bookmaker_record.moeda, NEW.moeda),
                    v_key,
                    COALESCE(NEW.descricao, 'Ajuste via ledger #' || NEW.id::TEXT),
                    jsonb_build_object('ledger_id', NEW.id, 'tipo_transacao', NEW.tipo_transacao),
                    NOW(), NEW.user_id
                );
            END IF;
        END;
    END IF;

    NEW.financial_events_generated := TRUE;
    RETURN NEW;
END;
$function$;