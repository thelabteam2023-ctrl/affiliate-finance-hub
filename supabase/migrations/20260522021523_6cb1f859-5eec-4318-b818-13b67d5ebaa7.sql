CREATE OR REPLACE VIEW public.vw_auditoria_integridade_surebet 
WITH (security_invoker=on) AS
SELECT 
  au.id as aposta_id,
  au.evento,
  au.data_aposta,
  au.lucro_prejuizo as lucro_registrado,
  au.stake_total as stake_registrada,
  
  -- Cálculo real baseado no Ledger
  COALESCE((
    SELECT SUM(valor) 
    FROM public.financial_events 
    WHERE aposta_id = au.id AND tipo_evento IN ('PAYOUT', 'VOID_REFUND', 'FREEBET_PAYOUT', 'REVERSAL')
  ), 0) + 
  COALESCE((
    SELECT SUM(valor) 
    FROM public.financial_events 
    WHERE aposta_id = au.id AND tipo_evento IN ('STAKE', 'FREEBET_STAKE')
  ), 0) as lucro_real_ledger,

  -- Verificação de divergência
  ABS(au.lucro_prejuizo - COALESCE((
    SELECT SUM(valor) 
    FROM public.financial_events 
    WHERE aposta_id = au.id AND tipo_evento IN ('PAYOUT', 'VOID_REFUND', 'FREEBET_PAYOUT', 'REVERSAL')
  ), 0) - COALESCE((
    SELECT SUM(valor) 
    FROM public.financial_events 
    WHERE aposta_id = au.id AND tipo_evento IN ('STAKE', 'FREEBET_STAKE')
  ), 0)) > 0.05 as tem_divergencia_lucro,

  -- Contagem de entradas vs pernas
  (SELECT COUNT(*) FROM public.apostas_pernas WHERE aposta_id = au.id) as total_pernas,
  (SELECT COUNT(*) FROM public.apostas_perna_entradas ae JOIN public.apostas_pernas ap ON ap.id = ae.perna_id WHERE ap.aposta_id = au.id) as total_entradas

FROM public.apostas_unificada au
WHERE au.forma_registro = 'ARBITRAGEM';

COMMENT ON VIEW public.vw_auditoria_integridade_surebet IS 'Painel de controle para detecção de falhas de hidratação e integridade financeira.';