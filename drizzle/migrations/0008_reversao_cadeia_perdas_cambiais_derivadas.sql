-- 1) Filhos derivados (ajustes cambiais) de um lançamento do caixa
CREATE OR REPLACE FUNCTION public.fn_ledger_derived_children(p_transacao_id uuid)
RETURNS TABLE (
  id uuid,
  tipo_transacao text,
  valor numeric,
  moeda text,
  coin text,
  qtd_coin numeric,
  data_transacao timestamptz,
  descricao text,
  status text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT cl.id, cl.tipo_transacao, cl.valor, cl.moeda, cl.coin, cl.qtd_coin,
         cl.data_transacao, cl.descricao, cl.status
  FROM public.cash_ledger cl
  WHERE cl.referencia_transacao_id = p_transacao_id
    AND cl.tipo_transacao IN ('PERDA_CAMBIAL','GANHO_CAMBIAL')
    AND cl.reversed_at IS NULL
    AND COALESCE(cl.status, '') <> 'CANCELADO'
  ORDER BY cl.created_at;
$$;

GRANT EXECUTE ON FUNCTION public.fn_ledger_derived_children(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_ledger_derived_children(uuid) TO service_role;

-- 2) Espelho de reversão: direção definida para ajustes cambiais
CREATE OR REPLACE FUNCTION public.reverter_movimentacao_caixa_inner(p_transacao_id uuid, p_motivo text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_tx record;
  v_user_id uuid;
  v_role text;
  v_mirror_id uuid;
  v_direcao_oposta text;
  v_now timestamptz := now();
  v_bookmaker_afetado uuid;
  v_deps_apostas int := 0;
  v_deps_movs int := 0;
  v_mirror_origem_bookmaker_id uuid;
  v_mirror_destino_bookmaker_id uuid;
  v_mirror_origem_conta_bancaria_id uuid;
  v_mirror_destino_conta_bancaria_id uuid;
  v_mirror_origem_wallet_id uuid;
  v_mirror_destino_wallet_id uuid;
  v_mirror_origem_parceiro_id uuid;
  v_mirror_destino_parceiro_id uuid;
  v_mirror_origem_tipo text;
  v_mirror_destino_tipo text;
  v_allowed_origem_types constant text[] := ARRAY[
    'CAIXA_OPERACIONAL','PARCEIRO_CONTA','PARCEIRO_WALLET','BOOKMAKER','INVESTIDOR','AJUSTE','BASELINE','MIGRACAO'
  ];
  v_allowed_destino_types constant text[] := ARRAY[
    'CAIXA_OPERACIONAL','PARCEIRO','PARCEIRO_CONTA','PARCEIRO_WALLET','BOOKMAKER','INVESTIDOR','FORNECEDOR','INDICADOR','OPERADOR','AJUSTE'
  ];
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'message', 'Não autenticado');
  END IF;

  IF p_motivo IS NULL OR length(trim(p_motivo)) < 5 THEN
    RETURN jsonb_build_object('success', false, 'message', 'Motivo obrigatório (mín. 5 caracteres)');
  END IF;

  SELECT * INTO v_tx
  FROM public.cash_ledger
  WHERE id = p_transacao_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'message', 'Movimentação não encontrada');
  END IF;

  SELECT role INTO v_role
  FROM public.workspace_members
  WHERE workspace_id = v_tx.workspace_id AND user_id = v_user_id;

  IF v_role NOT IN ('owner', 'admin') THEN
    RETURN jsonb_build_object('success', false, 'message', 'Apenas owners/admins podem reverter');
  END IF;

  IF v_tx.reversed_at IS NOT NULL THEN
    RETURN jsonb_build_object('success', false, 'message', 'Esta movimentação já foi revertida');
  END IF;

  IF v_tx.descricao IS NOT NULL AND v_tx.descricao LIKE 'ESTORNO:%' THEN
    RETURN jsonb_build_object('success', false, 'message', 'Esta transação já é um estorno');
  END IF;

  IF (v_now - v_tx.created_at) > INTERVAL '24 hours' THEN
    RETURN jsonb_build_object('success', false, 'message', 'Janela de 24h expirada');
  END IF;

  IF v_tx.tipo_transacao IN ('DEPOSITO','SAQUE','TRANSFERENCIA','BONUS_CREDITADO') THEN
    v_bookmaker_afetado := COALESCE(v_tx.destino_bookmaker_id, v_tx.origem_bookmaker_id);

    IF v_bookmaker_afetado IS NOT NULL THEN
      SELECT COUNT(*) INTO v_deps_apostas
      FROM public.apostas_unificada
      WHERE bookmaker_id = v_bookmaker_afetado
        AND created_at > v_tx.created_at
        AND status NOT IN ('CANCELADA');

      SELECT COUNT(*) INTO v_deps_movs
      FROM public.cash_ledger
      WHERE id <> p_transacao_id
        AND reversed_at IS NULL
        AND created_at > v_tx.created_at
        AND (origem_bookmaker_id = v_bookmaker_afetado
             OR destino_bookmaker_id = v_bookmaker_afetado);

      IF (v_deps_apostas + v_deps_movs) > 0 THEN
        RETURN jsonb_build_object(
          'success', false,
          'code', 'DEPENDENCIAS_POSTERIORES',
          'message', format(
            'Reversão bloqueada: existem %s aposta(s) e %s movimentação(ões) posteriores no bookmaker afetado. Reverta a cadeia primeiro.',
            v_deps_apostas, v_deps_movs
          ),
          'deps_apostas', v_deps_apostas,
          'deps_movimentacoes', v_deps_movs,
          'bookmaker_id', v_bookmaker_afetado
        );
      END IF;
    END IF;
  END IF;

  v_direcao_oposta := CASE v_tx.tipo_transacao
    WHEN 'DEPOSITO' THEN 'SAIDA'
    WHEN 'BONUS_CREDITADO' THEN 'SAIDA'
    WHEN 'CASHBACK_MANUAL' THEN 'SAIDA'
    WHEN 'BONIFICACAO_ESTRATEGICA' THEN 'SAIDA'
    WHEN 'GIRO_GRATIS' THEN 'SAIDA'
    WHEN 'APOSTA_GREEN' THEN 'SAIDA'
    WHEN 'GANHO_CAMBIAL' THEN 'SAIDA'
    WHEN 'SAQUE' THEN 'ENTRADA'
    WHEN 'TRANSFERENCIA' THEN 'ENTRADA'
    WHEN 'DESPESA_ADMINISTRATIVA' THEN 'ENTRADA'
    WHEN 'PAGTO_OPERADOR' THEN 'ENTRADA'
    WHEN 'PAGTO_PARCEIRO' THEN 'ENTRADA'
    WHEN 'PAGTO_INVESTIDOR' THEN 'ENTRADA'
    WHEN 'PAGTO_FORNECEDOR' THEN 'ENTRADA'
    WHEN 'ALOCACAO_FORNECEDOR' THEN 'ENTRADA'
    WHEN 'COMISSAO_INDICADOR' THEN 'ENTRADA'
    WHEN 'RENOVACAO_PARCERIA' THEN 'ENTRADA'
    WHEN 'PERDA_OPERACIONAL' THEN 'ENTRADA'
    WHEN 'PERDA_CAMBIAL' THEN 'ENTRADA'
    WHEN 'APOSTA_REVERSAO' THEN 'ENTRADA'
    WHEN 'BONUS_ESTORNO' THEN 'ENTRADA'
    WHEN 'CASHBACK_ESTORNO' THEN 'ENTRADA'
    WHEN 'GIRO_GRATIS_ESTORNO' THEN 'ENTRADA'
    WHEN 'ESTORNO' THEN 'ENTRADA'
    WHEN 'AJUSTE_MANUAL' THEN CASE WHEN v_tx.ajuste_direcao = 'ENTRADA' THEN 'SAIDA' ELSE 'ENTRADA' END
    WHEN 'AJUSTE_RECONCILIACAO' THEN CASE WHEN v_tx.ajuste_direcao = 'ENTRADA' THEN 'SAIDA' ELSE 'ENTRADA' END
    WHEN 'AJUSTE_SALDO' THEN CASE WHEN v_tx.ajuste_direcao = 'ENTRADA' THEN 'SAIDA' ELSE 'ENTRADA' END
    ELSE NULL
  END;

  IF v_direcao_oposta IS NULL THEN
    IF v_tx.ajuste_direcao IS NOT NULL THEN
      v_direcao_oposta := CASE WHEN v_tx.ajuste_direcao = 'ENTRADA' THEN 'SAIDA' ELSE 'ENTRADA' END;
    ELSIF v_tx.destino_bookmaker_id IS NOT NULL
       OR v_tx.destino_conta_bancaria_id IS NOT NULL
       OR v_tx.destino_wallet_id IS NOT NULL THEN
      v_direcao_oposta := 'SAIDA';
    ELSIF v_tx.origem_bookmaker_id IS NOT NULL
       OR v_tx.origem_conta_bancaria_id IS NOT NULL
       OR v_tx.origem_wallet_id IS NOT NULL THEN
      v_direcao_oposta := 'ENTRADA';
    ELSE
      RETURN jsonb_build_object(
        'success', false,
        'message', 'Não foi possível determinar a direção do espelho para o tipo ' || v_tx.tipo_transacao
      );
    END IF;
  END IF;

  v_mirror_origem_bookmaker_id := v_tx.destino_bookmaker_id;
  v_mirror_destino_bookmaker_id := v_tx.origem_bookmaker_id;
  v_mirror_origem_conta_bancaria_id := v_tx.destino_conta_bancaria_id;
  v_mirror_destino_conta_bancaria_id := v_tx.origem_conta_bancaria_id;
  v_mirror_origem_wallet_id := v_tx.destino_wallet_id;
  v_mirror_destino_wallet_id := v_tx.origem_wallet_id;
  v_mirror_origem_parceiro_id := v_tx.destino_parceiro_id;
  v_mirror_destino_parceiro_id := v_tx.origem_parceiro_id;
  v_mirror_origem_tipo := v_tx.destino_tipo;
  v_mirror_destino_tipo := v_tx.origem_tipo;

  IF v_mirror_origem_tipo IS NOT NULL AND NOT (v_mirror_origem_tipo = ANY (v_allowed_origem_types)) THEN
    v_mirror_origem_tipo := 'AJUSTE';
    v_mirror_origem_bookmaker_id := NULL;
    v_mirror_origem_conta_bancaria_id := NULL;
    v_mirror_origem_wallet_id := NULL;
    v_mirror_origem_parceiro_id := NULL;
  END IF;

  IF v_mirror_destino_tipo IS NOT NULL AND NOT (v_mirror_destino_tipo = ANY (v_allowed_destino_types)) THEN
    v_mirror_destino_tipo := 'AJUSTE';
    v_mirror_destino_bookmaker_id := NULL;
    v_mirror_destino_conta_bancaria_id := NULL;
    v_mirror_destino_wallet_id := NULL;
    v_mirror_destino_parceiro_id := NULL;
  END IF;

  INSERT INTO public.cash_ledger (
    workspace_id, user_id, tipo_transacao, ajuste_direcao,
    valor, moeda, tipo_moeda, status,
    origem_bookmaker_id, destino_bookmaker_id,
    origem_conta_bancaria_id, destino_conta_bancaria_id,
    origem_wallet_id, destino_wallet_id,
    origem_parceiro_id, destino_parceiro_id,
    origem_tipo, destino_tipo,
    data_transacao, descricao,
    financial_events_generated, projeto_id_snapshot,
    coin, qtd_coin, valor_usd,
    valor_origem, valor_destino,
    cotacao, cotacao_implicita,
    cotacao_origem_usd, cotacao_destino_usd,
    transit_status, referencia_transacao_id
  ) VALUES (
    v_tx.workspace_id, v_user_id, 'AJUSTE_RECONCILIACAO', v_direcao_oposta,
    v_tx.valor, v_tx.moeda, v_tx.tipo_moeda, 'CONFIRMADO',
    v_mirror_origem_bookmaker_id, v_mirror_destino_bookmaker_id,
    v_mirror_origem_conta_bancaria_id, v_mirror_destino_conta_bancaria_id,
    v_mirror_origem_wallet_id, v_mirror_destino_wallet_id,
    v_mirror_origem_parceiro_id, v_mirror_destino_parceiro_id,
    v_mirror_origem_tipo, v_mirror_destino_tipo,
    v_tx.data_transacao, 'ESTORNO: ' || p_motivo,
    false, v_tx.projeto_id_snapshot,
    v_tx.coin, v_tx.qtd_coin, v_tx.valor_usd,
    v_tx.valor_destino, v_tx.valor_origem,
    v_tx.cotacao, v_tx.cotacao_implicita,
    v_tx.cotacao_destino_usd, v_tx.cotacao_origem_usd,
    'CONFIRMED', p_transacao_id
  ) RETURNING id INTO v_mirror_id;

  UPDATE public.cash_ledger
  SET reversed_at = v_now,
      reversed_by_id = v_mirror_id,
      updated_at = v_now
  WHERE id = p_transacao_id;

  INSERT INTO public.audit_logs (
    actor_user_id, workspace_id, action, entity_type, entity_id,
    before_data, after_data, metadata
  ) VALUES (
    v_user_id, v_tx.workspace_id, 'UPDATE', 'cash_ledger', p_transacao_id,
    to_jsonb(v_tx),
    jsonb_build_object('reversed_at', v_now, 'mirror_id', v_mirror_id),
    jsonb_build_object('motivo', p_motivo, 'tipo_origem', v_tx.tipo_transacao)
  );

  RETURN jsonb_build_object(
    'success', true,
    'message', 'Movimentação revertida com sucesso',
    'mirror_id', v_mirror_id
  );
