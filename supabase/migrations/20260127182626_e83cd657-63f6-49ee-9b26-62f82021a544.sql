
-- =====================================================
-- FINANCIAL ENGINE v8 - LEDGER AS SINGLE SOURCE OF TRUTH
-- =====================================================
-- Este migration implementa:
-- 1. cash_ledger como única fonte de verdade
-- 2. Trigger automático que gera financial_events
-- 3. Trigger que atualiza saldos de bookmakers
-- 4. Suporte a balance_locked em wallets
-- 5. RPC de reprocessamento completo
-- =====================================================

-- =====================================================
-- PARTE 1: ADICIONAR COLUNAS DE REFERÊNCIA AO LEDGER
-- =====================================================

-- Adiciona coluna para marcar que o evento foi processado
ALTER TABLE public.cash_ledger 
ADD COLUMN IF NOT EXISTS financial_events_generated BOOLEAN DEFAULT FALSE;

-- =====================================================
-- PARTE 2: FUNÇÃO PRINCIPAL DE PROCESSAMENTO
-- =====================================================

CREATE OR REPLACE FUNCTION public.fn_cash_ledger_generate_financial_events()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public
AS $$
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
        
        -- Verifica se já existe (idempotência)
        IF NOT EXISTS (SELECT 1 FROM financial_events WHERE idempotency_key = v_idempotency_key) THEN
            -- Busca moeda do bookmaker
            SELECT moeda INTO v_bookmaker_record FROM bookmakers WHERE id = NEW.destino_bookmaker_id;
            
            -- Determina valor efetivo (usa valor_destino se disponível, senão valor)
            v_valor_efetivo := COALESCE(NEW.valor_destino, NEW.valor);
            
            INSERT INTO financial_events (
                bookmaker_id,
                workspace_id,
                tipo_evento,
                tipo_uso,
                origem,
                valor,
                moeda,
                idempotency_key,
                descricao,
                metadata,
                processed_at,
                created_by
            ) VALUES (
                NEW.destino_bookmaker_id,
                NEW.workspace_id,
                'DEPOSIT',
                'NORMAL',
                'LEDGER_TRIGGER',
                v_valor_efetivo,
                COALESCE(v_bookmaker_record.moeda, NEW.moeda),
                v_idempotency_key,
                'Depósito via cash_ledger #' || NEW.id::TEXT,
                jsonb_build_object('ledger_id', NEW.id, 'tipo_transacao', NEW.tipo_transacao),
                NOW(),
                NEW.user_id
            );
            
            -- Atualiza saldo do bookmaker
            UPDATE bookmakers 
            SET saldo_atual = saldo_atual + v_valor_efetivo,
                updated_at = NOW()
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
                bookmaker_id,
                workspace_id,
                tipo_evento,
                tipo_uso,
                origem,
                valor,
                moeda,
                idempotency_key,
                descricao,
                metadata,
                processed_at,
                created_by
            ) VALUES (
                NEW.origem_bookmaker_id,
                NEW.workspace_id,
                'WITHDRAW',
                'NORMAL',
                'LEDGER_TRIGGER',
                v_valor_efetivo,
                COALESCE(v_bookmaker_record.moeda, NEW.moeda),
                v_idempotency_key,
                'Saque via cash_ledger #' || NEW.id::TEXT,
                jsonb_build_object('ledger_id', NEW.id, 'tipo_transacao', NEW.tipo_transacao),
                NOW(),
                NEW.user_id
            );
            
            -- Atualiza saldo do bookmaker (débito)
            UPDATE bookmakers 
            SET saldo_atual = saldo_atual - v_valor_efetivo,
                updated_at = NOW()
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
                bookmaker_id,
                workspace_id,
                tipo_evento,
                tipo_uso,
                origem,
                valor,
                moeda,
                idempotency_key,
                descricao,
                metadata,
                processed_at,
                created_by
            ) VALUES (
                NEW.destino_bookmaker_id,
                NEW.workspace_id,
                'BONUS_CREDIT',
                CASE 
                    WHEN NEW.usar_freebet = TRUE THEN 'FREEBET'
                    ELSE 'BONUS'
                END,
                'LEDGER_TRIGGER',
                v_valor_efetivo,
                COALESCE(v_bookmaker_record.moeda, NEW.moeda),
                v_idempotency_key,
                'Bônus via cash_ledger #' || NEW.id::TEXT,
                jsonb_build_object('ledger_id', NEW.id, 'evento_tipo', NEW.evento_promocional_tipo),
                NOW(),
                NEW.user_id
            );
            
            -- Atualiza saldo de freebet ou bonus
            IF NEW.usar_freebet = TRUE THEN
                UPDATE bookmakers 
                SET saldo_freebet = saldo_freebet + v_valor_efetivo,
                    updated_at = NOW()
                WHERE id = NEW.destino_bookmaker_id;
            ELSE
                UPDATE bookmakers 
                SET saldo_atual = saldo_atual + v_valor_efetivo,
                    updated_at = NOW()
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
                bookmaker_id,
                workspace_id,
                tipo_evento,
                tipo_uso,
                origem,
                valor,
                moeda,
                idempotency_key,
                descricao,
                metadata,
                processed_at,
                created_by
            ) VALUES (
                NEW.destino_bookmaker_id,
                NEW.workspace_id,
                'FREESPIN_PAYOUT',
                'NORMAL',
                'LEDGER_TRIGGER',
                v_valor_efetivo,
                COALESCE(v_bookmaker_record.moeda, NEW.moeda),
                v_idempotency_key,
                'Giro grátis via cash_ledger #' || NEW.id::TEXT,
                jsonb_build_object('ledger_id', NEW.id),
                NOW(),
                NEW.user_id
            );
            
            UPDATE bookmakers 
            SET saldo_atual = saldo_atual + v_valor_efetivo,
                updated_at = NOW()
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
                bookmaker_id,
                workspace_id,
                tipo_evento,
                tipo_uso,
                origem,
                valor,
                moeda,
                idempotency_key,
                descricao,
                metadata,
                processed_at,
                created_by
            ) VALUES (
                NEW.destino_bookmaker_id,
                NEW.workspace_id,
                'CASHBACK',
                'NORMAL',
                'LEDGER_TRIGGER',
                v_valor_efetivo,
                COALESCE(v_bookmaker_record.moeda, NEW.moeda),
                v_idempotency_key,
                'Cashback via cash_ledger #' || NEW.id::TEXT,
                jsonb_build_object('ledger_id', NEW.id),
                NOW(),
                NEW.user_id
            );
            
            UPDATE bookmakers 
            SET saldo_atual = saldo_atual + v_valor_efetivo,
                updated_at = NOW()
            WHERE id = NEW.destino_bookmaker_id;
        END IF;
    END IF;

    -- ===== AJUSTE MANUAL =====
    IF NEW.tipo_transacao = 'AJUSTE_MANUAL' THEN
        -- Ajuste de crédito (entrada na bookmaker)
        IF NEW.destino_bookmaker_id IS NOT NULL AND NEW.ajuste_direcao = 'CREDITO' THEN
            v_idempotency_key := 'ledger_adjust_credit_' || NEW.id::TEXT;
            
            IF NOT EXISTS (SELECT 1 FROM financial_events WHERE idempotency_key = v_idempotency_key) THEN
                SELECT moeda INTO v_bookmaker_record FROM bookmakers WHERE id = NEW.destino_bookmaker_id;
                
                v_valor_efetivo := COALESCE(NEW.valor_destino, NEW.valor);
                
                INSERT INTO financial_events (
                    bookmaker_id,
                    workspace_id,
                    tipo_evento,
                    tipo_uso,
                    origem,
                    valor,
                    moeda,
                    idempotency_key,
                    descricao,
                    metadata,
                    processed_at,
                    created_by
                ) VALUES (
                    NEW.destino_bookmaker_id,
                    NEW.workspace_id,
                    'ADJUSTMENT_CREDIT',
                    'NORMAL',
                    'LEDGER_TRIGGER',
                    v_valor_efetivo,
                    COALESCE(v_bookmaker_record.moeda, NEW.moeda),
                    v_idempotency_key,
                    COALESCE(NEW.ajuste_motivo, 'Ajuste manual via cash_ledger'),
                    jsonb_build_object('ledger_id', NEW.id, 'motivo', NEW.ajuste_motivo),
                    NOW(),
                    NEW.user_id
                );
                
                UPDATE bookmakers 
                SET saldo_atual = saldo_atual + v_valor_efetivo,
                    updated_at = NOW()
                WHERE id = NEW.destino_bookmaker_id;
            END IF;
        END IF;
        
        -- Ajuste de débito (saída da bookmaker)
        IF NEW.origem_bookmaker_id IS NOT NULL AND NEW.ajuste_direcao = 'DEBITO' THEN
            v_idempotency_key := 'ledger_adjust_debit_' || NEW.id::TEXT;
            
            IF NOT EXISTS (SELECT 1 FROM financial_events WHERE idempotency_key = v_idempotency_key) THEN
                SELECT moeda INTO v_bookmaker_record FROM bookmakers WHERE id = NEW.origem_bookmaker_id;
                
                v_valor_efetivo := COALESCE(NEW.valor_origem, NEW.valor);
                
                INSERT INTO financial_events (
                    bookmaker_id,
                    workspace_id,
                    tipo_evento,
                    tipo_uso,
                    origem,
                    valor,
                    moeda,
                    idempotency_key,
                    descricao,
                    metadata,
                    processed_at,
                    created_by
                ) VALUES (
                    NEW.origem_bookmaker_id,
                    NEW.workspace_id,
                    'ADJUSTMENT_DEBIT',
                    'NORMAL',
                    'LEDGER_TRIGGER',
                    v_valor_efetivo,
                    COALESCE(v_bookmaker_record.moeda, NEW.moeda),
                    v_idempotency_key,
                    COALESCE(NEW.ajuste_motivo, 'Ajuste manual via cash_ledger'),
                    jsonb_build_object('ledger_id', NEW.id, 'motivo', NEW.ajuste_motivo),
                    NOW(),
                    NEW.user_id
                );
                
                UPDATE bookmakers 
                SET saldo_atual = saldo_atual - v_valor_efetivo,
                    updated_at = NOW()
                WHERE id = NEW.origem_bookmaker_id;
            END IF;
        END IF;
    END IF;

    -- Marca como processado
    NEW.financial_events_generated := TRUE;
    
    RETURN NEW;
