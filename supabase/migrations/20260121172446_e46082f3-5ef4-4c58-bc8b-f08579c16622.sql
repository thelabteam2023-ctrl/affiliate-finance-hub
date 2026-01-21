-- Tabela para cache de cotações de câmbio
CREATE TABLE public.exchange_rate_cache (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  currency_pair TEXT NOT NULL UNIQUE,
  rate NUMERIC NOT NULL,
  source TEXT NOT NULL,
  fetched_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Índice para busca rápida por moeda
CREATE INDEX idx_exchange_rate_cache_currency ON public.exchange_rate_cache(currency_pair);
CREATE INDEX idx_exchange_rate_cache_expires ON public.exchange_rate_cache(expires_at);

-- Permitir leitura pública (apenas cotações, sem dados sensíveis)
ALTER TABLE public.exchange_rate_cache ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Cotações são públicas para leitura"
ON public.exchange_rate_cache
FOR SELECT
USING (true);

-- Apenas service role pode inserir/atualizar (via edge function)
CREATE POLICY "Service role pode gerenciar cache"
ON public.exchange_rate_cache
FOR ALL
USING (auth.role() = 'service_role');

-- Comentários
COMMENT ON TABLE public.exchange_rate_cache IS 'Cache de cotações de câmbio para reduzir chamadas às APIs externas';
COMMENT ON COLUMN public.exchange_rate_cache.currency_pair IS 'Par de moedas (ex: USDBRL, MYRBRL)';
COMMENT ON COLUMN public.exchange_rate_cache.source IS 'Fonte da cotação: PTAX, FASTFOREX, FALLBACK';