
-- Recriar view v_projeto_lucro_operador sem frequencia_entrega
CREATE OR REPLACE VIEW public.v_projeto_lucro_operador AS
SELECT 
  op.id as operador_projeto_id,
  op.operador_id,
  o.auth_user_id,
  o.user_id as profile_id,
  op.projeto_id,
  op.modelo_pagamento,
  op.valor_fixo,
  op.percentual,
  op.base_calculo,
  op.tipo_meta,
  op.meta_valor,
  op.meta_percentual,
  op.faixas_escalonadas,
  op.status,
  op.frequencia_conciliacao as frequencia_entrega,
  o.nome as operador_nome,
  p.nome as projeto_nome,
  COALESCE((
    SELECT SUM(au.lucro_prejuizo)
    FROM apostas_unificada au
    WHERE au.projeto_id = op.projeto_id AND au.status = 'LIQUIDADA'
  ), 0) as lucro_projeto,
  COALESCE((
    SELECT SUM(CASE WHEN au.resultado = 'GREEN' THEN au.lucro_prejuizo ELSE 0 END)
    FROM apostas_unificada au
    WHERE au.projeto_id = op.projeto_id AND au.status = 'LIQUIDADA'
  ), 0) as faturamento_projeto,
  (
    SELECT COUNT(*)
    FROM apostas_unificada au
    WHERE au.projeto_id = op.projeto_id
  ) as total_apostas,
  (
    SELECT COUNT(*)
    FROM apostas_unificada au
    WHERE au.projeto_id = op.projeto_id AND au.resultado = 'GREEN'
  ) as apostas_ganhas,
  COALESCE((
    SELECT SUM(cl.valor)
    FROM cash_ledger cl
    JOIN bookmakers b ON cl.destino_bookmaker_id = b.id
    WHERE b.projeto_id = op.projeto_id AND cl.tipo_transacao = 'DEPOSITO' AND cl.status = 'CONFIRMADO'
  ), 0) as total_depositado,
  COALESCE((
    SELECT SUM(cl.valor)
    FROM cash_ledger cl
    JOIN bookmakers b ON cl.origem_bookmaker_id = b.id
    WHERE b.projeto_id = op.projeto_id AND cl.tipo_transacao = 'SAQUE' AND cl.status = 'CONFIRMADO'
  ), 0) as total_sacado
FROM operador_projetos op
JOIN operadores o ON o.id = op.operador_id
JOIN projetos p ON p.id = op.projeto_id;
