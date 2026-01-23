-- Corrigir a RPC criar_aposta_atomica para:
-- 1. Aceitar status case-insensitive (ativo, ATIVO, etc)
-- 2. Aceitar bookmakers por projeto_id OU workspace_id (mais flexível)
-- 3. Aceitar status 'limitada' (bookmakers limitados ainda podem receber apostas)

CREATE OR REPLACE FUNCTION public.criar_aposta_atomica(p_aposta_data jsonb, p_pernas_data jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $$
DECLARE
  v_user_id UUID;
  v_projeto_id UUID;
  v_workspace_id UUID;
  v_aposta_id UUID;
  v_perna JSONB;
  v_bookmaker_id UUID;
  v_stake NUMERIC;
  v_saldo_atual NUMERIC;
  v_stake_reservado NUMERIC;
  v_saldo_operavel NUMERIC;
  v_perna_ordem INT := 1;
  v_total_stake NUMERIC := 0;
  v_moeda TEXT;
  v_bookmaker_nome TEXT;
BEGIN
  -- Extrair IDs do payload
  v_user_id := (p_aposta_data->>'user_id')::UUID;
  v_projeto_id := (p_aposta_data->>'projeto_id')::UUID;
  v_workspace_id := (p_aposta_data->>'workspace_id')::UUID;

  -- Validar projeto ativo (aceitar EM_ANDAMENTO e PLANEJADO)
  IF NOT EXISTS (
    SELECT 1 FROM projetos 
    WHERE id = v_projeto_id 
    AND UPPER(status) IN ('EM_ANDAMENTO', 'PLANEJADO')
  ) THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'PROJETO_INATIVO',
      'message', 'Projeto não está em andamento ou planejado'
    );
  END IF;

  -- Validar todas as pernas antes de começar
  FOR v_perna IN SELECT * FROM jsonb_array_elements(COALESCE(p_pernas_data, '[]'::jsonb))
  LOOP
    v_bookmaker_id := (v_perna->>'bookmaker_id')::UUID;
    v_stake := COALESCE((v_perna->>'stake')::NUMERIC, 0);
    
    IF v_stake <= 0 THEN
      CONTINUE;
    END IF;

    -- Buscar saldo atual e stake reservado
    -- CORREÇÃO: Aceitar bookmaker por projeto_id OU workspace_id
    -- CORREÇÃO: Status case-insensitive, aceitar 'ativo' e 'limitada'
    SELECT 
      b.saldo_atual,
      b.moeda,
      b.nome,
      COALESCE((
        SELECT SUM(ap.stake)
        FROM apostas_pernas ap
        JOIN apostas_unificada au ON au.id = ap.aposta_id
        WHERE ap.bookmaker_id = b.id
        AND UPPER(au.status) = 'PENDENTE'
      ), 0)
    INTO v_saldo_atual, v_moeda, v_bookmaker_nome, v_stake_reservado
    FROM bookmakers b
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

    -- Calcular saldo operável
    v_saldo_operavel := v_saldo_atual - v_stake_reservado;

    IF v_stake > v_saldo_operavel THEN
      RETURN jsonb_build_object(
        'success', false,
        'error', 'SALDO_INSUFICIENTE',
        'message', format('Saldo insuficiente em %s. Disponível: %s %s, Solicitado: %s %s', 
          v_bookmaker_nome, ROUND(v_saldo_operavel, 2), v_moeda, ROUND(v_stake, 2), v_moeda),
        'bookmaker_id', v_bookmaker_id,
        'saldo_operavel', v_saldo_operavel,
        'stake_solicitado', v_stake
      );
    END IF;

    v_total_stake := v_total_stake + v_stake;
  END LOOP;

  -- Inserir aposta principal
  INSERT INTO apostas_unificada (
    id,
    user_id,
    projeto_id,
    workspace_id,
    estrategia,
    contexto_operacional,
    forma_registro,
    status,
    data_aposta,
    evento,
    esporte,
    mercado,
    observacoes,
    stake_total,
    lucro_esperado,
    roi_esperado,
    created_at,
    updated_at
  ) VALUES (
    COALESCE((p_aposta_data->>'id')::UUID, gen_random_uuid()),
    v_user_id,
    v_projeto_id,
    v_workspace_id,
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
    (p_aposta_data->>'lucro_esperado')::NUMERIC,
    (p_aposta_data->>'roi_esperado')::NUMERIC,
    NOW(),
    NOW()
  )
  RETURNING id INTO v_aposta_id;

  -- Inserir pernas
  v_perna_ordem := 1;
  FOR v_perna IN SELECT * FROM jsonb_array_elements(COALESCE(p_pernas_data, '[]'::jsonb))
  LOOP
    v_bookmaker_id := (v_perna->>'bookmaker_id')::UUID;
    v_stake := COALESCE((v_perna->>'stake')::NUMERIC, 0);

    INSERT INTO apostas_pernas (
      id,
      aposta_id,
      bookmaker_id,
      ordem,
      selecao,
      selecao_livre,
      odd,
      stake,
      moeda,
      resultado,
      created_at,
      updated_at
    ) VALUES (
      gen_random_uuid(),
      v_aposta_id,
      v_bookmaker_id,
      v_perna_ordem,
      COALESCE(v_perna->>'selecao', 'Seleção ' || v_perna_ordem),
      v_perna->>'selecao_livre',
      COALESCE((v_perna->>'odd')::NUMERIC, 1.0),
      v_stake,
      COALESCE(v_perna->>'moeda', 'BRL'),
      NULL,
      NOW(),
      NOW()
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
$$;