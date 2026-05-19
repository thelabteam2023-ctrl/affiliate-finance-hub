-- Remove o constraint restritivo antigo
ALTER TABLE public.bookmakers DROP CONSTRAINT IF EXISTS bookmakers_moeda_check;

-- Adiciona o novo constraint com a lista unificada de moedas do app
ALTER TABLE public.bookmakers 
ADD CONSTRAINT bookmakers_moeda_check 
CHECK (moeda = ANY (ARRAY[
  'BRL'::text, 'USD'::text, 'EUR'::text, 'GBP'::text, 'MYR'::text, 
  'MXN'::text, 'ARS'::text, 'COP'::text, 'CAD'::text, 'AUD'::text, 
  'JPY'::text, 'CLP'::text, 'PEN'::text, 'TRY'::text, 'INR'::text, 
  'USDT'::text, 'USDC'::text, 'BTC'::text, 'ETH'::text
]));