END;
$$;

-- =====================================================
-- PARTE 3: FUNÇÃO PARA TRATAR TRANSAÇÕES PENDENTES
-- =====================================================

CREATE OR REPLACE FUNCTION public.fn_cash_ledger_handle_pending()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public
AS $$
BEGIN
    -- Quando transação muda de PENDENTE para CONFIRMADO
    IF OLD.status = 'PENDENTE' AND NEW.status = 'CONFIRMADO' THEN
        -- Libera balance_locked da wallet de origem se houver
        IF NEW.origem_wallet_id IS NOT NULL THEN
            UPDATE wallets_crypto
            SET balance_locked = GREATEST(0, balance_locked - COALESCE(NEW.valor_origem, NEW.valor)),
                balance_locked_updated_at = NOW()
            WHERE id = NEW.origem_wallet_id;
        END IF;
    END IF;
    
    -- Quando transação muda de PENDENTE para CANCELADO/FAILED
    IF OLD.status = 'PENDENTE' AND NEW.status IN ('CANCELADO', 'FAILED') THEN
        -- Libera balance_locked da wallet de origem
        IF NEW.origem_wallet_id IS NOT NULL THEN
            UPDATE wallets_crypto
            SET balance_locked = GREATEST(0, balance_locked - COALESCE(NEW.valor_origem, NEW.valor)),
                balance_locked_updated_at = NOW()
            WHERE id = NEW.origem_wallet_id;
        END IF;
    END IF;
    
    RETURN NEW;
