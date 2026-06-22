CREATE OR REPLACE FUNCTION public.fn_sync_aposta_simples_resultado_financeiro()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
DECLARE
  v_real numeric := 0;
  v_freebet numeric := 0;
  v_stake numeric := 0;
  v_odd numeric := 1;
  v_is_lay BOOLEAN := FALSE;
  v_lay_com NUMERIC;
BEGIN
  IF COALESCE(NEW.forma_registro, 'SIMPLES') <> 'SIMPLES' THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' AND OLD.resultado IS NOT NULL AND OLD.resultado = NEW.resultado AND NEW.lucro_prejuizo IS NOT NULL THEN
    RETURN NEW;
  END IF;

  IF NEW.status <> 'LIQUIDADA' OR NEW.resultado IS NULL OR NEW.resultado = 'PENDENTE' THEN
    NEW.lucro_prejuizo := NULL;
    NEW.valor_retorno := NULL;
    RETURN NEW;
  END IF;

  v_stake := COALESCE(NEW.stake, 0);
  v_odd := COALESCE(NULLIF(NEW.odd, 0), NULLIF(NEW.odd_final, 0), 1);

  IF COALESCE(NEW.boost_percentual, 0) > 0 THEN
    v_odd := v_odd * (1 + (NEW.boost_percentual / 100.0));
  END IF;

  v_freebet := COALESCE(NEW.stake_freebet, 0);
  v_real := COALESCE(NEW.stake_real, GREATEST(v_stake - v_freebet, 0));

  IF v_real = 0 AND v_freebet = 0 THEN
    IF COALESCE(NEW.fonte_saldo, 'REAL') = 'FREEBET' OR COALESCE(NEW.usar_freebet, false) THEN
      v_freebet := v_stake;
    ELSE
      v_real := v_stake;
    END IF;
  END IF;

  -- ============================================================
  -- FASE 2: Detecção LAY (mesma política de borda da Fase 1)
  -- ============================================================
  v_is_lay := (
    NEW.modo_entrada = 'EXCHANGE'
    AND NEW.lay_liability IS NOT NULL
    AND NEW.lay_liability > 0
  );

  IF v_is_lay AND NEW.resultado IN ('GREEN','RED','VOID','CANCELADA') THEN
    v_lay_com := GREATEST(0, LEAST(1, COALESCE(NEW.lay_comissao, 0)));

    NEW.lucro_prejuizo := ROUND(
      CASE
        WHEN NEW.resultado = 'GREEN' THEN v_stake * (1 - v_lay_com)
        WHEN NEW.resultado = 'RED'   THEN -NEW.lay_liability
        WHEN NEW.resultado IN ('VOID','CANCELADA') THEN 0
      END, 2);

    NEW.valor_retorno := ROUND(
      CASE
        WHEN NEW.resultado = 'GREEN' THEN NEW.lay_liability + v_stake * (1 - v_lay_com)
        WHEN NEW.resultado = 'RED'   THEN 0
        WHEN NEW.resultado IN ('VOID','CANCELADA') THEN NEW.lay_liability
      END, 2);

    RETURN NEW;
  END IF;

  -- ===== Ramo BACK original (inalterado) =====
  NEW.lucro_prejuizo := ROUND(CASE NEW.resultado
    WHEN 'GREEN' THEN ((v_real + v_freebet) * v_odd) - (v_real + v_freebet)
    WHEN 'MEIO_GREEN' THEN (((v_real + v_freebet) * v_odd) - (v_real + v_freebet)) / 2
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
$function$;