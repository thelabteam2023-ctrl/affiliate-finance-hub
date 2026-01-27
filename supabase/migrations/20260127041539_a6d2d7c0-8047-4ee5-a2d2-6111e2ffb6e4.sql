-- =====================================================================
-- MOTOR FINANCEIRO v6: ARQUITETURA BASEADA EM EVENTOS
-- =====================================================================
-- OBJETIVO: Uma única fonte de verdade (financial_events), um único
-- caminho de dinheiro, zero duplicação, auditoria total.
-- =====================================================================

-- 1) REMOVER TODOS OS TRIGGERS ANTIGOS QUE ATUALIZAM SALDO
-- =====================================================================

DROP TRIGGER IF EXISTS tr_cash_ledger_update_bookmaker_balance_v5 ON cash_ledger;
DROP TRIGGER IF EXISTS trigger_atualizar_saldo_bookmaker_v4 ON cash_ledger;
DROP TRIGGER IF EXISTS tr_protect_bookmaker_balance ON bookmakers;
DROP TRIGGER IF EXISTS update_bookmaker_saldo_on_transaction ON transacoes_bookmakers;

DROP FUNCTION IF EXISTS atualizar_saldo_bookmaker_v5() CASCADE;
DROP FUNCTION IF EXISTS atualizar_saldo_bookmaker_v4() CASCADE;
DROP FUNCTION IF EXISTS atualizar_saldo_bookmaker_v3() CASCADE;
DROP FUNCTION IF EXISTS atualizar_saldo_bookmaker_v2() CASCADE;
DROP FUNCTION IF EXISTS atualizar_saldo_bookmaker() CASCADE;
DROP FUNCTION IF EXISTS protect_bookmaker_balance() CASCADE;

-- 2) CRIAR TABELA financial_events (ÚNICA FONTE DE VERDADE)
-- =====================================================================

CREATE TABLE IF NOT EXISTS public.financial_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Referências
  bookmaker_id UUID NOT NULL REFERENCES bookmakers(id) ON DELETE CASCADE,
  aposta_id UUID REFERENCES apostas_unificada(id) ON DELETE SET NULL,
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  
  -- Tipo de evento
  tipo_evento TEXT NOT NULL CHECK (tipo_evento IN (
    'STAKE_DEBIT',      -- Débito de stake ao criar aposta
    'PAYOUT_GREEN',     -- Retorno de aposta ganha (stake + lucro)
    'PAYOUT_VOID',      -- Retorno de aposta void (apenas stake)
    'PAYOUT_MEIO_GREEN', -- Retorno parcial (meio green)
    'PAYOUT_MEIO_RED',  -- Retorno parcial (meio red)
    'REVERSAL',         -- Reversão de evento anterior
    'FREEBET_DEBIT',    -- Consumo de freebet
    'FREEBET_PAYOUT',   -- Lucro de freebet (sem retorno de stake)
    'FREEBET_CREDIT',   -- Crédito de freebet
    'FREEBET_EXPIRE',   -- Expiração de freebet
    'CASHBACK',         -- Cashback creditado
    'BONUS_CREDIT',     -- Bônus creditado
    'DEPOSITO',         -- Depósito
    'SAQUE',            -- Saque
    'AJUSTE_MANUAL',    -- Ajuste manual
    'PERDA_OPERACIONAL' -- Perda (limitação, bloqueio)
  )),
  
  -- Qual pool de saldo afeta
  tipo_uso TEXT NOT NULL DEFAULT 'NORMAL' CHECK (tipo_uso IN ('NORMAL', 'FREEBET')),
  
  -- Origem do dinheiro (para rastreabilidade)
  origem TEXT CHECK (origem IN (
    'DEPOSITO', 'BONUS', 'LUCRO', 'CASHBACK', 'PROMO', 'FREEBET', 'AJUSTE', NULL
  )),
  
  -- Valor (positivo = crédito, negativo = débito)
  valor NUMERIC(15,2) NOT NULL,
  moeda TEXT NOT NULL DEFAULT 'BRL',
  
  -- Idempotência: chave única para evitar duplicação
  idempotency_key TEXT NOT NULL,
  
  -- Referência ao evento revertido (para REVERSAL)
  reversed_event_id UUID REFERENCES financial_events(id),
  
  -- Status de processamento
  processed_at TIMESTAMPTZ,
  
  -- Metadados
  descricao TEXT,
  metadata JSONB DEFAULT '{}',
  
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  
  -- Constraint de unicidade para idempotência
  CONSTRAINT unique_idempotency_key UNIQUE (idempotency_key)
);

