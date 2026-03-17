
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
  v_count int;
BEGIN
  IF p_is_operator THEN
    SELECT id INTO v_operador_id FROM operadores WHERE auth_user_id = p_user_id LIMIT 1;
    IF v_operador_id IS NOT NULL THEN
      SELECT array_agg(projeto_id) INTO v_operator_projects
      FROM operador_projetos
      WHERE operador_id = v_operador_id AND status = 'ATIVO';
    END IF;
  END IF;

  -- 1. Alertas
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

  IF p_include_partner THEN
    -- 3. Pagamentos parceiros
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

    -- 4. Pagamentos fornecedores
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

    -- 5. Bonus pendentes
    WITH indicador_counts AS (
      SELECT vca.indicador_id, MIN(vca.indicador_nome) as indicador_nome, COUNT(*)::int as qtd
      FROM v_custos_aquisicao vca
      WHERE vca.indicador_id IS NOT NULL AND vca.indicador_nome IS NOT NULL
      GROUP BY vca.indicador_id
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
        COALESCE(bp.pagos, 0) as bonus_pagos
      FROM indicador_acordos a
      JOIN indicador_counts ic ON ic.indicador_id = a.indicador_id
      LEFT JOIN bonus_pagos bp ON bp.indicador_id = a.indicador_id
      WHERE a.ativo = true AND a.workspace_id = p_workspace_id
    )
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
      'indicadorId', c.indicador_id,
      'indicadorNome', c.indicador_nome,
      'valorBonus', c.valor_bonus,
      'qtdParceiros', c.qtd_parceiros,
      'metaParceiros', c.meta_parceiros,
      'bonusPagos', c.bonus_pagos
    )), '[]'::jsonb) INTO v_section
    FROM computed c
    WHERE c.qtd_parceiros >= c.meta_parceiros AND c.bonus_pagos = 0;
    v_result := v_result || jsonb_build_object('bonus_pendentes', v_section);

    -- 6. Comissões pendentes (fixed: indicadores_referral)
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
      'indicadorId', i.id,
      'indicadorNome', i.nome,
      'percentualComissao', a.percentual_comissao,
      'metaParceiros', a.meta_parceiros,
      'qtdParceiros', (SELECT COUNT(*)::int FROM v_custos_aquisicao vca WHERE vca.indicador_id = i.id),
      'totalComissoesPagas', COALESCE((
        SELECT SUM(m.valor) FROM movimentacoes_indicacao m
        WHERE m.indicador_id = i.id AND m.tipo = 'COMISSAO_INDICADOR' AND m.status = 'CONFIRMADO'
      ), 0),
      'totalValorParceiros', COALESCE((
        SELECT SUM(pa.valor_parceiro) FROM parcerias pa
        WHERE pa.indicador_id = i.id AND pa.status IN ('ATIVA', 'EM_ENCERRAMENTO')
      ), 0)
    )), '[]'::jsonb) INTO v_section
    FROM indicador_acordos a
    JOIN indicadores_referral i ON i.id = a.indicador_id
    WHERE a.ativo = true AND a.workspace_id = p_workspace_id
      AND a.percentual_comissao > 0;
    v_result := v_result || jsonb_build_object('comissoes_pendentes', v_section);

    -- 7. Parcerias em encerramento
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
      'parceriaId', p.id,
      'parceiroNome', par.nome,
      'dataFimPrevista', p.data_fim_prevista,
      'diasRestantes', COALESCE((p.data_fim_prevista::date - v_hoje), 999),
      'parceiroId', p.parceiro_id,
      'workspaceId', p.workspace_id
    )), '[]'::jsonb) INTO v_section
    FROM parcerias p
    JOIN parceiros par ON par.id = p.parceiro_id
    WHERE p.workspace_id = p_workspace_id
      AND p.status IN ('ATIVA', 'EM_ENCERRAMENTO')
      AND p.data_fim_prevista IS NOT NULL
      AND (p.data_fim_prevista::date - v_hoje) BETWEEN 0 AND 30;
    v_result := v_result || jsonb_build_object('parcerias_encerramento', v_section);

    -- 8. Parceiros sem parceria (excluding Caixa Operacional)
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
      'id', p.id, 'nome', p.nome, 'cpf', p.cpf, 'createdAt', p.created_at
    )), '[]'::jsonb) INTO v_section
    FROM parceiros p
    WHERE p.workspace_id = p_workspace_id
      AND p.status = 'ativo'
      AND p.is_caixa_operacional = false
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

  -- 10. Saques pendentes
  IF p_include_financial THEN
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
      'id', cl.id, 'valor', cl.valor, 'moeda', cl.moeda,
      'data_transacao', cl.data_transacao, 'descricao', cl.descricao,
      'origem_bookmaker_id', cl.origem_bookmaker_id,
      'destino_parceiro_id', cl.destino_parceiro_id,
      'destino_conta_bancaria_id', cl.destino_conta_bancaria_id,
      'destino_wallet_id', cl.destino_wallet_id,
      'coin', cl.coin, 'qtd_coin', cl.qtd_coin, 'cotacao', cl.cotacao,
      'bookmaker_nome', COALESCE(b.nome, 'Bookmaker'),
      'parceiro_nome', COALESCE(par.nome, ''),
      'banco_nome', COALESCE(ba.nome, ''),
      'wallet_coin', wc.coin,
      'wallet_network', wc.network
    ) ORDER BY cl.data_transacao DESC), '[]'::jsonb) INTO v_section
    FROM cash_ledger cl
    LEFT JOIN bookmakers b ON b.id = cl.origem_bookmaker_id
    LEFT JOIN parceiros par ON par.id = cl.destino_parceiro_id
    LEFT JOIN contas_bancarias cb ON cb.id = cl.destino_conta_bancaria_id
    LEFT JOIN bancos ba ON ba.id = cb.banco_id
    LEFT JOIN wallets_crypto wc ON wc.id = cl.destino_wallet_id
    WHERE cl.workspace_id = p_workspace_id
      AND cl.tipo_transacao = 'SAQUE'
      AND cl.status = 'PENDENTE';
    v_result := v_result || jsonb_build_object('saques_pendentes', v_section);
  ELSE
    v_result := v_result || jsonb_build_object('saques_pendentes', '[]'::jsonb);
  END IF;

  -- 11. Pagamentos operador pendentes
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'id', po.id,
    'operador_id', po.operador_id,
    'operador_nome', o.nome,
    'projeto_id', po.projeto_id,
    'projeto_nome', pr.nome,
    'tipo', po.tipo,
    'valor', po.valor,
    'moeda', COALESCE(po.moeda, 'BRL'),
    'referencia_mes', po.referencia_mes,
    'status', po.status,
    'created_at', po.created_at
  ) ORDER BY po.created_at DESC), '[]'::jsonb) INTO v_section
  FROM pagamentos_operador po
  JOIN operadores o ON o.id = po.operador_id
  JOIN projetos pr ON pr.id = po.projeto_id
  WHERE po.workspace_id = p_workspace_id
    AND po.status = 'PENDENTE'
    AND (v_operator_projects IS NULL OR po.projeto_id = ANY(v_operator_projects));
  v_result := v_result || jsonb_build_object('pagamentos_operador', v_section);

  -- 12. Participações investidor pendentes
  IF p_include_financial THEN
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
      'id', pi.id,
      'investidor_id', pi.investidor_id,
      'investidor_nome', inv.nome,
      'projeto_id', pi.projeto_id,
      'projeto_nome', pr.nome,
      'valor', pi.valor,
      'moeda', COALESCE(pi.moeda, 'BRL'),
      'referencia_mes', pi.referencia_mes,
      'status', pi.status,
      'created_at', pi.created_at
    ) ORDER BY pi.created_at DESC), '[]'::jsonb) INTO v_section
    FROM participacoes_investidor pi
    JOIN investidores inv ON inv.id = pi.investidor_id
    JOIN projetos pr ON pr.id = pi.projeto_id
    WHERE pi.workspace_id = p_workspace_id
      AND pi.status = 'PENDENTE';
    v_result := v_result || jsonb_build_object('participacoes_pendentes', v_section);
  ELSE
    v_result := v_result || jsonb_build_object('participacoes_pendentes', '[]'::jsonb);
  END IF;

  -- 13. Casas desvinculadas
  IF p_include_financial THEN
    SELECT COUNT(*)::int INTO v_count FROM v_bookmakers_desvinculados;
    v_result := v_result || jsonb_build_object('casas_desvinculadas_count', v_count);
  ELSE
    v_result := v_result || jsonb_build_object('casas_desvinculadas_count', 0);
  END IF;

  -- 14. Propostas de pagamento pendentes
  SELECT COUNT(*)::int INTO v_count
  FROM pagamentos_propostos
  WHERE workspace_id = p_workspace_id AND status = 'PENDENTE';
  v_result := v_result || jsonb_build_object('propostas_pagamento_count', v_count);

  -- 15. Casas pendentes de conciliação
  IF p_include_financial THEN
    SELECT COALESCE(jsonb_agg(row_to_json(t)), '[]'::jsonb) INTO v_section
    FROM (
      SELECT * FROM get_bookmakers_pendentes_conciliacao(p_workspace_id)
    ) t;
    v_result := v_result || jsonb_build_object('casas_pendentes_conciliacao', v_section);
  ELSE
    v_result := v_result || jsonb_build_object('casas_pendentes_conciliacao', '[]'::jsonb);
  END IF;

  RETURN v_result;
END;
$$;
