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
SET search_path TO 'public'
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
        COALESCE(ic.qtd, 0) as qtd_parceiros,
        a.meta_parceiros,
        a.valor_bonus,
        COALESCE(bp.pagos, 0) as bonus_pagos
      FROM indicador_acordos a
      LEFT JOIN indicador_counts ic ON ic.indicador_id = a.indicador_id
      LEFT JOIN bonus_pagos bp ON bp.indicador_id = a.indicador_id
      WHERE a.ativo = true AND a.workspace_id = p_workspace_id
    )
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
      'indicadorId', c.indicador_id,
      'indicadorNome', c.indicador_nome,
      'valorBonus', c.valor_bonus,
      'qtdParceiros', c.qtd_parceiros,
      'meta', c.meta_parceiros,
      'ciclosPendentes', FLOOR(c.qtd_parceiros::numeric / NULLIF(c.meta_parceiros, 0))::int - c.bonus_pagos,
      'totalBonusPendente', (FLOOR(c.qtd_parceiros::numeric / NULLIF(c.meta_parceiros, 0))::int - c.bonus_pagos) * c.valor_bonus
    )), '[]'::jsonb) INTO v_section
    FROM computed c
    WHERE c.meta_parceiros > 0
      AND c.qtd_parceiros >= c.meta_parceiros
      AND (FLOOR(c.qtd_parceiros::numeric / NULLIF(c.meta_parceiros, 0))::int - c.bonus_pagos) > 0;
    v_result := v_result || jsonb_build_object('bonus_pendentes', v_section);

    -- 6. Comissões pendentes
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
      'parceriaId', p.id,
      'parceiroNome', par.nome,
      'indicadorId', ir.id,
      'indicadorNome', ir.nome,
      'valorComissao', p.valor_comissao_indicador
    )), '[]'::jsonb) INTO v_section
    FROM parcerias p
    JOIN parceiros par ON par.id = p.parceiro_id
    JOIN indicacoes ind ON ind.id = p.indicacao_id
    JOIN indicadores_referral ir ON ir.id = ind.indicador_id
    WHERE p.workspace_id = p_workspace_id
      AND p.status IN ('ATIVA', 'EM_ENCERRAMENTO')
      AND COALESCE(p.comissao_paga, false) = false
      AND COALESCE(p.valor_comissao_indicador, 0) > 0;
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
        WHERE pa.parceiro_id = p.id
          AND pa.status IN ('ATIVA', 'EM_ENCERRAMENTO')
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

  -- 9. Saques pendentes
  IF p_include_financial THEN
    SELECT COALESCE(jsonb_agg(row_to_json(t)), '[]'::jsonb) INTO v_section
    FROM v_saques_pendentes_confirmacao t
    WHERE t.workspace_id = p_workspace_id;
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

  -- 11. Pagamentos operador pendentes
  SELECT COALESCE(jsonb_agg(row_to_json(t)), '[]'::jsonb) INTO v_section
  FROM pagamentos_operador t
  WHERE t.status = 'PENDENTE'
    AND (
      NOT p_is_operator
      OR (v_operador_id IS NOT NULL AND t.operador_id = v_operador_id)
    );
  v_result := v_result || jsonb_build_object('pagamentos_operador', v_section);

  -- 12. Participações pendentes
  IF p_include_financial THEN
    SELECT COALESCE(jsonb_agg(row_to_json(t)), '[]'::jsonb) INTO v_section
    FROM v_participacoes_pendentes t
    WHERE t.workspace_id = p_workspace_id;
  ELSE
    v_section := '[]'::jsonb;
  END IF;
  v_result := v_result || jsonb_build_object('participacoes', v_section);

  -- 13. Casas desvinculadas
  IF p_include_financial THEN
    SELECT COALESCE(jsonb_agg(row_to_json(t)), '[]'::jsonb) INTO v_section
    FROM v_bookmakers_desvinculados t
    WHERE t.workspace_id = p_workspace_id;
  ELSE
    v_section := '[]'::jsonb;
  END IF;
  v_result := v_result || jsonb_build_object('casas_desvinculadas', v_section);

  -- 14. Casas pendentes de conciliação
  IF p_include_financial THEN
    SELECT COALESCE(jsonb_agg(row_to_json(t)), '[]'::jsonb) INTO v_section
    FROM get_bookmakers_pendentes_conciliacao(p_workspace_id) t;
  ELSE
    v_section := '[]'::jsonb;
  END IF;
  v_result := v_result || jsonb_build_object('casas_conciliacao', v_section);

  -- 15. Propostas pagamento count
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