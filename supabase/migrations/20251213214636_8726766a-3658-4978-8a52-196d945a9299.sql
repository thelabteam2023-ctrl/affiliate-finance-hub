-- Atualizar constraint de destino_tipo para incluir PARCEIRO (pagamentos de captação)
ALTER TABLE public.cash_ledger DROP CONSTRAINT IF EXISTS cash_ledger_destino_tipo_check;

ALTER TABLE public.cash_ledger ADD CONSTRAINT cash_ledger_destino_tipo_check 
CHECK (destino_tipo = ANY (ARRAY[
  'CAIXA_OPERACIONAL'::text, 
  'PARCEIRO'::text,
  'PARCEIRO_CONTA'::text, 
  'PARCEIRO_WALLET'::text, 
  'BOOKMAKER'::text, 
  'INVESTIDOR'::text,
  'FORNECEDOR'::text,
  'INDICADOR'::text,
  'OPERADOR'::text
]));