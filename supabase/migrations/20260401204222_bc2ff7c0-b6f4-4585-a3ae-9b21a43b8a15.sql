-- Reverter swap incorreto (endereço ETH usado para LTC)
-- SWAP_OUT: b3f55745 (650 USDT saiu da wallet)
-- SWAP_IN: b5c72bb2 (11.09 LTC entrou na wallet)
DELETE FROM cash_ledger WHERE id IN (
  'b3f55745-4a99-4a23-8055-a9e21fe66e75',
  'b5c72bb2-a2c3-4e17-bbef-4afa6af7b770'
);