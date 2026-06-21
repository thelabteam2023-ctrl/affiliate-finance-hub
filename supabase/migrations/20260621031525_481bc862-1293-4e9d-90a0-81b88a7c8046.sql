-- 1. Tabela
CREATE TABLE public.ledger_parity_anomalies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  bookmaker_id UUID NOT NULL REFERENCES public.bookmakers(id) ON DELETE CASCADE,
  saldo_atual NUMERIC(20,4) NOT NULL,
  soma_ledger NUMERIC(20,4) NOT NULL,
  delta NUMERIC(20,4) NOT NULL,
  contexto TEXT,
  detected_by_user_id UUID,
  dia DATE NOT NULL DEFAULT (now() AT TIME ZONE 'UTC')::date,
  acknowledged_at TIMESTAMPTZ,
  acknowledged_by UUID,
  acknowledged_note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- Idempotência: uma anomalia por bookmaker/dia/contexto
  UNIQUE (bookmaker_id, dia, contexto)
);

-- 2. GRANTs (Data API)
GRANT SELECT, UPDATE ON public.ledger_parity_anomalies TO authenticated;
GRANT ALL ON public.ledger_parity_anomalies TO service_role;

-- 3. Índices úteis
CREATE INDEX idx_ledger_parity_anomalies_workspace_created
  ON public.ledger_parity_anomalies (workspace_id, created_at DESC);
CREATE INDEX idx_ledger_parity_anomalies_bookmaker
  ON public.ledger_parity_anomalies (bookmaker_id, created_at DESC);
CREATE INDEX idx_ledger_parity_anomalies_unack
  ON public.ledger_parity_anomalies (workspace_id, acknowledged_at)
  WHERE acknowledged_at IS NULL;

-- 4. RLS
ALTER TABLE public.ledger_parity_anomalies ENABLE ROW LEVEL SECURITY;

-- 4.1 Membros do workspace leem suas próprias anomalias
CREATE POLICY "Members can view their workspace anomalies"
ON public.ledger_parity_anomalies
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.workspace_members wm
    WHERE wm.workspace_id = ledger_parity_anomalies.workspace_id
      AND wm.user_id = auth.uid()
  )
);

-- 4.2 Admins/owners do workspace podem reconhecer (UPDATE)
CREATE POLICY "Admins can acknowledge anomalies"
ON public.ledger_parity_anomalies
FOR UPDATE
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.workspace_members wm
    WHERE wm.workspace_id = ledger_parity_anomalies.workspace_id
      AND wm.user_id = auth.uid()
      AND wm.role IN ('owner','admin')
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.workspace_members wm
    WHERE wm.workspace_id = ledger_parity_anomalies.workspace_id
      AND wm.user_id = auth.uid()
      AND wm.role IN ('owner','admin')
  )
);

-- 5. Trigger updated_at
CREATE OR REPLACE FUNCTION public.tg_set_updated_at_ledger_parity()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER set_updated_at_ledger_parity_anomalies
BEFORE UPDATE ON public.ledger_parity_anomalies
FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at_ledger_parity();