
-- 1) Remover SELECT anon de supplier_titulares (PII exposto)
DROP POLICY IF EXISTS "anon_select_supplier_titulares" ON public.supplier_titulares;

-- 2) Remover SELECT público sem validação de token em projeto_shared_links
DROP POLICY IF EXISTS "public_read_by_token" ON public.projeto_shared_links;

-- 3) Endurecer SELECT do bucket chat-media (path: {userId}/{workspaceId}/...)
DROP POLICY IF EXISTS "Users can view chat media from their workspace" ON storage.objects;

CREATE POLICY "Users can view chat media from their workspace"
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'chat-media'
  AND auth.uid() IS NOT NULL
  AND EXISTS (
    SELECT 1 FROM public.workspace_members wm
    WHERE wm.user_id = auth.uid()
      AND wm.workspace_id::text = (storage.foldername(name))[2]
  )
);