END;
$$;

-- =====================================================
-- PARTE 4: FUNÇÃO PARA LOCK DE PENDENTES NA INSERÇÃO
-- =====================================================

CREATE OR REPLACE FUNCTION public.fn_cash_ledger_lock_pending_on_insert()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public
AS $$
BEGIN
    -- Se a transação é PENDENTE e tem origem em wallet
    IF NEW.status = 'PENDENTE' AND NEW.origem_wallet_id IS NOT NULL THEN
        UPDATE wallets_crypto
        SET balance_locked = balance_locked + COALESCE(NEW.valor_origem, NEW.valor),
            balance_locked_updated_at = NOW()
        WHERE id = NEW.origem_wallet_id;
    END IF;
    
    RETURN NEW;
END;
$$;

-- =====================================================
-- PARTE 5: CRIAR TRIGGERS
-- =====================================================

-- Remove triggers antigos se existirem
DROP TRIGGER IF EXISTS tr_cash_ledger_generate_financial_events ON cash_ledger;
DROP TRIGGER IF EXISTS tr_cash_ledger_handle_pending ON cash_ledger;
DROP TRIGGER IF EXISTS tr_cash_ledger_lock_pending ON cash_ledger;

-- Trigger para gerar financial_events quando status = CONFIRMADO
CREATE TRIGGER tr_cash_ledger_generate_financial_events
    BEFORE INSERT OR UPDATE OF status ON cash_ledger
    FOR EACH ROW
    EXECUTE FUNCTION fn_cash_ledger_generate_financial_events();

