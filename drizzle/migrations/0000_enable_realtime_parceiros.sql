ALTER TABLE public.parceiros REPLICA IDENTITY FULL;
ALTER PUBLICATION supabase_realtime ADD TABLE public.parceiros;