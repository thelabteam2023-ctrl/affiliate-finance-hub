
-- Revert: re-vincular bookmaker ao projeto
UPDATE public.bookmakers 
SET projeto_id = '5d7e90b7-648d-4a7e-8403-1aa564aa4468',
    status = 'ativo',
    aguardando_saque_at = NULL,
    updated_at = now()
WHERE id = '60998a29-4c61-40a1-a500-da2edd6bb65a';

-- Remover o SAQUE_VIRTUAL gerado pelo desvínculo (reverter para teste)
DELETE FROM public.cash_ledger 
WHERE id = '6f8de600-136c-4fc1-a18c-1256d98ae854';
