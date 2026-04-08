
-- ============================================================
-- FIX 1: criar_aposta_atomica - Remove direct saldo UPDATE
-- Keep the function but delegate saldo management to financial_events trigger
-- ============================================================
CREATE OR REPLACE FUNCTION public.criar_aposta_atomica(
  p_workspace_id uuid, 
  p_projeto_id uuid, 
  p_user_id uuid, 
  p_aposta_data jsonb, 
  p_pernas_data jsonb DEFAULT NULL::jsonb, 
  p_atualizar_saldos boolean DEFAULT true
)
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
    SELECT 1 FROM projetos 
    WHERE id = p_projeto_id 
    AND status IN ('EM_ANDAMENTO', 'PLANEJADO')
  ) THEN
    SELECT nome INTO v_projeto_nome FROM projetos WHERE id = p_projeto_id;
    RETURN jsonb_build_object(
      'success', false,
      'error', 'PROJETO_INATIVO',
      'message', format('Projeto "%s" não está ativo', COALESCE(v_projeto_nome, 'desconhecido'))
    );
  END IF;

  -- Criar aposta principal
  INSERT INTO apostas_unificada (
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

      INSERT INTO apostas_pernas (
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

      -- v9.5: Inserir evento financeiro em vez de UPDATE direto
      -- O trigger tr_financial_events_sync_balance cuida do saldo
      IF p_atualizar_saldos AND v_stake IS NOT NULL AND v_stake > 0 THEN
        SELECT moeda INTO v_moeda FROM bookmakers WHERE id = v_bookmaker_id;
        
        INSERT INTO financial_events (
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
    -- Aposta simples - inserir evento financeiro
    v_bookmaker_id := (p_aposta_data->>'bookmaker_id')::UUID;
    v_stake := (p_aposta_data->>'stake')::NUMERIC;
    
    IF v_bookmaker_id IS NOT NULL AND v_stake IS NOT NULL AND v_stake > 0 THEN
      SELECT moeda INTO v_moeda FROM bookmakers WHERE id = v_bookmaker_id;
      
      INSERT INTO financial_events (
        bookmaker_id, aposta_id, workspace_id, tipo_evento, tipo_uso,
        valor, moeda, idempotency_key, descricao, processed_at, created_by
      ) VALUES (
        v_bookmaker_id, v_aposta_id, p_workspace_id, 'STAKE', 'NORMAL',
        -v_stake, COALESCE(v_moeda, 'BRL'),
        'stake_' || v_aposta_id::TEXT,
        'Débito de stake (simples) via Motor v9.5', now(), p_user_id
      );
    END IF;
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'aposta_id', v_aposta_id
  );
END;
$function$;

-- ============================================================
-- FIX 2: processar_debito_waterfall (6-param) - Use ledger instead of direct UPDATE
-- ============================================================
CREATE OR REPLACE FUNCTION public.processar_debito_waterfall(
  p_bookmaker_id uuid, 
  p_stake numeric, 
  p_usar_freebet boolean, 
  p_workspace_id uuid, 
  p_user_id uuid, 
  p_aposta_id uuid DEFAULT NULL::uuid
)
RETURNS TABLE(success boolean, debito_bonus numeric, debito_freebet numeric, debito_real numeric, error_message text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_calc RECORD;
  v_moeda TEXT;
BEGIN
  -- Calcular distribuição
  SELECT * INTO v_calc
  FROM calcular_debito_waterfall(p_bookmaker_id, p_stake, p_usar_freebet);
  
  -- Verificar se stake está coberto
  IF NOT v_calc.stake_coberto THEN
    RETURN QUERY SELECT 
      false,
      0::NUMERIC,
      0::NUMERIC,
      0::NUMERIC,
      'SALDO_INSUFICIENTE: stake excede saldo operável'::TEXT;
    RETURN;
  END IF;

  -- Buscar moeda
  SELECT moeda INTO v_moeda FROM bookmakers WHERE id = p_bookmaker_id;
  
  -- ============================================================
  -- MOTOR v9.5: Inserir eventos financeiros.
  -- O trigger tr_financial_events_sync_balance atualiza saldo.
  -- REMOVIDO: UPDATE bookmakers SET saldo_atual = ...
  -- ============================================================
  
  -- Débito REAL (se houver)
  IF v_calc.debito_real > 0 THEN
    INSERT INTO financial_events (
      bookmaker_id, aposta_id, workspace_id, tipo_evento, tipo_uso,
      valor, moeda, idempotency_key, descricao, processed_at, created_by
    ) VALUES (
      p_bookmaker_id, p_aposta_id, p_workspace_id, 'STAKE', 'NORMAL',
      -v_calc.debito_real, COALESCE(v_moeda, 'BRL'),
      'wf_real_' || COALESCE(p_aposta_id::TEXT, gen_random_uuid()::TEXT),
      FORMAT('Waterfall stake real: -%s', v_calc.debito_real), now(), p_user_id
    );
  END IF;

  -- Débito FREEBET (se houver)
  IF v_calc.debito_freebet > 0 THEN
    INSERT INTO financial_events (
      bookmaker_id, aposta_id, workspace_id, tipo_evento, tipo_uso,
      valor, moeda, idempotency_key, descricao, processed_at, created_by
    ) VALUES (
      p_bookmaker_id, p_aposta_id, p_workspace_id, 'FREEBET_STAKE', 'FREEBET',
      -v_calc.debito_freebet, COALESCE(v_moeda, 'BRL'),
      'wf_fb_' || COALESCE(p_aposta_id::TEXT, gen_random_uuid()::TEXT),
      FORMAT('Waterfall stake freebet: -%s', v_calc.debito_freebet), now(), p_user_id
    );
  END IF;

  -- Débito BONUS (se houver)
  IF v_calc.debito_bonus > 0 THEN
    INSERT INTO financial_events (
      bookmaker_id, aposta_id, workspace_id, tipo_evento, tipo_uso,
      valor, moeda, idempotency_key, descricao, processed_at, created_by
    ) VALUES (
      p_bookmaker_id, p_aposta_id, p_workspace_id, 'STAKE', 'BONUS',
      -v_calc.debito_bonus, COALESCE(v_moeda, 'BRL'),
      'wf_bonus_' || COALESCE(p_aposta_id::TEXT, gen_random_uuid()::TEXT),
      FORMAT('Waterfall stake bonus: -%s', v_calc.debito_bonus), now(), p_user_id
    );
  END IF;
  
  RETURN QUERY SELECT 
    true,
    v_calc.debito_bonus,
    v_calc.debito_freebet,
    v_calc.debito_real,
    NULL::TEXT;
END;
$function$;

-- ============================================================
-- FIX 3: debit_multiple_bookmakers - Use financial_events instead of direct UPDATE
-- ============================================================
CREATE OR REPLACE FUNCTION public.debit_multiple_bookmakers(p_debits jsonb, p_origem text DEFAULT 'aposta'::text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_item JSONB;
  v_bookmaker_id UUID;
  v_stake NUMERIC;
  v_expected_version INTEGER;
  v_referencia_id UUID;
  v_referencia_tipo TEXT;
  v_saldo_atual NUMERIC;
  v_current_version INTEGER;
  v_bookmaker_nome TEXT;
  v_moeda TEXT;
  v_results JSONB := '[]'::JSONB;
  v_user_id UUID;
  v_workspace_id UUID;
BEGIN
  v_user_id := auth.uid();
  
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_debits)
  LOOP
    v_bookmaker_id := (v_item->>'bookmaker_id')::UUID;
    v_stake := (v_item->>'stake')::NUMERIC;
    v_expected_version := COALESCE((v_item->>'expected_version')::INTEGER, 0);
    v_referencia_id := (v_item->>'referencia_id')::UUID;
    v_referencia_tipo := v_item->>'referencia_tipo';
    
    -- Obter dados com lock exclusivo
    SELECT saldo_atual, version, nome, workspace_id, moeda
    INTO v_saldo_atual, v_current_version, v_bookmaker_nome, v_workspace_id, v_moeda
    FROM public.bookmakers
    WHERE id = v_bookmaker_id
    FOR UPDATE;
    
    IF v_saldo_atual IS NULL THEN
      RAISE EXCEPTION 'Bookmaker não encontrada: %', v_bookmaker_id;
    END IF;
    
    -- Verificar versão se fornecida
    IF v_expected_version > 0 AND v_current_version != v_expected_version THEN
      RAISE EXCEPTION '"%s" foi alterada. Versão esperada: %, atual: %', 
                       v_bookmaker_nome, v_expected_version, v_current_version;
    END IF;
    
    -- Verificar saldo suficiente
    IF v_saldo_atual < v_stake THEN
      RAISE EXCEPTION '"%s": Saldo insuficiente. Disponível: %, Necessário: %', 
                       v_bookmaker_nome, ROUND(v_saldo_atual, 2), ROUND(v_stake, 2);
    END IF;
    
    -- ============================================================
    -- MOTOR v9.5: Inserir evento financeiro.
    -- REMOVIDO: UPDATE bookmakers SET saldo_atual = ...
    -- O trigger tr_financial_events_sync_balance cuida do saldo.
    -- ============================================================
    INSERT INTO financial_events (
      bookmaker_id, workspace_id, tipo_evento, tipo_uso,
      valor, moeda, idempotency_key, descricao, processed_at, created_by
    ) VALUES (
      v_bookmaker_id, v_workspace_id, 'STAKE', 'NORMAL',
      -v_stake, COALESCE(v_moeda, 'BRL'),
      'debit_multi_' || v_bookmaker_id::TEXT || '_' || COALESCE(v_referencia_id::TEXT, gen_random_uuid()::TEXT),
      FORMAT('Débito múltiplo: %s via %s', v_stake, p_origem), now(), v_user_id
    );
    
    v_results := v_results || jsonb_build_object(
      'bookmaker_id', v_bookmaker_id,
      'bookmaker_nome', v_bookmaker_nome,
      'saldo_anterior', v_saldo_atual,
      'saldo_novo', v_saldo_atual - v_stake,
      'stake_debitado', v_stake,
      'new_version', v_current_version + 1
    );
  END LOOP;
  
  RETURN jsonb_build_object(
    'success', true,
    'debits', v_results,
    'timestamp', NOW()
  );
END;
$function$;
