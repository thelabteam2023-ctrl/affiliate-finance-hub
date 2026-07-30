CREATE OR REPLACE FUNCTION public.fn_cash_ledger_snapshot_valor_usd()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_moeda text;
  v_ref timestamptz;
  v_usd_brl numeric;
  v_moeda_brl numeric;
  v_valor numeric;
BEGIN
  -- Snapshot imutável: se já informado, respeita (não reprecifica)
  IF NEW.valor_usd IS NOT NULL AND NEW.valor_usd <> 0 THEN
    RETURN NEW;
  END IF;

  v_valor := COALESCE(NEW.valor, 0);
  IF v_valor = 0 THEN
    RETURN NEW;
  END IF;

  v_moeda := UPPER(COALESCE(NEW.moeda, 'BRL'));
  v_ref := COALESCE(NEW.data_transacao, NEW.created_at, now());

  -- Moedas dólar-equivalentes: 1:1
  IF v_moeda IN ('USD', 'USDT', 'USDC') THEN
    NEW.valor_usd := v_valor;
    RETURN NEW;
  END IF;

  -- Cotação USD/BRL vigente na data da transação
  SELECT h.rate INTO v_usd_brl
  FROM exchange_rate_history h
  WHERE h.currency_pair = 'USDBRL'
    AND h.fetched_at <= v_ref + interval '1 day'
  ORDER BY h.fetched_at DESC
  LIMIT 1;

  IF v_usd_brl IS NULL OR v_usd_brl = 0 THEN
    SELECT h.rate INTO v_usd_brl
    FROM exchange_rate_history h
    WHERE h.currency_pair = 'USDBRL'
    ORDER BY h.fetched_at DESC
    LIMIT 1;
  END IF;

  -- Sem cotação disponível: deixa nulo (fallback analítico assume)
  IF v_usd_brl IS NULL OR v_usd_brl = 0 THEN
    RETURN NEW;
  END IF;

  IF v_moeda = 'BRL' THEN
    NEW.valor_usd := ROUND(v_valor / v_usd_brl, 6);
    RETURN NEW;
  END IF;

  -- Outras moedas: prioriza a cotação já congelada no lançamento (moeda -> BRL)
  v_moeda_brl := NULLIF(NEW.cotacao, 0);

  IF v_moeda_brl IS NULL THEN
    SELECT h.rate INTO v_moeda_brl
    FROM exchange_rate_history h
    WHERE h.currency_pair = v_moeda || 'BRL'
      AND h.fetched_at <= v_ref + interval '1 day'
    ORDER BY h.fetched_at DESC
    LIMIT 1;
  END IF;

  IF v_moeda_brl IS NULL OR v_moeda_brl = 0 THEN
    RETURN NEW;
  END IF;

  NEW.valor_usd := ROUND(v_valor * v_moeda_brl / v_usd_brl, 6);
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS tr_cash_ledger_snapshot_valor_usd ON public.cash_ledger;

CREATE TRIGGER tr_cash_ledger_snapshot_valor_usd
BEFORE INSERT ON public.cash_ledger
FOR EACH ROW
EXECUTE FUNCTION public.fn_cash_ledger_snapshot_valor_usd();

COMMENT ON COLUMN public.cash_ledger.valor_usd IS
  'Snapshot imutável do valor em USD na data da transação (preenchido por tr_cash_ledger_snapshot_valor_usd). Nunca reprecificar retroativamente.';