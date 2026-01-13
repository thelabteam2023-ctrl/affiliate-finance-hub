-- Corrigir v_operador_comparativo para usar nome do profile ao invés da tabela operadores
CREATE OR REPLACE VIEW v_operador_comparativo AS
SELECT 
    o.id AS operador_id,
    p.full_name AS nome,
    o.cpf,
    o.status,
    o.tipo_contrato,
    o.workspace_id,
    ( SELECT count(*) AS count
           FROM operador_projetos op
          WHERE op.operador_id = o.id AND op.status = 'ATIVO'::text) AS projetos_ativos,
    COALESCE(( SELECT sum(au.lucro_prejuizo) AS sum
           FROM apostas_unificada au
             JOIN operador_projetos op ON op.projeto_id = au.projeto_id
          WHERE op.operador_id = o.id AND au.status = 'LIQUIDADA'::text), 0::numeric) AS lucro_total_gerado,
    ( SELECT count(*) AS count
           FROM apostas_unificada au
             JOIN operador_projetos op ON op.projeto_id = au.projeto_id
          WHERE op.operador_id = o.id) AS total_apostas,
    ( SELECT count(*) AS count
           FROM apostas_unificada au
             JOIN operador_projetos op ON op.projeto_id = au.projeto_id
          WHERE op.operador_id = o.id AND au.resultado = 'GREEN'::text) AS apostas_ganhas,
    COALESCE(( SELECT sum(au.stake_total) AS sum
           FROM apostas_unificada au
             JOIN operador_projetos op ON op.projeto_id = au.projeto_id
          WHERE op.operador_id = o.id), 0::numeric) AS volume_total,
    ( SELECT COALESCE(sum(po.valor), 0::numeric) AS "coalesce"
           FROM pagamentos_operador po
          WHERE po.operador_id = o.id AND po.status = 'CONFIRMADO'::text) AS total_pago,
    ( SELECT COALESCE(sum(po.valor), 0::numeric) AS "coalesce"
           FROM pagamentos_operador po
          WHERE po.operador_id = o.id AND po.status = 'PENDENTE'::text) AS total_pendente
FROM operadores o
JOIN profiles p ON o.auth_user_id = p.id
WHERE (EXISTS ( SELECT 1
           FROM operador_projetos op
          WHERE op.operador_id = o.id AND op.status = 'ATIVO'::text));