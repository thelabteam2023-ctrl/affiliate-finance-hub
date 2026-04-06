
-- Add soft delete column
ALTER TABLE public.solicitacoes ADD COLUMN IF NOT EXISTS deleted_at timestamptz DEFAULT NULL;

-- Add deleted_by for audit
ALTER TABLE public.solicitacoes ADD COLUMN IF NOT EXISTS deleted_by uuid DEFAULT NULL;
