ALTER PUBLICATION supabase_realtime ADD TABLE public.workspace_announcements;
ALTER TABLE public.workspace_announcements REPLICA IDENTITY FULL;