-- Criar view v_operador_comparativo para o dashboard de operadores
-- Mostra métricas agregadas por operador, independente do role

CREATE OR REPLACE VIEW v_operador_comparativo AS
SELECT 
    o.id AS operador_id,
    o.nome,
    o.cpf,
    o.status,
    o.tipo_contrato,
    o.workspace_id,
    ( SELECT count(*) 
      FROM operador_projetos op 
      WHERE op.operador_id = o.id AND op.status = 'ATIVO') AS projetos_ativos,
    COALESCE(( 
      SELECT sum(au.lucro_prejuizo) 
      FROM apostas_unificada au
      JOIN operador_projetos op ON op.projeto_id = au.projeto_id
      WHERE op.operador_id = o.id AND au.status = 'LIQUIDADA'
    ), 0) AS lucro_total_gerado,
    ( SELECT count(*) 
      FROM apostas_unificada au
      JOIN operador_projetos op ON op.projeto_id = au.projeto_id
      WHERE op.operador_id = o.id) AS total_apostas,
    ( SELECT count(*) 
      FROM apostas_unificada au
      JOIN operador_projetos op ON op.projeto_id = au.projeto_id
      WHERE op.operador_id = o.id AND au.resultado = 'GREEN') AS apostas_ganhas,
    COALESCE(( 
      SELECT sum(au.stake_total) 
      FROM apostas_unificada au
      JOIN operador_projetos op ON op.projeto_id = au.projeto_id
      WHERE op.operador_id = o.id
    ), 0) AS volume_total,
    ( SELECT COALESCE(sum(po.valor), 0) 
      FROM pagamentos_operador po 
      WHERE po.operador_id = o.id AND po.status = 'CONFIRMADO') AS total_pago,
    ( SELECT COALESCE(sum(po.valor), 0) 
      FROM pagamentos_operador po 
      WHERE po.operador_id = o.id AND po.status = 'PENDENTE') AS total_pendente
FROM operadores o
WHERE EXISTS (
    SELECT 1 FROM operador_projetos op 
    WHERE op.operador_id = o.id AND op.status = 'ATIVO'
);