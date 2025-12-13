-- Add origin tracking columns to despesas_administrativas
ALTER TABLE despesas_administrativas 
  ADD COLUMN IF NOT EXISTS origem_tipo TEXT,
  ADD COLUMN IF NOT EXISTS origem_caixa_operacional BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS origem_conta_bancaria_id UUID REFERENCES contas_bancarias(id),
  ADD COLUMN IF NOT EXISTS origem_wallet_id UUID REFERENCES wallets_crypto(id),
  ADD COLUMN IF NOT EXISTS origem_parceiro_id UUID REFERENCES parceiros(id),
  ADD COLUMN IF NOT EXISTS tipo_moeda TEXT DEFAULT 'FIAT',
  ADD COLUMN IF NOT EXISTS coin TEXT,
  ADD COLUMN IF NOT EXISTS qtd_coin NUMERIC,
  ADD COLUMN IF NOT EXISTS cotacao NUMERIC;

-- Add comments for documentation
COMMENT ON COLUMN despesas_administrativas.origem_tipo IS 'Payment origin type: CAIXA_OPERACIONAL, PARCEIRO_CONTA, PARCEIRO_WALLET';
COMMENT ON COLUMN despesas_administrativas.origem_caixa_operacional IS 'True if paid from operational cash';
COMMENT ON COLUMN despesas_administrativas.origem_conta_bancaria_id IS 'Partner bank account used for payment';
COMMENT ON COLUMN despesas_administrativas.origem_wallet_id IS 'Partner crypto wallet used for payment';
COMMENT ON COLUMN despesas_administrativas.origem_parceiro_id IS 'Partner owner of account/wallet used';
COMMENT ON COLUMN despesas_administrativas.tipo_moeda IS 'Currency type: FIAT or CRYPTO';
COMMENT ON COLUMN despesas_administrativas.coin IS 'Crypto coin symbol (BTC, ETH, USDT, etc.)';
COMMENT ON COLUMN despesas_administrativas.qtd_coin IS 'Quantity of crypto coins';
COMMENT ON COLUMN despesas_administrativas.cotacao IS 'Exchange rate at transaction time';