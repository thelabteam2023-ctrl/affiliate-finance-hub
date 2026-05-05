-- 1. Atualizar criar_aposta_atomica (versão JSONB)
CREATE OR REPLACE FUNCTION public.criar_aposta_atomica(p_aposta_data jsonb, p_pernas_data jsonb DEFAULT NULL::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_user_id UUID;
  v_projeto_id UUID;
  v_workspace_id UUID;
  v_aposta_id UUID;
  v_perna JSONB;
  v_bookmaker_id UUID;
  v_stake NUMERIC;
  v_stake_freebet NUMERIC;
  v_stake_real NUMERIC;
  v_saldo_atual NUMERIC;
  v_perna_ordem INT := 1;
  v_total_stake NUMERIC := 0;
  v_moeda TEXT;
  v_bookmaker_nome TEXT;
  v_is_freebet BOOLEAN;
BEGIN
  v_user_id := (p_aposta_data->>'user_id')::UUID;
  v_projeto_id := (p_aposta_data->>'projeto_id')::UUID;
  v_workspace_id := (p_aposta_data->>'workspace_id')::UUID;

  -- Validar projeto ativo
  IF NOT EXISTS (
    SELECT 1 FROM public.projetos 
    WHERE id = v_projeto_id 
    AND UPPER(status) IN ('EM_ANDAMENTO', 'PLANEJADO')
  ) THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'PROJETO_INATIVO',
      'message', 'Projeto não está em andamento ou planejado'
    );
  END IF;

  -- Validar todas as pernas
  FOR v_perna IN SELECT * FROM jsonb_array_elements(COALESCE(p_pernas_data, '[]'::jsonb))
  LOOP
    v_bookmaker_id := (v_perna->>'bookmaker_id')::UUID;
    v_stake := COALESCE((v_perna->>'stake')::NUMERIC, 0);
    
    IF v_stake <= 0 THEN
      CONTINUE;
    END IF;

    SELECT 
      b.saldo_atual,
      b.moeda,
      b.nome
    INTO v_saldo_atual, v_moeda, v_bookmaker_nome
    FROM public.bookmakers b
    WHERE b.id = v_bookmaker_id
    AND (b.projeto_id = v_projeto_id OR b.workspace_id = v_workspace_id)
    AND UPPER(b.status) IN ('ATIVO', 'LIMITADA');

    IF NOT FOUND THEN
      RETURN jsonb_build_object(
        'success', false,
        'error', 'BOOKMAKER_NAO_ENCONTRADO',
        'message', format('Bookmaker %s não encontrado ou não está vinculado ao projeto/workspace', v_bookmaker_id)
      );
    END IF;

    IF v_stake > v_saldo_atual THEN
      RETURN jsonb_build_object(
        'success', false,
        'error', 'SALDO_INSUFICIENTE',
        'message', format('Saldo insuficiente em %s. Disponível: %s %s, Solicitado: %s %s', 
          v_bookmaker_nome, ROUND(v_saldo_atual, 2), v_moeda, ROUND(v_stake, 2), v_moeda),
        'bookmaker_id', v_bookmaker_id,
        'saldo_operavel', v_saldo_atual,
        'stake_solicitado', v_stake
      );
    END IF;

    v_total_stake := v_total_stake + v_stake;
  END LOOP;

  -- Inserir aposta principal
  INSERT INTO public.apostas_unificada (
    id, user_id, projeto_id, workspace_id,
    estrategia, contexto_operacional, forma_registro, status,
    data_aposta, evento, esporte, mercado, observacoes,
    stake_total, stake_real, stake_freebet,
    lucro_esperado, roi_esperado,
    created_at, updated_at
  ) VALUES (
    COALESCE((p_aposta_data->>'id')::UUID, gen_random_uuid()),
    v_user_id, v_projeto_id, v_workspace_id,
    COALESCE(p_aposta_data->>'estrategia', 'SUREBET'),
    COALESCE(p_aposta_data->>'contexto_operacional', 'surebet'),
    COALESCE(p_aposta_data->>'forma_registro', 'MANUAL'),
    COALESCE(p_aposta_data->>'status', 'PENDENTE'),
    COALESCE((p_aposta_data->>'data_aposta')::DATE, CURRENT_DATE),
    p_aposta_data->>'evento',
    p_aposta_data->>'esporte',
    p_aposta_data->>'mercado',
    p_aposta_data->>'observacoes',
    v_total_stake,
    v_total_stake,
    0,
    (p_aposta_data->>'lucro_esperado')::NUMERIC,
    (p_aposta_data->>'roi_esperado')::NUMERIC,
    NOW(), NOW()
  )
  RETURNING id INTO v_aposta_id;

  -- Inserir pernas
  v_perna_ordem := 1;
  FOR v_perna IN SELECT * FROM jsonb_array_elements(COALESCE(p_pernas_data, '[]'::jsonb))
  LOOP
    v_bookmaker_id := (v_perna->>'bookmaker_id')::UUID;
    v_stake := COALESCE((v_perna->>'stake')::NUMERIC, 0);
    v_is_freebet := COALESCE((v_perna->>'is_freebet')::BOOLEAN, false);
    
    IF v_is_freebet THEN
      v_stake_freebet := v_stake;
      v_stake_real := 0;
    ELSE
      v_stake_freebet := 0;
      v_stake_real := v_stake;
    END IF;

    INSERT INTO public.apostas_pernas (
      id, aposta_id, bookmaker_id, ordem,
      selecao, selecao_livre, odd, stake, 
      stake_real, stake_freebet,
      moeda,
      cotacao_snapshot, cotacao_snapshot_at, stake_brl_referencia,
      resultado, created_at, updated_at
    ) VALUES (
      gen_random_uuid(), v_aposta_id, v_bookmaker_id, v_perna_ordem,
      COALESCE(v_perna->>'selecao', 'Seleção ' || v_perna_ordem),
      v_perna->>'selecao_livre',
      COALESCE((v_perna->>'odd')::NUMERIC, 1.0),
      v_stake,
      v_stake_real,
      v_stake_freebet,
      COALESCE(v_perna->>'moeda', 'BRL'),
      (v_perna->>'cotacao_snapshot')::NUMERIC,
      (v_perna->>'cotacao_snapshot_at')::TIMESTAMPTZ,
      (v_perna->>'stake_brl_referencia')::NUMERIC,
      NULL, NOW(), NOW()
    );

    v_perna_ordem := v_perna_ordem + 1;
  END LOOP;

  RETURN jsonb_build_object(
    'success', true,
    'aposta_id', v_aposta_id,
    'total_stake', v_total_stake,
    'message', 'Aposta criada com sucesso'
  );

EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object(
    'success', false,
    'error', 'ERRO_INTERNO',
    'message', SQLERRM
  );
END;
$function$;

-- 2. Atualizar criar_aposta_atomica (versão UUIDs)
CREATE OR REPLACE FUNCTION public.criar_aposta_atomica(p_workspace_id uuid, p_projeto_id uuid, p_user_id uuid, p_aposta_data jsonb, p_pernas_data jsonb DEFAULT NULL::jsonb, p_atualizar_saldos boolean DEFAULT true)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_aposta_id UUID;
  v_projeto_nome TEXT;
  v_perna JSONB;
  v_bookmaker_id UUID;
  v_stake NUMERIC;
  v_saldo_atual NUMERIC;
  v_moeda TEXT;
BEGIN
  -- Validar projeto existe e está ativo
  IF NOT EXISTS (
    SELECT 1 FROM public.projetos 
    WHERE id = p_projeto_id 
    AND status IN ('EM_ANDAMENTO', 'PLANEJADO')
  ) THEN
    SELECT nome INTO v_projeto_nome FROM public.projetos WHERE id = p_projeto_id;
    RETURN jsonb_build_object(
      'success', false,
      'error', 'PROJETO_INATIVO',
      'message', format('Projeto "%s" não está ativo', COALESCE(v_projeto_nome, 'desconhecido'))
    );
  END IF;

  -- Criar aposta principal
  INSERT INTO public.apostas_unificada (
    id, workspace_id, projeto_id, user_id,
    data_aposta, forma_registro, estrategia, contexto_operacional,
    evento, mercado, esporte, bookmaker_id, selecao, odd,
    stake, stake_real, stake_bonus, lucro_esperado, status,
    observacoes, modo_entrada, lay_exchange, lay_odd, lay_stake,
    lay_liability, lay_comissao, back_comissao, back_em_exchange,
    modelo, tipo_freebet, is_bonus_bet, bonus_id, lado_aposta
  )
  VALUES (
    COALESCE((p_aposta_data->>'id')::UUID, gen_random_uuid()),
    p_workspace_id, p_projeto_id, p_user_id,
    COALESCE((p_aposta_data->>'data_aposta')::DATE, CURRENT_DATE),
    COALESCE(p_aposta_data->>'forma_registro', 'SIMPLES'),
    COALESCE(p_aposta_data->>'estrategia', 'PUNTER'),
    COALESCE(p_aposta_data->>'contexto_operacional', 'NORMAL'),
    p_aposta_data->>'evento', p_aposta_data->>'mercado',
    p_aposta_data->>'esporte',
    (p_aposta_data->>'bookmaker_id')::UUID,
    p_aposta_data->>'selecao',
    (p_aposta_data->>'odd')::NUMERIC,
    (p_aposta_data->>'stake')::NUMERIC,
    (p_aposta_data->>'stake_real')::NUMERIC,
    (p_aposta_data->>'stake_bonus')::NUMERIC,
    (p_aposta_data->>'lucro_esperado')::NUMERIC,
    COALESCE(p_aposta_data->>'status', 'PENDENTE'),
    p_aposta_data->>'observacoes',
    p_aposta_data->>'modo_entrada',
    p_aposta_data->>'lay_exchange',
    (p_aposta_data->>'lay_odd')::NUMERIC,
    (p_aposta_data->>'lay_stake')::NUMERIC,
    (p_aposta_data->>'lay_liability')::NUMERIC,
    (p_aposta_data->>'lay_comissao')::NUMERIC,
    (p_aposta_data->>'back_comissao')::NUMERIC,
    COALESCE((p_aposta_data->>'back_em_exchange')::BOOLEAN, FALSE),
    COALESCE(p_aposta_data->>'modelo', 'SIMPLES'),
    p_aposta_data->>'tipo_freebet',
    COALESCE((p_aposta_data->>'is_bonus_bet')::BOOLEAN, FALSE),
    (p_aposta_data->>'bonus_id')::UUID,
    p_aposta_data->>'lado_aposta'
  )
  RETURNING id INTO v_aposta_id;

  -- Processar pernas se existirem
  IF p_pernas_data IS NOT NULL AND jsonb_array_length(p_pernas_data) > 0 THEN
    FOR v_perna IN SELECT * FROM jsonb_array_elements(p_pernas_data)
    LOOP
      v_bookmaker_id := (v_perna->>'bookmaker_id')::UUID;
      v_stake := (v_perna->>'stake')::NUMERIC;

      INSERT INTO public.apostas_pernas (
        aposta_id, bookmaker_id, selecao, selecao_livre, odd, stake, moeda, ordem
      )
      VALUES (
        v_aposta_id, v_bookmaker_id,
        COALESCE(v_perna->>'selecao', 'BACK'),
        v_perna->>'selecao_livre',
        (v_perna->>'odd')::NUMERIC,
        v_stake,
        COALESCE(v_perna->>'moeda', 'BRL'),
        COALESCE((v_perna->>'ordem')::INTEGER, 1)
      );

      IF p_atualizar_saldos AND v_stake IS NOT NULL AND v_stake > 0 THEN
        SELECT b.moeda INTO v_moeda FROM public.bookmakers b WHERE b.id = v_bookmaker_id;
        
        INSERT INTO public.financial_events (
          bookmaker_id, aposta_id, workspace_id, tipo_evento, tipo_uso,
          valor, moeda, idempotency_key, descricao, processed_at, created_by
        ) VALUES (
          v_bookmaker_id, v_aposta_id, p_workspace_id, 'STAKE', 'NORMAL',
          -v_stake, COALESCE(v_moeda, 'BRL'),
          'stake_perna_' || v_aposta_id::TEXT || '_' || v_bookmaker_id::TEXT,
          'Débito de stake (perna) via Motor v9.5', now(), p_user_id
        );
      END IF;
    END LOOP;
  ELSIF p_atualizar_saldos THEN
    v_bookmaker_id := (p_aposta_data->>'bookmaker_id')::UUID;
    v_stake := (p_aposta_data->>'stake')::NUMERIC;

    IF v_bookmaker_id IS NOT NULL AND v_stake IS NOT NULL AND v_stake > 0 THEN
      SELECT b.moeda INTO v_moeda FROM public.bookmakers b WHERE b.id = v_bookmaker_id;

      INSERT INTO public.financial_events (
        bookmaker_id, aposta_id, workspace_id, tipo_evento, tipo_uso,
        valor, moeda, idempotency_key, descricao, processed_at, created_by
      ) VALUES (
        v_bookmaker_id, v_aposta_id, p_workspace_id, 'STAKE', 'NORMAL',
        -v_stake, COALESCE(v_moeda, 'BRL'),
        'stake_simple_' || v_aposta_id::TEXT,
        'Débito de stake (simples) via Motor v9.5', now(), p_user_id
      );
    END IF;
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'aposta_id', v_aposta_id,
    'message', 'Aposta registrada com sucesso'
  );
