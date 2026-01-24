-- Corrigir a view para usar security_invoker ao invés de security_definer
DROP VIEW IF EXISTS public.v_bookmaker_resultado_operacional;

CREATE OR REPLACE VIEW public.v_bookmaker_resultado_operacional
WITH (security_invoker = on)
AS
SELECT 
  b.id as bookmaker_id,
  b.nome as bookmaker_nome,
  b.moeda,
  b.workspace_id,
  b.projeto_id,
  b.parceiro_id,
  -- Resultado de apostas apenas
  COALESCE((
    SELECT SUM(COALESCE(a.pl_consolidado, a.lucro_prejuizo))
    FROM apostas_unificada a
    WHERE a.bookmaker_id = b.id
      AND a.status = 'LIQUIDADA'
      AND a.resultado IS NOT NULL
  ), 0) as resultado_apostas,
  -- Resultado de pernas (para Surebets)
  COALESCE((
    SELECT SUM(ap.lucro_prejuizo)
    FROM apostas_pernas ap
    WHERE ap.bookmaker_id = b.id
      AND ap.resultado IS NOT NULL
  ), 0) as resultado_pernas,
  -- Giros grátis
  COALESCE((
    SELECT SUM(gg.valor_retorno)
    FROM giros_gratis gg
    WHERE gg.bookmaker_id = b.id
      AND gg.status = 'confirmado'
  ), 0) as resultado_giros,
  -- Cashback
  COALESCE((
    SELECT SUM(cm.valor)
    FROM cashback_manual cm
    WHERE cm.bookmaker_id = b.id
  ), 0) as resultado_cashback,
  -- Total operacional (SEM FX, SEM depósitos/saques)
  COALESCE((
    SELECT SUM(COALESCE(a.pl_consolidado, a.lucro_prejuizo))
    FROM apostas_unificada a
    WHERE a.bookmaker_id = b.id
      AND a.status = 'LIQUIDADA'
      AND a.resultado IS NOT NULL
  ), 0) +
  COALESCE((
    SELECT SUM(gg.valor_retorno)
    FROM giros_gratis gg
    WHERE gg.bookmaker_id = b.id
      AND gg.status = 'confirmado'
  ), 0) +
  COALESCE((
    SELECT SUM(cm.valor)
    FROM cashback_manual cm
    WHERE cm.bookmaker_id = b.id
  ), 0) as resultado_operacional_total,
  -- Contadores
  (
    SELECT COUNT(*)
    FROM apostas_unificada a
    WHERE a.bookmaker_id = b.id
      AND a.status = 'LIQUIDADA'
  ) as qtd_apostas,
  (
    SELECT COUNT(*)
    FROM apostas_unificada a
    WHERE a.bookmaker_id = b.id
      AND a.status = 'LIQUIDADA'
      AND a.resultado IN ('GREEN', 'MEIO_GREEN')
  ) as qtd_greens,
  (
    SELECT COUNT(*)
    FROM apostas_unificada a
    WHERE a.bookmaker_id = b.id
      AND a.status = 'LIQUIDADA'
      AND a.resultado IN ('RED', 'MEIO_RED')
  ) as qtd_reds
FROM bookmakers b
WHERE b.status IN ('ativo', 'limitada', 'bloqueada', 'pausada');

COMMENT ON VIEW public.v_bookmaker_resultado_operacional IS 
'View de resultado operacional por bookmaker. Mostra apenas performance de apostas, 
excluindo movimentações financeiras (depósitos, saques, FX, ajustes).';