-- 1. Remover a overload órfã (11 parâmetros) criada incorretamente
DROP FUNCTION IF EXISTS public.criar_surebet_atomica_v3(uuid, uuid, uuid, text, text, timestamptz, text, text, text, jsonb, jsonb);

-- 2. Corrigir a função real (12 parâmetros) usada pelo frontend
CREATE OR REPLACE FUNCTION public.criar_surebet_atomica_v3(
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
  p_pernas jsonb DEFAULT '[]'::jsonb, 
  p_entradas jsonb DEFAULT '[]'::jsonb
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
  v_perna_id UUID;
  v_entrada_id UUID;
  v_events_count INTEGER := 0;
  v_data_aposta_ts TIMESTAMPTZ;
  v_perna_ordem_map JSONB := '{}'::jsonb; -- Mapa ordem -> perna_id
  
  -- Campos da perna
  v_perna_ordem INTEGER;
  v_perna_casa_id UUID;
  v_perna_selecao TEXT;
  v_perna_selecao_livre TEXT;
  v_perna_stake_main NUMERIC;
  v_perna_odd_main NUMERIC;
  v_perna_moeda_main TEXT;
  v_perna_fonte_saldo_main TEXT;
  v_perna_cotacao_snapshot_main NUMERIC;
  v_perna_stake_brl_referencia_main NUMERIC;
  
  -- Campos da entrada
  v_bookmaker_id UUID;
  v_stake NUMERIC;
  v_odd NUMERIC;
  v_moeda TEXT;
  v_fonte_saldo TEXT;
  v_cotacao_snapshot NUMERIC;
  v_stake_brl_referencia NUMERIC;
  v_entrada_perna_ordem INTEGER;
BEGIN
  -- Habilitar contexto de recálculo para bypassar triggers de bloqueio (ARBITRAGEM)
  PERFORM set_config('app.surebet_recalc_context', 'on', true);
  
  -- Evitar recursão de stake automática
  PERFORM set_config('app.skip_perna_auto_stake', 'on', true);

  v_data_aposta_ts := COALESCE(p_data_aposta::TIMESTAMPTZ, NOW());

  -- 1. Inserir Registro Pai (Aposta Unificada)
  INSERT INTO public.apostas_unificada (
    workspace_id, user_id, projeto_id, evento, esporte, mercado, modelo,
    estrategia, contexto_operacional, data_aposta, status, forma_registro,
    created_at, updated_at
  ) VALUES (
    p_workspace_id, p_user_id, p_projeto_id, p_evento, p_esporte, p_mercado, p_modelo,
    p_estrategia, p_contexto_operacional, v_data_aposta_ts, 'PENDENTE', 'ARBITRAGEM',
    NOW(), NOW()
  ) RETURNING id INTO v_aposta_id;

  -- 2. Inserir Pernas (sem workspace_id; usa casa_id como bookmaker_id)
  FOR v_perna_json IN SELECT * FROM jsonb_array_elements(p_pernas) LOOP
    v_idx := v_idx + 1;
    
    v_perna_ordem := (v_perna_json->>'ordem')::INTEGER;
    v_perna_casa_id := (v_perna_json->>'casa_id')::UUID;
    v_perna_selecao := COALESCE(v_perna_json->>'selecao', 'Seleção ' || v_idx);
    v_perna_selecao_livre := v_perna_json->>'selecao_livre';
    
    -- Buscar dados da primeira entrada para preencher stake/odd/moeda da perna
    v_perna_stake_main := 0;
    v_perna_odd_main := 1;
    v_perna_moeda_main := 'BRL';
    v_perna_fonte_saldo_main := 'REAL';
    v_perna_cotacao_snapshot_main := 1;
    v_perna_stake_brl_referencia_main := 0;

    -- Procurar a primeira entrada dessa perna para extrair valores padrão
    -- CORREÇÃO: Adicionado o alias "elem" no FROM
    FOR v_entrada_json IN 
      SELECT elem 
      FROM jsonb_array_elements(p_entradas) AS elem 
      WHERE (elem->>'perna_ordem')::INTEGER = v_perna_ordem 
      LIMIT 1
    LOOP
      v_perna_stake_main := COALESCE((v_entrada_json->>'stake')::NUMERIC, 0);
      v_perna_odd_main := COALESCE((v_entrada_json->>'odd')::NUMERIC, 1);
      v_perna_moeda_main := COALESCE(v_entrada_json->>'moeda', 'BRL');
      v_perna_fonte_saldo_main := COALESCE(v_entrada_json->>'fonte_saldo', 'REAL');
      v_perna_cotacao_snapshot_main := (v_entrada_json->>'cotacao_snapshot')::NUMERIC;
      v_perna_stake_brl_referencia_main := (v_entrada_json->>'stake_brl_referencia')::NUMERIC;
    END LOOP;
    
    INSERT INTO public.apostas_pernas (
      aposta_id, ordem, selecao, selecao_livre, bookmaker_id, 
      stake, odd, moeda, fonte_saldo,
      cotacao_snapshot, stake_brl_referencia,
      stake_real, stake_freebet,
      created_at, updated_at
    ) VALUES (
      v_aposta_id, v_perna_ordem, v_perna_selecao, v_perna_selecao_livre, v_perna_casa_id,
      v_perna_stake_main, v_perna_odd_main, v_perna_moeda_main, v_perna_fonte_saldo_main,
      v_perna_cotacao_snapshot_main, v_perna_stake_brl_referencia_main,
      CASE WHEN v_perna_fonte_saldo_main = 'FREEBET' THEN 0 ELSE v_perna_stake_main END,
      CASE WHEN v_perna_fonte_saldo_main = 'FREEBET' THEN v_perna_stake_main ELSE 0 END,
      NOW(), NOW()
    ) RETURNING id INTO v_perna_id;
    
    -- Mapear ordem da perna para o UUID criado
    v_perna_ordem_map := v_perna_ordem_map || jsonb_build_object(v_perna_ordem::text, v_perna_id);
  END LOOP;

  -- 3. Inserir Entradas e Sincronizar Ledger de STAKE via fn_sync_stake_event_v1
  FOR v_entrada_json IN SELECT * FROM jsonb_array_elements(p_entradas) LOOP
    v_entrada_perna_ordem := (v_entrada_json->>'perna_ordem')::INTEGER;
    v_perna_id := (v_perna_ordem_map->>v_entrada_perna_ordem::text)::UUID;
    v_bookmaker_id := (v_entrada_json->>'bookmaker_id')::UUID;
    v_stake := (v_entrada_json->>'stake')::NUMERIC;
    v_odd := (v_entrada_json->>'odd')::NUMERIC;
    v_moeda := COALESCE(v_entrada_json->>'moeda', 'BRL');
    v_fonte_saldo := COALESCE(v_entrada_json->>'fonte_saldo', 'REAL');
    v_cotacao_snapshot := (v_entrada_json->>'cotacao_snapshot')::NUMERIC;
    v_stake_brl_referencia := (v_entrada_json->>'stake_brl_referencia')::NUMERIC;

    IF v_perna_id IS NULL THEN
       RAISE EXCEPTION 'Perna com ordem % não encontrada no mapeamento', v_entrada_perna_ordem;
    END IF;

    -- Inserir a entrada
    INSERT INTO public.apostas_perna_entradas (
      perna_id, bookmaker_id, stake, odd, moeda, 
      fonte_saldo, cotacao_snapshot, stake_brl_referencia,
      stake_real, stake_freebet,
      created_at, updated_at
    ) VALUES (
      v_perna_id, v_bookmaker_id, v_stake, v_odd, v_moeda,
      v_fonte_saldo, v_cotacao_snapshot, v_stake_brl_referencia,
      CASE WHEN v_fonte_saldo = 'FREEBET' THEN 0 ELSE v_stake END,
      CASE WHEN v_fonte_saldo = 'FREEBET' THEN v_stake ELSE 0 END,
      NOW(), NOW()
    ) RETURNING id INTO v_entrada_id;

    -- Sincronizar evento de STAKE no Ledger
    PERFORM public.fn_sync_stake_event_v1(
      v_entrada_id, 
      v_aposta_id, 
      p_workspace_id, 
      v_bookmaker_id, 
      v_stake, 
      v_moeda, 
      v_fonte_saldo, 
      p_user_id
    );

    v_events_count := v_events_count + 1;
  END LOOP;

  -- 4. Recalcular Pai (Agregados, Lucro Esperado, ROI)
  PERFORM public.fn_recalc_pai_surebet(v_aposta_id);

  RETURN QUERY SELECT true, v_aposta_id, v_events_count, 'Surebet criada com sucesso (v3)'::text;

EXCEPTION WHEN OTHERS THEN
  RETURN QUERY SELECT false, NULL::uuid, 0, SQLERRM;
END;
$function$;

-- 3. Limpar aposta órfã criada pelo bug
DELETE FROM public.apostas_unificada WHERE id = '61a451f2-0da8-4738-b928-c3744285db5a';
