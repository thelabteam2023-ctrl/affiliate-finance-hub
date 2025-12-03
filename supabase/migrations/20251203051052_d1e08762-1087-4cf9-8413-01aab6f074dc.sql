-- Remover as constraints antigas
ALTER TABLE public.cash_ledger DROP CONSTRAINT IF EXISTS cash_ledger_origem_tipo_check;
ALTER TABLE public.cash_ledger DROP CONSTRAINT IF EXISTS cash_ledger_destino_tipo_check;

-- Criar novas constraints incluindo INVESTIDOR
ALTER TABLE public.cash_ledger ADD CONSTRAINT cash_ledger_origem_tipo_check 
CHECK (origem_tipo = ANY (ARRAY['CAIXA_OPERACIONAL'::text, 'PARCEIRO_CONTA'::text, 'PARCEIRO_WALLET'::text, 'BOOKMAKER'::text, 'INVESTIDOR'::text]));

ALTER TABLE public.cash_ledger ADD CONSTRAINT cash_ledger_destino_tipo_check 
CHECK (destino_tipo = ANY (ARRAY['CAIXA_OPERACIONAL'::text, 'PARCEIRO_CONTA'::text, 'PARCEIRO_WALLET'::text, 'BOOKMAKER'::text, 'INVESTIDOR'::text]));