
-- Remover constraint antigo e criar novo com todos os tipos de transação necessários
ALTER TABLE public.cash_ledger DROP CONSTRAINT IF EXISTS cash_ledger_tipo_transacao_check;

ALTER TABLE public.cash_ledger ADD CONSTRAINT cash_ledger_tipo_transacao_check 
CHECK (tipo_transacao = ANY (ARRAY[
  'APORTE_FINANCEIRO'::text, 
  'TRANSFERENCIA'::text, 
  'DEPOSITO'::text, 
  'SAQUE'::text,
  'PAGTO_PARCEIRO'::text,
  'PAGTO_FORNECEDOR'::text,
  'COMISSAO_INDICADOR'::text,
  'BONUS_INDICADOR'::text,
  'DESPESA_ADMINISTRATIVA'::text,
  'PAGTO_OPERADOR'::text,
  'CONCILIACAO'::text
]));
