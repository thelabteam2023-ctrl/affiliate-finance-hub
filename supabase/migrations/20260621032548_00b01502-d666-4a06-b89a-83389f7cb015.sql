-- Sprint 3 P4: Force security_invoker on 5 flagged views
ALTER VIEW public."view_monitoramento_liquidação_pernas" SET (security_invoker = on);
ALTER VIEW public.vw_saude_financeira SET (security_invoker = on);
ALTER VIEW public.v_bookmaker_saldo_audit SET (security_invoker = on);
ALTER VIEW public.v_saldo_parceiro_contas SET (security_invoker = on);
ALTER VIEW public.league_game_counts SET (security_invoker = on);

-- Sprint 3 P2: composite partial index for hottest apostas_unificada query
-- Pattern: projeto_id + status + cancelled_at IS NULL + data_aposta range ORDER BY data_aposta
CREATE INDEX IF NOT EXISTS idx_apostas_unif_projeto_status_data
  ON public.apostas_unificada (projeto_id, status, data_aposta)
  WHERE cancelled_at IS NULL;