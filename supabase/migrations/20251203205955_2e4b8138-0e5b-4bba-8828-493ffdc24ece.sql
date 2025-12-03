-- Fix views to use SECURITY INVOKER instead of SECURITY DEFINER

DROP VIEW IF EXISTS public.v_indicador_performance;
DROP VIEW IF EXISTS public.v_parcerias_alerta;

-- Recreate View: Performance dos Indicadores with SECURITY INVOKER
CREATE VIEW public.v_indicador_performance 
WITH (security_invoker = true) AS
SELECT 
  i.id AS indicador_id,
  i.user_id,
  i.nome,
  i.cpf,
  i.status,
  i.telefone,
  i.email,
  COUNT(DISTINCT ind.parceiro_id) AS total_parceiros_indicados,
  COUNT(DISTINCT CASE WHEN p.status = 'ATIVA' THEN p.id END) AS parcerias_ativas,
  COUNT(DISTINCT CASE WHEN p.status = 'ENCERRADA' THEN p.id END) AS parcerias_encerradas,
  COALESCE(SUM(m.valor) FILTER (WHERE m.tipo = 'COMISSAO_INDICADOR' AND m.status = 'CONFIRMADO'), 0) AS total_comissoes,
  COALESCE(SUM(m.valor) FILTER (WHERE m.tipo = 'BONUS_PROMOCAO' AND m.status = 'CONFIRMADO'), 0) AS total_bonus
FROM public.indicadores_referral i
LEFT JOIN public.indicacoes ind ON i.id = ind.indicador_id AND i.user_id = ind.user_id
LEFT JOIN public.parcerias p ON ind.id = p.indicacao_id AND i.user_id = p.user_id
LEFT JOIN public.movimentacoes_indicacao m ON i.id = m.indicador_id AND i.user_id = m.user_id
WHERE i.user_id = auth.uid()
GROUP BY i.id, i.user_id, i.nome, i.cpf, i.status, i.telefone, i.email;

-- Recreate View: Parcerias com Alerta de Encerramento with SECURITY INVOKER
CREATE VIEW public.v_parcerias_alerta 
WITH (security_invoker = true) AS
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
    WHEN (p.data_fim_prevista - CURRENT_DATE) <= 0 THEN 'VENCIDA'
    WHEN (p.data_fim_prevista - CURRENT_DATE) <= 10 THEN 'ALERTA'
    WHEN (p.data_fim_prevista - CURRENT_DATE) <= 20 THEN 'ATENCAO'
    ELSE 'OK'
  END AS nivel_alerta
FROM public.parcerias p
JOIN public.parceiros par ON p.parceiro_id = par.id
LEFT JOIN public.indicacoes ind ON p.indicacao_id = ind.id
LEFT JOIN public.indicadores_referral i ON ind.indicador_id = i.id
WHERE p.user_id = auth.uid() AND p.status IN ('ATIVA', 'EM_ENCERRAMENTO');