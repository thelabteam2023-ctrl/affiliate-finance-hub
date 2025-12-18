-- =====================================================
-- FASE 1: FUNÇÃO PARA OBTER WORKSPACE DO USUÁRIO ATUAL
-- =====================================================

-- Função que retorna o workspace_id do usuário autenticado
CREATE OR REPLACE FUNCTION public.get_current_workspace()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT workspace_id 
  FROM workspace_members 
  WHERE user_id = auth.uid() 
    AND is_active = true 
  ORDER BY joined_at DESC
  LIMIT 1
$$;

-- Função auxiliar para verificar se usuário pertence ao workspace
CREATE OR REPLACE FUNCTION public.user_belongs_to_workspace(_workspace_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 
    FROM workspace_members 
    WHERE user_id = auth.uid() 
      AND workspace_id = _workspace_id
      AND is_active = true
  )
$$;

-- =====================================================
-- FASE 2: CORRIGIR REGISTROS COM workspace_id NULL
-- =====================================================

-- Atualizar projetos com workspace_id NULL
UPDATE public.projetos p
SET workspace_id = (
  SELECT wm.workspace_id 
  FROM workspace_members wm 
  WHERE wm.user_id = p.user_id 
    AND wm.is_active = true 
  ORDER BY wm.joined_at DESC
  LIMIT 1
)
WHERE p.workspace_id IS NULL;

-- Atualizar parceiros com workspace_id NULL
UPDATE public.parceiros pa
SET workspace_id = (
  SELECT wm.workspace_id 
  FROM workspace_members wm 
  WHERE wm.user_id = pa.user_id 
    AND wm.is_active = true 
  ORDER BY wm.joined_at DESC
  LIMIT 1
)
WHERE pa.workspace_id IS NULL;

-- Atualizar parcerias com workspace_id NULL
UPDATE public.parcerias pr
SET workspace_id = (
  SELECT wm.workspace_id 
  FROM workspace_members wm 
  WHERE wm.user_id = pr.user_id 
    AND wm.is_active = true 
  ORDER BY wm.joined_at DESC
  LIMIT 1
)
WHERE pr.workspace_id IS NULL;

-- Atualizar cash_ledger com workspace_id NULL
UPDATE public.cash_ledger cl
SET workspace_id = (
  SELECT wm.workspace_id 
  FROM workspace_members wm 
  WHERE wm.user_id = cl.user_id 
    AND wm.is_active = true 
  ORDER BY wm.joined_at DESC
  LIMIT 1
)
WHERE cl.workspace_id IS NULL;

-- Atualizar bookmakers com workspace_id NULL
UPDATE public.bookmakers b
SET workspace_id = (
  SELECT wm.workspace_id 
  FROM workspace_members wm 
  WHERE wm.user_id = b.user_id 
    AND wm.is_active = true 
  ORDER BY wm.joined_at DESC
  LIMIT 1
)
WHERE b.workspace_id IS NULL;

-- Atualizar despesas_administrativas com workspace_id NULL
UPDATE public.despesas_administrativas da
SET workspace_id = (
  SELECT wm.workspace_id 
  FROM workspace_members wm 
  WHERE wm.user_id = da.user_id 
    AND wm.is_active = true 
  ORDER BY wm.joined_at DESC
  LIMIT 1
)
WHERE da.workspace_id IS NULL;

-- Atualizar fornecedores com workspace_id NULL
UPDATE public.fornecedores f
SET workspace_id = (
  SELECT wm.workspace_id 
  FROM workspace_members wm 
  WHERE wm.user_id = f.user_id 
    AND wm.is_active = true 
  ORDER BY wm.joined_at DESC
  LIMIT 1
)
WHERE f.workspace_id IS NULL;

-- Atualizar indicadores_referral com workspace_id NULL
UPDATE public.indicadores_referral ir
SET workspace_id = (
  SELECT wm.workspace_id 
  FROM workspace_members wm 
  WHERE wm.user_id = ir.user_id 
    AND wm.is_active = true 
  ORDER BY wm.joined_at DESC
  LIMIT 1
)
WHERE ir.workspace_id IS NULL;

