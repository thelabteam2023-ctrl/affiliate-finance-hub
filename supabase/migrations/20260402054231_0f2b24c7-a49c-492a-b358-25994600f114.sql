
-- ============================================================
-- BLINDAGEM DEFINITIVA: event_scope ENUM + HARD RULES
-- ============================================================

-- 1. Criar ENUM para scope
DO $$ BEGIN
  CREATE TYPE public.event_scope AS ENUM ('REAL', 'VIRTUAL');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- 2. Adicionar coluna event_scope com default REAL
ALTER TABLE public.financial_events 
  ADD COLUMN IF NOT EXISTS event_scope public.event_scope NOT NULL DEFAULT 'REAL';

-- 3. Backfill: classificar eventos existentes
UPDATE public.financial_events
SET event_scope = 'VIRTUAL'
WHERE origem IN ('DEPOSITO_VIRTUAL', 'SAQUE_VIRTUAL', 'CORRECAO_VIRTUAL')
  OR (tipo_evento = 'REVERSAL' AND origem = 'CORRECAO_VIRTUAL')
  OR (descricao ILIKE '%virtual%' AND origem IS NOT NULL AND origem LIKE '%VIRTUAL%');

-- 4. Atualizar constraint de origem para incluir novos valores
ALTER TABLE public.financial_events DROP CONSTRAINT IF EXISTS financial_events_origem_check;
ALTER TABLE public.financial_events ADD CONSTRAINT financial_events_origem_check 
  CHECK (origem = ANY (ARRAY[
    'DEPOSITO'::text, 'BONUS'::text, 'LUCRO'::text, 'CASHBACK'::text, 
    'PROMO'::text, 'FREEBET'::text, 'AJUSTE'::text,
    'DEPOSITO_VIRTUAL'::text, 'SAQUE_VIRTUAL'::text, 'CORRECAO_VIRTUAL'::text, 
    'CORRECAO_MANUAL'::text, 'CASHBACK_ESTORNO'::text, 'CASHBACK_MANUAL'::text,
    'GIRO_GRATIS'::text, 'AJUSTE_MANUAL'::text, 'AJUSTE_SALDO'::text,
    'BONUS_CREDITADO'::text, 'FREEBET_CREDIT'::text,
    NULL::text
  ]));

-- 5. Índice para consultas por scope
CREATE INDEX IF NOT EXISTS idx_financial_events_scope ON public.financial_events (event_scope);

-- ============================================================
-- 6. REFATORAR TRIGGER DE SALDO: usar event_scope como gate
-- ============================================================
CREATE OR REPLACE FUNCTION public.fn_financial_events_sync_balance()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_delta NUMERIC;
  v_saldo_anterior NUMERIC;
  v_saldo_novo NUMERIC;