-- Índices para performance
CREATE INDEX IF NOT EXISTS idx_financial_events_bookmaker ON financial_events(bookmaker_id);
CREATE INDEX IF NOT EXISTS idx_financial_events_aposta ON financial_events(aposta_id);
CREATE INDEX IF NOT EXISTS idx_financial_events_workspace ON financial_events(workspace_id);
CREATE INDEX IF NOT EXISTS idx_financial_events_tipo ON financial_events(tipo_evento);
CREATE INDEX IF NOT EXISTS idx_financial_events_created ON financial_events(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_financial_events_unprocessed ON financial_events(bookmaker_id) WHERE processed_at IS NULL;

-- RLS
ALTER TABLE financial_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view events in their workspace"
  ON financial_events FOR SELECT
  USING (workspace_id IN (
    SELECT wm.workspace_id FROM workspace_members wm WHERE wm.user_id = auth.uid()
  ));

CREATE POLICY "Users can insert events in their workspace"
  ON financial_events FOR INSERT
  WITH CHECK (workspace_id IN (
    SELECT wm.workspace_id FROM workspace_members wm WHERE wm.user_id = auth.uid()
  ));

-- 3) TRIGGER ÚNICO: SINCRONIZA SALDO APÓS INSERÇÃO DE EVENTO
-- =====================================================================

CREATE OR REPLACE FUNCTION fn_financial_event_sync_balance()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_saldo_normal NUMERIC(15,2);
  v_saldo_freebet NUMERIC(15,2);
BEGIN
  -- Já foi processado? Ignora (idempotência)
  IF NEW.processed_at IS NOT NULL THEN
    RETURN NEW;
  END IF;

  -- Calcula saldo NORMAL (todos eventos onde tipo_uso = 'NORMAL')
  SELECT COALESCE(SUM(valor), 0)
  INTO v_saldo_normal
  FROM financial_events
  WHERE bookmaker_id = NEW.bookmaker_id
    AND tipo_uso = 'NORMAL'
    AND processed_at IS NOT NULL;
  
  -- Adiciona o evento atual se for NORMAL
  IF NEW.tipo_uso = 'NORMAL' THEN
    v_saldo_normal := v_saldo_normal + NEW.valor;
  END IF;

  -- Calcula saldo FREEBET (todos eventos onde tipo_uso = 'FREEBET')
  SELECT COALESCE(SUM(valor), 0)
  INTO v_saldo_freebet
  FROM financial_events
  WHERE bookmaker_id = NEW.bookmaker_id
    AND tipo_uso = 'FREEBET'
    AND processed_at IS NOT NULL;
  
  -- Adiciona o evento atual se for FREEBET
  IF NEW.tipo_uso = 'FREEBET' THEN
    v_saldo_freebet := v_saldo_freebet + NEW.valor;
  END IF;

  -- Atualiza bookmaker com saldos calculados
  UPDATE bookmakers
  SET 
    saldo_atual = v_saldo_normal,
    saldo_freebet = v_saldo_freebet,
    updated_at = now()
  WHERE id = NEW.bookmaker_id;

  -- Marca evento como processado
  NEW.processed_at := now();

  RETURN NEW;
END;
$$;

CREATE TRIGGER tr_financial_event_sync
  BEFORE INSERT ON financial_events
  FOR EACH ROW
  EXECUTE FUNCTION fn_financial_event_sync_balance();

-- 4) RPC: PROCESSAR EVENTO FINANCEIRO (com validações)
-- =====================================================================

