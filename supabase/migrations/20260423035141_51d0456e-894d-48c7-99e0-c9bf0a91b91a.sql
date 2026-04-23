CREATE OR REPLACE FUNCTION public.preview_migracao_freebet(p_freebet_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_freebet record;
  v_apostas_no_origem int;
  v_valor_restante numeric;
  v_valor_consumido numeric;
  v_estado text;
BEGIN
  SELECT * INTO v_freebet FROM public.freebets_recebidas WHERE id = p_freebet_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'Freebet não encontrada');
  END IF;

  IF v_freebet.status IN ('MIGRADA', 'PARCIALMENTE_MIGRADA', 'CANCELADA') THEN
    RETURN jsonb_build_object('estado', 'BLOQUEADA', 'motivo', 'Status atual: ' || v_freebet.status);
  END IF;

  SELECT COUNT(*) INTO v_apostas_no_origem
  FROM public.apostas_unificada
  WHERE bookmaker_id = v_freebet.bookmaker_id
    AND projeto_id = v_freebet.projeto_id
    AND COALESCE(stake_freebet, 0) > 0
    AND status NOT IN ('CANCELADA', 'cancelled', 'cancelada');

  SELECT COALESCE(valor_restante, v_freebet.valor) INTO v_valor_restante
  FROM public.v_freebets_disponibilidade
  WHERE id = p_freebet_id;

  IF v_valor_restante IS NULL THEN
    v_valor_restante := v_freebet.valor;
  END IF;

  v_valor_consumido := GREATEST(v_freebet.valor - v_valor_restante, 0);

  -- *** REGRA REFINADA: o que importa é o consumo desta freebet específica (FIFO do ledger) ***
  IF v_valor_consumido = 0 THEN
    v_estado := 'TOTAL';        -- Nada foi consumido desta freebet → migração limpa
  ELSIF v_valor_restante <= 0 THEN
    v_estado := 'ESGOTADA';
  ELSE
    v_estado := 'PARCIAL';
  END IF;

  RETURN jsonb_build_object(
    'estado', v_estado,
    'valor_original', v_freebet.valor,
    'valor_restante', v_valor_restante,
    'valor_consumido', v_valor_consumido,
    'apostas_no_origem', v_apostas_no_origem,
    'projeto_origem_id', v_freebet.projeto_id,
    'bookmaker_id', v_freebet.bookmaker_id,
    'data_validade', v_freebet.data_validade,
    'motivo', v_freebet.motivo
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.migrar_freebet_estoque(
  p_freebet_id uuid,
  p_destino_projeto_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_freebet record;
  v_workspace_id uuid;
  v_destino_projeto record;
  v_origem_projeto record;
  v_bookmaker record;
  v_valor_consumido numeric := 0;
  v_valor_restante numeric;
  v_estado text;
  v_nova_freebet_id uuid;
  v_nova_motivo text;
BEGIN
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Não autenticado');
  END IF;

  SELECT * INTO v_freebet FROM public.freebets_recebidas WHERE id = p_freebet_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Freebet não encontrada');
  END IF;

  v_workspace_id := v_freebet.workspace_id;

  IF v_freebet.status = 'CANCELADA' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Freebet cancelada não pode ser migrada');
  END IF;
  IF v_freebet.status IN ('MIGRADA', 'PARCIALMENTE_MIGRADA') THEN
    RETURN jsonb_build_object('success', false, 'error', 'Freebet já foi migrada anteriormente');
  END IF;
  IF v_freebet.status <> 'LIBERADA' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Apenas freebets liberadas podem ser migradas');
  END IF;
  IF v_freebet.projeto_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Freebet sem projeto de origem');
  END IF;
  IF v_freebet.projeto_id = p_destino_projeto_id THEN
    RETURN jsonb_build_object('success', false, 'error', 'Projeto de destino deve ser diferente do projeto atual');
  END IF;

  SELECT id, nome, workspace_id INTO v_origem_projeto FROM public.projetos WHERE id = v_freebet.projeto_id;
  SELECT id, nome, workspace_id INTO v_destino_projeto FROM public.projetos WHERE id = p_destino_projeto_id;

  IF v_destino_projeto.id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Projeto de destino não encontrado');
  END IF;
  IF v_destino_projeto.workspace_id <> v_workspace_id THEN
    RETURN jsonb_build_object('success', false, 'error', 'Projeto de destino pertence a outro workspace');
  END IF;

  SELECT id, nome, projeto_id, workspace_id INTO v_bookmaker FROM public.bookmakers WHERE id = v_freebet.bookmaker_id;
  IF v_bookmaker.projeto_id IS NULL OR v_bookmaker.projeto_id <> p_destino_projeto_id THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'A casa precisa estar vinculada ao projeto de destino antes da migração da freebet'
    );
  END IF;

  SELECT COALESCE(valor_restante, v_freebet.valor) INTO v_valor_restante
  FROM public.v_freebets_disponibilidade WHERE id = p_freebet_id;

  IF v_valor_restante IS NULL THEN
    v_valor_restante := v_freebet.valor;
  END IF;

  v_valor_consumido := GREATEST(v_freebet.valor - v_valor_restante, 0);

  IF v_valor_consumido = 0 THEN
    v_estado := 'TOTAL';
  ELSIF v_valor_restante <= 0 THEN
    v_estado := 'ESGOTADA';
  ELSE
    v_estado := 'PARCIAL';
  END IF;

  IF v_estado = 'ESGOTADA' THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Esta freebet já foi totalmente consumida. Migração bloqueada para preservar o histórico.',
      'estado', v_estado
    );
  END IF;

  IF v_estado = 'TOTAL' THEN
    UPDATE public.freebets_recebidas SET
      projeto_id = p_destino_projeto_id,
      migrada_de_projeto_id = v_freebet.projeto_id,
      updated_at = now()
    WHERE id = p_freebet_id;
    v_nova_freebet_id := p_freebet_id;
  ELSE
    v_nova_motivo := COALESCE(v_freebet.motivo, 'Freebet') || ' (migrada de ' || COALESCE(v_origem_projeto.nome, 'projeto anterior') || ')';

    INSERT INTO public.freebets_recebidas (
      user_id, workspace_id, projeto_id, bookmaker_id,
      valor, motivo, data_recebida, data_validade,
      observacoes, status, origem,
      moeda_operacao, cotacao_snapshot, cotacao_snapshot_at, valor_brl_referencia,
      tem_rollover, qualificadora_id,
      migrada_de_freebet_id, migrada_de_projeto_id,
      valor_original_referencia, valor_consumido_no_origem,
      migrated_at, migrated_by
    ) VALUES (
      v_user_id, v_workspace_id, p_destino_projeto_id, v_freebet.bookmaker_id,
      v_valor_restante, v_nova_motivo, now(), v_freebet.data_validade,
      v_freebet.observacoes, 'LIBERADA', v_freebet.origem,
      v_freebet.moeda_operacao, v_freebet.cotacao_snapshot, v_freebet.cotacao_snapshot_at, v_freebet.valor_brl_referencia,
      COALESCE(v_freebet.tem_rollover, false), v_freebet.qualificadora_id,
      p_freebet_id, v_freebet.projeto_id,
      v_freebet.valor, v_valor_consumido,
      now(), v_user_id
    )
    RETURNING id INTO v_nova_freebet_id;

    UPDATE public.freebets_recebidas SET
      status = 'PARCIALMENTE_MIGRADA',
      migrada_para_freebet_id = v_nova_freebet_id,
      migrada_para_projeto_id = p_destino_projeto_id,
      valor_consumido_no_origem = v_valor_consumido,
      migrated_at = now(),
      migrated_by = v_user_id,
      updated_at = now()
    WHERE id = p_freebet_id;
  END IF;

  INSERT INTO public.audit_logs (
    actor_user_id, workspace_id, entity_type, entity_id, entity_name,
    action, before_data, after_data, metadata
  ) VALUES (
    v_user_id, v_workspace_id, 'freebets_recebidas', p_freebet_id, v_freebet.motivo,
    'UPDATE',
    jsonb_build_object('projeto_id', v_freebet.projeto_id, 'status', v_freebet.status, 'valor', v_freebet.valor),
    jsonb_build_object('projeto_id', p_destino_projeto_id, 'nova_freebet_id', v_nova_freebet_id, 'estado', v_estado),
    jsonb_build_object(
      'tipo', 'freebet_migration', 'estado', v_estado,
      'valor_original', v_freebet.valor, 'valor_restante', v_valor_restante,
      'valor_consumido', v_valor_consumido,
      'projeto_origem', v_origem_projeto.nome, 'projeto_destino', v_destino_projeto.nome
    )
  );

  RETURN jsonb_build_object(
    'success', true, 'estado', v_estado,
    'freebet_id_origem', p_freebet_id, 'freebet_id_destino', v_nova_freebet_id,
    'valor_migrado', CASE WHEN v_estado = 'TOTAL' THEN v_freebet.valor ELSE v_valor_restante END,
    'valor_original', v_freebet.valor, 'valor_consumido_no_origem', v_valor_consumido,
    'projeto_destino_nome', v_destino_projeto.nome
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.preview_migracao_freebet(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.migrar_freebet_estoque(uuid, uuid) TO authenticated;