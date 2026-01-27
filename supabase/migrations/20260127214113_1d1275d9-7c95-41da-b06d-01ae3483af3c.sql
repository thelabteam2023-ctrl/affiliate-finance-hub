
-- Atualizar fn_cash_ledger_generate_financial_events para processar tipos de aposta
CREATE OR REPLACE FUNCTION fn_cash_ledger_generate_financial_events()
RETURNS TRIGGER AS $$
DECLARE
    v_bookmaker_record RECORD;
    v_idempotency_key TEXT;
    v_event_type TEXT;
    v_valor_efetivo NUMERIC;
BEGIN
    -- Só processa quando status é CONFIRMADO e ainda não foi processado
    IF NEW.status != 'CONFIRMADO' THEN
        RETURN NEW;
    END IF;
    
    -- Se já foi processado, ignora (idempotência)
    IF NEW.financial_events_generated = TRUE THEN
        RETURN NEW;
    END IF;

    -- ===== DEPÓSITO: Conta/Wallet → Bookmaker =====
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
            
            UPDATE bookmakers 
            SET saldo_atual = saldo_atual + v_valor_efetivo, updated_at = NOW()
            WHERE id = NEW.destino_bookmaker_id;
        END IF;
    END IF;

    -- ===== SAQUE: Bookmaker → Conta/Wallet =====
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
            
            UPDATE bookmakers 
            SET saldo_atual = saldo_atual - v_valor_efetivo, updated_at = NOW()
            WHERE id = NEW.origem_bookmaker_id;
        END IF;
    END IF;

    -- ===== BONUS CREDITADO =====
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
            
            IF NEW.usar_freebet = TRUE THEN
                UPDATE bookmakers 
                SET saldo_freebet = saldo_freebet + v_valor_efetivo, updated_at = NOW()
                WHERE id = NEW.destino_bookmaker_id;
            ELSE
                UPDATE bookmakers 
                SET saldo_atual = saldo_atual + v_valor_efetivo, updated_at = NOW()
                WHERE id = NEW.destino_bookmaker_id;
            END IF;
        END IF;
    END IF;

    -- ===== GIRO GRÁTIS (RESULTADO) =====
    IF NEW.tipo_transacao = 'GIRO_GRATIS' AND NEW.destino_bookmaker_id IS NOT NULL THEN
        v_idempotency_key := 'ledger_freespin_' || NEW.id::TEXT;
        
        IF NOT EXISTS (SELECT 1 FROM financial_events WHERE idempotency_key = v_idempotency_key) THEN
            SELECT moeda INTO v_bookmaker_record FROM bookmakers WHERE id = NEW.destino_bookmaker_id;
            v_valor_efetivo := COALESCE(NEW.valor_destino, NEW.valor);
            
            INSERT INTO financial_events (
                bookmaker_id, workspace_id, tipo_evento, tipo_uso, origem,
                valor, moeda, idempotency_key, descricao, metadata, processed_at, created_by
            ) VALUES (
                NEW.destino_bookmaker_id, NEW.workspace_id, 
                'PAYOUT', 'NORMAL', 'PROMO',
                v_valor_efetivo, COALESCE(v_bookmaker_record.moeda, NEW.moeda),
                v_idempotency_key,
                'Giro grátis via cash_ledger #' || NEW.id::TEXT,
                jsonb_build_object('ledger_id', NEW.id),
                NOW(), NEW.user_id
            );
            
            UPDATE bookmakers 
            SET saldo_atual = saldo_atual + v_valor_efetivo, updated_at = NOW()
            WHERE id = NEW.destino_bookmaker_id;
        END IF;
    END IF;

    -- ===== CASHBACK MANUAL =====
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
            
            UPDATE bookmakers 
            SET saldo_atual = saldo_atual + v_valor_efetivo, updated_at = NOW()
            WHERE id = NEW.destino_bookmaker_id;
        END IF;
    END IF;

    -- ===== AJUSTE MANUAL =====
    IF NEW.tipo_transacao = 'AJUSTE_MANUAL' THEN
        IF NEW.destino_bookmaker_id IS NOT NULL AND NEW.ajuste_direcao = 'CREDITO' THEN
            v_idempotency_key := 'ledger_adjust_credit_' || NEW.id::TEXT;
            
            IF NOT EXISTS (SELECT 1 FROM financial_events WHERE idempotency_key = v_idempotency_key) THEN
                SELECT moeda INTO v_bookmaker_record FROM bookmakers WHERE id = NEW.destino_bookmaker_id;
                v_valor_efetivo := COALESCE(NEW.valor_destino, NEW.valor);
                
                INSERT INTO financial_events (
                    bookmaker_id, workspace_id, tipo_evento, tipo_uso, origem,
                    valor, moeda, idempotency_key, descricao, metadata, processed_at, created_by
                ) VALUES (
                    NEW.destino_bookmaker_id, NEW.workspace_id, 
                    'AJUSTE', 'NORMAL', 'AJUSTE',
                    v_valor_efetivo, COALESCE(v_bookmaker_record.moeda, NEW.moeda),
                    v_idempotency_key,
                    COALESCE(NEW.ajuste_motivo, 'Ajuste manual'),
                    jsonb_build_object('ledger_id', NEW.id, 'motivo', NEW.ajuste_motivo, 'direcao', 'CREDITO'),
                    NOW(), NEW.user_id
                );
                
                UPDATE bookmakers 
                SET saldo_atual = saldo_atual + v_valor_efetivo, updated_at = NOW()
                WHERE id = NEW.destino_bookmaker_id;
            END IF;
        END IF;
        
        IF NEW.origem_bookmaker_id IS NOT NULL AND NEW.ajuste_direcao = 'DEBITO' THEN
            v_idempotency_key := 'ledger_adjust_debit_' || NEW.id::TEXT;
            
            IF NOT EXISTS (SELECT 1 FROM financial_events WHERE idempotency_key = v_idempotency_key) THEN
                SELECT moeda INTO v_bookmaker_record FROM bookmakers WHERE id = NEW.origem_bookmaker_id;
                v_valor_efetivo := COALESCE(NEW.valor_origem, NEW.valor);
                
                INSERT INTO financial_events (
                    bookmaker_id, workspace_id, tipo_evento, tipo_uso, origem,
                    valor, moeda, idempotency_key, descricao, metadata, processed_at, created_by
                ) VALUES (
                    NEW.origem_bookmaker_id, NEW.workspace_id, 
                    'AJUSTE', 'NORMAL', 'AJUSTE',
                    -v_valor_efetivo,
                    COALESCE(v_bookmaker_record.moeda, NEW.moeda),
                    v_idempotency_key,
                    COALESCE(NEW.ajuste_motivo, 'Ajuste manual'),
                    jsonb_build_object('ledger_id', NEW.id, 'motivo', NEW.ajuste_motivo, 'direcao', 'DEBITO'),
                    NOW(), NEW.user_id
                );
                
                UPDATE bookmakers 
                SET saldo_atual = saldo_atual - v_valor_efetivo, updated_at = NOW()
                WHERE id = NEW.origem_bookmaker_id;
            END IF;
        END IF;
    END IF;

    -- ===== APOSTA_REVERSAO: Crédito de stake revertido (RED → outro resultado) =====
    IF NEW.tipo_transacao = 'APOSTA_REVERSAO' AND NEW.destino_bookmaker_id IS NOT NULL THEN
        v_idempotency_key := 'ledger_bet_reversal_' || NEW.id::TEXT;
        
        IF NOT EXISTS (SELECT 1 FROM financial_events WHERE idempotency_key = v_idempotency_key) THEN
            SELECT moeda INTO v_bookmaker_record FROM bookmakers WHERE id = NEW.destino_bookmaker_id;
            v_valor_efetivo := COALESCE(NEW.valor_destino, NEW.valor);
            
            INSERT INTO financial_events (
                bookmaker_id, workspace_id, tipo_evento, tipo_uso, origem,
                valor, moeda, idempotency_key, descricao, metadata, processed_at, created_by
            ) VALUES (
                NEW.destino_bookmaker_id, NEW.workspace_id, 
                'REVERSAL', 'NORMAL', 'BET_EDIT',
                v_valor_efetivo, COALESCE(v_bookmaker_record.moeda, NEW.moeda),
                v_idempotency_key,
                'Reversão de resultado de aposta',
                jsonb_build_object('ledger_id', NEW.id, 'tipo', 'APOSTA_REVERSAO'),
                NOW(), NEW.user_id
            );
            
            UPDATE bookmakers 
            SET saldo_atual = saldo_atual + v_valor_efetivo, updated_at = NOW()
            WHERE id = NEW.destino_bookmaker_id;
        END IF;
    END IF;

    -- ===== APOSTA_GREEN: Payout de aposta ganha =====
    IF NEW.tipo_transacao = 'APOSTA_GREEN' AND NEW.destino_bookmaker_id IS NOT NULL THEN
        v_idempotency_key := 'ledger_bet_green_' || NEW.id::TEXT;
        
        IF NOT EXISTS (SELECT 1 FROM financial_events WHERE idempotency_key = v_idempotency_key) THEN
            SELECT moeda INTO v_bookmaker_record FROM bookmakers WHERE id = NEW.destino_bookmaker_id;
            v_valor_efetivo := COALESCE(NEW.valor_destino, NEW.valor);
            
            INSERT INTO financial_events (
                bookmaker_id, workspace_id, tipo_evento, tipo_uso, origem,
                valor, moeda, idempotency_key, descricao, metadata, processed_at, created_by
            ) VALUES (
                NEW.destino_bookmaker_id, NEW.workspace_id, 
                'PAYOUT', 'NORMAL', 'BET_EDIT',
                v_valor_efetivo, COALESCE(v_bookmaker_record.moeda, NEW.moeda),
                v_idempotency_key,
                'Payout de aposta GREEN',
                jsonb_build_object('ledger_id', NEW.id, 'tipo', 'APOSTA_GREEN'),
                NOW(), NEW.user_id
            );
            
            UPDATE bookmakers 
            SET saldo_atual = saldo_atual + v_valor_efetivo, updated_at = NOW()
            WHERE id = NEW.destino_bookmaker_id;
        END IF;
    END IF;

    -- ===== APOSTA_VOID: Devolução de stake (aposta cancelada) =====
    IF NEW.tipo_transacao = 'APOSTA_VOID' AND NEW.destino_bookmaker_id IS NOT NULL THEN
        v_idempotency_key := 'ledger_bet_void_' || NEW.id::TEXT;
        
        IF NOT EXISTS (SELECT 1 FROM financial_events WHERE idempotency_key = v_idempotency_key) THEN
            SELECT moeda INTO v_bookmaker_record FROM bookmakers WHERE id = NEW.destino_bookmaker_id;
            v_valor_efetivo := COALESCE(NEW.valor_destino, NEW.valor);
            
            INSERT INTO financial_events (
                bookmaker_id, workspace_id, tipo_evento, tipo_uso, origem,
                valor, moeda, idempotency_key, descricao, metadata, processed_at, created_by
            ) VALUES (
                NEW.destino_bookmaker_id, NEW.workspace_id, 
                'REVERSAL', 'NORMAL', 'BET_EDIT',
                v_valor_efetivo, COALESCE(v_bookmaker_record.moeda, NEW.moeda),
                v_idempotency_key,
                'Stake devolvido - aposta VOID',
                jsonb_build_object('ledger_id', NEW.id, 'tipo', 'APOSTA_VOID'),
                NOW(), NEW.user_id
            );
            
            UPDATE bookmakers 
            SET saldo_atual = saldo_atual + v_valor_efetivo, updated_at = NOW()
            WHERE id = NEW.destino_bookmaker_id;
        END IF;
    END IF;

    -- ===== APOSTA_RED: Débito de stake (aposta perdida) =====
    IF NEW.tipo_transacao = 'APOSTA_RED' AND NEW.origem_bookmaker_id IS NOT NULL THEN
        v_idempotency_key := 'ledger_bet_red_' || NEW.id::TEXT;
        
        IF NOT EXISTS (SELECT 1 FROM financial_events WHERE idempotency_key = v_idempotency_key) THEN
            SELECT moeda INTO v_bookmaker_record FROM bookmakers WHERE id = NEW.origem_bookmaker_id;
            v_valor_efetivo := COALESCE(NEW.valor_origem, NEW.valor);
            
            INSERT INTO financial_events (
                bookmaker_id, workspace_id, tipo_evento, tipo_uso, origem,
                valor, moeda, idempotency_key, descricao, metadata, processed_at, created_by
            ) VALUES (
                NEW.origem_bookmaker_id, NEW.workspace_id, 
                'STAKE', 'NORMAL', 'BET_EDIT',
                -v_valor_efetivo, COALESCE(v_bookmaker_record.moeda, NEW.moeda),
                v_idempotency_key,
                'Stake perdido - aposta RED',
                jsonb_build_object('ledger_id', NEW.id, 'tipo', 'APOSTA_RED'),
                NOW(), NEW.user_id
            );
            
            UPDATE bookmakers 
            SET saldo_atual = saldo_atual - v_valor_efetivo, updated_at = NOW()
            WHERE id = NEW.origem_bookmaker_id;
        END IF;
    END IF;

    -- ===== APOSTA_MEIO_GREEN: Payout parcial =====
    IF NEW.tipo_transacao = 'APOSTA_MEIO_GREEN' AND NEW.destino_bookmaker_id IS NOT NULL THEN
        v_idempotency_key := 'ledger_bet_meio_green_' || NEW.id::TEXT;
        
        IF NOT EXISTS (SELECT 1 FROM financial_events WHERE idempotency_key = v_idempotency_key) THEN
            SELECT moeda INTO v_bookmaker_record FROM bookmakers WHERE id = NEW.destino_bookmaker_id;
            v_valor_efetivo := COALESCE(NEW.valor_destino, NEW.valor);
            
            INSERT INTO financial_events (
                bookmaker_id, workspace_id, tipo_evento, tipo_uso, origem,
                valor, moeda, idempotency_key, descricao, metadata, processed_at, created_by
            ) VALUES (
                NEW.destino_bookmaker_id, NEW.workspace_id, 
                'PAYOUT', 'NORMAL', 'BET_EDIT',
                v_valor_efetivo, COALESCE(v_bookmaker_record.moeda, NEW.moeda),
                v_idempotency_key,
                'Payout parcial - aposta MEIO_GREEN',
                jsonb_build_object('ledger_id', NEW.id, 'tipo', 'APOSTA_MEIO_GREEN'),
                NOW(), NEW.user_id
            );
            
            UPDATE bookmakers 
            SET saldo_atual = saldo_atual + v_valor_efetivo, updated_at = NOW()
            WHERE id = NEW.destino_bookmaker_id;
        END IF;
    END IF;

    -- ===== APOSTA_MEIO_RED: Perda parcial =====
    IF NEW.tipo_transacao = 'APOSTA_MEIO_RED' AND NEW.origem_bookmaker_id IS NOT NULL THEN
        v_idempotency_key := 'ledger_bet_meio_red_' || NEW.id::TEXT;
        
        IF NOT EXISTS (SELECT 1 FROM financial_events WHERE idempotency_key = v_idempotency_key) THEN
            SELECT moeda INTO v_bookmaker_record FROM bookmakers WHERE id = NEW.origem_bookmaker_id;
            v_valor_efetivo := COALESCE(NEW.valor_origem, NEW.valor);
            
            INSERT INTO financial_events (
                bookmaker_id, workspace_id, tipo_evento, tipo_uso, origem,
                valor, moeda, idempotency_key, descricao, metadata, processed_at, created_by
            ) VALUES (
                NEW.origem_bookmaker_id, NEW.workspace_id, 
                'STAKE', 'NORMAL', 'BET_EDIT',
                -v_valor_efetivo, COALESCE(v_bookmaker_record.moeda, NEW.moeda),
                v_idempotency_key,
                'Stake perdido parcial - aposta MEIO_RED',
                jsonb_build_object('ledger_id', NEW.id, 'tipo', 'APOSTA_MEIO_RED'),
                NOW(), NEW.user_id
            );
            
            UPDATE bookmakers 
            SET saldo_atual = saldo_atual - v_valor_efetivo, updated_at = NOW()
            WHERE id = NEW.origem_bookmaker_id;
        END IF;
    END IF;

    -- Marca como processado
    NEW.financial_events_generated := TRUE;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Reprocessar as transações APOSTA_* que não foram processadas
UPDATE cash_ledger
SET financial_events_generated = FALSE
WHERE tipo_transacao IN ('APOSTA_REVERSAO', 'APOSTA_GREEN', 'APOSTA_RED', 'APOSTA_VOID', 'APOSTA_MEIO_GREEN', 'APOSTA_MEIO_RED')
  AND status = 'CONFIRMADO'
  AND financial_events_generated IS NOT TRUE;