-- Trigger para tratar mudanças de status PENDENTE
CREATE TRIGGER tr_cash_ledger_handle_pending
    AFTER UPDATE OF status ON cash_ledger
    FOR EACH ROW
    WHEN (OLD.status = 'PENDENTE')
    EXECUTE FUNCTION fn_cash_ledger_handle_pending();

-- Trigger para lock de pendentes na inserção
CREATE TRIGGER tr_cash_ledger_lock_pending
    AFTER INSERT ON cash_ledger
    FOR EACH ROW
    WHEN (NEW.status = 'PENDENTE')
    EXECUTE FUNCTION fn_cash_ledger_lock_pending_on_insert();

-- =====================================================
-- PARTE 6: RPC DE REPROCESSAMENTO TOTAL
-- =====================================================

CREATE OR REPLACE FUNCTION public.reprocessar_ledger_workspace(p_workspace_id UUID)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public
AS $$
DECLARE
    v_bookmaker RECORD;
    v_ledger RECORD;
    v_processed_count INT := 0;
    v_bookmaker_count INT := 0;
    v_events_created INT := 0;
BEGIN
    -- PASSO 1: Zerar todos os saldos de bookmakers do workspace
    UPDATE bookmakers 
    SET saldo_atual = 0,
        saldo_freebet = 0,
        updated_at = NOW()
    WHERE workspace_id = p_workspace_id;
    
    GET DIAGNOSTICS v_bookmaker_count = ROW_COUNT;
    
    -- PASSO 2: Limpar financial_events gerados por triggers anteriores
    DELETE FROM financial_events 
    WHERE workspace_id = p_workspace_id 
      AND origem = 'LEDGER_TRIGGER';
    
    -- PASSO 3: Resetar flag de processamento no ledger
    UPDATE cash_ledger 
    SET financial_events_generated = FALSE
    WHERE workspace_id = p_workspace_id;
    
    -- PASSO 4: Reprocessar todas as transações CONFIRMADAS em ordem cronológica
    FOR v_ledger IN 
        SELECT * FROM cash_ledger 
        WHERE workspace_id = p_workspace_id 
          AND status = 'CONFIRMADO'
        ORDER BY data_transacao ASC, created_at ASC
    LOOP
        -- Simula um UPDATE que dispara o trigger
        UPDATE cash_ledger 
        SET financial_events_generated = FALSE -- Força reprocessamento
        WHERE id = v_ledger.id;
        
        -- O trigger tr_cash_ledger_generate_financial_events vai processar
        UPDATE cash_ledger 
        SET updated_at = NOW() -- Trigger BEFORE vai gerar os eventos
        WHERE id = v_ledger.id 
          AND status = 'CONFIRMADO';
        
        v_processed_count := v_processed_count + 1;
    END LOOP;
    
    -- PASSO 5: Contar eventos criados
    SELECT COUNT(*) INTO v_events_created
    FROM financial_events 
    WHERE workspace_id = p_workspace_id 
      AND origem = 'LEDGER_TRIGGER';
    
    -- PASSO 6: Recalcular balance_locked das wallets
    UPDATE wallets_crypto wc
    SET balance_locked = COALESCE((
        SELECT SUM(COALESCE(cl.valor_origem, cl.valor))
        FROM cash_ledger cl
        WHERE cl.origem_wallet_id = wc.id
          AND cl.status = 'PENDENTE'
          AND cl.workspace_id = p_workspace_id
    ), 0),
    balance_locked_updated_at = NOW()
    FROM parceiros p
    WHERE wc.parceiro_id = p.id
      AND p.workspace_id = p_workspace_id;
    
    RETURN jsonb_build_object(
        'success', TRUE,
        'workspace_id', p_workspace_id,
        'bookmakers_reset', v_bookmaker_count,
        'ledger_entries_processed', v_processed_count,
        'financial_events_created', v_events_created,
        'processed_at', NOW()
    );
