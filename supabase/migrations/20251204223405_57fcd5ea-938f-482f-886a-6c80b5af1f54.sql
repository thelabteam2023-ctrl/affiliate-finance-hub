-- Recriar a view v_painel_operacional com campos adicionais de rastreabilidade
DROP VIEW IF EXISTS public.v_painel_operacional;

CREATE VIEW public.v_painel_operacional AS
SELECT 
  tipo_alerta,
  entidade_tipo,
  entidade_id,
  user_id,
  titulo,
  descricao,
  valor,
  moeda,
  nivel_urgencia,
  ordem_urgencia,
  data_limite,
  created_at,
  parceiro_id,
  parceiro_nome,
  projeto_id,
  projeto_nome
FROM (
  -- Bookmakers aguardando saque
  SELECT 
    'SAQUE_PENDENTE'::text AS tipo_alerta,
    'BOOKMAKER'::text AS entidade_tipo,
    b.id AS entidade_id,
    b.user_id,
    CONCAT('Saque pendente: ', b.nome) AS titulo,
    CONCAT('Parceiro: ', pa.nome, ' - Saldo: ', b.moeda, ' ', b.saldo_atual) AS descricao,
    b.saldo_atual AS valor,
    b.moeda,
    'ALTA'::text AS nivel_urgencia,
    1 AS ordem_urgencia,
    NULL::date AS data_limite,
    b.updated_at AS created_at,
    b.parceiro_id,
    pa.nome AS parceiro_nome,
    b.projeto_id,
    pr.nome AS projeto_nome
  FROM bookmakers b
  LEFT JOIN parceiros pa ON b.parceiro_id = pa.id
  LEFT JOIN projetos pr ON b.projeto_id = pr.id
  WHERE b.status = 'AGUARDANDO_SAQUE' AND b.saldo_atual > 0
  
  UNION ALL
  
  -- Parcerias próximas do vencimento ou vencidas
  SELECT 
    CASE 
      WHEN (p.data_fim_prevista - CURRENT_DATE) <= 0 THEN 'PARCERIA_VENCIDA'::text
      ELSE 'PARCERIA_VENCENDO'::text
    END AS tipo_alerta,
    'PARCERIA'::text AS entidade_tipo,
    p.id AS entidade_id,
    p.user_id,
    CASE 
      WHEN (p.data_fim_prevista - CURRENT_DATE) <= 0 THEN CONCAT('Parceria VENCIDA: ', pa.nome)
      WHEN (p.data_fim_prevista - CURRENT_DATE) = 1 THEN CONCAT('Parceria vence AMANHÃ: ', pa.nome)
      ELSE CONCAT('Parceria vence em ', (p.data_fim_prevista - CURRENT_DATE), ' dias: ', pa.nome)
    END AS titulo,
    CONCAT('Início: ', to_char(p.data_inicio, 'DD/MM/YYYY'), ' - Fim previsto: ', to_char(p.data_fim_prevista, 'DD/MM/YYYY')) AS descricao,
    NULL::numeric AS valor,
    'BRL'::text AS moeda,
    CASE 
      WHEN (p.data_fim_prevista - CURRENT_DATE) <= 0 THEN 'CRITICA'::text
      WHEN (p.data_fim_prevista - CURRENT_DATE) <= 3 THEN 'CRITICA'::text
      WHEN (p.data_fim_prevista - CURRENT_DATE) <= 7 THEN 'ALTA'::text
      WHEN (p.data_fim_prevista - CURRENT_DATE) <= 15 THEN 'NORMAL'::text
      ELSE 'BAIXA'::text
    END AS nivel_urgencia,
    CASE 
      WHEN (p.data_fim_prevista - CURRENT_DATE) <= 0 THEN 0
      WHEN (p.data_fim_prevista - CURRENT_DATE) <= 3 THEN 0
      WHEN (p.data_fim_prevista - CURRENT_DATE) <= 7 THEN 1
      WHEN (p.data_fim_prevista - CURRENT_DATE) <= 15 THEN 2
      ELSE 3
    END AS ordem_urgencia,
    p.data_fim_prevista AS data_limite,
    p.created_at,
    p.parceiro_id,
    pa.nome AS parceiro_nome,
    NULL::uuid AS projeto_id,
    NULL::text AS projeto_nome
  FROM parcerias p
  JOIN parceiros pa ON p.parceiro_id = pa.id
  WHERE p.status IN ('ATIVA', 'EM_ENCERRAMENTO') 
    AND (p.data_fim_prevista - CURRENT_DATE) <= 30
) sub
ORDER BY ordem_urgencia, data_limite;