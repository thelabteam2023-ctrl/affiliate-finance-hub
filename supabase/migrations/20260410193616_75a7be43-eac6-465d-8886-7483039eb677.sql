
-- Fix double-counted deposit for TIKITAKA (CLAUDIVAN)
-- DEPOSITO should be 105.00 (original), GANHO_CAMBIAL 0.05 covers the difference
UPDATE financial_events
SET valor = 105.00
WHERE id = '756bd6cb-daf0-478f-871c-5adfec0a51ee'
  AND tipo_evento = 'DEPOSITO'
  AND valor = 105.05;

-- Also fix cash_ledger.valor back to original
UPDATE cash_ledger
SET valor = 105.00
WHERE id = 'd31462a5-d6d0-4383-bb17-becfd8b297c0'
  AND tipo_transacao = 'DEPOSITO';

-- Sync bookmaker balance: 105.00 + 0.05 = 105.05
UPDATE bookmakers
SET saldo_atual = 105.05, updated_at = now()
WHERE id = '84c8b441-b3f3-4bf3-a19e-503adfb03396';
