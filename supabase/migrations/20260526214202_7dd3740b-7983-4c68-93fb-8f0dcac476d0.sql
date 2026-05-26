-- Remover tabelas não utilizadas em Realtime da publicação supabase_realtime
-- Isso reduz a superfície de ataque sem afetar funcionalidades

ALTER PUBLICATION supabase_realtime DROP TABLE public.login_history;
ALTER PUBLICATION supabase_realtime DROP TABLE public.bookmaker_stake_reservations;
ALTER PUBLICATION supabase_realtime DROP TABLE public.movimentacoes_indicacao;
ALTER PUBLICATION supabase_realtime DROP TABLE public.pagamentos_operador;
ALTER PUBLICATION supabase_realtime DROP TABLE public.parceiro_lucro_alertas;
ALTER PUBLICATION supabase_realtime DROP TABLE public.parcerias;