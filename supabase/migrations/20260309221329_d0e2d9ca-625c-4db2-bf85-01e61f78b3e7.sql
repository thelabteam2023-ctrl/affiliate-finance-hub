
-- REVERTER: Remover origem_conta_bancaria_id das TRANSFERÊNCIAs que foram incorretamente vinculadas
-- Apenas as DESPESA_ADMINISTRATIVA devem manter o vínculo (R$ 308 e R$ 35)
UPDATE cash_ledger
SET origem_conta_bancaria_id = NULL,
    origem_parceiro_id = NULL
WHERE origem_tipo = 'CAIXA_OPERACIONAL'
  AND origem_conta_bancaria_id = '991c0176-2434-4cdd-9ed9-169ed87907e5'
  AND tipo_transacao = 'TRANSFERENCIA'
  AND status = 'CONFIRMADO';
