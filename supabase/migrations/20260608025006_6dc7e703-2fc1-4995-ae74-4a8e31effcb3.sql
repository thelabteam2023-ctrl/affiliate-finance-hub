-- Create enum for financial outcome if not exists
DO $$ BEGIN
    CREATE TYPE public.ocorrencia_resultado_financeiro AS ENUM ('ganho', 'perda');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- Ensure columns exist (handling potential prior manual additions)
ALTER TABLE public.ocorrencias ADD COLUMN IF NOT EXISTS resultado_financeiro public.ocorrencia_resultado_financeiro;
ALTER TABLE public.ocorrencias ADD COLUMN IF NOT EXISTS valor_perda NUMERIC DEFAULT 0;
ALTER TABLE public.ocorrencias ADD COLUMN IF NOT EXISTS perda_registrada_ledger BOOLEAN DEFAULT false;

-- Function to handle financial impact of occurrences
CREATE OR REPLACE FUNCTION public.handle_ocorrencia_financial_impact()
RETURNS TRIGGER AS $$
DECLARE
    v_moeda TEXT;
BEGIN
    -- Check if status changed to 'resolvido' AND result is 'perda' AND not yet registered
    IF NEW.status = 'resolvido' AND NEW.resultado_financeiro = 'perda' AND NEW.perda_registrada_ledger = false AND NEW.bookmaker_id IS NOT NULL AND NEW.valor_risco > 0 THEN
        
        -- Get currency
        SELECT moeda INTO v_moeda FROM public.bookmakers WHERE id = NEW.bookmaker_id;

        -- Record transaction
        INSERT INTO public.transacoes_bookmakers (
            bookmaker_id,
            workspace_id,
            tipo,
            valor,
            saldo_anterior,
            saldo_novo,
            descricao,
            data_transacao
        )
        SELECT 
            NEW.bookmaker_id,
            NEW.workspace_id,
            'saida',
            NEW.valor_risco,
            b.saldo_atual,
            b.saldo_atual - NEW.valor_risco,
            'Perda em Ocorrência: ' || NEW.titulo,
            now()
        FROM public.bookmakers b
        WHERE b.id = NEW.bookmaker_id;

        -- Update bookmaker balance
        UPDATE public.bookmakers
        SET saldo_atual = saldo_atual - NEW.valor_risco,
            updated_at = now()
        WHERE id = NEW.bookmaker_id;

        -- Mark as registered
        NEW.perda_registrada_ledger := true;
        NEW.valor_perda := NEW.valor_risco;
        NEW.resolved_at := now();
    END IF;

    -- Handle Ganho (Just mark resolved_at)
    IF NEW.status = 'resolvido' AND (NEW.resultado_financeiro = 'ganho' OR NEW.resultado_financeiro IS NULL) AND OLD.status != 'resolvido' THEN
        NEW.resolved_at := now();
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger
DROP TRIGGER IF EXISTS tr_ocorrencia_finance ON public.ocorrencias;
CREATE TRIGGER tr_ocorrencia_finance
BEFORE UPDATE ON public.ocorrencias
FOR EACH ROW
EXECUTE FUNCTION public.handle_ocorrencia_financial_impact();

-- Grant permissions (if needed, though usually standard for auth roles)
GRANT ALL ON public.transacoes_bookmakers TO authenticated;
GRANT ALL ON public.transacoes_bookmakers TO service_role;
