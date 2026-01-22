-- =========================================================================
-- CORREÇÃO DE SEGURANÇA: View v_saldo_parceiro_contas sem isolamento de workspace
-- 
-- PROBLEMA: A view atual não filtra por workspace, permitindo que saldos de
-- contas bancárias de outros workspaces sejam expostos.
--
-- SOLUÇÃO: Recriar a view com:
-- 1. Filtro explícito de workspace via get_current_workspace()
-- 2. Filtro de workspace no cash_ledger para garantir que apenas transações
--    do workspace atual sejam consideradas no cálculo de saldo
-- =========================================================================

DROP VIEW IF EXISTS v_saldo_parceiro_contas;

CREATE VIEW v_saldo_parceiro_contas
WITH (security_invoker = on)
AS
SELECT 
  p.user_id,
  p.id AS parceiro_id,
  p.nome AS parceiro_nome,
  cb.id AS conta_id,
  cb.banco,
  cb.moeda,
  cb.titular,
  COALESCE(SUM(
    CASE
      WHEN cl.destino_conta_bancaria_id = cb.id THEN COALESCE(cl.valor_destino, cl.valor)
      WHEN cl.origem_conta_bancaria_id = cb.id THEN -COALESCE(cl.valor_origem, cl.valor)
      ELSE 0::numeric
    END
  ), 0::numeric) AS saldo
FROM parceiros p
JOIN contas_bancarias cb ON cb.parceiro_id = p.id
LEFT JOIN cash_ledger cl ON (
  (
    (cl.destino_conta_bancaria_id = cb.id AND cl.moeda = cb.moeda)
    OR (cl.origem_conta_bancaria_id = cb.id AND cl.moeda = cb.moeda)
  )
  AND cl.status = 'CONFIRMADO'
  AND cl.workspace_id = get_current_workspace() -- CRÍTICO: Filtrar transações por workspace
)
WHERE p.workspace_id = get_current_workspace() -- CRÍTICO: Filtrar parceiros por workspace
GROUP BY p.user_id, p.id, p.nome, cb.id, cb.banco, cb.moeda, cb.titular;