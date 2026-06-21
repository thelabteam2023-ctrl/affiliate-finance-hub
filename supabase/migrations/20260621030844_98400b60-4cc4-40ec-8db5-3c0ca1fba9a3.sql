CREATE OR REPLACE FUNCTION public.fn_recalc_aposta_consolidado()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
DECLARE
  v_total_consolidado NUMERIC := 0;
  v_entry RECORD;
  v_rate NUMERIC;
  v_moeda_consolidacao TEXT;
  v_rates JSONB;
  v_brl_rate_from NUMERIC;
  v_brl_rate_to NUMERIC;
  v_has_entries BOOLEAN;
  v_has_pernas BOOLEAN;
  v_is_multi BOOLEAN := FALSE;
  v_simples_lucro NUMERIC := 0;
  v_simples_real NUMERIC;
  v_simples_freebet NUMERIC;
  v_simples_odd NUMERIC;
  v_simples_moeda TEXT;
  v_simples_tipo TEXT;
BEGIN
  SELECT 
    p.moeda_consolidacao,
    jsonb_build_object(
      'USD', COALESCE(p.cotacao_trabalho, 1),
      'EUR', COALESCE(p.cotacao_trabalho_eur, 1),
      'GBP', COALESCE(p.cotacao_trabalho_gbp, 1),
      'MYR', COALESCE(p.cotacao_trabalho_myr, 1),
      'MXN', COALESCE(p.cotacao_trabalho_mxn, 1),
      'ARS', COALESCE(p.cotacao_trabalho_ars, 1),
      'COP', COALESCE(p.cotacao_trabalho_cop, 1),
      'BRL', 1
    )
  INTO v_moeda_consolidacao, v_rates
  FROM public.projetos p
  WHERE p.id = NEW.projeto_id;

  IF NOT FOUND THEN RETURN NEW; END IF;
  v_moeda_consolidacao := COALESCE(v_moeda_consolidacao, 'BRL');

  SELECT EXISTS (
    SELECT 1 FROM public.apostas_perna_entradas ae
    JOIN public.apostas_pernas ap ON ap.id = ae.perna_id
    WHERE ap.aposta_id = NEW.id
  ) INTO v_has_entries;

  SELECT EXISTS (SELECT 1 FROM public.apostas_pernas WHERE aposta_id = NEW.id)
  INTO v_has_pernas;

  IF v_has_entries THEN
    FOR v_entry IN
      SELECT ae.moeda, ae.stake, ae.odd, ap.resultado, ae.fonte_saldo, LOWER(COALESCE(ap.tipo,'back')) AS tipo
      FROM public.apostas_perna_entradas ae
      JOIN public.apostas_pernas ap ON ap.id = ae.perna_id
      WHERE ap.aposta_id = NEW.id
    LOOP
      IF UPPER(COALESCE(v_entry.moeda, 'BRL')) != v_moeda_consolidacao THEN
        v_is_multi := true;
      END IF;
      v_brl_rate_from := COALESCE((v_rates->>UPPER(COALESCE(v_entry.moeda, 'BRL')))::NUMERIC, 1);
      v_brl_rate_to := COALESCE((v_rates->>UPPER(v_moeda_consolidacao))::NUMERIC, 1);
      v_rate := CASE 
        WHEN UPPER(COALESCE(v_entry.moeda, 'BRL')) = v_moeda_consolidacao THEN 1 
        WHEN v_brl_rate_to > 0 THEN v_brl_rate_from / v_brl_rate_to 
        ELSE 1 
      END;
      DECLARE
        v_entry_lucro NUMERIC := 0;
        v_is_fb BOOLEAN := (v_entry.fonte_saldo = 'FREEBET');
        v_is_lay BOOLEAN := (v_entry.tipo = 'lay');
      BEGIN
        IF v_is_lay THEN
          -- LAY: GREEN = ganha o stake do apostador; RED = paga liability stake*(odd-1)
          CASE v_entry.resultado
            WHEN 'GREEN' THEN v_entry_lucro := v_entry.stake;
            WHEN 'RED' THEN v_entry_lucro := -(v_entry.stake * (v_entry.odd - 1));
            WHEN 'MEIO_GREEN' THEN v_entry_lucro := v_entry.stake / 2;
            WHEN 'MEIO_RED' THEN v_entry_lucro := -(v_entry.stake * (v_entry.odd - 1)) / 2;
            WHEN 'VOID' THEN v_entry_lucro := 0;
            ELSE v_entry_lucro := 0;
          END CASE;
        ELSE
          CASE v_entry.resultado
            WHEN 'GREEN' THEN v_entry_lucro := CASE WHEN v_is_fb THEN v_entry.stake * (v_entry.odd - 1) ELSE (v_entry.stake * v_entry.odd) - v_entry.stake END;
            WHEN 'RED' THEN v_entry_lucro := CASE WHEN v_is_fb THEN 0 ELSE -v_entry.stake END;
            WHEN 'MEIO_GREEN' THEN v_entry_lucro := CASE WHEN v_is_fb THEN (v_entry.stake * (v_entry.odd - 1)) / 2 ELSE (v_entry.stake + (v_entry.stake * (v_entry.odd - 1) / 2)) - v_entry.stake END;
            WHEN 'MEIO_RED' THEN v_entry_lucro := CASE WHEN v_is_fb THEN 0 ELSE -(v_entry.stake / 2) END;
            WHEN 'VOID' THEN v_entry_lucro := 0;
            ELSE v_entry_lucro := 0;
          END CASE;
        END IF;
        v_total_consolidado := v_total_consolidado + (v_entry_lucro * v_rate);
      END;
    END LOOP;
  ELSIF v_has_pernas THEN
    -- Caminho com pernas (sem entradas): confia em lucro_prejuizo já gravado pela perna
    -- (a perna LAY grava lucro_prejuizo corretamente via fn_recalc_perna). Mantemos soma simples.
    FOR v_entry IN
      SELECT moeda, COALESCE(lucro_prejuizo, 0) AS lp, resultado
      FROM public.apostas_pernas
      WHERE aposta_id = NEW.id
    LOOP
      IF UPPER(COALESCE(v_entry.moeda, 'BRL')) != v_moeda_consolidacao THEN
        v_is_multi := true;
      END IF;
      v_brl_rate_from := COALESCE((v_rates->>UPPER(COALESCE(v_entry.moeda, 'BRL')))::NUMERIC, 1);
      v_brl_rate_to := COALESCE((v_rates->>UPPER(v_moeda_consolidacao))::NUMERIC, 1);
      v_rate := CASE 
        WHEN UPPER(COALESCE(v_entry.moeda, 'BRL')) = v_moeda_consolidacao THEN 1 
        WHEN v_brl_rate_to > 0 THEN v_brl_rate_from / v_brl_rate_to 
        ELSE 1 
      END;
      v_total_consolidado := v_total_consolidado + (COALESCE(v_entry.lp, 0) * v_rate);
    END LOOP;
  ELSE
    v_simples_moeda := UPPER(COALESCE(NEW.moeda_operacao, 'BRL'));
    v_simples_freebet := COALESCE(NEW.stake_freebet, 0);
    v_simples_real := COALESCE(NEW.stake_real, GREATEST(COALESCE(NEW.stake, 0) - v_simples_freebet, 0));
    v_simples_odd := COALESCE(NULLIF(NEW.odd, 0), NULLIF(NEW.odd_final, 0), 1);
    v_simples_tipo := LOWER(COALESCE(NEW.tipo, 'back'));

    IF v_simples_moeda != v_moeda_consolidacao THEN
      v_is_multi := true;
    END IF;

    v_brl_rate_from := COALESCE((v_rates->>v_simples_moeda)::NUMERIC, 1);
    v_brl_rate_to := COALESCE((v_rates->>UPPER(v_moeda_consolidacao))::NUMERIC, 1);
    v_rate := CASE
      WHEN v_simples_moeda = v_moeda_consolidacao THEN 1
      WHEN v_brl_rate_to > 0 THEN v_brl_rate_from / v_brl_rate_to
      ELSE 1
    END;

    IF NEW.status = 'LIQUIDADA' AND NEW.resultado IS NOT NULL THEN
      IF v_simples_tipo = 'lay' THEN
        v_simples_lucro := CASE NEW.resultado
          WHEN 'GREEN' THEN v_simples_real + v_simples_freebet
          WHEN 'MEIO_GREEN' THEN (v_simples_real + v_simples_freebet) / 2
          WHEN 'VOID' THEN 0
          WHEN 'MEIO_RED' THEN -((v_simples_real + v_simples_freebet) * (v_simples_odd - 1)) / 2
          WHEN 'RED' THEN -((v_simples_real + v_simples_freebet) * (v_simples_odd - 1))
          ELSE 0
        END;
      ELSE
        v_simples_lucro := CASE NEW.resultado
          WHEN 'GREEN' THEN (v_simples_real * (v_simples_odd - 1)) + (v_simples_freebet * (v_simples_odd - 1))
          WHEN 'MEIO_GREEN' THEN ((v_simples_real * (v_simples_odd - 1)) / 2) + ((v_simples_freebet * (v_simples_odd - 1)) / 2)
          WHEN 'VOID' THEN 0
          WHEN 'MEIO_RED' THEN -(v_simples_real / 2)
          WHEN 'RED' THEN -v_simples_real
          ELSE 0
        END;
      END IF;
      v_total_consolidado := v_simples_lucro * v_rate;
    ELSE
      v_total_consolidado := 0;
    END IF;
  END IF;

  NEW.pl_consolidado := ROUND(v_total_consolidado, 4);
  NEW.consolidation_currency := v_moeda_consolidacao;
  NEW.is_multicurrency := v_is_multi;

  IF v_is_multi THEN
    NEW.moeda_operacao := COALESCE(NEW.moeda_operacao, 'MULTI');
    IF NEW.forma_registro = 'ARBITRAGEM' THEN
      NEW.lucro_prejuizo := NEW.pl_consolidado;
    END IF;
  ELSE
    IF NEW.forma_registro = 'ARBITRAGEM' THEN
      NEW.lucro_prejuizo := NEW.pl_consolidado;
    END IF;
  END IF;

  RETURN NEW;
END;
$function$;

NOTIFY pgrst, 'reload schema';