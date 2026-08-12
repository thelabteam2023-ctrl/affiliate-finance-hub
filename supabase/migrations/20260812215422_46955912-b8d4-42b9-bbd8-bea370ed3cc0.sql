-- REGULARIZAÇÃO DE SALDO DUPLICADO: SMAN 365
-- Removemos o evento 'PERDA_OPERACIONAL' que não deveria ter sido gerado manualmente (audit-only)
-- e mantemos apenas o evento 'LOSS' que é o canônico da V6.
DELETE FROM financial_events 
WHERE idempotency_key = 'ledger_perda_op_521b5cca-efd9-4d0b-bd8e-acc3e989b2fd';

-- Restaurar o saldo (estornando o débito duplicado)
UPDATE bookmakers 
SET saldo_atual = saldo_atual + 1422.44 
WHERE id = '50808c70-f697-4a5d-9812-b04cd7a41225';
