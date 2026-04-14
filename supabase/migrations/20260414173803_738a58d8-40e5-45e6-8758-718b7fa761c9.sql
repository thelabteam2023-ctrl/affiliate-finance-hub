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
    SELECT COALESCE(jsonb_agg(row_to_json(t)), '[]'::jsonb) INTO v_section
    FROM v_painel_operacional t;
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
        COALESCE(ic.qtd, 0) as qtd_parceiros,
        a.meta_parceiros,
        a.valor_bonus,
        COALESCE(bp.pagos, 0) as bonus_pagos
      FROM indicador_acordos a
      JOIN indicador_counts ic ON ic.indicador_id = a.indicador_id
      LEFT JOIN bonus_pagos bp ON bp.indicador_id = a.indicador_id
      WHERE a.ativo = true
        AND a.workspace_id = p_workspace_id
    )
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
      'indicadorId', c.indicador_id,
      'indicadorNome', c.indicador_nome,
      'valorBonus', c.valor_bonus,
      'qtdParceiros', c.qtd_parceiros,
      'meta', c.meta_parceiros,
      'ciclosPendentes', GREATEST(0, FLOOR(c.qtd_parceiros::numeric / NULLIF(c.meta_parceiros, 0))::int - c.bonus_pagos),
      'totalBonusPendente', GREATEST(0, (FLOOR(c.qtd_parceiros::numeric / NULLIF(c.meta_parceiros, 0))::int - c.bonus_pagos)) * c.valor_bonus
    )), '[]'::jsonb) INTO v_section
    FROM computed c
    WHERE GREATEST(0, FLOOR(c.qtd_parceiros::numeric / NULLIF(c.meta_parceiros, 0))::int - c.bonus_pagos) > 0;
    v_result := v_result || jsonb_build_object('bonus_pendentes', v_section);

    -- 6. Comissoes pendentes (FIXED: indicadores_referral, not indicadores)
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
      'parceriaId', p.id,
      'parceiroNome', par.nome,
      'indicadorId', p.indicacao_id,
      'indicadorNome', COALESCE(ind.nome, 'Indicador'),
      'valorComissao', p.valor_indicador
    )), '[]'::jsonb) INTO v_section
    FROM parcerias p
    JOIN parceiros par ON par.id = p.parceiro_id
    LEFT JOIN indicadores_referral ind ON ind.id = p.indicacao_id
    WHERE p.workspace_id = p_workspace_id
      AND p.status IN ('ATIVA', 'EM_ENCERRAMENTO')
      AND p.indicacao_id IS NOT NULL
      AND p.valor_indicador > 0
      AND NOT EXISTS (
        SELECT 1 FROM movimentacoes_indicacao m
        WHERE m.parceria_id = p.id AND m.tipo = 'COMISSAO_INDICADOR' AND m.status = 'CONFIRMADO'
      );
    v_result := v_result || jsonb_build_object('comissoes_pendentes', v_section);
  END IF;

  -- 7. Parcerias encerrando
  IF p_include_partner THEN
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
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
      'origem_tipo', COALESCE(p.origem_tipo, 'INDICADOR'),
      'fornecedor_id', p.fornecedor_id,
      'indicacao_id', p.indicacao_id,
      'elegivel_renovacao', COALESCE(p.elegivel_renovacao, true),
      'observacoes', p.observacoes,
      'status', p.status
    )), '[]'::jsonb) INTO v_section
    FROM parcerias p
    JOIN parceiros par ON par.id = p.parceiro_id
    WHERE p.workspace_id = p_workspace_id
      AND p.status IN ('ATIVA', 'EM_ENCERRAMENTO')
      AND p.data_fim_prevista IS NOT NULL
      AND (p.data_fim_prevista::date - v_hoje) <= 30;
    v_result := v_result || jsonb_build_object('parcerias_encerramento', v_section);
  END IF;

  -- 8. Parceiros sem parceria
  IF p_include_partner THEN
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
      'parceiroId', par.id,
      'parceiroNome', par.nome,
      'parceiroEmail', par.email,
      'criado_em', par.created_at
    )), '[]'::jsonb) INTO v_section
    FROM parceiros par
    WHERE par.workspace_id = p_workspace_id
      AND par.status = 'ATIVO'
      AND NOT EXISTS (
        SELECT 1 FROM parcerias p
        WHERE p.parceiro_id = par.id AND p.status IN ('ATIVA', 'EM_ENCERRAMENTO')
      );
    v_result := v_result || jsonb_build_object('parceiros_sem_parceria', v_section);
  END IF;

  -- 9. Saques pendentes (confirmação)
  IF p_include_financial THEN
    SELECT COALESCE(jsonb_agg(row_to_json(sub)), '[]'::jsonb) INTO v_section
    FROM (
      SELECT
        cl.id,
        cl.valor,
        cl.moeda,
        cl.data_transacao,
        cl.origem_bookmaker_id,
        cl.destino_conta_bancaria_id,
        cl.destino_wallet_id,
        cl.coin,
        cl.valor_origem,
        cl.moeda_origem,
        cl.status,
        b.nome AS bookmaker_nome,
        bc.logo_url AS bookmaker_logo_url,
        par.nome AS parceiro_nome,
        banco.nome AS banco_nome,
        w.nome AS wallet_nome,
        w.exchange AS wallet_exchange,
        proj.nome AS projeto_nome
      FROM cash_ledger cl
      LEFT JOIN bookmakers b ON b.id = cl.origem_bookmaker_id
      LEFT JOIN bookmakers_catalogo bc ON bc.id = b.bookmaker_catalogo_id
      LEFT JOIN parceiros par ON par.id = b.parceiro_id
      LEFT JOIN bancos banco ON banco.id = cl.destino_conta_bancaria_id
      LEFT JOIN wallets w ON w.id = cl.destino_wallet_id
      LEFT JOIN projetos proj ON proj.id = b.projeto_id
      WHERE cl.workspace_id = p_workspace_id
        AND cl.tipo_transacao = 'SAQUE'
        AND cl.status = 'PENDENTE'
      ORDER BY cl.data_transacao DESC
    ) sub;
    v_result := v_result || jsonb_build_object('saques_pendentes', v_section);
  END IF;

  -- 10. Alertas de lucro por parceiro
  IF p_include_partner THEN
    SELECT COALESCE(jsonb_agg(row_to_json(sub)), '[]'::jsonb) INTO v_section
    FROM (
      SELECT
        par.id as parceiro_id,
        par.nome as parceiro_nome,
        COALESCE(SUM(au.lucro_prejuizo), 0) as lucro_total,
        COUNT(au.id) as total_apostas,
        COALESCE(SUM(au.stake), 0) as volume_total
      FROM parceiros par
      JOIN bookmakers b ON b.parceiro_id = par.id AND b.workspace_id = p_workspace_id
      JOIN apostas_unificada au ON au.bookmaker_id = b.id AND au.status = 'LIQUIDADA'
      WHERE par.workspace_id = p_workspace_id
        AND par.status = 'ATIVO'
      GROUP BY par.id, par.nome
      HAVING COALESCE(SUM(au.lucro_prejuizo), 0) > 0
    ) sub;
    v_result := v_result || jsonb_build_object('alertas_lucro', v_section);
  END IF;

  -- 11. Pagamentos operador pendentes
  SELECT COALESCE(jsonb_agg(row_to_json(sub)), '[]'::jsonb) INTO v_section
  FROM (
    SELECT
      po.id,
      po.operador_id,
      op.nome AS operador_nome,
      po.tipo_pagamento,
      po.valor,
      po.data_pagamento,
      po.projeto_id,
      proj.nome AS projeto_nome
    FROM pagamentos_operador po
    JOIN operadores op ON op.id = po.operador_id
    LEFT JOIN projetos proj ON proj.id = po.projeto_id
    WHERE po.workspace_id = p_workspace_id
      AND po.status = 'PENDENTE'
      AND (v_operator_projects IS NULL OR po.projeto_id = ANY(v_operator_projects))
    ORDER BY po.data_pagamento ASC
  ) sub;
  v_result := v_result || jsonb_build_object('pagamentos_operador', v_section);

  -- 12. Participações pendentes
  IF p_include_financial THEN
    SELECT COALESCE(jsonb_agg(row_to_json(sub)), '[]'::jsonb) INTO v_section
    FROM (
      SELECT
        pc.id,
        inv.nome AS investidor_nome,
        proj.nome AS projeto_nome,
        pc.ciclo_numero,
        pc.valor_participacao,
        pc.data_apuracao,
        pc.status
      FROM participacao_ciclos pc
      JOIN investidores inv ON inv.id = pc.investidor_id
      JOIN projetos proj ON proj.id = pc.projeto_id
      WHERE pc.workspace_id = p_workspace_id
        AND pc.status = 'PENDENTE'
      ORDER BY pc.data_apuracao ASC
    ) sub;
    v_result := v_result || jsonb_build_object('participacoes', v_section);
  END IF;

  -- 13. Casas desvinculadas (sem projeto)
  IF p_include_financial THEN
    SELECT COALESCE(jsonb_agg(row_to_json(sub)), '[]'::jsonb) INTO v_section
    FROM (
      SELECT
        b.id,
        b.nome,
        b.moeda,
        b.saldo_atual,
        b.status,
        b.estado_conta,
        bc.logo_url AS bookmaker_logo_url,
        par.nome AS parceiro_nome
      FROM bookmakers b
      LEFT JOIN bookmakers_catalogo bc ON bc.id = b.bookmaker_catalogo_id
      LEFT JOIN parceiros par ON par.id = b.parceiro_id
      WHERE b.workspace_id = p_workspace_id
        AND b.projeto_id IS NULL
        AND b.status NOT IN ('FECHADA', 'ARQUIVADA')
        AND b.saldo_atual > 0.5
        AND NOT EXISTS (
          SELECT 1 FROM bookmaker_unlinked_acks ack
          WHERE ack.bookmaker_id = b.id AND ack.workspace_id = p_workspace_id
        )
      ORDER BY b.saldo_atual DESC
    ) sub;
    v_result := v_result || jsonb_build_object('casas_desvinculadas', v_section);
  END IF;

  -- 14. Casas pendentes de conciliação
  IF p_include_financial THEN
    SELECT COALESCE(jsonb_agg(row_to_json(sub)), '[]'::jsonb) INTO v_section
    FROM (
      SELECT
        b.id AS bookmaker_id,
        b.nome AS bookmaker_nome,
        bc.logo_url AS bookmaker_logo_url,
        b.moeda,
        b.saldo_atual,
        b.projeto_id,
        proj.nome AS projeto_nome,
        par.nome AS parceiro_nome,
        COUNT(cl.id)::int AS qtd_transacoes_pendentes,
        COALESCE(SUM(ABS(cl.valor)), 0) AS valor_total_pendente
      FROM bookmakers b
      LEFT JOIN bookmakers_catalogo bc ON bc.id = b.bookmaker_catalogo_id
      LEFT JOIN parceiros par ON par.id = b.parceiro_id
      LEFT JOIN projetos proj ON proj.id = b.projeto_id
      LEFT JOIN cash_ledger cl ON (cl.origem_bookmaker_id = b.id OR cl.destino_bookmaker_id = b.id)
        AND cl.status = 'PENDENTE'
        AND cl.workspace_id = p_workspace_id
      WHERE b.workspace_id = p_workspace_id
        AND b.projeto_id IS NULL
        AND b.status NOT IN ('FECHADA', 'ARQUIVADA')
      GROUP BY b.id, b.nome, bc.logo_url, b.moeda, b.saldo_atual, b.projeto_id, proj.nome, par.nome
      HAVING COUNT(cl.id) > 0
      ORDER BY COUNT(cl.id) DESC
    ) sub;
    v_result := v_result || jsonb_build_object('casas_conciliacao', v_section);
  END IF;

  -- 15. Propostas de pagamento count
  IF p_include_financial THEN
    SELECT COUNT(*)::int INTO v_count
    FROM propostas_pagamento
    WHERE workspace_id = p_workspace_id
      AND status = 'PENDENTE';
    v_result := v_result || jsonb_build_object('propostas_count', v_count);
  END IF;

  RETURN v_result;
END;
$$;