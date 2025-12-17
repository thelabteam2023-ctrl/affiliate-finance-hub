
-- =====================================================
-- RBAC MIGRATION PART 3: RLS FIX + DATA MIGRATION
-- =====================================================

-- 1. Enable RLS on permissions and role_permissions (read-only tables)
ALTER TABLE public.permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.role_permissions ENABLE ROW LEVEL SECURITY;

-- Permissions are readable by all authenticated users
CREATE POLICY "Authenticated users can read permissions" ON public.permissions FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can read role_permissions" ON public.role_permissions FOR SELECT TO authenticated USING (true);

-- 2. Insert permissions if empty
INSERT INTO public.permissions (code, module, action, description, scope)
SELECT * FROM (VALUES
  ('parceiros.read', 'parceiros', 'read', 'Ver parceiros', 'global'),
  ('parceiros.create', 'parceiros', 'create', 'Criar parceiros', 'global'),
  ('parceiros.edit', 'parceiros', 'edit', 'Editar parceiros', 'global'),
  ('parceiros.delete', 'parceiros', 'delete', 'Deletar parceiros', 'global'),
  ('parceiros.view_financeiro', 'parceiros', 'read', 'Ver financeiro', 'global'),
  ('parceiros.link_bookmaker', 'parceiros', 'execute', 'Vincular bookmaker', 'global'),
  ('parceiros.view_credentials', 'parceiros', 'read', 'Ver credenciais', 'global'),
  ('bookmakers.catalog.read', 'bookmakers', 'read', 'Ver catálogo', 'global'),
  ('bookmakers.catalog.create', 'bookmakers', 'create', 'Criar catálogo', 'global'),
  ('bookmakers.catalog.edit', 'bookmakers', 'edit', 'Editar catálogo', 'global'),
  ('bookmakers.accounts.read', 'bookmakers', 'read', 'Ver contas', 'global'),
  ('bookmakers.accounts.read_project', 'bookmakers', 'read', 'Ver contas projeto', 'project_only'),
  ('bookmakers.transactions.create', 'bookmakers', 'create', 'Criar transações', 'global'),
  ('bookmakers.transactions.read', 'bookmakers', 'read', 'Ver histórico', 'global'),
  ('caixa.read', 'caixa', 'read', 'Ver saldos', 'global'),
  ('caixa.transactions.create', 'caixa', 'create', 'Criar transações', 'global'),
  ('caixa.transactions.confirm', 'caixa', 'execute', 'Confirmar saques', 'global'),
  ('caixa.reports.read', 'caixa', 'read', 'Ver relatórios', 'global'),
  ('financeiro.read', 'financeiro', 'read', 'Ver KPIs', 'global'),
  ('financeiro.despesas.create', 'financeiro', 'create', 'Criar despesa', 'global'),
  ('financeiro.despesas.edit', 'financeiro', 'edit', 'Editar despesa', 'global'),
  ('financeiro.despesas.delete', 'financeiro', 'delete', 'Deletar despesa', 'global'),
  ('financeiro.participacoes.read', 'financeiro', 'read', 'Ver participações', 'global'),
  ('investidores.read', 'investidores', 'read', 'Ver investidores', 'global'),
  ('investidores.create', 'investidores', 'create', 'Criar investidor', 'global'),
  ('investidores.edit', 'investidores', 'edit', 'Editar investidor', 'global'),
  ('investidores.delete', 'investidores', 'delete', 'Deletar investidor', 'global'),
  ('investidores.deals.manage', 'investidores', 'execute', 'Gerenciar deals', 'global'),
  ('investidores.participacoes.pay', 'investidores', 'execute', 'Pagar participação', 'global'),
  ('operadores.read', 'operadores', 'read', 'Ver operadores', 'global'),
  ('operadores.read_self', 'operadores', 'read', 'Ver próprio', 'self_only'),
  ('operadores.create', 'operadores', 'create', 'Criar operador', 'global'),
  ('operadores.edit', 'operadores', 'edit', 'Editar operador', 'global'),
  ('operadores.archive', 'operadores', 'execute', 'Arquivar operador', 'global'),
  ('operadores.pagamentos.read', 'operadores', 'read', 'Ver pagamentos', 'global'),
  ('operadores.pagamentos.read_self', 'operadores', 'read', 'Ver próprios pagamentos', 'self_only'),
  ('operadores.pagamentos.create', 'operadores', 'create', 'Criar pagamento', 'global'),
  ('operadores.vincular_projeto', 'operadores', 'execute', 'Vincular projeto', 'global'),
  ('projetos.read', 'projetos', 'read', 'Ver projetos', 'global'),
  ('projetos.read_vinculados', 'projetos', 'read', 'Ver vinculados', 'project_only'),
  ('projetos.create', 'projetos', 'create', 'Criar projeto', 'global'),
  ('projetos.edit', 'projetos', 'edit', 'Editar projeto', 'global'),
  ('projetos.delete', 'projetos', 'delete', 'Deletar projeto', 'global'),
  ('projetos.archive', 'projetos', 'execute', 'Arquivar projeto', 'global'),
  ('projeto.dashboard.read', 'projeto_detalhe', 'read', 'Ver dashboard', 'project_only'),
  ('projeto.apostas.read', 'projeto_detalhe', 'read', 'Ver apostas', 'project_only'),
  ('projeto.apostas.create', 'projeto_detalhe', 'create', 'Criar apostas', 'project_only'),
  ('projeto.apostas.edit', 'projeto_detalhe', 'edit', 'Editar apostas', 'project_only'),
  ('projeto.apostas.cancel', 'projeto_detalhe', 'execute', 'Cancelar apostas', 'project_only'),
  ('projeto.ciclos.read', 'projeto_detalhe', 'read', 'Ver ciclos', 'project_only'),
  ('projeto.ciclos.create', 'projeto_detalhe', 'create', 'Criar ciclos', 'project_only'),
  ('projeto.ciclos.close', 'projeto_detalhe', 'execute', 'Fechar ciclos', 'project_only'),
  ('projeto.perdas.read', 'projeto_detalhe', 'read', 'Ver perdas', 'project_only'),
  ('projeto.perdas.create', 'projeto_detalhe', 'create', 'Registrar perdas', 'project_only'),
  ('projeto.perdas.confirm', 'projeto_detalhe', 'execute', 'Confirmar perdas', 'project_only'),
  ('projeto.vinculos.read', 'projeto_detalhe', 'read', 'Ver vínculos', 'project_only'),
  ('projeto.vinculos.manage', 'projeto_detalhe', 'execute', 'Gerenciar vínculos', 'project_only'),
  ('captacao.read', 'captacao', 'read', 'Ver captação', 'global'),
  ('captacao.indicadores.create', 'captacao', 'create', 'Criar indicadores', 'global'),
  ('captacao.indicadores.edit', 'captacao', 'edit', 'Editar indicadores', 'global'),
  ('captacao.parcerias.create', 'captacao', 'create', 'Criar parcerias', 'global'),
  ('captacao.parcerias.edit', 'captacao', 'edit', 'Editar parcerias', 'global'),
  ('captacao.fornecedores.manage', 'captacao', 'execute', 'Gerenciar fornecedores', 'global'),
  ('captacao.promocoes.manage', 'captacao', 'execute', 'Gerenciar promoções', 'global'),
  ('captacao.pagamentos.create', 'captacao', 'create', 'Pagamentos', 'global')
) AS v(code, module, action, description, scope)
WHERE NOT EXISTS (SELECT 1 FROM public.permissions LIMIT 1)
ON CONFLICT (code) DO NOTHING;

