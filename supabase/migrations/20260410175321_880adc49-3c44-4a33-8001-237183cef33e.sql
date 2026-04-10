
-- ============================================================
-- CORREÇÃO 1: Campo allow_negative + Piso Zero no Trigger
-- ============================================================

-- Adicionar campo allow_negative (default false)
ALTER TABLE public.financial_events
ADD COLUMN IF NOT EXISTS allow_negative BOOLEAN NOT NULL DEFAULT false;

-- Recriar trigger com validação de piso zero
CREATE OR REPLACE FUNCTION public.fn_financial_events_sync_balance()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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

  -- ============================================================
  -- PISO ZERO: Bloquear operações que resultariam em saldo < 0
  -- EXCETO quando allow_negative = true (ajustes admin/reconciliação)
  -- ============================================================
  v_saldo_novo := COALESCE(v_saldo_anterior, 0) + v_delta;

  IF v_saldo_novo < 0 AND NOT COALESCE(NEW.allow_negative, false) THEN
    RAISE EXCEPTION 'PISO_ZERO: Operação bloqueada. Saldo resultante seria % (anterior: %, delta: %). Tipo: %, Bookmaker: %',
      v_saldo_novo, v_saldo_anterior, v_delta, NEW.tipo_evento, NEW.bookmaker_id;
  END IF;

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
$function$;

-- ============================================================
-- CORREÇÃO 2: idempotency_key NOT NULL + limpar índice parcial
-- ============================================================

-- Tornar coluna obrigatória
ALTER TABLE public.financial_events
ALTER COLUMN idempotency_key SET NOT NULL;

-- Remover o índice parcial redundante (já existe o UNIQUE completo)
DROP INDEX IF EXISTS idx_financial_events_idempotency;
