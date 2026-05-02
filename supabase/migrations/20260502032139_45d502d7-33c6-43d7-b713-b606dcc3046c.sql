CREATE OR REPLACE FUNCTION public.activate_supplier_portal(
    p_parent_workspace_id uuid,
    p_nome text,
    p_contato text DEFAULT NULL::text,
    p_observacoes text DEFAULT NULL::text,
    p_fornecedor_id uuid DEFAULT NULL::uuid
)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  v_user_id uuid := auth.uid();
  v_ws_id uuid;
  v_sp_id uuid;
BEGIN
  -- Validate caller is owner/admin of parent workspace
  IF NOT public.can_manage_workspace(v_user_id, p_parent_workspace_id) THEN
    RAISE EXCEPTION 'Permissão negada: você não é owner/admin deste workspace';
  END IF;

  -- 1. Create child workspace
  INSERT INTO public.workspaces (name, parent_workspace_id, tipo)
  VALUES ('Fornecedor: ' || p_nome, p_parent_workspace_id, 'fornecedor')
  RETURNING id INTO v_ws_id;

  -- 2. Seed owner membership
  INSERT INTO public.workspace_members (workspace_id, user_id, role, is_active)
  VALUES (v_ws_id, v_user_id, 'owner', true);

  -- 3. Create supplier profile
  INSERT INTO public.supplier_profiles (workspace_id, parent_workspace_id, nome, contato, observacoes, created_by, fornecedor_id)
  VALUES (v_ws_id, p_parent_workspace_id, p_nome, p_contato, p_observacoes, v_user_id, p_fornecedor_id)
  RETURNING id INTO v_sp_id;

  -- 4. Create partner record for balance tracking
  INSERT INTO public.parceiros (nome, workspace_id, user_id, status, supplier_profile_id)
  VALUES (p_nome || ' (Fornecedor)', p_parent_workspace_id, v_user_id, 'ativo', v_sp_id);

  RETURN jsonb_build_object(
    'success', true,
    'workspace_id', v_ws_id,
    'supplier_profile_id', v_sp_id
  );
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$function$;
