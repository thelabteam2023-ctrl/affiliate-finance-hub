-- =====================================================
-- ÍNDICES E VIEW DE MONITORAMENTO DE CICLOS
-- =====================================================

-- 1. ÍNDICES PARA PERFORMANCE
CREATE INDEX IF NOT EXISTS idx_projeto_ciclos_operador_projeto 
ON public.projeto_ciclos(operador_projeto_id);

CREATE INDEX IF NOT EXISTS idx_projeto_ciclos_status_aberto 
ON public.projeto_ciclos(status) 
WHERE status = 'ABERTO';

CREATE INDEX IF NOT EXISTS idx_operador_projetos_tipo_gatilho 
ON public.operador_projetos(tipo_gatilho);

-- 2. VIEW PARA MONITORAR CICLOS PRÓXIMOS DO FECHAMENTO (SECURITY INVOKER)
CREATE OR REPLACE VIEW public.v_ciclos_proximos_fechamento 
WITH (security_invoker = true) AS
SELECT 
  pc.id as ciclo_id,
  pc.projeto_id,
  pc.operador_projeto_id,
  op.operador_id,
  o.nome as operador_nome,
  p.nome as projeto_nome,
  pc.tipo_gatilho,
  pc.meta_volume,
  pc.valor_acumulado,
  pc.excedente_anterior,
  pc.data_inicio,
  pc.data_fim_prevista,
  pc.data_fim_real,
  CASE 
    WHEN pc.tipo_gatilho IN ('VOLUME', 'HIBRIDO') AND pc.meta_volume > 0 
    THEN ROUND((pc.valor_acumulado / pc.meta_volume) * 100, 2)
    ELSE NULL
  END as percentual_volume_atingido,
  CASE 
    WHEN pc.tipo_gatilho IN ('TEMPO', 'HIBRIDO') AND pc.data_fim_prevista IS NOT NULL
    THEN GREATEST(0, pc.data_fim_prevista - CURRENT_DATE)
    ELSE NULL
  END as dias_restantes,
  CASE
    WHEN pc.tipo_gatilho IN ('VOLUME', 'HIBRIDO') AND pc.meta_volume > 0 
         AND (pc.valor_acumulado / pc.meta_volume) >= 0.9 THEN 'VOLUME_PROXIMO'
    WHEN pc.tipo_gatilho IN ('TEMPO', 'HIBRIDO') AND pc.data_fim_prevista IS NOT NULL
         AND pc.data_fim_prevista - CURRENT_DATE <= 3 THEN 'TEMPO_PROXIMO'
    ELSE 'NORMAL'
  END as alerta,
  pc.status,
  pc.user_id
FROM public.projeto_ciclos pc
LEFT JOIN public.operador_projetos op ON pc.operador_projeto_id = op.id
LEFT JOIN public.operadores o ON op.operador_id = o.id
LEFT JOIN public.projetos p ON pc.projeto_id = p.id
WHERE pc.status = 'ABERTO'
  AND pc.user_id = auth.uid();