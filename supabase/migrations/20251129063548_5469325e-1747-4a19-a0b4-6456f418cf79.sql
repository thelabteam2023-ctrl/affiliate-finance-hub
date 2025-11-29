-- Add exchange field to wallets_crypto table
ALTER TABLE public.wallets_crypto 
ADD COLUMN exchange text;

COMMENT ON COLUMN public.wallets_crypto.exchange IS 'Nome da exchange ou wallet utilizada';