-- Corrigir bookmakers que ficaram com status incorreto após saque parcial
-- Bookmakers desvinculadas (projeto_id IS NULL) com saldo > 0 devem estar AGUARDANDO_SAQUE
UPDATE bookmakers
SET status = 'AGUARDANDO_SAQUE',
    updated_at = now()
WHERE saldo_atual > 0.5
  AND projeto_id IS NULL
  AND status = 'ativo';