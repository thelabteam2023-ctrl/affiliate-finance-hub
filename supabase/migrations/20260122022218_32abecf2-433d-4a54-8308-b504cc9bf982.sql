-- RPC para leitura direta de cotações do banco
-- Esta é a FONTE PRIMÁRIA DE VERDADE para o frontend

CREATE OR REPLACE FUNCTION public.get_cached_exchange_rates()
RETURNS TABLE (
  currency_pair TEXT,
  rate NUMERIC,
  source TEXT,
  fetched_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ,
  is_expired BOOLEAN,
  age_minutes INTEGER
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    erc.currency_pair,
    erc.rate,
    erc.source,
    erc.fetched_at,
    erc.expires_at,
    (erc.expires_at < NOW()) AS is_expired,
    EXTRACT(EPOCH FROM (NOW() - erc.fetched_at))::INTEGER / 60 AS age_minutes
  FROM exchange_rate_cache erc
  ORDER BY erc.currency_pair;
END;
$$;

-- Permissão pública para leitura (anon pode ler cotações)
GRANT EXECUTE ON FUNCTION public.get_cached_exchange_rates() TO anon;
GRANT EXECUTE ON FUNCTION public.get_cached_exchange_rates() TO authenticated;

-- Comentário para documentação
COMMENT ON FUNCTION public.get_cached_exchange_rates() IS 
'Fonte primária de verdade para cotações de câmbio. 
Retorna taxas do cache do banco com metadados de freshness.
Hierarquia: DB (esta função) → Edge Function (refresh) → LocalStorage → Fallback hardcoded';
