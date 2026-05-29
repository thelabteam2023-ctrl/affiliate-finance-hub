-- 1. Tighten delete_workspace_cascade: SYSTEM OWNER ONLY
CREATE OR REPLACE FUNCTION public.delete_workspace_cascade(
  _workspace_id uuid,
  _confirm_name text
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _ws public.workspaces%ROWTYPE;
  _caller uuid := auth.uid();
  _tbl text;
  _tmp bigint;
  _deleted bigint := 0;
  _remaining text[];
  _next text[];
  _pass int := 0;
  _tables text[] := ARRAY[
    'aposta_edit_audit_logs','bookmaker_balance_audit','bookmaker_stake_reservations',
    'bookmaker_unlinked_acks','bookmaker_workspace_access','bookmaker_grupo_membros',
    'bookmaker_grupo_regras','bookmaker_grupos','bookmaker_indisponiveis',
    'apostas_unificada','cash_ledger','financial_events','transacoes_bookmakers',
    'exchange_adjustments','cashback_manual','freebets_recebidas','giros_gratis_disponiveis',
    'giros_gratis','capital_snapshots','limitation_events','billing_events','sales_events',
    'subscription_changes','workspace_subscriptions','distribuicao_plano_celulas',
    'distribuicao_plano_grupos','distribuicao_planos','planejamento_cenarios',
    'planning_campanhas','planning_casas','planning_extras','planning_ips','planning_perfis',
    'planning_wallets','project_bookmaker_link_bonuses','projeto_bookmaker_historico',
    'projeto_ciclos','projeto_conciliacoes','projeto_investidores','projeto_perdas',
    'projeto_shared_links','project_favorites','project_modules','project_user_preferences',
    'user_favorites','projetos','bookmakers','bancos','fornecedores','supplier_profiles',
    'investidor_deals','investidores','operador_projetos','operadores','pagamentos_operador',
    'pagamentos_propostos','participacao_ciclos','parceiro_lucro_alertas','parcerias',
    'parceiros','movimentacoes_indicacao','indicador_acordos','indicadores_referral',
    'indicacoes','promocao_participantes','promocoes_indicacao','entregas',
    'despesas_administrativas','ocorrencias_observadores','ocorrencias_eventos',
    'ocorrencias_sla_config','ocorrencias','solicitacoes','anotacoes_livres',
    'fluxo_cards_historico','fluxo_cards','fluxo_colunas','community_chat_messages',
    'community_moderation_logs','moderation_logs','user_influence_events',
    'user_influence_daily','user_influence_ranking','user_permission_overrides',
    'workspace_bet_sources','login_history','error_logs','audit_logs',
    'access_group_workspaces','workspace_invites','workspace_members'
  ];
BEGIN
  IF _caller IS NULL THEN
    RAISE EXCEPTION 'Não autenticado' USING ERRCODE = '42501';
  END IF;

  IF NOT public.is_system_owner(_caller) THEN
    RAISE EXCEPTION 'Apenas administradores do sistema podem excluir workspaces definitivamente' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO _ws FROM public.workspaces WHERE id = _workspace_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Workspace não encontrado' USING ERRCODE = 'P0002';
  END IF;

  IF _ws.is_active IS TRUE OR _ws.deactivated_at IS NULL THEN
    RAISE EXCEPTION 'Workspace precisa estar desativado antes da exclusão definitiva' USING ERRCODE = '22023';
  END IF;

  IF _confirm_name IS NULL OR _confirm_name <> _ws.name THEN
    RAISE EXCEPTION 'Nome de confirmação não confere' USING ERRCODE = '22023';
  END IF;

  ALTER TABLE public.parceiros DISABLE TRIGGER tr_protect_caixa_operacional;

  DELETE FROM public.movimentacoes_indicacao
  WHERE parceiro_id IN (SELECT id FROM public.parceiros WHERE workspace_id = _workspace_id)
     OR origem_parceiro_id IN (SELECT id FROM public.parceiros WHERE workspace_id = _workspace_id);

  DELETE FROM public.projeto_bookmaker_historico
  WHERE parceiro_id IN (SELECT id FROM public.parceiros WHERE workspace_id = _workspace_id);

  UPDATE public.despesas_administrativas
  SET origem_parceiro_id = NULL
  WHERE origem_parceiro_id IN (SELECT id FROM public.parceiros WHERE workspace_id = _workspace_id);

  _remaining := _tables;
  WHILE array_length(_remaining, 1) > 0 AND _pass < 15 LOOP
    _pass := _pass + 1;
    _next := ARRAY[]::text[];
    FOREACH _tbl IN ARRAY _remaining LOOP
      BEGIN
        EXECUTE format('DELETE FROM public.%I WHERE workspace_id=$1', _tbl) USING _workspace_id;
        GET DIAGNOSTICS _tmp = ROW_COUNT;
        _deleted := _deleted + _tmp;
      EXCEPTION
        WHEN undefined_table OR undefined_column THEN NULL;
        WHEN OTHERS THEN _next := array_append(_next, _tbl);
      END;
    END LOOP;
    IF array_length(_next, 1) IS NULL THEN EXIT; END IF;
    IF _next = _remaining THEN
      ALTER TABLE public.parceiros ENABLE TRIGGER tr_protect_caixa_operacional;
      RAISE EXCEPTION 'Não foi possível resolver dependências. Restantes: %', _next;
    END IF;
    _remaining := _next;
  END LOOP;

  BEGIN
    EXECUTE 'DELETE FROM public.user_roles WHERE workspace_id=$1' USING _workspace_id;
  EXCEPTION WHEN undefined_column OR undefined_table THEN NULL;
  END;

  DELETE FROM public.workspaces WHERE id = _workspace_id;

  ALTER TABLE public.parceiros ENABLE TRIGGER tr_protect_caixa_operacional;

  RETURN jsonb_build_object(
    'success', true, 'workspace_id', _workspace_id,
    'workspace_name', _ws.name, 'rows_deleted', _deleted, 'passes', _pass
  );
END;
$$;

REVOKE ALL ON FUNCTION public.delete_workspace_cascade(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.delete_workspace_cascade(uuid, text) TO authenticated;

-- 2. NEW: reset_workspace_data — owner or system_owner can wipe data but keep the workspace
CREATE OR REPLACE FUNCTION public.reset_workspace_data(
  _workspace_id uuid,
  _confirm_name text
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _ws public.workspaces%ROWTYPE;
  _caller uuid := auth.uid();
  _is_owner boolean;
  _is_system_owner boolean;
  _tbl text;
  _tmp bigint;
  _deleted bigint := 0;
  _remaining text[];
  _next text[];
  _pass int := 0;
  -- Same table list as delete, but EXCLUDES identity/access tables we want to keep:
  -- workspaces, workspace_members, workspace_invites, user_roles, access_group_workspaces,
  -- workspace_subscriptions, billing_events, sales_events, subscription_changes,
  -- workspace_bet_sources, project_user_preferences, user_favorites, project_favorites.
  _tables text[] := ARRAY[
    'aposta_edit_audit_logs','bookmaker_balance_audit','bookmaker_stake_reservations',
    'bookmaker_unlinked_acks','bookmaker_workspace_access','bookmaker_grupo_membros',
    'bookmaker_grupo_regras','bookmaker_grupos','bookmaker_indisponiveis',
    'apostas_unificada','cash_ledger','financial_events','transacoes_bookmakers',
    'exchange_adjustments','cashback_manual','freebets_recebidas','giros_gratis_disponiveis',
    'giros_gratis','capital_snapshots','limitation_events',
    'distribuicao_plano_celulas','distribuicao_plano_grupos','distribuicao_planos',
    'planejamento_cenarios','planning_campanhas','planning_casas','planning_extras',
    'planning_ips','planning_perfis','planning_wallets',
    'project_bookmaker_link_bonuses','projeto_bookmaker_historico','projeto_ciclos',
    'projeto_conciliacoes','projeto_investidores','projeto_perdas','projeto_shared_links',
    'project_modules','projetos','bookmakers','bancos','fornecedores','supplier_profiles',
    'investidor_deals','investidores','operador_projetos','operadores','pagamentos_operador',
    'pagamentos_propostos','participacao_ciclos','parceiro_lucro_alertas','parcerias',
    'parceiros','movimentacoes_indicacao','indicador_acordos','indicadores_referral',
    'indicacoes','promocao_participantes','promocoes_indicacao','entregas',
    'despesas_administrativas','ocorrencias_observadores','ocorrencias_eventos',
    'ocorrencias_sla_config','ocorrencias','solicitacoes','anotacoes_livres',
    'fluxo_cards_historico','fluxo_cards','fluxo_colunas','community_chat_messages',
    'community_moderation_logs','moderation_logs','user_influence_events',
    'user_influence_daily','user_influence_ranking','user_permission_overrides',
    'login_history','error_logs','audit_logs'
  ];
BEGIN
  IF _caller IS NULL THEN
    RAISE EXCEPTION 'Não autenticado' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO _ws FROM public.workspaces WHERE id = _workspace_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Workspace não encontrado' USING ERRCODE = 'P0002';
  END IF;

  IF _confirm_name IS NULL OR _confirm_name <> _ws.name THEN
    RAISE EXCEPTION 'Nome de confirmação não confere' USING ERRCODE = '22023';
  END IF;

  SELECT public.is_system_owner(_caller) INTO _is_system_owner;
  SELECT EXISTS(
    SELECT 1 FROM public.workspace_members
    WHERE workspace_id = _workspace_id AND user_id = _caller
      AND role = 'owner' AND is_active = true
  ) INTO _is_owner;

  IF NOT (_is_owner OR _is_system_owner) THEN
    RAISE EXCEPTION 'Apenas o owner do workspace ou administrador global pode resetar dados' USING ERRCODE = '42501';
  END IF;

  ALTER TABLE public.parceiros DISABLE TRIGGER tr_protect_caixa_operacional;

  DELETE FROM public.movimentacoes_indicacao
  WHERE parceiro_id IN (SELECT id FROM public.parceiros WHERE workspace_id = _workspace_id)
     OR origem_parceiro_id IN (SELECT id FROM public.parceiros WHERE workspace_id = _workspace_id);

  DELETE FROM public.projeto_bookmaker_historico
  WHERE parceiro_id IN (SELECT id FROM public.parceiros WHERE workspace_id = _workspace_id);

  UPDATE public.despesas_administrativas
  SET origem_parceiro_id = NULL
  WHERE origem_parceiro_id IN (SELECT id FROM public.parceiros WHERE workspace_id = _workspace_id);

  _remaining := _tables;
  WHILE array_length(_remaining, 1) > 0 AND _pass < 15 LOOP
    _pass := _pass + 1;
    _next := ARRAY[]::text[];
    FOREACH _tbl IN ARRAY _remaining LOOP
      BEGIN
        EXECUTE format('DELETE FROM public.%I WHERE workspace_id=$1', _tbl) USING _workspace_id;
        GET DIAGNOSTICS _tmp = ROW_COUNT;
        _deleted := _deleted + _tmp;
      EXCEPTION
        WHEN undefined_table OR undefined_column THEN NULL;
        WHEN OTHERS THEN _next := array_append(_next, _tbl);
      END;
    END LOOP;
    IF array_length(_next, 1) IS NULL THEN EXIT; END IF;
    IF _next = _remaining THEN
      ALTER TABLE public.parceiros ENABLE TRIGGER tr_protect_caixa_operacional;
      RAISE EXCEPTION 'Não foi possível resolver dependências. Restantes: %', _next;
    END IF;
    _remaining := _next;
  END LOOP;

  ALTER TABLE public.parceiros ENABLE TRIGGER tr_protect_caixa_operacional;

  RETURN jsonb_build_object(
    'success', true, 'workspace_id', _workspace_id,
    'workspace_name', _ws.name, 'rows_deleted', _deleted, 'passes', _pass
  );
END;
$$;

REVOKE ALL ON FUNCTION public.reset_workspace_data(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.reset_workspace_data(uuid, text) TO authenticated;