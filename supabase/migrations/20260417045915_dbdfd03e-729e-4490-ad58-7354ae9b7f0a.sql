-- =========================================================================
-- Fix: reabertura de surebet aceita status='LIQUIDADA' (com resultado nas
-- colunas resultado/pernas), além dos valores legados que apareciam direto
-- em status.
-- =========================================================================

CREATE OR REPLACE FUNCTION public.validar_reabertura_surebet(p_aposta_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_aposta RECORD;
  v_blockers jsonb := '[]'::jsonb;
  v_pernas_preview jsonb := '[]'::jsonb;
  v_perna RECORD;
  v_payout_event RECORD;
  v_saldo_atual NUMERIC;
  v_saque_posterior NUMERIC;
  v_total_a_reverter NUMERIC := 0;
  v_freebet_consumida BOOLEAN;
  v_is_liquidada BOOLEAN;
BEGIN
  -- Buscar aposta
  SELECT id, status, forma_registro, usar_freebet, bonus_id, workspace_id, projeto_id,
         estrategia, resultado, gerou_freebet, valor_freebet_gerada
  INTO v_aposta
  FROM apostas_unificada
  WHERE id = p_aposta_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'elegible', false,
      'blockers', jsonb_build_array(jsonb_build_object('code', 'NOT_FOUND', 'message', 'Aposta não encontrada'))
    );
  END IF;

  -- Liquidada se status='LIQUIDADA' OU resultado em (GREEN/RED/VOID/MEIO_*)
  -- OU se alguma perna tem resultado preenchido.
  v_is_liquidada := (
    UPPER(COALESCE(v_aposta.status, '')) = 'LIQUIDADA'
    OR UPPER(COALESCE(v_aposta.resultado, '')) IN ('GREEN','RED','VOID','MEIO_GREEN','MEIO_RED')
    OR UPPER(COALESCE(v_aposta.status, '')) IN ('GREEN','RED','VOID','MEIO_GREEN','MEIO_RED')
    OR EXISTS (
      SELECT 1 FROM apostas_pernas ap
      WHERE ap.aposta_id = v_aposta.id
        AND UPPER(COALESCE(ap.resultado, '')) IN ('GREEN','RED','VOID','MEIO_GREEN','MEIO_RED')
    )
  );

  -- Validar escopo Fase 1
  IF v_aposta.forma_registro <> 'ARBITRAGEM' THEN
    v_blockers := v_blockers || jsonb_build_object(
      'code', 'OUT_OF_SCOPE',
      'message', 'Fase 1 suporta apenas surebets/arbitragem. Tipo atual: ' || v_aposta.forma_registro
    );
  END IF;

  IF NOT v_is_liquidada THEN
    v_blockers := v_blockers || jsonb_build_object(
      'code', 'NOT_LIQUIDATED',
      'message', 'Aposta não está liquidada. Status atual: ' || COALESCE(v_aposta.status, 'NULL')
    );
  END IF;

  IF COALESCE(v_aposta.usar_freebet, false) THEN
    v_blockers := v_blockers || jsonb_build_object(
      'code', 'FREEBET_NOT_SUPPORTED',
      'message', 'Apostas com freebet serão suportadas na Fase 3'
    );
  END IF;

  IF v_aposta.bonus_id IS NOT NULL THEN
    v_blockers := v_blockers || jsonb_build_object(
      'code', 'BONUS_NOT_SUPPORTED',
      'message', 'Apostas com bônus serão suportadas na Fase 3'
    );
  END IF;

  -- Pernas com freebet (stake_freebet > 0 ou fonte FREEBET) → fora de escopo Fase 1
  IF EXISTS (
    SELECT 1 FROM apostas_pernas
    WHERE aposta_id = v_aposta.id
      AND (COALESCE(stake_freebet, 0) > 0 OR UPPER(COALESCE(fonte_saldo, '')) = 'FREEBET')
  ) THEN
    v_blockers := v_blockers || jsonb_build_object(
      'code', 'FREEBET_LEG_NOT_SUPPORTED',
      'message', 'Pernas com freebet serão suportadas na Fase 3'
    );
  END IF;

  -- Freebet gerada e potencialmente consumida (Fase 3)
  IF COALESCE(v_aposta.gerou_freebet, false) AND COALESCE(v_aposta.valor_freebet_gerada, 0) > 0 THEN
    v_blockers := v_blockers || jsonb_build_object(
      'code', 'FREEBET_CONSUMED',
      'message', 'Apostas que geraram freebet serão suportadas na Fase 3'
    );
  END IF;

  -- Iterar pernas para calcular preview financeiro
  FOR v_perna IN
    SELECT ap.id AS perna_id, ap.ordem, ap.bookmaker_id, ap.resultado,
           ap.stake, ap.moeda, b.nome AS bookmaker_nome,
           b.saldo_atual AS bookmaker_saldo, b.estado_conta, b.status AS bm_status
    FROM apostas_pernas ap
    JOIN bookmakers b ON b.id = ap.bookmaker_id
    WHERE ap.aposta_id = v_aposta.id
    ORDER BY ap.ordem
  LOOP
    -- Buscar PAYOUT/VOID_REFUND ativo (não revertido) dessa perna
    SELECT fe.id, fe.valor, fe.moeda, fe.created_at
    INTO v_payout_event
    FROM financial_events fe
    WHERE fe.aposta_id = v_aposta.id
      AND fe.perna_id = v_perna.perna_id
      AND fe.tipo_evento IN ('PAYOUT','VOID_REFUND')
      AND NOT EXISTS (
        SELECT 1 FROM financial_events r
        WHERE r.aposta_id = v_aposta.id
          AND r.perna_id = v_perna.perna_id
          AND r.tipo_evento = 'REVERSAL'
          AND r.referencia_evento_id = fe.id
      )
    ORDER BY fe.created_at DESC
    LIMIT 1;

    DECLARE
      v_payout_valor NUMERIC := COALESCE(v_payout_event.valor, 0);
    BEGIN
      v_total_a_reverter := v_total_a_reverter + v_payout_valor;

      -- Bloqueio: bookmaker em estado crítico
      IF v_perna.estado_conta IN ('ENCERRADA','BLOQUEADA','AGUARDANDO_SAQUE')
         OR v_perna.bm_status IN ('ENCERRADA','BLOQUEADA','AGUARDANDO_SAQUE') THEN
        v_blockers := v_blockers || jsonb_build_object(
          'code', 'BOOKMAKER_CRITICAL_STATE',
          'message', 'Bookmaker ' || v_perna.bookmaker_nome || ' está em estado crítico',
          'bookmaker_id', v_perna.bookmaker_id
        );
      END IF;

      -- Bloqueio: saldo insuficiente para reverter o payout
      IF v_payout_valor > 0 AND v_perna.bookmaker_saldo < v_payout_valor THEN
        v_blockers := v_blockers || jsonb_build_object(
          'code', 'INSUFFICIENT_BALANCE',
          'message', 'Saldo insuficiente em ' || v_perna.bookmaker_nome
                     || ' para estornar ' || v_payout_valor::text,
          'bookmaker_id', v_perna.bookmaker_id,
          'saldo_atual', v_perna.bookmaker_saldo,
          'valor_a_estornar', v_payout_valor
        );
      END IF;

      -- Bloqueio: saque posterior à liquidação
      IF v_payout_event.id IS NOT NULL THEN
        SELECT COALESCE(SUM(fe.valor), 0)
        INTO v_saque_posterior
        FROM financial_events fe
        WHERE fe.bookmaker_id = v_perna.bookmaker_id
          AND fe.tipo_evento = 'WITHDRAWAL'
          AND fe.created_at > v_payout_event.created_at;

        IF v_saque_posterior > 0 THEN
          v_blockers := v_blockers || jsonb_build_object(
            'code', 'WITHDRAWAL_AFTER_LIQUIDATION',
            'message', 'Houve saque de ' || v_saque_posterior::text
                       || ' em ' || v_perna.bookmaker_nome || ' após a liquidação',
            'bookmaker_id', v_perna.bookmaker_id,
            'saque_posterior', v_saque_posterior
          );
        END IF;
      END IF;

      v_pernas_preview := v_pernas_preview || jsonb_build_object(
        'perna_id', v_perna.perna_id,
        'ordem', v_perna.ordem,
        'bookmaker_id', v_perna.bookmaker_id,
        'bookmaker_nome', v_perna.bookmaker_nome,
        'resultado_atual', v_perna.resultado,
        'stake', v_perna.stake,
        'moeda', v_perna.moeda,
        'payout_a_reverter', v_payout_valor,
        'saldo_atual', v_perna.bookmaker_saldo,
        'saldo_apos_reversao', v_perna.bookmaker_saldo - v_payout_valor
      );
    END;
  END LOOP;

  RETURN jsonb_build_object(
    'elegible', jsonb_array_length(v_blockers) = 0,
    'aposta_id', v_aposta.id,
    'status_atual', v_aposta.status,
    'novo_status', 'PENDENTE',
    'blockers', v_blockers,
    'preview', jsonb_build_object(
      'pernas', v_pernas_preview,
      'total_a_reverter', v_total_a_reverter
    )
  );
