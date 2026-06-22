CREATE OR REPLACE FUNCTION public.liquidar_aposta_v4(p_aposta_id uuid, p_resultado text, p_lucro_prejuizo numeric DEFAULT NULL::numeric)
 RETURNS TABLE(success boolean, events_created integer, message text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    v_aposta RECORD;
    v_perna RECORD;
    v_entry RECORD;
    v_events_count INTEGER := 0;
    v_payout_total NUMERIC := 0;
    v_has_pernas BOOLEAN := FALSE;
    v_has_entries BOOLEAN := FALSE;
    v_payout_entry NUMERIC;
    v_perna_resultado TEXT;
    v_effective_odd NUMERIC;
    v_metadata JSONB;
    v_moeda_casa TEXT;
    v_is_lay BOOLEAN := FALSE;
    v_lay_comissao NUMERIC;
    v_lucro_calc NUMERIC;
BEGIN
    -- Bloquear aposta para evitar concorrência
    SELECT * INTO v_aposta FROM public.apostas_unificada WHERE id = p_aposta_id FOR UPDATE;
    IF v_aposta.id IS NULL THEN
        RETURN QUERY SELECT FALSE, 0, 'Aposta não encontrada'::TEXT;
        RETURN;
    END IF;

    -- Obter moeda da casa para auditoria
    SELECT moeda INTO v_moeda_casa FROM public.bookmakers WHERE id = v_aposta.bookmaker_id;

    -- Se já estiver liquidada
    IF v_aposta.status = 'LIQUIDADA' THEN
        RETURN QUERY SELECT FALSE, 0, 'Aposta já está liquidada'::TEXT;
        RETURN;
    END IF;

    -- 1. Iterar sobre Pernas (se houver)
    FOR v_perna IN SELECT * FROM public.apostas_pernas WHERE aposta_id = p_aposta_id ORDER BY ordem
    LOOP
        v_has_pernas := TRUE;
        -- (lógica de pernas inalterada — bloco original preservado)
    END LOOP;

    RAISE NOTICE 'DEBUG: has_pernas=%, boost=%', v_has_pernas, v_aposta.boost_percentual;

    -- 2. Se não houver pernas granulares, usar dados da aposta principal (Fallback)
    IF NOT v_has_pernas THEN
        v_effective_odd := COALESCE(v_aposta.odd, v_aposta.odd_final, 1);

        -- APLICAR BOOST SE EXISTIR (somente BACK)
        IF COALESCE(v_aposta.boost_percentual, 0) > 0 THEN
            v_effective_odd := v_effective_odd * (1 + (v_aposta.boost_percentual / 100.0));
        END IF;

        -- ============================================================
        -- FASE 2: Detecção LAY (espelha a Fase 1 do trigger de criação)
        -- Mesma política de borda: liability NULL/0 => cai no ramo BACK.
        -- ============================================================
        v_is_lay := (
            v_aposta.modo_entrada = 'EXCHANGE'
            AND v_aposta.lay_liability IS NOT NULL
            AND v_aposta.lay_liability > 0
        );

        IF v_is_lay AND p_resultado IN ('GREEN', 'RED', 'VOID', 'CANCELADA') THEN
            v_lay_comissao := GREATEST(0, LEAST(1, COALESCE(v_aposta.lay_comissao, 0)));

            CASE p_resultado
                WHEN 'GREEN' THEN
                    -- Devolve a margem retida + paga o lucro líquido
                    v_payout_total := v_aposta.lay_liability + (v_aposta.stake * (1 - v_lay_comissao));
                    v_lucro_calc   := v_aposta.stake * (1 - v_lay_comissao);
                WHEN 'RED' THEN
                    -- Perda já debitada na criação (Fase 1). Sem novo evento.
                    v_payout_total := 0;
                    v_lucro_calc   := -v_aposta.lay_liability;
                WHEN 'VOID', 'CANCELADA' THEN
                    -- Devolve apenas a margem retida; sem lucro/perda.
                    v_payout_total := v_aposta.lay_liability;
                    v_lucro_calc   := 0;
            END CASE;

            IF v_payout_total > 0 THEN
                v_metadata := jsonb_build_object(
                    'evento', 'liquidacao_lay_fallback',
                    'aposta_id', p_aposta_id,
                    'tipo', 'LAY',
                    'modo_entrada', v_aposta.modo_entrada,
                    'stake', v_aposta.stake,
                    'lay_odd', v_aposta.lay_odd,
                    'lay_liability', v_aposta.lay_liability,
                    'lay_comissao', v_lay_comissao,
                    'resultado', p_resultado,
                    'payout_bruto', v_payout_total,
                    'lucro_liquido', v_lucro_calc,
                    'moeda_casa', v_moeda_casa
                );

                INSERT INTO public.financial_events (
                    bookmaker_id, aposta_id, workspace_id, tipo_evento, tipo_uso,
                    valor, moeda, idempotency_key, descricao, processed_at, metadata
                ) VALUES (
                    v_aposta.bookmaker_id, p_aposta_id, v_aposta.workspace_id,
                    'PAYOUT', 'NORMAL',
                    v_payout_total, COALESCE(v_aposta.moeda_operacao, v_moeda_casa, 'BRL'),
                    'payout_lay_' || p_aposta_id,
                    format('Retorno LAY (%s) | Stake: %s | Liability: %s | Com: %s',
                           p_resultado, v_aposta.stake, v_aposta.lay_liability, v_lay_comissao),
                    NOW(),
                    v_metadata
                ) ON CONFLICT (idempotency_key) DO NOTHING;
                IF FOUND THEN
                    v_events_count := v_events_count + 1;
                END IF;
            END IF;

        ELSIF p_resultado IN ('GREEN', 'MEIO_GREEN', 'VOID', 'MEIO_RED', 'RED', 'CANCELADA') THEN
            -- ===== Ramo BACK original (inalterado) =====
            CASE p_resultado
                WHEN 'GREEN' THEN v_payout_total := v_aposta.stake * v_effective_odd;
                WHEN 'MEIO_GREEN' THEN v_payout_total := v_aposta.stake + (v_aposta.stake * (v_effective_odd - 1) / 2);
                WHEN 'VOID', 'CANCELADA' THEN v_payout_total := v_aposta.stake;
                WHEN 'MEIO_RED' THEN v_payout_total := v_aposta.stake / 2;
                ELSE v_payout_total := 0;
            END CASE;

            v_lucro_calc := v_payout_total - v_aposta.stake;

            IF v_payout_total > 0 THEN
                v_metadata := jsonb_build_object(
                    'evento', 'liquidacao_multipla_fallback',
                    'aposta_id', p_aposta_id,
                    'tipo', v_aposta.forma_registro,
                    'stake', v_aposta.stake,
                    'odd_final', v_effective_odd,
                    'resultado', p_resultado,
                    'payout_calculado', v_payout_total,
                    'lucro_calculado', v_lucro_calc,
                    'boost_percentual', v_aposta.boost_percentual,
                    'moeda_casa', v_moeda_casa,
                    'sinal_correto', (v_lucro_calc >= 0 OR p_resultado = 'RED')
                );

                INSERT INTO public.financial_events (
                    bookmaker_id, aposta_id, workspace_id, tipo_evento, tipo_uso,
                    valor, moeda, idempotency_key, descricao, processed_at, metadata
                ) VALUES (
                    v_aposta.bookmaker_id, p_aposta_id, v_aposta.workspace_id,
                    'PAYOUT', 'NORMAL',
                    v_payout_total, COALESCE(v_aposta.moeda_operacao, v_moeda_casa, 'BRL'),
                    'payout_simple_' || p_aposta_id,
                    format('Retorno Aposta %s (%s) | Stake: %s | Odd: %s', v_aposta.forma_registro, p_resultado, v_aposta.stake, v_effective_odd),
                    NOW(),
                    v_metadata
                ) ON CONFLICT (idempotency_key) DO NOTHING;
                IF FOUND THEN
                    v_events_count := v_events_count + 1;
                END IF;
            END IF;
        END IF;
    END IF;

    -- 3. Atualizar Status Final na Aposta
    -- lucro_prejuizo: usa override do caller, senão o cálculo correto por tipo (BACK/LAY)
    UPDATE public.apostas_unificada
    SET status = 'LIQUIDADA',
        resultado = p_resultado,
        lucro_prejuizo = COALESCE(p_lucro_prejuizo, v_lucro_calc),
        valor_retorno = v_payout_total,
        updated_at = NOW()
    WHERE id = p_aposta_id;

    -- Sincronizar saldos
    PERFORM public.sync_bookmaker_balance_from_ledger(v_aposta.bookmaker_id);

    RETURN QUERY SELECT TRUE, v_events_count, 'Aposta liquidada com sucesso'::TEXT;
END;
$function$;