END;
$function$;

-- 3) Reversão em cadeia: filhos cambiais antes do pai, tudo na mesma transação
CREATE OR REPLACE FUNCTION public.reverter_movimentacao_caixa(p_transacao_id uuid, p_motivo text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_impact jsonb;
  v_neg jsonb;
  v_tx record;
  v_res jsonb;
  v_legs uuid[];
  v_children uuid[];
  v_leg_id uuid;
  v_results jsonb := '[]'::jsonb;
  v_derivados int := 0;
BEGIN
  SELECT id, tipo_transacao, swap_operation_id, referencia_transacao_id, reversed_at
    INTO v_tx
  FROM public.cash_ledger WHERE id = p_transacao_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'message', 'Movimentação não encontrada');
  END IF;

  IF v_tx.tipo_transacao IN ('SWAP_IN', 'SWAP_OUT') THEN
    IF v_tx.swap_operation_id IS NOT NULL THEN
      SELECT array_agg(id ORDER BY tipo_transacao DESC) INTO v_legs
      FROM public.cash_ledger
      WHERE swap_operation_id = v_tx.swap_operation_id
        AND tipo_transacao IN ('SWAP_IN', 'SWAP_OUT')
        AND reversed_at IS NULL;
    ELSE
      SELECT array_agg(id ORDER BY tipo_transacao DESC) INTO v_legs
      FROM public.cash_ledger
      WHERE reversed_at IS NULL
        AND tipo_transacao IN ('SWAP_IN', 'SWAP_OUT')
        AND (
          id = p_transacao_id
          OR referencia_transacao_id = p_transacao_id
          OR (v_tx.referencia_transacao_id IS NOT NULL AND id = v_tx.referencia_transacao_id)
        );
    END IF;
  END IF;

  IF v_legs IS NULL OR array_length(v_legs, 1) IS NULL THEN
    v_legs := ARRAY[p_transacao_id];
  END IF;

  -- Filhos cambiais derivados de qualquer perna: revertidos ANTES do pai
  SELECT array_agg(c.id) INTO v_children
  FROM unnest(v_legs) AS l(id)
  CROSS JOIN LATERAL public.fn_ledger_derived_children(l.id) c;

  IF v_children IS NOT NULL AND array_length(v_children, 1) IS NOT NULL THEN
    v_derivados := array_length(v_children, 1);
    v_legs := v_children || v_legs;
  END IF;

  -- Guard de cadeia: valida TODAS as pernas antes de reverter qualquer uma
  FOREACH v_leg_id IN ARRAY v_legs LOOP
    v_impact := public.fn_ledger_reversal_impact(v_leg_id);

    IF COALESCE((v_impact->>'found')::boolean, false)
       AND COALESCE((v_impact->>'ativos_negativos')::int, 0) > 0 THEN

      SELECT a INTO v_neg
      FROM jsonb_array_elements(v_impact->'ativos_afetados') a
      WHERE (a->>'negativo')::boolean
      LIMIT 1;

      RETURN jsonb_build_object(
        'success', false,
        'code', 'CADEIA_DEPENDENTE',
        'message', format(
          'Reversão bloqueada: o ativo "%s" ficaria com saldo negativo (%s %s) porque %s operação(ões) posterior(es) já consumiram esse recurso. Reverta a cadeia na ordem cronológica inversa.',
          COALESCE(v_neg->>'nome', 'destino'),
          round(COALESCE((v_neg->>'saldo_pos_reversao')::numeric, 0), 2),
          COALESCE(v_neg->>'moeda', ''),
          COALESCE(v_impact->>'descendentes_count', '0')
        ),
        'impacto', v_impact
      );
    END IF;
  END LOOP;

  FOREACH v_leg_id IN ARRAY v_legs LOOP
    v_res := public.reverter_movimentacao_caixa_inner(v_leg_id, p_motivo);
    IF NOT COALESCE((v_res->>'success')::boolean, false) THEN
      RAISE EXCEPTION '%', COALESCE(v_res->>'message', 'Falha ao reverter movimentação');
    END IF;
    v_results := v_results || jsonb_build_array(v_res);
  END LOOP;

  IF array_length(v_legs, 1) > 1 THEN
    RETURN jsonb_build_object(
      'success', true,
      'message', CASE
        WHEN v_derivados > 0 AND array_length(v_legs, 1) - v_derivados > 1
          THEN format('Swap revertido por completo, incluindo %s ajuste(s) cambial(is) derivado(s)', v_derivados)
        WHEN v_derivados > 0
          THEN format('Movimentação revertida junto com %s ajuste(s) cambial(is) derivado(s)', v_derivados)
        ELSE format('Swap revertido por completo (%s pernas)', array_length(v_legs, 1))
      END,
      'pernas', v_results,
      'derivados_revertidos', v_derivados,
      'mirror_id', v_results->(array_length(v_legs,1) - 1)->>'mirror_id'
    );
  END IF;

  RETURN v_results->0;