-- =====================================================
-- FASE 3: ATUALIZAR RLS POLICIES - PROJETOS
-- =====================================================

DROP POLICY IF EXISTS "Users can view own projetos" ON public.projetos;
DROP POLICY IF EXISTS "Users can insert own projetos" ON public.projetos;
DROP POLICY IF EXISTS "Users can update own projetos" ON public.projetos;
DROP POLICY IF EXISTS "Users can delete own projetos" ON public.projetos;
DROP POLICY IF EXISTS "Workspace isolation projetos" ON public.projetos;

CREATE POLICY "Workspace isolation projetos SELECT"
ON public.projetos FOR SELECT
USING (
  workspace_id = get_current_workspace()
  OR (workspace_id IS NULL AND user_id = auth.uid())
);

CREATE POLICY "Workspace isolation projetos INSERT"
ON public.projetos FOR INSERT
WITH CHECK (
  workspace_id = get_current_workspace()
  AND user_id = auth.uid()
);

CREATE POLICY "Workspace isolation projetos UPDATE"
ON public.projetos FOR UPDATE
USING (
  workspace_id = get_current_workspace()
  OR (workspace_id IS NULL AND user_id = auth.uid())
);

CREATE POLICY "Workspace isolation projetos DELETE"
ON public.projetos FOR DELETE
USING (
  workspace_id = get_current_workspace()
  OR (workspace_id IS NULL AND user_id = auth.uid())
);

-- =====================================================
-- FASE 4: ATUALIZAR RLS POLICIES - BOOKMAKERS
-- =====================================================

DROP POLICY IF EXISTS "Users can view own bookmakers" ON public.bookmakers;
DROP POLICY IF EXISTS "Users can insert own bookmakers" ON public.bookmakers;
DROP POLICY IF EXISTS "Users can update own bookmakers" ON public.bookmakers;
DROP POLICY IF EXISTS "Users can delete own bookmakers" ON public.bookmakers;

CREATE POLICY "Workspace isolation bookmakers SELECT"
ON public.bookmakers FOR SELECT
USING (
  workspace_id = get_current_workspace()
  OR (workspace_id IS NULL AND user_id = auth.uid())
);

CREATE POLICY "Workspace isolation bookmakers INSERT"
ON public.bookmakers FOR INSERT
WITH CHECK (
  workspace_id = get_current_workspace()
  AND user_id = auth.uid()
);

CREATE POLICY "Workspace isolation bookmakers UPDATE"
ON public.bookmakers FOR UPDATE
USING (
  workspace_id = get_current_workspace()
  OR (workspace_id IS NULL AND user_id = auth.uid())
);

CREATE POLICY "Workspace isolation bookmakers DELETE"
ON public.bookmakers FOR DELETE
USING (
  workspace_id = get_current_workspace()
  OR (workspace_id IS NULL AND user_id = auth.uid())
);

-- =====================================================
-- FASE 5: ATUALIZAR RLS POLICIES - PARCEIROS
-- =====================================================

DROP POLICY IF EXISTS "Users can view own partners" ON public.parceiros;
DROP POLICY IF EXISTS "Users can insert own partners" ON public.parceiros;
DROP POLICY IF EXISTS "Users can update own partners" ON public.parceiros;
DROP POLICY IF EXISTS "Users can delete own partners" ON public.parceiros;

CREATE POLICY "Workspace isolation parceiros SELECT"
ON public.parceiros FOR SELECT
USING (
  workspace_id = get_current_workspace()
  OR (workspace_id IS NULL AND user_id = auth.uid())
);

CREATE POLICY "Workspace isolation parceiros INSERT"
ON public.parceiros FOR INSERT
WITH CHECK (
  workspace_id = get_current_workspace()
  AND user_id = auth.uid()
);

