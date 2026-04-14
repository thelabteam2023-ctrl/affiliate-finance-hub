
ALTER TABLE public.bookmakers DROP CONSTRAINT bookmakers_moeda_check;

ALTER TABLE public.bookmakers ADD CONSTRAINT bookmakers_moeda_check 
CHECK (moeda = ANY (ARRAY[
  'BRL', 'USD', 'EUR', 'GBP', 'CAD', 'AUD', 'JPY',
  'MXN', 'ARS', 'CLP', 'COP', 'PEN', 'TRY', 'INR',
  'USDT', 'BTC', 'ETH'
]));