BEGIN
  IF TG_OP != 'INSERT' THEN
    RETURN NEW;
  END IF;

  -- ============================================================
  -- HARD RULE: APENAS event_scope = 'REAL' ALTERA SALDO
  -- Eventos VIRTUAL são registrados mas NUNCA tocam saldo_atual
  -- ============================================================
  IF NEW.event_scope = 'VIRTUAL' THEN
    -- Registrar auditoria sem alterar saldo
    SELECT 
      CASE WHEN NEW.tipo_uso = 'FREEBET' THEN saldo_freebet ELSE saldo_atual END
    INTO v_saldo_anterior
    FROM bookmakers
    WHERE id = NEW.bookmaker_id;

    INSERT INTO bookmaker_balance_audit (
      bookmaker_id, workspace_id, origem, referencia_tipo, referencia_id,
      saldo_anterior, saldo_novo, observacoes, user_id
    ) VALUES (
      NEW.bookmaker_id, NEW.workspace_id, NEW.tipo_evento, 'financial_events', NEW.id,
      v_saldo_anterior, v_saldo_anterior,
      format('[VIRTUAL/NO-IMPACT] Evento %s scope=VIRTUAL: %s', NEW.tipo_evento, COALESCE(NEW.descricao, 'sem descrição')),
      NEW.created_by
    );
    RETURN NEW;
  END IF;

  -- ============================================================
  -- CONVENÇÃO ÚNICA DE SINAIS (v9.4):
  -- DÉBITOS: valor JÁ VEM NEGATIVO da RPC
  -- CRÉDITOS: valor JÁ VEM POSITIVO da RPC
  -- O trigger NÃO inverte sinais - usa o valor DIRETAMENTE
  -- ============================================================
  v_delta := NEW.valor;

  -- Ignorar delta zero
  IF v_delta = 0 OR v_delta IS NULL THEN
    RETURN NEW;
  END IF;

  -- Capturar saldo ANTES da atualização
  SELECT
    CASE WHEN NEW.tipo_uso = 'FREEBET' THEN saldo_freebet ELSE saldo_atual END
  INTO v_saldo_anterior
  FROM bookmakers
  WHERE id = NEW.bookmaker_id;

  -- Aplicar delta no saldo correto
  IF NEW.tipo_uso = 'FREEBET' THEN
    UPDATE bookmakers
    SET saldo_freebet = saldo_freebet + v_delta,
        updated_at = now()
    WHERE id = NEW.bookmaker_id;
  ELSE
    UPDATE bookmakers
    SET saldo_atual = saldo_atual + v_delta,
        updated_at = now()
    WHERE id = NEW.bookmaker_id;
  END IF;

  -- Capturar saldo DEPOIS da atualização
  SELECT
    CASE WHEN NEW.tipo_uso = 'FREEBET' THEN saldo_freebet ELSE saldo_atual END
  INTO v_saldo_novo
  FROM bookmakers
  WHERE id = NEW.bookmaker_id;

  -- Registrar auditoria
  INSERT INTO bookmaker_balance_audit (
    bookmaker_id, workspace_id, origem, referencia_tipo, referencia_id,
    saldo_anterior, saldo_novo, observacoes, user_id
  ) VALUES (
    NEW.bookmaker_id, NEW.workspace_id, NEW.tipo_evento, 'financial_events', NEW.id,
    v_saldo_anterior, v_saldo_novo,
    format('[REAL] Evento %s: %s', NEW.tipo_evento, COALESCE(NEW.descricao, 'sem descrição')),
    NEW.created_by
  );

  RETURN NEW;
END;
$$;

-- ============================================================
-- 7. REFATORAR TRIGGER DO LEDGER: marcar scope automaticamente
-- ============================================================
CREATE OR REPLACE FUNCTION public.fn_cash_ledger_generate_financial_events()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_bookmaker_record RECORD;
    v_idempotency_key TEXT;
    v_valor_efetivo NUMERIC;
    v_bk_id UUID;
    v_is_virtual BOOLEAN;
    v_event_scope public.event_scope;
