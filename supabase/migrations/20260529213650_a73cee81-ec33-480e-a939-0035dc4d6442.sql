
-- Granular reset: lets owner choose which modules to wipe.
-- Reuses the same retry-pass strategy as reset_workspace_data, but filters
-- the table list by the selected modules.
DROP FUNCTION IF EXISTS public.reset_workspace_data_partial(uuid, text, text[]);

CREATE OR REPLACE FUNCTION public.reset_workspace_data_partial(
  _workspace_id uuid,
  _confirm_name text,
  _modules text[]
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
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
  _tables text[] := ARRAY[]::text[];
  _has_parceiros boolean := 'parceiros' = ANY(_modules);
  _per_module jsonb := '{}'::jsonb;
BEGIN
  IF _caller IS NULL THEN
    RAISE EXCEPTION 'Não autenticado' USING ERRCODE = '42501';
  END IF;

  IF _modules IS NULL OR array_length(_modules, 1) IS NULL THEN
    RAISE EXCEPTION 'Selecione ao menos um módulo' USING ERRCODE = '22023';
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

  -- Build table list from selected modules
  IF 'apostas' = ANY(_modules) THEN
    _tables := _tables || ARRAY['aposta_edit_audit_logs','bookmaker_stake_reservations','apostas_unificada'];
  END IF;
  IF 'financeiro' = ANY(_modules) THEN
    _tables := _tables || ARRAY['cash_ledger','financial_events','transacoes_bookmakers',
      'exchange_adjustments','capital_snapshots','despesas_administrativas'];
  END IF;
  IF 'projetos' = ANY(_modules) THEN
    _tables := _tables || ARRAY['project_bookmaker_link_bonuses','projeto_bookmaker_historico',
      'projeto_ciclos','projeto_conciliacoes','projeto_investidores','projeto_perdas',
      'projeto_shared_links','project_modules','participacao_ciclos','investidor_deals',
      'investidores','operador_projetos','operadores','pagamentos_operador',
      'pagamentos_propostos','projetos'];
  END IF;
  IF 'bookmakers' = ANY(_modules) THEN
    _tables := _tables || ARRAY['bookmaker_balance_audit','bookmaker_unlinked_acks',
      'bookmaker_workspace_access','bookmaker_grupo_membros','bookmaker_grupo_regras',
      'bookmaker_grupos','bookmaker_indisponiveis','cashback_manual','freebets_recebidas',
      'giros_gratis_disponiveis','giros_gratis','limitation_events','bookmakers','bancos'];
  END IF;
  IF 'planejamento' = ANY(_modules) THEN
    _tables := _tables || ARRAY['distribuicao_plano_celulas','distribuicao_plano_grupos',
      'distribuicao_planos','planejamento_cenarios','planning_campanhas','planning_casas',
      'planning_extras','planning_ips','planning_perfis','planning_wallets'];
  END IF;
  IF 'comunidade' = ANY(_modules) THEN
    _tables := _tables || ARRAY['community_chat_messages','community_moderation_logs',
      'moderation_logs','user_influence_events','user_influence_daily','user_influence_ranking',
      'ocorrencias_observadores','ocorrencias_eventos','ocorrencias_sla_config','ocorrencias','solicitacoes'];
  END IF;
  IF 'parceiros' = ANY(_modules) THEN
    _tables := _tables || ARRAY['fornecedores','supplier_profiles','parceiro_lucro_alertas',
      'parcerias','movimentacoes_indicacao','indicador_acordos','indicadores_referral',
      'indicacoes','promocao_participantes','promocoes_indicacao','entregas','parceiros'];
  END IF;
  IF 'anotacoes' = ANY(_modules) THEN
    _tables := _tables || ARRAY['anotacoes_livres','fluxo_cards_historico','fluxo_cards','fluxo_colunas'];
  END IF;

  IF array_length(_tables, 1) IS NULL THEN
    RAISE EXCEPTION 'Nenhum módulo válido selecionado' USING ERRCODE = '22023';
  END IF;

  -- Pre-step: parceiros FK cleanup (only relevant if parceiros are being deleted)
  IF _has_parceiros THEN
    ALTER TABLE public.parceiros DISABLE TRIGGER tr_protect_caixa_operacional;

    DELETE FROM public.movimentacoes_indicacao
    WHERE parceiro_id IN (SELECT id FROM public.parceiros WHERE workspace_id = _workspace_id)
       OR origem_parceiro_id IN (SELECT id FROM public.parceiros WHERE workspace_id = _workspace_id);

    DELETE FROM public.projeto_bookmaker_historico
    WHERE parceiro_id IN (SELECT id FROM public.parceiros WHERE workspace_id = _workspace_id);

    UPDATE public.despesas_administrativas
    SET origem_parceiro_id = NULL
    WHERE origem_parceiro_id IN (SELECT id FROM public.parceiros WHERE workspace_id = _workspace_id);
  END IF;

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
      IF _has_parceiros THEN
        ALTER TABLE public.parceiros ENABLE TRIGGER tr_protect_caixa_operacional;
      END IF;
      RAISE EXCEPTION 'Não foi possível resolver dependências. Restantes: %. Dica: selecione módulos relacionados juntos (ex: Apostas + Financeiro).', _next;
    END IF;
    _remaining := _next;
  END LOOP;

  IF _has_parceiros THEN
    ALTER TABLE public.parceiros ENABLE TRIGGER tr_protect_caixa_operacional;
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'workspace_id', _workspace_id,
    'workspace_name', _ws.name,
    'modules', _modules,
    'rows_deleted', _deleted,
    'passes', _pass
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.reset_workspace_data_partial(uuid, text, text[]) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.reset_workspace_data_partial(uuid, text, text[]) TO authenticated, service_role;
