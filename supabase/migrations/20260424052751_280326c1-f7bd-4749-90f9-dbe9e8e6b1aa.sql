-- Corrigir financial_event do depósito 835506c7 para refletir o valor_destino correto (99.09 EUR em vez de 116.80)
-- O cash_ledger já foi corrigido; agora precisamos sincronizar o financial_event e o saldo_atual do bookmaker.

-- 1) Atualizar financial_event para 99.09 EUR
UPDATE public.financial_events
SET valor = 99.09,
    metadata = COALESCE(metadata, '{}'::jsonb) || jsonb_build_object(
      'corrected_at', now(),
      'corrected_reason', 'Sync com cash_ledger 835506c7 (USDT→EUR conversão 1:1 corrigida)',
      'previous_valor', 116.80
    )
WHERE idempotency_key = 'ledger_deposit_835506c7-43de-4c5c-8c46-0c99a53fae0d';

-- 2) Recalcular saldo_atual do bookmaker THUNDERPICK EUR (4c795128) somando todos os financial_events confirmados
UPDATE public.bookmakers
SET saldo_atual = COALESCE((
  SELECT SUM(valor)
  FROM public.financial_events
  WHERE bookmaker_id = '4c795128-8fd0-4f98-aa90-06cf46290059'
    AND tipo_evento IN ('DEPOSITO','SAQUE','GANHO','PERDA','BONUS','AJUSTE','CASHBACK','FREEBET_USO','REVERSAO')
    AND processed_at IS NOT NULL
), 0)
WHERE id = '4c795128-8fd0-4f98-aa90-06cf46290059';