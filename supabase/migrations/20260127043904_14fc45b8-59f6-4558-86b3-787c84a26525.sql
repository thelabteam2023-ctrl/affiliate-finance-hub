-- =====================================================
-- FINANCIAL ENGINE V7 - RESET ARQUITETURAL COMPLETO
-- =====================================================
-- Remove todos os triggers, funções legadas e cria motor limpo
-- Única fonte de verdade: financial_events

-- =====================================================
-- PARTE 1: LIMPEZA TOTAL DE TRIGGERS DE SALDO
-- =====================================================

-- Remover TODOS os triggers que afetam saldo
DROP TRIGGER IF EXISTS tr_cash_ledger_update_bookmaker_balance ON cash_ledger;
DROP TRIGGER IF EXISTS tr_cash_ledger_update_bookmaker_balance_v2 ON cash_ledger;
DROP TRIGGER IF EXISTS tr_cash_ledger_update_bookmaker_balance_v3 ON cash_ledger;
DROP TRIGGER IF EXISTS tr_cash_ledger_update_bookmaker_balance_v4 ON cash_ledger;
DROP TRIGGER IF EXISTS tr_cash_ledger_update_bookmaker_balance_v5 ON cash_ledger;
DROP TRIGGER IF EXISTS atualizar_saldo_bookmaker ON cash_ledger;
DROP TRIGGER IF EXISTS atualizar_saldo_bookmaker_v2 ON cash_ledger;
DROP TRIGGER IF EXISTS atualizar_saldo_bookmaker_v3 ON cash_ledger;
DROP TRIGGER IF EXISTS atualizar_saldo_bookmaker_v4 ON cash_ledger;
DROP TRIGGER IF EXISTS atualizar_saldo_bookmaker_v5 ON cash_ledger;
DROP TRIGGER IF EXISTS tr_financial_event_sync ON financial_events;

-- =====================================================
-- PARTE 2: REMOVER FUNÇÕES LEGADAS
-- =====================================================

DROP FUNCTION IF EXISTS atualizar_saldo_bookmaker_v2() CASCADE;
DROP FUNCTION IF EXISTS atualizar_saldo_bookmaker_v3() CASCADE;
DROP FUNCTION IF EXISTS atualizar_saldo_bookmaker_v4() CASCADE;
DROP FUNCTION IF EXISTS atualizar_saldo_bookmaker_v5() CASCADE;
DROP FUNCTION IF EXISTS sync_financial_event() CASCADE;
DROP FUNCTION IF EXISTS liquidar_aposta_atomica(UUID, TEXT, NUMERIC, JSONB) CASCADE;
DROP FUNCTION IF EXISTS liquidar_aposta_atomica_v2(UUID, TEXT, NUMERIC) CASCADE;
DROP FUNCTION IF EXISTS reliquidar_aposta_atomica(UUID, TEXT, NUMERIC) CASCADE;
DROP FUNCTION IF EXISTS reverter_liquidacao_para_pendente(UUID) CASCADE;
DROP FUNCTION IF EXISTS processar_debito_waterfall(UUID, NUMERIC, TEXT) CASCADE;
DROP FUNCTION IF EXISTS recalcular_saldo_bookmaker(UUID) CASCADE;
DROP FUNCTION IF EXISTS recalcular_saldo_bookmaker_v2(UUID) CASCADE;
DROP FUNCTION IF EXISTS criar_aposta_atomica(JSONB) CASCADE;
DROP FUNCTION IF EXISTS criar_aposta_atomica_v2(JSONB, JSONB) CASCADE;
DROP FUNCTION IF EXISTS adjust_bookmaker_balance_with_audit(UUID, NUMERIC, TEXT, UUID, TEXT, TEXT) CASCADE;

-- Remover também as versões v3 antigas
DROP FUNCTION IF EXISTS liquidar_aposta_v3(UUID, TEXT, NUMERIC) CASCADE;
DROP FUNCTION IF EXISTS reverter_liquidacao_v3(UUID) CASCADE;
DROP FUNCTION IF EXISTS criar_aposta_com_debito_v3(JSONB, JSONB) CASCADE;
DROP FUNCTION IF EXISTS process_financial_event(UUID, UUID, TEXT, TEXT, TEXT, NUMERIC, TEXT, TEXT, UUID, TEXT, TEXT) CASCADE;

