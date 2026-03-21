-- ============================================================
-- FIX 1: Corrigir reprocessar_ledger_workspace para limpar balance_processed_at
-- ============================================================
CREATE OR REPLACE FUNCTION reprocessar_ledger_workspace(p_workspace_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_ledger RECORD;
    v_processed_count INT := 0;
    v_bookmaker_count INT := 0;
    v_events_created INT := 0;
    v_events_deleted INT := 0;
BEGIN
    UPDATE bookmakers 
    SET saldo_atual = 0, saldo_freebet = 0, updated_at = NOW()
    WHERE workspace_id = p_workspace_id;
    GET DIAGNOSTICS v_bookmaker_count = ROW_COUNT;
    
    DELETE FROM financial_events WHERE workspace_id = p_workspace_id;
    GET DIAGNOSTICS v_events_deleted = ROW_COUNT;
    
    -- CRÍTICO: limpar balance_processed_at para que o trigger reprocesse
    UPDATE cash_ledger 
    SET financial_events_generated = FALSE, balance_processed_at = NULL
    WHERE workspace_id = p_workspace_id;
    
    FOR v_ledger IN 
        SELECT id FROM cash_ledger 
        WHERE workspace_id = p_workspace_id AND status = 'CONFIRMADO'
        ORDER BY data_transacao ASC, created_at ASC
    LOOP
        UPDATE cash_ledger SET updated_at = NOW() WHERE id = v_ledger.id;
        v_processed_count := v_processed_count + 1;
    END LOOP;
    
    SELECT COUNT(*) INTO v_events_created FROM financial_events WHERE workspace_id = p_workspace_id;
    
    UPDATE wallets_crypto wc
    SET balance_locked = COALESCE((
        SELECT SUM(COALESCE(cl.valor_origem, cl.valor))
        FROM cash_ledger cl
        WHERE cl.origem_wallet_id = wc.id AND cl.status = 'PENDENTE' AND cl.workspace_id = p_workspace_id
    ), 0), balance_locked_updated_at = NOW()
    FROM parceiros p
    WHERE wc.parceiro_id = p.id AND p.workspace_id = p_workspace_id;
    
    RETURN jsonb_build_object(
        'success', TRUE, 'workspace_id', p_workspace_id,
        'bookmakers_reset', v_bookmaker_count, 'events_deleted', v_events_deleted,
        'ledger_entries_processed', v_processed_count, 'financial_events_created', v_events_created,
        'processed_at', NOW()
    );
END;
$$;

-- ============================================================
-- FIX 2: Reprocessar Betano Sebastian
-- ============================================================
UPDATE cash_ledger 
SET financial_events_generated = FALSE, balance_processed_at = NULL
WHERE '5f599383-db75-49a9-b4f6-306aa1e323b1' IN (origem_bookmaker_id, destino_bookmaker_id)
  AND status = 'CONFIRMADO';

DELETE FROM financial_events WHERE bookmaker_id = '5f599383-db75-49a9-b4f6-306aa1e323b1';

UPDATE bookmakers SET saldo_atual = 0, saldo_freebet = 0 WHERE id = '5f599383-db75-49a9-b4f6-306aa1e323b1';

DO $$
DECLARE v_rec RECORD;
BEGIN
  FOR v_rec IN 
    SELECT id FROM cash_ledger 
    WHERE '5f599383-db75-49a9-b4f6-306aa1e323b1' IN (origem_bookmaker_id, destino_bookmaker_id)
      AND status = 'CONFIRMADO'
    ORDER BY data_transacao ASC, created_at ASC
  LOOP
    UPDATE cash_ledger SET updated_at = NOW() WHERE id = v_rec.id;
  END LOOP;
END $$;

-- ============================================================
-- FIX 3: Zerar casas inativas via AJUSTE_MANUAL (ajuste_direcao = SAIDA)
-- ============================================================

-- Cleobetra Marina (99.94 USD)
INSERT INTO cash_ledger (
  tipo_transacao, valor, moeda, tipo_moeda, status, 
  origem_bookmaker_id, data_transacao, user_id, workspace_id,
  ajuste_direcao, ajuste_motivo, descricao, impacta_caixa_operacional
) SELECT 
  'AJUSTE_MANUAL', 99.94, 'USD', 'FIAT', 'CONFIRMADO',
  '8ad64da4-fd24-4cad-b854-fc7041e968f9', NOW()::date, b.user_id, b.workspace_id,
  'SAIDA', 'Reconciliação: casa sem saldo real', 'Ajuste para zerar saldo - casa inativa', false
FROM bookmakers b WHERE b.id = '8ad64da4-fd24-4cad-b854-fc7041e968f9';

-- Everygame Eduarda (150.10 USD)
INSERT INTO cash_ledger (
  tipo_transacao, valor, moeda, tipo_moeda, status,
  origem_bookmaker_id, data_transacao, user_id, workspace_id,
  ajuste_direcao, ajuste_motivo, descricao, impacta_caixa_operacional
) SELECT 
  'AJUSTE_MANUAL', 150.10, 'USD', 'FIAT', 'CONFIRMADO',
  '79c6a2c9-a9bc-4f6a-9e48-8320b43764af', NOW()::date, b.user_id, b.workspace_id,
  'SAIDA', 'Reconciliação: casa sem saldo real', 'Ajuste para zerar saldo - casa inativa', false
FROM bookmakers b WHERE b.id = '79c6a2c9-a9bc-4f6a-9e48-8320b43764af';

-- Playio Eduarda (99.40 USD)
INSERT INTO cash_ledger (
  tipo_transacao, valor, moeda, tipo_moeda, status,
  origem_bookmaker_id, data_transacao, user_id, workspace_id,
  ajuste_direcao, ajuste_motivo, descricao, impacta_caixa_operacional
) SELECT 
  'AJUSTE_MANUAL', 99.40, 'USD', 'FIAT', 'CONFIRMADO',
  '1aa0fb10-c88b-474d-bd1d-0b7b4ad26974', NOW()::date, b.user_id, b.workspace_id,
  'SAIDA', 'Reconciliação: casa sem saldo real', 'Ajuste para zerar saldo - casa inativa', false
FROM bookmakers b WHERE b.id = '1aa0fb10-c88b-474d-bd1d-0b7b4ad26974';

-- Sportmarket Jose Silva (300.00 EUR)
INSERT INTO cash_ledger (
  tipo_transacao, valor, moeda, tipo_moeda, status,
  origem_bookmaker_id, data_transacao, user_id, workspace_id,
  ajuste_direcao, ajuste_motivo, descricao, impacta_caixa_operacional
) SELECT 
  'AJUSTE_MANUAL', 300.00, 'EUR', 'FIAT', 'CONFIRMADO',
  'dc6ee442-46f4-44d5-889b-510f3b952e7f', NOW()::date, b.user_id, b.workspace_id,
  'SAIDA', 'Reconciliação: casa sem saldo real', 'Ajuste para zerar saldo - casa inativa', false
FROM bookmakers b WHERE b.id = 'dc6ee442-46f4-44d5-889b-510f3b952e7f';

-- Supabet Marina (90.93 USD)
INSERT INTO cash_ledger (
  tipo_transacao, valor, moeda, tipo_moeda, status,
  origem_bookmaker_id, data_transacao, user_id, workspace_id,
  ajuste_direcao, ajuste_motivo, descricao, impacta_caixa_operacional
) SELECT 
  'AJUSTE_MANUAL', 90.93, 'USD', 'FIAT', 'CONFIRMADO',
  '6819e1e6-ac70-4122-afe3-a078e4c5a3e7', NOW()::date, b.user_id, b.workspace_id,
  'SAIDA', 'Reconciliação: casa sem saldo real', 'Ajuste para zerar saldo - casa inativa', false
FROM bookmakers b WHERE b.id = '6819e1e6-ac70-4122-afe3-a078e4c5a3e7';