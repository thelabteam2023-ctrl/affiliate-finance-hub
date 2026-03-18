
-- Table to track dismissed cycle alerts (hide/unhide)
CREATE TABLE public.ciclo_alert_dismissals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ciclo_id UUID NOT NULL REFERENCES public.projeto_ciclos(id) ON DELETE CASCADE,
  dismissed_by UUID NOT NULL,
  dismissed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(ciclo_id, dismissed_by)
);

ALTER TABLE public.ciclo_alert_dismissals ENABLE ROW LEVEL SECURITY;

-- Users can see their own dismissals
CREATE POLICY "Users can view own dismissals"
  ON public.ciclo_alert_dismissals FOR SELECT
  TO authenticated
  USING (dismissed_by = auth.uid());

-- Users can insert their own dismissals
CREATE POLICY "Users can dismiss alerts"
  ON public.ciclo_alert_dismissals FOR INSERT
  TO authenticated
  WITH CHECK (dismissed_by = auth.uid());

-- Users can delete their own dismissals (unhide)
CREATE POLICY "Users can undismiss alerts"
  ON public.ciclo_alert_dismissals FOR DELETE
  TO authenticated
  USING (dismissed_by = auth.uid());
