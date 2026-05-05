-- 0. Dropar funções antigas para permitir alteração de assinatura/retorno
DROP FUNCTION IF EXISTS public.criar_surebet_atomica(uuid, uuid, uuid, text, text, text, text, text, text, text, jsonb);
DROP FUNCTION IF EXISTS public.fn_recalc_pai_surebet(uuid);
DROP FUNCTION IF EXISTS public.liquidar_perna_surebet_v1(uuid, text, uuid);

-- 1. Atualizar criar_surebet_atomica com nomes de parâmetros seguros
CREATE OR REPLACE FUNCTION public.criar_surebet_atomica(
    p_workspace_id uuid, 
    p_user_id uuid, 
    p_projeto_id uuid, 
    p_evento text, 
    p_esporte text DEFAULT NULL::text, 
    p_mercado text DEFAULT NULL::text, 
    p_modelo text DEFAULT NULL::text, 
    p_estrategia text DEFAULT 'SUREBET'::text, 
    p_contexto_operacional text DEFAULT 'NORMAL'::text, 
    p_data_aposta text DEFAULT NULL::text, 
    p_pernas jsonb DEFAULT '[]'::jsonb
)
RETURNS TABLE(success boolean, o_aposta_id uuid, events_created integer, message text) 
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_aposta_id UUID;
  v_perna_json JSONB;
  v_idx INTEGER := 0;
  v_perna_id UUID;
  v_events_count INTEGER := 0;
  v_data_aposta_ts TIMESTAMPTZ;
  v_input_ordem INTEGER;
  v_bookmaker_id UUID;
  v_stake NUMERIC;
  v_odd NUMERIC;
  v_moeda TEXT;
  v_fonte_saldo TEXT;
  v_selecao TEXT;
  v_selecao_livre TEXT;
  v_cotacao_snapshot NUMERIC;
  v_saldo_atual NUMERIC;
  v_saldo_freebet NUMERIC;
  v_bookmaker_nome TEXT;
BEGIN
  v_data_aposta_ts := COALESCE(p_data_aposta::TIMESTAMPTZ, NOW());

  -- 1. Inserir Aposta Pai
  INSERT INTO public.apostas_unificada (
    workspace_id, user_id, projeto_id, evento, esporte, mercado, modelo,
    estrategia, contexto_operacional, data_aposta, status, forma_registro,
    created_at, updated_at
  ) VALUES (
    p_workspace_id, p_user_id, p_projeto_id, p_evento, p_esporte, p_mercado, p_modelo,
    p_estrategia, p_contexto_operacional, v_data_aposta_ts, 'PENDENTE', 'ARBITRAGEM',
    NOW(), NOW()
  ) RETURNING id INTO v_aposta_id;

  -- 2. Processar Entradas
  FOR v_perna_json IN SELECT * FROM jsonb_array_elements(p_pernas) LOOP
    v_idx := v_idx + 1;
    v_bookmaker_id := (v_perna_json->>'bookmaker_id')::UUID;
    v_stake := (v_perna_json->>'stake')::NUMERIC;
    v_odd := (v_perna_json->>'odd')::NUMERIC;
    v_moeda := COALESCE(v_perna_json->>'moeda', 'BRL');
    v_fonte_saldo := COALESCE(v_perna_json->>'fonte_saldo', 'REAL');
    v_selecao := COALESCE(v_perna_json->>'selecao', 'Seleção ' || v_idx);
    v_selecao_livre := v_perna_json->>'selecaoLivre';
    v_cotacao_snapshot := (v_perna_json->>'cotacao_snapshot')::NUMERIC;
    v_input_ordem := COALESCE((v_perna_json->>'ordem')::INTEGER, v_idx);

    SELECT b.saldo_atual, b.saldo_freebet, b.nome
    INTO v_saldo_atual, v_saldo_freebet, v_bookmaker_nome
    FROM public.bookmakers b WHERE b.id = v_bookmaker_id AND b.workspace_id = p_workspace_id;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Bookmaker % não encontrada', v_bookmaker_id;
    END IF;

    -- 2a. Perna Lógica com aliasing para evitar conflitos de escopo
    INSERT INTO public.apostas_pernas (
      aposta_id, ordem, selecao, selecao_livre,
      bookmaker_id, stake, odd, moeda,
      created_at, updated_at
    ) VALUES (
      v_aposta_id, v_input_ordem, v_selecao, v_selecao_livre,
      v_bookmaker_id, v_stake, v_odd, v_moeda,
      NOW(), NOW()
    )
    ON CONFLICT (aposta_id, ordem) DO UPDATE 
    SET updated_at = NOW()
    RETURNING id INTO v_perna_id;

    -- 2b. Entrada Real
    INSERT INTO public.apostas_perna_entradas (
      perna_id, bookmaker_id, stake, odd, moeda,
      stake_real, stake_freebet, stake_brl_referencia,
      cotacao_snapshot, fonte_saldo, created_at, updated_at
    ) VALUES (
      v_perna_id, v_bookmaker_id, v_stake, v_odd, v_moeda,
      CASE WHEN v_fonte_saldo = 'FREEBET' THEN 0 ELSE v_stake END,
      CASE WHEN v_fonte_saldo = 'FREEBET' THEN v_stake ELSE 0 END,
      (v_perna_json->>'stake_brl_referencia')::NUMERIC,
      v_cotacao_snapshot, v_fonte_saldo, NOW(), NOW()
    );

    -- 2c. Evento Financeiro
    INSERT INTO public.financial_events (
      bookmaker_id, aposta_id, workspace_id,
      tipo_evento, tipo_uso, origem, valor, moeda,
      idempotency_key, descricao, processed_at, created_by
    ) VALUES (
      v_bookmaker_id, v_aposta_id, p_workspace_id,
      CASE WHEN v_fonte_saldo = 'FREEBET' THEN 'FREEBET_STAKE' ELSE 'STAKE' END,
      CASE WHEN v_fonte_saldo = 'FREEBET' THEN 'FREEBET' ELSE 'NORMAL' END,
      'STAKE', -v_stake, v_moeda,
      'stake_' || v_aposta_id || '_idx' || v_idx || '_' || v_perna_id,
      format('Stake Surebet Perna %s (%s)', v_input_ordem, v_bookmaker_nome),
      NOW(), p_user_id
    );

    v_events_count := v_events_count + 1;
  END LOOP;

  PERFORM public.fn_recalc_pai_surebet(v_aposta_id);

  RETURN QUERY SELECT TRUE, v_aposta_id, v_events_count, 'Surebet criada com sucesso'::TEXT;
