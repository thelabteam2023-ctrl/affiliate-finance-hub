-- Corrigir view v_entregas_pendentes com SECURITY INVOKER
DROP VIEW IF EXISTS public.v_entregas_pendentes;
CREATE OR REPLACE VIEW public.v_entregas_pendentes
WITH (security_invoker = true)
AS
SELECT 
  e.id,
  e.user_id,
  e.operador_projeto_id,
  e.numero_entrega,
  e.descricao,
  e.data_inicio,
  e.data_fim_prevista,
  e.tipo_gatilho,
  e.tipo_meta,
  e.meta_valor,
  e.meta_percentual,
  e.base_calculo,
  e.saldo_inicial,
  e.resultado_nominal,
  e.status,
  e.created_at,
  op.operador_id,
  op.projeto_id,
  op.modelo_pagamento,
  op.valor_fixo,
  op.percentual,
  o.nome as operador_nome,
  p.nome as projeto_nome,
  CASE 
    WHEN e.tipo_gatilho = 'META_ATINGIDA' AND e.resultado_nominal >= COALESCE(e.meta_valor, 0) THEN 'PRONTA'
    WHEN e.tipo_gatilho = 'PERIODO' AND e.data_fim_prevista <= CURRENT_DATE THEN 'PRONTA'
    ELSE 'EM_ANDAMENTO'
  END as status_conciliacao,
  CASE 
    WHEN e.tipo_gatilho = 'META_ATINGIDA' AND e.resultado_nominal >= COALESCE(e.meta_valor, 0) THEN 'CRITICA'
    WHEN e.tipo_gatilho = 'PERIODO' AND e.data_fim_prevista <= CURRENT_DATE THEN 'ALTA'
    WHEN e.tipo_gatilho = 'PERIODO' AND e.data_fim_prevista <= CURRENT_DATE + INTERVAL '3 days' THEN 'NORMAL'
    ELSE 'BAIXA'
  END as nivel_urgencia
FROM public.entregas e
JOIN public.operador_projetos op ON e.operador_projeto_id = op.id
JOIN public.operadores o ON op.operador_id = o.id
JOIN public.projetos p ON op.projeto_id = p.id
WHERE e.status = 'EM_ANDAMENTO'
  AND e.conciliado = FALSE
  AND e.user_id = auth.uid();

-- Corrigir view v_operadores_sem_entrega com SECURITY INVOKER
DROP VIEW IF EXISTS public.v_operadores_sem_entrega;
CREATE OR REPLACE VIEW public.v_operadores_sem_entrega
WITH (security_invoker = true)
AS
SELECT 
  op.id as operador_projeto_id,
  op.operador_id,
  op.projeto_id,
  op.modelo_pagamento,
  op.status,
  op.user_id,
  o.nome as operador_nome,
  p.nome as projeto_nome
FROM public.operador_projetos op
JOIN public.operadores o ON op.operador_id = o.id
JOIN public.projetos p ON op.projeto_id = p.id
WHERE op.status = 'ATIVO'
  AND op.user_id = auth.uid()
  AND NOT EXISTS (
    SELECT 1 FROM public.entregas e 
    WHERE e.operador_projeto_id = op.id 
    AND e.status = 'EM_ANDAMENTO'
  );