CREATE OR REPLACE FUNCTION process_financial_event(
  p_bookmaker_id UUID,
  p_aposta_id UUID DEFAULT NULL,
  p_tipo_evento TEXT DEFAULT NULL,
  p_tipo_uso TEXT DEFAULT 'NORMAL',
  p_origem TEXT DEFAULT NULL,
  p_valor NUMERIC DEFAULT 0,
  p_moeda TEXT DEFAULT 'BRL',
  p_idempotency_key TEXT DEFAULT NULL,
  p_reversed_event_id UUID DEFAULT NULL,
  p_descricao TEXT DEFAULT NULL,
  p_metadata JSONB DEFAULT '{}'
)
RETURNS TABLE (
  success BOOLEAN,
  event_id UUID,
  error_message TEXT,
  new_balance NUMERIC
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_workspace_id UUID;
  v_user_id UUID;
  v_current_balance NUMERIC;
  v_new_event_id UUID;
  v_final_key TEXT;
BEGIN
  -- Gera chave de idempotência se não fornecida
  v_final_key := COALESCE(p_idempotency_key, gen_random_uuid()::TEXT);
  
  -- Verifica se já existe evento com esta chave (idempotência)
  IF EXISTS (SELECT 1 FROM financial_events WHERE idempotency_key = v_final_key) THEN
    SELECT fe.id INTO v_new_event_id 
    FROM financial_events fe 
    WHERE fe.idempotency_key = v_final_key;
    
    RETURN QUERY SELECT 
      TRUE, 
      v_new_event_id, 
      'Evento já processado (idempotente)'::TEXT,
      (SELECT CASE WHEN p_tipo_uso = 'FREEBET' THEN saldo_freebet ELSE saldo_atual END FROM bookmakers WHERE id = p_bookmaker_id);
    RETURN;
  END IF;

  -- Obtém workspace e user do bookmaker
  SELECT workspace_id, user_id INTO v_workspace_id, v_user_id
  FROM bookmakers WHERE id = p_bookmaker_id;

  IF v_workspace_id IS NULL THEN
    RETURN QUERY SELECT FALSE, NULL::UUID, 'Bookmaker não encontrado'::TEXT, 0::NUMERIC;
    RETURN;
  END IF;

  -- Obtém saldo atual
  SELECT CASE WHEN p_tipo_uso = 'FREEBET' THEN saldo_freebet ELSE saldo_atual END
  INTO v_current_balance
  FROM bookmakers WHERE id = p_bookmaker_id;

  -- Valida saldo suficiente para débitos
  IF p_valor < 0 AND (v_current_balance + p_valor) < 0 THEN
    RETURN QUERY SELECT 
      FALSE, 
      NULL::UUID, 
      format('Saldo insuficiente. Atual: %s, Débito: %s', v_current_balance, ABS(p_valor))::TEXT,
      v_current_balance;
    RETURN;
  END IF;

  -- Insere evento (trigger faz o resto)
  INSERT INTO financial_events (
    bookmaker_id,
    aposta_id,
    workspace_id,
    user_id,
    tipo_evento,
    tipo_uso,
    origem,
    valor,
    moeda,
    idempotency_key,
    reversed_event_id,
    descricao,
    metadata
  ) VALUES (
    p_bookmaker_id,
    p_aposta_id,
    v_workspace_id,
    v_user_id,
    p_tipo_evento,
    p_tipo_uso,
    p_origem,
    p_valor,
    p_moeda,
    v_final_key,
    p_reversed_event_id,
    p_descricao,
    p_metadata
  )
  RETURNING id INTO v_new_event_id;

  -- Retorna sucesso com novo saldo
  RETURN QUERY SELECT 
    TRUE,
    v_new_event_id,
    NULL::TEXT,
    (SELECT CASE WHEN p_tipo_uso = 'FREEBET' THEN saldo_freebet ELSE saldo_atual END FROM bookmakers WHERE id = p_bookmaker_id);
END;
$$;

-- 5) RPC: LIQUIDAR APOSTA v3 (baseado em eventos)
-- =====================================================================

