CREATE OR REPLACE FUNCTION public.liquidar_aposta_v4(
    p_aposta_id uuid, 
    p_resultado text, 
    p_lucro_prejuizo numeric DEFAULT NULL
)
RETURNS TABLE(success boolean, events_created integer, message text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
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
BEGIN
    -- Bloquear aposta
    SELECT * INTO v_aposta FROM public.apostas_unificada WHERE id = p_aposta_id FOR UPDATE;
    IF v_aposta.id IS NULL THEN 
        RETURN QUERY SELECT FALSE, 0, 'Aposta não encontrada'::TEXT; 
        RETURN; 
    END IF;

    -- Se já estiver liquidada
    IF v_aposta.status = 'LIQUIDADA' THEN 
        RETURN QUERY SELECT FALSE, 0, 'Aposta já está liquidada'::TEXT; 
        RETURN; 
    END IF;

    -- 1. Iterar sobre Pernas
    FOR v_perna IN SELECT * FROM public.apostas_pernas WHERE aposta_id = p_aposta_id ORDER BY ordem
    LOOP
        v_has_pernas := TRUE;
        v_perna_resultado := COALESCE(v_perna.resultado, p_resultado);
        v_has_entries := FALSE;

        -- 1.1 Tentar buscar entradas granulares para esta perna
        FOR v_entry IN SELECT * FROM public.apostas_perna_entradas WHERE perna_id = v_perna.id
        LOOP
            v_has_entries := TRUE;
            v_payout_entry := 0;
            
            CASE v_perna_resultado
                WHEN 'GREEN' THEN v_payout_entry := v_entry.stake * v_entry.odd;
                WHEN 'MEIO_GREEN' THEN v_payout_entry := v_entry.stake + (v_entry.stake * (v_entry.odd - 1) / 2);
                WHEN 'VOID', 'CANCELADA' THEN v_payout_entry := v_entry.stake;
                WHEN 'MEIO_RED' THEN v_payout_entry := v_entry.stake / 2;
                ELSE v_payout_entry := 0;
            END CASE;

            IF v_payout_entry > 0 THEN
                INSERT INTO public.financial_events (
                    bookmaker_id, aposta_id, workspace_id, tipo_evento, tipo_uso,
                    valor, moeda, idempotency_key, descricao, processed_at
                ) VALUES (
                    v_entry.bookmaker_id, p_aposta_id, v_aposta.workspace_id,
                    CASE WHEN v_entry.fonte_saldo = 'FREEBET' THEN 'FREEBET_RETURN' ELSE 'PAYOUT' END,
                    CASE WHEN v_entry.fonte_saldo = 'FREEBET' THEN 'FREEBET' ELSE 'NORMAL' END,
                    v_payout_entry, COALESCE(v_entry.moeda, 'BRL'),
                    'payout_' || p_aposta_id || '_entry_' || v_entry.id || '_' || floor(extract(epoch from now())),
                    format('Retorno Entrada Perna %s (%s)', v_perna.ordem, v_perna_resultado),
                    NOW()
                );
                v_events_count := v_events_count + 1;
            END IF;
        END LOOP;

        -- 1.2 Se não houver entradas, usar a própria perna (Punter Multi-entry padrão)
        IF NOT v_has_entries THEN
            v_payout_entry := 0;
            CASE v_perna_resultado
                WHEN 'GREEN' THEN v_payout_entry := v_perna.stake * v_perna.odd;
                WHEN 'MEIO_GREEN' THEN v_payout_entry := v_perna.stake + (v_perna.stake * (v_perna.odd - 1) / 2);
                WHEN 'VOID', 'CANCELADA' THEN v_payout_entry := v_perna.stake;
                WHEN 'MEIO_RED' THEN v_payout_entry := v_perna.stake / 2;
                ELSE v_payout_entry := 0;
            END CASE;

            IF v_payout_entry > 0 THEN
                INSERT INTO public.financial_events (
                    bookmaker_id, aposta_id, workspace_id, tipo_evento, tipo_uso,
                    valor, moeda, idempotency_key, descricao, processed_at
                ) VALUES (
                    v_perna.bookmaker_id, p_aposta_id, v_aposta.workspace_id,
                    CASE WHEN v_perna.fonte_saldo = 'FREEBET' THEN 'FREEBET_RETURN' ELSE 'PAYOUT' END,
                    CASE WHEN v_perna.fonte_saldo = 'FREEBET' THEN 'FREEBET' ELSE 'NORMAL' END,
                    v_payout_entry, COALESCE(v_perna.moeda, 'BRL'),
                    'payout_' || p_aposta_id || '_perna_' || v_perna.id || '_' || floor(extract(epoch from now())),
                    format('Retorno Perna %s (%s)', v_perna.ordem, v_perna_resultado),
                    NOW()
                );
                v_events_count := v_events_count + 1;
            END IF;
        END IF;

        -- Atualizar resultado na perna se necessário
        UPDATE public.apostas_pernas SET resultado = v_perna_resultado WHERE id = v_perna.id;
    END LOOP;

    -- 2. Fallback: Se não houver NENHUMA perna, usar aposta principal (Aposta Simples Tradicional)
    IF NOT v_has_pernas THEN
        IF p_resultado IN ('GREEN', 'MEIO_GREEN', 'VOID', 'MEIO_RED') THEN
            CASE p_resultado
                WHEN 'GREEN' THEN v_payout_total := v_aposta.stake * v_aposta.odd;
                WHEN 'MEIO_GREEN' THEN v_payout_total := v_aposta.stake + (v_aposta.stake * (v_aposta.odd - 1) / 2);
                WHEN 'VOID' THEN v_payout_total := v_aposta.stake;
                WHEN 'MEIO_RED' THEN v_payout_total := v_aposta.stake / 2;
                ELSE v_payout_total := 0;
            END CASE;

            IF v_payout_total > 0 THEN
                INSERT INTO public.financial_events (
                    bookmaker_id, aposta_id, workspace_id, tipo_evento, tipo_uso,
                    valor, moeda, idempotency_key, descricao, processed_at
                ) VALUES (
                    v_aposta.bookmaker_id, p_aposta_id, v_aposta.workspace_id,
                    'PAYOUT', 'NORMAL',
                    v_payout_total, COALESCE(v_aposta.moeda_operacao, 'BRL'),
                    'payout_simple_' || p_aposta_id || '_' || floor(extract(epoch from now())),
                    format('Retorno Aposta Simples (%s)', p_resultado),
                    NOW()
                );
                v_events_count := v_events_count + 1;
            END IF;
        END IF;
    END IF;

    -- 3. Atualizar Status Final
    UPDATE public.apostas_unificada
    SET status = 'LIQUIDADA',
        resultado = p_resultado,
        lucro_prejuizo = COALESCE(p_lucro_prejuizo, lucro_prejuizo),
        updated_at = NOW()
    WHERE id = p_aposta_id;

    -- Sincronizar pais se for arbitragem
    IF v_aposta.forma_registro IN ('ARBITRAGEM', 'SUREBET') THEN
        PERFORM public.fn_recalc_pai_surebet(p_aposta_id);
    END IF;

    RETURN QUERY SELECT TRUE, v_events_count, 'Aposta liquidada com sucesso'::TEXT;
END;
$$;
