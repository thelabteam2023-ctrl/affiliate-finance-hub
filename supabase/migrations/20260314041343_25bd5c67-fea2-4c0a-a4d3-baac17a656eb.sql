
-- Reset completo: remover todos os registros do ledger deste projeto
DELETE FROM public.cash_ledger WHERE projeto_id_snapshot = '5d7e90b7-648d-4a7e-8403-1aa564aa4468';

-- Desvincular a bookmaker do projeto (sem gerar saque virtual)
UPDATE public.bookmakers 
SET projeto_id = NULL,
    status = 'ativo',
    aguardando_saque_at = NULL,
    updated_at = now()
WHERE projeto_id = '5d7e90b7-648d-4a7e-8403-1aa564aa4468';

-- Limpar histórico de vínculos
DELETE FROM public.projeto_bookmaker_historico WHERE projeto_id = '5d7e90b7-648d-4a7e-8403-1aa564aa4468';

-- Limpar audit de saldo relacionado
DELETE FROM public.bookmaker_balance_audit WHERE bookmaker_id = '60998a29-4c61-40a1-a500-da2edd6bb65a';