END;
$function$;

-- 3. Atualizar reverter_liquidacao_v4 (Qualificação)
CREATE OR REPLACE FUNCTION public.reverter_liquidacao_v4(p_aposta_id uuid)
 RETURNS TABLE(success boolean, message text, reversals_created integer)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_aposta RECORD;
  v_event RECORD;
  v_count INTEGER := 0;
  v_had_orphan_result BOOLEAN := FALSE;
BEGIN
  PERFORM set_config('app.surebet_recalc_context', 'on', true);
  SELECT * INTO v_aposta FROM public.apostas_unificada au WHERE au.id = p_aposta_id FOR UPDATE;
  
  IF v_aposta.id IS NULL THEN
    RETURN QUERY SELECT FALSE, 'Aposta não encontrada'::TEXT, 0;
    RETURN;
  END IF;
  
  v_had_orphan_result := (
    v_aposta.status = 'PENDENTE' 
    AND v_aposta.resultado IS NOT NULL 
    AND v_aposta.resultado <> 'PENDENTE'
  );

  IF v_aposta.status = 'LIQUIDADA' THEN
    FOR v_event IN 
      SELECT fe.* FROM public.financial_events fe
      WHERE fe.aposta_id = p_aposta_id 
        AND fe.tipo_evento IN ('PAYOUT', 'VOID_REFUND', 'FREEBET_PAYOUT')
        AND NOT EXISTS (
          SELECT 1 FROM public.financial_events r 
          WHERE r.reversed_event_id = fe.id
        )
    LOOP
      INSERT INTO public.financial_events (
        bookmaker_id, aposta_id, workspace_id, tipo_evento, tipo_uso,
        valor, moeda, idempotency_key, reversed_event_id, descricao, 
        processed_at, created_by
      ) VALUES (
        v_event.bookmaker_id, p_aposta_id, v_event.workspace_id, 'REVERSAL', v_event.tipo_uso,
        -v_event.valor, v_event.moeda,
        'reversal_' || v_event.id::TEXT,
        v_event.id,
        'Reversão de liquidação', now(), auth.uid()
      );
      v_count := v_count + 1;
    END LOOP;
  ELSIF NOT v_had_orphan_result THEN
    RETURN QUERY SELECT FALSE, 'Aposta não está liquidada e não há resíduo a limpar'::TEXT, 0;
    RETURN;
  END IF;
  
  UPDATE public.apostas_unificada 
  SET status = 'PENDENTE',
      resultado = NULL,
      lucro_prejuizo = NULL,
      lucro_prejuizo_brl_referencia = NULL,
      pl_consolidado = NULL,
      retorno_consolidado = NULL,
      updated_at = now()
  WHERE id = p_aposta_id;
  
  UPDATE public.apostas_pernas ap
  SET resultado = NULL,
      lucro_prejuizo = NULL,
      lucro_prejuizo_brl_referencia = NULL,
      updated_at = now()
  WHERE ap.aposta_id = p_aposta_id;
  
  IF v_had_orphan_result AND v_count = 0 THEN
    RETURN QUERY SELECT TRUE, 'Resíduo órfão de liquidação limpo (sem eventos a reverter)'::TEXT, 0;
  ELSE
    RETURN QUERY SELECT TRUE, 'Liquidação revertida com sucesso'::TEXT, v_count;
  END IF;
