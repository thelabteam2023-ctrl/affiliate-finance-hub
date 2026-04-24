-- 1. Adicionar coluna ajuste_natureza
ALTER TABLE public.cash_ledger
ADD COLUMN IF NOT EXISTS ajuste_natureza TEXT;

-- 2. CHECK constraint condicional (só validado quando AJUSTE_SALDO)
ALTER TABLE public.cash_ledger
DROP CONSTRAINT IF EXISTS cash_ledger_ajuste_natureza_valid;

ALTER TABLE public.cash_ledger
ADD CONSTRAINT cash_ledger_ajuste_natureza_valid
CHECK (
  tipo_transacao <> 'AJUSTE_SALDO'
  OR ajuste_natureza IN ('RECONCILIACAO_OPERACIONAL', 'EFEITO_FINANCEIRO', 'EXTRAORDINARIO')
);

-- 3. Backfill: classificar todos os ajustes existentes como Reconciliação Operacional
UPDATE public.cash_ledger
SET ajuste_natureza = 'RECONCILIACAO_OPERACIONAL'
WHERE tipo_transacao = 'AJUSTE_SALDO'
  AND ajuste_natureza IS NULL;

-- 4. Trigger BEFORE INSERT para garantir default em novos ajustes
CREATE OR REPLACE FUNCTION public.fn_default_ajuste_natureza()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.tipo_transacao = 'AJUSTE_SALDO' AND NEW.ajuste_natureza IS NULL THEN
    NEW.ajuste_natureza := 'RECONCILIACAO_OPERACIONAL';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_default_ajuste_natureza ON public.cash_ledger;
CREATE TRIGGER trg_default_ajuste_natureza
BEFORE INSERT ON public.cash_ledger
FOR EACH ROW
EXECUTE FUNCTION public.fn_default_ajuste_natureza();

-- 5. Índice parcial para consultas de KPI
CREATE INDEX IF NOT EXISTS idx_cash_ledger_ajuste_natureza
ON public.cash_ledger(projeto_id_snapshot, ajuste_natureza)
WHERE tipo_transacao = 'AJUSTE_SALDO';

-- 6. Comentário documentacional
COMMENT ON COLUMN public.cash_ledger.ajuste_natureza IS
'Classificação do AJUSTE_SALDO: RECONCILIACAO_OPERACIONAL (default — entra em Performance), EFEITO_FINANCEIRO (entra em FX), EXTRAORDINARIO (fora de performance).';