END;
$$;

-- Grant de execução
GRANT EXECUTE ON FUNCTION public.reprocessar_ledger_workspace(UUID) TO authenticated;

-- =====================================================
-- PARTE 7: VIEW PARA AUDITORIA DE SALDOS
-- =====================================================

CREATE OR REPLACE VIEW public.v_bookmaker_saldo_audit AS
SELECT 
    b.id as bookmaker_id,
    b.nome,
    b.workspace_id,
    b.moeda,
    b.saldo_atual as saldo_materializado,
    COALESCE(SUM(CASE 
        WHEN fe.tipo_evento IN ('DEPOSIT', 'BONUS_CREDIT', 'FREESPIN_PAYOUT', 'CASHBACK', 'ADJUSTMENT_CREDIT', 'PAYOUT') THEN fe.valor
        WHEN fe.tipo_evento IN ('WITHDRAW', 'ADJUSTMENT_DEBIT', 'STAKE') THEN -fe.valor
        ELSE 0
    END), 0) as saldo_calculado_eventos,
    b.saldo_atual - COALESCE(SUM(CASE 
        WHEN fe.tipo_evento IN ('DEPOSIT', 'BONUS_CREDIT', 'FREESPIN_PAYOUT', 'CASHBACK', 'ADJUSTMENT_CREDIT', 'PAYOUT') THEN fe.valor
        WHEN fe.tipo_evento IN ('WITHDRAW', 'ADJUSTMENT_DEBIT', 'STAKE') THEN -fe.valor
        ELSE 0
    END), 0) as divergencia
FROM bookmakers b
LEFT JOIN financial_events fe ON b.id = fe.bookmaker_id
GROUP BY b.id, b.nome, b.workspace_id, b.moeda, b.saldo_atual;

-- =====================================================
-- PARTE 8: VIEW PARA SALDO DE PARCEIRO (CONTAS BANCÁRIAS)
-- =====================================================

