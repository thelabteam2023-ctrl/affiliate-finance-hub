
-- Fix supplier_profiles RLS: add explicit WITH CHECK for INSERT
DROP POLICY IF EXISTS "workspace_members_supplier_profiles" ON public.supplier_profiles;

CREATE POLICY "workspace_members_supplier_profiles"
ON public.supplier_profiles
FOR ALL
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM workspace_members wm
    WHERE wm.workspace_id = supplier_profiles.parent_workspace_id
    AND wm.user_id = auth.uid()
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM workspace_members wm
    WHERE wm.workspace_id = supplier_profiles.parent_workspace_id
    AND wm.user_id = auth.uid()
  )
);