-- 3. Insert role permissions for admin (all except self-only)
INSERT INTO public.role_permissions (role, permission_code)
SELECT 'admin'::public.app_role, code FROM public.permissions 
WHERE code NOT IN ('operadores.read_self', 'operadores.pagamentos.read_self')
ON CONFLICT (role, permission_code) DO NOTHING;

-- 4. Insert role permissions for finance
INSERT INTO public.role_permissions (role, permission_code) VALUES
  ('finance', 'parceiros.read'),
  ('finance', 'parceiros.view_financeiro'),
  ('finance', 'bookmakers.catalog.read'),
  ('finance', 'bookmakers.accounts.read'),
  ('finance', 'bookmakers.transactions.create'),
  ('finance', 'bookmakers.transactions.read'),
  ('finance', 'caixa.read'),
  ('finance', 'caixa.transactions.create'),
  ('finance', 'caixa.transactions.confirm'),
  ('finance', 'caixa.reports.read'),
  ('finance', 'financeiro.read'),
  ('finance', 'financeiro.despesas.create'),
  ('finance', 'financeiro.despesas.edit'),
  ('finance', 'financeiro.participacoes.read'),
  ('finance', 'investidores.read'),
  ('finance', 'investidores.deals.manage'),
  ('finance', 'investidores.participacoes.pay'),
  ('finance', 'operadores.read'),
  ('finance', 'operadores.pagamentos.read'),
  ('finance', 'operadores.pagamentos.create'),
  ('finance', 'projetos.read'),
  ('finance', 'projeto.dashboard.read'),
  ('finance', 'projeto.ciclos.read'),
  ('finance', 'projeto.ciclos.close'),
  ('finance', 'projeto.perdas.read'),
  ('finance', 'projeto.perdas.confirm'),
  ('finance', 'captacao.read'),
  ('finance', 'captacao.pagamentos.create')
ON CONFLICT (role, permission_code) DO NOTHING;

