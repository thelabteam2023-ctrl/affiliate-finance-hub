-- Extender o constraint de tipo_transacao para incluir créditos de giro e cashback
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
    'CONCILIACAO'::text,
    'CREDITO_GIRO'::text,        -- NOVO: Retorno de giro grátis
    'CREDITO_CASHBACK'::text     -- NOVO: Recebimento de cashback
  ]));