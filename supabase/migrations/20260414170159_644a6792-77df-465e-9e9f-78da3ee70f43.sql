
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
AS $function$
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
      WHERE a.workspace_id = p_workspace_id
        AND a.ativo = true
    )
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
      'id', c.indicador_id,
      'indicadorNome', c.indicador_nome,
      'qtdParceiros', c.qtd_parceiros,
      'metaParceiros', c.meta_parceiros,
      'valorBonus', c.valor_bonus,
      'bonusPagos', c.bonus_pagos
    )), '[]'::jsonb) INTO v_section
    FROM computed c
    WHERE c.qtd_parceiros >= c.meta_parceiros
      AND c.bonus_pagos = 0;
    v_result := v_result || jsonb_build_object('bonus_pendentes', v_section);

    -- 6. Comissões pendentes
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
      'parceriaId', p.id,
      'parceiroNome', par.nome,
      'indicadorNome', ir.nome,
      'valorComissao', p.valor_comissao_indicador
    )), '[]'::jsonb) INTO v_section
    FROM parcerias p
    JOIN parceiros par ON par.id = p.parceiro_id
    LEFT JOIN indicadores_referral ir ON ir.id = p.indicacao_id
    WHERE p.workspace_id = p_workspace_id
      AND p.status IN ('ATIVA', 'EM_ENCERRAMENTO')
      AND p.indicacao_id IS NOT NULL
      AND COALESCE(p.valor_comissao_indicador, 0) > 0
      AND COALESCE(p.comissao_paga, false) = false
      AND NOT EXISTS (
        SELECT 1 FROM movimentacoes_indicacao m
        WHERE m.parceria_id = p.id
          AND m.tipo IN ('COMISSAO', 'COMISSAO_INDICADOR')
          AND m.status = 'CONFIRMADO'
      );
    v_result := v_result || jsonb_build_object('comissoes_pendentes', v_section);

    -- 7. Parcerias encerramento (≤ 10 dias)
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
      'id', p.id,
      'parceiro_id', p.parceiro_id,
      'parceiroNome', par.nome,
      'diasRestantes', COALESCE((p.data_fim_prevista::date - v_hoje), 999),
      'dataFim', p.data_fim_prevista,
      'dataInicio', p.data_inicio,
      'duracaoDias', p.duracao_dias,
      'valor_parceiro', p.valor_parceiro,
      'valor_indicador', COALESCE(p.valor_comissao_indicador, 0),
      'valor_fornecedor', COALESCE(p.valor_fornecedor, 0),
      'origem_tipo', COALESCE(p.origem_tipo, 'INDICADOR'),
      'fornecedor_id', p.fornecedor_id,
      'indicacao_id', p.indicacao_id,
      'elegivel_renovacao', COALESCE(p.elegivel_renovacao, false),
      'observacoes', p.observacoes,
      'status', p.status
    )), '[]'::jsonb) INTO v_section
    FROM parcerias p
    JOIN parceiros par ON par.id = p.parceiro_id
    WHERE p.workspace_id = p_workspace_id
      AND p.status IN ('ATIVA', 'EM_ENCERRAMENTO')
      AND p.data_fim_prevista IS NOT NULL
      AND (p.data_fim_prevista::date - v_hoje) <= 10;
    v_result := v_result || jsonb_build_object('parcerias_encerramento', v_section);

    -- 8. Parceiros sem origem
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
      'id', par.id,
      'nome', par.nome,
      'cpf', par.cpf,
      'createdAt', par.created_at
    )), '[]'::jsonb) INTO v_section
    FROM parceiros par
    WHERE par.workspace_id = p_workspace_id
      AND par.status = 'ativo'
      AND par.is_caixa_operacional = false
      AND NOT EXISTS (
        SELECT 1 FROM parcerias p
        WHERE p.parceiro_id = par.id
          AND (
            p.indicacao_id IS NOT NULL
            OR p.fornecedor_id IS NOT NULL
            OR p.origem_tipo IS NOT NULL
          )
      );
    v_result := v_result || jsonb_build_object('parceiros_sem_parceria', v_section);
  ELSE
    v_result := v_result
      || jsonb_build_object('pagamentos_parceiros', '[]'::jsonb)
      || jsonb_build_object('pagamentos_fornecedores', '[]'::jsonb)
      || jsonb_build_object('bonus_pendentes', '[]'::jsonb)
      || jsonb_build_object('comissoes_pendentes', '[]'::jsonb)
      || jsonb_build_object('parcerias_encerramento', '[]'::jsonb)
      || jsonb_build_object('parceiros_sem_parceria', '[]'::jsonb);
  END IF;

  -- 9. Saques pendentes (with bookmaker_logo_url)
  IF p_include_financial THEN
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
      'id', cl.id,
      'valor', cl.valor,
      'moeda', cl.moeda,
      'data_transacao', cl.data_transacao,
      'descricao', cl.descricao,
      'origem_bookmaker_id', cl.origem_bookmaker_id,
      'destino_parceiro_id', cl.destino_parceiro_id,
      'destino_conta_bancaria_id', cl.destino_conta_bancaria_id,
      'destino_wallet_id', cl.destino_wallet_id,
      'bookmaker_nome', bm.nome,
      'bookmaker_logo_url', bc.logo_url,
      'parceiro_nome', par.nome,
      'banco_nome', b.nome,
      'wallet_exchange', wc.exchange,
      'wallet_network', wc.network,
      'wallet_moedas', wc.moeda,
      'projeto_nome', pr.nome,
      'coin', cl.coin,
      'qtd_coin', cl.qtd_coin,
      'cotacao', cl.cotacao,
      'moeda_origem', cl.moeda_origem,
      'moeda_destino', cl.moeda_destino,
      'valor_origem', cl.valor_origem,
      'valor_destino', cl.valor_destino,
      'projeto_id_snapshot', cl.projeto_id_snapshot
    )), '[]'::jsonb) INTO v_section
    FROM cash_ledger cl
    LEFT JOIN bookmakers bm ON bm.id = cl.origem_bookmaker_id
    LEFT JOIN bookmakers_catalogo bc ON bc.id = bm.bookmaker_catalogo_id
    LEFT JOIN parceiros par ON par.id = cl.destino_parceiro_id
    LEFT JOIN bancos b ON b.id = cl.destino_conta_bancaria_id
    LEFT JOIN wallets_crypto wc ON wc.id = cl.destino_wallet_id
    LEFT JOIN projetos pr ON pr.id = cl.projeto_id_snapshot
    WHERE cl.workspace_id = p_workspace_id
      AND cl.tipo_transacao = 'SAQUE'
      AND cl.status = 'PENDENTE';
  ELSE
    v_section := '[]'::jsonb;
  END IF;
  v_result := v_result || jsonb_build_object('saques_pendentes', v_section);

  -- 10. Alertas lucro parceiro
  IF p_include_partner THEN
    SELECT COALESCE(jsonb_agg(row_to_json(t)), '[]'::jsonb) INTO v_section
    FROM parceiro_lucro_alertas t
    WHERE t.notificado = false
      AND t.workspace_id = p_workspace_id;
  ELSE
    v_section := '[]'::jsonb;
  END IF;
  v_result := v_result || jsonb_build_object('alertas_lucro', v_section);

  -- 11. Pagamentos operador pendentes (ORIGINAL: with operator filter)
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'id', po.id,
    'operador_id', po.operador_id,
    'operador_nome', op.nome,
    'tipo_pagamento', po.tipo_pagamento,
    'valor', po.valor,
    'data_pagamento', po.data_pagamento,
    'projeto_id', po.projeto_id,
    'projeto_nome', pr.nome
  )), '[]'::jsonb) INTO v_section
  FROM pagamentos_operador po
  LEFT JOIN operadores op ON op.id = po.operador_id
  LEFT JOIN projetos pr ON pr.id = po.projeto_id
  WHERE po.workspace_id = p_workspace_id
    AND po.status = 'PENDENTE'
    AND (
      NOT p_is_operator
      OR (v_operador_id IS NOT NULL AND po.operador_id = v_operador_id)
    );
  v_result := v_result || jsonb_build_object('pagamentos_operador', v_section);

  -- 12. Participações pendentes (ONLY external investors)
  IF p_include_financial THEN
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
      'id', pc.id,
      'projeto_id', pc.projeto_id,
      'ciclo_id', pc.ciclo_id,
      'investidor_id', pc.investidor_id,
      'percentual_aplicado', pc.percentual_aplicado,
      'base_calculo', pc.base_calculo,
      'lucro_base', pc.lucro_base,
      'valor_participacao', pc.valor_participacao,
      'data_apuracao', pc.data_apuracao,
      'investidor_nome', inv.nome,
      'investidor_tipo', inv.tipo,
      'projeto_nome', pr.nome,
      'ciclo_numero', cyc.numero_ciclo
    )), '[]'::jsonb) INTO v_section
    FROM participacao_ciclos pc
    JOIN investidores inv ON inv.id = pc.investidor_id
    LEFT JOIN projetos pr ON pr.id = pc.projeto_id
    LEFT JOIN projeto_ciclos cyc ON cyc.id = pc.ciclo_id
    WHERE pc.workspace_id = p_workspace_id
      AND pc.status = 'A_PAGAR'
      AND inv.tipo = 'externo';
  ELSE
    v_section := '[]'::jsonb;
  END IF;
  v_result := v_result || jsonb_build_object('participacoes', v_section);

  -- 13. Casas desvinculadas (using view)
  IF p_include_financial THEN
    SELECT COALESCE(jsonb_agg(row_to_json(t)), '[]'::jsonb) INTO v_section
    FROM v_bookmakers_desvinculados t
    WHERE t.workspace_id = p_workspace_id;
  ELSE
    v_section := '[]'::jsonb;
  END IF;
  v_result := v_result || jsonb_build_object('casas_desvinculadas', v_section);

  -- 14. Casas pendentes de conciliação (using function)
  IF p_include_financial THEN
    SELECT COALESCE(jsonb_agg(row_to_json(t)), '[]'::jsonb) INTO v_section
    FROM get_bookmakers_pendentes_conciliacao(p_workspace_id) t;
  ELSE
    v_section := '[]'::jsonb;
  END IF;
  v_result := v_result || jsonb_build_object('casas_conciliacao', v_section);

  -- 15. Propostas pagamento count (using correct table)
  SELECT COUNT(*)::int INTO v_count
  FROM pagamentos_propostos pp
  WHERE pp.status = 'PENDENTE'
    AND (
      NOT p_is_operator
      OR (v_operator_projects IS NOT NULL AND pp.projeto_id = ANY(v_operator_projects))
    );
  v_result := v_result || jsonb_build_object('propostas_count', v_count);

  RETURN v_result;
END;
$function$;
