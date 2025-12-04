-- Corrigir views para usar SECURITY INVOKER
DROP VIEW IF EXISTS public.v_operador_performance;
DROP VIEW IF EXISTS public.v_projeto_resumo;

-- VIEW: v_operador_performance com SECURITY INVOKER
CREATE VIEW public.v_operador_performance
WITH (security_invoker = on)
AS
SELECT 
  o.id AS operador_id,
  o.user_id,
  o.nome,
  o.cpf,
  o.status,
  o.tipo_contrato,
  o.data_admissao,
  (SELECT COUNT(*) FROM public.operador_projetos op WHERE op.operador_id = o.id AND op.status = 'ATIVO') AS projetos_ativos,
  (SELECT COUNT(*) FROM public.operador_projetos op WHERE op.operador_id = o.id) AS total_projetos,
  (SELECT COALESCE(SUM(p.valor), 0) FROM public.pagamentos_operador p WHERE p.operador_id = o.id AND p.status = 'CONFIRMADO') AS total_pago,
  (SELECT COALESCE(SUM(p.valor), 0) FROM public.pagamentos_operador p WHERE p.operador_id = o.id AND p.status = 'PENDENTE') AS total_pendente
FROM public.operadores o;

-- VIEW: v_projeto_resumo com SECURITY INVOKER
CREATE VIEW public.v_projeto_resumo
WITH (security_invoker = on)
AS
SELECT 
  p.id AS projeto_id,
  p.user_id,
  p.nome,
  p.status,
  p.data_inicio,
  p.data_fim_prevista,
  p.orcamento_inicial,
  (SELECT COUNT(*) FROM public.operador_projetos op WHERE op.projeto_id = p.id AND op.status = 'ATIVO') AS operadores_ativos,
  (SELECT COALESCE(SUM(pg.valor), 0) FROM public.pagamentos_operador pg WHERE pg.projeto_id = p.id AND pg.status = 'CONFIRMADO') AS total_gasto_operadores
FROM public.projetos p;