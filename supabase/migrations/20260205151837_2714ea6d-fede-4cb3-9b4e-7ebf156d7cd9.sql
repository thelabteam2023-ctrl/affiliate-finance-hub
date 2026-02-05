
-- =============================================================================
-- AUDITORIA E CORREÇÃO DE SAQUES DUPLICADOS - MOTOR FINANCEIRO v11
-- =============================================================================

-- ETAPA 0: REMOVER CONSTRAINT EXISTENTE DE STATUS
-- ================================================
ALTER TABLE cash_ledger DROP CONSTRAINT IF EXISTS cash_ledger_status_check;
ALTER TABLE cash_ledger DROP CONSTRAINT IF EXISTS chk_cash_ledger_status_values;
ALTER TABLE cash_ledger DROP CONSTRAINT IF EXISTS chk_cash_ledger_status_extended;

-- ETAPA 1: CORREÇÃO DO EVENTO FINANCEIRO COM SINAL ERRADO
-- ========================================================
UPDATE financial_events
SET 
  valor = -3202.16,
  descricao = '[CORRIGIDO] Saque via cash_ledger #8cb5ba2f-29aa-402b-8c8b-3681513e9411 - Sinal corrigido',
  metadata = COALESCE(metadata, '{}'::jsonb) || jsonb_build_object(
    'correcao_aplicada', true,
    'valor_original_errado', 3202.16,
    'valor_corrigido', -3202.16,
    'data_correcao', NOW(),
    'motivo', 'SINAL_INVERTIDO_BUG_TRIGGER'
  )
WHERE id = '37e2b01c-8d42-4833-b894-45d722776c73'
  AND tipo_evento = 'SAQUE'
  AND valor = 3202.16;

-- ETAPA 2: REVERSÃO DO IMPACTO DO SAQUE DUPLICADO
-- ================================================
INSERT INTO financial_events (
  bookmaker_id, workspace_id, tipo_evento, tipo_uso, origem,
  valor, moeda, idempotency_key, descricao, metadata, processed_at, reversed_event_id
)
SELECT 
  fe.bookmaker_id, fe.workspace_id, 'REVERSAL', 'NORMAL', 'AJUSTE',
  3202.16, fe.moeda,
  'reversal_duplicate_withdraw_fe3d8de4-ed96-4708-84af-b22f20b3753c',
  '[REVERSÃO] Neutralização de saque duplicado',
  jsonb_build_object('tipo_correcao', 'SAQUE_DUPLICADO_INVALIDO', 'data_correcao', NOW()),
  NOW(), 'f21d6d78-d449-4786-b942-3a0215fdfaca'
FROM financial_events fe
WHERE fe.id = 'f21d6d78-d449-4786-b942-3a0215fdfaca'
  AND NOT EXISTS (
    SELECT 1 FROM financial_events 
    WHERE idempotency_key = 'reversal_duplicate_withdraw_fe3d8de4-ed96-4708-84af-b22f20b3753c'
  );

-- ETAPA 3: MARCAR O REGISTRO DUPLICADO NO CASH_LEDGER
-- ===================================================
UPDATE cash_ledger
SET 
  status = 'DUPLICADO_CORRIGIDO',
  descricao = '[DUPLICADO] Saque reprocessado indevidamente - impacto revertido',
  auditoria_metadata = COALESCE(auditoria_metadata, '{}'::jsonb) || jsonb_build_object(
    'marcado_duplicado_em', NOW(),
    'saque_original_id', '8cb5ba2f-29aa-402b-8c8b-3681513e9411',
    'motivo', 'REPROCESSAMENTO_INDEVIDO'
  )
WHERE id = 'fe3d8de4-ed96-4708-84af-b22f20b3753c';

-- ETAPA 4: RECONCILIAR SALDO DA BOOKMAKER
-- =======================================
UPDATE bookmakers
SET 
  saldo_atual = COALESCE((
    SELECT SUM(valor) FROM financial_events 
    WHERE bookmaker_id = '89838262-1a22-4635-8dd2-39cf481afeaa' AND tipo_uso = 'NORMAL'
  ), 0),
  updated_at = NOW()
WHERE id = '89838262-1a22-4635-8dd2-39cf481afeaa';

-- ETAPA 5: ADICIONAR NOVA CONSTRAINT COM STATUS EXPANDIDOS
-- ========================================================
ALTER TABLE cash_ledger ADD CONSTRAINT chk_cash_ledger_status_v11
CHECK (status IN (
  'PENDENTE', 'CONFIRMADO', 'CANCELADO', 'FAILED', 'LIQUIDADO',
  'DUPLICADO_CORRIGIDO', 'DUPLICADO_BLOQUEADO'
));

