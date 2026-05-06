-- 1. Atualizar lucro_prejuizo nas pernas baseado no resultado e entradas
DO $$
DECLARE
    r RECORD;
    v_lucro NUMERIC;
    v_payout NUMERIC;
    v_is_fb BOOLEAN;
BEGIN
    FOR r IN SELECT id, stake, odd, resultado, COALESCE(fonte_saldo, 'REAL') as fonte_saldo FROM public.apostas_pernas LOOP
        v_lucro := 0;
        IF r.resultado IS NOT NULL AND r.resultado <> 'PENDENTE' THEN
            -- Se tem entradas, somar o lucro das entradas usando o resultado da perna (r.resultado)
            SELECT SUM(
                CASE r.resultado
                    WHEN 'GREEN' THEN (CASE WHEN fonte_saldo = 'FREEBET' THEN stake * (odd - 1) ELSE stake * odd END) - (CASE WHEN fonte_saldo = 'FREEBET' THEN 0 ELSE stake END)
                    WHEN 'RED' THEN (CASE WHEN fonte_saldo = 'FREEBET' THEN 0 ELSE -stake END)
                    WHEN 'MEIO_GREEN' THEN (CASE WHEN fonte_saldo = 'FREEBET' THEN (stake * (odd - 1))/2 ELSE stake + (stake * (odd - 1))/2 END) - (CASE WHEN fonte_saldo = 'FREEBET' THEN 0 ELSE stake END)
                    WHEN 'MEIO_RED' THEN (CASE WHEN fonte_saldo = 'FREEBET' THEN 0 ELSE -stake/2 END)
                    WHEN 'VOID' THEN 0
                    ELSE 0
                END
            ) INTO v_lucro
            FROM public.apostas_perna_entradas
            WHERE perna_id = r.id;

            -- Se não tem entradas (ou se SUM retornou NULL), calcular pela perna
            IF v_lucro IS NULL THEN
                v_is_fb := (r.fonte_saldo = 'FREEBET');
                IF r.resultado = 'GREEN' THEN
                    v_payout := CASE WHEN v_is_fb THEN r.stake * (r.odd - 1) ELSE r.stake * r.odd END;
                    v_lucro := v_payout - (CASE WHEN v_is_fb THEN 0 ELSE r.stake END);
                ELSIF r.resultado = 'RED' THEN
                    v_lucro := CASE WHEN v_is_fb THEN 0 ELSE -r.stake END;
                ELSIF r.resultado = 'MEIO_GREEN' THEN
                     v_payout := CASE WHEN v_is_fb THEN (r.stake * (r.odd - 1))/2 ELSE r.stake + (r.stake * (r.odd - 1))/2 END;
                     v_lucro := v_payout - (CASE WHEN v_is_fb THEN 0 ELSE r.stake END);
                ELSIF r.resultado = 'MEIO_RED' THEN
                     v_lucro := CASE WHEN v_is_fb THEN 0 ELSE -r.stake/2 END;
                ELSE
                    v_lucro := 0;
                END IF;
            END IF;
        END IF;

        UPDATE public.apostas_pernas SET lucro_prejuizo = COALESCE(v_lucro, 0) WHERE id = r.id;
    END LOOP;
END $$;

-- 2. Recalcular aposta pai para todas as SUREBETs
DO $$
DECLARE
    r_bet RECORD;
    v_res RECORD;
BEGIN
    FOR r_bet IN SELECT id FROM public.apostas_unificada WHERE estrategia = 'SUREBET' LOOP
        SELECT * INTO v_res FROM public.fn_recalc_pai_surebet(r_bet.id);
        
        UPDATE public.apostas_unificada SET
            lucro_prejuizo = v_res.lucro_total,
            stake_total = v_res.stake_total,
            pl_consolidado = v_res.pl_consolidado,
            stake_consolidado = v_res.stake_consolidado,
            consolidation_currency = v_res.consolidation_currency,
            is_multicurrency = v_res.is_multicurrency
        WHERE id = r_bet.id;
    END LOOP;
END $$;
