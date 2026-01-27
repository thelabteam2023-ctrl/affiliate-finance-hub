
-- Fix: liquidar_aposta_v4 não pode assumir que o STAKE já foi debitado.
-- Em fluxos legados que inserem apostas diretamente (status=PENDENTE), o evento STAKE pode não existir.
-- Esta versão garante que o STAKE/FREEBET_STAKE seja criado (com idempotency_key = 'stake_'||aposta_id)
-- antes de aplicar PAYOUT/VOID_REFUND, evitando o bug de "resultado * 2".

CREATE OR REPLACE FUNCTION public.liquidar_aposta_v4(
  p_aposta_id uuid,
  p_resultado text,
  p_lucro_prejuizo numeric DEFAULT NULL
)
RETURNS TABLE(success boolean, events_created integer, message text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_aposta RECORD;
  v_payout NUMERIC := 0;
  v_event_id UUID;
  v_events_count INTEGER := 0;
  v_tipo_evento TEXT;
  v_tipo_uso TEXT;
  v_stake_evento TEXT;
  v_has_stake_event BOOLEAN := FALSE;
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
    v_stake_evento := 'FREEBET_STAKE';
  ELSE
    v_tipo_uso := 'NORMAL';
    v_stake_evento := 'STAKE';
  END IF;

  -- ================================================================
  -- GARANTIA DE INTEGRIDADE (LEGADO): STAKE pode não existir
  -- ================================================================
  SELECT EXISTS(
    SELECT 1
    FROM financial_events
    WHERE aposta_id = v_aposta.id
      AND tipo_evento = v_stake_evento
      AND idempotency_key = 'stake_' || v_aposta.id::TEXT
  ) INTO v_has_stake_event;

  IF NOT v_has_stake_event THEN
    -- Registrar evento de débito do stake (idempotente por idempotency_key)
    INSERT INTO financial_events (
      bookmaker_id, aposta_id, workspace_id, tipo_evento, tipo_uso,
      valor, moeda, idempotency_key, descricao, processed_at, created_by
    ) VALUES (
      v_aposta.bookmaker_id,
      v_aposta.id,
      v_aposta.workspace_id,
      v_stake_evento,
      v_tipo_uso,
      -v_aposta.stake,
      v_aposta.moeda_operacao,
      'stake_' || v_aposta.id::TEXT,
      'Débito de stake para aposta (auto-heal na liquidação)',
      now(),
      auth.uid()
    )
    ON CONFLICT DO NOTHING
    RETURNING id INTO v_event_id;

    -- Atualizar saldo (debita stake no saldo correto)
    IF v_tipo_uso = 'FREEBET' THEN
      UPDATE bookmakers
      SET saldo_freebet = saldo_freebet - v_aposta.stake,
          updated_at = now()
      WHERE id = v_aposta.bookmaker_id;
    ELSE
      UPDATE bookmakers
      SET saldo_atual = saldo_atual - v_aposta.stake,
          updated_at = now()
      WHERE id = v_aposta.bookmaker_id;
    END IF;

    v_events_count := v_events_count + 1;
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
      -- RED: sem payout (stake já foi debitado acima ou na criação)
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
      v_aposta.bookmaker_id,
      v_aposta.id,
      v_aposta.workspace_id,
      v_tipo_evento,
      CASE WHEN v_tipo_evento LIKE 'FREEBET%' THEN 'NORMAL' ELSE v_tipo_uso END,
      'LUCRO',
      v_payout,
      v_aposta.moeda_operacao,
      'payout_' || v_aposta.id::TEXT || '_' || p_resultado,
      format('Payout %s', p_resultado),
      now(),
      auth.uid()
    ) RETURNING id INTO v_event_id;

    -- Atualizar saldo (payout sempre vai para saldo normal, mesmo de freebet)
    UPDATE bookmakers
    SET saldo_atual = saldo_atual + v_payout,
        updated_at = now()
    WHERE id = v_aposta.bookmaker_id;

    v_events_count := v_events_count + 1;
  END IF;

  -- Atualizar aposta
  UPDATE apostas_unificada SET
    status = 'LIQUIDADA',
    resultado = p_resultado,
    lucro_prejuizo = COALESCE(
      p_lucro_prejuizo,
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
