-- Remediação da Transação Corrompida (Auditada)
-- 1. Remoção do registro órfão no ledger
DELETE FROM public.cash_ledger 
WHERE id = 'abcf878d-f787-47ca-bacd-9667e7c160c5';

-- 2. Limpeza de logs de trânsito vinculados à Wallet e ao timestamp da regressão
DELETE FROM public.wallet_transit_log 
WHERE wallet_id = 'b06bbb93-7e9e-4dd7-b4d2-fe58a68c4a5c' 
  AND created_at >= '2026-08-05' 
  AND created_at <= '2026-08-05 13:00:00';