-- ETAPA 6: FUNÇÃO DE DETECÇÃO DE DUPLICIDADE
-- ==========================================
CREATE OR REPLACE FUNCTION fn_detect_duplicate_withdrawal()
RETURNS TRIGGER AS $$
DECLARE
  v_existing_id UUID;
  v_hours_diff NUMERIC;
BEGIN
  IF NEW.tipo_transacao != 'SAQUE' THEN RETURN NEW; END IF;
  
  IF NEW.status = 'CONFIRMADO' AND (OLD IS NULL OR OLD.status != 'CONFIRMADO') THEN
    SELECT id, EXTRACT(EPOCH FROM (NEW.data_transacao::timestamp - data_transacao::timestamp)) / 3600
    INTO v_existing_id, v_hours_diff
    FROM cash_ledger
    WHERE id != NEW.id
      AND tipo_transacao = 'SAQUE'
      AND status IN ('CONFIRMADO', 'LIQUIDADO')
      AND origem_bookmaker_id = NEW.origem_bookmaker_id
      AND ABS(valor - NEW.valor) < 0.01
      AND COALESCE(destino_parceiro_id, '00000000-0000-0000-0000-000000000000') = COALESCE(NEW.destino_parceiro_id, '00000000-0000-0000-0000-000000000000')
      AND COALESCE(destino_conta_bancaria_id, '00000000-0000-0000-0000-000000000000') = COALESCE(NEW.destino_conta_bancaria_id, '00000000-0000-0000-0000-000000000000')
      AND COALESCE(destino_wallet_id, '00000000-0000-0000-0000-000000000000') = COALESCE(NEW.destino_wallet_id, '00000000-0000-0000-0000-000000000000')
      AND ABS(EXTRACT(EPOCH FROM (NEW.data_transacao::timestamp - data_transacao::timestamp))) / 3600 <= 48
    ORDER BY created_at ASC LIMIT 1;
    
    IF v_existing_id IS NOT NULL THEN
      NEW.status := 'DUPLICADO_BLOQUEADO';
      NEW.financial_events_generated := TRUE;
      NEW.descricao := COALESCE(NEW.descricao, '') || ' [BLOQUEADO] Duplicidade: ' || v_existing_id::TEXT;
      NEW.auditoria_metadata := COALESCE(NEW.auditoria_metadata, '{}'::jsonb) || 
        jsonb_build_object('duplicidade_detectada', true, 'saque_similar_id', v_existing_id, 'bloqueado_em', NOW());
      RAISE WARNING 'Saque duplicado bloqueado. Similar: %', v_existing_id;
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

DROP TRIGGER IF EXISTS tr_cash_ledger_detect_duplicate_withdrawal ON cash_ledger;
CREATE TRIGGER tr_cash_ledger_detect_duplicate_withdrawal
  BEFORE INSERT OR UPDATE ON cash_ledger FOR EACH ROW EXECUTE FUNCTION fn_detect_duplicate_withdrawal();

-- ETAPA 7: ATUALIZAR TRIGGER DE EVENTOS PARA IGNORAR DUPLICADOS
-- ==============================================================
CREATE OR REPLACE FUNCTION fn_cash_ledger_generate_financial_events()
RETURNS TRIGGER AS $$
DECLARE
    v_bookmaker_record RECORD;
    v_idempotency_key TEXT;
    v_valor_efetivo NUMERIC;
