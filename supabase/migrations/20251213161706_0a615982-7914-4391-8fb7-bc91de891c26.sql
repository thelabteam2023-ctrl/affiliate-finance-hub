-- Adicionar colunas de origem do pagamento em movimentacoes_indicacao
ALTER TABLE movimentacoes_indicacao ADD COLUMN IF NOT EXISTS origem_tipo TEXT;
ALTER TABLE movimentacoes_indicacao ADD COLUMN IF NOT EXISTS origem_caixa_operacional BOOLEAN DEFAULT FALSE;
ALTER TABLE movimentacoes_indicacao ADD COLUMN IF NOT EXISTS origem_conta_bancaria_id UUID REFERENCES contas_bancarias(id);
ALTER TABLE movimentacoes_indicacao ADD COLUMN IF NOT EXISTS origem_wallet_id UUID REFERENCES wallets_crypto(id);
ALTER TABLE movimentacoes_indicacao ADD COLUMN IF NOT EXISTS origem_parceiro_id UUID REFERENCES parceiros(id);

-- Campos para suporte a crypto
ALTER TABLE movimentacoes_indicacao ADD COLUMN IF NOT EXISTS tipo_moeda TEXT DEFAULT 'FIAT';
ALTER TABLE movimentacoes_indicacao ADD COLUMN IF NOT EXISTS coin TEXT;
ALTER TABLE movimentacoes_indicacao ADD COLUMN IF NOT EXISTS qtd_coin NUMERIC;
ALTER TABLE movimentacoes_indicacao ADD COLUMN IF NOT EXISTS cotacao NUMERIC;

-- Comentários para documentação
COMMENT ON COLUMN movimentacoes_indicacao.origem_tipo IS 'CAIXA_OPERACIONAL, PARCEIRO_CONTA, PARCEIRO_WALLET';
COMMENT ON COLUMN movimentacoes_indicacao.tipo_moeda IS 'FIAT ou CRYPTO';