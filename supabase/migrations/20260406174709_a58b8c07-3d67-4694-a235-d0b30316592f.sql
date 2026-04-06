
ALTER TABLE public.solicitacoes ADD COLUMN IF NOT EXISTS archived_at timestamptz DEFAULT NULL;
