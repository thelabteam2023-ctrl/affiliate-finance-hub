
-- Corrigir view v_indicador_performance para usar BONUS_INDICADOR ao invés de BONUS_PROMOCAO
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
    count(DISTINCT ind.parceiro_id) AS total_parceiros_indicados,
    count(DISTINCT
        CASE
            WHEN p.status = 'ATIVA'::text THEN p.id
            ELSE NULL::uuid
        END) AS parcerias_ativas,
    count(DISTINCT
        CASE
            WHEN p.status = 'ENCERRADA'::text THEN p.id
            ELSE NULL::uuid
        END) AS parcerias_encerradas,
    COALESCE(sum(m.valor) FILTER (WHERE m.tipo = 'COMISSAO_INDICADOR'::text AND m.status = 'CONFIRMADO'::text), 0::numeric) AS total_comissoes,
    -- CORREÇÃO: Alterado de BONUS_PROMOCAO para BONUS_INDICADOR
    COALESCE(sum(m.valor) FILTER (WHERE m.tipo = 'BONUS_INDICADOR'::text AND m.status = 'CONFIRMADO'::text), 0::numeric) AS total_bonus
FROM indicadores_referral i
LEFT JOIN indicacoes ind ON i.id = ind.indicador_id AND i.user_id = ind.user_id
LEFT JOIN parcerias p ON ind.id = p.indicacao_id AND i.user_id = p.user_id
LEFT JOIN movimentacoes_indicacao m ON i.id = m.indicador_id AND i.user_id = m.user_id
WHERE i.user_id = auth.uid()
GROUP BY i.id, i.user_id, i.nome, i.cpf, i.status, i.telefone, i.email;
