ALTER PUBLICATION supabase_realtime ADD TABLE public.apostas_pernas;
ALTER PUBLICATION supabase_realtime ADD TABLE public.cashback_manual;
ALTER PUBLICATION supabase_realtime ADD TABLE public.giros_gratis;
ALTER PUBLICATION supabase_realtime ADD TABLE public.freebets_recebidas;
ALTER PUBLICATION supabase_realtime ADD TABLE public.financial_events;

ALTER TABLE public.apostas_pernas REPLICA IDENTITY FULL;
ALTER TABLE public.cashback_manual REPLICA IDENTITY FULL;
ALTER TABLE public.giros_gratis REPLICA IDENTITY FULL;
ALTER TABLE public.freebets_recebidas REPLICA IDENTITY FULL;
ALTER TABLE public.financial_events REPLICA IDENTITY FULL;
ALTER TABLE public.apostas_unificada REPLICA IDENTITY FULL;
ALTER TABLE public.bookmakers REPLICA IDENTITY FULL;
ALTER TABLE public.project_bookmaker_link_bonuses REPLICA IDENTITY FULL;