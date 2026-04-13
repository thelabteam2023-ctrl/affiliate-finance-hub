
UPDATE bookmakers
SET saldo_atual = 0,
    updated_at = now()
WHERE id = 'dc6ee442-46f4-44d5-889b-510f3b952e7f'
  AND saldo_atual = -300;

INSERT INTO bookmaker_balance_audit (bookmaker_id, workspace_id, saldo_anterior, saldo_novo, origem, observacoes)
SELECT id, workspace_id, -300, 0, 'RECONCILIACAO', 'Correção: ajuste duplicado aplicado 3x pelo trigger, saldo restaurado ao valor correto (0) baseado no ledger'
FROM bookmakers
WHERE id = 'dc6ee442-46f4-44d5-889b-510f3b952e7f';
