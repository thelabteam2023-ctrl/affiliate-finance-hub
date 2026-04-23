CREATE OR REPLACE FUNCTION public.fn_recalc_aposta_consolidado()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_proj RECORD;
  v_total_nativo NUMERIC := 0;
  v_total_consolidado NUMERIC := 0;
  v_perna RECORD;
  v_rate_perna NUMERIC;
  v_rate_consol NUMERIC;
  v_rate_aposta NUMERIC;
  v_moedas_distintas INT := 0;
  v_is_multi BOOLEAN := FALSE;
  v_perna_count INT := 0;
  v_moeda_origem TEXT;
BEGIN
  IF NEW.status <> 'LIQUIDADA' THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE'
     AND OLD.status = 'LIQUIDADA'
     AND OLD.resultado IS NOT DISTINCT FROM NEW.resultado
     AND COALESCE(OLD.lucro_prejuizo, 0) = COALESCE(NEW.lucro_prejuizo, 0) THEN
    RETURN NEW;
  END IF;

  SELECT
    COALESCE(moeda_consolidacao, 'BRL') AS moeda_consolidacao,
    COALESCE(cotacao_trabalho, 1) AS r_usd,
    COALESCE(cotacao_trabalho_eur, 1) AS r_eur,
    COALESCE(cotacao_trabalho_gbp, 1) AS r_gbp,
    COALESCE(cotacao_trabalho_myr, 1) AS r_myr,
    COALESCE(cotacao_trabalho_mxn, 1) AS r_mxn,
    COALESCE(cotacao_trabalho_ars, 1) AS r_ars,
    COALESCE(cotacao_trabalho_cop, 1) AS r_cop
  INTO v_proj
  FROM public.projetos
  WHERE id = NEW.projeto_id;

  IF NOT FOUND THEN
    RETURN NEW;
  END IF;

  v_rate_consol := CASE v_proj.moeda_consolidacao
    WHEN 'BRL' THEN 1
    WHEN 'USD' THEN v_proj.r_usd
    WHEN 'EUR' THEN v_proj.r_eur
    WHEN 'GBP' THEN v_proj.r_gbp
    WHEN 'MYR' THEN v_proj.r_myr
    WHEN 'MXN' THEN v_proj.r_mxn
    WHEN 'ARS' THEN v_proj.r_ars
    WHEN 'COP' THEN v_proj.r_cop
    ELSE 1
  END;

  IF COALESCE(v_rate_consol, 0) = 0 THEN
    v_rate_consol := 1;
  END IF;

  SELECT COUNT(*)
  INTO v_perna_count
  FROM public.apostas_pernas
  WHERE aposta_id = NEW.id;

  IF v_perna_count = 0 THEN
    v_moeda_origem := COALESCE(NULLIF(NEW.moeda_operacao, ''), v_proj.moeda_consolidacao, 'BRL');

    v_rate_aposta := CASE v_moeda_origem
      WHEN 'BRL' THEN 1
      WHEN 'USD' THEN v_proj.r_usd
      WHEN 'EUR' THEN v_proj.r_eur
      WHEN 'GBP' THEN v_proj.r_gbp
      WHEN 'MYR' THEN v_proj.r_myr
      WHEN 'MXN' THEN v_proj.r_mxn
      WHEN 'ARS' THEN v_proj.r_ars
      WHEN 'COP' THEN v_proj.r_cop
      ELSE 1
    END;

    IF COALESCE(v_rate_aposta, 0) = 0 THEN
      v_rate_aposta := 1;
    END IF;

    NEW.pl_consolidado := (COALESCE(NEW.lucro_prejuizo, 0) * v_rate_aposta) / v_rate_consol;
    NEW.consolidation_currency := v_proj.moeda_consolidacao;
    NEW.is_multicurrency := (v_moeda_origem <> v_proj.moeda_consolidacao);
    NEW.conversion_rate_used := v_rate_aposta / v_rate_consol;

    RETURN NEW;
  END IF;

  SELECT COUNT(DISTINCT moeda)
  INTO v_moedas_distintas
  FROM public.apostas_pernas
  WHERE aposta_id = NEW.id;

  v_is_multi := v_moedas_distintas > 1
    OR EXISTS (
      SELECT 1
      FROM public.apostas_pernas
      WHERE aposta_id = NEW.id
        AND moeda <> v_proj.moeda_consolidacao
    );

  FOR v_perna IN
    SELECT moeda, COALESCE(lucro_prejuizo, 0) AS lp
    FROM public.apostas_pernas
    WHERE aposta_id = NEW.id
  LOOP
    v_rate_perna := CASE v_perna.moeda
      WHEN 'BRL' THEN 1
      WHEN 'USD' THEN v_proj.r_usd
      WHEN 'EUR' THEN v_proj.r_eur
      WHEN 'GBP' THEN v_proj.r_gbp
      WHEN 'MYR' THEN v_proj.r_myr
      WHEN 'MXN' THEN v_proj.r_mxn
      WHEN 'ARS' THEN v_proj.r_ars
      WHEN 'COP' THEN v_proj.r_cop
      ELSE 1
    END;

    IF COALESCE(v_rate_perna, 0) = 0 THEN
      v_rate_perna := 1;
    END IF;

    v_total_nativo := v_total_nativo + v_perna.lp;
    v_total_consolidado := v_total_consolidado + (v_perna.lp * v_rate_perna) / v_rate_consol;
  END LOOP;

  NEW.pl_consolidado := v_total_consolidado;
  NEW.consolidation_currency := v_proj.moeda_consolidacao;
  NEW.is_multicurrency := v_is_multi;

  IF v_is_multi THEN
    NEW.moeda_operacao := 'MULTI';
    NEW.lucro_prejuizo := v_total_consolidado;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_recalc_aposta_consolidado ON public.apostas_unificada;

CREATE TRIGGER trg_recalc_aposta_consolidado
BEFORE INSERT OR UPDATE ON public.apostas_unificada
FOR EACH ROW
EXECUTE FUNCTION public.fn_recalc_aposta_consolidado();