CREATE OR REPLACE FUNCTION liquidar_aposta_v3(
  p_aposta_id UUID,
  p_resultado TEXT, -- GREEN, RED, VOID, MEIO_GREEN, MEIO_RED
  p_lucro_prejuizo NUMERIC DEFAULT NULL
)
RETURNS TABLE (
  success BOOLEAN,
  message TEXT,
  events_created INTEGER
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_aposta RECORD;
  v_perna RECORD;
  v_events_count INTEGER := 0;
  v_payout NUMERIC;
  v_tipo_evento TEXT;
  v_event_result RECORD;
BEGIN
  -- Busca dados da aposta
  SELECT * INTO v_aposta FROM apostas_unificada WHERE id = p_aposta_id;
  
  IF v_aposta IS NULL THEN
    RETURN QUERY SELECT FALSE, 'Aposta não encontrada'::TEXT, 0;
    RETURN;
  END IF;

  -- Já liquidada? Precisa reverter primeiro
  IF v_aposta.status = 'LIQUIDADA' THEN
    RETURN QUERY SELECT FALSE, 'Aposta já liquidada. Use reverter_liquidacao_v3 primeiro.'::TEXT, 0;
    RETURN;
  END IF;

  -- Processa cada perna
  FOR v_perna IN 
    SELECT * FROM apostas_pernas WHERE aposta_id = p_aposta_id ORDER BY ordem
  LOOP
    -- Determina tipo de evento e valor do payout
    CASE p_resultado
      WHEN 'GREEN' THEN
        v_tipo_evento := CASE WHEN v_perna.fonte_saldo = 'FREEBET' THEN 'FREEBET_PAYOUT' ELSE 'PAYOUT_GREEN' END;
        -- GREEN normal: stake + lucro; GREEN freebet: apenas lucro
        IF v_perna.fonte_saldo = 'FREEBET' THEN
          v_payout := v_perna.stake * (v_perna.odd - 1); -- Apenas lucro
        ELSE
          v_payout := v_perna.stake * v_perna.odd; -- Stake + lucro
        END IF;
        
      WHEN 'VOID' THEN
        v_tipo_evento := CASE WHEN v_perna.fonte_saldo = 'FREEBET' THEN 'FREEBET_CREDIT' ELSE 'PAYOUT_VOID' END;
        v_payout := v_perna.stake; -- Devolve stake
        
      WHEN 'RED' THEN
        -- RED não gera evento (stake já foi debitado na criação)
        CONTINUE;
        
      WHEN 'MEIO_GREEN' THEN
        v_tipo_evento := 'PAYOUT_MEIO_GREEN';
        v_payout := v_perna.stake + (v_perna.stake * (v_perna.odd - 1) / 2); -- Stake + metade do lucro
        
      WHEN 'MEIO_RED' THEN
        v_tipo_evento := 'PAYOUT_MEIO_RED';
        v_payout := v_perna.stake / 2; -- Metade do stake
        
      ELSE
        CONTINUE;
    END CASE;

    -- Emite evento de payout
    SELECT * INTO v_event_result FROM process_financial_event(
      p_bookmaker_id := v_perna.bookmaker_id,
      p_aposta_id := p_aposta_id,
      p_tipo_evento := v_tipo_evento,
      p_tipo_uso := CASE WHEN v_perna.fonte_saldo = 'FREEBET' THEN 'FREEBET' ELSE 'NORMAL' END,
      p_origem := 'LUCRO',
      p_valor := v_payout,
      p_moeda := v_perna.moeda,
      p_idempotency_key := format('liq_%s_%s_%s', p_aposta_id, v_perna.id, p_resultado),
      p_descricao := format('Liquidação %s aposta', p_resultado),
      p_metadata := jsonb_build_object('perna_id', v_perna.id, 'odd', v_perna.odd)
    );

    IF v_event_result.success THEN
      v_events_count := v_events_count + 1;
    END IF;

    -- Atualiza lucro/prejuízo na perna
    UPDATE apostas_pernas
    SET 
      resultado = p_resultado,
      lucro_prejuizo = CASE 
        WHEN p_resultado = 'GREEN' THEN v_perna.stake * (v_perna.odd - 1)
        WHEN p_resultado = 'RED' THEN -v_perna.stake
        WHEN p_resultado = 'VOID' THEN 0
        WHEN p_resultado = 'MEIO_GREEN' THEN v_perna.stake * (v_perna.odd - 1) / 2
        WHEN p_resultado = 'MEIO_RED' THEN -v_perna.stake / 2
        ELSE 0
      END,
      updated_at = now()
    WHERE id = v_perna.id;
  END LOOP;

  -- Atualiza aposta principal
  UPDATE apostas_unificada
  SET 
    status = 'LIQUIDADA',
    resultado = p_resultado,
    lucro_prejuizo = COALESCE(p_lucro_prejuizo, (
      SELECT SUM(lucro_prejuizo) FROM apostas_pernas WHERE aposta_id = p_aposta_id
    )),
    updated_at = now()
  WHERE id = p_aposta_id;

  RETURN QUERY SELECT TRUE, format('Liquidação concluída. %s eventos criados.', v_events_count)::TEXT, v_events_count;
END;
$$;

-- 6) RPC: REVERTER LIQUIDAÇÃO v3 (baseado em eventos)
-- =====================================================================

