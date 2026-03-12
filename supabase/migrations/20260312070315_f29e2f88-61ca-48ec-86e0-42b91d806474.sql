CREATE OR REPLACE FUNCTION public.get_central_operacoes_data(
  p_workspace_id uuid,
  p_user_id uuid,
  p_is_operator boolean DEFAULT false,
  p_include_financial boolean DEFAULT true,
  p_include_partner boolean DEFAULT true
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_result jsonb := '{}'::jsonb;
  v_section jsonb;
  v_operador_id uuid := NULL;
  v_operator_projects uuid[] := NULL;
  v_hoje date := current_date;
BEGIN
  -- Resolve operator context
  IF p_is_operator THEN
    SELECT id INTO v_operador_id FROM operadores WHERE auth_user_id = p_user_id LIMIT 1;
    IF v_operador_id IS NOT NULL THEN
      SELECT array_agg(projeto_id) INTO v_operator_projects
      FROM operador_projetos
      WHERE operador_id = v_operador_id AND status = 'ATIVO';
    END IF;
  END IF;

  -- 1. Alertas (v_painel_operacional) — view already filters by workspace internally
  IF p_include_financial THEN
    SELECT COALESCE(jsonb_agg(row_to_json(t)), '[]'::jsonb) INTO v_section FROM v_painel_operacional t;
  ELSE
    v_section := '[]'::jsonb;
  END IF;
  v_result := v_result || jsonb_build_object('alertas', v_section);

  -- 2. Entregas pendentes
  SELECT COALESCE(jsonb_agg(row_to_json(t)), '[]'::jsonb) INTO v_section
  FROM v_entregas_pendentes t
  WHERE t.status_conciliacao = 'PRONTA'
    AND (v_operator_projects IS NULL OR t.projeto_id = ANY(v_operator_projects));
  v_result := v_result || jsonb_build_object('entregas_pendentes', v_section);

  -- 3. Pagamentos parceiros (filtered: not yet paid)
  IF p_include_partner THEN
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
      'parceriaId', p.id,
      'parceiroNome', par.nome,
      'valorParceiro', p.valor_parceiro,
      'origemTipo', COALESCE(p.origem_tipo, 'INDICADOR'),
      'diasRestantes', COALESCE((p.data_fim_prevista::date - v_hoje), 999),
      'parceiroId', p.parceiro_id,
      'workspaceId', p.workspace_id
    )), '[]'::jsonb) INTO v_section
    FROM parcerias p
    JOIN parceiros par ON par.id = p.parceiro_id
    WHERE p.workspace_id = p_workspace_id
      AND p.status IN ('ATIVA', 'EM_ENCERRAMENTO')
      AND (p.custo_aquisicao_isento IS NULL OR p.custo_aquisicao_isento = false)
      AND p.valor_parceiro > 0
      AND p.pagamento_dispensado = false
      AND NOT EXISTS (
        SELECT 1 FROM movimentacoes_indicacao m
        WHERE m.parceria_id = p.id AND m.tipo = 'PAGTO_PARCEIRO' AND m.status = 'CONFIRMADO'
      );
    v_result := v_result || jsonb_build_object('pagamentos_parceiros', v_section);

    -- 4. Pagamentos fornecedores (computed with valor_pago)
    WITH forn_pagos AS (
      SELECT parceria_id, SUM(valor) as total_pago
      FROM movimentacoes_indicacao
      WHERE tipo = 'PAGTO_FORNECEDOR' AND status = 'CONFIRMADO'
        AND workspace_id = p_workspace_id
      GROUP BY parceria_id
    )
    SELECT COALESCE(jsonb_agg(sub.obj), '[]'::jsonb) INTO v_section
    FROM (
      SELECT jsonb_build_object(
        'parceriaId', p.id,
        'parceiroNome', par.nome,
        'fornecedorNome', COALESCE(f.nome, 'Fornecedor'),
        'fornecedorId', p.fornecedor_id,
        'valorFornecedor', p.valor_fornecedor,
        'valorPago', COALESCE(fp.total_pago, 0),
        'valorRestante', GREATEST(0, p.valor_fornecedor - COALESCE(fp.total_pago, 0)),
        'diasRestantes', COALESCE((p.data_fim_prevista::date - v_hoje), 999),
        'workspaceId', p.workspace_id
      ) as obj
      FROM parcerias p
      JOIN parceiros par ON par.id = p.parceiro_id
      LEFT JOIN fornecedores f ON f.id = p.fornecedor_id
      LEFT JOIN forn_pagos fp ON fp.parceria_id = p.id
      WHERE p.workspace_id = p_workspace_id
        AND p.status IN ('ATIVA', 'EM_ENCERRAMENTO')
        AND p.origem_tipo = 'FORNECEDOR'
        AND p.valor_fornecedor > 0
        AND p.pagamento_dispensado = false
        AND GREATEST(0, p.valor_fornecedor - COALESCE(fp.total_pago, 0)) > 0
    ) sub;
    v_result := v_result || jsonb_build_object('pagamentos_fornecedores', v_section);

    -- 5. Bonus pendentes (fully computed)
    WITH indicador_counts AS (
      SELECT indicador_id, MIN(indicador_nome) as indicador_nome, COUNT(*)::int as qtd
      FROM v_custos_aquisicao
      WHERE indicador_id IS NOT NULL AND indicador_nome IS NOT NULL
        AND workspace_id = p_workspace_id
      GROUP BY indicador_id
    ),
    bonus_pagos AS (
      SELECT indicador_id, COUNT(*)::int as pagos
      FROM movimentacoes_indicacao
      WHERE tipo = 'BONUS_INDICADOR' AND status = 'CONFIRMADO'
        AND workspace_id = p_workspace_id
      GROUP BY indicador_id
    ),
    computed AS (
      SELECT
        a.indicador_id,
        ic.indicador_nome,
        a.valor_bonus,
        ic.qtd as qtd_parceiros,
        a.meta_parceiros,
        FLOOR(ic.qtd::numeric / a.meta_parceiros)::int - COALESCE(bp.pagos, 0) as ciclos_pendentes
      FROM indicador_acordos a
      JOIN indicador_counts ic ON ic.indicador_id = a.indicador_id
      LEFT JOIN bonus_pagos bp ON bp.indicador_id = a.indicador_id
      WHERE a.ativo = true AND a.meta_parceiros > 0
        AND a.workspace_id = p_workspace_id
    )
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
      'indicadorId', indicador_id,
      'indicadorNome', indicador_nome,
      'valorBonus', valor_bonus,
      'qtdParceiros', qtd_parceiros,
      'meta', meta_parceiros,
      'ciclosPendentes', ciclos_pendentes,
      'totalBonusPendente', valor_bonus * ciclos_pendentes
    )), '[]'::jsonb) INTO v_section
    FROM computed
    WHERE ciclos_pendentes > 0;
    v_result := v_result || jsonb_build_object('bonus_pendentes', v_section);

    -- 6. Comissoes pendentes
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
      'parceriaId', p.id,
      'parceiroNome', par.nome,
      'indicadorId', ind.id,
      'indicadorNome', ind.nome,
      'valorComissao', p.valor_comissao_indicador
    )), '[]'::jsonb) INTO v_section
    FROM parcerias p
    JOIN parceiros par ON par.id = p.parceiro_id
    JOIN indicacoes i ON i.parceiro_id = p.parceiro_id
    JOIN indicadores_referral ind ON ind.id = i.indicador_id
    WHERE p.workspace_id = p_workspace_id
      AND p.comissao_paga = false
      AND p.valor_comissao_indicador IS NOT NULL
      AND p.valor_comissao_indicador > 0;
    v_result := v_result || jsonb_build_object('comissoes_pendentes', v_section);

    -- 7. Parcerias encerramento (<=7 dias)
    SELECT COALESCE(jsonb_agg(sub.obj ORDER BY (sub.obj->>'diasRestantes')::int), '[]'::jsonb) INTO v_section
    FROM (
      SELECT jsonb_build_object(
        'id', p.id,
        'parceiro_id', p.parceiro_id,
        'parceiroNome', par.nome,
        'diasRestantes', (p.data_fim_prevista::date - v_hoje),
        'dataFim', p.data_fim_prevista,
        'dataInicio', p.data_inicio,
        'duracaoDias', p.duracao_dias,
        'valor_parceiro', COALESCE(p.valor_parceiro, 0),
        'valor_indicador', COALESCE(p.valor_indicador, 0),
        'valor_fornecedor', COALESCE(p.valor_fornecedor, 0),
        'origem_tipo', COALESCE(p.origem_tipo, 'DIRETO'),
        'fornecedor_id', p.fornecedor_id,
        'indicacao_id', p.indicacao_id,
        'elegivel_renovacao', COALESCE(p.elegivel_renovacao, true),
        'observacoes', p.observacoes,
        'status', p.status
      ) as obj
      FROM parcerias p
      JOIN parceiros par ON par.id = p.parceiro_id
      WHERE p.workspace_id = p_workspace_id
        AND p.status IN ('ATIVA', 'EM_ENCERRAMENTO')
        AND p.data_fim_prevista IS NOT NULL
        AND (p.data_fim_prevista::date - v_hoje) <= 7
    ) sub;
    v_result := v_result || jsonb_build_object('parcerias_encerramento', v_section);

    -- 8. Parceiros sem parceria
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
      'id', p.id, 'nome', p.nome, 'cpf', p.cpf, 'createdAt', p.created_at
    )), '[]'::jsonb) INTO v_section
    FROM parceiros p
    WHERE p.workspace_id = p_workspace_id
      AND p.status = 'ativo'
      AND NOT EXISTS (
        SELECT 1 FROM parcerias pa
        WHERE pa.parceiro_id = p.id AND pa.status IN ('ATIVA', 'EM_ENCERRAMENTO')
      );
    v_result := v_result || jsonb_build_object('parceiros_sem_parceria', v_section);

    -- 9. Alertas lucro
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
      'id', a.id, 'parceiro_id', a.parceiro_id,
      'parceiro_nome', par.nome,
      'marco_valor', a.marco_valor,
      'lucro_atual', a.lucro_atual,
      'data_atingido', a.data_atingido
    ) ORDER BY a.data_atingido DESC), '[]'::jsonb) INTO v_section
    FROM parceiro_lucro_alertas a
    JOIN parceiros par ON par.id = a.parceiro_id
    WHERE a.workspace_id = p_workspace_id
      AND a.notificado = false;
    v_result := v_result || jsonb_build_object('alertas_lucro', v_section);

  ELSE
    v_result := v_result || jsonb_build_object(
      'pagamentos_parceiros', '[]'::jsonb,
      'pagamentos_fornecedores', '[]'::jsonb,
      'bonus_pendentes', '[]'::jsonb,
      'comissoes_pendentes', '[]'::jsonb,
      'parcerias_encerramento', '[]'::jsonb,
      'parceiros_sem_parceria', '[]'::jsonb,
      'alertas_lucro', '[]'::jsonb
    );
  END IF;

  -- 10. Saques pendentes (enriched with JOINs)
  IF p_include_financial THEN
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
      'id', cl.id, 'valor', cl.valor, 'moeda', cl.moeda,
      'data_transacao', cl.data_transacao, 'descricao', cl.descricao,
      'origem_bookmaker_id', cl.origem_bookmaker_id,
      'destino_parceiro_id', cl.destino_parceiro_id,
      'destino_conta_bancaria_id', cl.destino_conta_bancaria_id,
      'destino_wallet_id', cl.destino_wallet_id,
      'coin', cl.coin, 'qtd_coin', cl.qtd_coin, 'cotacao', cl.cotacao,
      'moeda_origem', cl.moeda_origem, 'moeda_destino', cl.moeda_destino,
      'valor_origem', cl.valor_origem, 'valor_destino', cl.valor_destino,
      'projeto_id_snapshot', cl.projeto_id_snapshot,
      'bookmaker_nome', bk.nome,
      'parceiro_nome', par.nome,
      'banco_nome', cb.banco,
      'projeto_nome', proj.nome,
      'wallet_exchange', wc.exchange,
      'wallet_network', wc.network,
      'wallet_moedas', to_jsonb(wc.moeda)
    ) ORDER BY cl.data_transacao DESC), '[]'::jsonb) INTO v_section
    FROM cash_ledger cl
    LEFT JOIN bookmakers bk ON bk.id = cl.origem_bookmaker_id
    LEFT JOIN parceiros par ON par.id = cl.destino_parceiro_id
    LEFT JOIN contas_bancarias cb ON cb.id = cl.destino_conta_bancaria_id
    LEFT JOIN wallets_crypto wc ON wc.id = cl.destino_wallet_id
    LEFT JOIN projetos proj ON proj.id = bk.projeto_id
    WHERE cl.workspace_id = p_workspace_id
      AND cl.tipo_transacao = 'SAQUE'
      AND cl.status = 'PENDENTE';
    v_result := v_result || jsonb_build_object('saques_pendentes', v_section);
  ELSE
    v_result := v_result || jsonb_build_object('saques_pendentes', '[]'::jsonb);
  END IF;

  -- 11. Pagamentos operador
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'id', po.id, 'operador_id', po.operador_id,
    'operador_nome', COALESCE(op.nome, 'N/A'),
    'tipo_pagamento', po.tipo_pagamento,
    'valor', po.valor, 'data_pagamento', po.data_pagamento,
    'projeto_id', po.projeto_id,
    'projeto_nome', proj.nome
  ) ORDER BY po.data_pagamento DESC), '[]'::jsonb) INTO v_section
  FROM pagamentos_operador po
  LEFT JOIN operadores op ON op.id = po.operador_id
  LEFT JOIN projetos proj ON proj.id = po.projeto_id
  WHERE po.workspace_id = p_workspace_id
    AND po.status = 'PENDENTE'
    AND (v_operador_id IS NULL OR po.operador_id = v_operador_id);
  v_result := v_result || jsonb_build_object('pagamentos_operador', v_section);

  -- 12. Financial-only data
  IF p_include_financial THEN
    -- Participacoes
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
      'id', pc.id, 'projeto_id', pc.projeto_id, 'ciclo_id', pc.ciclo_id,
      'investidor_id', pc.investidor_id, 'percentual_aplicado', pc.percentual_aplicado,
      'base_calculo', pc.base_calculo, 'lucro_base', pc.lucro_base,
      'valor_participacao', pc.valor_participacao, 'data_apuracao', pc.data_apuracao,
      'investidor_nome', COALESCE(inv.nome, 'N/A'),
      'projeto_nome', COALESCE(proj.nome, 'N/A'),
      'ciclo_numero', COALESCE(ciclo.numero_ciclo, 0)
    )), '[]'::jsonb) INTO v_section
    FROM participacao_ciclos pc
    LEFT JOIN investidores inv ON inv.id = pc.investidor_id
    LEFT JOIN projetos proj ON proj.id = pc.projeto_id
    LEFT JOIN projeto_ciclos ciclo ON ciclo.id = pc.ciclo_id
    WHERE pc.workspace_id = p_workspace_id
      AND pc.status = 'A_PAGAR';
    v_result := v_result || jsonb_build_object('participacoes', v_section);

    -- Casas desvinculadas — view already filters by workspace via RLS
    SELECT COALESCE(jsonb_agg(row_to_json(t)), '[]'::jsonb) INTO v_section
    FROM v_bookmakers_desvinculados t;
    v_result := v_result || jsonb_build_object('casas_desvinculadas', v_section);

    -- Casas conciliacao — function receives workspace_id
    SELECT COALESCE(jsonb_agg(row_to_json(t)), '[]'::jsonb) INTO v_section
    FROM get_bookmakers_pendentes_conciliacao(p_workspace_id) t;
    v_result := v_result || jsonb_build_object('casas_conciliacao', v_section);
  ELSE
    v_result := v_result || jsonb_build_object(
      'participacoes', '[]'::jsonb,
      'casas_desvinculadas', '[]'::jsonb,
      'casas_conciliacao', '[]'::jsonb
    );
  END IF;

  -- 13. Propostas count
  SELECT COUNT(*)::int INTO v_section
  FROM pagamentos_propostos
  WHERE workspace_id = p_workspace_id
    AND status = 'PENDENTE';
  v_result := v_result || jsonb_build_object('propostas_count', v_section);

  -- Include operador_id for reference
  v_result := v_result || jsonb_build_object('operador_id', v_operador_id);

  RETURN v_result;
END;
$$;