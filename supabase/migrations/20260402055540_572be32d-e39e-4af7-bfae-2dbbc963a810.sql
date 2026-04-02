
-- Fix: Allow unlink (projeto_id → NULL) WITH balance for "Manter Saldo" flow
-- Only block closures/archiving with non-zero balance
CREATE OR REPLACE FUNCTION public.validate_bookmaker_resolution_requires_ledger_zero()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_is_unlink boolean := false;
  v_is_closing boolean := false;
BEGIN
  -- Detect unlink: projeto_id goes from something to NULL
  v_is_unlink := OLD.projeto_id IS NOT NULL AND NEW.projeto_id IS NULL;

  -- Detect closure: status/estado_conta changes to terminal state
  v_is_closing := (
    coalesce(OLD.estado_conta, '') IS DISTINCT FROM coalesce(NEW.estado_conta, '')
    AND lower(coalesce(NEW.estado_conta, '')) IN ('encerrada', 'inativa', 'arquivada', 'resolvida')
  ) OR (
    coalesce(OLD.status, '') IS DISTINCT FROM coalesce(NEW.status, '')
    AND lower(coalesce(NEW.status, '')) IN ('inativa', 'arquivada', 'resolvida')
  );

  -- ============================================================
  -- HARD RULE: Only CLOSURES require zero balance
  -- UNLINK (removing from project) is ALLOWED with balance
  -- This enables the "Manter Saldo" flow where money stays in the account
  -- ============================================================
  IF v_is_closing
     AND (NOT v_is_unlink)  -- pure closure without unlink
     AND (abs(coalesce(NEW.saldo_atual, 0)) > 0.01 OR abs(coalesce(NEW.saldo_freebet, 0)) > 0.01) THEN
    RAISE EXCEPTION USING
      MESSAGE = 'Não é permitido encerrar/arquivar bookmaker com saldo diferente de zero.',
      DETAIL = format('Bookmaker %s ainda possui saldo_atual=%s e saldo_freebet=%s. Quite via SAQUE ou AJUSTE_SALDO antes de concluir.', NEW.id, coalesce(NEW.saldo_atual,0), coalesce(NEW.saldo_freebet,0)),
      HINT = 'Use um lançamento contábil auditável para zerar o saldo antes de encerrar a conta.';
  END IF;

  -- For unlinks that are also closures (e.g., status='encerrada' during unlink),
  -- only block if it's a terminal closure state AND has balance
  IF v_is_unlink AND v_is_closing
     AND lower(coalesce(NEW.estado_conta, '')) IN ('encerrada', 'arquivada', 'resolvida')
     AND (abs(coalesce(NEW.saldo_atual, 0)) > 0.01 OR abs(coalesce(NEW.saldo_freebet, 0)) > 0.01) THEN
    RAISE EXCEPTION USING
      MESSAGE = 'Não é permitido encerrar bookmaker com saldo diferente de zero.',
      DETAIL = format('Bookmaker %s possui saldo_atual=%s. Zere o saldo antes de encerrar.', NEW.id, coalesce(NEW.saldo_atual,0)),
      HINT = 'Use "Manter Saldo" para desvincular sem encerrar, ou registre um saque/ajuste.';
  END IF;

  RETURN NEW;
END;
$$;
