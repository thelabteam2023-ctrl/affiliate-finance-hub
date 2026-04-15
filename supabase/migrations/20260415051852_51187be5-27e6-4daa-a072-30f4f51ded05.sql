
-- Atualizar o CHECK constraint para incluir BASELINE e MIGRACAO
ALTER TABLE public.cash_ledger DROP CONSTRAINT cash_ledger_origem_tipo_check;

ALTER TABLE public.cash_ledger ADD CONSTRAINT cash_ledger_origem_tipo_check
CHECK (origem_tipo = ANY (ARRAY[
  'CAIXA_OPERACIONAL', 'PARCEIRO_CONTA', 'PARCEIRO_WALLET', 
  'BOOKMAKER', 'INVESTIDOR', 'AJUSTE',
  'BASELINE', 'MIGRACAO'
]));
