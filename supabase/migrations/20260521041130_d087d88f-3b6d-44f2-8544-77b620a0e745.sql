
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

-- 3. Trigger de detecção (Camada 1)
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

-- 4. Função de Auto-correção (Camada 2)
CREATE OR REPLACE FUNCTION public.autocorrigir_anomalias()
RETURNS INTEGER AS $$
DECLARE
    v_anomalia RECORD;
    v_corrigidos INTEGER := 0;
BEGIN
    FOR v_anomalia IN 
        SELECT * FROM public.audit_anomalias 
        WHERE corrigido = FALSE AND tentativas < 3
    LOOP
        UPDATE public.audit_anomalias SET tentativas = tentativas + 1 WHERE id = v_anomalia.id;
        -- Lógica de reliquidação seria disparada aqui via Edge Function/Worker
    END LOOP;
    
    RETURN v_corrigidos;
END;
$$ LANGUAGE plpgsql;

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

-- 6. Garantir permissões
GRANT SELECT ON public.audit_anomalias TO authenticated;
GRANT SELECT ON public.vw_saude_financeira TO authenticated;
