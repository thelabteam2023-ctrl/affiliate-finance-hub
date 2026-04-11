
-- Drop and recreate the check constraint with missing event types
ALTER TABLE public.financial_events DROP CONSTRAINT IF EXISTS financial_events_tipo_evento_check;

ALTER TABLE public.financial_events ADD CONSTRAINT financial_events_tipo_evento_check
CHECK (tipo_evento = ANY (ARRAY[
  'STAKE',
  'PAYOUT',
  'VOID_REFUND',
  'REVERSAL',
  'FREEBET_STAKE',
  'FREEBET_PAYOUT',
  'FREEBET_CREDIT',
  'FREEBET_EXPIRE',
  'DEPOSITO',
  'SAQUE',
  'CASHBACK',
  'CASHBACK_ESTORNO',
  'BONUS',
  'AJUSTE',
  'BONUS_ESTORNO',
  'TRANSFERENCIA_SAIDA',
  'TRANSFERENCIA_ENTRADA',
  'PERDA_OPERACIONAL',
  'PERDA_REVERSAO',
  'GIRO_GRATIS',
  'GIRO_GRATIS_ESTORNO'
]));
