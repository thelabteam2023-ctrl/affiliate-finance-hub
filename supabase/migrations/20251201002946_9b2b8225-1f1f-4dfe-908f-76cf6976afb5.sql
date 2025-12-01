-- Fix invalid empty string UUIDs in cash_ledger
UPDATE public.cash_ledger
SET investidor_id = NULL
WHERE investidor_id::text = '';

-- Also fix other UUID fields that might have empty strings
UPDATE public.cash_ledger SET origem_parceiro_id = NULL WHERE origem_parceiro_id::text = '';
UPDATE public.cash_ledger SET origem_conta_bancaria_id = NULL WHERE origem_conta_bancaria_id::text = '';
UPDATE public.cash_ledger SET origem_wallet_id = NULL WHERE origem_wallet_id::text = '';
UPDATE public.cash_ledger SET origem_bookmaker_id = NULL WHERE origem_bookmaker_id::text = '';
UPDATE public.cash_ledger SET destino_parceiro_id = NULL WHERE destino_parceiro_id::text = '';
UPDATE public.cash_ledger SET destino_conta_bancaria_id = NULL WHERE destino_conta_bancaria_id::text = '';
UPDATE public.cash_ledger SET destino_wallet_id = NULL WHERE destino_wallet_id::text = '';
UPDATE public.cash_ledger SET destino_bookmaker_id = NULL WHERE destino_bookmaker_id::text = '';