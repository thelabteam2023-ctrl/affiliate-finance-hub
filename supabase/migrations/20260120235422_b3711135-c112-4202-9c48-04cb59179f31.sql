-- Recriar views que dependem de cash_ledger sem filtro explícito de workspace
-- Usar security_invoker para respeitar RLS das tabelas base

-- v_eventos_promocionais
DROP VIEW IF EXISTS v_eventos_promocionais;
CREATE VIEW v_eventos_promocionais WITH (security_invoker = true) AS
SELECT 
  cl.id,
  cl.created_at,
  cl.data_transacao,
  cl.tipo_transacao,
  cl.evento_promocional_tipo,
  cl.valor,
  cl.moeda,
  cl.descricao,
  cl.user_id,
  cl.workspace_id,
  cl.destino_bookmaker_id,
  cl.origem_bookmaker_id,
  COALESCE(b_dest.nome, b_orig.nome) AS bookmaker_nome,
  cl.impacta_caixa_operacional,
  cl.auditoria_metadata
FROM cash_ledger cl
LEFT JOIN bookmakers b_dest ON b_dest.id = cl.destino_bookmaker_id
LEFT JOIN bookmakers b_orig ON b_orig.id = cl.origem_bookmaker_id
WHERE (cl.tipo_transacao = ANY (ARRAY['GIRO_GRATIS_GANHO', 'FREEBET_CONVERTIDA', 'BONUS_CREDITADO', 'CREDITO_PROMOCIONAL']))
   OR cl.evento_promocional_tipo IS NOT NULL
ORDER BY cl.created_at DESC;

-- v_ajustes_auditoria
DROP VIEW IF EXISTS v_ajustes_auditoria;
CREATE VIEW v_ajustes_auditoria WITH (security_invoker = true) AS
SELECT 
  id,
  created_at,
  data_transacao,
  tipo_transacao,
  ajuste_direcao,
  ajuste_motivo,
  valor,
  moeda,
  origem_tipo,
  destino_tipo,
  descricao,
  user_id,
  workspace_id,
  referencia_transacao_id,
  auditoria_metadata,
  COALESCE(destino_bookmaker_id::text, origem_bookmaker_id::text, destino_conta_bancaria_id::text, origem_conta_bancaria_id::text, destino_wallet_id::text, origem_wallet_id::text) AS entidade_afetada_id,
  CASE
    WHEN destino_bookmaker_id IS NOT NULL OR origem_bookmaker_id IS NOT NULL THEN 'BOOKMAKER'
    WHEN destino_conta_bancaria_id IS NOT NULL OR origem_conta_bancaria_id IS NOT NULL THEN 'CONTA_BANCARIA'
    WHEN destino_wallet_id IS NOT NULL OR origem_wallet_id IS NOT NULL THEN 'WALLET'
    ELSE 'CAIXA_OPERACIONAL'
  END AS entidade_afetada_tipo
FROM cash_ledger cl
WHERE tipo_transacao = ANY (ARRAY['AJUSTE_MANUAL', 'AJUSTE_SALDO', 'ESTORNO', 'CONCILIACAO'])
ORDER BY created_at DESC;