END;
$function$;

-- =========================================================================
-- Mesma correção em reabrir_surebet_atomica: aceitar 'LIQUIDADA' como
-- status válido sob o lock (re-validação).
-- =========================================================================

CREATE OR REPLACE FUNCTION public.reabrir_surebet_atomica(p_aposta_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_aposta RECORD;
  v_validacao jsonb;
  v_perna RECORD;
  v_payout_event RECORD;
  v_reversoes INT := 0;
  v_total_revertido NUMERIC := 0;
  v_idem_key TEXT;
  v_epoch BIGINT := EXTRACT(EPOCH FROM clock_timestamp())::BIGINT;
  v_user_id UUID := auth.uid();
  v_before_data JSONB;
  v_is_liquidada BOOLEAN;
BEGIN
  -- Step 1: Validar elegibilidade (read-only)
  v_validacao := validar_reabertura_surebet(p_aposta_id);

  IF NOT (v_validacao->>'elegible')::boolean THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Aposta não elegível para reabertura',
      'blockers', v_validacao->'blockers'
    );
  END IF;

  -- Step 2: LOCK FOR UPDATE da aposta + snapshot
  SELECT * INTO v_aposta
  FROM apostas_unificada
  WHERE id = p_aposta_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Aposta sumiu durante o lock');
  END IF;

  -- Re-validar status sob lock (proteção contra race) — aceita LIQUIDADA
  -- ou resultado preenchido.
  v_is_liquidada := (
    UPPER(COALESCE(v_aposta.status, '')) = 'LIQUIDADA'
    OR UPPER(COALESCE(v_aposta.resultado, '')) IN ('GREEN','RED','VOID','MEIO_GREEN','MEIO_RED')
    OR UPPER(COALESCE(v_aposta.status, '')) IN ('GREEN','RED','VOID','MEIO_GREEN','MEIO_RED')
  );

  IF NOT v_is_liquidada THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Status mudou durante processamento: ' || COALESCE(v_aposta.status, 'NULL')
    );
  END IF;

  -- Snapshot before_data
  v_before_data := to_jsonb(v_aposta) || jsonb_build_object(
    'pernas', (SELECT jsonb_agg(to_jsonb(ap)) FROM apostas_pernas ap WHERE ap.aposta_id = v_aposta.id)
  );

  -- Step 3: REVERSAL de cada PAYOUT/VOID_REFUND ativo
  FOR v_perna IN
    SELECT ap.id AS perna_id, ap.ordem, ap.bookmaker_id, ap.moeda
    FROM apostas_pernas ap
    WHERE ap.aposta_id = v_aposta.id
    ORDER BY ap.ordem
  LOOP
    SELECT fe.id, fe.valor, fe.moeda, fe.tipo_evento, fe.balance_type
    INTO v_payout_event
    FROM financial_events fe
    WHERE fe.aposta_id = v_aposta.id
      AND fe.perna_id = v_perna.perna_id
      AND fe.tipo_evento IN ('PAYOUT','VOID_REFUND')
      AND NOT EXISTS (
        SELECT 1 FROM financial_events r
        WHERE r.aposta_id = v_aposta.id
          AND r.perna_id = v_perna.perna_id
          AND r.tipo_evento = 'REVERSAL'
          AND r.referencia_evento_id = fe.id
      )
    ORDER BY fe.created_at DESC
    LIMIT 1;

    IF v_payout_event.id IS NOT NULL AND v_payout_event.valor > 0 THEN
      v_idem_key := format('reopen_%s_perna_%s_n%s', v_aposta.id, v_perna.perna_id, v_epoch);

      INSERT INTO financial_events (
        workspace_id, projeto_id, bookmaker_id, aposta_id, perna_id,
        tipo_evento, valor, moeda, balance_type, event_scope,
        idempotency_key, referencia_evento_id, observacoes, created_by
      ) VALUES (
        v_aposta.workspace_id, v_aposta.projeto_id, v_perna.bookmaker_id,
        v_aposta.id, v_perna.perna_id,
        'REVERSAL', -v_payout_event.valor, v_payout_event.moeda,
        COALESCE(v_payout_event.balance_type, 'CASH'), 'REAL',
        v_idem_key, v_payout_event.id,
        'Reabertura de surebet liquidada — estorno do ' || v_payout_event.tipo_evento,
        v_user_id
      )
      ON CONFLICT (idempotency_key) DO NOTHING;

      v_reversoes := v_reversoes + 1;
      v_total_revertido := v_total_revertido + v_payout_event.valor;
    END IF;
  END LOOP;

  -- Step 4: Limpar resultados das pernas
  UPDATE apostas_pernas
  SET resultado = NULL,
      lucro_prejuizo = NULL,
      lucro_prejuizo_brl_referencia = NULL,
      updated_at = now()
  WHERE aposta_id = v_aposta.id;

  -- Step 5: Voltar aposta para PENDENTE
  UPDATE apostas_unificada
  SET status = 'PENDENTE',
      resultado = NULL,
      lucro_prejuizo = NULL,
      lucro_prejuizo_brl_referencia = NULL,
      pl_consolidado = NULL,
      retorno_consolidado = NULL,
      roi_real = NULL,
      valor_retorno = NULL,
      updated_at = now()
  WHERE id = v_aposta.id;

  -- Step 6: Audit log
  INSERT INTO audit_logs (
    workspace_id, actor_user_id, action, entity_type, entity_id,
    before_data, after_data, metadata
  ) VALUES (
    v_aposta.workspace_id, v_user_id, 'UPDATE', 'aposta', v_aposta.id,
    v_before_data,
    jsonb_build_object('status', 'PENDENTE'),
    jsonb_build_object(
      'operation', 'reabertura_surebet',
      'reversoes_aplicadas', v_reversoes,
      'total_revertido', v_total_revertido,
      'status_anterior', v_aposta.status,
      'resultado_anterior', v_aposta.resultado
    )
  );

  RETURN jsonb_build_object(
    'success', true,
    'aposta_id', v_aposta.id,
    'novo_status', 'PENDENTE',
    'reversoes_aplicadas', v_reversoes,
    'total_revertido', v_total_revertido
  );
END;
$function$;