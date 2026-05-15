-- 1. Add missing column to parceiros
DO $$ 
BEGIN 
    IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE table_name = 'parceiros' AND column_name = 'supplier_profile_id') THEN
        ALTER TABLE public.parceiros ADD COLUMN supplier_profile_id UUID REFERENCES public.supplier_profiles(id);
    END IF;
END $$;

-- 2. Cleanup duplicate active partnerships
-- We keep the most recent record (by created_at) and mark others as 'ENCERRADA'
WITH ranked_parcerias AS (
  SELECT id,
         row_number() OVER (PARTITION BY parceiro_id, fornecedor_id ORDER BY created_at DESC) as rank
  FROM public.parcerias
  WHERE status IN ('ATIVA', 'EM_ENCERRAMENTO')
    AND origem_tipo = 'FORNECEDOR'
)
UPDATE public.parcerias
SET status = 'ENCERRADA',
    updated_at = now()
WHERE id IN (
  SELECT id FROM ranked_parcerias WHERE rank > 1
);

-- 3. Add partial unique index to prevent future duplicates
-- This ensures only one active/closing partnership exists between a partner and a supplier
DROP INDEX IF EXISTS idx_parcerias_unique_active_supplier;
CREATE UNIQUE INDEX idx_parcerias_unique_active_supplier 
ON public.parcerias (parceiro_id, fornecedor_id) 
WHERE (status IN ('ATIVA', 'EM_ENCERRAMENTO') AND origem_tipo = 'FORNECEDOR');

-- 4. Update activate_supplier_portal to handle supplier creation as well
-- This makes the whole process atomic
CREATE OR REPLACE FUNCTION public.activate_supplier_portal(
    p_parent_workspace_id uuid,
    p_nome text,
    p_contato text DEFAULT NULL::text,
    p_observacoes text DEFAULT NULL::text,
    p_fornecedor_id uuid DEFAULT NULL::uuid,
    p_documento text DEFAULT NULL::text,
    p_email text DEFAULT NULL::text
)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  v_user_id uuid := auth.uid();
  v_ws_id uuid;
  v_sp_id uuid;
  v_final_fornecedor_id uuid := p_fornecedor_id;
BEGIN
  -- Validate caller is owner/admin of parent workspace
  IF NOT public.can_manage_workspace(v_user_id, p_parent_workspace_id) THEN
    RAISE EXCEPTION 'Permissão negada: você não é owner/admin deste workspace';
  END IF;

  -- 1. Create supplier record if it doesn't exist
  IF v_final_fornecedor_id IS NULL THEN
    INSERT INTO public.fornecedores (workspace_id, nome, contato, documento, email, observacoes)
    VALUES (p_parent_workspace_id, p_nome, p_contato, p_documento, p_email, p_observacoes)
    RETURNING id INTO v_final_fornecedor_id;
  END IF;

  -- 2. Create child workspace
  INSERT INTO public.workspaces (name, parent_workspace_id, tipo)
  VALUES ('Fornecedor: ' || p_nome, p_parent_workspace_id, 'fornecedor')
  RETURNING id INTO v_ws_id;

  -- 3. Seed owner membership
  INSERT INTO public.workspace_members (workspace_id, user_id, role, is_active)
  VALUES (v_ws_id, v_user_id, 'owner', true);

  -- 4. Create supplier profile
  INSERT INTO public.supplier_profiles (workspace_id, parent_workspace_id, nome, contato, observacoes, created_by, fornecedor_id)
  VALUES (v_ws_id, p_parent_workspace_id, p_nome, p_contato, p_observacoes, v_user_id, v_final_fornecedor_id)
  RETURNING id INTO v_sp_id;

  -- 5. Create partner record for balance tracking
  INSERT INTO public.parceiros (nome, workspace_id, user_id, status, supplier_profile_id)
  VALUES (p_nome || ' (Fornecedor)', p_parent_workspace_id, v_user_id, 'ativo', v_sp_id);

  RETURN jsonb_build_object(
    'success', true,
    'workspace_id', v_ws_id,
    'supplier_profile_id', v_sp_id,
    'fornecedor_id', v_final_fornecedor_id
  );
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$function$;
