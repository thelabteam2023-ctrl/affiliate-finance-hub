
-- RPC: Create titular AND parceiro atomically, linking them
-- Called from the supplier portal when creating a new titular
CREATE OR REPLACE FUNCTION public.create_titular_with_parceiro(
  p_supplier_workspace_id uuid,
  p_nome text,
  p_cpf text DEFAULT NULL,
  p_email text DEFAULT NULL,
  p_telefone text DEFAULT NULL,
  p_data_nascimento date DEFAULT NULL,
  p_endereco text DEFAULT NULL,
  p_cep text DEFAULT NULL,
  p_cidade text DEFAULT NULL,
  p_observacoes text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_titular_id uuid;
  v_parceiro_id uuid;
  v_parent_workspace_id uuid;
  v_fornecedor_id uuid;
  v_admin_user_id uuid;
BEGIN
  -- 1. Get parent workspace and validate
  SELECT w.parent_workspace_id INTO v_parent_workspace_id
  FROM workspaces w
  WHERE w.id = p_supplier_workspace_id AND w.tipo = 'fornecedor';
  
  IF v_parent_workspace_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Workspace de fornecedor não encontrado');
  END IF;

  -- 2. Get the fornecedor_id linked to this supplier workspace
  SELECT sp.fornecedor_id INTO v_fornecedor_id
  FROM supplier_profiles sp
  WHERE sp.workspace_id = p_supplier_workspace_id
  LIMIT 1;

  -- 3. Get admin user (owner of parent workspace) for parceiro.user_id
  SELECT wm.user_id INTO v_admin_user_id
  FROM workspace_members wm
  WHERE wm.workspace_id = v_parent_workspace_id
    AND wm.role = 'owner'
    AND wm.is_active = true
  LIMIT 1;
  
  IF v_admin_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Admin do workspace não encontrado');
  END IF;

  -- 4. Create the supplier titular
  INSERT INTO supplier_titulares (
    supplier_workspace_id, nome, documento, documento_tipo, email, telefone, observacoes
  ) VALUES (
    p_supplier_workspace_id, p_nome, p_cpf, CASE WHEN p_cpf IS NOT NULL THEN 'CPF' ELSE NULL END, p_email, p_telefone, p_observacoes
  ) RETURNING id INTO v_titular_id;

  -- 5. Create parceiro in parent workspace (only if CPF provided, since it's required)
  IF p_cpf IS NOT NULL AND p_cpf != '' THEN
    INSERT INTO parceiros (
      nome, cpf, email, telefone, data_nascimento, endereco, cep, cidade,
      observacoes, user_id, workspace_id, fornecedor_origem_id, supplier_titular_id, status
    ) VALUES (
      p_nome, p_cpf, p_email, p_telefone, p_data_nascimento, p_endereco, p_cep, p_cidade,
      p_observacoes, v_admin_user_id, v_parent_workspace_id, v_fornecedor_id, v_titular_id, 'ATIVO'
    ) RETURNING id INTO v_parceiro_id;
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'titular_id', v_titular_id,
    'parceiro_id', v_parceiro_id
  );
EXCEPTION WHEN unique_violation THEN
  RETURN jsonb_build_object('success', false, 'error', 'CPF já cadastrado no sistema');
END;
$$;
