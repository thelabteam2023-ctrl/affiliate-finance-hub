-- CORREÇÃO CRÍTICA: Isolamento por workspace no cash_ledger
-- A RLS atual usa is_active_workspace_member() que permite ver dados de TODOS os workspaces
-- Deve usar workspace_id = get_current_workspace() para isolar apenas o workspace ativo

-- 1. DROP policies existentes
DROP POLICY IF EXISTS cash_ledger_select_policy ON cash_ledger;
DROP POLICY IF EXISTS cash_ledger_insert_policy ON cash_ledger;
DROP POLICY IF EXISTS cash_ledger_update_policy ON cash_ledger;
DROP POLICY IF EXISTS cash_ledger_delete_policy ON cash_ledger;

-- 2. Criar novas policies com isolamento correto por workspace ATIVO
CREATE POLICY cash_ledger_select_policy ON cash_ledger
  FOR SELECT
  USING (workspace_id = get_current_workspace());

CREATE POLICY cash_ledger_insert_policy ON cash_ledger
  FOR INSERT
  WITH CHECK (
    auth.uid() IS NOT NULL 
    AND user_id = auth.uid() 
    AND workspace_id = get_current_workspace()
  );

CREATE POLICY cash_ledger_update_policy ON cash_ledger
  FOR UPDATE
  USING (
    workspace_id = get_current_workspace() 
    AND is_workspace_owner_or_admin(auth.uid(), workspace_id)
  );

CREATE POLICY cash_ledger_delete_policy ON cash_ledger
  FOR DELETE
  USING (
    workspace_id = get_current_workspace()
    AND EXISTS (
      SELECT 1 FROM workspace_members
      WHERE workspace_members.user_id = auth.uid()
        AND workspace_members.workspace_id = cash_ledger.workspace_id
        AND workspace_members.is_active = true
        AND workspace_members.role = 'owner'
    )
  );

-- 3. Corrigir views que fazem JOINs com cash_ledger sem filtrar workspace
-- v_saldo_parceiro_contas
DROP VIEW IF EXISTS v_saldo_parceiro_contas;
CREATE VIEW v_saldo_parceiro_contas WITH (security_invoker = true) AS
SELECT 
  p.user_id,
  p.id AS parceiro_id,
  p.nome AS parceiro_nome,
  cb.id AS conta_id,
  cb.banco,
  'BRL'::text AS moeda,
  COALESCE((
    SELECT sum(
      CASE
        WHEN cl.destino_conta_bancaria_id = cb.id THEN cl.valor
        WHEN cl.origem_conta_bancaria_id = cb.id THEN -cl.valor
        ELSE 0::numeric
      END
    )
    FROM cash_ledger cl
    WHERE (cl.destino_conta_bancaria_id = cb.id OR cl.origem_conta_bancaria_id = cb.id)
      AND cl.status = 'CONFIRMADO'
      AND cl.workspace_id = get_current_workspace()
  ), 0::numeric) AS saldo
FROM parceiros p
JOIN contas_bancarias cb ON cb.parceiro_id = p.id
WHERE p.workspace_id = get_current_workspace();

-- v_saldo_parceiro_wallets
DROP VIEW IF EXISTS v_saldo_parceiro_wallets;
CREATE VIEW v_saldo_parceiro_wallets WITH (security_invoker = true) AS
SELECT 
  p.user_id,
  p.id AS parceiro_id,
  p.nome AS parceiro_nome,
  w.id AS wallet_id,
  w.exchange,
  w.endereco,
  cl_agg.coin,
  COALESCE(cl_agg.saldo_coin, 0::numeric) AS saldo_coin,
  COALESCE(cl_agg.saldo_usd, 0::numeric) AS saldo_usd
FROM parceiros p
JOIN wallets_crypto w ON w.parceiro_id = p.id
LEFT JOIN LATERAL (
  SELECT 
    cl.coin,
    sum(CASE WHEN cl.destino_wallet_id = w.id THEN cl.qtd_coin WHEN cl.origem_wallet_id = w.id THEN -cl.qtd_coin ELSE 0::numeric END) AS saldo_coin,
    sum(CASE WHEN cl.destino_wallet_id = w.id THEN cl.valor_usd WHEN cl.origem_wallet_id = w.id THEN -cl.valor_usd ELSE 0::numeric END) AS saldo_usd
  FROM cash_ledger cl
  WHERE (cl.destino_wallet_id = w.id OR cl.origem_wallet_id = w.id) 
    AND cl.status = 'CONFIRMADO'
    AND cl.workspace_id = get_current_workspace()
  GROUP BY cl.coin
) cl_agg ON true
WHERE p.workspace_id = get_current_workspace();