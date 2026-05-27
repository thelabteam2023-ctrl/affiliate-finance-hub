CREATE TABLE IF NOT EXISTS public.aposta_edit_audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL,
  projeto_id uuid NOT NULL,
  aposta_id uuid NOT NULL,
  bookmaker_id uuid,
  actor_user_id uuid NOT NULL,
  action text NOT NULL DEFAULT 'EDIT_APOSTA_SEGURA',
  status_before text,
  resultado_before text,
  status_after text,
  resultado_after text,
  changed_fields text[] NOT NULL DEFAULT '{}'::text[],
  before_data jsonb NOT NULL DEFAULT '{}'::jsonb,
  after_data jsonb NOT NULL DEFAULT '{}'::jsonb,
  ledger_before jsonb NOT NULL DEFAULT '[]'::jsonb,
  ledger_after jsonb NOT NULL DEFAULT '[]'::jsonb,
  bookmaker_balance_before jsonb NOT NULL DEFAULT '{}'::jsonb,
  bookmaker_balance_after jsonb NOT NULL DEFAULT '{}'::jsonb,
  success boolean NOT NULL DEFAULT true,
  error_message text,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT ON public.aposta_edit_audit_logs TO authenticated;
GRANT ALL ON public.aposta_edit_audit_logs TO service_role;

ALTER TABLE public.aposta_edit_audit_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS aposta_edit_audit_logs_select ON public.aposta_edit_audit_logs;
CREATE POLICY aposta_edit_audit_logs_select
  ON public.aposta_edit_audit_logs
  FOR SELECT
  TO authenticated
  USING (
    public.is_system_owner(auth.uid())
    OR public.is_active_workspace_member(auth.uid(), workspace_id)
  );

DROP POLICY IF EXISTS aposta_edit_audit_logs_insert ON public.aposta_edit_audit_logs;
CREATE POLICY aposta_edit_audit_logs_insert
  ON public.aposta_edit_audit_logs
  FOR INSERT
  TO authenticated
  WITH CHECK (
    actor_user_id = auth.uid()
    AND (
      public.is_system_owner(auth.uid())
      OR public.is_active_workspace_member(auth.uid(), workspace_id)
    )
  );