CREATE POLICY "Workspace isolation parceiros UPDATE"
ON public.parceiros FOR UPDATE
USING (
  workspace_id = get_current_workspace()
  OR (workspace_id IS NULL AND user_id = auth.uid())
);

CREATE POLICY "Workspace isolation parceiros DELETE"
ON public.parceiros FOR DELETE
USING (
  workspace_id = get_current_workspace()
  OR (workspace_id IS NULL AND user_id = auth.uid())
);

-- =====================================================
-- FASE 6: ATUALIZAR RLS POLICIES - PARCERIAS
-- =====================================================

DROP POLICY IF EXISTS "Users can view own parcerias" ON public.parcerias;
DROP POLICY IF EXISTS "Users can insert own parcerias" ON public.parcerias;
DROP POLICY IF EXISTS "Users can update own parcerias" ON public.parcerias;
DROP POLICY IF EXISTS "Users can delete own parcerias" ON public.parcerias;

CREATE POLICY "Workspace isolation parcerias SELECT"
ON public.parcerias FOR SELECT
USING (
  workspace_id = get_current_workspace()
  OR (workspace_id IS NULL AND user_id = auth.uid())
);

CREATE POLICY "Workspace isolation parcerias INSERT"
ON public.parcerias FOR INSERT
WITH CHECK (
  workspace_id = get_current_workspace()
  AND user_id = auth.uid()
);

CREATE POLICY "Workspace isolation parcerias UPDATE"
ON public.parcerias FOR UPDATE
USING (
  workspace_id = get_current_workspace()
  OR (workspace_id IS NULL AND user_id = auth.uid())
);

CREATE POLICY "Workspace isolation parcerias DELETE"
ON public.parcerias FOR DELETE
USING (
  workspace_id = get_current_workspace()
  OR (workspace_id IS NULL AND user_id = auth.uid())
);

-- =====================================================
-- FASE 7: ATUALIZAR RLS POLICIES - CASH_LEDGER
-- =====================================================

DROP POLICY IF EXISTS "Users can view own cash_ledger" ON public.cash_ledger;
DROP POLICY IF EXISTS "Users can insert own cash_ledger" ON public.cash_ledger;
DROP POLICY IF EXISTS "Users can update own cash_ledger" ON public.cash_ledger;
DROP POLICY IF EXISTS "Users can delete own cash_ledger" ON public.cash_ledger;

CREATE POLICY "Workspace isolation cash_ledger SELECT"
ON public.cash_ledger FOR SELECT
USING (
  workspace_id = get_current_workspace()
  OR (workspace_id IS NULL AND user_id = auth.uid())
);

CREATE POLICY "Workspace isolation cash_ledger INSERT"
ON public.cash_ledger FOR INSERT
WITH CHECK (
  workspace_id = get_current_workspace()
  AND user_id = auth.uid()
);

CREATE POLICY "Workspace isolation cash_ledger UPDATE"
ON public.cash_ledger FOR UPDATE
USING (
  workspace_id = get_current_workspace()
  OR (workspace_id IS NULL AND user_id = auth.uid())
);

CREATE POLICY "Workspace isolation cash_ledger DELETE"
ON public.cash_ledger FOR DELETE
USING (
  workspace_id = get_current_workspace()
  OR (workspace_id IS NULL AND user_id = auth.uid())
);

-- =====================================================
-- FASE 8: ATUALIZAR RLS POLICIES - DESPESAS_ADMINISTRATIVAS
-- =====================================================

DROP POLICY IF EXISTS "Users can view own despesas_administrativas" ON public.despesas_administrativas;
DROP POLICY IF EXISTS "Users can insert own despesas_administrativas" ON public.despesas_administrativas;
DROP POLICY IF EXISTS "Users can update own despesas_administrativas" ON public.despesas_administrativas;
DROP POLICY IF EXISTS "Users can delete own despesas_administrativas" ON public.despesas_administrativas;

