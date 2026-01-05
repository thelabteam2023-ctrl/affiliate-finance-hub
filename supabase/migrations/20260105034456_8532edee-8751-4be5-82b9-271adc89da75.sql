-- Corrigir referência de coluna nas funções de cleanup
-- A tabela moderation_logs usa actor_user_id, não moderator_user_id

CREATE OR REPLACE FUNCTION public.admin_cleanup_dry_run(_user_ids uuid[])
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _invoker_id uuid;
  _result jsonb;
BEGIN
  -- Verificar se o invocador é system owner
  _invoker_id := auth.uid();
  IF NOT EXISTS (SELECT 1 FROM profiles WHERE id = _invoker_id AND is_system_owner = true) THEN
    RAISE EXCEPTION 'Apenas o System Owner pode executar esta função';
  END IF;
  
  -- Não permitir que o system owner delete a si mesmo
  IF _invoker_id = ANY(_user_ids) THEN
    RAISE EXCEPTION 'Não é possível remover o próprio System Owner';
  END IF;
  
  -- Construir resultado com contagem de registros que serão afetados
  SELECT jsonb_build_object(
    'users_count', array_length(_user_ids, 1),
    'workspace_members', (SELECT COUNT(*) FROM workspace_members WHERE user_id = ANY(_user_ids)),
    'workspaces_owned', (SELECT COUNT(*) FROM workspaces WHERE owner_id = ANY(_user_ids)),
    'projetos', (SELECT COUNT(*) FROM projetos p 
                  JOIN workspaces w ON p.workspace_id = w.id 
                  WHERE w.owner_id = ANY(_user_ids)),
    'apostas_unificada', (SELECT COUNT(*) FROM apostas_unificada WHERE user_id = ANY(_user_ids)),
    'bookmakers', (SELECT COUNT(*) FROM bookmakers WHERE user_id = ANY(_user_ids)),
    'parceiros', (SELECT COUNT(*) FROM parceiros p
                   JOIN workspaces w ON p.workspace_id = w.id
                   WHERE w.owner_id = ANY(_user_ids)),
    'investidores', (SELECT COUNT(*) FROM investidores i
                      JOIN workspaces w ON i.workspace_id = w.id
                      WHERE w.owner_id = ANY(_user_ids)),
    'operadores', (SELECT COUNT(*) FROM operadores o
                    JOIN workspaces w ON o.workspace_id = w.id
                    WHERE w.owner_id = ANY(_user_ids)),
    'cash_ledger', (SELECT COUNT(*) FROM cash_ledger WHERE user_id = ANY(_user_ids)),
    'project_bookmaker_link_bonuses', (SELECT COUNT(*) FROM project_bookmaker_link_bonuses WHERE user_id = ANY(_user_ids)),
    'project_favorites', (SELECT COUNT(*) FROM project_favorites WHERE user_id = ANY(_user_ids)),
    'login_history', (SELECT COUNT(*) FROM login_history WHERE user_id = ANY(_user_ids)),
    'moderation_logs', (SELECT COUNT(*) FROM moderation_logs WHERE actor_user_id = ANY(_user_ids)),
    'user_influence_daily', (SELECT COUNT(*) FROM user_influence_daily WHERE user_id = ANY(_user_ids)),
    'user_influence_events', (SELECT COUNT(*) FROM user_influence_events WHERE user_id = ANY(_user_ids)),
    'user_influence_rankings', (SELECT COUNT(*) FROM user_influence_rankings WHERE user_id = ANY(_user_ids)),
    'workspace_invites', (SELECT COUNT(*) FROM workspace_invites wi
                           JOIN workspaces w ON wi.workspace_id = w.id
                           WHERE w.owner_id = ANY(_user_ids)),
    'workspace_subscriptions', (SELECT COUNT(*) FROM workspace_subscriptions ws
                                 JOIN workspaces w ON ws.workspace_id = w.id
                                 WHERE w.owner_id = ANY(_user_ids)),
    'billing_events', (SELECT COUNT(*) FROM billing_events be
                        JOIN workspaces w ON be.workspace_id = w.id
                        WHERE w.owner_id = ANY(_user_ids)),
    'community_topics', (SELECT COUNT(*) FROM community_topics WHERE user_id = ANY(_user_ids)),
    'community_comments', (SELECT COUNT(*) FROM community_comments WHERE user_id = ANY(_user_ids)),
    'community_evaluations', (SELECT COUNT(*) FROM community_evaluations WHERE user_id = ANY(_user_ids)),
    'community_chat_messages', (SELECT COUNT(*) FROM community_chat_messages WHERE user_id = ANY(_user_ids)),
    'community_reports', (SELECT COUNT(*) FROM community_reports WHERE reporter_user_id = ANY(_user_ids)),
    'audit_logs', (SELECT COUNT(*) FROM audit_logs WHERE actor_user_id = ANY(_user_ids)),
    'profiles', (SELECT COUNT(*) FROM profiles WHERE id = ANY(_user_ids))
  ) INTO _result;
  
  RETURN _result;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_execute_cleanup(_user_ids uuid[])
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _invoker_id uuid;
  _workspace_ids uuid[];
  _projeto_ids uuid[];
  _parceiro_ids uuid[];
  _bookmaker_ids uuid[];
  v_deleted_counts jsonb := '{}'::jsonb;
  v_count integer;
  v_total_deleted integer := 0;
