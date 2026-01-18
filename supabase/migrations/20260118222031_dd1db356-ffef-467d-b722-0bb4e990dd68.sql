-- Corrigir validação de status do projeto nas RPCs
-- O sistema usa EM_ANDAMENTO como status operacional válido, não ATIVO

-- 1. Dropar função existente primeiro (parâmetros têm nomes diferentes)
DROP FUNCTION IF EXISTS public.criar_aposta_atomica(jsonb, jsonb);

-- 2. Recriar função criar_aposta_atomica com validação correta
CREATE FUNCTION public.criar_aposta_atomica(
  p_aposta_data JSONB,
  p_pernas_data JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
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
BEGIN
  -- Extrair IDs do payload
  v_user_id := (p_aposta_data->>'user_id')::UUID;
  v_projeto_id := (p_aposta_data->>'projeto_id')::UUID;
  v_workspace_id := (p_aposta_data->>'workspace_id')::UUID;

  -- Validar projeto ativo (aceitar EM_ANDAMENTO e PLANEJADO)
  IF NOT EXISTS (
    SELECT 1 FROM projetos 
    WHERE id = v_projeto_id 
    AND status IN ('EM_ANDAMENTO', 'PLANEJADO')
  ) THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'PROJETO_INATIVO',
      'message', 'Projeto não está em andamento ou planejado'
    );
  END IF;

  -- Validar todas as pernas antes de começar
  FOR v_perna IN SELECT * FROM jsonb_array_elements(p_pernas_data)
  LOOP
    v_bookmaker_id := (v_perna->>'bookmaker_id')::UUID;
    v_stake := COALESCE((v_perna->>'stake')::NUMERIC, 0);
    
    IF v_stake <= 0 THEN
      CONTINUE;
    END IF;

    -- Buscar saldo atual e stake reservado
    SELECT 
      b.saldo_atual,
      b.moeda,
      COALESCE((
        SELECT SUM(ap.stake)
        FROM apostas_pernas ap
        JOIN apostas_unificada au ON au.id = ap.aposta_id
        WHERE ap.bookmaker_id = b.id
        AND au.status = 'PENDENTE'
      ), 0)
    INTO v_saldo_atual, v_moeda, v_stake_reservado
    FROM bookmakers b
    WHERE b.id = v_bookmaker_id
    AND b.projeto_id = v_projeto_id
    AND b.status = 'ATIVO';

    IF NOT FOUND THEN
      RETURN jsonb_build_object(
        'success', false,
        'error', 'BOOKMAKER_NAO_ENCONTRADO',
        'message', format('Bookmaker %s não encontrado ou não está vinculado ao projeto', v_bookmaker_id)
      );
    END IF;

    -- Calcular saldo operável
    v_saldo_operavel := v_saldo_atual - v_stake_reservado;

    IF v_stake > v_saldo_operavel THEN
      RETURN jsonb_build_object(
        'success', false,
        'error', 'SALDO_INSUFICIENTE',
        'message', format('Saldo insuficiente no bookmaker. Disponível: %s %s, Solicitado: %s %s', 
          ROUND(v_saldo_operavel, 2), v_moeda, ROUND(v_stake, 2), v_moeda),
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
  FOR v_perna IN SELECT * FROM jsonb_array_elements(p_pernas_data)
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

-- 3. Atualizar função validate_bet_creation_v2 com validação correta
CREATE OR REPLACE FUNCTION public.validate_bet_creation_v2(
  p_projeto_id UUID,
  p_bookmaker_stakes JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_projeto_nome TEXT;
  v_projeto_status TEXT;
  v_stake_item JSONB;
  v_bookmaker_id UUID;
  v_stake NUMERIC;
  v_saldo_atual NUMERIC;
  v_stake_reservado NUMERIC;
  v_saldo_operavel NUMERIC;
  v_moeda TEXT;
  v_bookmaker_nome TEXT;
  v_errors JSONB := '[]'::JSONB;
  v_validations JSONB := '[]'::JSONB;
BEGIN
  -- Validar projeto
  SELECT nome, status INTO v_projeto_nome, v_projeto_status
  FROM projetos
  WHERE id = p_projeto_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'valid', false,
      'errors', jsonb_build_array(
        jsonb_build_object(
          'code', 'PROJETO_NAO_ENCONTRADO',
          'message', 'Projeto não encontrado'
        )
      ),
      'validations', '[]'::JSONB
    );
  END IF;

  -- Verificar se projeto está em status operacional válido (EM_ANDAMENTO ou PLANEJADO)
  IF v_projeto_status NOT IN ('EM_ANDAMENTO', 'PLANEJADO') THEN
    RETURN jsonb_build_object(
      'valid', false,
      'errors', jsonb_build_array(
        jsonb_build_object(
          'code', 'PROJETO_INATIVO',
          'message', format('Projeto "%s" não está em andamento (status: %s)', v_projeto_nome, v_projeto_status)
        )
      ),
      'validations', '[]'::JSONB
    );
  END IF;

  -- Validar cada bookmaker/stake
  FOR v_stake_item IN SELECT * FROM jsonb_array_elements(p_bookmaker_stakes)
  LOOP
    v_bookmaker_id := (v_stake_item->>'bookmaker_id')::UUID;
    v_stake := COALESCE((v_stake_item->>'stake')::NUMERIC, 0);

    IF v_stake <= 0 THEN
      CONTINUE;
    END IF;

    -- Buscar dados do bookmaker
    SELECT 
      b.nome,
      b.saldo_atual,
      b.moeda,
      COALESCE((
        SELECT SUM(ap.stake)
        FROM apostas_pernas ap
        JOIN apostas_unificada au ON au.id = ap.aposta_id
        WHERE ap.bookmaker_id = b.id
        AND au.status = 'PENDENTE'
      ), 0)
    INTO v_bookmaker_nome, v_saldo_atual, v_moeda, v_stake_reservado
    FROM bookmakers b
    WHERE b.id = v_bookmaker_id
    AND b.projeto_id = p_projeto_id
    AND b.status = 'ATIVO';

    IF NOT FOUND THEN
      v_errors := v_errors || jsonb_build_array(
        jsonb_build_object(
          'code', 'BOOKMAKER_NAO_VINCULADO',
          'bookmaker_id', v_bookmaker_id,
          'message', format('Bookmaker %s não está vinculado ao projeto ou não está ativo', v_bookmaker_id)
        )
      );
      CONTINUE;
    END IF;

    -- Calcular saldo operável
    v_saldo_operavel := v_saldo_atual - v_stake_reservado;

    -- Adicionar validação
    v_validations := v_validations || jsonb_build_array(
      jsonb_build_object(
        'bookmaker_id', v_bookmaker_id,
        'bookmaker_nome', v_bookmaker_nome,
        'saldo_atual', v_saldo_atual,
        'stake_reservado', v_stake_reservado,
        'saldo_operavel', v_saldo_operavel,
        'stake_solicitado', v_stake,
        'moeda', v_moeda,
        'valid', v_stake <= v_saldo_operavel
      )
    );

    -- Verificar saldo suficiente
    IF v_stake > v_saldo_operavel THEN
      v_errors := v_errors || jsonb_build_array(
        jsonb_build_object(
          'code', 'SALDO_INSUFICIENTE',
          'bookmaker_id', v_bookmaker_id,
          'bookmaker_nome', v_bookmaker_nome,
          'message', format('Saldo insuficiente em %s. Disponível: %s %s, Solicitado: %s %s',
            v_bookmaker_nome, ROUND(v_saldo_operavel, 2), v_moeda, ROUND(v_stake, 2), v_moeda)
        )
      );
    END IF;
  END LOOP;

  RETURN jsonb_build_object(
    'valid', jsonb_array_length(v_errors) = 0,
    'errors', v_errors,
    'validations', v_validations,
    'projeto', jsonb_build_object(
      'id', p_projeto_id,
      'nome', v_projeto_nome,
      'status', v_projeto_status
    )
  );
END;
$$;