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
    v_entry RECORD;
    v_events_count INTEGER := 0;
    v_payout_total NUMERIC := 0;
    v_has_pernas BOOLEAN := FALSE;
    v_payout_entry NUMERIC;
BEGIN
    -- Bloquear aposta para evitar concorrência
    SELECT * INTO v_aposta FROM public.apostas_unificada WHERE id = p_aposta_id FOR UPDATE;
    IF v_aposta.id IS NULL THEN 
        RETURN QUERY SELECT FALSE, 0, 'Aposta não encontrada'::TEXT; 
        RETURN; 
    END IF;

    -- Se já estiver liquidada, não faz nada a menos que seja via reliquidar
    IF v_aposta.status = 'LIQUIDADA' THEN 
        RETURN QUERY SELECT FALSE, 0, 'Aposta já está liquidada'::TEXT; 
        RETURN; 
    END IF;

    -- Verificar se existem pernas
    SELECT EXISTS(SELECT 1 FROM public.apostas_pernas WHERE aposta_id = p_aposta_id) INTO v_has_pernas;

    IF v_has_pernas THEN
        -- Lógica para Apostas com Pernas (Arbitragem ou Punter Multi-entry)
        FOR v_entry IN
            SELECT ae.*, ap.resultado as perna_resultado, ap.ordem as perna_ordem
            FROM public.apostas_perna_entradas ae
            JOIN public.apostas_pernas ap ON ap.id = ae.perna_id
            WHERE ap.aposta_id = p_aposta_id
        LOOP
            v_payout_entry := 0;
            CASE COALESCE(v_entry.perna_resultado, p_resultado)
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
                    v_payout_entry, v_entry.moeda,
                    'payout_' || p_aposta_id || '_entry_' || v_entry.id || '_' || floor(extract(epoch from now())),
                    format('Retorno Entrada Perna %s (%s)', v_entry.perna_ordem, COALESCE(v_entry.perna_resultado, p_resultado)),
                    NOW()
                );
                v_events_count := v_events_count + 1;
            END IF;
        END LOOP;
    ELSE
        -- Lógica para Aposta Simples Punter (Sem pernas registradas)
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
                    v_payout_total, v_aposta.moeda,
                    'payout_simple_' || p_aposta_id || '_' || floor(extract(epoch from now())),
                    format('Retorno Aposta Simples (%s)', p_resultado),
                    NOW()
                );
                v_events_count := v_events_count + 1;
            END IF;
        END IF;
    END IF;

    -- Atualizar a aposta para LIQUIDADA
    UPDATE public.apostas_unificada
    SET status = 'LIQUIDADA',
        resultado = p_resultado,
        lucro_prejuizo = COALESCE(p_lucro_prejuizo, lucro_prejuizo),
        updated_at = NOW()
    WHERE id = p_aposta_id;

    -- Se for arbitragem, sincronizar os pais
    IF v_aposta.tipo = 'ARBITRAGEM' THEN
        PERFORM public.fn_recalc_pai_surebet(p_aposta_id);
    END IF;

    RETURN QUERY SELECT TRUE, v_events_count, 'Aposta liquidada com sucesso'::TEXT;
END;
$$;
