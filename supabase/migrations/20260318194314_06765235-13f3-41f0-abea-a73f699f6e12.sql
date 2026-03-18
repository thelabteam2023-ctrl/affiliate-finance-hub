UPDATE cash_ledger 
SET status = 'CANCELADO', 
    updated_at = now(),
    descricao = COALESCE(descricao, '') || ' [CANCELADO: auto-transferência inválida Caixa→Caixa, mesma wallet]'
WHERE id = '89702817-c9fb-4bc2-9ac6-83f09945adc7'
  AND status = 'CONFIRMADO'