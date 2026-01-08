-- =====================================================
-- SISTEMA DE MÓDULOS DINÂMICOS POR PROJETO
-- =====================================================

-- 1. Catálogo de módulos disponíveis no sistema
CREATE TABLE public.project_modules_catalog (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  icon TEXT NOT NULL DEFAULT 'Puzzle',
  default_order INTEGER NOT NULL DEFAULT 100,
  requires_modules TEXT[] DEFAULT '{}',
  category TEXT NOT NULL DEFAULT 'estrategia',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Inserir módulos estratégicos disponíveis
INSERT INTO public.project_modules_catalog (id, name, description, icon, default_order, category) VALUES
  ('surebet', 'Surebet', 'Apostas arbitradas com lucro garantido independente do resultado', 'ArrowLeftRight', 10, 'estrategia'),
  ('valuebet', 'ValueBet', 'Apostas com valor esperado positivo baseadas em análise de odds', 'Sparkles', 20, 'estrategia'),
  ('duplogreen', 'Duplo Green', 'Estratégia de proteção com potencial de lucro em dois resultados', 'Zap', 30, 'estrategia'),
  ('freebets', 'Freebets', 'Gestão de apostas grátis e conversão em valor real', 'Gift', 40, 'estrategia'),
  ('bonus', 'Bônus', 'Controle de bônus de casas, rollover e extração de valor', 'Coins', 50, 'estrategia');

-- Enable RLS
ALTER TABLE public.project_modules_catalog ENABLE ROW LEVEL SECURITY;

-- Política: Todos podem ler o catálogo
CREATE POLICY "project_modules_catalog_select_all" ON public.project_modules_catalog
FOR SELECT TO authenticated
USING (true);

-- 2. Módulos ativados por projeto
CREATE TABLE public.project_modules (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  projeto_id UUID NOT NULL REFERENCES public.projetos(id) ON DELETE CASCADE,
  module_id TEXT NOT NULL REFERENCES public.project_modules_catalog(id) ON DELETE RESTRICT,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'archived')),
  display_order INTEGER NOT NULL DEFAULT 100,
  activated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  activated_by UUID REFERENCES auth.users(id),
  archived_at TIMESTAMPTZ,
  archived_by UUID REFERENCES auth.users(id),
  archive_reason TEXT,
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  
  -- Índice único para evitar duplicatas
  CONSTRAINT project_modules_unique UNIQUE (projeto_id, module_id)
);

-- Índices para performance
CREATE INDEX idx_project_modules_projeto ON public.project_modules(projeto_id);
CREATE INDEX idx_project_modules_workspace ON public.project_modules(workspace_id);
CREATE INDEX idx_project_modules_status ON public.project_modules(status);

-- Enable RLS
ALTER TABLE public.project_modules ENABLE ROW LEVEL SECURITY;

-- Políticas de acesso
CREATE POLICY "project_modules_select" ON public.project_modules
FOR SELECT TO authenticated
USING (
  workspace_id = get_current_workspace()
);

CREATE POLICY "project_modules_insert" ON public.project_modules
FOR INSERT TO authenticated
WITH CHECK (
  workspace_id = get_current_workspace()
  AND has_permission(auth.uid(), 'projetos.edit'::text, workspace_id)
);

CREATE POLICY "project_modules_update" ON public.project_modules
FOR UPDATE TO authenticated
USING (
  workspace_id = get_current_workspace()
  AND has_permission(auth.uid(), 'projetos.edit'::text, workspace_id)
);

CREATE POLICY "project_modules_delete" ON public.project_modules
FOR DELETE TO authenticated
USING (
  workspace_id = get_current_workspace()
  AND has_permission(auth.uid(), 'projetos.edit'::text, workspace_id)
);

-- 3. Função para verificar se um módulo tem dados associados
CREATE OR REPLACE FUNCTION public.check_module_has_data(
  p_projeto_id UUID,
  p_module_id TEXT
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  has_data BOOLEAN := false;
BEGIN
  CASE p_module_id
    WHEN 'surebet' THEN
      SELECT EXISTS(
        SELECT 1 FROM apostas_unificada 
        WHERE projeto_id = p_projeto_id 
        AND estrategia = 'SUREBET'
        LIMIT 1
      ) INTO has_data;
      
    WHEN 'valuebet' THEN
      SELECT EXISTS(
        SELECT 1 FROM apostas_unificada 
        WHERE projeto_id = p_projeto_id 
        AND estrategia = 'VALUEBET'
        LIMIT 1
      ) INTO has_data;
      
    WHEN 'duplogreen' THEN
      SELECT EXISTS(
        SELECT 1 FROM apostas_unificada 
        WHERE projeto_id = p_projeto_id 
        AND estrategia = 'DUPLO_GREEN'
        LIMIT 1
      ) INTO has_data;
      
    WHEN 'freebets' THEN
      SELECT EXISTS(
        SELECT 1 FROM apostas_unificada 
        WHERE projeto_id = p_projeto_id 
        AND (tipo_freebet IS NOT NULL OR is_bonus_bet = true)
        LIMIT 1
      ) INTO has_data;
      
    WHEN 'bonus' THEN
      SELECT EXISTS(
        SELECT 1 FROM project_bookmaker_link_bonuses b
        INNER JOIN bookmakers bm ON bm.id = b.bookmaker_id
        WHERE bm.projeto_id = p_projeto_id
        LIMIT 1
      ) INTO has_data;
      
    ELSE
      has_data := false;
  END CASE;
  
  RETURN has_data;
END;
$$;

-- 4. Função para obter módulos ativos de um projeto
CREATE OR REPLACE FUNCTION public.get_project_active_modules(p_projeto_id UUID)
RETURNS TABLE (
  module_id TEXT,
  name TEXT,
  description TEXT,
  icon TEXT,
  display_order INTEGER,
  activated_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    pm.module_id,
    c.name,
    c.description,
    c.icon,
    COALESCE(pm.display_order, c.default_order) as display_order,
    pm.activated_at
  FROM project_modules pm
  INNER JOIN project_modules_catalog c ON c.id = pm.module_id
  WHERE pm.projeto_id = p_projeto_id
  AND pm.status = 'active'
  ORDER BY COALESCE(pm.display_order, c.default_order);
END;
$$;