CREATE OR REPLACE FUNCTION reverter_liquidacao_v3(p_aposta_id UUID)
RETURNS TABLE (
  success BOOLEAN,
  message TEXT,
  reversals_created INTEGER
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_aposta RECORD;
  v_evento RECORD;
  v_reversals INTEGER := 0;
  v_event_result RECORD;
BEGIN
  SELECT * INTO v_aposta FROM apostas_unificada WHERE id = p_aposta_id;
  
  IF v_aposta IS NULL THEN
    RETURN QUERY SELECT FALSE, 'Aposta não encontrada'::TEXT, 0;
    RETURN;
  END IF;

  IF v_aposta.status != 'LIQUIDADA' THEN
    RETURN QUERY SELECT FALSE, 'Aposta não está liquidada'::TEXT, 0;
    RETURN;
  END IF;

  -- Reverte cada evento financeiro desta aposta
  FOR v_evento IN 
    SELECT * FROM financial_events 
    WHERE aposta_id = p_aposta_id 
      AND tipo_evento NOT LIKE 'REVERSAL%'
      AND processed_at IS NOT NULL
    ORDER BY created_at DESC
  LOOP
    -- Cria evento de reversão (valor oposto)
    SELECT * INTO v_event_result FROM process_financial_event(
      p_bookmaker_id := v_evento.bookmaker_id,
      p_aposta_id := p_aposta_id,
      p_tipo_evento := 'REVERSAL',
      p_tipo_uso := v_evento.tipo_uso,
      p_origem := 'AJUSTE',
      p_valor := -v_evento.valor, -- Valor oposto
      p_moeda := v_evento.moeda,
      p_idempotency_key := format('rev_%s_%s', v_evento.id, now()::TEXT),
      p_reversed_event_id := v_evento.id,
      p_descricao := format('Reversão de %s', v_evento.tipo_evento),
      p_metadata := jsonb_build_object('original_event_id', v_evento.id)
    );

    IF v_event_result.success THEN
      v_reversals := v_reversals + 1;
    END IF;
  END LOOP;

  -- Retorna aposta para PENDENTE
  UPDATE apostas_unificada
  SET 
    status = 'PENDENTE',
    resultado = NULL,
    lucro_prejuizo = NULL,
    updated_at = now()
  WHERE id = p_aposta_id;

  UPDATE apostas_pernas
  SET 
    resultado = NULL,
    lucro_prejuizo = NULL,
    updated_at = now()
  WHERE aposta_id = p_aposta_id;

  RETURN QUERY SELECT TRUE, format('Reversão concluída. %s eventos revertidos.', v_reversals)::TEXT, v_reversals;
END;
$$;

-- 7) RPC: CRIAR APOSTA COM DÉBITO v3 (baseado em eventos)
-- =====================================================================