-- 5. Insert role permissions for operator
INSERT INTO public.role_permissions (role, permission_code) VALUES
  ('operator', 'projetos.read_vinculados'),
  ('operator', 'projeto.dashboard.read'),
  ('operator', 'projeto.apostas.read'),
  ('operator', 'projeto.apostas.create'),
  ('operator', 'projeto.apostas.edit'),
  ('operator', 'projeto.apostas.cancel'),
  ('operator', 'projeto.ciclos.read'),
  ('operator', 'projeto.perdas.read'),
  ('operator', 'projeto.perdas.create'),
  ('operator', 'projeto.vinculos.read'),
  ('operator', 'bookmakers.accounts.read_project'),
  ('operator', 'operadores.read_self'),
  ('operator', 'operadores.pagamentos.read_self')
ON CONFLICT (role, permission_code) DO NOTHING;

-- 6. Insert role permissions for viewer
INSERT INTO public.role_permissions (role, permission_code) VALUES
  ('viewer', 'parceiros.read'),
  ('viewer', 'parceiros.view_financeiro'),
  ('viewer', 'bookmakers.catalog.read'),
  ('viewer', 'bookmakers.accounts.read'),
  ('viewer', 'bookmakers.transactions.read'),
  ('viewer', 'caixa.read'),
  ('viewer', 'caixa.reports.read'),
  ('viewer', 'financeiro.read'),
  ('viewer', 'financeiro.participacoes.read'),
  ('viewer', 'investidores.read'),
  ('viewer', 'operadores.read'),
  ('viewer', 'operadores.pagamentos.read'),
  ('viewer', 'projetos.read'),
  ('viewer', 'projeto.dashboard.read'),
  ('viewer', 'projeto.apostas.read'),
  ('viewer', 'projeto.ciclos.read'),
  ('viewer', 'projeto.perdas.read'),
  ('viewer', 'projeto.vinculos.read'),
  ('viewer', 'captacao.read')
ON CONFLICT (role, permission_code) DO NOTHING;

-- 7. DATA MIGRATION: Create workspaces for existing users
DO $$
DECLARE
  r RECORD;
  v_workspace_id UUID;
BEGIN
  FOR r IN SELECT DISTINCT id, email, full_name FROM public.profiles 
           WHERE id NOT IN (SELECT user_id FROM public.workspace_members) LOOP
    INSERT INTO public.workspaces (name, slug)
    VALUES (
      COALESCE(r.full_name, r.email, 'Workspace'),
      'ws-' || REPLACE(r.id::TEXT, '-', '')
    )
    RETURNING id INTO v_workspace_id;
    
    INSERT INTO public.workspace_members (workspace_id, user_id, role)
    VALUES (v_workspace_id, r.id, 'owner');
    
    UPDATE public.projetos SET workspace_id = v_workspace_id WHERE user_id = r.id AND workspace_id IS NULL;
    UPDATE public.parceiros SET workspace_id = v_workspace_id WHERE user_id = r.id AND workspace_id IS NULL;
    UPDATE public.bookmakers SET workspace_id = v_workspace_id WHERE user_id = r.id AND workspace_id IS NULL;
    UPDATE public.investidores SET workspace_id = v_workspace_id WHERE user_id = r.id AND workspace_id IS NULL;
    UPDATE public.operadores SET workspace_id = v_workspace_id WHERE user_id = r.id AND workspace_id IS NULL;
    UPDATE public.cash_ledger SET workspace_id = v_workspace_id WHERE user_id = r.id AND workspace_id IS NULL;
    UPDATE public.despesas_administrativas SET workspace_id = v_workspace_id WHERE user_id = r.id AND workspace_id IS NULL;
    UPDATE public.indicadores_referral SET workspace_id = v_workspace_id WHERE user_id = r.id AND workspace_id IS NULL;
    UPDATE public.fornecedores SET workspace_id = v_workspace_id WHERE user_id = r.id AND workspace_id IS NULL;
    UPDATE public.parcerias SET workspace_id = v_workspace_id WHERE user_id = r.id AND workspace_id IS NULL;
  END LOOP;
END $$;

-- 8. Set first_operation_at for projects with operations
UPDATE public.projetos p
SET first_operation_at = (
  SELECT MIN(created_at) FROM (
    SELECT created_at FROM public.apostas WHERE projeto_id = p.id
    UNION ALL SELECT created_at FROM public.apostas_multiplas WHERE projeto_id = p.id
    UNION ALL SELECT created_at FROM public.surebets WHERE projeto_id = p.id
    UNION ALL SELECT created_at FROM public.matched_betting_rounds WHERE projeto_id = p.id
  ) ops
)
WHERE first_operation_at IS NULL;

-- 9. Set visibility for bookmaker catalog
UPDATE public.bookmakers_catalogo SET visibility = 'GLOBAL_REGULATED' WHERE visibility IS NULL AND is_system = true;
UPDATE public.bookmakers_catalogo SET visibility = 'WORKSPACE_PRIVATE' WHERE visibility IS NULL AND is_system = false;