BEGIN
    IF NEW.status IN ('DUPLICADO_CORRIGIDO', 'DUPLICADO_BLOQUEADO', 'CANCELADO', 'FAILED') THEN
        RETURN NEW;
    END IF;
    IF NEW.status != 'CONFIRMADO' THEN
        RETURN NEW;
    END IF;
    IF NEW.financial_events_generated = TRUE THEN
        RETURN NEW;
    END IF;

    -- Ignorar ajustes técnicos legados
    IF NEW.tipo_transacao = 'AJUSTE_SALDO'
       AND COALESCE(NEW.descricao, '') ILIKE 'Reconciliação: reset saldo negativo para zero%'
    THEN
        NEW.financial_events_generated := TRUE;
        NEW.balance_processed_at := NOW();
        RETURN NEW;
    END IF;

    -- ============================================================
    -- HARD RULE: Determinar scope baseado no tipo de transação
    -- VIRTUAL = contabilidade de projeto, NUNCA afeta saldo real
    -- ============================================================
    v_is_virtual := NEW.tipo_transacao IN ('DEPOSITO_VIRTUAL', 'SAQUE_VIRTUAL');
    v_event_scope := CASE WHEN v_is_virtual THEN 'VIRTUAL'::public.event_scope ELSE 'REAL'::public.event_scope END;

    -- DEPOSITO / DEPOSITO_VIRTUAL
    IF NEW.tipo_transacao IN ('DEPOSITO', 'DEPOSITO_VIRTUAL') AND NEW.destino_bookmaker_id IS NOT NULL THEN
        v_idempotency_key := 'ledger_deposit_' || NEW.id::TEXT;
        IF NOT EXISTS (SELECT 1 FROM financial_events WHERE idempotency_key = v_idempotency_key) THEN
            SELECT moeda INTO v_bookmaker_record FROM bookmakers WHERE id = NEW.destino_bookmaker_id;
            v_valor_efetivo := COALESCE(NEW.valor_destino, NEW.valor);
            INSERT INTO financial_events (bookmaker_id, workspace_id, tipo_evento, tipo_uso, origem, valor, moeda, idempotency_key, descricao, metadata, processed_at, created_by, event_scope)
            VALUES (
                NEW.destino_bookmaker_id, NEW.workspace_id, 'DEPOSITO', 'NORMAL', NEW.tipo_transacao,
                v_valor_efetivo, COALESCE(v_bookmaker_record.moeda, NEW.moeda), v_idempotency_key,
                CASE WHEN v_is_virtual THEN 'Baseline virtual (sem impacto saldo) #' ELSE 'Depósito via cash_ledger #' END || NEW.id::TEXT,
                jsonb_build_object('ledger_id', NEW.id, 'scope', v_event_scope::TEXT),
                NOW(), NEW.user_id, v_event_scope
            );
        END IF;
    END IF;

    -- SAQUE / SAQUE_VIRTUAL
    IF NEW.tipo_transacao IN ('SAQUE', 'SAQUE_VIRTUAL') AND NEW.origem_bookmaker_id IS NOT NULL THEN
        v_idempotency_key := 'ledger_withdraw_' || NEW.id::TEXT;
        IF NOT EXISTS (SELECT 1 FROM financial_events WHERE idempotency_key = v_idempotency_key) THEN
            SELECT moeda INTO v_bookmaker_record FROM bookmakers WHERE id = NEW.origem_bookmaker_id;
            v_valor_efetivo := COALESCE(NEW.valor_origem, NEW.valor);
            INSERT INTO financial_events (bookmaker_id, workspace_id, tipo_evento, tipo_uso, origem, valor, moeda, idempotency_key, descricao, metadata, processed_at, created_by, event_scope)
            VALUES (
                NEW.origem_bookmaker_id, NEW.workspace_id, 'SAQUE', 'NORMAL', NULL,
                -v_valor_efetivo, COALESCE(v_bookmaker_record.moeda, NEW.moeda), v_idempotency_key,
                CASE WHEN v_is_virtual THEN 'Saque virtual (sem impacto saldo) #' ELSE 'Saque via cash_ledger #' END || NEW.id::TEXT,
                jsonb_build_object('ledger_id', NEW.id, 'scope', v_event_scope::TEXT),
                NOW(), NEW.user_id, v_event_scope
            );
        END IF;
    END IF;

    -- BONUS_CREDITADO (sempre REAL)
    IF NEW.tipo_transacao = 'BONUS_CREDITADO' AND NEW.destino_bookmaker_id IS NOT NULL THEN
        v_idempotency_key := 'ledger_bonus_' || NEW.id::TEXT;
        IF NOT EXISTS (SELECT 1 FROM financial_events WHERE idempotency_key = v_idempotency_key) THEN
            SELECT moeda INTO v_bookmaker_record FROM bookmakers WHERE id = NEW.destino_bookmaker_id;
            v_valor_efetivo := COALESCE(NEW.valor_destino, NEW.valor);
            INSERT INTO financial_events (bookmaker_id, workspace_id, tipo_evento, tipo_uso, origem, valor, moeda, idempotency_key, descricao, metadata, processed_at, created_by, event_scope)
            VALUES (
                NEW.destino_bookmaker_id, NEW.workspace_id, 'BONUS', 'NORMAL', 'BONUS_CREDITADO',
                v_valor_efetivo, COALESCE(v_bookmaker_record.moeda, NEW.moeda), v_idempotency_key,
                COALESCE(NEW.descricao, 'Bônus via cash_ledger'),
                jsonb_build_object('ledger_id', NEW.id), NOW(), NEW.user_id, 'REAL'::public.event_scope
            );
        END IF;
    END IF;

    -- CASHBACK_MANUAL (sempre REAL)
    IF NEW.tipo_transacao = 'CASHBACK_MANUAL' AND NEW.destino_bookmaker_id IS NOT NULL THEN
        v_idempotency_key := 'ledger_cashback_' || NEW.id::TEXT;
        IF NOT EXISTS (SELECT 1 FROM financial_events WHERE idempotency_key = v_idempotency_key) THEN
            SELECT moeda INTO v_bookmaker_record FROM bookmakers WHERE id = NEW.destino_bookmaker_id;
            v_valor_efetivo := COALESCE(NEW.valor_destino, NEW.valor);
            INSERT INTO financial_events (bookmaker_id, workspace_id, tipo_evento, tipo_uso, origem, valor, moeda, idempotency_key, descricao, metadata, processed_at, created_by, event_scope)
            VALUES (
                NEW.destino_bookmaker_id, NEW.workspace_id, 'CASHBACK', 'NORMAL', 'CASHBACK_MANUAL',
                v_valor_efetivo, COALESCE(v_bookmaker_record.moeda, NEW.moeda), v_idempotency_key,
                COALESCE(NEW.descricao, 'Cashback via cash_ledger'),
                jsonb_build_object('ledger_id', NEW.id), NOW(), NEW.user_id, 'REAL'::public.event_scope
            );
        END IF;
    END IF;

    -- CASHBACK_ESTORNO (sempre REAL)
    IF NEW.tipo_transacao = 'CASHBACK_ESTORNO' AND NEW.origem_bookmaker_id IS NOT NULL THEN
        v_idempotency_key := 'ledger_cashback_estorno_' || NEW.id::TEXT;
        IF NOT EXISTS (SELECT 1 FROM financial_events WHERE idempotency_key = v_idempotency_key) THEN
            SELECT moeda INTO v_bookmaker_record FROM bookmakers WHERE id = NEW.origem_bookmaker_id;
            v_valor_efetivo := COALESCE(NEW.valor_origem, NEW.valor);
            INSERT INTO financial_events (bookmaker_id, workspace_id, tipo_evento, tipo_uso, origem, valor, moeda, idempotency_key, descricao, metadata, processed_at, created_by, event_scope)
            VALUES (
                NEW.origem_bookmaker_id, NEW.workspace_id, 'CASHBACK', 'NORMAL', 'CASHBACK_ESTORNO',
                -v_valor_efetivo, COALESCE(v_bookmaker_record.moeda, NEW.moeda), v_idempotency_key,
                COALESCE(NEW.descricao, 'Estorno cashback via cash_ledger'),
                jsonb_build_object('ledger_id', NEW.id), NOW(), NEW.user_id, 'REAL'::public.event_scope
            );
        END IF;
    END IF;

    -- GIRO_GRATIS (sempre REAL)
    IF NEW.tipo_transacao = 'GIRO_GRATIS' AND NEW.destino_bookmaker_id IS NOT NULL THEN
        v_idempotency_key := 'ledger_giro_' || NEW.id::TEXT;
        IF NOT EXISTS (SELECT 1 FROM financial_events WHERE idempotency_key = v_idempotency_key) THEN
            SELECT moeda INTO v_bookmaker_record FROM bookmakers WHERE id = NEW.destino_bookmaker_id;
            v_valor_efetivo := COALESCE(NEW.valor_destino, NEW.valor);
            INSERT INTO financial_events (bookmaker_id, workspace_id, tipo_evento, tipo_uso, origem, valor, moeda, idempotency_key, descricao, metadata, processed_at, created_by, event_scope)
            VALUES (
                NEW.destino_bookmaker_id, NEW.workspace_id, 'PAYOUT', 'NORMAL', 'GIRO_GRATIS',
                v_valor_efetivo, COALESCE(v_bookmaker_record.moeda, NEW.moeda), v_idempotency_key,
                COALESCE(NEW.descricao, 'Giro grátis via cash_ledger'),
                jsonb_build_object('ledger_id', NEW.id), NOW(), NEW.user_id, 'REAL'::public.event_scope
            );
        END IF;
    END IF;

    -- AJUSTE_MANUAL (sempre REAL)
    IF NEW.tipo_transacao = 'AJUSTE_MANUAL' THEN
        v_bk_id := COALESCE(NEW.destino_bookmaker_id, NEW.origem_bookmaker_id);
        IF v_bk_id IS NOT NULL THEN
            v_idempotency_key := 'ledger_ajuste_' || NEW.id::TEXT;
            IF NOT EXISTS (SELECT 1 FROM financial_events WHERE idempotency_key = v_idempotency_key) THEN
                SELECT moeda INTO v_bookmaker_record FROM bookmakers WHERE id = v_bk_id;
                v_valor_efetivo := COALESCE(NEW.valor_destino, NEW.valor_origem, NEW.valor);
                IF NEW.ajuste_direcao = 'SAIDA' THEN v_valor_efetivo := -ABS(v_valor_efetivo); END IF;
                INSERT INTO financial_events (bookmaker_id, workspace_id, tipo_evento, tipo_uso, origem, valor, moeda, idempotency_key, descricao, metadata, processed_at, created_by, event_scope)
                VALUES (
                    v_bk_id, NEW.workspace_id, 'AJUSTE', 'NORMAL', 'AJUSTE_MANUAL',
                    v_valor_efetivo, COALESCE(v_bookmaker_record.moeda, NEW.moeda), v_idempotency_key,
                    COALESCE(NEW.descricao, 'Ajuste manual'),
                    jsonb_build_object('ledger_id', NEW.id, 'direcao', NEW.ajuste_direcao),
                    NOW(), NEW.user_id, 'REAL'::public.event_scope
                );
            END IF;
        END IF;
    END IF;

    -- AJUSTE_SALDO (sempre REAL)
    IF NEW.tipo_transacao = 'AJUSTE_SALDO' THEN
        v_bk_id := COALESCE(NEW.destino_bookmaker_id, NEW.origem_bookmaker_id);
        IF v_bk_id IS NOT NULL THEN
            v_idempotency_key := 'ledger_ajuste_saldo_' || NEW.id::TEXT;
            IF NOT EXISTS (SELECT 1 FROM financial_events WHERE idempotency_key = v_idempotency_key) THEN
                SELECT moeda INTO v_bookmaker_record FROM bookmakers WHERE id = v_bk_id;
                v_valor_efetivo := COALESCE(NEW.valor_destino, NEW.valor_origem, NEW.valor);
                IF NEW.ajuste_direcao = 'SAIDA' THEN v_valor_efetivo := -ABS(v_valor_efetivo); END IF;
                INSERT INTO financial_events (bookmaker_id, workspace_id, tipo_evento, tipo_uso, origem, valor, moeda, idempotency_key, descricao, metadata, processed_at, created_by, event_scope)
                VALUES (
                    v_bk_id, NEW.workspace_id, 'AJUSTE', 'NORMAL', 'AJUSTE_SALDO',
                    v_valor_efetivo, COALESCE(v_bookmaker_record.moeda, NEW.moeda), v_idempotency_key,
                    COALESCE(NEW.descricao, 'Ajuste de saldo'),
                    jsonb_build_object('ledger_id', NEW.id, 'direcao', NEW.ajuste_direcao, 'motivo', NEW.ajuste_motivo),
                    NOW(), NEW.user_id, 'REAL'::public.event_scope
                );
            END IF;
        END IF;
    END IF;

    -- FREEBET_CREDIT (sempre REAL)
    IF NEW.tipo_transacao = 'FREEBET_CREDIT' AND NEW.destino_bookmaker_id IS NOT NULL THEN
        v_idempotency_key := 'ledger_freebet_' || NEW.id::TEXT;
        IF NOT EXISTS (SELECT 1 FROM financial_events WHERE idempotency_key = v_idempotency_key) THEN
            SELECT moeda INTO v_bookmaker_record FROM bookmakers WHERE id = NEW.destino_bookmaker_id;
            v_valor_efetivo := COALESCE(NEW.valor_destino, NEW.valor);
            INSERT INTO financial_events (bookmaker_id, workspace_id, tipo_evento, tipo_uso, origem, valor, moeda, idempotency_key, descricao, metadata, processed_at, created_by, event_scope)
            VALUES (
                NEW.destino_bookmaker_id, NEW.workspace_id, 'FREEBET_CREDIT', 'FREEBET', 'FREEBET_CREDIT',
                v_valor_efetivo, COALESCE(v_bookmaker_record.moeda, NEW.moeda), v_idempotency_key,
                COALESCE(NEW.descricao, 'Freebet creditado'),
                jsonb_build_object('ledger_id', NEW.id), NOW(), NEW.user_id, 'REAL'::public.event_scope
            );
        END IF;
    END IF;

    NEW.financial_events_generated := TRUE;
    NEW.balance_processed_at := NOW();
    RETURN NEW;
