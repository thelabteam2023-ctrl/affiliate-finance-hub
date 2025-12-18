-- Fix workspace data leakage in Programa de Indicação (Captação)

-- 1) Recreate view v_custos_aquisicao with workspace scoping
CREATE OR REPLACE VIEW public.v_custos_aquisicao AS
SELECT
  p.user_id,
  p.id AS parceria_id,
  p.parceiro_id,
  par.nome AS parceiro_nome,
  p.origem_tipo,
  p.data_inicio,
  p.status,
  p.indicacao_id,
  ind.indicador_id,
  ir.nome AS indicador_nome,
  p.valor_indicador,
  p.valor_parceiro,
  p.fornecedor_id,
  f.nome AS fornecedor_nome,
  p.valor_fornecedor,
  (
    COALESCE(p.valor_indicador, 0::numeric)
    + COALESCE(p.valor_parceiro, 0::numeric)
    + COALESCE(p.valor_fornecedor, 0::numeric)
  ) AS custo_total
FROM public.parcerias p
LEFT JOIN public.parceiros par ON p.parceiro_id = par.id
LEFT JOIN public.indicacoes ind ON p.indicacao_id = ind.id
LEFT JOIN public.indicadores_referral ir ON ind.indicador_id = ir.id
LEFT JOIN public.fornecedores f ON p.fornecedor_id = f.id
WHERE (
  p.workspace_id = public.get_current_workspace()
  OR (p.workspace_id IS NULL AND p.user_id = auth.uid())
);

-- 2) Recreate view v_parcerias_alerta with workspace scoping
CREATE OR REPLACE VIEW public.v_parcerias_alerta AS
SELECT
  p.id,
  p.user_id,
  p.parceiro_id,
  p.indicacao_id,
  p.data_inicio,
  p.duracao_dias,
  p.data_fim_prevista,
  p.data_fim_real,
  p.valor_comissao_indicador,
  p.comissao_paga,
  p.status,
  p.elegivel_renovacao,
  p.observacoes,
  par.nome AS parceiro_nome,
  par.cpf AS parceiro_cpf,
  i.nome AS indicador_nome,
  (p.data_fim_prevista - CURRENT_DATE) AS dias_restantes,
  CASE
    WHEN ((p.data_fim_prevista - CURRENT_DATE) <= 0) THEN 'VENCIDA'::text
    WHEN ((p.data_fim_prevista - CURRENT_DATE) <= 10) THEN 'ALERTA'::text
    WHEN ((p.data_fim_prevista - CURRENT_DATE) <= 20) THEN 'ATENCAO'::text
    ELSE 'OK'::text
  END AS nivel_alerta
FROM public.parcerias p
JOIN public.parceiros par ON p.parceiro_id = par.id
LEFT JOIN public.indicacoes ind ON p.indicacao_id = ind.id
LEFT JOIN public.indicadores_referral i ON ind.indicador_id = i.id
WHERE
  p.user_id = auth.uid()
  AND (p.status = ANY (ARRAY['ATIVA'::text, 'EM_ENCERRAMENTO'::text]))
  AND (
    p.workspace_id = public.get_current_workspace()
    OR (p.workspace_id IS NULL AND p.user_id = auth.uid())
  );

-- 3) Create workspace-scoped helper views to avoid client-side leakage
CREATE OR REPLACE VIEW public.v_movimentacoes_indicacao_workspace AS
SELECT
  m.*
FROM public.movimentacoes_indicacao m
JOIN public.parcerias p ON p.id = m.parceria_id
WHERE (
  p.workspace_id = public.get_current_workspace()
  OR (p.workspace_id IS NULL AND p.user_id = auth.uid())
);

CREATE OR REPLACE VIEW public.v_indicacoes_workspace AS
SELECT
  ind.*
FROM public.indicacoes ind
JOIN public.parceiros par ON par.id = ind.parceiro_id
WHERE (
  par.workspace_id = public.get_current_workspace()
  OR (par.workspace_id IS NULL AND par.user_id = auth.uid())
);

-- 4) Recreate v_indicador_performance with workspace scoping (keeps per-user behavior)
CREATE OR REPLACE VIEW public.v_indicador_performance AS
SELECT
  i.id AS indicador_id,
  i.user_id,
  i.nome,
  i.cpf,
  i.status,
  i.telefone,
  i.email,

  COALESCE(
    (
      SELECT COUNT(DISTINCT ind.parceiro_id)
      FROM public.indicacoes ind
      JOIN public.parceiros par ON par.id = ind.parceiro_id
      WHERE
        ind.indicador_id = i.id
        AND ind.user_id = i.user_id
        AND (
          par.workspace_id = public.get_current_workspace()
          OR (par.workspace_id IS NULL AND par.user_id = auth.uid())
        )
    ),
    0::bigint
  ) AS total_parceiros_indicados,

  COALESCE(
    (
      SELECT COUNT(DISTINCT p.id)
      FROM public.indicacoes ind
      JOIN public.parcerias p ON ind.id = p.indicacao_id
      WHERE
        ind.indicador_id = i.id
        AND ind.user_id = i.user_id
        AND p.status = 'ATIVA'::text
        AND (
          p.workspace_id = public.get_current_workspace()
          OR (p.workspace_id IS NULL AND p.user_id = auth.uid())
        )
    ),
    0::bigint
  ) AS parcerias_ativas,

  COALESCE(
    (
      SELECT COUNT(DISTINCT p.id)
      FROM public.indicacoes ind
      JOIN public.parcerias p ON ind.id = p.indicacao_id
      WHERE
        ind.indicador_id = i.id
        AND ind.user_id = i.user_id
        AND p.status = 'ENCERRADA'::text
        AND (
          p.workspace_id = public.get_current_workspace()
          OR (p.workspace_id IS NULL AND p.user_id = auth.uid())
        )
    ),
    0::bigint
  ) AS parcerias_encerradas,

  COALESCE(
    (
      SELECT SUM(m.valor)
      FROM public.v_movimentacoes_indicacao_workspace m
      WHERE
        m.indicador_id = i.id
        AND m.user_id = i.user_id
        AND m.tipo = 'COMISSAO_INDICADOR'::text
        AND m.status = 'CONFIRMADO'::text
    ),
    0::numeric
  ) AS total_comissoes,

  COALESCE(
    (
      SELECT SUM(m.valor)
      FROM public.v_movimentacoes_indicacao_workspace m
      WHERE
        m.indicador_id = i.id
        AND m.user_id = i.user_id
        AND m.tipo = 'BONUS_INDICADOR'::text
        AND m.status = 'CONFIRMADO'::text
    ),
    0::numeric
  ) AS total_bonus

FROM public.indicadores_referral i
WHERE
  i.user_id = auth.uid()
  AND (
    i.workspace_id = public.get_current_workspace()
    OR (i.workspace_id IS NULL AND i.user_id = auth.uid())
  );
