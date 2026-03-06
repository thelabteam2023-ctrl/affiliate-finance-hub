
-- Remove DEPOSITO_VIRTUAL duplicado criado pelo executeLink (app layer)
-- Mantém o criado pelo trigger (safety net) como fonte de verdade
DELETE FROM public.cash_ledger 
WHERE id = 'e1462fc8-db45-4914-94ec-dce8f7ab1e23';
