-- Drop and recreate view with Brazil timezone
DROP VIEW IF EXISTS v_alertas_parcerias;

CREATE VIEW v_alertas_parcerias AS
SELECT 
  p.id AS parceria_id,
  p.user_id,
  pa.nome AS parceiro_nome,
  p.data_inicio,
  p.data_fim_prevista,
  p.duracao_dias,
  (p.data_fim_prevista - (CURRENT_TIMESTAMP AT TIME ZONE 'America/Sao_Paulo')::date) AS dias_restantes,
  p.status,
  CASE
    WHEN ((p.data_fim_prevista - (CURRENT_TIMESTAMP AT TIME ZONE 'America/Sao_Paulo')::date) <= 0) THEN 'VENCIDA'::text
    WHEN ((p.data_fim_prevista - (CURRENT_TIMESTAMP AT TIME ZONE 'America/Sao_Paulo')::date) <= 3) THEN 'CRITICA'::text
    WHEN ((p.data_fim_prevista - (CURRENT_TIMESTAMP AT TIME ZONE 'America/Sao_Paulo')::date) <= 7) THEN 'ALTA'::text
    WHEN ((p.data_fim_prevista - (CURRENT_TIMESTAMP AT TIME ZONE 'America/Sao_Paulo')::date) <= 15) THEN 'NORMAL'::text
    WHEN ((p.data_fim_prevista - (CURRENT_TIMESTAMP AT TIME ZONE 'America/Sao_Paulo')::date) <= 30) THEN 'BAIXA'::text
    ELSE 'OK'::text
  END AS nivel_urgencia
FROM parcerias p
JOIN parceiros pa ON p.parceiro_id = pa.id
WHERE p.status = ANY (ARRAY['ATIVA'::text, 'EM_ENCERRAMENTO'::text]);