-- Fix 1: Atualizar qtd_coin dos SAQUEs crypto confirmados para o valor realmente recebido
UPDATE cash_ledger
SET qtd_coin = valor_confirmado
WHERE tipo_transacao = 'SAQUE'
  AND status = 'CONFIRMADO'
  AND destino_wallet_id IS NOT NULL
  AND valor_confirmado IS NOT NULL
  AND ABS(qtd_coin - valor_confirmado) > 0.001;

-- Fix 2: Remover destino_wallet_id das entradas PERDA/GANHO_CAMBIAL crypto
UPDATE cash_ledger
SET destino_wallet_id = NULL
WHERE tipo_transacao IN ('PERDA_CAMBIAL', 'GANHO_CAMBIAL')
  AND destino_wallet_id IS NOT NULL
  AND tipo_moeda = 'CRYPTO'
  AND referencia_transacao_id IS NOT NULL;