END;
$function$;

-- 4. Atualizar deletar_aposta_v4 (Qualificação)
CREATE OR REPLACE FUNCTION public.deletar_aposta_v4(p_aposta_id uuid)
 RETURNS TABLE(success boolean, message text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_aposta RECORD;
  v_net RECORD;
BEGIN
  PERFORM set_config('app.surebet_recalc_context', 'on', true);
  SELECT * INTO v_aposta FROM public.apostas_unificada au WHERE au.id = p_aposta_id FOR UPDATE;

  IF v_aposta.id IS NULL THEN
    RETURN QUERY SELECT FALSE, 'Aposta não encontrada'::TEXT;
    RETURN;
  END IF;

  FOR v_net IN
    SELECT fe.bookmaker_id, fe.moeda, SUM(fe.valor) as total_impact
    FROM public.financial_events fe
    WHERE fe.aposta_id = p_aposta_id
    GROUP BY fe.bookmaker_id, fe.moeda
  LOOP
    IF v_net.total_impact != 0 THEN
      INSERT INTO public.financial_events (
        bookmaker_id, aposta_id, workspace_id, tipo_evento, tipo_uso,
        valor, moeda, idempotency_key, descricao, processed_at
      ) VALUES (
        v_net.bookmaker_id, p_aposta_id, v_aposta.workspace_id, 'REVERSAL', 'NORMAL',
        -v_net.total_impact, v_net.moeda,
        'del_rev_' || p_aposta_id || '_' || v_net.bookmaker_id || '_' || v_net.moeda,
        'Reversão por exclusão de aposta', now()
      );
    END IF;
  END LOOP;

  DELETE FROM public.apostas_perna_entradas ape 
  USING public.apostas_pernas ap 
  WHERE ape.perna_id = ap.id AND ap.aposta_id = p_aposta_id;

  DELETE FROM public.apostas_pernas ap WHERE ap.aposta_id = p_aposta_id;
  DELETE FROM public.apostas_unificada au WHERE au.id = p_aposta_id;

  RETURN QUERY SELECT TRUE, 'Aposta e registros financeiros removidos com sucesso'::TEXT;
END;
$function$;
