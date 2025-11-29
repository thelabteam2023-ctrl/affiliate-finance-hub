-- Adicionar nova coluna moedas como array
ALTER TABLE public.wallets_crypto 
ADD COLUMN IF NOT EXISTS moedas text[];

-- Migrar dados da coluna moeda para moedas (como array)
UPDATE public.wallets_crypto 
SET moedas = ARRAY[moeda]
WHERE moeda IS NOT NULL;

-- Remover coluna antiga moeda
ALTER TABLE public.wallets_crypto 
DROP COLUMN moeda;

-- Renomear moedas para moeda
ALTER TABLE public.wallets_crypto 
RENAME COLUMN moedas TO moeda;

-- Adicionar comentário
COMMENT ON COLUMN public.wallets_crypto.moeda IS 'Array de moedas suportadas neste endereço wallet (ex: [''USDT'', ''USDC''])';