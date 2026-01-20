-- ============================================
-- FIX: Remover triggers duplicados no cash_ledger (evita saldo duplicado)
-- ============================================

-- 1) Remover TODOS os triggers de atualização de saldo (mantemos apenas um)
DROP TRIGGER IF EXISTS tr_cash_ledger_update_bookmaker_balance ON public.cash_ledger;
DROP TRIGGER IF EXISTS tr_atualizar_saldo_bookmaker_v2 ON public.cash_ledger;
DROP TRIGGER IF EXISTS trigger_atualizar_saldo_bookmaker_v2 ON public.cash_ledger;
DROP TRIGGER IF EXISTS trigger_atualizar_saldo_bookmaker ON public.cash_ledger;

-- 2) Recriar um único trigger AFTER INSERT para atualizar saldo
CREATE TRIGGER tr_cash_ledger_update_bookmaker_balance
  AFTER INSERT ON public.cash_ledger
  FOR EACH ROW
  EXECUTE FUNCTION public.atualizar_saldo_bookmaker_v2();

-- 3) Remover trigger duplicado de validação de ajuste (manter apenas o padrão do sistema)
DROP TRIGGER IF EXISTS tr_validate_ajuste_manual ON public.cash_ledger;

-- Observação:
-- Mantemos:
-- - trg_validate_ajuste_manual (BEFORE INSERT OR UPDATE)
-- - trg_validate_evento_promocional (BEFORE INSERT OR UPDATE)
-- - update_cash_ledger_updated_at (BEFORE UPDATE)
