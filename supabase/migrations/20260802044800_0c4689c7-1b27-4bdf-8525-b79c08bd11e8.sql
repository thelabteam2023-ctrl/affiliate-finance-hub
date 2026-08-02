
-- 1) Guard: uma ponta (origem/destino) não pode referenciar conta bancária E wallet ao mesmo tempo
CREATE OR REPLACE FUNCTION public.fn_cash_ledger_enforce_single_medium()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_is_crypto boolean := (NEW.tipo_moeda = 'CRYPTO');
BEGIN
  IF NEW.origem_conta_bancaria_id IS NOT NULL AND NEW.origem_wallet_id IS NOT NULL THEN
    IF v_is_crypto THEN
      NEW.origem_conta_bancaria_id := NULL;
    ELSE
      NEW.origem_wallet_id := NULL;
    END IF;
  END IF;

  IF NEW.destino_conta_bancaria_id IS NOT NULL AND NEW.destino_wallet_id IS NOT NULL THEN
    IF v_is_crypto THEN
      NEW.destino_conta_bancaria_id := NULL;
    ELSE
      NEW.destino_wallet_id := NULL;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_cash_ledger_enforce_single_medium ON public.cash_ledger;
CREATE TRIGGER trg_cash_ledger_enforce_single_medium
BEFORE INSERT OR UPDATE ON public.cash_ledger
FOR EACH ROW EXECUTE FUNCTION public.fn_cash_ledger_enforce_single_medium();

-- 2) Backfill somente onde a conta bancária referenciada é incompatível com a moeda
--    do lançamento (linhas que as views de saldo já ignoram => impacto zero em saldos)
UPDATE public.cash_ledger cl
SET origem_conta_bancaria_id = NULL
FROM public.contas_bancarias cb
WHERE cb.id = cl.origem_conta_bancaria_id
  AND cl.origem_wallet_id IS NOT NULL
  AND cl.tipo_moeda = 'CRYPTO'
  AND cb.moeda IS DISTINCT FROM cl.moeda
  AND cb.moeda IS DISTINCT FROM cl.moeda_origem
  AND cb.moeda IS DISTINCT FROM cl.moeda_destino;

UPDATE public.cash_ledger cl
SET destino_conta_bancaria_id = NULL
FROM public.contas_bancarias cb
WHERE cb.id = cl.destino_conta_bancaria_id
  AND cl.destino_wallet_id IS NOT NULL
  AND cl.tipo_moeda = 'CRYPTO'
  AND cb.moeda IS DISTINCT FROM cl.moeda
  AND cb.moeda IS DISTINCT FROM cl.moeda_origem
  AND cb.moeda IS DISTINCT FROM cl.moeda_destino;
