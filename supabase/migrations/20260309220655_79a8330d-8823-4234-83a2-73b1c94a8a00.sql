
-- Correção direta: Atualizar lançamentos CAIXA_OPERACIONAL órfãos
UPDATE cash_ledger
SET origem_conta_bancaria_id = '991c0176-2434-4cdd-9ed9-169ed87907e5',
    origem_parceiro_id = '94b2d2c0-dd5a-4215-948f-f9712f7ff34e'
WHERE origem_tipo = 'CAIXA_OPERACIONAL'
  AND origem_conta_bancaria_id IS NULL
  AND tipo_moeda = 'FIAT'
  AND status = 'CONFIRMADO';
