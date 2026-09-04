-- 🔒 Trava de integridade: SAQUE/DEPOSITO/TRANSFERENCIA não podem nascer órfãos
-- (sem origem e sem destino). Registros assim não debitam saldo de casa,
-- não geram financial_events e ainda contaminam o Caixa Operacional.
-- Aplica-se apenas a INSERTs novos: nenhum dado histórico é alterado.
CREATE OR REPLACE FUNCTION public.guard_cash_ledger_origem_destino()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.tipo_transacao IN ('SAQUE', 'DEPOSITO', 'TRANSFERENCIA') THEN
    IF NEW.origem_tipo IS NULL OR NEW.destino_tipo IS NULL THEN
      RAISE EXCEPTION
        'Transação % sem origem/destino definidos não é permitida (origem_tipo=%, destino_tipo=%)',
        NEW.tipo_transacao, NEW.origem_tipo, NEW.destino_tipo
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_guard_cash_ledger_origem_destino ON public.cash_ledger;
CREATE TRIGGER trg_guard_cash_ledger_origem_destino
BEFORE INSERT ON public.cash_ledger
FOR EACH ROW
EXECUTE FUNCTION public.guard_cash_ledger_origem_destino();