-- =====================================================
-- PARTE 3: CRIAR/RECRIAR TABELA financial_events LIMPA
-- =====================================================

-- Recriar a tabela limpa
DROP TABLE IF EXISTS financial_events CASCADE;

CREATE TABLE public.financial_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Referências
  bookmaker_id UUID NOT NULL REFERENCES bookmakers(id),
  aposta_id UUID REFERENCES apostas_unificada(id) ON DELETE SET NULL,
  workspace_id UUID NOT NULL REFERENCES workspaces(id),
  
  -- Tipo do evento
  tipo_evento TEXT NOT NULL CHECK (tipo_evento IN (
    'STAKE', 'PAYOUT', 'VOID_REFUND', 'REVERSAL',
    'FREEBET_STAKE', 'FREEBET_PAYOUT', 'FREEBET_CREDIT', 'FREEBET_EXPIRE',
    'DEPOSITO', 'SAQUE', 'CASHBACK', 'BONUS', 'AJUSTE'
  )),
  
  -- Pool de saldo afetado
  tipo_uso TEXT NOT NULL DEFAULT 'NORMAL' CHECK (tipo_uso IN ('NORMAL', 'FREEBET')),
  
  -- Origem do valor (para rastreabilidade)
  origem TEXT CHECK (origem IN ('DEPOSITO', 'BONUS', 'LUCRO', 'CASHBACK', 'PROMO', 'FREEBET', 'AJUSTE', NULL)),
  
  -- Valor: positivo = crédito, negativo = débito
  valor NUMERIC NOT NULL,
  moeda TEXT NOT NULL DEFAULT 'BRL',
  
  -- Idempotência
  idempotency_key TEXT UNIQUE,
  
  -- Para reversões
  reversed_event_id UUID REFERENCES financial_events(id),
  
  -- Metadados
  descricao TEXT,
  metadata JSONB DEFAULT '{}',
  
  -- Controle
  processed_at TIMESTAMPTZ, -- Quando foi aplicado ao saldo
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID
);

-- Índices para performance
CREATE INDEX idx_financial_events_bookmaker ON financial_events(bookmaker_id);
CREATE INDEX idx_financial_events_aposta ON financial_events(aposta_id) WHERE aposta_id IS NOT NULL;
CREATE INDEX idx_financial_events_workspace ON financial_events(workspace_id);
CREATE INDEX idx_financial_events_idempotency ON financial_events(idempotency_key) WHERE idempotency_key IS NOT NULL;
CREATE INDEX idx_financial_events_created ON financial_events(created_at DESC);
CREATE INDEX idx_financial_events_unprocessed ON financial_events(processed_at) WHERE processed_at IS NULL;

