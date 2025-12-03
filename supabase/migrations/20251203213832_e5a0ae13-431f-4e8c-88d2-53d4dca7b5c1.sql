
-- Recriar view com SECURITY INVOKER para corrigir issue de segurança
DROP VIEW IF EXISTS public.v_custos_aquisicao;

CREATE VIEW public.v_custos_aquisicao 
WITH (security_invoker = true)
AS
SELECT 
  p.user_id,
  p.id as parceria_id,
  p.parceiro_id,
  par.nome as parceiro_nome,
  p.origem_tipo,
  p.data_inicio,
  p.status,
  p.indicacao_id,
  ind.indicador_id,
  ir.nome as indicador_nome,
  p.valor_indicador,
  p.valor_parceiro,
  p.fornecedor_id,
  f.nome as fornecedor_nome,
  p.valor_fornecedor,
  COALESCE(p.valor_indicador, 0) + COALESCE(p.valor_parceiro, 0) + COALESCE(p.valor_fornecedor, 0) as custo_total
FROM public.parcerias p
LEFT JOIN public.parceiros par ON p.parceiro_id = par.id
LEFT JOIN public.indicacoes ind ON p.indicacao_id = ind.id
LEFT JOIN public.indicadores_referral ir ON ind.indicador_id = ir.id
LEFT JOIN public.fornecedores f ON p.fornecedor_id = f.id;
