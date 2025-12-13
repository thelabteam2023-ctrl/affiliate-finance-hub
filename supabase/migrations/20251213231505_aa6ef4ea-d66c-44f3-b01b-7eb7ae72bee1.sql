-- Recriar view v_custos_aquisicao para buscar indicador via parceiro_id da tabela indicacoes
-- (ao invés de usar indicacao_id que está null nas parcerias)

DROP VIEW IF EXISTS v_custos_aquisicao;

CREATE OR REPLACE VIEW v_custos_aquisicao AS
SELECT 
  p.user_id,
  p.id AS parceria_id,
  p.parceiro_id,
  par.nome AS parceiro_nome,
  p.origem_tipo,
  p.data_inicio,
  p.status,
  p.indicacao_id,
  ind.indicador_id,
  ir.nome AS indicador_nome,
  p.valor_indicador,
  p.valor_parceiro,
  p.fornecedor_id,
  f.nome AS fornecedor_nome,
  p.valor_fornecedor,
  COALESCE(p.valor_indicador, 0::numeric) + COALESCE(p.valor_parceiro, 0::numeric) + COALESCE(p.valor_fornecedor, 0::numeric) AS custo_total
FROM parcerias p
LEFT JOIN parceiros par ON p.parceiro_id = par.id
-- Mudança: buscar indicador via parceiro_id ao invés de indicacao_id
LEFT JOIN indicacoes ind ON ind.parceiro_id = p.parceiro_id
LEFT JOIN indicadores_referral ir ON ind.indicador_id = ir.id
LEFT JOIN fornecedores f ON p.fornecedor_id = f.id;