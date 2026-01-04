-- Atualizar view v_painel_operacional para incluir casas limitadas que precisam de ação
CREATE OR REPLACE VIEW v_painel_operacional AS
-- Bookmakers aguardando saque
SELECT 
  id AS entidade_id,
  user_id,
  'BOOKMAKER_SAQUE' AS tipo_alerta,
  'BOOKMAKER' AS entidade_tipo,
  nome AS titulo,
  'Aguardando confirmação de saque' AS descricao,
  saldo_atual AS valor,
  moeda,
  'MEDIO' AS nivel_urgencia,
  2 AS ordem_urgencia,
  NULL::date AS data_limite,
  created_at,
  parceiro_id,
  (SELECT parceiros.nome FROM parceiros WHERE parceiros.id = b.parceiro_id) AS parceiro_nome,
  projeto_id,
  (SELECT projetos.nome FROM projetos WHERE projetos.id = b.projeto_id) AS projeto_nome,
  status AS status_anterior
FROM bookmakers b
WHERE status = 'AGUARDANDO_SAQUE' 
  AND workspace_id = get_current_workspace()

UNION ALL

-- Bookmakers limitados que precisam de ação (sacar ou realocar)
SELECT 
  id AS entidade_id,
  user_id,
  'BOOKMAKER_LIMITADA' AS tipo_alerta,
  'BOOKMAKER' AS entidade_tipo,
  nome AS titulo,
  'Casa limitada - necessário sacar saldo ou realocar' AS descricao,
  saldo_atual AS valor,
  moeda,
  CASE 
    WHEN saldo_atual > 1000 THEN 'ALTO'
    ELSE 'MEDIO'
  END AS nivel_urgencia,
  CASE 
    WHEN saldo_atual > 1000 THEN 1
    ELSE 2
  END AS ordem_urgencia,
  NULL::date AS data_limite,
  created_at,
  parceiro_id,
  (SELECT parceiros.nome FROM parceiros WHERE parceiros.id = b.parceiro_id) AS parceiro_nome,
  projeto_id,
  (SELECT projetos.nome FROM projetos WHERE projetos.id = b.projeto_id) AS projeto_nome,
  status AS status_anterior
FROM bookmakers b
WHERE status = 'limitada' 
  AND saldo_atual > 0
  AND workspace_id = get_current_workspace();