END;
$$;

-- ============================================================
-- 8. VIEW ANTI-DESAPARECIMENTO: nunca esconder casa com atividade recente
-- ============================================================
CREATE OR REPLACE VIEW public.v_bookmakers_desvinculados AS
SELECT 
    b.id,
    b.nome,
    b.status,
    b.saldo_atual,
    b.saldo_usd,
    b.saldo_freebet,
    b.moeda,
    b.workspace_id,
    b.parceiro_id,
    p.nome AS parceiro_nome,
    COALESCE(b.saldo_atual, 0::numeric) AS saldo_efetivo,
    (COALESCE(b.saldo_atual, 0::numeric) + COALESCE(b.saldo_freebet, 0::numeric)) AS saldo_total
FROM bookmakers b
LEFT JOIN parceiros p ON b.parceiro_id = p.id
LEFT JOIN bookmaker_unlinked_acks ack ON ack.bookmaker_id = b.id AND ack.workspace_id = b.workspace_id
WHERE b.projeto_id IS NULL
  AND upper(b.status) = ANY (ARRAY['ATIVO', 'AGUARDANDO_DECISAO', 'LIMITADA'])
  AND b.aguardando_saque_at IS NULL
  AND ack.id IS NULL
  AND b.workspace_id = get_current_workspace()
  AND (
    -- Regra original: saldo positivo
    (COALESCE(b.saldo_atual, 0::numeric) + COALESCE(b.saldo_freebet, 0::numeric)) > 0.01
    -- Status especial sempre visível
    OR upper(b.status) = 'AGUARDANDO_DECISAO'
    -- ANTI-MÁSCARA: atividade recente nos últimos 90 dias = sempre visível
    OR EXISTS (
      SELECT 1 FROM financial_events fe 
      WHERE fe.bookmaker_id = b.id 
        AND fe.event_scope = 'REAL'
        AND fe.created_at > NOW() - INTERVAL '90 days'
    )
    -- Casa atualizada recentemente (desvínculo recente)
    OR b.updated_at > NOW() - INTERVAL '30 days'
  );

