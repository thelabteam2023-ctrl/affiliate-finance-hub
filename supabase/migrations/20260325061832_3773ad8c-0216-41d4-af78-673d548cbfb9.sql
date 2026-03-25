
CREATE TABLE public.supplier_allowed_bookmakers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  supplier_workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  bookmaker_catalogo_id uuid NOT NULL REFERENCES public.bookmakers_catalogo(id) ON DELETE CASCADE,
  added_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (supplier_workspace_id, bookmaker_catalogo_id)
);

ALTER TABLE public.supplier_allowed_bookmakers ENABLE ROW LEVEL SECURITY;

-- Admin access (authenticated users who are members of parent workspace)
CREATE POLICY "admin_supplier_allowed_bookmakers"
ON public.supplier_allowed_bookmakers
FOR ALL
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM supplier_profiles sp
    JOIN workspace_members wm ON wm.workspace_id = sp.parent_workspace_id
    WHERE sp.workspace_id = supplier_allowed_bookmakers.supplier_workspace_id
    AND wm.user_id = auth.uid()
  )
);

-- Anon access for supplier portal (SELECT only)
CREATE POLICY "anon_select_supplier_allowed_bookmakers"
ON public.supplier_allowed_bookmakers
FOR SELECT
TO anon
USING (true);