CREATE INDEX IF NOT EXISTS idx_aposta_edit_audit_logs_workspace_created
  ON public.aposta_edit_audit_logs (workspace_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_aposta_edit_audit_logs_aposta_created
  ON public.aposta_edit_audit_logs (aposta_id, created_at DESC);

DROP FUNCTION IF EXISTS public.editar_aposta_simples_segura(uuid, jsonb);

CREATE OR REPLACE FUNCTION public.editar_aposta_simples_segura(
  p_aposta_id uuid,
  p_updates jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_old public.apostas_unificada%ROWTYPE;
  v_after public.apostas_unificada%ROWTYPE;
  v_bookmaker public.bookmakers%ROWTYPE;
  v_was_liquidada boolean := false;
  v_old_resultado text;
  v_new_stake numeric;
  v_new_odd numeric;
  v_new_fair numeric;
  v_new_edge numeric;
  v_new_linha numeric;
  v_new_data timestamptz;
  v_fonte_saldo text;
  v_ledger_before jsonb := '[]'::jsonb;
  v_ledger_after jsonb := '[]'::jsonb;
  v_balance_before jsonb := '{}'::jsonb;
  v_balance_after jsonb := '{}'::jsonb;
  v_changed_fields text[] := '{}'::text[];
  v_liq jsonb := '{}'::jsonb;
  v_stake_event_type text;
  v_stake_tipo_uso text;
BEGIN
  IF v_actor IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Usuário não autenticado');
  END IF;

  SELECT * INTO v_old
  FROM public.apostas_unificada
  WHERE id = p_aposta_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Aposta não encontrada');
  END IF;

  IF NOT (public.is_system_owner(v_actor) OR public.is_active_workspace_member(v_actor, v_old.workspace_id)) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Sem permissão para editar esta aposta');
  END IF;

  IF COALESCE(v_old.forma_registro, 'SIMPLES') <> 'SIMPLES' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Esta rotina edita apenas apostas simples. Use o fluxo específico de múltiplas/surebets.');
  END IF;

  IF v_old.bookmaker_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Aposta sem casa vinculada');
  END IF;

  SELECT * INTO v_bookmaker
  FROM public.bookmakers
  WHERE id = v_old.bookmaker_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Casa de apostas não encontrada');
  END IF;

  IF p_updates ? 'stake' THEN
    v_new_stake := NULLIF(p_updates ->> 'stake', '')::numeric;
  ELSE
    v_new_stake := v_old.stake;
  END IF;

  IF p_updates ? 'odd' THEN
    v_new_odd := NULLIF(p_updates ->> 'odd', '')::numeric;
  ELSE
    v_new_odd := v_old.odd;
  END IF;

  IF p_updates ? 'fair_value' THEN
    v_new_fair := NULLIF(p_updates ->> 'fair_value', '')::numeric;
  ELSE
    v_new_fair := v_old.fair_value;
  END IF;

  IF p_updates ? 'edge_percentual' THEN
    v_new_edge := NULLIF(p_updates ->> 'edge_percentual', '')::numeric;
  ELSE
    v_new_edge := v_old.edge_percentual;
  END IF;

  IF p_updates ? 'mercado_linha' THEN
    v_new_linha := NULLIF(p_updates ->> 'mercado_linha', '')::numeric;
  ELSE
    v_new_linha := v_old.mercado_linha;
  END IF;

  IF p_updates ? 'data_aposta' THEN
    v_new_data := NULLIF(p_updates ->> 'data_aposta', '')::timestamptz;
  ELSE
    v_new_data := v_old.data_aposta;
  END IF;

  v_fonte_saldo := COALESCE(NULLIF(p_updates ->> 'fonte_entrada', ''), v_old.fonte_saldo, 'REAL');

  IF COALESCE(v_new_stake, 0) <= 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Stake inválida');
  END IF;

  IF COALESCE(v_new_odd, 0) <= 1 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Odd inválida');
  END IF;

  SELECT COALESCE(jsonb_agg(to_jsonb(fe) ORDER BY fe.created_at, fe.id), '[]'::jsonb)
    INTO v_ledger_before
  FROM public.financial_events fe
  WHERE fe.aposta_id = p_aposta_id;

  v_balance_before := jsonb_build_object(
    'saldo_atual', v_bookmaker.saldo_atual,
    'saldo_freebet', v_bookmaker.saldo_freebet,
    'saldo_bonus', v_bookmaker.saldo_bonus,
    'updated_at', v_bookmaker.updated_at
  );

  v_was_liquidada := v_old.status = 'LIQUIDADA' AND COALESCE(v_old.resultado, 'PENDENTE') <> 'PENDENTE';
  v_old_resultado := v_old.resultado;

  DELETE FROM public.financial_events
  WHERE aposta_id = p_aposta_id
    AND tipo_evento IN ('STAKE', 'FREEBET_STAKE', 'PAYOUT', 'FREEBET_PAYOUT', 'VOID_REFUND', 'AJUSTE', 'REVERSAL');

  UPDATE public.apostas_unificada
  SET
    evento = COALESCE(NULLIF(p_updates ->> 'evento', ''), evento),
    esporte = COALESCE(NULLIF(p_updates ->> 'esporte', ''), esporte),
    mercado = COALESCE(NULLIF(p_updates ->> 'mercado', ''), mercado),
    selecao = COALESCE(NULLIF(p_updates ->> 'selecao', ''), selecao),
    odd = v_new_odd,
    stake = v_new_stake,
    data_aposta = v_new_data,
    is_novo_formulario = COALESCE((p_updates ->> 'is_novo_formulario')::boolean, is_novo_formulario, true),
    liga = CASE WHEN p_updates ? 'liga' THEN NULLIF(p_updates ->> 'liga', '') ELSE liga END,
    mercado_categoria = CASE WHEN p_updates ? 'mercado_categoria' THEN NULLIF(p_updates ->> 'mercado_categoria', '') ELSE mercado_categoria END,
    mercado_objeto = CASE WHEN p_updates ? 'mercado_objeto' THEN NULLIF(p_updates ->> 'mercado_objeto', '') ELSE mercado_objeto END,
    mercado_formato = CASE WHEN p_updates ? 'mercado_formato' THEN NULLIF(p_updates ->> 'mercado_formato', '') ELSE mercado_formato END,
    mercado_direcao = CASE WHEN p_updates ? 'mercado_direcao' THEN NULLIF(p_updates ->> 'mercado_direcao', '') ELSE mercado_direcao END,
    mercado_linha = v_new_linha,
    mercado_display = CASE WHEN p_updates ? 'mercado_display' THEN NULLIF(p_updates ->> 'mercado_display', '') ELSE mercado_display END,
    fair_value = v_new_fair,
    edge_percentual = v_new_edge,
    modelo_aposta = CASE WHEN p_updates ? 'modelo_aposta' THEN NULLIF(p_updates ->> 'modelo_aposta', '') ELSE modelo_aposta END,
    time_casa = CASE WHEN p_updates ? 'time_casa' THEN NULLIF(p_updates ->> 'time_casa', '') ELSE time_casa END,
    time_fora = CASE WHEN p_updates ? 'time_fora' THEN NULLIF(p_updates ->> 'time_fora', '') ELSE time_fora END,
    fonte_entrada = CASE WHEN p_updates ? 'fonte_entrada' THEN NULLIF(p_updates ->> 'fonte_entrada', '') ELSE fonte_entrada END,
    fonte_saldo = v_fonte_saldo,
    status = CASE WHEN v_was_liquidada THEN 'PENDENTE' ELSE status END,
    resultado = CASE WHEN v_was_liquidada THEN NULL ELSE resultado END,
    lucro_prejuizo = CASE WHEN v_was_liquidada THEN NULL ELSE lucro_prejuizo END,
    valor_retorno = CASE WHEN v_was_liquidada THEN NULL ELSE valor_retorno END,
    updated_at = now()
  WHERE id = p_aposta_id
  RETURNING * INTO v_after;

  v_stake_event_type := CASE WHEN COALESCE(v_after.fonte_saldo, 'REAL') = 'FREEBET' OR COALESCE(v_after.usar_freebet, false) THEN 'FREEBET_STAKE' ELSE 'STAKE' END;
  v_stake_tipo_uso := CASE WHEN v_stake_event_type = 'FREEBET_STAKE' THEN 'FREEBET' ELSE 'NORMAL' END;

  INSERT INTO public.financial_events (
    bookmaker_id, aposta_id, workspace_id, tipo_evento, tipo_uso,
    valor, moeda, idempotency_key, descricao, processed_at, metadata, created_by
  ) VALUES (
    v_after.bookmaker_id,
    v_after.id,
    v_after.workspace_id,
    v_stake_event_type,
    v_stake_tipo_uso,
    -v_after.stake,
    COALESCE(v_after.moeda_operacao, v_bookmaker.moeda, 'BRL'),
    'auto_stake_' || v_after.id,
    'Débito automático de stake (edição segura)',
    now(),
    jsonb_build_object('origem', 'editar_aposta_simples_segura', 'was_liquidada', v_was_liquidada),
    v_actor
  )
  ON CONFLICT (idempotency_key) DO UPDATE
  SET valor = EXCLUDED.valor,
      tipo_evento = EXCLUDED.tipo_evento,
      tipo_uso = EXCLUDED.tipo_uso,
      moeda = EXCLUDED.moeda,
      descricao = EXCLUDED.descricao,
      metadata = EXCLUDED.metadata,
      processed_at = now();

  IF v_was_liquidada THEN
    SELECT jsonb_build_object('success', l.success, 'events_created', l.events_created, 'message', l.message)
      INTO v_liq
    FROM public.liquidar_aposta_v4(p_aposta_id, v_old_resultado, NULL) l
    LIMIT 1;

    IF NOT COALESCE((v_liq ->> 'success')::boolean, false) THEN
      RETURN jsonb_build_object('success', false, 'error', COALESCE(v_liq ->> 'message', 'Falha ao reliquidar aposta'));
    END IF;
  END IF;

  PERFORM public.sync_bookmaker_balance_from_ledger(v_after.bookmaker_id);

  SELECT * INTO v_after
  FROM public.apostas_unificada
  WHERE id = p_aposta_id;

  SELECT COALESCE(jsonb_agg(to_jsonb(fe) ORDER BY fe.created_at, fe.id), '[]'::jsonb)
    INTO v_ledger_after
  FROM public.financial_events fe
  WHERE fe.aposta_id = p_aposta_id;

  SELECT jsonb_build_object(
    'saldo_atual', b.saldo_atual,
    'saldo_freebet', b.saldo_freebet,
    'saldo_bonus', b.saldo_bonus,
    'updated_at', b.updated_at
  ) INTO v_balance_after
  FROM public.bookmakers b
  WHERE b.id = v_after.bookmaker_id;

  v_changed_fields := array_remove(ARRAY[
    CASE WHEN v_old.evento IS DISTINCT FROM v_after.evento THEN 'evento' END,
    CASE WHEN v_old.esporte IS DISTINCT FROM v_after.esporte THEN 'esporte' END,
    CASE WHEN v_old.mercado IS DISTINCT FROM v_after.mercado THEN 'mercado' END,
    CASE WHEN v_old.selecao IS DISTINCT FROM v_after.selecao THEN 'selecao' END,
    CASE WHEN v_old.odd IS DISTINCT FROM v_after.odd THEN 'odd' END,
    CASE WHEN v_old.stake IS DISTINCT FROM v_after.stake THEN 'stake' END,
    CASE WHEN v_old.data_aposta IS DISTINCT FROM v_after.data_aposta THEN 'data_aposta' END,
    CASE WHEN v_old.fair_value IS DISTINCT FROM v_after.fair_value THEN 'fair_value' END,
    CASE WHEN v_old.edge_percentual IS DISTINCT FROM v_after.edge_percentual THEN 'edge_percentual' END,
    CASE WHEN v_old.mercado_display IS DISTINCT FROM v_after.mercado_display THEN 'mercado_display' END,
    CASE WHEN v_old.fonte_entrada IS DISTINCT FROM v_after.fonte_entrada THEN 'fonte_entrada' END,
    CASE WHEN v_old.lucro_prejuizo IS DISTINCT FROM v_after.lucro_prejuizo THEN 'lucro_prejuizo' END,
    CASE WHEN v_old.valor_retorno IS DISTINCT FROM v_after.valor_retorno THEN 'valor_retorno' END
  ], NULL);

  INSERT INTO public.aposta_edit_audit_logs (
    workspace_id, projeto_id, aposta_id, bookmaker_id, actor_user_id,
    status_before, resultado_before, status_after, resultado_after, changed_fields,
    before_data, after_data, ledger_before, ledger_after,
    bookmaker_balance_before, bookmaker_balance_after, success
  ) VALUES (
    v_after.workspace_id, v_after.projeto_id, v_after.id, v_after.bookmaker_id, v_actor,
    v_old.status, v_old.resultado, v_after.status, v_after.resultado, v_changed_fields,
    to_jsonb(v_old), to_jsonb(v_after), v_ledger_before, v_ledger_after,
    v_balance_before, v_balance_after, true
  );

  RETURN jsonb_build_object(
    'success', true,
    'was_liquidada', v_was_liquidada,
    'resultado_preservado', v_old_resultado,
    'changed_fields', v_changed_fields,
    'liquidacao', v_liq,
    'bookmaker_balance_before', v_balance_before,
    'bookmaker_balance_after', v_balance_after
  );
END;
$$;

REVOKE ALL ON FUNCTION public.editar_aposta_simples_segura(uuid, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.editar_aposta_simples_segura(uuid, jsonb) TO authenticated;