-- ============================================================
-- 9. FUNÇÃO DE AUDITORIA: detectar anomalias automaticamente
-- ============================================================
CREATE OR REPLACE FUNCTION public.fn_audit_balance_anomalies(p_workspace_id UUID)
RETURNS TABLE (
  bookmaker_id UUID,
  bookmaker_nome TEXT,
  saldo_materializado NUMERIC,
  saldo_calculado_ledger NUMERIC,
  divergencia NUMERIC,
  anomalia_tipo TEXT,
  detalhes TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Divergência entre saldo materializado e soma do ledger (apenas REAL)
  RETURN QUERY
  SELECT 
    b.id AS bookmaker_id,
    b.nome::TEXT AS bookmaker_nome,
    b.saldo_atual AS saldo_materializado,
    COALESCE(SUM(fe.valor), 0) AS saldo_calculado_ledger,
    b.saldo_atual - COALESCE(SUM(fe.valor), 0) AS divergencia,
    CASE 
      WHEN ABS(b.saldo_atual - COALESCE(SUM(fe.valor), 0)) > 1 THEN 'DIVERGENCIA_CRITICA'
      WHEN ABS(b.saldo_atual - COALESCE(SUM(fe.valor), 0)) > 0.01 THEN 'DIVERGENCIA_MENOR'
      WHEN b.saldo_atual < -0.01 THEN 'SALDO_NEGATIVO'
      ELSE 'OK'
    END AS anomalia_tipo,
    format('Saldo DB: %s | Ledger: %s | Diff: %s', 
      b.saldo_atual, COALESCE(SUM(fe.valor), 0), 
      b.saldo_atual - COALESCE(SUM(fe.valor), 0)
    ) AS detalhes
  FROM bookmakers b
  LEFT JOIN financial_events fe ON fe.bookmaker_id = b.id 
    AND fe.event_scope = 'REAL'
    AND fe.tipo_uso = 'NORMAL'
  WHERE b.workspace_id = p_workspace_id
  GROUP BY b.id, b.nome, b.saldo_atual
  HAVING ABS(b.saldo_atual - COALESCE(SUM(fe.valor), 0)) > 0.01
     OR b.saldo_atual < -0.01;
END;
$$;
