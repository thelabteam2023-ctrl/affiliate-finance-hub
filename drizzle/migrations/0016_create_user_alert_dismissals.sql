CREATE TABLE public.user_alert_dismissals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  workspace_id uuid NOT NULL,
  project_id uuid,
  alert_key text NOT NULL,
  dismissed_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX ux_user_alert_dismissals_scope
  ON public.user_alert_dismissals (user_id, alert_key, COALESCE(project_id, '00000000-0000-0000-0000-000000000000'::uuid));

CREATE INDEX ix_user_alert_dismissals_user ON public.user_alert_dismissals (user_id, workspace_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_alert_dismissals TO authenticated;
GRANT ALL ON public.user_alert_dismissals TO service_role;

ALTER TABLE public.user_alert_dismissals ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own alert dismissals - select"
  ON public.user_alert_dismissals FOR SELECT TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "Users manage own alert dismissals - insert"
  ON public.user_alert_dismissals FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users manage own alert dismissals - update"
  ON public.user_alert_dismissals FOR UPDATE TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users manage own alert dismissals - delete"
  ON public.user_alert_dismissals FOR DELETE TO authenticated
  USING (user_id = auth.uid());