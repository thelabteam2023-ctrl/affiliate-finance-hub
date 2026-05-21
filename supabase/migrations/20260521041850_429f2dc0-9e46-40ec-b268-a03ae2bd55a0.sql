
CREATE OR REPLACE FUNCTION public.fn_sync_aposta_simples_resultado_financeiro()
 RETURNS trigger
 LANGUAGE plpgsql
 AS $function$
 DECLARE
   v_lucro numeric := 0;
   v_retorno numeric := 0;
   v_real numeric := 0;
   v_freebet numeric := 0;
   v_stake numeric := 0;
   v_odd numeric := 1;
 BEGIN
   -- Apenas para SIMPLES
   IF COALESCE(NEW.forma_registro, 'SIMPLES') <> 'SIMPLES' THEN
     RETURN NEW;
   END IF;

   -- Se o lucro já foi preenchido por um RPC (reliquidar_aposta_v6), não mexer
   -- Exceto se o resultado mudou nesta transação
   IF TG_OP = 'UPDATE' AND OLD.resultado IS NOT NULL AND OLD.resultado = NEW.resultado AND NEW.lucro_prejuizo IS NOT NULL THEN
      RETURN NEW;
   END IF;

   -- Só agir se estiver liquidada
   IF NEW.status <> 'LIQUIDADA' OR NEW.resultado IS NULL OR NEW.resultado = 'PENDENTE' THEN
     NEW.lucro_prejuizo := NULL;
     NEW.valor_retorno := NULL;
     RETURN NEW;
   END IF;

   -- Lógica de cálculo base (Single Entry Fallback)
   v_stake := COALESCE(NEW.stake, 0);
   v_odd := COALESCE(NULLIF(NEW.odd, 0), NULLIF(NEW.odd_final, 0), 1);
   
   -- APLICAR BOOST SE EXISTIR
   IF COALESCE(NEW.boost_percentual, 0) > 0 THEN
      v_odd := v_odd * (1 + (NEW.boost_percentual / 100.0));
   END IF;

   v_freebet := COALESCE(NEW.stake_freebet, 0);
   v_real := COALESCE(NEW.stake_real, GREATEST(v_stake - v_freebet, 0));

   -- Fallback de fonte de saldo
   IF v_real = 0 AND v_freebet = 0 THEN
     IF COALESCE(NEW.fonte_saldo, 'REAL') = 'FREEBET' OR COALESCE(NEW.usar_freebet, false) THEN
       v_freebet := v_stake;
     ELSE
       v_real := v_stake;
     END IF;
   END IF;

   -- Cálculo de Lucro/Prejuízo Nominal (SNR para freebet)
   -- GREEN: (stake total * odd) - stake real -> Payout - Stake Real = Lucro Líquido
   -- Aqui o sistema usa SNR (Stake Not Returned) para Freebets por padrão no lucro.
   NEW.lucro_prejuizo := ROUND(CASE NEW.resultado
     WHEN 'GREEN' THEN ((v_real + v_freebet) * v_odd) - (v_real + v_freebet)
     WHEN 'MEIO_GREEN' THEN (((v_real + v_freebet) * v_odd) - (v_real + v_freebet)) / 2
     WHEN 'VOID' THEN 0
     WHEN 'MEIO_RED' THEN -(v_real / 2)
     WHEN 'RED' THEN -v_real
     ELSE 0
   END, 2);

   -- Cálculo de Valor Retorno (Fluxo de Caixa)
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
