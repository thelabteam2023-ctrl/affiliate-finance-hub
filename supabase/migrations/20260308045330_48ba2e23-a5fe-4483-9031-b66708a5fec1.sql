
-- ============================================================================
-- BROKER MODULE: Suporte a contas de investidores (Aporte Direto)
-- ============================================================================

-- 1. Adicionar investidor_id na tabela bookmakers para rastrear contas do investidor
ALTER TABLE public.bookmakers 
ADD COLUMN IF NOT EXISTS investidor_id UUID REFERENCES public.investidores(id) ON DELETE SET NULL;

-- Index para busca por investidor
CREATE INDEX IF NOT EXISTS idx_bookmakers_investidor_id ON public.bookmakers(investidor_id);

-- 2. Trigger para gerar financial_events quando APORTE_DIRETO é inserido
CREATE OR REPLACE FUNCTION public.generate_financial_events_for_aporte_direto()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.tipo_transacao = 'APORTE_DIRETO' 
     AND NEW.destino_bookmaker_id IS NOT NULL 
     AND NEW.status = 'CONFIRMADO'
     AND NEW.financial_events_generated IS NOT TRUE THEN
    
    INSERT INTO public.financial_events (
      bookmaker_id,
      tipo_evento,
      tipo_uso,
      origem,
      valor,
      moeda,
      descricao,
      idempotency_key,
      metadata
    ) VALUES (
      NEW.destino_bookmaker_id,
      'DEPOSITO',
      'NORMAL',
      'DEPOSITO',
      NEW.valor,
      NEW.moeda,
      COALESCE(NEW.descricao, 'Aporte direto do investidor'),
      'aporte_direto_' || NEW.id,
      jsonb_build_object(
        'investidor_id', NEW.investidor_id,
        'nome_investidor', NEW.nome_investidor,
        'ledger_id', NEW.id,
        'tipo_origem', 'APORTE_DIRETO'
      )
    );
    
    NEW.financial_events_generated := true;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS tr_aporte_direto_financial_events ON public.cash_ledger;
CREATE TRIGGER tr_aporte_direto_financial_events
  BEFORE INSERT OR UPDATE ON public.cash_ledger
  FOR EACH ROW
  EXECUTE FUNCTION public.generate_financial_events_for_aporte_direto();
