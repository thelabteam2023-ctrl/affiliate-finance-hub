-- Function to reset all community data with dry-run support
CREATE OR REPLACE FUNCTION public.admin_reset_community(
  _confirmation_phrase TEXT DEFAULT NULL,
  _dry_run BOOLEAN DEFAULT TRUE
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_counts jsonb;
  v_deleted_counts jsonb := '{}'::jsonb;
  v_count integer;
  v_total_deleted integer := 0;
BEGIN
  -- Verificar se caller é system owner
  IF NOT is_system_owner(auth.uid()) THEN
    RAISE EXCEPTION 'Access denied: System owner only';
  END IF;

  -- Contar registros que serão afetados
  SELECT jsonb_build_object(
    'community_chat_messages', (SELECT COUNT(*) FROM community_chat_messages),
    'community_reports', (SELECT COUNT(*) FROM community_reports),
    'community_comments', (SELECT COUNT(*) FROM community_comments),
    'community_topics', (SELECT COUNT(*) FROM community_topics),
    'community_evaluations', (SELECT COUNT(*) FROM community_evaluations)
  ) INTO v_counts;

  -- Se dry_run, retornar apenas contagens
  IF _dry_run THEN
    RETURN jsonb_build_object(
      'success', true,
      'dry_run', true,
      'message', 'Simulação - nenhum dado foi removido',
      'record_counts', v_counts,
      'total_records', (
        (v_counts->>'community_chat_messages')::integer +
        (v_counts->>'community_reports')::integer +
        (v_counts->>'community_comments')::integer +
        (v_counts->>'community_topics')::integer +
        (v_counts->>'community_evaluations')::integer
      )
    );
  END IF;

  -- Verificar frase de confirmação para execução real
  IF _confirmation_phrase != 'RESETAR COMUNIDADE' THEN
    RAISE EXCEPTION 'Confirmation phrase does not match. Expected: RESETAR COMUNIDADE';
  END IF;

  -- Registrar início do reset no audit_logs
  INSERT INTO audit_logs (workspace_id, actor_user_id, action, entity_type, entity_name, metadata)
  VALUES (
    get_user_workspace(auth.uid()),
    auth.uid(),
    'DELETE',
    'community_reset',
    'Reset do módulo Comunidade',
    jsonb_build_object('phase', 'started', 'expected_counts', v_counts)
  );

  -- FASE 1: Entidades folha (dependem de outras via FK)
  
  -- community_reports (depende de topics, comments, evaluations)
  DELETE FROM community_reports;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  v_deleted_counts := v_deleted_counts || jsonb_build_object('community_reports', v_count);
  v_total_deleted := v_total_deleted + v_count;

  -- community_chat_messages (independente)
  DELETE FROM community_chat_messages;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  v_deleted_counts := v_deleted_counts || jsonb_build_object('community_chat_messages', v_count);
  v_total_deleted := v_total_deleted + v_count;

  -- FASE 2: Entidades com FK
  
  -- community_comments (depende de topics)
  DELETE FROM community_comments;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  v_deleted_counts := v_deleted_counts || jsonb_build_object('community_comments', v_count);
  v_total_deleted := v_total_deleted + v_count;

  -- FASE 3: Entidades principais
  
  -- community_topics
  DELETE FROM community_topics;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  v_deleted_counts := v_deleted_counts || jsonb_build_object('community_topics', v_count);
  v_total_deleted := v_total_deleted + v_count;

  -- community_evaluations
  DELETE FROM community_evaluations;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  v_deleted_counts := v_deleted_counts || jsonb_build_object('community_evaluations', v_count);
  v_total_deleted := v_total_deleted + v_count;

  -- Registrar conclusão no audit_logs
  INSERT INTO audit_logs (workspace_id, actor_user_id, action, entity_type, entity_name, metadata)
  VALUES (
    get_user_workspace(auth.uid()),
    auth.uid(),
    'DELETE',
    'community_reset',
    'Reset do módulo Comunidade - Concluído',
    jsonb_build_object('phase', 'completed', 'deleted_counts', v_deleted_counts, 'total_deleted', v_total_deleted)
  );

  RETURN jsonb_build_object(
    'success', true,
    'dry_run', false,
    'message', 'Reset do módulo Comunidade concluído com sucesso',
    'deleted_counts', v_deleted_counts,
    'total_deleted', v_total_deleted
  );
END;
$function$;