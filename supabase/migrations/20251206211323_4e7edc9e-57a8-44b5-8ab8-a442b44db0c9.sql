-- Drop and recreate the view to include MEIO_GREEN and MEIO_RED counts
DROP VIEW IF EXISTS v_projeto_apostas_resumo;

CREATE VIEW v_projeto_apostas_resumo AS
SELECT 
  p.id as projeto_id,
  COUNT(a.id) as total_apostas,
  COUNT(CASE WHEN a.status = 'PENDENTE' THEN 1 END) as apostas_pendentes,
  COUNT(CASE WHEN a.resultado = 'GREEN' THEN 1 END) as greens,
  COUNT(CASE WHEN a.resultado = 'RED' THEN 1 END) as reds,
  COUNT(CASE WHEN a.resultado = 'VOID' THEN 1 END) as voids,
  COUNT(CASE WHEN a.resultado = 'MEIO_GREEN' OR a.resultado = 'HALF' THEN 1 END) as meio_greens,
  COUNT(CASE WHEN a.resultado = 'MEIO_RED' THEN 1 END) as meio_reds,
  COALESCE(SUM(a.stake), 0) as total_stake,
  COALESCE(SUM(a.lucro_prejuizo), 0) as lucro_total,
  CASE 
    WHEN COALESCE(SUM(a.stake), 0) = 0 THEN 0
    ELSE (COALESCE(SUM(a.lucro_prejuizo), 0) / COALESCE(SUM(a.stake), 1)) * 100
  END as roi_percentual
FROM projetos p
LEFT JOIN apostas a ON a.projeto_id = p.id
WHERE p.user_id = auth.uid()
GROUP BY p.id;