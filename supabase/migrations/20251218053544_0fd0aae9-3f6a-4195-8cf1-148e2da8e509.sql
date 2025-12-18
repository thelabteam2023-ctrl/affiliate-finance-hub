
-- Fix user_has_pro_access to include OWNER bypass
CREATE OR REPLACE FUNCTION user_has_pro_access(_user_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_workspace_id UUID;
  v_plan TEXT;
  v_role TEXT;
BEGIN
  -- Buscar workspace do usuário
  SELECT workspace_id INTO v_workspace_id
  FROM workspace_members
  WHERE user_id = _user_id AND is_active = true
  LIMIT 1;
  
  IF v_workspace_id IS NULL THEN
    RETURN FALSE;
  END IF;
  
  -- Verificar se é OWNER (bypass total de plano)
  SELECT role::text INTO v_role
  FROM workspace_members
  WHERE user_id = _user_id AND workspace_id = v_workspace_id AND is_active = true
  LIMIT 1;
  
  IF v_role IN ('owner', 'master') THEN
    RETURN TRUE;
  END IF;
  
  -- Buscar plano do workspace
  SELECT plan INTO v_plan
  FROM workspaces
  WHERE id = v_workspace_id;
  
  -- PRO e Advanced têm acesso
  RETURN v_plan IN ('pro', 'advanced');
END;
$$;

-- Add DELETE policy for community_evaluations (was missing)
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE tablename = 'community_evaluations' 
    AND policyname = 'Users can delete own evaluations'
  ) THEN
    CREATE POLICY "Users can delete own evaluations"
    ON community_evaluations
    FOR DELETE
    USING (auth.uid() = user_id AND user_has_pro_access(auth.uid()));
  END IF;
END $$;
