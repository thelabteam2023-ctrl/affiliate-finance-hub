-- ============================================================
-- Permanent workspace deletion (cascade)
-- ============================================================
-- Removes ALL data tied to a workspace_id across the public schema,
-- including memberships, invites, role grants, and finally the
-- workspace row itself. Owner-only, requires prior soft-delete and
-- exact-name confirmation. Irreversible.
-- ============================================================

CREATE OR REPLACE FUNCTION public.delete_workspace_cascade(
  _workspace_id uuid,
  _confirm_name text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _ws            public.workspaces%ROWTYPE;
  _caller        uuid := auth.uid();
  _is_owner      boolean;
  _tbl           text;
  _deleted_count bigint := 0;
  _tmp           bigint;
  _tables        text[] := ARRAY[
    -- ordered children-ish first; FKs are bypassed via session_replication_role
    'aposta_edit_audit_logs',
    'bookmaker_balance_audit',
    'bookmaker_stake_reservations',
    'bookmaker_unlinked_acks',
    'bookmaker_workspace_access',
    'bookmaker_grupo_membros',
    'bookmaker_grupo_regras',
    'bookmaker_grupos',
    'bookmaker_indisponiveis',
    'apostas_unificada',
    'cash_ledger',
    'financial_events',
    'transacoes_bookmakers',
    'exchange_adjustments',
    'cashback_manual',
    'freebets_recebidas',
    'giros_gratis_disponiveis',
    'giros_gratis',
    'capital_snapshots',
    'limitation_events',
    'billing_events',
    'sales_events',
    'subscription_changes',
    'workspace_subscriptions',
    'distribuicao_plano_celulas',
    'distribuicao_plano_grupos',
    'distribuicao_planos',
    'planejamento_cenarios',
    'planning_campanhas',
    'planning_casas',
    'planning_extras',
    'planning_ips',
    'planning_perfis',
    'planning_wallets',
    'project_bookmaker_link_bonuses',
    'projeto_bookmaker_historico',
    'projeto_ciclos',
    'projeto_conciliacoes',
    'projeto_investidores',
    'projeto_perdas',
    'projeto_shared_links',
    'project_favorites',
    'project_modules',
    'project_user_preferences',
    'user_favorites',
    'projetos',
    'bookmakers',
    'bancos',
    'fornecedores',
    'supplier_profiles',
    'investidor_deals',
    'investidores',
    'operador_projetos',
    'operadores',
    'pagamentos_operador',
    'pagamentos_propostos',
    'participacao_ciclos',
    'parceiro_lucro_alertas',
    'parcerias',
    'parceiros',
    'movimentacoes_indicacao',
    'indicador_acordos',
    'indicadores_referral',
    'indicacoes',
    'promocao_participantes',
    'promocoes_indicacao',
    'entregas',
    'despesas_administrativas',
    'ocorrencias_observadores',
    'ocorrencias_eventos',
    'ocorrencias_sla_config',
    'ocorrencias',
    'solicitacoes',
    'anotacoes_livres',
    'fluxo_cards_historico',
    'fluxo_cards',
    'fluxo_colunas',
    'community_chat_messages',
    'community_moderation_logs',
    'moderation_logs',
    'user_influence_events',
    'user_influence_daily',
    'user_influence_ranking',
    'user_permission_overrides',
    'workspace_bet_sources',
    'login_history',
    'error_logs',
    'audit_logs',
    'access_group_workspaces',
    'workspace_invites',
    'workspace_members'
  ];
BEGIN
  IF _caller IS NULL THEN
    RAISE EXCEPTION 'Não autenticado' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO _ws FROM public.workspaces WHERE id = _workspace_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Workspace não encontrado' USING ERRCODE = 'P0002';
  END IF;

  -- Must be soft-deleted first
  IF _ws.is_active IS TRUE OR _ws.deactivated_at IS NULL THEN
    RAISE EXCEPTION 'Workspace precisa estar desativado antes da exclusão definitiva'
      USING ERRCODE = '22023';
  END IF;

  -- Exact-name confirmation
  IF _confirm_name IS NULL OR _confirm_name <> _ws.name THEN
    RAISE EXCEPTION 'Nome de confirmação não confere'
      USING ERRCODE = '22023';
  END IF;

  -- Owner-only (check via workspace_members)
  SELECT EXISTS (
    SELECT 1 FROM public.workspace_members
    WHERE workspace_id = _workspace_id
      AND user_id = _caller
      AND role = 'owner'
      AND is_active = true
  ) INTO _is_owner;

  IF NOT _is_owner THEN
    RAISE EXCEPTION 'Apenas o owner do workspace pode excluir definitivamente'
      USING ERRCODE = '42501';
  END IF;

  -- Bypass FKs/triggers during the cascade (function owner = postgres)
  PERFORM set_config('session_replication_role', 'replica', true);

  -- Sweep every table that carries workspace_id
  FOREACH _tbl IN ARRAY _tables LOOP
    BEGIN
      EXECUTE format('DELETE FROM public.%I WHERE workspace_id = $1', _tbl)
        USING _workspace_id;
      GET DIAGNOSTICS _tmp = ROW_COUNT;
      _deleted_count := _deleted_count + _tmp;
    EXCEPTION WHEN undefined_table OR undefined_column THEN
      -- table or column not present in this environment, skip
      NULL;
    END;
  END LOOP;

  -- Clean role grants scoped to this workspace (if column exists)
  BEGIN
    EXECUTE 'DELETE FROM public.user_roles WHERE workspace_id = $1'
      USING _workspace_id;
  EXCEPTION WHEN undefined_column OR undefined_table THEN
    NULL;
  END;

  -- Finally remove the workspace row itself
  DELETE FROM public.workspaces WHERE id = _workspace_id;

  PERFORM set_config('session_replication_role', 'origin', true);

  RETURN jsonb_build_object(
    'success', true,
    'workspace_id', _workspace_id,
    'workspace_name', _ws.name,
    'rows_deleted', _deleted_count
  );
END;
$$;

REVOKE ALL ON FUNCTION public.delete_workspace_cascade(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.delete_workspace_cascade(uuid, text) TO authenticated;