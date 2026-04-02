
-- =============================================================
-- CORREÇÃO: Classificação de transações de operador
-- =============================================================

-- 1. PAGTO_OPERADOR: Atualizar auditoria_metadata com grupo correto
UPDATE cash_ledger
SET auditoria_metadata = COALESCE(auditoria_metadata, '{}'::jsonb) || '{"grupo": "Recursos Humanos", "categoria": "RECURSOS_HUMANOS"}'::jsonb,
    updated_at = now()
WHERE tipo_transacao = 'PAGTO_OPERADOR'
  AND (auditoria_metadata->>'grupo' IS NULL OR auditoria_metadata->>'grupo' = '');

-- 2. DESPESA_ADMINISTRATIVA com operador_id: Atualizar metadata com grupo
UPDATE cash_ledger
SET auditoria_metadata = COALESCE(auditoria_metadata, '{}'::jsonb) || '{"grupo": "Recursos Humanos", "categoria": "RECURSOS_HUMANOS"}'::jsonb,
    updated_at = now()
WHERE tipo_transacao = 'DESPESA_ADMINISTRATIVA'
  AND operador_id IS NOT NULL
  AND (auditoria_metadata->>'grupo' IS NULL OR auditoria_metadata->>'grupo' = '');

-- 3. COMISSAO_INDICADOR: Classificar como Recursos Humanos
UPDATE cash_ledger
SET auditoria_metadata = COALESCE(auditoria_metadata, '{}'::jsonb) || '{"grupo": "Recursos Humanos", "categoria": "RECURSOS_HUMANOS"}'::jsonb,
    updated_at = now()
WHERE tipo_transacao = 'COMISSAO_INDICADOR'
  AND (auditoria_metadata->>'grupo' IS NULL OR auditoria_metadata->>'grupo' = '');

-- 4. Criar registros faltantes em despesas_administrativas para PAGTO_OPERADOR
-- Daniel Marcos - 01/04/2026 - R$ 3.392,00
INSERT INTO despesas_administrativas (user_id, categoria, descricao, valor, data_despesa, recorrente, status, workspace_id, grupo, operador_id, origem_tipo, origem_conta_bancaria_id)
SELECT 
  cl.user_id,
  'RECURSOS_HUMANOS',
  cl.descricao,
  cl.valor,
  cl.data_transacao::date,
  false,
  'CONFIRMADO',
  cl.workspace_id,
  'RECURSOS_HUMANOS',
  cl.operador_id,
  'CONTA_BANCARIA',
  cl.origem_conta_bancaria_id
FROM cash_ledger cl
WHERE cl.id = '8b38fc4f-84d6-406b-bf96-3a985082ccd3'
AND NOT EXISTS (
  SELECT 1 FROM despesas_administrativas da 
  WHERE da.operador_id = cl.operador_id 
    AND da.valor = cl.valor 
    AND da.data_despesa = cl.data_transacao::date
);

-- Daniel Marcos - 03/03/2026 - R$ 2.697,60
INSERT INTO despesas_administrativas (user_id, categoria, descricao, valor, data_despesa, recorrente, status, workspace_id, grupo, operador_id, origem_tipo, origem_conta_bancaria_id)
SELECT 
  cl.user_id,
  'RECURSOS_HUMANOS',
  cl.descricao,
  cl.valor,
  cl.data_transacao::date,
  false,
  'CONFIRMADO',
  cl.workspace_id,
  'RECURSOS_HUMANOS',
  cl.operador_id,
  'CONTA_BANCARIA',
  cl.origem_conta_bancaria_id
FROM cash_ledger cl
WHERE cl.id = 'aebd324c-7ece-437b-9c29-7e4afc07094f'
AND NOT EXISTS (
  SELECT 1 FROM despesas_administrativas da 
  WHERE da.operador_id = cl.operador_id 
    AND da.valor = cl.valor 
    AND da.data_despesa = cl.data_transacao::date
);

-- Comissões de indicação (ROGERIO e DIEGO)
INSERT INTO despesas_administrativas (user_id, categoria, descricao, valor, data_despesa, recorrente, status, workspace_id, grupo, origem_tipo, origem_conta_bancaria_id)
SELECT 
  cl.user_id,
  'RECURSOS_HUMANOS',
  cl.descricao,
  cl.valor,
  cl.data_transacao::date,
  false,
  'CONFIRMADO',
  cl.workspace_id,
  'RECURSOS_HUMANOS',
  'CONTA_BANCARIA',
  cl.origem_conta_bancaria_id
FROM cash_ledger cl
WHERE cl.id IN ('0b983c9e-adf5-4711-b4f0-1891636f1802', '360f7450-dfcd-4012-adc5-8a7a1dcb72fd')
AND NOT EXISTS (
  SELECT 1 FROM despesas_administrativas da 
  WHERE da.descricao = cl.descricao 
    AND da.valor = cl.valor 
    AND da.data_despesa = cl.data_transacao::date
);