END;
$function$;

-- 4) Exclusão em cadeia: filhos cambiais excluídos junto, com snapshot em auditoria
CREATE OR REPLACE FUNCTION public.excluir_movimentacao_caixa(p_transacao_id uuid, p_motivo text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_user_id UUID := auth.uid();
  v_tx RECORD;
  v_role TEXT;
  v_age_min NUMERIC;
  v_par_id UUID;
  v_derivados INT := 0;
  v_tipos_bloqueados TEXT[] := ARRAY[
    'APORTE','APORTE_FINANCEIRO','APORTE_DIRETO','LIQUIDACAO',
    'DEPOSITO_VIRTUAL','SAQUE_VIRTUAL'
  ];
BEGIN
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'message', 'Não autenticado');
  END IF;

  SELECT * INTO v_tx
  FROM public.cash_ledger
  WHERE id = p_transacao_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'message', 'Transação não encontrada');
  END IF;

  SELECT role INTO v_role
  FROM public.workspace_members
  WHERE workspace_id = v_tx.workspace_id AND user_id = v_user_id;

  IF v_role NOT IN ('owner','admin') THEN
    RETURN jsonb_build_object('success', false, 'message', 'Apenas owners/admins podem excluir');
  END IF;

  IF v_tx.reversed_at IS NOT NULL THEN
    RETURN jsonb_build_object('success', false, 'message', 'Movimentação já revertida não pode ser excluída');
  END IF;

  IF v_tx.tipo_transacao = ANY(v_tipos_bloqueados) THEN
    RETURN jsonb_build_object('success', false, 'message',
      v_tx.tipo_transacao || ' não pode ser excluído diretamente');
  END IF;

  IF COALESCE(v_tx.financial_events_generated, false) THEN
    RETURN jsonb_build_object('success', false, 'message',
      'Já gerou eventos financeiros — use Reverter');
  END IF;

  v_age_min := EXTRACT(EPOCH FROM (NOW() - v_tx.created_at)) / 60;
  IF v_age_min > 30 THEN
    RETURN jsonb_build_object('success', false, 'message',
      'Janela de 30 min para exclusão expirada (' || ROUND(v_age_min, 1) || ' min) — use Reverter');
  END IF;

  INSERT INTO public.audit_logs (
    workspace_id, actor_user_id, action, entity_type, entity_id,
    before_data, metadata
  ) VALUES (
    v_tx.workspace_id, v_user_id, 'delete', 'cash_ledger', v_tx.id,
    to_jsonb(v_tx),
    jsonb_build_object('motivo', p_motivo, 'deleted_at', NOW())
  );

  -- Filhos cambiais derivados: snapshot + exclusão junto
  INSERT INTO public.audit_logs (
    workspace_id, actor_user_id, action, entity_type, entity_id,
    before_data, metadata
  )
  SELECT cl.workspace_id, v_user_id, 'delete', 'cash_ledger', cl.id,
         to_jsonb(cl.*),
         jsonb_build_object('motivo', 'Ajuste cambial derivado de ' || v_tx.id, 'deleted_at', NOW())
  FROM public.cash_ledger cl
  WHERE cl.referencia_transacao_id = v_tx.id
    AND cl.tipo_transacao IN ('PERDA_CAMBIAL','GANHO_CAMBIAL');

  DELETE FROM public.cash_ledger
  WHERE referencia_transacao_id = v_tx.id
    AND tipo_transacao IN ('PERDA_CAMBIAL','GANHO_CAMBIAL');
  GET DIAGNOSTICS v_derivados = ROW_COUNT;

  -- SWAP: detectar par e excluir junto
  IF v_tx.tipo_transacao IN ('SWAP_IN','SWAP_OUT') THEN
    SELECT id INTO v_par_id
    FROM public.cash_ledger
    WHERE referencia_transacao_id = v_tx.id
       OR (id = v_tx.referencia_transacao_id);
    IF v_par_id IS NOT NULL THEN
      INSERT INTO public.audit_logs (
        workspace_id, actor_user_id, action, entity_type, entity_id,
        before_data, metadata
      )
      SELECT workspace_id, v_user_id, 'delete', 'cash_ledger', id,
             to_jsonb(cash_ledger.*),
             jsonb_build_object('motivo', 'Par SWAP de ' || v_tx.id, 'deleted_at', NOW())
      FROM public.cash_ledger WHERE id = v_par_id;
      DELETE FROM public.cash_ledger WHERE id = v_par_id;
    END IF;
  END IF;

  DELETE FROM public.cash_ledger WHERE id = v_tx.id;

  RETURN jsonb_build_object(
    'success', true,
    'derivados_excluidos', v_derivados,
    'message', CASE WHEN v_derivados > 0
      THEN format('Movimentação excluída com %s ajuste(s) cambial(is) derivado(s)', v_derivados)
      ELSE 'Movimentação excluída com sucesso' END
  );