-- RLS
ALTER TABLE financial_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "financial_events_workspace_read" ON financial_events
  FOR SELECT USING (
    workspace_id IN (
      SELECT workspace_id FROM workspace_members WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "financial_events_workspace_insert" ON financial_events
  FOR INSERT WITH CHECK (
    workspace_id IN (
      SELECT workspace_id FROM workspace_members WHERE user_id = auth.uid()
    )
  );

-- =====================================================
-- PARTE 4: CRIAR RPC PROCESS_FINANCIAL_EVENT (Nova versão)
-- =====================================================

CREATE OR REPLACE FUNCTION process_financial_event(
  p_bookmaker_id UUID,
  p_aposta_id UUID DEFAULT NULL,
  p_tipo_evento TEXT DEFAULT 'AJUSTE',
  p_tipo_uso TEXT DEFAULT 'NORMAL',
  p_origem TEXT DEFAULT NULL,
  p_valor NUMERIC DEFAULT 0,
  p_moeda TEXT DEFAULT 'BRL',
  p_idempotency_key TEXT DEFAULT NULL,
  p_reversed_event_id UUID DEFAULT NULL,
  p_descricao TEXT DEFAULT NULL,
  p_metadata TEXT DEFAULT '{}'
)
RETURNS TABLE(
  success BOOLEAN,
  event_id UUID,
  new_balance NUMERIC,
  new_freebet_balance NUMERIC,
  error_message TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_workspace_id UUID;
  v_user_id UUID;
  v_event_id UUID;
  v_current_saldo NUMERIC;
  v_current_freebet NUMERIC;
  v_new_saldo NUMERIC;
  v_new_freebet NUMERIC;
BEGIN
  -- Obter user_id
  v_user_id := auth.uid();
  
  -- Verificar idempotência
  IF p_idempotency_key IS NOT NULL THEN
    SELECT id INTO v_event_id 
    FROM financial_events 
    WHERE idempotency_key = p_idempotency_key;
    
    IF v_event_id IS NOT NULL THEN
      -- Evento já existe, retornar silenciosamente
      SELECT saldo_atual, saldo_freebet INTO v_current_saldo, v_current_freebet
      FROM bookmakers WHERE id = p_bookmaker_id;
      
      RETURN QUERY SELECT 
        TRUE, 
        v_event_id, 
        v_current_saldo, 
        v_current_freebet,
        'Evento já processado (idempotente)'::TEXT;
      RETURN;
    END IF;
  END IF;
  
  -- Buscar bookmaker e bloquear para update
  SELECT workspace_id, saldo_atual, saldo_freebet 
  INTO v_workspace_id, v_current_saldo, v_current_freebet
  FROM bookmakers 
  WHERE id = p_bookmaker_id
  FOR UPDATE;
  
  IF v_workspace_id IS NULL THEN
    RETURN QUERY SELECT FALSE, NULL::UUID, NULL::NUMERIC, NULL::NUMERIC, 'Bookmaker não encontrado'::TEXT;
    RETURN;
  END IF;
  
  -- Validar saldo suficiente para débitos
  IF p_valor < 0 THEN
    IF p_tipo_uso = 'FREEBET' THEN
      IF v_current_freebet + p_valor < 0 THEN
        RETURN QUERY SELECT FALSE, NULL::UUID, v_current_saldo, v_current_freebet, 
          format('Saldo freebet insuficiente: %.2f disponível, %.2f necessário', v_current_freebet, ABS(p_valor))::TEXT;
        RETURN;
      END IF;
    ELSE
      IF v_current_saldo + p_valor < 0 THEN
        RETURN QUERY SELECT FALSE, NULL::UUID, v_current_saldo, v_current_freebet,
          format('Saldo insuficiente: %.2f disponível, %.2f necessário', v_current_saldo, ABS(p_valor))::TEXT;
        RETURN;
      END IF;
    END IF;
  END IF;
  
  -- Calcular novos saldos
  IF p_tipo_uso = 'FREEBET' THEN
    v_new_saldo := v_current_saldo;
    v_new_freebet := v_current_freebet + p_valor;
  ELSE
    v_new_saldo := v_current_saldo + p_valor;
    v_new_freebet := v_current_freebet;
  END IF;
  
  -- Inserir evento
  INSERT INTO financial_events (
    bookmaker_id, aposta_id, workspace_id, tipo_evento, tipo_uso, 
    origem, valor, moeda, idempotency_key, reversed_event_id,
    descricao, metadata, processed_at, created_by
  ) VALUES (
    p_bookmaker_id, p_aposta_id, v_workspace_id, p_tipo_evento, p_tipo_uso,
    p_origem, p_valor, p_moeda, p_idempotency_key, p_reversed_event_id,
    p_descricao, p_metadata::JSONB, now(), v_user_id
  ) RETURNING id INTO v_event_id;
  
  -- Atualizar saldo da bookmaker (ÚNICA ATUALIZAÇÃO DE SALDO PERMITIDA)
  UPDATE bookmakers SET
    saldo_atual = v_new_saldo,
    saldo_freebet = v_new_freebet,
    updated_at = now()
  WHERE id = p_bookmaker_id;
  
  RETURN QUERY SELECT TRUE, v_event_id, v_new_saldo, v_new_freebet, NULL::TEXT;
END;
$$;

-- =====================================================
-- PARTE 5: CRIAR RPC PARA CRIAR APOSTA COM DÉBITO ATÔMICO
-- =====================================================

CREATE OR REPLACE FUNCTION criar_aposta_atomica_v3(
  p_workspace_id UUID,
  p_user_id UUID,
  p_projeto_id UUID,
  p_bookmaker_id UUID,
  p_stake NUMERIC,
  p_odd NUMERIC,
  p_selecao TEXT,
  p_estrategia TEXT DEFAULT 'PUNTER',
  p_forma_registro TEXT DEFAULT 'SIMPLES',
  p_fonte_saldo TEXT DEFAULT 'REAL',
  p_evento TEXT DEFAULT NULL,
  p_esporte TEXT DEFAULT NULL,
  p_mercado TEXT DEFAULT NULL,
  p_observacoes TEXT DEFAULT NULL,
  p_data_aposta TIMESTAMPTZ DEFAULT now()
)
RETURNS TABLE(
  success BOOLEAN,
  aposta_id UUID,
  event_id UUID,
  message TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_aposta_id UUID;
  v_event_id UUID;
  v_moeda TEXT;
  v_saldo_atual NUMERIC;
  v_saldo_freebet NUMERIC;
  v_tipo_uso TEXT;
  v_tipo_evento TEXT;
BEGIN
  -- Determinar tipo de saldo a usar
  IF p_fonte_saldo = 'FREEBET' THEN
    v_tipo_uso := 'FREEBET';
    v_tipo_evento := 'FREEBET_STAKE';
  ELSE
    v_tipo_uso := 'NORMAL';
    v_tipo_evento := 'STAKE';
  END IF;
  
  -- Buscar bookmaker e validar saldo
  SELECT moeda, saldo_atual, saldo_freebet INTO v_moeda, v_saldo_atual, v_saldo_freebet
  FROM bookmakers 
  WHERE id = p_bookmaker_id
  FOR UPDATE;
  
  IF v_moeda IS NULL THEN
    RETURN QUERY SELECT FALSE, NULL::UUID, NULL::UUID, 'Bookmaker não encontrado'::TEXT;
    RETURN;
  END IF;
  
  -- Validar saldo
  IF v_tipo_uso = 'FREEBET' THEN
    IF v_saldo_freebet < p_stake THEN
      RETURN QUERY SELECT FALSE, NULL::UUID, NULL::UUID, 
        format('Saldo freebet insuficiente: %.2f disponível', v_saldo_freebet)::TEXT;
      RETURN;
    END IF;
  ELSE
    IF v_saldo_atual < p_stake THEN
      RETURN QUERY SELECT FALSE, NULL::UUID, NULL::UUID,
        format('Saldo insuficiente: %.2f disponível', v_saldo_atual)::TEXT;
      RETURN;
    END IF;
  END IF;
  
  -- Criar aposta
  INSERT INTO apostas_unificada (
    workspace_id, user_id, projeto_id, bookmaker_id,
    stake, odd, selecao, estrategia, forma_registro,
    fonte_saldo, usar_freebet, evento, esporte, mercado, observacoes,
    data_aposta, status, resultado, moeda_operacao
  ) VALUES (
    p_workspace_id, p_user_id, p_projeto_id, p_bookmaker_id,
    p_stake, p_odd, p_selecao, p_estrategia, p_forma_registro,
    p_fonte_saldo, p_fonte_saldo = 'FREEBET', p_evento, p_esporte, p_mercado, p_observacoes,
    p_data_aposta, 'PENDENTE', 'PENDENTE', v_moeda
  ) RETURNING id INTO v_aposta_id;
  
  -- Gerar idempotency_key para este stake
  -- Registrar evento de débito
  INSERT INTO financial_events (
    bookmaker_id, aposta_id, workspace_id, tipo_evento, tipo_uso,
    valor, moeda, idempotency_key, descricao, processed_at, created_by
  ) VALUES (
    p_bookmaker_id, v_aposta_id, p_workspace_id, v_tipo_evento, v_tipo_uso,
    -p_stake, v_moeda, 'stake_' || v_aposta_id::TEXT, 
    'Débito de stake para aposta', now(), p_user_id
  ) RETURNING id INTO v_event_id;
  
  -- Atualizar saldo
  IF v_tipo_uso = 'FREEBET' THEN
    UPDATE bookmakers SET saldo_freebet = saldo_freebet - p_stake, updated_at = now()
    WHERE id = p_bookmaker_id;
  ELSE
    UPDATE bookmakers SET saldo_atual = saldo_atual - p_stake, updated_at = now()
    WHERE id = p_bookmaker_id;
  END IF;
  
  RETURN QUERY SELECT TRUE, v_aposta_id, v_event_id, 'Aposta criada com débito'::TEXT;
END;
$$;

-- =====================================================
-- PARTE 6: CRIAR RPC PARA LIQUIDAR APOSTA
-- =====================================================

CREATE OR REPLACE FUNCTION liquidar_aposta_v4(
  p_aposta_id UUID,
  p_resultado TEXT,
  p_lucro_prejuizo NUMERIC DEFAULT NULL
)
RETURNS TABLE(
  success BOOLEAN,
  events_created INTEGER,
  message TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_aposta RECORD;
  v_payout NUMERIC := 0;
  v_event_id UUID;
  v_events_count INTEGER := 0;
  v_tipo_evento TEXT;
  v_tipo_uso TEXT;
BEGIN
  -- Buscar aposta
  SELECT * INTO v_aposta FROM apostas_unificada WHERE id = p_aposta_id FOR UPDATE;
  
  IF v_aposta.id IS NULL THEN
    RETURN QUERY SELECT FALSE, 0, 'Aposta não encontrada'::TEXT;
    RETURN;
  END IF;
  
  IF v_aposta.status = 'LIQUIDADA' THEN
    RETURN QUERY SELECT FALSE, 0, 'Aposta já liquidada'::TEXT;
    RETURN;
  END IF;
  
  -- Determinar tipo de uso
  IF v_aposta.fonte_saldo = 'FREEBET' OR v_aposta.usar_freebet THEN
    v_tipo_uso := 'FREEBET';
  ELSE
    v_tipo_uso := 'NORMAL';
  END IF;
  
  -- Calcular payout baseado no resultado
  CASE p_resultado
    WHEN 'GREEN' THEN
      IF v_tipo_uso = 'FREEBET' THEN
        -- Freebet: só lucro retorna
        v_payout := v_aposta.stake * (v_aposta.odd - 1);
        v_tipo_evento := 'FREEBET_PAYOUT';
      ELSE
        -- Normal: stake + lucro
        v_payout := v_aposta.stake * v_aposta.odd;
        v_tipo_evento := 'PAYOUT';
      END IF;
      
    WHEN 'RED' THEN
      -- RED: sem payout (stake já foi debitado na criação)
      v_payout := 0;
      v_tipo_evento := NULL;
      
    WHEN 'VOID' THEN
      -- VOID: devolve stake
      v_payout := v_aposta.stake;
      v_tipo_evento := 'VOID_REFUND';
      
    WHEN 'MEIO_GREEN' THEN
      IF v_tipo_uso = 'FREEBET' THEN
        v_payout := v_aposta.stake * (v_aposta.odd - 1) / 2;
        v_tipo_evento := 'FREEBET_PAYOUT';
      ELSE
        v_payout := v_aposta.stake + (v_aposta.stake * (v_aposta.odd - 1) / 2);
        v_tipo_evento := 'PAYOUT';
      END IF;
      
    WHEN 'MEIO_RED' THEN
      -- Meio RED: devolve metade da stake
      v_payout := v_aposta.stake / 2;
      v_tipo_evento := 'VOID_REFUND';
      
    ELSE
      RETURN QUERY SELECT FALSE, 0, format('Resultado inválido: %s', p_resultado)::TEXT;
      RETURN;
  END CASE;
  
  -- Criar evento de payout se aplicável
  IF v_tipo_evento IS NOT NULL AND v_payout > 0 THEN
    INSERT INTO financial_events (
      bookmaker_id, aposta_id, workspace_id, tipo_evento, tipo_uso,
      origem, valor, moeda, idempotency_key, descricao, processed_at, created_by
    ) VALUES (
      v_aposta.bookmaker_id, v_aposta.id, v_aposta.workspace_id, v_tipo_evento, 
      CASE WHEN v_tipo_evento LIKE 'FREEBET%' THEN 'NORMAL' ELSE v_tipo_uso END,
      'LUCRO', v_payout, v_aposta.moeda_operacao,
      'payout_' || v_aposta.id::TEXT || '_' || p_resultado,
      format('Payout %s', p_resultado), now(), auth.uid()
    ) RETURNING id INTO v_event_id;
    
    -- Atualizar saldo (payout sempre vai para saldo normal, mesmo de freebet)
    UPDATE bookmakers SET 
      saldo_atual = saldo_atual + v_payout,
      updated_at = now()
    WHERE id = v_aposta.bookmaker_id;
    
    v_events_count := 1;
  END IF;
  
  -- Atualizar aposta
  UPDATE apostas_unificada SET
    status = 'LIQUIDADA',
    resultado = p_resultado,
    lucro_prejuizo = COALESCE(p_lucro_prejuizo, 
      CASE 
        WHEN p_resultado = 'GREEN' THEN v_aposta.stake * (v_aposta.odd - 1)
        WHEN p_resultado = 'RED' THEN -v_aposta.stake
        WHEN p_resultado = 'VOID' THEN 0
        WHEN p_resultado = 'MEIO_GREEN' THEN v_aposta.stake * (v_aposta.odd - 1) / 2
        WHEN p_resultado = 'MEIO_RED' THEN -v_aposta.stake / 2
      END
    ),
    valor_retorno = v_payout,
    updated_at = now()
  WHERE id = p_aposta_id;
  
  RETURN QUERY SELECT TRUE, v_events_count, format('Aposta liquidada: %s', p_resultado)::TEXT;
END;
$$;

-- =====================================================
-- PARTE 7: CRIAR RPC PARA REVERTER LIQUIDAÇÃO
-- =====================================================

CREATE OR REPLACE FUNCTION reverter_liquidacao_v4(
  p_aposta_id UUID
)
RETURNS TABLE(
  success BOOLEAN,
  reversals_created INTEGER,
  message TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_aposta RECORD;
  v_event RECORD;
  v_reversals INTEGER := 0;
BEGIN
  -- Buscar aposta
  SELECT * INTO v_aposta FROM apostas_unificada WHERE id = p_aposta_id FOR UPDATE;
  
  IF v_aposta.id IS NULL THEN
    RETURN QUERY SELECT FALSE, 0, 'Aposta não encontrada'::TEXT;
    RETURN;
  END IF;
  
  IF v_aposta.status != 'LIQUIDADA' THEN
    RETURN QUERY SELECT FALSE, 0, 'Aposta não está liquidada'::TEXT;
    RETURN;
  END IF;
  
  -- Reverter cada evento da aposta que ainda não foi revertido
  FOR v_event IN 
    SELECT * FROM financial_events 
    WHERE aposta_id = p_aposta_id 
    AND tipo_evento != 'REVERSAL'
    AND NOT EXISTS (
      SELECT 1 FROM financial_events r 
      WHERE r.reversed_event_id = financial_events.id
    )
  LOOP
    -- Criar evento de reversão
    INSERT INTO financial_events (
      bookmaker_id, aposta_id, workspace_id, tipo_evento, tipo_uso,
      valor, moeda, idempotency_key, reversed_event_id, descricao, processed_at, created_by
    ) VALUES (
      v_event.bookmaker_id, v_event.aposta_id, v_event.workspace_id, 'REVERSAL', v_event.tipo_uso,
      -v_event.valor, v_event.moeda, 
      'reversal_' || v_event.id::TEXT,
      v_event.id,
      format('Reversão de %s', v_event.tipo_evento), now(), auth.uid()
    );
    
    -- Atualizar saldo (inverso do evento original)
    IF v_event.tipo_uso = 'FREEBET' THEN
      UPDATE bookmakers SET saldo_freebet = saldo_freebet - v_event.valor WHERE id = v_event.bookmaker_id;
    ELSE
      UPDATE bookmakers SET saldo_atual = saldo_atual - v_event.valor WHERE id = v_event.bookmaker_id;
    END IF;
    
    v_reversals := v_reversals + 1;
  END LOOP;
  
  -- Voltar aposta para PENDENTE
  UPDATE apostas_unificada SET
    status = 'PENDENTE',
    resultado = 'PENDENTE',
    lucro_prejuizo = NULL,
    valor_retorno = NULL,
    updated_at = now()
  WHERE id = p_aposta_id;
  
  RETURN QUERY SELECT TRUE, v_reversals, format('%s eventos revertidos', v_reversals)::TEXT;
END;
$$;

-- =====================================================
-- PARTE 8: CRIAR RPC PARA DELETAR APOSTA (com reversão)
-- =====================================================

CREATE OR REPLACE FUNCTION deletar_aposta_v4(
  p_aposta_id UUID
)
RETURNS TABLE(
  success BOOLEAN,
  message TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_aposta RECORD;
  v_event RECORD;
BEGIN
  -- Buscar aposta
  SELECT * INTO v_aposta FROM apostas_unificada WHERE id = p_aposta_id FOR UPDATE;
  
  IF v_aposta.id IS NULL THEN
    RETURN QUERY SELECT FALSE, 'Aposta não encontrada'::TEXT;
    RETURN;
  END IF;
  
  -- Se estava liquidada, reverter primeiro
  IF v_aposta.status = 'LIQUIDADA' THEN
    PERFORM * FROM reverter_liquidacao_v4(p_aposta_id);
  END IF;
  
  -- Reverter stake (evento STAKE ou FREEBET_STAKE)
  FOR v_event IN 
    SELECT * FROM financial_events 
    WHERE aposta_id = p_aposta_id 
    AND tipo_evento IN ('STAKE', 'FREEBET_STAKE')
    AND NOT EXISTS (
      SELECT 1 FROM financial_events r 
      WHERE r.reversed_event_id = financial_events.id
    )
  LOOP
    -- Criar reversão do stake
    INSERT INTO financial_events (
      bookmaker_id, aposta_id, workspace_id, tipo_evento, tipo_uso,
      valor, moeda, idempotency_key, reversed_event_id, descricao, processed_at, created_by
    ) VALUES (
      v_event.bookmaker_id, v_event.aposta_id, v_event.workspace_id, 'REVERSAL', v_event.tipo_uso,
      -v_event.valor, v_event.moeda,
      'delete_reversal_' || v_event.id::TEXT,
      v_event.id,
      'Reversão por exclusão de aposta', now(), auth.uid()
    );
    
    -- Devolver stake
    IF v_event.tipo_uso = 'FREEBET' THEN
      UPDATE bookmakers SET saldo_freebet = saldo_freebet - v_event.valor WHERE id = v_event.bookmaker_id;
    ELSE
      UPDATE bookmakers SET saldo_atual = saldo_atual - v_event.valor WHERE id = v_event.bookmaker_id;
    END IF;
  END LOOP;
  
  -- Deletar pernas se existirem
  DELETE FROM apostas_pernas WHERE aposta_id = p_aposta_id;
  
  -- Deletar aposta
  DELETE FROM apostas_unificada WHERE id = p_aposta_id;
  
  RETURN QUERY SELECT TRUE, 'Aposta excluída com reversão financeira'::TEXT;
END;
$$;

-- =====================================================
-- PARTE 9: VIEW DE AUDITORIA FINANCEIRA
-- =====================================================

DROP VIEW IF EXISTS v_financial_audit CASCADE;

CREATE OR REPLACE VIEW v_financial_audit AS
SELECT 
  b.id AS bookmaker_id,
  b.nome AS bookmaker_nome,
  b.workspace_id,
  b.moeda,
  b.saldo_atual AS saldo_registrado,
  b.saldo_freebet AS freebet_registrado,
  
  -- Soma dos eventos NORMAL
  COALESCE(SUM(CASE WHEN fe.tipo_uso = 'NORMAL' THEN fe.valor ELSE 0 END), 0) AS soma_eventos_normal,
  
  -- Soma dos eventos FREEBET  
  COALESCE(SUM(CASE WHEN fe.tipo_uso = 'FREEBET' THEN fe.valor ELSE 0 END), 0) AS soma_eventos_freebet,
  
  -- Diferenças (devem ser ZERO se consistente)
  b.saldo_atual - COALESCE(SUM(CASE WHEN fe.tipo_uso = 'NORMAL' THEN fe.valor ELSE 0 END), 0) AS diferenca_normal,
  b.saldo_freebet - COALESCE(SUM(CASE WHEN fe.tipo_uso = 'FREEBET' THEN fe.valor ELSE 0 END), 0) AS diferenca_freebet,
  
  -- Status
  CASE 
    WHEN ABS(b.saldo_atual - COALESCE(SUM(CASE WHEN fe.tipo_uso = 'NORMAL' THEN fe.valor ELSE 0 END), 0)) < 0.01
     AND ABS(b.saldo_freebet - COALESCE(SUM(CASE WHEN fe.tipo_uso = 'FREEBET' THEN fe.valor ELSE 0 END), 0)) < 0.01
    THEN 'OK'
    ELSE 'DIVERGENTE'
  END AS status_auditoria,
  
  COUNT(fe.id) AS total_eventos

FROM bookmakers b
LEFT JOIN financial_events fe ON fe.bookmaker_id = b.id
GROUP BY b.id, b.nome, b.workspace_id, b.moeda, b.saldo_atual, b.saldo_freebet;

-- Grant para a view
GRANT SELECT ON v_financial_audit TO authenticated;