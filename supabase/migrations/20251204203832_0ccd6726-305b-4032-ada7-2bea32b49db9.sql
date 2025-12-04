-- Recriar a view com SECURITY INVOKER para corrigir o warning
DROP VIEW IF EXISTS public.v_projeto_apostas_resumo;

CREATE OR REPLACE VIEW public.v_projeto_apostas_resumo 
WITH (security_invoker = true)
AS
SELECT 
  p.id as projeto_id,
  p.user_id,
  COUNT(a.id) as total_apostas,
  COUNT(CASE WHEN a.status = 'PENDENTE' THEN 1 END) as apostas_pendentes,
  COUNT(CASE WHEN a.status = 'REALIZADA' THEN 1 END) as apostas_realizadas,
  COUNT(CASE WHEN a.status = 'CONCLUIDA' THEN 1 END) as apostas_concluidas,
  COUNT(CASE WHEN a.resultado = 'GREEN' THEN 1 END) as greens,
  COUNT(CASE WHEN a.resultado = 'RED' THEN 1 END) as reds,
  COUNT(CASE WHEN a.resultado = 'VOID' THEN 1 END) as voids,
  COALESCE(SUM(a.stake), 0) as total_stake,
  COALESCE(SUM(a.lucro_prejuizo), 0) as lucro_total,
  CASE WHEN SUM(a.stake) > 0 THEN (SUM(a.lucro_prejuizo) / SUM(a.stake)) * 100 ELSE 0 END as roi_percentual
FROM public.projetos p
LEFT JOIN public.apostas a ON p.id = a.projeto_id
WHERE p.user_id = auth.uid()
GROUP BY p.id, p.user_id;