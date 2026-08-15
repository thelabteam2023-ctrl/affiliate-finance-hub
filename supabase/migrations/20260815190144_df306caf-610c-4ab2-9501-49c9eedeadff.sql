-- 1. Normalização de Metadados de Origem/Destino no Ledger
UPDATE public.cash_ledger 
SET destino_tipo = 'BOOKMAKER' 
WHERE destino_bookmaker_id IS NOT NULL 
  AND (destino_tipo IS NULL OR destino_tipo = '');

UPDATE public.cash_ledger 
SET origem_tipo = 'BOOKMAKER' 
WHERE origem_bookmaker_id IS NOT NULL 
  AND (origem_tipo IS NULL OR origem_tipo = '');

UPDATE public.cash_ledger 
SET destino_tipo = 'PARCEIRO_WALLET' 
WHERE destino_wallet_id IS NOT NULL 
  AND (destino_tipo IS NULL OR destino_tipo = '');

UPDATE public.cash_ledger 
SET origem_tipo = 'PARCEIRO_WALLET' 
WHERE origem_wallet_id IS NOT NULL 
  AND (origem_tipo IS NULL OR origem_tipo = '');

UPDATE public.cash_ledger 
SET destino_tipo = 'PARCEIRO_CONTA' 
WHERE destino_conta_bancaria_id IS NOT NULL 
  AND (destino_tipo IS NULL OR destino_tipo = '');

UPDATE public.cash_ledger 
SET origem_tipo = 'PARCEIRO_CONTA' 
WHERE origem_conta_bancaria_id IS NOT NULL 
  AND (origem_tipo IS NULL OR origem_tipo = '');

-- 2. Expansão da Cobertura do Gatilho Financeiro V6
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

-- 3. Regularização Retroativa
DO $$
DECLARE r RECORD;
BEGIN
    -- Regulariza SAÍDAS (TRANSFERENCIA para fora de BK, PERDA_ATIVO)
    FOR r IN SELECT cl.*, b.moeda as bk_moeda FROM cash_ledger cl JOIN bookmakers b ON b.id = cl.origem_bookmaker_id
             WHERE cl.tipo_transacao IN ('PERDA_ATIVO', 'TRANSFERENCIA') AND cl.status = 'CONFIRMADO'
               AND NOT EXISTS (SELECT 1 FROM financial_events fe WHERE fe.idempotency_key = 'ledger_out_' || cl.id::TEXT)
    LOOP
        INSERT INTO financial_events (bookmaker_id, workspace_id, tipo_evento, tipo_uso, origem, valor, moeda, idempotency_key, descricao, metadata, processed_at, created_by)
        VALUES (r.origem_bookmaker_id, r.workspace_id, CASE WHEN r.tipo_transacao = 'PERDA_ATIVO' THEN 'LOSS' ELSE 'SAQUE' END, 'NORMAL', 
                CASE WHEN r.tipo_transacao = 'PERDA_ATIVO' THEN 'AJUSTE' ELSE NULL END, -COALESCE(r.valor_origem, r.valor), COALESCE(r.bk_moeda, r.moeda),
                'ledger_out_' || r.id::TEXT, COALESCE(r.descricao, 'Regularização V6: #' || r.id::TEXT), jsonb_build_object('ledger_id', r.id, 'tipo_transacao', r.tipo_transacao, 'is_regularizacao', true), NOW(), r.user_id);
    END LOOP;

    -- Regulariza ENTRADAS (TRANSFERENCIA para dentro de BK)
    FOR r IN SELECT cl.*, b.moeda as bk_moeda FROM cash_ledger cl JOIN bookmakers b ON b.id = cl.destino_bookmaker_id
             WHERE cl.tipo_transacao = 'TRANSFERENCIA' AND cl.status = 'CONFIRMADO'
               AND NOT EXISTS (SELECT 1 FROM financial_events fe WHERE fe.idempotency_key = 'ledger_in_' || cl.id::TEXT)
    LOOP
        INSERT INTO financial_events (bookmaker_id, workspace_id, tipo_evento, tipo_uso, origem, valor, moeda, idempotency_key, descricao, metadata, processed_at, created_by)
        VALUES (r.destino_bookmaker_id, r.workspace_id, 'DEPOSITO', 'NORMAL', 'DEPOSITO', COALESCE(r.valor_destino, r.valor), COALESCE(r.bk_moeda, r.moeda),
                'ledger_in_' || r.id::TEXT, COALESCE(r.descricao, 'Regularização V6: #' || r.id::TEXT), jsonb_build_object('ledger_id', r.id, 'tipo_transacao', r.tipo_transacao, 'is_regularizacao', true), NOW(), r.user_id);
    END LOOP;
END $$;