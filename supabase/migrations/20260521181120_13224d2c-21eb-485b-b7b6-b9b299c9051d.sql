-- 1. DROP se existir para evitar conflito de assinatura
DROP FUNCTION IF EXISTS public.criar_surebet_atomica_v3(uuid, uuid, uuid, text, text, text, text, text, text, text, jsonb, jsonb);

-- 2. Criar a nova versão v3 com suporte a 1:N (entradas)
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
  v_events_count INTEGER := 0;
  v_data_aposta_ts TIMESTAMPTZ;
  v_perna_ordem_map JSONB := '{}'::jsonb; -- Mapa ordem -> perna_id
  
  -- Campos da entrada
  v_bookmaker_id UUID;
  v_stake NUMERIC;
  v_odd NUMERIC;
  v_moeda TEXT;
  v_fonte_saldo TEXT;
  v_cotacao_snapshot NUMERIC;
  v_stake_brl_referencia NUMERIC;
  v_bookmaker_nome TEXT;
  v_evento_id UUID;
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

  -- 2. Inserir Pernas
  FOR v_perna_json IN SELECT * FROM jsonb_array_elements(p_pernas) LOOP
    v_idx := v_idx + 1;
    
    INSERT INTO public.apostas_pernas (
      workspace_id, aposta_id, ordem, selecao, selecao_livre, 
      bookmaker_id, -- Mantido por compatibilidade legada (casa principal)
      created_at, updated_at
    ) VALUES (
      p_workspace_id, v_aposta_id, (v_perna_json->>'ordem')::INTEGER, 
      COALESCE(v_perna_json->>'selecao', 'Seleção ' || v_idx),
      v_perna_json->>'selecao_livre',
      (v_perna_json->>'casa_id')::UUID,
      NOW(), NOW()
    ) RETURNING id INTO v_perna_id;
    
    -- Mapear ordem da entrada para o UUID da perna criada
    v_perna_ordem_map := v_perna_ordem_map || jsonb_build_object(v_perna_json->>'ordem', v_perna_id);
  END LOOP;

  -- 3. Inserir Entradas e Gerar Eventos Ledger
  FOR v_entrada_json IN SELECT * FROM jsonb_array_elements(p_entradas) LOOP
    v_perna_id := (v_perna_ordem_map->>(v_entrada_json->>'perna_ordem'))::UUID;
    v_bookmaker_id := (v_entrada_json->>'bookmaker_id')::UUID;
    v_stake := (v_entrada_json->>'stake')::NUMERIC;
    v_odd := (v_entrada_json->>'odd')::NUMERIC;
    v_moeda := COALESCE(v_entrada_json->>'moeda', 'BRL');
    v_fonte_saldo := COALESCE(v_entrada_json->>'fonte_saldo', 'REAL');
    v_cotacao_snapshot := (v_entrada_json->>'cotacao_snapshot')::NUMERIC;
    v_stake_brl_referencia := (v_entrada_json->>'stake_brl_referencia')::NUMERIC;

    IF v_perna_id IS NULL THEN
       RAISE EXCEPTION 'Perna com ordem % não encontrada no mapeamento', v_entrada_json->>'perna_ordem';
    END IF;

    -- Inserir a entrada
    INSERT INTO public.apostas_perna_entradas (
      workspace_id, perna_id, aposta_id, bookmaker_id, stake, odd, moeda, 
      fonte_saldo, cotacao_snapshot, stake_brl_referencia, created_at, updated_at
    ) VALUES (
      p_workspace_id, v_perna_id, v_aposta_id, v_bookmaker_id, v_stake, v_odd, v_moeda,
      v_fonte_saldo, v_cotacao_snapshot, v_stake_brl_referencia, NOW(), NOW()
    );

    -- Gerar Evento no Ledger (Débito)
    SELECT nome INTO v_bookmaker_nome FROM public.bookmakers WHERE id = v_bookmaker_id;

    INSERT INTO public.ledger_unified_events (
      workspace_id, user_id, projeto_id, bookmaker_id, 
      tipo_evento, tipo_uso, valor, moeda, cotacao_snapshot,
      natureza, aposta_id, perna_id, descricao, data_transacao, created_at
    ) VALUES (
      p_workspace_id, p_user_id, p_projeto_id, v_bookmaker_id,
      'APOSTA_REALIZADA', v_fonte_saldo, v_stake, v_moeda, v_cotacao_snapshot,
      'DEBITO', v_aposta_id, v_perna_id,
      format('Aposta Surebet: %s (%s) - %s', p_evento, v_bookmaker_nome, v_fonte_saldo),
      v_data_aposta_ts, NOW()
    ) RETURNING id INTO v_evento_id;

    v_events_count := v_events_count + 1;
  END LOOP;

  -- 4. Recalcular Pai (Agregados, Lucro Esperado, ROI)
  -- A engine fn_recalc_pai_surebet já trata o modelo 1:N somando entradas de apostas_perna_entradas
  PERFORM public.fn_recalc_pai_surebet(v_aposta_id);

  RETURN QUERY SELECT true, v_aposta_id, v_events_count, 'Surebet criada com sucesso (v3)'::text;

EXCEPTION WHEN OTHERS THEN
  RETURN QUERY SELECT false, NULL::uuid, 0, SQLERRM;
END;
$function$;

-- 3. Adicionar comentário para documentação
COMMENT ON FUNCTION public.criar_surebet_atomica_v3 IS 'Versão 1:N da criação de surebet. Suporta múltiplas entradas por perna e utiliza a nova estrutura de tabelas apostas_pernas e apostas_perna_entradas.';

-- 4. Notificar PostgREST para recarregar o cache
NOTIFY pgrst, 'reload schema';
