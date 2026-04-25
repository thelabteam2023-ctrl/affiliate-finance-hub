CREATE OR REPLACE FUNCTION public.fn_sync_aposta_simples_resultado_financeiro()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_has_pernas boolean := false;
  v_lucro numeric := 0;
  v_retorno numeric := 0;
  v_lucro_consolidado numeric := 0;
  v_retorno_consolidado numeric := 0;
  v_is_multicurrency boolean := false;
  v_proj record;
  v_rate_consol numeric := 1;
  v_rate_perna numeric := 1;
  v_real numeric := 0;
  v_freebet numeric := 0;
  v_stake numeric := 0;
  v_odd numeric := 1;
  v_perna record;
  v_perna_lucro numeric := 0;
  v_perna_retorno numeric := 0;
BEGIN
  IF COALESCE(NEW.forma_registro, 'SIMPLES') <> 'SIMPLES' THEN
    RETURN NEW;
  END IF;

  IF NEW.status <> 'LIQUIDADA' OR NEW.resultado IS NULL OR NEW.resultado = 'PENDENTE' THEN
    RETURN NEW;
  END IF;

  IF NEW.resultado NOT IN ('GREEN', 'RED', 'VOID', 'MEIO_GREEN', 'MEIO_RED') THEN
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

  v_rate_consol := CASE COALESCE(v_proj.moeda_consolidacao, 'BRL')
    WHEN 'BRL' THEN 1
    WHEN 'USD' THEN COALESCE(v_proj.r_usd, 1)
    WHEN 'EUR' THEN COALESCE(v_proj.r_eur, 1)
    WHEN 'GBP' THEN COALESCE(v_proj.r_gbp, 1)
    WHEN 'MYR' THEN COALESCE(v_proj.r_myr, 1)
    WHEN 'MXN' THEN COALESCE(v_proj.r_mxn, 1)
    WHEN 'ARS' THEN COALESCE(v_proj.r_ars, 1)
    WHEN 'COP' THEN COALESCE(v_proj.r_cop, 1)
    ELSE 1
  END;
  IF COALESCE(v_rate_consol, 0) = 0 THEN
    v_rate_consol := 1;
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.apostas_pernas WHERE aposta_id = NEW.id
  ) INTO v_has_pernas;

  IF v_has_pernas THEN
    FOR v_perna IN
      SELECT *
      FROM public.apostas_pernas
      WHERE aposta_id = NEW.id
      ORDER BY ordem
    LOOP
      v_stake := COALESCE(v_perna.stake, 0);
      v_odd := COALESCE(NULLIF(v_perna.odd, 0), 1);
      v_freebet := COALESCE(v_perna.stake_freebet, 0);
      v_real := COALESCE(v_perna.stake_real, GREATEST(v_stake - v_freebet, 0));

      IF v_real = 0 AND v_freebet = 0 THEN
        IF COALESCE(v_perna.fonte_saldo, 'REAL') = 'FREEBET' THEN
          v_freebet := v_stake;
        ELSE
          v_real := v_stake;
        END IF;
      END IF;

      v_perna_lucro := CASE NEW.resultado
        WHEN 'GREEN' THEN (v_real + v_freebet) * (v_odd - 1)
        WHEN 'MEIO_GREEN' THEN ((v_real + v_freebet) * (v_odd - 1)) / 2
        WHEN 'VOID' THEN 0
        WHEN 'MEIO_RED' THEN -(v_real / 2)
        WHEN 'RED' THEN -v_real
        ELSE 0
      END;

      v_perna_retorno := CASE NEW.resultado
        WHEN 'GREEN' THEN (v_real * v_odd) + (v_freebet * (v_odd - 1))
        WHEN 'MEIO_GREEN' THEN v_real + (v_real * (v_odd - 1) / 2) + (v_freebet * (v_odd - 1) / 2)
        WHEN 'VOID' THEN v_real
        WHEN 'MEIO_RED' THEN v_real / 2
        WHEN 'RED' THEN 0
        ELSE 0
      END;

      v_lucro := v_lucro + v_perna_lucro;
      v_retorno := v_retorno + v_perna_retorno;

      v_rate_perna := CASE COALESCE(v_perna.moeda, 'BRL')
        WHEN 'BRL' THEN 1
        WHEN 'USD' THEN COALESCE(v_proj.r_usd, 1)
        WHEN 'EUR' THEN COALESCE(v_proj.r_eur, 1)
        WHEN 'GBP' THEN COALESCE(v_proj.r_gbp, 1)
        WHEN 'MYR' THEN COALESCE(v_proj.r_myr, 1)
        WHEN 'MXN' THEN COALESCE(v_proj.r_mxn, 1)
        WHEN 'ARS' THEN COALESCE(v_proj.r_ars, 1)
        WHEN 'COP' THEN COALESCE(v_proj.r_cop, 1)
        ELSE 1
      END;
      IF COALESCE(v_rate_perna, 0) = 0 THEN
        v_rate_perna := 1;
      END IF;

      IF COALESCE(v_perna.moeda, 'BRL') <> COALESCE(v_proj.moeda_consolidacao, 'BRL') THEN
        v_is_multicurrency := true;
      END IF;

      v_lucro_consolidado := v_lucro_consolidado + ((v_perna_lucro * v_rate_perna) / v_rate_consol);
      v_retorno_consolidado := v_retorno_consolidado + ((v_perna_retorno * v_rate_perna) / v_rate_consol);
    END LOOP;

    IF v_is_multicurrency OR COALESCE(NEW.is_multicurrency, false) THEN
      NEW.lucro_prejuizo := ROUND(v_lucro_consolidado, 2);
      NEW.valor_retorno := ROUND(v_retorno_consolidado, 2);
      NEW.pl_consolidado := ROUND(v_lucro_consolidado, 2);
      NEW.consolidation_currency := COALESCE(v_proj.moeda_consolidacao, 'BRL');
      NEW.is_multicurrency := true;
      NEW.moeda_operacao := 'MULTI';
    ELSE
      NEW.lucro_prejuizo := ROUND(v_lucro, 2);
      NEW.valor_retorno := ROUND(v_retorno, 2);
    END IF;

    RETURN NEW;
  END IF;

  v_stake := COALESCE(NEW.stake, 0);
  v_odd := COALESCE(NULLIF(NEW.odd, 0), NULLIF(NEW.odd_final, 0), 1);
  v_freebet := COALESCE(NEW.stake_freebet, 0);
  v_real := COALESCE(NEW.stake_real, GREATEST(v_stake - v_freebet, 0));

  IF v_real = 0 AND v_freebet = 0 THEN
    IF COALESCE(NEW.fonte_saldo, 'REAL') = 'FREEBET' OR COALESCE(NEW.usar_freebet, false) THEN
      v_freebet := v_stake;
    ELSE
      v_real := v_stake;
    END IF;
  END IF;

  NEW.lucro_prejuizo := ROUND(CASE NEW.resultado
    WHEN 'GREEN' THEN (v_real + v_freebet) * (v_odd - 1)
    WHEN 'MEIO_GREEN' THEN ((v_real + v_freebet) * (v_odd - 1)) / 2
    WHEN 'VOID' THEN 0
    WHEN 'MEIO_RED' THEN -(v_real / 2)
    WHEN 'RED' THEN -v_real
    ELSE 0
  END, 2);

  NEW.valor_retorno := ROUND(CASE NEW.resultado
    WHEN 'GREEN' THEN (v_real * v_odd) + (v_freebet * (v_odd - 1))
    WHEN 'MEIO_GREEN' THEN v_real + (v_real * (v_odd - 1) / 2) + (v_freebet * (v_odd - 1) / 2)
    WHEN 'VOID' THEN v_real
    WHEN 'MEIO_RED' THEN v_real / 2
    WHEN 'RED' THEN 0
    ELSE 0
  END, 2);

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tg_sync_aposta_simples_resultado_financeiro ON public.apostas_unificada;
CREATE TRIGGER tg_sync_aposta_simples_resultado_financeiro
BEFORE INSERT OR UPDATE OF status, resultado, stake, odd, odd_final, stake_real, stake_freebet, usar_freebet, fonte_saldo
ON public.apostas_unificada
FOR EACH ROW
EXECUTE FUNCTION public.fn_sync_aposta_simples_resultado_financeiro();