END;
$function$;

-- 5) Auditoria de integridade cambial
CREATE OR REPLACE VIEW public.v_auditoria_integridade_cambial AS
SELECT
  f.id AS ajuste_id,
  f.workspace_id,
  f.tipo_transacao AS ajuste_tipo,
  f.valor AS ajuste_valor,
  COALESCE(f.coin, f.moeda) AS ajuste_moeda,
  f.data_transacao::date AS ajuste_competencia,
  f.created_at AS ajuste_criado_em,
  f.status AS ajuste_status,
  f.projeto_id_snapshot AS ajuste_projeto_id,
  f.referencia_transacao_id AS pai_id,
  p.tipo_transacao AS pai_tipo,
  p.valor AS pai_valor,
  p.data_transacao::date AS pai_competencia,
  p.status AS pai_status,
  p.reversed_at AS pai_revertido_em,
  p.projeto_id_snapshot AS pai_projeto_id,
  b.nome AS casa,
  par.nome AS parceiro,
  pr.nome AS projeto,
  w.name AS workspace,
  CASE
    WHEN f.referencia_transacao_id IS NULL THEN 'SEM_VINCULO'
    WHEN p.id IS NULL THEN 'PAI_INEXISTENTE'
    WHEN p.reversed_at IS NOT NULL THEN 'PAI_REVERTIDO'
    WHEN p.status = 'CANCELADO' THEN 'PAI_CANCELADO'
    WHEN f.data_transacao::date <> p.data_transacao::date THEN 'COMPETENCIA_DIVERGENTE'
    WHEN f.projeto_id_snapshot IS DISTINCT FROM p.projeto_id_snapshot THEN 'PROJETO_DIVERGENTE'
    ELSE 'OK'
  END AS diagnostico
FROM public.cash_ledger f
LEFT JOIN public.cash_ledger p ON p.id = f.referencia_transacao_id
LEFT JOIN public.bookmakers b ON b.id = COALESCE(p.origem_bookmaker_id, p.destino_bookmaker_id)
LEFT JOIN public.parceiros par ON par.id = b.parceiro_id
LEFT JOIN public.projetos pr ON pr.id = f.projeto_id_snapshot
LEFT JOIN public.workspaces w ON w.id = f.workspace_id
WHERE f.tipo_transacao IN ('PERDA_CAMBIAL','GANHO_CAMBIAL')
  AND f.reversed_at IS NULL
  AND COALESCE(f.status, '') <> 'CANCELADO';

GRANT SELECT ON public.v_auditoria_integridade_cambial TO authenticated;
GRANT SELECT ON public.v_auditoria_integridade_cambial TO service_role;