-- Drop existing view first
DROP VIEW IF EXISTS public.v_projeto_lucro_operador CASCADE;

-- Recreate view with correct column references
CREATE VIEW public.v_projeto_lucro_operador AS
SELECT 
  op.id AS operador_projeto_id,
  op.operador_id,
  o.auth_user_id,
  o.auth_user_id AS profile_id,
  op.projeto_id,
  op.modelo_pagamento,
  op.valor_fixo,
  op.percentual,
  op.base_calculo,
  op.meta_valor,
  op.meta_percentual,
  op.tipo_meta,
  op.faixas_escalonadas,
  op.status,
  op.frequencia_conciliacao AS frequencia_entrega,
  o.nome AS operador_nome,
  proj.nome AS projeto_nome,
  COALESCE(SUM(
    CASE 
      WHEN a.resultado IS NOT NULL AND a.status = 'LIQUIDADA' 
      THEN COALESCE(a.lucro_prejuizo, 0) 
      ELSE 0 
    END
  ), 0) AS lucro_projeto,
  COALESCE(SUM(
    CASE 
      WHEN a.status = 'LIQUIDADA' 
      THEN a.stake * a.odd
      ELSE 0 
    END
  ), 0) AS faturamento_projeto,
  COUNT(DISTINCT a.id) FILTER (WHERE a.status = 'LIQUIDADA') AS total_apostas,
  COUNT(DISTINCT a.id) FILTER (WHERE a.status = 'LIQUIDADA' AND a.resultado = 'GANHOU') AS apostas_ganhas,
  COALESCE((
    SELECT SUM(cl.valor)
    FROM public.cash_ledger cl
    WHERE cl.destino_bookmaker_id IN (SELECT b.id FROM public.bookmakers b WHERE b.projeto_id = op.projeto_id)
      AND cl.tipo_transacao = 'DEPOSITO'
      AND cl.status = 'CONFIRMADO'
  ), 0) AS total_depositado,
  COALESCE((
    SELECT SUM(cl.valor)
    FROM public.cash_ledger cl
    WHERE cl.origem_bookmaker_id IN (SELECT b.id FROM public.bookmakers b WHERE b.projeto_id = op.projeto_id)
      AND cl.tipo_transacao = 'SAQUE'
      AND cl.status = 'CONFIRMADO'
  ), 0) AS total_sacado
FROM public.operador_projetos op
JOIN public.operadores o ON op.operador_id = o.id
JOIN public.projetos proj ON op.projeto_id = proj.id
LEFT JOIN public.apostas a ON a.projeto_id = op.projeto_id
GROUP BY 
  op.id, op.operador_id, op.projeto_id, op.modelo_pagamento, 
  op.valor_fixo, op.percentual, op.base_calculo, op.meta_valor,
  op.meta_percentual, op.tipo_meta, op.faixas_escalonadas, op.status,
  op.frequencia_conciliacao, o.nome, o.auth_user_id, proj.nome;