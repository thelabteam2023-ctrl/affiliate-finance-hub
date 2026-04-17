-- ============================================================================
-- RPC 1: validar_reabertura_surebet (READ-ONLY)
-- Retorna preview do impacto financeiro e blockers
-- ============================================================================
CREATE OR REPLACE FUNCTION public.validar_reabertura_surebet(
  p_aposta_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
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

  -- Validar escopo Fase 1
  IF v_aposta.forma_registro <> 'ARBITRAGEM' THEN
    v_blockers := v_blockers || jsonb_build_object(
      'code', 'OUT_OF_SCOPE',
      'message', 'Fase 1 suporta apenas surebets/arbitragem. Tipo atual: ' || v_aposta.forma_registro
    );
  END IF;

  IF v_aposta.status NOT IN ('GREEN','RED','VOID','MEIO_GREEN','MEIO_RED') THEN
    v_blockers := v_blockers || jsonb_build_object(
      'code', 'NOT_LIQUIDATED',
      'message', 'Aposta não está liquidada. Status atual: ' || v_aposta.status
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

  -- Verificar pernas com freebet
  IF EXISTS (
    SELECT 1 FROM apostas_pernas
    WHERE aposta_id = p_aposta_id
      AND (COALESCE(stake_freebet, 0) > 0 OR COALESCE(fonte_saldo, 'REAL') = 'FREEBET')
  ) THEN
    v_blockers := v_blockers || jsonb_build_object(
      'code', 'FREEBET_LEG_NOT_SUPPORTED',
      'message', 'Pernas com freebet serão suportadas na Fase 3'
    );
  END IF;

  -- Verificar se freebet gerada já foi consumida
  IF COALESCE(v_aposta.gerou_freebet, false) AND COALESCE(v_aposta.valor_freebet_gerada, 0) > 0 THEN
    SELECT EXISTS (
      SELECT 1 FROM apostas_unificada filha
      WHERE filha.id <> p_aposta_id
        AND (filha.usar_freebet = true OR filha.stake_freebet > 0)
        AND filha.bookmaker_id IN (
          SELECT bookmaker_id FROM apostas_pernas WHERE aposta_id = p_aposta_id
        )
        AND filha.created_at > (SELECT MAX(created_at) FROM financial_events WHERE aposta_id = p_aposta_id AND tipo_evento IN ('PAYOUT','VOID_REFUND'))
    ) INTO v_freebet_consumida;

    IF v_freebet_consumida THEN
      v_blockers := v_blockers || jsonb_build_object(
        'code', 'FREEBET_CONSUMED',
        'message', 'Freebet gerada por esta aposta já foi consumida em outra'
      );
    END IF;
  END IF;

  -- Para cada perna com resultado, verificar bloqueios financeiros
  FOR v_perna IN
    SELECT ap.id, ap.bookmaker_id, ap.ordem, ap.resultado, ap.stake, ap.moeda, b.nome AS bookmaker_nome, b.saldo_atual, b.status AS bookmaker_status
    FROM apostas_pernas ap
    JOIN bookmakers b ON b.id = ap.bookmaker_id
    WHERE ap.aposta_id = p_aposta_id
    ORDER BY ap.ordem
  LOOP
    -- Buscar último PAYOUT/VOID_REFUND ativo desta perna
    SELECT fe.id, fe.valor, fe.created_at, fe.tipo_evento, fe.moeda
    INTO v_payout_event
    FROM financial_events fe
    WHERE fe.aposta_id = p_aposta_id
      AND fe.bookmaker_id = v_perna.bookmaker_id
      AND fe.tipo_evento IN ('PAYOUT','VOID_REFUND')
      AND (
        fe.idempotency_key LIKE 'payout_perna_' || v_perna.id || '%'
        OR fe.idempotency_key LIKE 'void_perna_' || v_perna.id || '%'
      )
      AND NOT EXISTS (
        SELECT 1 FROM financial_events fr WHERE fr.reversed_event_id = fe.id
      )
    ORDER BY fe.created_at DESC
    LIMIT 1;

    -- Bookmaker em estado crítico
    IF v_perna.bookmaker_status IN ('ENCERRADA','BLOQUEADA','AGUARDANDO_SAQUE') THEN
      v_blockers := v_blockers || jsonb_build_object(
        'code', 'BOOKMAKER_CRITICAL_STATE',
        'message', 'Bookmaker "' || v_perna.bookmaker_nome || '" em estado: ' || v_perna.bookmaker_status,
        'bookmaker_id', v_perna.bookmaker_id
      );
    END IF;

    IF v_payout_event.id IS NOT NULL AND v_payout_event.valor > 0 THEN
      v_total_a_reverter := v_total_a_reverter + v_payout_event.valor;

      -- Bloqueio: saldo atual insuficiente
      IF COALESCE(v_perna.saldo_atual, 0) < v_payout_event.valor THEN
        v_blockers := v_blockers || jsonb_build_object(
          'code', 'INSUFFICIENT_BALANCE',
          'message', 'Saldo de "' || v_perna.bookmaker_nome || '" (' || v_perna.saldo_atual::text || ') insuficiente para estornar ' || v_payout_event.valor::text,
          'bookmaker_id', v_perna.bookmaker_id,
          'saldo_atual', v_perna.saldo_atual,
          'valor_a_estornar', v_payout_event.valor
        );
      END IF;

      -- Bloqueio: saque posterior à liquidação
      SELECT COALESCE(SUM(ABS(valor)), 0) INTO v_saque_posterior
      FROM financial_events
      WHERE bookmaker_id = v_perna.bookmaker_id
        AND tipo_evento IN ('SAQUE','WITHDRAWAL','TRANSFERENCIA_SAIDA')
        AND created_at > v_payout_event.created_at;

      IF v_saque_posterior > 0 THEN
        v_blockers := v_blockers || jsonb_build_object(
          'code', 'WITHDRAWAL_AFTER_LIQUIDATION',
          'message', 'Saque de ' || v_saque_posterior::text || ' detectado em "' || v_perna.bookmaker_nome || '" após a liquidação',
          'bookmaker_id', v_perna.bookmaker_id,
          'saque_posterior', v_saque_posterior
        );
      END IF;
    END IF;

    v_pernas_preview := v_pernas_preview || jsonb_build_object(
      'perna_id', v_perna.id,
      'ordem', v_perna.ordem,
      'bookmaker_id', v_perna.bookmaker_id,
      'bookmaker_nome', v_perna.bookmaker_nome,
      'resultado_atual', v_perna.resultado,
      'stake', v_perna.stake,
      'moeda', v_perna.moeda,
      'payout_a_reverter', COALESCE(v_payout_event.valor, 0),
      'saldo_atual', v_perna.saldo_atual,
      'saldo_apos_reversao', COALESCE(v_perna.saldo_atual, 0) - COALESCE(v_payout_event.valor, 0)
    );
  END LOOP;

  RETURN jsonb_build_object(
    'elegible', jsonb_array_length(v_blockers) = 0,
    'aposta_id', p_aposta_id,
    'status_atual', v_aposta.status,
    'novo_status', 'PENDENTE',
    'blockers', v_blockers,
    'preview', jsonb_build_object(
      'pernas', v_pernas_preview,
      'total_a_reverter', v_total_a_reverter
    )
  );
END;
$$;

-- ============================================================================
-- RPC 2: reabrir_surebet_atomica (TRANSACIONAL)
-- Reverte payouts, limpa resultados, marca como PENDENTE e grava audit_log
-- ============================================================================
CREATE OR REPLACE FUNCTION public.reabrir_surebet_atomica(
  p_aposta_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_validacao jsonb;
  v_aposta RECORD;
  v_perna RECORD;
  v_payout_event RECORD;
  v_user_id uuid;
  v_before_data jsonb;
  v_after_data jsonb;
  v_reversoes_count INT := 0;
  v_total_revertido NUMERIC := 0;
  v_now_epoch TEXT;
BEGIN
  -- Step 1: Validar (RPC read-only)
  v_validacao := public.validar_reabertura_surebet(p_aposta_id);

  IF NOT (v_validacao->>'elegible')::boolean THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Aposta não pode ser reaberta',
      'blockers', v_validacao->'blockers'
    );
  END IF;

  -- Step 2: LOCK e capturar estado atual
  SELECT * INTO v_aposta
  FROM apostas_unificada
  WHERE id = p_aposta_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Aposta não encontrada');
  END IF;

  -- Re-validar status sob lock (proteção contra race)
  IF v_aposta.status NOT IN ('GREEN','RED','VOID','MEIO_GREEN','MEIO_RED') THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Status mudou durante processamento: ' || v_aposta.status
    );
  END IF;

  v_user_id := v_aposta.user_id;
  v_now_epoch := extract(epoch from clock_timestamp())::text;

  -- Snapshot ANTES
  v_before_data := jsonb_build_object(
    'aposta', row_to_json(v_aposta),
    'pernas', (
      SELECT jsonb_agg(row_to_json(p) ORDER BY p.ordem)
      FROM apostas_pernas p
      WHERE p.aposta_id = p_aposta_id
    )
  );

  -- Step 3: REVERSAL de cada PAYOUT/VOID_REFUND ativo
  FOR v_perna IN
    SELECT id, bookmaker_id, ordem
    FROM apostas_pernas
    WHERE aposta_id = p_aposta_id
    ORDER BY ordem
  LOOP
    SELECT fe.id, fe.valor, fe.tipo_uso, fe.moeda, fe.tipo_evento
    INTO v_payout_event
    FROM financial_events fe
    WHERE fe.aposta_id = p_aposta_id
      AND fe.bookmaker_id = v_perna.bookmaker_id
      AND fe.tipo_evento IN ('PAYOUT','VOID_REFUND')
      AND (
        fe.idempotency_key LIKE 'payout_perna_' || v_perna.id || '%'
        OR fe.idempotency_key LIKE 'void_perna_' || v_perna.id || '%'
      )
      AND NOT EXISTS (
        SELECT 1 FROM financial_events fr WHERE fr.reversed_event_id = fe.id
      )
    ORDER BY fe.created_at DESC
    LIMIT 1;

    IF v_payout_event.id IS NOT NULL AND v_payout_event.valor <> 0 THEN
      INSERT INTO financial_events (
        bookmaker_id, aposta_id, workspace_id, created_by,
        tipo_evento, tipo_uso, origem, valor, moeda,
        idempotency_key, descricao, reversed_event_id
      ) VALUES (
        v_perna.bookmaker_id, p_aposta_id, v_aposta.workspace_id, v_user_id,
        'REVERSAL', v_payout_event.tipo_uso, 'AJUSTE',
        -v_payout_event.valor, v_payout_event.moeda,
        'reopen_' || p_aposta_id || '_perna_' || v_perna.id || '_n' || v_now_epoch,
        'Reabertura para edição: estorno de ' || v_payout_event.tipo_evento,
        v_payout_event.id
      );

      v_reversoes_count := v_reversoes_count + 1;
      v_total_revertido := v_total_revertido + v_payout_event.valor;
    END IF;
  END LOOP;

  -- Step 4: Limpar resultados das pernas
  UPDATE apostas_pernas
  SET resultado = NULL,
      lucro_prejuizo = NULL,
      lucro_prejuizo_brl_referencia = NULL,
      updated_at = now()
  WHERE aposta_id = p_aposta_id;

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
  WHERE id = p_aposta_id;

  -- Snapshot DEPOIS
  v_after_data := jsonb_build_object(
    'aposta', (SELECT row_to_json(a) FROM apostas_unificada a WHERE a.id = p_aposta_id),
    'pernas', (
      SELECT jsonb_agg(row_to_json(p) ORDER BY p.ordem)
      FROM apostas_pernas p
      WHERE p.aposta_id = p_aposta_id
    ),
    'reversoes_aplicadas', v_reversoes_count,
    'total_revertido', v_total_revertido
  );

  -- Step 6: Audit log
  INSERT INTO audit_logs (
    actor_user_id, workspace_id, action, entity_type, entity_id, entity_name,
    before_data, after_data, metadata
  ) VALUES (
    v_user_id, v_aposta.workspace_id, 'update', 'aposta_reabertura', p_aposta_id,
    'Reabertura de surebet ' || COALESCE(v_aposta.evento, p_aposta_id::text),
    v_before_data, v_after_data,
    jsonb_build_object(
      'fase', 1,
      'tipo', 'reabertura_surebet',
      'reversoes_count', v_reversoes_count,
      'total_revertido', v_total_revertido,
      'status_anterior', v_aposta.status
    )
  );

  RETURN jsonb_build_object(
    'success', true,
    'aposta_id', p_aposta_id,
    'novo_status', 'PENDENTE',
    'reversoes_aplicadas', v_reversoes_count,
    'total_revertido', v_total_revertido,
    'message', 'Aposta reaberta com sucesso. Pronta para edição.'
  );

EXCEPTION
  WHEN OTHERS THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Erro ao reabrir aposta: ' || SQLERRM,
      'sqlstate', SQLSTATE
    );
END;
$$;

GRANT EXECUTE ON FUNCTION public.validar_reabertura_surebet(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.reabrir_surebet_atomica(uuid) TO authenticated;