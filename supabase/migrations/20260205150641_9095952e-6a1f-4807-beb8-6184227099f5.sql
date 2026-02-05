
-- Adicionar campo para data de confirmação/recebimento (informada pelo usuário)
-- Usado para métricas de "tempo médio de saque"
ALTER TABLE cash_ledger 
ADD COLUMN IF NOT EXISTS data_confirmacao TIMESTAMP WITH TIME ZONE;

-- Comentário para documentação
COMMENT ON COLUMN cash_ledger.data_confirmacao IS 
'Data real de confirmação/recebimento informada pelo usuário na conciliação. 
Permite lançamentos retroativos para métricas de tempo de processamento.
Diferente de balance_processed_at que é automático.';

-- Criar índice para consultas de métricas
CREATE INDEX IF NOT EXISTS idx_cash_ledger_data_confirmacao 
ON cash_ledger(data_confirmacao) 
WHERE data_confirmacao IS NOT NULL;