BEGIN
    IF NEW.status IN ('DUPLICADO_CORRIGIDO', 'DUPLICADO_BLOQUEADO', 'CANCELADO', 'FAILED') THEN
        RETURN NEW;
    END IF;
    IF NEW.status != 'CONFIRMADO' THEN RETURN NEW; END IF;
    IF NEW.financial_events_generated = TRUE THEN RETURN NEW; END IF;

    IF NEW.tipo_transacao = 'DEPOSITO' AND NEW.destino_bookmaker_id IS NOT NULL THEN
        v_idempotency_key := 'ledger_deposit_' || NEW.id::TEXT;
        IF NOT EXISTS (SELECT 1 FROM financial_events WHERE idempotency_key = v_idempotency_key) THEN
            SELECT moeda INTO v_bookmaker_record FROM bookmakers WHERE id = NEW.destino_bookmaker_id;
            v_valor_efetivo := COALESCE(NEW.valor_destino, NEW.valor);
            INSERT INTO financial_events (bookmaker_id, workspace_id, tipo_evento, tipo_uso, origem, valor, moeda, idempotency_key, descricao, metadata, processed_at, created_by)
            VALUES (NEW.destino_bookmaker_id, NEW.workspace_id, 'DEPOSITO', 'NORMAL', 'DEPOSITO', v_valor_efetivo, COALESCE(v_bookmaker_record.moeda, NEW.moeda), v_idempotency_key, 'Depósito via cash_ledger #' || NEW.id::TEXT, jsonb_build_object('ledger_id', NEW.id), NOW(), NEW.user_id);
        END IF;
    END IF;

    IF NEW.tipo_transacao = 'SAQUE' AND NEW.origem_bookmaker_id IS NOT NULL THEN
        v_idempotency_key := 'ledger_withdraw_' || NEW.id::TEXT;
        IF NOT EXISTS (SELECT 1 FROM financial_events WHERE idempotency_key = v_idempotency_key) THEN
            SELECT moeda INTO v_bookmaker_record FROM bookmakers WHERE id = NEW.origem_bookmaker_id;
            v_valor_efetivo := COALESCE(NEW.valor_origem, NEW.valor);
            INSERT INTO financial_events (bookmaker_id, workspace_id, tipo_evento, tipo_uso, origem, valor, moeda, idempotency_key, descricao, metadata, processed_at, created_by)
            VALUES (NEW.origem_bookmaker_id, NEW.workspace_id, 'SAQUE', 'NORMAL', NULL, -v_valor_efetivo, COALESCE(v_bookmaker_record.moeda, NEW.moeda), v_idempotency_key, 'Saque via cash_ledger #' || NEW.id::TEXT, jsonb_build_object('ledger_id', NEW.id), NOW(), NEW.user_id);
        END IF;
    END IF;

    IF NEW.tipo_transacao = 'BONUS_CREDITADO' AND NEW.destino_bookmaker_id IS NOT NULL THEN
        v_idempotency_key := 'ledger_bonus_' || NEW.id::TEXT;
        IF NOT EXISTS (SELECT 1 FROM financial_events WHERE idempotency_key = v_idempotency_key) THEN
            SELECT moeda INTO v_bookmaker_record FROM bookmakers WHERE id = NEW.destino_bookmaker_id;
            v_valor_efetivo := COALESCE(NEW.valor_destino, NEW.valor);
            INSERT INTO financial_events (bookmaker_id, workspace_id, tipo_evento, tipo_uso, origem, valor, moeda, idempotency_key, descricao, metadata, processed_at, created_by)
            VALUES (NEW.destino_bookmaker_id, NEW.workspace_id, 'BONUS', 'NORMAL', 'BONUS_CREDITADO', v_valor_efetivo, COALESCE(v_bookmaker_record.moeda, NEW.moeda), v_idempotency_key, COALESCE(NEW.descricao, 'Bônus via cash_ledger'), jsonb_build_object('ledger_id', NEW.id), NOW(), NEW.user_id);
        END IF;
    END IF;

    NEW.financial_events_generated := TRUE;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

-- ETAPA 8: VIEW DE AUDITORIA
-- ==========================
CREATE OR REPLACE VIEW v_saques_duplicidade_audit AS
SELECT 
  s1.id as saque_id, s1.valor, s1.moeda, s1.status, s1.data_transacao, s1.created_at,
  b.nome as bookmaker_nome, p.nome as parceiro_nome, s1.descricao, s1.auditoria_metadata,
  CASE WHEN s1.status IN ('DUPLICADO_CORRIGIDO', 'DUPLICADO_BLOQUEADO') THEN 'DUPLICADO' ELSE 'ORIGINAL' END as classificacao
FROM cash_ledger s1
LEFT JOIN bookmakers b ON b.id = s1.origem_bookmaker_id
LEFT JOIN parceiros p ON p.id = s1.destino_parceiro_id
WHERE s1.tipo_transacao = 'SAQUE'
ORDER BY s1.created_at DESC;

-- ETAPA 9: ÍNDICE PARA PERFORMANCE
-- ================================
CREATE INDEX IF NOT EXISTS idx_cash_ledger_saque_duplicidade 
ON cash_ledger (origem_bookmaker_id, valor, destino_parceiro_id, tipo_transacao, status)
WHERE tipo_transacao = 'SAQUE';

COMMENT ON FUNCTION fn_detect_duplicate_withdrawal() IS 
'Motor Financeiro v11: Detecta e bloqueia saques duplicados automaticamente (bookmaker + valor + destino + ≤48h).';
