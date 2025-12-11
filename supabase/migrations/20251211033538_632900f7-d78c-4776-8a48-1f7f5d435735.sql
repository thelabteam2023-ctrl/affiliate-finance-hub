
-- Corrigir view v_indicador_performance para evitar multiplicação de valores no JOIN
DROP VIEW IF EXISTS v_indicador_performance;

CREATE VIEW v_indicador_performance AS
SELECT 
    i.id AS indicador_id,
    i.user_id,
    i.nome,
    i.cpf,
    i.status,
    i.telefone,
    i.email,
    -- Contagem de parceiros via subquery para evitar multiplicação
    COALESCE((
      SELECT count(DISTINCT ind.parceiro_id) 
      FROM indicacoes ind 
      WHERE ind.indicador_id = i.id AND ind.user_id = i.user_id
    ), 0) AS total_parceiros_indicados,
    -- Parcerias ativas
    COALESCE((
      SELECT count(DISTINCT p.id)
      FROM indicacoes ind
      JOIN parcerias p ON ind.id = p.indicacao_id AND ind.user_id = p.user_id
      WHERE ind.indicador_id = i.id AND ind.user_id = i.user_id AND p.status = 'ATIVA'
    ), 0) AS parcerias_ativas,
    -- Parcerias encerradas
    COALESCE((
      SELECT count(DISTINCT p.id)
      FROM indicacoes ind
      JOIN parcerias p ON ind.id = p.indicacao_id AND ind.user_id = p.user_id
      WHERE ind.indicador_id = i.id AND ind.user_id = i.user_id AND p.status = 'ENCERRADA'
    ), 0) AS parcerias_encerradas,
    -- Total comissões via subquery separada
    COALESCE((
      SELECT sum(m.valor) 
      FROM movimentacoes_indicacao m 
      WHERE m.indicador_id = i.id 
        AND m.user_id = i.user_id 
        AND m.tipo = 'COMISSAO_INDICADOR' 
        AND m.status = 'CONFIRMADO'
    ), 0) AS total_comissoes,
    -- Total bônus via subquery separada
    COALESCE((
      SELECT sum(m.valor) 
      FROM movimentacoes_indicacao m 
      WHERE m.indicador_id = i.id 
        AND m.user_id = i.user_id 
        AND m.tipo = 'BONUS_INDICADOR' 
        AND m.status = 'CONFIRMADO'
    ), 0) AS total_bonus
FROM indicadores_referral i
WHERE i.user_id = auth.uid();
