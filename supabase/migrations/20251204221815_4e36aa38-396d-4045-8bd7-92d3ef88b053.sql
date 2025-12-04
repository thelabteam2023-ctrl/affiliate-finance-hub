
-- Criar view consolidada para o painel operacional (corrigida)
CREATE OR REPLACE VIEW public.v_painel_operacional AS
SELECT * FROM (
  -- Bookmakers aguardando saque
  SELECT 
    'SAQUE_PENDENTE' as tipo_alerta,
    'BOOKMAKER' as entidade_tipo,
    b.id as entidade_id,
    b.user_id,
    CONCAT('Saque pendente: ', b.nome) as titulo,
    CONCAT('Parceiro: ', pa.nome, ' - Saldo: ', b.moeda, ' ', b.saldo_atual) as descricao,
    b.saldo_atual as valor,
    b.moeda,
    'ALTA' as nivel_urgencia,
    1 as ordem_urgencia,
    NULL::DATE as data_limite,
    b.updated_at as created_at
  FROM public.bookmakers b
  LEFT JOIN public.parceiros pa ON b.parceiro_id = pa.id
  WHERE b.status = 'AGUARDANDO_SAQUE'
    AND b.saldo_atual > 0
    AND b.user_id = auth.uid()

  UNION ALL

  -- Parcerias vencendo/vencidas
  SELECT 
    CASE 
      WHEN (p.data_fim_prevista - CURRENT_DATE) <= 0 THEN 'PARCERIA_VENCIDA'
      ELSE 'PARCERIA_VENCENDO'
    END as tipo_alerta,
    'PARCERIA' as entidade_tipo,
    p.id as entidade_id,
    p.user_id,
    CASE 
      WHEN (p.data_fim_prevista - CURRENT_DATE) <= 0 THEN CONCAT('Parceria VENCIDA: ', pa.nome)
      WHEN (p.data_fim_prevista - CURRENT_DATE) = 1 THEN CONCAT('Parceria vence AMANHÃ: ', pa.nome)
      ELSE CONCAT('Parceria vence em ', (p.data_fim_prevista - CURRENT_DATE), ' dias: ', pa.nome)
    END as titulo,
    CONCAT('Início: ', TO_CHAR(p.data_inicio, 'DD/MM/YYYY'), ' - Fim previsto: ', TO_CHAR(p.data_fim_prevista, 'DD/MM/YYYY')) as descricao,
    NULL::NUMERIC as valor,
    'BRL' as moeda,
    CASE 
      WHEN (p.data_fim_prevista - CURRENT_DATE) <= 0 THEN 'CRITICA'
      WHEN (p.data_fim_prevista - CURRENT_DATE) <= 3 THEN 'CRITICA'
      WHEN (p.data_fim_prevista - CURRENT_DATE) <= 7 THEN 'ALTA'
      WHEN (p.data_fim_prevista - CURRENT_DATE) <= 15 THEN 'NORMAL'
      ELSE 'BAIXA'
    END as nivel_urgencia,
    CASE 
      WHEN (p.data_fim_prevista - CURRENT_DATE) <= 0 THEN 0
      WHEN (p.data_fim_prevista - CURRENT_DATE) <= 3 THEN 0
      WHEN (p.data_fim_prevista - CURRENT_DATE) <= 7 THEN 1
      WHEN (p.data_fim_prevista - CURRENT_DATE) <= 15 THEN 2
      ELSE 3
    END as ordem_urgencia,
    p.data_fim_prevista as data_limite,
    p.created_at
  FROM public.parcerias p
  INNER JOIN public.parceiros pa ON p.parceiro_id = pa.id
  WHERE p.status IN ('ATIVA', 'EM_ENCERRAMENTO')
    AND (p.data_fim_prevista - CURRENT_DATE) <= 30
    AND p.user_id = auth.uid()
) sub
ORDER BY ordem_urgencia, data_limite ASC NULLS LAST;
