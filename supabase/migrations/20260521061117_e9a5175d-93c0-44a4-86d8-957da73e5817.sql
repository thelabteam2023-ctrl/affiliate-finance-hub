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
  v_entrada_json JSONB;
  v_idx INTEGER := 0;
  v_ent_idx INTEGER := 0;
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
  v_bookmaker_nome TEXT;
BEGIN
  PERFORM set_config('app.skip_perna_auto_stake', 'on', true);

  v_data_aposta_ts := COALESCE(p_data_aposta::TIMESTAMPTZ, NOW());

  INSERT INTO public.apostas_unificada (
    workspace_id, user_id, projeto_id, evento, esporte, mercado, modelo,
    estrategia, contexto_operacional, data_aposta, status, forma_registro,
    created_at, updated_at
  ) VALUES (
    p_workspace_id, p_user_id, p_projeto_id, p_evento, p_esporte, p_mercado, p_modelo,
    p_estrategia, p_contexto_operacional, v_data_aposta_ts, 'PENDENTE', 'ARBITRAGEM',
    NOW(), NOW()
  ) RETURNING id INTO v_aposta_id;

  FOR v_perna_json IN SELECT * FROM jsonb_array_elements(p_pernas) LOOP
    v_idx := v_idx + 1;
    v_bookmaker_id := (v_perna_json->>'bookmaker_id')::UUID;
    v_stake := (v_perna_json->>'stake')::NUMERIC;
    v_odd := (v_perna_json->>'odd')::NUMERIC;
    v_moeda := COALESCE(v_perna_json->>'moeda', 'BRL');
    v_fonte_saldo := COALESCE(v_perna_json->>'fonte_saldo', 'REAL');
    v_selecao := COALESCE(v_perna_json->>'selecao', 'Seleção ' || v_idx);
    v_selecao_livre := v_perna_json->>'selecaoLivre';
    v_input_ordem := COALESCE((v_perna_json->>'ordem')::INTEGER, v_idx);

    INSERT INTO public.apostas_pernas (
      aposta_id, ordem, selecao, selecao_livre,
      bookmaker_id, stake, odd, moeda, fonte_saldo,
      stake_real, stake_freebet,
      created_at, updated_at
    ) VALUES (
      v_aposta_id, v_input_ordem, v_selecao, v_selecao_livre,
      v_bookmaker_id, v_stake, v_odd, v_moeda, v_fonte_saldo,
      CASE WHEN v_fonte_saldo = 'FREEBET' THEN 0 ELSE v_stake END,
      CASE WHEN v_fonte_saldo = 'FREEBET' THEN v_stake ELSE 0 END,
      NOW(), NOW()
    )
    RETURNING id INTO v_perna_id;

    -- Se houver array de entradas, processa cada uma
    IF v_perna_json ? 'entradas' AND jsonb_array_length(v_perna_json->'entradas') > 0 THEN
      v_ent_idx := 0;
      FOR v_entrada_json IN SELECT * FROM jsonb_array_elements(v_perna_json->'entradas') LOOP
        v_ent_idx := v_ent_idx + 1;
        
        v_bookmaker_id := (v_entrada_json->>'bookmaker_id')::UUID;
        v_stake := (v_entrada_json->>'stake')::NUMERIC;
        v_odd := (v_entrada_json->>'odd')::NUMERIC;
        v_moeda := COALESCE(v_entrada_json->>'moeda', 'BRL');
        v_fonte_saldo := COALESCE(v_entrada_json->>'fonte_saldo', 'REAL');
        v_cotacao_snapshot := (v_entrada_json->>'cotacao_snapshot')::NUMERIC;

        SELECT b.nome INTO v_bookmaker_nome FROM public.bookmakers b WHERE b.id = v_bookmaker_id;

        INSERT INTO public.apostas_perna_entradas (
          perna_id, bookmaker_id, stake, odd, moeda,
          stake_real, stake_freebet, cotacao_snapshot, fonte_saldo, created_at, updated_at
        ) VALUES (
          v_perna_id, v_bookmaker_id, v_stake, v_odd, v_moeda,
          CASE WHEN v_fonte_saldo = 'FREEBET' THEN 0 ELSE v_stake END,
          CASE WHEN v_fonte_saldo = 'FREEBET' THEN v_stake ELSE 0 END,
          v_cotacao_snapshot, v_fonte_saldo, NOW(), NOW()
        );

        INSERT INTO public.financial_events (
          bookmaker_id, aposta_id, workspace_id,
          tipo_evento, tipo_uso, origem, valor, moeda,
          idempotency_key, descricao, processed_at, created_by
        ) VALUES (
          v_bookmaker_id, v_aposta_id, p_workspace_id,
          CASE WHEN v_fonte_saldo = 'FREEBET' THEN 'FREEBET_STAKE' ELSE 'STAKE' END,
          CASE WHEN v_fonte_saldo = 'FREEBET' THEN 'FREEBET' ELSE 'NORMAL' END,
          'STAKE', -v_stake, v_moeda,
          'stake_' || v_aposta_id || '_p' || v_idx || '_e' || v_ent_idx,
          format('Stake Surebet Perna %s - Entrada %s (%s)', v_input_ordem, v_ent_idx, v_bookmaker_nome),
          NOW(), p_user_id
        );
        v_events_count := v_events_count + 1;
      END LOOP;
    ELSE
      -- Fallback para comportamento legado (1 perna = 1 entrada)
      SELECT b.nome INTO v_bookmaker_nome FROM public.bookmakers b WHERE b.id = v_bookmaker_id;
      
      INSERT INTO public.apostas_perna_entradas (
        perna_id, bookmaker_id, stake, odd, moeda,
        stake_real, stake_freebet, fonte_saldo, created_at, updated_at
      ) VALUES (
        v_perna_id, v_bookmaker_id, v_stake, v_odd, v_moeda,
        CASE WHEN v_fonte_saldo = 'FREEBET' THEN 0 ELSE v_stake END,
        CASE WHEN v_fonte_saldo = 'FREEBET' THEN v_stake ELSE 0 END,
        v_fonte_saldo, NOW(), NOW()
      );

      INSERT INTO public.financial_events (
        bookmaker_id, aposta_id, workspace_id,
        tipo_evento, tipo_uso, origem, valor, moeda,
        idempotency_key, descricao, processed_at, created_by
      ) VALUES (
        v_bookmaker_id, v_aposta_id, p_workspace_id,
        CASE WHEN v_fonte_saldo = 'FREEBET' THEN 'FREEBET_STAKE' ELSE 'STAKE' END,
        CASE WHEN v_fonte_saldo = 'FREEBET' THEN 'FREEBET' ELSE 'NORMAL' END,
        'STAKE', -v_stake, v_moeda,
        'stake_' || v_aposta_id || '_p' || v_idx || '_legacy',
        format('Stake Surebet Perna %s (%s)', v_input_ordem, v_bookmaker_nome),
        NOW(), p_user_id
      );
      v_events_count := v_events_count + 1;
    END IF;
  END LOOP;

  PERFORM public.fn_recalc_pai_surebet(v_aposta_id);

  RETURN QUERY SELECT TRUE, v_aposta_id, v_events_count, 'Surebet criada com sucesso'::TEXT;
END;
$function$