BEGIN
  -- Verificar se o invocador é system owner
  _invoker_id := auth.uid();
  IF NOT EXISTS (SELECT 1 FROM profiles WHERE id = _invoker_id AND is_system_owner = true) THEN
    RAISE EXCEPTION 'Apenas o System Owner pode executar esta função';
  END IF;
  
  -- Não permitir que o system owner delete a si mesmo
  IF _invoker_id = ANY(_user_ids) THEN
    RAISE EXCEPTION 'Não é possível remover o próprio System Owner';
  END IF;

  -- Coletar IDs relacionados
  SELECT array_agg(id) INTO _workspace_ids FROM workspaces WHERE owner_id = ANY(_user_ids);
  IF _workspace_ids IS NULL THEN _workspace_ids := ARRAY[]::uuid[]; END IF;
  
  SELECT array_agg(id) INTO _projeto_ids FROM projetos WHERE workspace_id = ANY(_workspace_ids);
  IF _projeto_ids IS NULL THEN _projeto_ids := ARRAY[]::uuid[]; END IF;
  
  SELECT array_agg(id) INTO _parceiro_ids FROM parceiros WHERE workspace_id = ANY(_workspace_ids);
  IF _parceiro_ids IS NULL THEN _parceiro_ids := ARRAY[]::uuid[]; END IF;
  
  SELECT array_agg(id) INTO _bookmaker_ids FROM bookmakers WHERE workspace_id = ANY(_workspace_ids);
  IF _bookmaker_ids IS NULL THEN _bookmaker_ids := ARRAY[]::uuid[]; END IF;

  -- FASE 1: Entidades folha (sem dependências)
  DELETE FROM user_influence_events WHERE user_id = ANY(_user_ids);
  GET DIAGNOSTICS v_count = ROW_COUNT;
  v_deleted_counts := v_deleted_counts || jsonb_build_object('user_influence_events', v_count);
  v_total_deleted := v_total_deleted + v_count;

  DELETE FROM user_influence_daily WHERE user_id = ANY(_user_ids);
  GET DIAGNOSTICS v_count = ROW_COUNT;
  v_deleted_counts := v_deleted_counts || jsonb_build_object('user_influence_daily', v_count);
  v_total_deleted := v_total_deleted + v_count;

  DELETE FROM user_influence_rankings WHERE user_id = ANY(_user_ids);
  GET DIAGNOSTICS v_count = ROW_COUNT;
  v_deleted_counts := v_deleted_counts || jsonb_build_object('user_influence_rankings', v_count);
  v_total_deleted := v_total_deleted + v_count;

  DELETE FROM login_history WHERE user_id = ANY(_user_ids);
  GET DIAGNOSTICS v_count = ROW_COUNT;
  v_deleted_counts := v_deleted_counts || jsonb_build_object('login_history', v_count);
  v_total_deleted := v_total_deleted + v_count;

  DELETE FROM moderation_logs WHERE actor_user_id = ANY(_user_ids);
  GET DIAGNOSTICS v_count = ROW_COUNT;
  v_deleted_counts := v_deleted_counts || jsonb_build_object('moderation_logs', v_count);
  v_total_deleted := v_total_deleted + v_count;

  DELETE FROM project_favorites WHERE user_id = ANY(_user_ids);
  GET DIAGNOSTICS v_count = ROW_COUNT;
  v_deleted_counts := v_deleted_counts || jsonb_build_object('project_favorites', v_count);
  v_total_deleted := v_total_deleted + v_count;

  DELETE FROM community_reports WHERE reporter_user_id = ANY(_user_ids);
  GET DIAGNOSTICS v_count = ROW_COUNT;
  v_deleted_counts := v_deleted_counts || jsonb_build_object('community_reports', v_count);
  v_total_deleted := v_total_deleted + v_count;

  DELETE FROM community_comments WHERE user_id = ANY(_user_ids);
  GET DIAGNOSTICS v_count = ROW_COUNT;
  v_deleted_counts := v_deleted_counts || jsonb_build_object('community_comments', v_count);
  v_total_deleted := v_total_deleted + v_count;

  DELETE FROM community_chat_messages WHERE user_id = ANY(_user_ids);
  GET DIAGNOSTICS v_count = ROW_COUNT;
  v_deleted_counts := v_deleted_counts || jsonb_build_object('community_chat_messages', v_count);
  v_total_deleted := v_total_deleted + v_count;

  DELETE FROM community_evaluations WHERE user_id = ANY(_user_ids);
  GET DIAGNOSTICS v_count = ROW_COUNT;
  v_deleted_counts := v_deleted_counts || jsonb_build_object('community_evaluations', v_count);
  v_total_deleted := v_total_deleted + v_count;

  DELETE FROM community_topics WHERE user_id = ANY(_user_ids);
  GET DIAGNOSTICS v_count = ROW_COUNT;
  v_deleted_counts := v_deleted_counts || jsonb_build_object('community_topics', v_count);
  v_total_deleted := v_total_deleted + v_count;

  -- FASE 2: Entidades de workspace
  DELETE FROM billing_events WHERE workspace_id = ANY(_workspace_ids);
  GET DIAGNOSTICS v_count = ROW_COUNT;
  v_deleted_counts := v_deleted_counts || jsonb_build_object('billing_events', v_count);
  v_total_deleted := v_total_deleted + v_count;

  DELETE FROM workspace_subscriptions WHERE workspace_id = ANY(_workspace_ids);
  GET DIAGNOSTICS v_count = ROW_COUNT;
  v_deleted_counts := v_deleted_counts || jsonb_build_object('workspace_subscriptions', v_count);
  v_total_deleted := v_total_deleted + v_count;

  DELETE FROM workspace_invites WHERE workspace_id = ANY(_workspace_ids);
  GET DIAGNOSTICS v_count = ROW_COUNT;
  v_deleted_counts := v_deleted_counts || jsonb_build_object('workspace_invites', v_count);
  v_total_deleted := v_total_deleted + v_count;

  DELETE FROM audit_logs WHERE workspace_id = ANY(_workspace_ids);
  GET DIAGNOSTICS v_count = ROW_COUNT;
  v_deleted_counts := v_deleted_counts || jsonb_build_object('audit_logs', v_count);
  v_total_deleted := v_total_deleted + v_count;

  DELETE FROM despesas_administrativas WHERE workspace_id = ANY(_workspace_ids);
  GET DIAGNOSTICS v_count = ROW_COUNT;
  v_deleted_counts := v_deleted_counts || jsonb_build_object('despesas_administrativas', v_count);
  v_total_deleted := v_total_deleted + v_count;

  DELETE FROM cash_ledger WHERE workspace_id = ANY(_workspace_ids);
  GET DIAGNOSTICS v_count = ROW_COUNT;
  v_deleted_counts := v_deleted_counts || jsonb_build_object('cash_ledger', v_count);
  v_total_deleted := v_total_deleted + v_count;

  -- FASE 3: Entidades operacionais (dependem de projeto/parceiro/bookmaker)
  DELETE FROM apostas_unificada WHERE projeto_id = ANY(_projeto_ids);
  GET DIAGNOSTICS v_count = ROW_COUNT;
  v_deleted_counts := v_deleted_counts || jsonb_build_object('apostas_unificada', v_count);
  v_total_deleted := v_total_deleted + v_count;

  DELETE FROM project_bookmaker_link_bonuses WHERE projeto_id = ANY(_projeto_ids);
  GET DIAGNOSTICS v_count = ROW_COUNT;
  v_deleted_counts := v_deleted_counts || jsonb_build_object('project_bookmaker_link_bonuses', v_count);
  v_total_deleted := v_total_deleted + v_count;

  DELETE FROM ciclos WHERE projeto_id = ANY(_projeto_ids);
  GET DIAGNOSTICS v_count = ROW_COUNT;
  v_deleted_counts := v_deleted_counts || jsonb_build_object('ciclos', v_count);
  v_total_deleted := v_total_deleted + v_count;

  DELETE FROM perdas_operacionais WHERE projeto_id = ANY(_projeto_ids);
  GET DIAGNOSTICS v_count = ROW_COUNT;
  v_deleted_counts := v_deleted_counts || jsonb_build_object('perdas_operacionais', v_count);
  v_total_deleted := v_total_deleted + v_count;

  DELETE FROM project_bookmaker_links WHERE projeto_id = ANY(_projeto_ids);
  GET DIAGNOSTICS v_count = ROW_COUNT;
  v_deleted_counts := v_deleted_counts || jsonb_build_object('project_bookmaker_links', v_count);
  v_total_deleted := v_total_deleted + v_count;

  DELETE FROM entregas WHERE workspace_id = ANY(_workspace_ids);
  GET DIAGNOSTICS v_count = ROW_COUNT;
  v_deleted_counts := v_deleted_counts || jsonb_build_object('entregas', v_count);
  v_total_deleted := v_total_deleted + v_count;

  DELETE FROM operador_projeto WHERE workspace_id = ANY(_workspace_ids);
  GET DIAGNOSTICS v_count = ROW_COUNT;
  v_deleted_counts := v_deleted_counts || jsonb_build_object('operador_projeto', v_count);
  v_total_deleted := v_total_deleted + v_count;

  DELETE FROM projeto_investidor WHERE projeto_id = ANY(_projeto_ids);
  GET DIAGNOSTICS v_count = ROW_COUNT;
  v_deleted_counts := v_deleted_counts || jsonb_build_object('projeto_investidor', v_count);
  v_total_deleted := v_total_deleted + v_count;

  DELETE FROM bookmaker_unlinked_acks WHERE workspace_id = ANY(_workspace_ids);
  GET DIAGNOSTICS v_count = ROW_COUNT;
  v_deleted_counts := v_deleted_counts || jsonb_build_object('bookmaker_unlinked_acks', v_count);
  v_total_deleted := v_total_deleted + v_count;

  DELETE FROM wallets_crypto WHERE parceiro_id = ANY(_parceiro_ids);
  GET DIAGNOSTICS v_count = ROW_COUNT;
  v_deleted_counts := v_deleted_counts || jsonb_build_object('wallets_crypto', v_count);
  v_total_deleted := v_total_deleted + v_count;

  DELETE FROM contas_bancarias WHERE parceiro_id = ANY(_parceiro_ids);
  GET DIAGNOSTICS v_count = ROW_COUNT;
  v_deleted_counts := v_deleted_counts || jsonb_build_object('contas_bancarias', v_count);
  v_total_deleted := v_total_deleted + v_count;

  -- FASE 4: Entidades principais
  DELETE FROM bookmakers WHERE id = ANY(_bookmaker_ids);
  GET DIAGNOSTICS v_count = ROW_COUNT;
  v_deleted_counts := v_deleted_counts || jsonb_build_object('bookmakers', v_count);
  v_total_deleted := v_total_deleted + v_count;

  DELETE FROM parceiros WHERE id = ANY(_parceiro_ids);
  GET DIAGNOSTICS v_count = ROW_COUNT;
  v_deleted_counts := v_deleted_counts || jsonb_build_object('parceiros', v_count);
  v_total_deleted := v_total_deleted + v_count;

  DELETE FROM operadores WHERE workspace_id = ANY(_workspace_ids);
  GET DIAGNOSTICS v_count = ROW_COUNT;
  v_deleted_counts := v_deleted_counts || jsonb_build_object('operadores', v_count);
  v_total_deleted := v_total_deleted + v_count;

  DELETE FROM investidores WHERE workspace_id = ANY(_workspace_ids);
  GET DIAGNOSTICS v_count = ROW_COUNT;
  v_deleted_counts := v_deleted_counts || jsonb_build_object('investidores', v_count);
  v_total_deleted := v_total_deleted + v_count;

  DELETE FROM projetos WHERE id = ANY(_projeto_ids);
  GET DIAGNOSTICS v_count = ROW_COUNT;
  v_deleted_counts := v_deleted_counts || jsonb_build_object('projetos', v_count);
  v_total_deleted := v_total_deleted + v_count;

  -- FASE 5: Memberships e workspaces
  DELETE FROM workspace_members WHERE user_id = ANY(_user_ids);
  GET DIAGNOSTICS v_count = ROW_COUNT;
  v_deleted_counts := v_deleted_counts || jsonb_build_object('workspace_members', v_count);
  v_total_deleted := v_total_deleted + v_count;

  DELETE FROM workspaces WHERE id = ANY(_workspace_ids);
  GET DIAGNOSTICS v_count = ROW_COUNT;
  v_deleted_counts := v_deleted_counts || jsonb_build_object('workspaces', v_count);
  v_total_deleted := v_total_deleted + v_count;

  -- FASE 6: Anonimizar profiles (não deletar para manter integridade referencial)
  UPDATE profiles 
  SET 
    email = 'deleted_' || id::text || '@removed.local',
    full_name = 'Usuário Removido',
    avatar_url = NULL,
    phone = NULL,
    is_blocked = true,
    blocked_at = now(),
    blocked_reason = 'Conta removida via cleanup',
    auth_version = auth_version + 1
  WHERE id = ANY(_user_ids);
  GET DIAGNOSTICS v_count = ROW_COUNT;
  v_deleted_counts := v_deleted_counts || jsonb_build_object('profiles_anonymized', v_count);

  -- Registrar no audit log
  INSERT INTO audit_logs (
    actor_user_id,
    action,
    entity_type,
    entity_id,
    entity_name,
    after_data
  ) VALUES (
    _invoker_id,
    'delete',
    'system_cleanup',
    NULL,
    'Limpeza de contas de teste',
    jsonb_build_object(
      'user_ids', _user_ids,
      'deleted_counts', v_deleted_counts,
      'total_deleted', v_total_deleted
    )
  );

  RETURN jsonb_build_object(
    'success', true,
    'deleted_counts', v_deleted_counts,
    'total_deleted', v_total_deleted
  );
END;
$$;