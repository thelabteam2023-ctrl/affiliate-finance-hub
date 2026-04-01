
-- 1. Remover o financial_event do depósito na StoneVegas
DELETE FROM public.financial_events WHERE id = '090cd092-7744-4d83-b67c-4bfc4b6df0ff';

-- 2. Remover os 3 lançamentos do ledger
DELETE FROM public.cash_ledger WHERE id IN (
  'a701f555-a0ef-4837-b386-5adbefd3ef74',  -- Transferência original Caixa→Juliana
  'c7c33354-94f7-4136-9b5b-a923b81fb893',  -- Reversão de auditoria
  '44cc73bb-ae81-44d0-a997-d2305aa49032'   -- Depósito na StoneVegas
);

-- 3. Corrigir saldo da bookmaker StoneVegas (remover o crédito de 102.58)
UPDATE public.bookmakers
SET saldo_atual = saldo_atual - 102.58,
    updated_at = now()
WHERE id = 'f17fa21b-5546-49a2-9bc5-7c0e8aeb5245';
