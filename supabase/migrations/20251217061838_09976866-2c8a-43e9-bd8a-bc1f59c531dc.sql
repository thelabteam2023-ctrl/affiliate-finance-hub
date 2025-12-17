-- Update v_projeto_lucro_operador view to work with unified operator model
DROP VIEW IF EXISTS public.v_projeto_lucro_operador;

CREATE VIEW public.v_projeto_lucro_operador AS
SELECT 
  op.id AS operador_projeto_id,
  op.operador_id,
  o.auth_user_id,
  p.id AS profile_id,
  COALESCE(p.full_name, o.nome, 'Operador') AS operador_nome,
  op.projeto_id,
  proj.nome AS projeto_nome,
  op.modelo_pagamento,
  op.valor_fixo,
  op.percentual,
  op.base_calculo,
  op.frequencia_conciliacao AS frequencia_entrega,
  op.tipo_meta,
  op.meta_valor,
  op.meta_percentual,
  op.faixas_escalonadas,
  op.status,
  COALESCE(
    (SELECT SUM(a.lucro_prejuizo) 
     FROM apostas a 
     WHERE a.projeto_id = op.projeto_id 
     AND a.resultado IS NOT NULL 
     AND a.status = 'LIQUIDADA'),
    0
  ) AS lucro_projeto,
  COALESCE(
    (SELECT SUM(a.valor_retorno) 
     FROM apostas a 
     WHERE a.projeto_id = op.projeto_id 
     AND a.resultado IS NOT NULL),
    0
  ) AS faturamento_projeto,
  COALESCE(
    (SELECT COUNT(*) 
     FROM apostas a 
     WHERE a.projeto_id = op.projeto_id 
     AND a.status = 'LIQUIDADA'),
    0
  ) AS total_apostas,
  COALESCE(
    (SELECT COUNT(*) 
     FROM apostas a 
     WHERE a.projeto_id = op.projeto_id 
     AND a.resultado = 'GANHOU'),
    0
  ) AS apostas_ganhas,
  COALESCE(
    (SELECT SUM(cl.valor) 
     FROM cash_ledger cl 
     WHERE cl.tipo_transacao = 'DEPOSITO' 
     AND cl.destino_bookmaker_id IN (
       SELECT b.id FROM bookmakers b WHERE b.projeto_id = op.projeto_id
     )),
    0
  ) AS total_depositado,
  COALESCE(
    (SELECT SUM(cl.valor) 
     FROM cash_ledger cl 
     WHERE cl.tipo_transacao = 'SAQUE' 
     AND cl.origem_bookmaker_id IN (
       SELECT b.id FROM bookmakers b WHERE b.projeto_id = op.projeto_id
     )),
    0
  ) AS total_sacado
FROM operador_projetos op
JOIN operadores o ON op.operador_id = o.id
LEFT JOIN profiles p ON o.auth_user_id = p.id
JOIN projetos proj ON op.projeto_id = proj.id
WHERE op.status = 'ATIVO';

-- Add RLS
ALTER VIEW public.v_projeto_lucro_operador SET (security_invoker = true);