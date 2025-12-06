-- Remover trigger duplicado antigo para evitar atualização dupla de saldo
DROP TRIGGER IF EXISTS trigger_atualizar_saldo_bookmaker_caixa ON cash_ledger;