END;
$function$;

-- 2. Recriar fn_recalc_pai_surebet
CREATE OR REPLACE FUNCTION public.fn_recalc_pai_surebet(p_surebet_id uuid)
RETURNS TABLE(todas_liquidadas boolean, lucro_total numeric, stake_total numeric, resultado_geral text, is_multicurrency boolean, pl_consolidado numeric, stake_consolidado numeric, consolidation_currency text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_moeda_consolidacao TEXT;
  v_entry RECORD;
  v_rate NUMERIC;
  v_todas_liquidadas BOOLEAN := true;
  v_lucro_total_calc NUMERIC := 0;
  v_stake_total_calc NUMERIC := 0;
  v_is_multicurrency_calc BOOLEAN := false;
  v_rates JSONB;
  v_brl_rate_from NUMERIC;
  v_brl_rate_to NUMERIC;
BEGIN
  PERFORM set_config('app.surebet_recalc_context', 'on', true);
  
  SELECT 
    proj.moeda_consolidacao,
    jsonb_build_object(
      'USD', COALESCE(proj.cotacao_trabalho, 1),
      'EUR', COALESCE(proj.cotacao_trabalho_eur, 1),
      'GBP', COALESCE(proj.cotacao_trabalho_gbp, 1),
      'MYR', COALESCE(proj.cotacao_trabalho_myr, 1),
      'MXN', COALESCE(proj.cotacao_trabalho_mxn, 1),
      'ARS', COALESCE(proj.cotacao_trabalho_ars, 1),
      'COP', COALESCE(proj.cotacao_trabalho_cop, 1),
      'BRL', 1
    )
  INTO v_moeda_consolidacao, v_rates
  FROM public.projetos proj
  JOIN public.apostas_unificada au ON au.projeto_id = proj.id
  WHERE au.id = p_surebet_id;

  v_moeda_consolidacao := COALESCE(v_moeda_consolidacao, 'BRL');

  SELECT bool_and(ap.resultado IS NOT NULL AND ap.resultado != 'PENDENTE')
  INTO v_todas_liquidadas
  FROM public.apostas_pernas ap
  WHERE ap.aposta_id = p_surebet_id;

  FOR v_entry IN
    SELECT 
      ae.moeda, ae.stake, ae.odd, ap.resultado
    FROM public.apostas_perna_entradas ae
    JOIN public.apostas_pernas ap ON ap.id = ae.perna_id
    WHERE ap.aposta_id = p_surebet_id
  LOOP
    IF v_entry.moeda != v_moeda_consolidacao THEN
      v_is_multicurrency_calc := true;
    END IF;

    v_brl_rate_from := COALESCE((v_rates->>UPPER(v_entry.moeda))::NUMERIC, 1);
    v_brl_rate_to := COALESCE((v_rates->>UPPER(v_moeda_consolidacao))::NUMERIC, 1);

    v_rate := CASE 
      WHEN v_entry.moeda = v_moeda_consolidacao THEN 1 
      WHEN v_brl_rate_to > 0 THEN v_brl_rate_from / v_brl_rate_to 
      ELSE 1 
    END;

    DECLARE
      v_entry_payout NUMERIC := 0;
      v_entry_lucro NUMERIC := 0;
    BEGIN
      CASE v_entry.resultado
        WHEN 'GREEN' THEN 
          v_entry_payout := v_entry.stake * v_entry.odd;
          v_entry_lucro := v_entry_payout - v_entry.stake;
        WHEN 'RED' THEN 
          v_entry_lucro := -v_entry.stake;
        WHEN 'VOID' THEN 
          v_entry_lucro := 0;
        WHEN 'MEIO_GREEN' THEN 
          v_entry_payout := v_entry.stake + (v_entry.stake * (v_entry.odd - 1) / 2);
          v_entry_lucro := v_entry_payout - v_entry.stake;
        WHEN 'MEIO_RED' THEN 
          v_entry_lucro := -(v_entry.stake / 2);
        ELSE 
          v_entry_lucro := 0;
      END CASE;

      v_lucro_total_calc := v_lucro_total_calc + v_entry_lucro * v_rate;
      v_stake_total_calc := v_stake_total_calc + v_entry.stake * v_rate;
    END;
  END LOOP;

  v_lucro_total_calc := ROUND(v_lucro_total_calc, 4);
  v_stake_total_calc := ROUND(v_stake_total_calc, 4);

  RETURN QUERY SELECT
    COALESCE(v_todas_liquidadas, false),
    v_lucro_total_calc,
    v_stake_total_calc,
    CASE 
      WHEN v_todas_liquidadas AND v_lucro_total_calc > 0 THEN 'GREEN'
      WHEN v_todas_liquidadas AND v_lucro_total_calc < 0 THEN 'RED'
      WHEN v_todas_liquidadas THEN 'VOID'
      ELSE NULL::TEXT
    END,
    v_is_multicurrency_calc,
    v_lucro_total_calc,
    v_stake_total_calc,
    v_moeda_consolidacao;
END;
$function$;

-- 3. Recriar liquidar_perna_surebet_v1
CREATE OR REPLACE FUNCTION public.liquidar_perna_surebet_v1(p_perna_id uuid, p_resultado text, p_workspace_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_surebet_id UUID;
  v_stake_val NUMERIC;
  v_odd_val NUMERIC;
  v_moeda TEXT;
  v_bookmaker_id UUID;
  v_payout NUMERIC := 0;
  v_old_resultado TEXT;
  v_fonte_saldo TEXT;
  v_is_freebet BOOLEAN;
  v_todas_liquidadas BOOLEAN;
  v_lucro_total NUMERIC;
  v_stake_total NUMERIC;
  v_resultado_final TEXT;
  v_is_multicurrency BOOLEAN;
BEGIN
  PERFORM set_config('app.surebet_recalc_context', 'on', true);

  SELECT ap.aposta_id, ap.stake, ap.odd, ap.moeda, ap.bookmaker_id, ap.resultado,
         COALESCE(ap.fonte_saldo, 'REAL')
  INTO v_surebet_id, v_stake_val, v_odd_val, v_moeda, v_bookmaker_id, v_old_resultado,
       v_fonte_saldo
  FROM public.apostas_pernas ap
  WHERE ap.id = p_perna_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Perna não encontrada');
  END IF;

  PERFORM 1 FROM public.apostas_unificada au WHERE au.id = v_surebet_id FOR UPDATE;

  IF v_old_resultado = p_resultado THEN
    RETURN jsonb_build_object('success', true, 'message', 'Resultado já é o mesmo', 'perna_id', p_perna_id);
  END IF;

  v_is_freebet := (v_fonte_saldo = 'FREEBET');

  IF v_old_resultado IS NOT NULL AND v_old_resultado NOT IN ('PENDENTE', '') THEN
    INSERT INTO public.financial_events (
      bookmaker_id, aposta_id, workspace_id, tipo_evento, tipo_uso,
      origem, valor, moeda, idempotency_key, reversed_event_id, descricao
    )
    SELECT 
      fe.bookmaker_id, fe.aposta_id, fe.workspace_id, 'REVERSAL', fe.tipo_uso,
      'liquidation_reset', -fe.valor, fe.moeda,
      'rev_' || fe.id || '_' || extract(epoch from now())::text,
      fe.id, 'Estorno para re-liquidação'
    FROM public.financial_events fe
    WHERE fe.aposta_id = v_surebet_id
      AND fe.bookmaker_id = v_bookmaker_id
      AND fe.tipo_evento IN ('PAYOUT', 'VOID_REFUND', 'FREEBET_PAYOUT')
      AND fe.idempotency_key LIKE '%perna_' || p_perna_id || '%';
  END IF;

  UPDATE public.apostas_pernas SET
    resultado = p_resultado,
    updated_at = NOW()
  WHERE id = p_perna_id;

  IF p_resultado = 'GREEN' THEN
    v_payout := CASE WHEN v_is_freebet THEN v_stake_val * (v_odd_val - 1) ELSE v_stake_val * v_odd_val END;
    INSERT INTO public.financial_events (
      bookmaker_id, aposta_id, workspace_id, tipo_evento, tipo_uso,
      origem, valor, moeda, idempotency_key, descricao, created_by
    ) VALUES (
      v_bookmaker_id, v_surebet_id, p_workspace_id,
      CASE WHEN v_is_freebet THEN 'FREEBET_PAYOUT' ELSE 'PAYOUT' END,
      CASE WHEN v_is_freebet THEN 'FREEBET' ELSE 'NORMAL' END,
      'LUCRO', v_payout, v_moeda,
      'payout_perna_' || p_perna_id || '_' || extract(epoch from now())::text,
      format('Payout GREEN Perna %s', p_perna_id),
      auth.uid()
    );
  ELSIF p_resultado = 'VOID' THEN
    INSERT INTO public.financial_events (
      bookmaker_id, aposta_id, workspace_id, tipo_evento, tipo_uso,
      origem, valor, moeda, idempotency_key, descricao, created_by
    ) VALUES (
      v_bookmaker_id, v_surebet_id, p_workspace_id, 'VOID_REFUND',
      CASE WHEN v_is_freebet THEN 'FREEBET' ELSE 'NORMAL' END,
      'ESTORNO', v_stake_val, v_moeda,
      'voidrefund_perna_' || p_perna_id || '_' || extract(epoch from now())::text,
      format('Reembolso VOID Perna %s', p_perna_id),
      auth.uid()
    );
  END IF;

  SELECT r.todas_liquidadas, r.lucro_total, r.stake_total, r.resultado_geral, r.is_multicurrency
  INTO v_todas_liquidadas, v_lucro_total, v_stake_total, v_resultado_final, v_is_multicurrency
  FROM public.fn_recalc_pai_surebet(v_surebet_id) r;

  UPDATE public.apostas_unificada SET
    status = CASE WHEN v_todas_liquidadas THEN 'LIQUIDADA' ELSE 'PENDENTE' END,
    resultado = v_resultado_final,
    stake_total = v_stake_total,
    lucro_prejuizo = CASE WHEN v_todas_liquidadas THEN v_lucro_total ELSE NULL END,
    is_multicurrency = v_is_multicurrency,
    updated_at = NOW()
  WHERE id = v_surebet_id;

  RETURN jsonb_build_object(
    'success', true,
    'perna_id', p_perna_id,
    'resultado', p_resultado,
    'todas_liquidadas', v_todas_liquidadas
  );
END;
$function$;
