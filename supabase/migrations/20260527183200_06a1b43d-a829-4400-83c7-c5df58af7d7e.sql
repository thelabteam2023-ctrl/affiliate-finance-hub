
CREATE TABLE IF NOT EXISTS public.error_logs (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  error_type  VARCHAR(100),
  message     TEXT,
  stack       TEXT,
  context     JSONB,
  user_id     UUID,
  workspace_id UUID,
  url         TEXT,
  user_agent  TEXT,
  resolved    BOOLEAN NOT NULL DEFAULT false,
  resolved_at TIMESTAMPTZ,
  resolved_by UUID,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_error_logs_unresolved ON public.error_logs (occurred_at DESC) WHERE resolved = false;
CREATE INDEX IF NOT EXISTS idx_error_logs_user ON public.error_logs (user_id, occurred_at DESC);

GRANT SELECT, INSERT, UPDATE ON public.error_logs TO authenticated;
GRANT ALL ON public.error_logs TO service_role;

ALTER TABLE public.error_logs ENABLE ROW LEVEL SECURITY;

-- Qualquer usuário autenticado pode INSERIR seu próprio erro (para captura global)
CREATE POLICY "auth_can_insert_own_errors"
ON public.error_logs FOR INSERT
TO authenticated
WITH CHECK (user_id = auth.uid() OR user_id IS NULL);

-- Apenas owners do workspace (ou system owner) podem LER erros
CREATE POLICY "owners_can_read_errors"
ON public.error_logs FOR SELECT
TO authenticated
USING (
  public.is_system_owner(auth.uid())
  OR EXISTS (
    SELECT 1 FROM public.workspace_members wm
    WHERE wm.user_id = auth.uid() AND wm.role IN ('owner','admin')
  )
);

-- Apenas owners/admins podem marcar como resolvido
CREATE POLICY "owners_can_update_errors"
ON public.error_logs FOR UPDATE
TO authenticated
USING (
  public.is_system_owner(auth.uid())
  OR EXISTS (
    SELECT 1 FROM public.workspace_members wm
    WHERE wm.user_id = auth.uid() AND wm.role IN ('owner','admin')
  )
);
