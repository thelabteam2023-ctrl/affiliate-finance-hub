-- Fix 1: Replace public RLS policies on supplier_titular_bancos with workspace-scoped authenticated policies
DROP POLICY IF EXISTS "supplier_titular_bancos_select" ON public.supplier_titular_bancos;
DROP POLICY IF EXISTS "supplier_titular_bancos_insert" ON public.supplier_titular_bancos;
DROP POLICY IF EXISTS "supplier_titular_bancos_update" ON public.supplier_titular_bancos;

CREATE POLICY "workspace_members_supplier_titular_bancos"
ON public.supplier_titular_bancos
FOR ALL
TO authenticated
USING (check_supplier_workspace_access(supplier_workspace_id))
WITH CHECK (check_supplier_workspace_access(supplier_workspace_id));

-- Fix 2: Replace public storage policies on solicitacoes-anexos with workspace-scoped policies
DROP POLICY IF EXISTS "Membros podem ler anexos de solicitações" ON storage.objects;
DROP POLICY IF EXISTS "Membros podem enviar anexos de solicitações" ON storage.objects;

CREATE POLICY "solicitacoes_anexos_select"
ON storage.objects FOR SELECT
TO authenticated
USING (
  bucket_id = 'solicitacoes-anexos'
  AND EXISTS (
    SELECT 1
    FROM solicitacoes s
    JOIN workspace_members wm ON wm.workspace_id = s.workspace_id
    WHERE s.id::text = (storage.foldername(name))[1]
    AND wm.user_id = auth.uid()
  )
);

CREATE POLICY "solicitacoes_anexos_insert"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'solicitacoes-anexos'
  AND EXISTS (
    SELECT 1
    FROM solicitacoes s
    JOIN workspace_members wm ON wm.workspace_id = s.workspace_id
    WHERE s.id::text = (storage.foldername(name))[1]
    AND wm.user_id = auth.uid()
  )
);