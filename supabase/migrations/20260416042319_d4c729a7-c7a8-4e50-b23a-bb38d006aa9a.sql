
-- Drop the existing function first (signature mismatch)
DROP FUNCTION IF EXISTS public.fn_recalc_pai_surebet(UUID);

CREATE FUNCTION public.fn_recalc_pai_surebet(p_surebet_id UUID)
RETURNS TABLE(
  todas_liquidadas BOOLEAN,
  lucro_total NUMERIC,
  stake_total NUMERIC,
  resultado_geral TEXT,
  is_multicurrency BOOLEAN,
  pl_consolidado NUMERIC,
  stake_consolidado NUMERIC,
  consolidation_currency TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_moeda_consolidacao TEXT;
  v_perna RECORD;
  v_rate NUMERIC;
  v_todas_liquidadas BOOLEAN := true;
  v_lucro_total NUMERIC := 0;
  v_stake_total NUMERIC := 0;
  v_is_multicurrency BOOLEAN := false;
  v_ct_usd NUMERIC;
  v_ct_eur NUMERIC;
  v_ct_mxn NUMERIC;
  v_ct_gbp NUMERIC;
  v_ct_ars NUMERIC;
  v_ct_cop NUMERIC;
  v_ct_myr NUMERIC;
  v_brl_rate_from NUMERIC;
  v_brl_rate_to NUMERIC;
BEGIN
  -- Get project consolidation currency + cotação de trabalho
  SELECT p.moeda_consolidacao,
         p.cotacao_trabalho,
         p.cotacao_trabalho_eur,
         p.cotacao_trabalho_mxn,
         p.cotacao_trabalho_gbp,
         p.cotacao_trabalho_ars,
         p.cotacao_trabalho_cop,
         p.cotacao_trabalho_myr
  INTO v_moeda_consolidacao,
       v_ct_usd, v_ct_eur, v_ct_mxn, v_ct_gbp, v_ct_ars, v_ct_cop, v_ct_myr
  FROM projetos p
  JOIN apostas_unificada au ON au.projeto_id = p.id
  WHERE au.id = p_surebet_id;

  v_moeda_consolidacao := COALESCE(v_moeda_consolidacao, 'BRL');

  -- Fallback to exchange_rate_cache if cotação de trabalho not set
  IF v_ct_usd IS NULL THEN
    SELECT erc.rate INTO v_ct_usd FROM exchange_rate_cache erc WHERE erc.currency_pair = 'USDBRL' LIMIT 1;
  END IF;
  IF v_ct_eur IS NULL THEN
    SELECT erc.rate INTO v_ct_eur FROM exchange_rate_cache erc WHERE erc.currency_pair = 'EURBRL' LIMIT 1;
  END IF;
  IF v_ct_mxn IS NULL THEN
    SELECT erc.rate INTO v_ct_mxn FROM exchange_rate_cache erc WHERE erc.currency_pair = 'MXNBRL' LIMIT 1;
  END IF;

  FOR v_perna IN
    SELECT ap.moeda, ap.lucro_prejuizo, ap.stake, ap.resultado
    FROM apostas_pernas ap
    WHERE ap.aposta_id = p_surebet_id
  LOOP
    IF v_perna.resultado IS NULL OR v_perna.resultado = 'PENDENTE' THEN
      v_todas_liquidadas := false;
    END IF;

    IF v_perna.moeda != v_moeda_consolidacao THEN
      v_is_multicurrency := true;
    END IF;

    -- BRL rate for leg currency (1 moeda = X BRL) from Cotação de Trabalho
    v_brl_rate_from := CASE UPPER(v_perna.moeda)
      WHEN 'BRL' THEN 1
      WHEN 'USD' THEN COALESCE(v_ct_usd, 1)
      WHEN 'EUR' THEN COALESCE(v_ct_eur, 1)
      WHEN 'MXN' THEN COALESCE(v_ct_mxn, 1)
      WHEN 'GBP' THEN COALESCE(v_ct_gbp, 1)
      WHEN 'ARS' THEN COALESCE(v_ct_ars, 1)
      WHEN 'COP' THEN COALESCE(v_ct_cop, 1)
      WHEN 'MYR' THEN COALESCE(v_ct_myr, 1)
      ELSE 1
    END;

    -- BRL rate for consolidation currency
    v_brl_rate_to := CASE UPPER(v_moeda_consolidacao)
      WHEN 'BRL' THEN 1
      WHEN 'USD' THEN COALESCE(v_ct_usd, 1)
      WHEN 'EUR' THEN COALESCE(v_ct_eur, 1)
      WHEN 'MXN' THEN COALESCE(v_ct_mxn, 1)
      WHEN 'GBP' THEN COALESCE(v_ct_gbp, 1)
      WHEN 'ARS' THEN COALESCE(v_ct_ars, 1)
      WHEN 'COP' THEN COALESCE(v_ct_cop, 1)
      WHEN 'MYR' THEN COALESCE(v_ct_myr, 1)
      ELSE 1
    END;

    -- Pivot BRL conversion: (valor * from_rate) / to_rate
    IF v_perna.moeda = v_moeda_consolidacao THEN
      v_rate := 1;
    ELSIF v_brl_rate_to > 0 THEN
      v_rate := v_brl_rate_from / v_brl_rate_to;
    ELSE
      v_rate := 1;
    END IF;

    v_lucro_total := v_lucro_total + COALESCE(v_perna.lucro_prejuizo, 0) * v_rate;
    v_stake_total := v_stake_total + COALESCE(v_perna.stake, 0) * v_rate;
  END LOOP;

  v_lucro_total := ROUND(v_lucro_total, 2);
  v_stake_total := ROUND(v_stake_total, 2);

  RETURN QUERY SELECT
    v_todas_liquidadas,
    v_lucro_total,
    v_stake_total,
    CASE 
      WHEN v_todas_liquidadas AND v_lucro_total > 0 THEN 'GREEN'
      WHEN v_todas_liquidadas AND v_lucro_total < 0 THEN 'RED'
      WHEN v_todas_liquidadas THEN 'VOID'
      ELSE NULL::TEXT
    END,
    v_is_multicurrency,
    v_lucro_total,
    v_stake_total,
    v_moeda_consolidacao;
END;
$$;
