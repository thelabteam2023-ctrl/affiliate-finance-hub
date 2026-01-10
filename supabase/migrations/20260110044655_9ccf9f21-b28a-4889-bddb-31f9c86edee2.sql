-- =====================================================
-- SISTEMA DE RESPONSABILIDADES OPERACIONAIS NO PROJETO
-- =====================================================

-- 1. Adicionar coluna de responsabilidades em operador_projetos
-- Responsabilidades são específicas ao escopo do projeto
ALTER TABLE public.operador_projetos 
ADD COLUMN IF NOT EXISTS responsabilidades TEXT[] DEFAULT '{}';

-- 2. Criar índice GIN para buscas eficientes por responsabilidade
CREATE INDEX IF NOT EXISTS idx_operador_projetos_responsabilidades 
ON public.operador_projetos USING GIN(responsabilidades);

-- 3. Adicionar comentário descritivo
COMMENT ON COLUMN public.operador_projetos.responsabilidades IS 
'Array de responsabilidades operacionais no projeto. Valores possíveis: GERENCIAR_VINCULOS, REGISTRAR_APOSTAS, GERENCIAR_BONUS, CONCILIAR_ENTREGAS, REGISTRAR_PERDAS';

-- 4. Criar função para verificar se usuário tem responsabilidade no projeto
CREATE OR REPLACE FUNCTION public.has_project_responsibility(
  _user_id UUID,
  _projeto_id UUID,
  _responsabilidade TEXT
)
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_role TEXT;
  v_has_resp BOOLEAN := FALSE;
BEGIN
  -- 1. Buscar role do usuário no workspace do projeto
  SELECT wm.role INTO v_role
  FROM workspace_members wm
  JOIN projetos p ON p.workspace_id = wm.workspace_id
  WHERE wm.user_id = _user_id
    AND p.id = _projeto_id
  LIMIT 1;
  
  -- 2. Owner e Admin sempre têm todas as responsabilidades
  IF v_role IN ('owner', 'admin') THEN
    RETURN TRUE;
  END IF;
  
  -- 3. Verificar se é operador vinculado com a responsabilidade específica
  SELECT EXISTS (
    SELECT 1 
    FROM operador_projetos op
    JOIN operadores o ON o.id = op.operador_id
    WHERE o.auth_user_id = _user_id
      AND op.projeto_id = _projeto_id
      AND op.status = 'ATIVO'
      AND _responsabilidade = ANY(op.responsabilidades)
  ) INTO v_has_resp;
  
  RETURN v_has_resp;
END;
$$;

-- 5. Criar função para listar responsabilidades do usuário no projeto
CREATE OR REPLACE FUNCTION public.get_user_project_responsibilities(
  _user_id UUID,
  _projeto_id UUID
)
RETURNS TABLE (
  is_owner_or_admin BOOLEAN,
  is_linked_operator BOOLEAN,
  responsabilidades TEXT[],
  operador_projeto_id UUID
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_role TEXT;
BEGIN
  -- Buscar role do usuário no workspace do projeto
  SELECT wm.role INTO v_role
  FROM workspace_members wm
  JOIN projetos p ON p.workspace_id = wm.workspace_id
  WHERE wm.user_id = _user_id
    AND p.id = _projeto_id
  LIMIT 1;
  
  -- Se owner/admin, retornar todas as responsabilidades implícitas
  IF v_role IN ('owner', 'admin') THEN
    RETURN QUERY SELECT 
      TRUE AS is_owner_or_admin,
      FALSE AS is_linked_operator,
      ARRAY['GERENCIAR_VINCULOS', 'REGISTRAR_APOSTAS', 'GERENCIAR_BONUS', 'CONCILIAR_ENTREGAS', 'REGISTRAR_PERDAS']::TEXT[] AS responsabilidades,
      NULL::UUID AS operador_projeto_id;
    RETURN;
  END IF;
  
  -- Buscar vínculo do operador com o projeto
  RETURN QUERY
  SELECT 
    FALSE AS is_owner_or_admin,
    TRUE AS is_linked_operator,
    COALESCE(op.responsabilidades, '{}'::TEXT[]) AS responsabilidades,
    op.id AS operador_projeto_id
  FROM operador_projetos op
  JOIN operadores o ON o.id = op.operador_id
  WHERE o.auth_user_id = _user_id
    AND op.projeto_id = _projeto_id
    AND op.status = 'ATIVO'
  LIMIT 1;
  
  -- Se não encontrou vínculo, retornar vazio
  IF NOT FOUND THEN
    RETURN QUERY SELECT 
      FALSE AS is_owner_or_admin,
      FALSE AS is_linked_operator,
      '{}'::TEXT[] AS responsabilidades,
      NULL::UUID AS operador_projeto_id;
  END IF;
END;
$$;

-- 6. Para operadores existentes, dar responsabilidade padrão REGISTRAR_APOSTAS
UPDATE public.operador_projetos 
SET responsabilidades = ARRAY['REGISTRAR_APOSTAS']
WHERE responsabilidades = '{}' OR responsabilidades IS NULL;