CREATE OR REPLACE VIEW public.v_saldo_contas_bancarias AS
SELECT 
    cb.id as conta_id,
    cb.banco,
    cb.titular,
    cb.moeda,
    p.id as parceiro_id,
    p.nome as parceiro_nome,
    p.workspace_id,
    COALESCE(SUM(CASE 
        WHEN cl.destino_conta_bancaria_id = cb.id AND cl.status = 'CONFIRMADO' THEN cl.valor
        ELSE 0
    END), 0) as total_creditos,
    COALESCE(SUM(CASE 
        WHEN cl.origem_conta_bancaria_id = cb.id AND cl.status = 'CONFIRMADO' THEN cl.valor
        ELSE 0
    END), 0) as total_debitos,
    COALESCE(SUM(CASE 
        WHEN cl.origem_conta_bancaria_id = cb.id AND cl.status = 'PENDENTE' THEN cl.valor
        ELSE 0
    END), 0) as saldo_travado,
    COALESCE(SUM(CASE 
        WHEN cl.destino_conta_bancaria_id = cb.id AND cl.status = 'CONFIRMADO' THEN cl.valor
        WHEN cl.origem_conta_bancaria_id = cb.id AND cl.status = 'CONFIRMADO' THEN -cl.valor
        ELSE 0
    END), 0) as saldo_total,
    COALESCE(SUM(CASE 
        WHEN cl.destino_conta_bancaria_id = cb.id AND cl.status = 'CONFIRMADO' THEN cl.valor
        WHEN cl.origem_conta_bancaria_id = cb.id AND cl.status IN ('CONFIRMADO', 'PENDENTE') THEN -cl.valor
        ELSE 0
    END), 0) as saldo_disponivel
FROM contas_bancarias cb
JOIN parceiros p ON cb.parceiro_id = p.id
LEFT JOIN cash_ledger cl ON (
    cl.origem_conta_bancaria_id = cb.id 
    OR cl.destino_conta_bancaria_id = cb.id
)
GROUP BY cb.id, cb.banco, cb.titular, cb.moeda, p.id, p.nome, p.workspace_id;

-- =====================================================
-- PARTE 9: VIEW PARA SALDO DE WALLET CRYPTO
-- =====================================================

CREATE OR REPLACE VIEW public.v_saldo_wallets_crypto AS
SELECT 
    wc.id as wallet_id,
    wc.exchange,
    wc.endereco,
    wc.network,
    p.id as parceiro_id,
    p.nome as parceiro_nome,
    p.workspace_id,
    COALESCE(SUM(CASE 
        WHEN cl.destino_wallet_id = wc.id AND cl.status = 'CONFIRMADO' THEN COALESCE(cl.valor_destino, cl.valor)
        ELSE 0
    END), 0) as total_creditos,
    COALESCE(SUM(CASE 
        WHEN cl.origem_wallet_id = wc.id AND cl.status = 'CONFIRMADO' THEN COALESCE(cl.valor_origem, cl.valor)
        ELSE 0
    END), 0) as total_debitos,
    wc.balance_locked as saldo_travado,
    COALESCE(SUM(CASE 
        WHEN cl.destino_wallet_id = wc.id AND cl.status = 'CONFIRMADO' THEN COALESCE(cl.valor_destino, cl.valor)
        WHEN cl.origem_wallet_id = wc.id AND cl.status = 'CONFIRMADO' THEN -COALESCE(cl.valor_origem, cl.valor)
        ELSE 0
    END), 0) as saldo_total,
    COALESCE(SUM(CASE 
        WHEN cl.destino_wallet_id = wc.id AND cl.status = 'CONFIRMADO' THEN COALESCE(cl.valor_destino, cl.valor)
        WHEN cl.origem_wallet_id = wc.id AND cl.status = 'CONFIRMADO' THEN -COALESCE(cl.valor_origem, cl.valor)
        ELSE 0
    END), 0) - wc.balance_locked as saldo_disponivel
FROM wallets_crypto wc
JOIN parceiros p ON wc.parceiro_id = p.id
LEFT JOIN cash_ledger cl ON (
    cl.origem_wallet_id = wc.id 
    OR cl.destino_wallet_id = wc.id
)
GROUP BY wc.id, wc.exchange, wc.endereco, wc.network, wc.balance_locked, p.id, p.nome, p.workspace_id;

-- =====================================================
-- FIM DA MIGRATION
-- =====================================================
