CREATE OR REPLACE FUNCTION public.fn_recalc_aposta_consolidado()
 RETURNS trigger
 LANGUAGE plpgsql
 AS $function$
 DECLARE
   v_proj RECORD;
   v_total_consolidado NUMERIC := 0;
   v_entry RECORD;
   v_rate NUMERIC;
   v_moeda_consolidacao TEXT;
   v_rates JSONB;
   v_brl_rate_from NUMERIC;
   v_brl_rate_to NUMERIC;
   v_has_entries BOOLEAN;
   v_moedas_distintas INT := 0;
   v_is_multi BOOLEAN := FALSE;
 BEGIN
   -- NOVO: Se houver override manual, não recalcula o PL consolidado
   -- Mantém o valor que foi setado manualmente
   IF NEW.is_manual_override = true THEN
     RETURN NEW;
   END IF;

   -- 1. Buscar contexto do projeto
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
 
   -- 2. Verificar se existem entradas reais vinculadas
   SELECT EXISTS (
     SELECT 1 FROM public.apostas_perna_entradas ae
     JOIN public.apostas_pernas ap ON ap.id = ae.perna_id
     WHERE ap.aposta_id = NEW.id
   ) INTO v_has_entries;
 
   IF v_has_entries THEN
     -- CAMINHO MODERNO: Iterar por cada ENTRADA real
     FOR v_entry IN
       SELECT 
         ae.moeda, ae.stake, ae.odd, ap.resultado, ae.fonte_saldo
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
       BEGIN
         CASE v_entry.resultado
           WHEN 'GREEN' THEN 
             v_entry_lucro := CASE WHEN v_is_fb THEN v_entry.stake * (v_entry.odd - 1) ELSE (v_entry.stake * v_entry.odd) - v_entry.stake END;
           WHEN 'RED' THEN 
             v_entry_lucro := CASE WHEN v_is_fb THEN 0 ELSE -v_entry.stake END;
           WHEN 'MEIO_GREEN' THEN 
             v_entry_lucro := CASE WHEN v_is_fb THEN (v_entry.stake * (v_entry.odd - 1)) / 2 ELSE (v_entry.stake + (v_entry.stake * (v_entry.odd - 1) / 2)) - v_entry.stake END;
           WHEN 'MEIO_RED' THEN 
             v_entry_lucro := CASE WHEN v_is_fb THEN 0 ELSE -(v_entry.stake / 2) END;
           WHEN 'VOID' THEN
             v_entry_lucro := 0;
           ELSE 
             v_entry_lucro := 0;
         END CASE;
 
         v_total_consolidado := v_total_consolidado + (v_entry_lucro * v_rate);
       END;
     END LOOP;
   ELSE
     -- CAMINHO LEGADO
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
   END IF;
 
   -- Gravar valores consolidados finais
   NEW.pl_consolidado := ROUND(v_total_consolidado, 4);
   NEW.is_multicurrency := v_is_multi;
   NEW.consolidation_currency := v_moeda_consolidacao;
 
   -- Manter lucro_prejuizo sincronizado para compatibilidade
   NEW.lucro_prejuizo := NEW.pl_consolidado;
 
   RETURN NEW;
 END;
 $function$;
