
-- 1. Estender rastreabilidade de moeda
ALTER TABLE public.apostas_unificada 
ADD COLUMN IF NOT EXISTS moeda_original TEXT,
ADD COLUMN IF NOT EXISTS taxa_conversao_audit NUMERIC,
ADD COLUMN IF NOT EXISTS stake_base_audit NUMERIC;

-- 2. Tabela de anomalias
CREATE TABLE IF NOT EXISTS public.audit_anomalias (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    aposta_id UUID REFERENCES public.apostas_unificada(id),
    event_id UUID REFERENCES public.financial_events(id),
    tipo_anomalia TEXT NOT NULL,
    detalhes JSONB,
    corrigido BOOLEAN DEFAULT FALSE,
    tentativas INTEGER DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- 3. Atualizar RPC de Liquidação para suportar Boost
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
BEGIN
    -- Bloquear aposta para evitar concorrência
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

    -- 1. Iterar sobre Pernas (se houver)
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
                    valor, moeda, idempotency_key, descricao, processed_at, metadata
                ) VALUES (
                    v_entry.bookmaker_id, p_aposta_id, v_aposta.workspace_id,
                    CASE WHEN v_entry.fonte_saldo = 'FREEBET' THEN 'FREEBET_RETURN' ELSE 'PAYOUT' END,
                    CASE WHEN v_entry.fonte_saldo = 'FREEBET' THEN 'FREEBET' ELSE 'NORMAL' END,
                    v_payout_entry, COALESCE(v_entry.moeda, 'BRL'),
                    'payout_' || p_aposta_id || '_entry_' || v_entry.id,
                    format('Retorno Entrada Perna %s (%s) | Stake: %s | Odd: %s', v_perna.ordem, v_perna_resultado, v_entry.stake, v_entry.odd),
                    NOW(),
                    jsonb_build_object(
                        'evento', 'liquidacao_multipla_entry',
                        'stake', v_entry.stake,
                        'odd', v_entry.odd,
                        'resultado', v_perna_resultado,
                        'payout', v_payout_entry
                    )
                ) ON CONFLICT (idempotency_key) DO NOTHING;
                IF FOUND THEN v_events_count := v_events_count + 1; END IF;
            END IF;
        END LOOP;

        -- 1.2 Se não houver entradas, usar a própria perna
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
                    valor, moeda, idempotency_key, descricao, processed_at, metadata
                ) VALUES (
                    v_perna.bookmaker_id, p_aposta_id, v_aposta.workspace_id,
                    CASE WHEN v_perna.fonte_saldo = 'FREEBET' THEN 'FREEBET_RETURN' ELSE 'PAYOUT' END,
                    CASE WHEN v_perna.fonte_saldo = 'FREEBET' THEN 'FREEBET' ELSE 'NORMAL' END,
                    v_payout_entry, COALESCE(v_perna.moeda, 'BRL'),
                    'payout_' || p_aposta_id || '_perna_' || v_perna.id,
                    format('Retorno Perna %s (%s) | Stake: %s | Odd: %s', v_perna.ordem, v_perna_resultado, v_perna.stake, v_perna.odd),
                    NOW(),
                    jsonb_build_object(
                        'evento', 'liquidacao_multipla_perna',
                        'stake', v_perna.stake,
                        'odd', v_perna.odd,
                        'resultado', v_perna_resultado,
                        'payout', v_payout_entry
                    )
                ) ON CONFLICT (idempotency_key) DO NOTHING;
                IF FOUND THEN v_events_count := v_events_count + 1; END IF;
            END IF;
        END IF;
    END LOOP;

    -- 2. Se não houver pernas granulares, usar dados da aposta principal (Fallback)
    IF NOT v_has_pernas THEN
        v_effective_odd := COALESCE(v_aposta.odd, v_aposta.odd_final, 1);
        
        -- APLICAR BOOST SE EXISTIR
        IF COALESCE(v_aposta.boost_percentual, 0) > 0 THEN
            v_effective_odd := v_effective_odd * (1 + (v_aposta.boost_percentual / 100.0));
        END IF;
        
        IF p_resultado IN ('GREEN', 'MEIO_GREEN', 'VOID', 'MEIO_RED', 'RED', 'CANCELADA') THEN
            CASE p_resultado
                WHEN 'GREEN' THEN v_payout_total := v_aposta.stake * v_effective_odd;
                WHEN 'MEIO_GREEN' THEN v_payout_total := v_aposta.stake + (v_aposta.stake * (v_effective_odd - 1) / 2);
                WHEN 'VOID', 'CANCELADA' THEN v_payout_total := v_aposta.stake;
                WHEN 'MEIO_RED' THEN v_payout_total := v_aposta.stake / 2;
                ELSE v_payout_total := 0;
            END CASE;

            IF v_payout_total > 0 THEN
                v_metadata := jsonb_build_object(
                    'evento', 'liquidacao_multipla_fallback',
                    'aposta_id', p_aposta_id,
                    'tipo', v_aposta.forma_registro,
                    'stake', v_aposta.stake,
                    'odd_final', v_effective_odd,
                    'resultado', p_resultado,
                    'payout_calculado', v_payout_total,
                    'lucro_calculado', v_payout_total - v_aposta.stake,
                    'boost_percentual', v_aposta.boost_percentual
                );

                INSERT INTO public.financial_events (
                    bookmaker_id, aposta_id, workspace_id, tipo_evento, tipo_uso,
                    valor, moeda, idempotency_key, descricao, processed_at, metadata
                ) VALUES (
                    v_aposta.bookmaker_id, p_aposta_id, v_aposta.workspace_id,
                    'PAYOUT', 'NORMAL',
                    v_payout_total, COALESCE(v_aposta.moeda_operacao, 'BRL'),
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
    UPDATE public.apostas_unificada
    SET status = 'LIQUIDADA',
        resultado = p_resultado,
        lucro_prejuizo = COALESCE(p_lucro_prejuizo, v_payout_total - stake),
        updated_at = NOW()
    WHERE id = p_aposta_id;

    -- Sincronizar saldos de todas as casas afetadas
    PERFORM public.sync_bookmaker_balance_from_ledger(v_aposta.bookmaker_id);

    RETURN QUERY SELECT TRUE, v_events_count, 'Aposta liquidada com sucesso'::TEXT;
END;
$function$;

-- 4. Trigger de detecção de anomalias (Camada 1)
CREATE OR REPLACE FUNCTION public.trg_detectar_anomalias_financeiras()
RETURNS TRIGGER AS $$
BEGIN
    -- GREEN/PAYOUT com valor negativo OU RED/STAKE com valor positivo (débito é negativo)
    IF (NEW.tipo_evento IN ('PAYOUT', 'FREEBET_PAYOUT') AND NEW.valor < 0) OR
       (NEW.tipo_evento = 'STAKE' AND NEW.valor > 0) THEN
        
        INSERT INTO public.audit_anomalias (aposta_id, event_id, tipo_anomalia, detalhes)
        VALUES (NEW.aposta_id, NEW.id, 'SINAL_INVERTIDO', jsonb_build_object(
            'tipo_evento', NEW.tipo_evento,
            'valor', NEW.valor,
            'bookmaker_id', NEW.bookmaker_id,
            'created_at', NEW.created_at
        ));
        
        PERFORM pg_notify('anomalia_financeira', NEW.id::text);
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS detectar_anomalias_trigger ON public.financial_events;
CREATE TRIGGER detectar_anomalias_trigger
AFTER INSERT ON public.financial_events
FOR EACH ROW EXECUTE FUNCTION public.trg_detectar_anomalias_financeiras();

-- 5. View de Saúde Financeira (Camada 3)
CREATE OR REPLACE VIEW public.vw_saude_financeira AS
SELECT 
    date_trunc('day', created_at)::date as dia,
    COUNT(*) as total_eventos,
    SUM(CASE WHEN (tipo_evento IN ('PAYOUT', 'FREEBET_PAYOUT') AND valor < 0) THEN 1 ELSE 0 END) as anomalias_sinal,
    COUNT(DISTINCT aposta_id) as apostas_afetadas
FROM public.financial_events
GROUP BY 1
ORDER BY 1 DESC;

GRANT SELECT ON public.audit_anomalias TO authenticated;
GRANT SELECT ON public.vw_saude_financeira TO authenticated;
