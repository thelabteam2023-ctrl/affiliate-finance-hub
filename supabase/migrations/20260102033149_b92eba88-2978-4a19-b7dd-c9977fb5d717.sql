-- Add valor_confirmado column to cash_ledger for storing real credited/received value
ALTER TABLE cash_ledger ADD COLUMN IF NOT EXISTS valor_confirmado NUMERIC;
COMMENT ON COLUMN cash_ledger.valor_confirmado IS 'Valor real creditado/recebido após conciliação. Para fins operacionais (saldo bookmaker).';

-- Create exchange_adjustments table for tracking currency differences
CREATE TABLE IF NOT EXISTS exchange_adjustments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  cash_ledger_id UUID NOT NULL REFERENCES cash_ledger(id) ON DELETE CASCADE,
  bookmaker_id UUID REFERENCES bookmakers(id) ON DELETE SET NULL,
  wallet_id UUID REFERENCES wallets_crypto(id) ON DELETE SET NULL,
  tipo TEXT NOT NULL CHECK (tipo IN ('DEPOSITO', 'SAQUE')),
  valor_nominal NUMERIC NOT NULL,
  valor_confirmado NUMERIC NOT NULL,
  diferenca NUMERIC NOT NULL,
  tipo_ajuste TEXT NOT NULL CHECK (tipo_ajuste IN ('GANHO_CAMBIAL', 'PERDA_CAMBIAL', 'SEM_DIFERENCA')),
  coin TEXT,
  qtd_coin NUMERIC,
  observacoes TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  user_id UUID NOT NULL REFERENCES auth.users(id)
);

-- Enable RLS
ALTER TABLE exchange_adjustments ENABLE ROW LEVEL SECURITY;

-- RLS Policies for exchange_adjustments
CREATE POLICY "Users can view exchange adjustments in their workspace"
  ON exchange_adjustments FOR SELECT
  USING (workspace_id IN (
    SELECT workspace_id FROM workspace_members WHERE user_id = auth.uid()
  ));

CREATE POLICY "Users can insert exchange adjustments in their workspace"
  ON exchange_adjustments FOR INSERT
  WITH CHECK (workspace_id IN (
    SELECT workspace_id FROM workspace_members WHERE user_id = auth.uid()
  ));

CREATE POLICY "Users can update exchange adjustments in their workspace"
  ON exchange_adjustments FOR UPDATE
  USING (workspace_id IN (
    SELECT workspace_id FROM workspace_members WHERE user_id = auth.uid()
  ));

CREATE POLICY "Users can delete exchange adjustments in their workspace"
  ON exchange_adjustments FOR DELETE
  USING (workspace_id IN (
    SELECT workspace_id FROM workspace_members WHERE user_id = auth.uid()
  ));

-- Create index for faster queries
CREATE INDEX IF NOT EXISTS idx_exchange_adjustments_workspace ON exchange_adjustments(workspace_id);
CREATE INDEX IF NOT EXISTS idx_exchange_adjustments_created ON exchange_adjustments(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_exchange_adjustments_bookmaker ON exchange_adjustments(bookmaker_id);
CREATE INDEX IF NOT EXISTS idx_cash_ledger_valor_confirmado ON cash_ledger(valor_confirmado) WHERE valor_confirmado IS NOT NULL;