CREATE POLICY "Workspace isolation despesas_administrativas SELECT"
ON public.despesas_administrativas FOR SELECT
USING (
  workspace_id = get_current_workspace()
  OR (workspace_id IS NULL AND user_id = auth.uid())
);

CREATE POLICY "Workspace isolation despesas_administrativas INSERT"
ON public.despesas_administrativas FOR INSERT
WITH CHECK (
  workspace_id = get_current_workspace()
  AND user_id = auth.uid()
);

CREATE POLICY "Workspace isolation despesas_administrativas UPDATE"
ON public.despesas_administrativas FOR UPDATE
USING (
  workspace_id = get_current_workspace()
  OR (workspace_id IS NULL AND user_id = auth.uid())
);

CREATE POLICY "Workspace isolation despesas_administrativas DELETE"
ON public.despesas_administrativas FOR DELETE
USING (
  workspace_id = get_current_workspace()
  OR (workspace_id IS NULL AND user_id = auth.uid())
);

-- =====================================================
-- FASE 9: ATUALIZAR RLS POLICIES - FORNECEDORES
-- =====================================================

DROP POLICY IF EXISTS "Users can view own fornecedores" ON public.fornecedores;
DROP POLICY IF EXISTS "Users can insert own fornecedores" ON public.fornecedores;
DROP POLICY IF EXISTS "Users can update own fornecedores" ON public.fornecedores;
DROP POLICY IF EXISTS "Users can delete own fornecedores" ON public.fornecedores;

CREATE POLICY "Workspace isolation fornecedores SELECT"
ON public.fornecedores FOR SELECT
USING (
  workspace_id = get_current_workspace()
  OR (workspace_id IS NULL AND user_id = auth.uid())
);

CREATE POLICY "Workspace isolation fornecedores INSERT"
ON public.fornecedores FOR INSERT
WITH CHECK (
  workspace_id = get_current_workspace()
  AND user_id = auth.uid()
);

CREATE POLICY "Workspace isolation fornecedores UPDATE"
ON public.fornecedores FOR UPDATE
USING (
  workspace_id = get_current_workspace()
  OR (workspace_id IS NULL AND user_id = auth.uid())
);

CREATE POLICY "Workspace isolation fornecedores DELETE"
ON public.fornecedores FOR DELETE
USING (
  workspace_id = get_current_workspace()
  OR (workspace_id IS NULL AND user_id = auth.uid())
);

-- =====================================================
-- FASE 10: ATUALIZAR RLS POLICIES - INDICADORES_REFERRAL
-- =====================================================

DROP POLICY IF EXISTS "Users can view own indicadores" ON public.indicadores_referral;
DROP POLICY IF EXISTS "Users can insert own indicadores" ON public.indicadores_referral;
DROP POLICY IF EXISTS "Users can update own indicadores" ON public.indicadores_referral;
DROP POLICY IF EXISTS "Users can delete own indicadores" ON public.indicadores_referral;

CREATE POLICY "Workspace isolation indicadores_referral SELECT"
ON public.indicadores_referral FOR SELECT
USING (
  workspace_id = get_current_workspace()
  OR (workspace_id IS NULL AND user_id = auth.uid())
);

CREATE POLICY "Workspace isolation indicadores_referral INSERT"
ON public.indicadores_referral FOR INSERT
WITH CHECK (
  workspace_id = get_current_workspace()
  AND user_id = auth.uid()
);

CREATE POLICY "Workspace isolation indicadores_referral UPDATE"
ON public.indicadores_referral FOR UPDATE
USING (
  workspace_id = get_current_workspace()
  OR (workspace_id IS NULL AND user_id = auth.uid())
);

CREATE POLICY "Workspace isolation indicadores_referral DELETE"
ON public.indicadores_referral FOR DELETE
USING (
  workspace_id = get_current_workspace()
  OR (workspace_id IS NULL AND user_id = auth.uid())
);