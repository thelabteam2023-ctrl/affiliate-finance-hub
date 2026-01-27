-- RPC v5: reliquidação correta SEM reverter STAKE (evita dupla contagem)
-- Motivo: o fluxo reverter_liquidacao_v4 + liquidar_aposta_v4 reverte o evento STAKE,
-- mas liquidar_aposta_v4 não reaplica o STAKE se ele já existe (mesmo estando revertido),
-- resultando em saldo final incorreto (ex.: 100 → GREEN @2.0 vira 300).

CREATE OR REPLACE FUNCTION public.reliquidar_aposta_v5(
  p_aposta_id uuid,
  p_novo_resultado text,
  p_lucro_prejuizo numeric DEFAULT NULL
)
RETURNS TABLE(success boolean, events_created integer, message text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_aposta RECORD;
  v_event RECORD;
  v_events_count integer := 0;
  v_tipo_uso text;
  v_stake_evento text;
  v_payout numeric := 0;
  v_tipo_evento text;
BEGIN
  -- Lock da aposta para idempotência e consistência
  SELECT * INTO v_aposta
  FROM apostas_unificada
  WHERE id = p_aposta_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN QUERY SELECT FALSE, 0, 'Aposta não encontrada'::text;
    RETURN;
  END IF;

  IF v_aposta.status <> 'LIQUIDADA' THEN
    RETURN QUERY SELECT FALSE, 0, 'Aposta não está liquidada'::text;
    RETURN;
  END IF;

  IF p_novo_resultado IS NULL THEN
    RETURN QUERY SELECT FALSE, 0, 'Novo resultado inválido (NULL)'::text;
    RETURN;
  END IF;

  IF v_aposta.resultado = p_novo_resultado THEN
    RETURN QUERY SELECT TRUE, 0, 'Sem mudança de resultado'::text;
    RETURN;
  END IF;

  -- Determinar tipo de uso / stake event esperado
  IF v_aposta.fonte_saldo = 'FREEBET' OR v_aposta.usar_freebet THEN
    v_tipo_uso := 'FREEBET';
    v_stake_evento := 'FREEBET_STAKE';
  ELSE
    v_tipo_uso := 'NORMAL';
    v_stake_evento := 'STAKE';
  END IF;

  -- ================================================================
  -- 1) Reverter SOMENTE eventos de resultado (não reverter STAKE)
  -- ================================================================
  FOR v_event IN
    SELECT *
    FROM financial_events fe
    WHERE fe.aposta_id = p_aposta_id
      AND fe.tipo_evento IN ('PAYOUT', 'VOID_REFUND', 'FREEBET_PAYOUT')
      AND fe.tipo_evento <> 'REVERSAL'
      AND NOT EXISTS (
        SELECT 1
        FROM financial_events r
        WHERE r.reversed_event_id = fe.id
      )
  LOOP
    INSERT INTO financial_events (
      bookmaker_id, aposta_id, workspace_id, tipo_evento, tipo_uso,
      valor, moeda, idempotency_key, reversed_event_id,
      descricao, processed_at, created_by
    ) VALUES (
      v_event.bookmaker_id,
      p_aposta_id,
      v_event.workspace_id,
      'REVERSAL',
      v_event.tipo_uso,
      -v_event.valor,
      v_event.moeda,
      'reliq_reversal_' || v_event.id::text,
      v_event.id,
      format('Reliquidação: reversão de %s', v_event.tipo_evento),
      now(),
      auth.uid()
    );

    -- Atualizar saldo (inverso do evento original)
    IF v_event.tipo_uso = 'FREEBET' THEN
      UPDATE bookmakers
      SET saldo_freebet = saldo_freebet - v_event.valor,
          updated_at = now()
      WHERE id = v_event.bookmaker_id;
    ELSE
      UPDATE bookmakers
      SET saldo_atual = saldo_atual - v_event.valor,
          updated_at = now()
      WHERE id = v_event.bookmaker_id;
    END IF;

    v_events_count := v_events_count + 1;
  END LOOP;

  -- ================================================================
  -- 2) Calcular NOVO payout conforme regra vigente do v4
  --    (stake já está debitado pelo evento STAKE)
  -- ================================================================
  CASE p_novo_resultado
    WHEN 'GREEN' THEN
      IF v_tipo_uso = 'FREEBET' THEN
        v_payout := v_aposta.stake * (v_aposta.odd - 1);
        v_tipo_evento := 'FREEBET_PAYOUT';
      ELSE
        v_payout := v_aposta.stake * v_aposta.odd;
        v_tipo_evento := 'PAYOUT';
      END IF;

    WHEN 'RED' THEN
      v_payout := 0;
      v_tipo_evento := NULL;

    WHEN 'VOID' THEN
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
      v_payout := v_aposta.stake / 2;
      v_tipo_evento := 'VOID_REFUND';

    ELSE
      RETURN QUERY SELECT FALSE, v_events_count, format('Resultado inválido: %s', p_novo_resultado)::text;
      RETURN;
  END CASE;

  -- ================================================================
  -- 3) Criar novo evento de payout/refund, se aplicável
  -- ================================================================
  IF v_tipo_evento IS NOT NULL AND v_payout > 0 THEN
    INSERT INTO financial_events (
      bookmaker_id, aposta_id, workspace_id, tipo_evento, tipo_uso,
      origem, valor, moeda, idempotency_key, descricao, processed_at, created_by
    ) VALUES (
      v_aposta.bookmaker_id,
      p_aposta_id,
      v_aposta.workspace_id,
      v_tipo_evento,
      CASE WHEN v_tipo_evento LIKE 'FREEBET%' THEN 'NORMAL' ELSE v_tipo_uso END,
      'LUCRO',
      v_payout,
      v_aposta.moeda_operacao,
      'payout_' || v_aposta.id::text || '_' || p_novo_resultado || '_reliq',
      format('Payout %s (reliquidação)', p_novo_resultado),
      now(),
      auth.uid()
    );

    -- payout/refund segue a regra atual do v4: sempre entra em saldo_atual
    UPDATE bookmakers
    SET saldo_atual = saldo_atual + v_payout,
        updated_at = now()
    WHERE id = v_aposta.bookmaker_id;

    v_events_count := v_events_count + 1;
  END IF;

  -- ================================================================
  -- 4) Atualizar aposta (mantém status LIQUIDADA)
  -- ================================================================
  UPDATE apostas_unificada SET
    resultado = p_novo_resultado,
    lucro_prejuizo = COALESCE(
      p_lucro_prejuizo,
      CASE
        WHEN p_novo_resultado = 'GREEN' THEN v_aposta.stake * (v_aposta.odd - 1)
        WHEN p_novo_resultado = 'RED' THEN -v_aposta.stake
        WHEN p_novo_resultado = 'VOID' THEN 0
        WHEN p_novo_resultado = 'MEIO_GREEN' THEN v_aposta.stake * (v_aposta.odd - 1) / 2
        WHEN p_novo_resultado = 'MEIO_RED' THEN -v_aposta.stake / 2
      END
    ),
    valor_retorno = v_payout,
    updated_at = now()
  WHERE id = p_aposta_id;

  RETURN QUERY SELECT TRUE, v_events_count, format('Aposta reliquidada: %s → %s', v_aposta.resultado, p_novo_resultado)::text;
END;
$function$;