CREATE OR REPLACE FUNCTION criar_aposta_com_debito_v3(
  p_aposta_data JSONB,
  p_pernas JSONB
)
RETURNS TABLE (
  success BOOLEAN,
  aposta_id UUID,
  message TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_aposta_id UUID;
  v_perna JSONB;
  v_perna_id UUID;
  v_event_result RECORD;
  v_bookmaker_id UUID;
  v_stake NUMERIC;
  v_fonte_saldo TEXT;
  v_moeda TEXT;
BEGIN
  -- Cria aposta principal
  INSERT INTO apostas_unificada (
    workspace_id,
    user_id,
    projeto_id,
    data_aposta,
    estrategia,
    evento,
    mercado,
    esporte,
    observacoes,
    status,
    forma_registro,
    contexto_operacional
  )
  SELECT 
    (p_aposta_data->>'workspace_id')::UUID,
    (p_aposta_data->>'user_id')::UUID,
    (p_aposta_data->>'projeto_id')::UUID,
    COALESCE((p_aposta_data->>'data_aposta')::DATE, CURRENT_DATE),
    COALESCE(p_aposta_data->>'estrategia', 'multipla'),
    p_aposta_data->>'evento',
    p_aposta_data->>'mercado',
    p_aposta_data->>'esporte',
    p_aposta_data->>'observacoes',
    'PENDENTE',
    COALESCE(p_aposta_data->>'forma_registro', 'MANUAL'),
    COALESCE(p_aposta_data->>'contexto_operacional', 'NORMAL')
  RETURNING id INTO v_aposta_id;

  -- Processa cada perna
  FOR v_perna IN SELECT * FROM jsonb_array_elements(p_pernas)
  LOOP
    v_bookmaker_id := (v_perna->>'bookmaker_id')::UUID;
    v_stake := (v_perna->>'stake')::NUMERIC;
    v_fonte_saldo := COALESCE(v_perna->>'fonte_saldo', 'REAL');
    v_moeda := COALESCE(v_perna->>'moeda', 'BRL');

    -- Cria perna
    INSERT INTO apostas_pernas (
      aposta_id,
      bookmaker_id,
      stake,
      odd,
      selecao,
      moeda,
      fonte_saldo,
      ordem
    ) VALUES (
      v_aposta_id,
      v_bookmaker_id,
      v_stake,
      (v_perna->>'odd')::NUMERIC,
      v_perna->>'selecao',
      v_moeda,
      v_fonte_saldo,
      COALESCE((v_perna->>'ordem')::INTEGER, 1)
    )
    RETURNING id INTO v_perna_id;

    -- Emite evento de débito
    SELECT * INTO v_event_result FROM process_financial_event(
      p_bookmaker_id := v_bookmaker_id,
      p_aposta_id := v_aposta_id,
      p_tipo_evento := CASE WHEN v_fonte_saldo = 'FREEBET' THEN 'FREEBET_DEBIT' ELSE 'STAKE_DEBIT' END,
      p_tipo_uso := CASE WHEN v_fonte_saldo = 'FREEBET' THEN 'FREEBET' ELSE 'NORMAL' END,
      p_origem := NULL,
      p_valor := -v_stake, -- Negativo = débito
      p_moeda := v_moeda,
      p_idempotency_key := format('stake_%s_%s', v_aposta_id, v_perna_id),
      p_descricao := 'Débito de stake para aposta',
      p_metadata := jsonb_build_object('perna_id', v_perna_id)
    );

    IF NOT v_event_result.success THEN
      -- Rollback: deleta aposta criada
      DELETE FROM apostas_unificada WHERE id = v_aposta_id;
      RETURN QUERY SELECT FALSE, NULL::UUID, v_event_result.error_message;
      RETURN;
    END IF;
  END LOOP;

  RETURN QUERY SELECT TRUE, v_aposta_id, 'Aposta criada com sucesso'::TEXT;
END;
$$;

-- 8) VIEW DE AUDITORIA
-- =====================================================================

CREATE OR REPLACE VIEW v_financial_audit AS
SELECT 
  b.id AS bookmaker_id,
  b.nome AS bookmaker_nome,
  b.saldo_atual AS saldo_registrado,
  b.saldo_freebet AS freebet_registrado,
  COALESCE(e_normal.soma, 0) AS soma_eventos_normal,
  COALESCE(e_freebet.soma, 0) AS soma_eventos_freebet,
  b.saldo_atual - COALESCE(e_normal.soma, 0) AS diferenca_normal,
  b.saldo_freebet - COALESCE(e_freebet.soma, 0) AS diferenca_freebet,
  CASE 
    WHEN ABS(b.saldo_atual - COALESCE(e_normal.soma, 0)) > 0.01 
      OR ABS(b.saldo_freebet - COALESCE(e_freebet.soma, 0)) > 0.01
    THEN 'DIVERGENTE'
    ELSE 'OK'
  END AS status_auditoria,
  b.workspace_id
FROM bookmakers b
LEFT JOIN (
  SELECT bookmaker_id, SUM(valor) AS soma
  FROM financial_events
  WHERE tipo_uso = 'NORMAL' AND processed_at IS NOT NULL
  GROUP BY bookmaker_id
) e_normal ON b.id = e_normal.bookmaker_id
LEFT JOIN (
  SELECT bookmaker_id, SUM(valor) AS soma
  FROM financial_events
  WHERE tipo_uso = 'FREEBET' AND processed_at IS NOT NULL
  GROUP BY bookmaker_id
) e_freebet ON b.id = e_freebet.bookmaker_id;

-- Comentário de documentação
COMMENT ON TABLE financial_events IS 'Única fonte de verdade para movimentações financeiras. Todos os saldos são calculados a partir desta tabela.';
COMMENT ON VIEW v_financial_audit IS 'Auditoria: compara saldo registrado vs soma dos eventos. Diferença deve ser sempre zero.';