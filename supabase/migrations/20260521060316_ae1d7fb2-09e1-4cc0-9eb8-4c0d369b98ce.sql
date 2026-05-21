-- 1. Tabela de anomalias (Audit)
CREATE TABLE IF NOT EXISTS public.audit_anomalias (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    teste_suite TEXT,
    teste_id TEXT,
    detalhes JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 2. Função de Autocorreção
CREATE OR REPLACE FUNCTION public.autocorrigir_perna_incompleta(p_perna_id UUID)
RETURNS JSONB AS $$
DECLARE
    v_perna RECORD;
    v_workspace_id UUID;
    v_entry_count INTEGER;
    v_event_count INTEGER;
BEGIN
    -- Obter dados da perna
    SELECT ap.id, ap.aposta_id, ap.resultado, au.workspace_id
    INTO v_perna
    FROM public.apostas_pernas ap
    JOIN public.apostas_unificada au ON au.id = ap.aposta_id
    WHERE ap.id = p_perna_id;

    IF v_perna.resultado IS NULL THEN
        RETURN jsonb_build_object('success', true, 'message', 'Perna não está liquidada, nada a corrigir');
    END IF;

    v_workspace_id := v_perna.workspace_id;

    -- Contar entradas e eventos
    SELECT COUNT(*) INTO v_entry_count FROM public.apostas_perna_entradas WHERE perna_id = p_perna_id;
    
    -- Contar eventos ativos (sem reversão)
    SELECT COUNT(*) INTO v_event_count
    FROM public.financial_events fe
    WHERE fe.aposta_id = v_perna.aposta_id
      AND fe.idempotency_key LIKE '%perna_' || p_perna_id || '%'
      AND fe.tipo_evento IN ('PAYOUT', 'VOID_REFUND', 'FREEBET_PAYOUT')
      AND NOT EXISTS (
          SELECT 1 FROM public.financial_events r 
          WHERE r.tipo_evento = 'REVERSAL' AND r.reversed_event_id = fe.id
      );

    -- Se counts coincidem (considerando o caso legado onde entry_count=0), está OK
    IF (v_entry_count > 0 AND v_event_count = v_entry_count) OR (v_entry_count = 0 AND v_event_count = 1) THEN
        RETURN jsonb_build_object('success', true, 'message', 'Perna saudável', 'entries', v_entry_count, 'events', v_event_count);
    END IF;

    -- Caso contrário, re-executar a liquidação (a RPC cuida dos estornos)
    PERFORM public.liquidar_perna_surebet_v1(p_perna_id, v_perna.resultado, v_workspace_id);

    -- Registrar correção
    INSERT INTO public.audit_anomalias (teste_suite, teste_id, detalhes)
    VALUES ('MODO_B', 'AUTO_FIX', jsonb_build_object(
        'perna_id', p_perna_id,
        'previous_events', v_event_count,
        'required_events', v_entry_count,
        'action', 're-liquidated'
    ));

    RETURN jsonb_build_object('success', true, 'message', 'Perna corrigida', 'previous_events', v_event_count, 'new_events', v_entry_count);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 3. View de Monitoramento
CREATE OR REPLACE VIEW public.view_monitoramento_liquidação_pernas AS
WITH metrics AS (
    SELECT 
        ap.id as perna_id,
        ap.aposta_id,
        ap.resultado,
        ap.ordem,
        (SELECT COUNT(*) FROM public.apostas_perna_entradas ae WHERE ae.perna_id = ap.id) as num_entradas,
        (SELECT COUNT(*) 
         FROM public.financial_events fe 
         WHERE fe.aposta_id = ap.aposta_id 
           AND fe.idempotency_key LIKE '%perna_' || ap.id || '%'
           AND fe.tipo_evento IN ('PAYOUT', 'VOID_REFUND', 'FREEBET_PAYOUT')
           AND NOT EXISTS (SELECT 1 FROM public.financial_events r WHERE r.tipo_evento = 'REVERSAL' AND r.reversed_event_id = fe.id)
        ) as num_eventos
    FROM public.apostas_pernas ap
    WHERE ap.resultado IS NOT NULL
)
SELECT 
    *,
    CASE 
        WHEN num_entradas > 0 AND num_eventos != num_entradas THEN 'INCOMPLETA'
        WHEN num_entradas = 0 AND num_eventos != 1 THEN 'INCOMPLETA'
        ELSE 'SAUDÁVEL'
    END as status_integridade
FROM metrics;
