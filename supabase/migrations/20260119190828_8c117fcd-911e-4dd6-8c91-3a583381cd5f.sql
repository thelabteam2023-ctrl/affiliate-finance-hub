-- Corrigir validação de status do projeto em todas as funções
-- Status válidos para operação: EM_ANDAMENTO, PLANEJADO (não existe status 'ativo' ou 'ATIVO')

-- 1. Corrigir validate_aposta_pre_commit
CREATE OR REPLACE FUNCTION public.validate_aposta_pre_commit(
  p_workspace_id UUID,
  p_projeto_id UUID,
  p_bookmaker_ids UUID[],
  p_stakes NUMERIC[]
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_projeto RECORD;
  v_bookmaker RECORD;
  v_errors JSONB := '[]'::JSONB;
  v_warnings JSONB := '[]'::JSONB;
  v_i INTEGER;
BEGIN
  -- ===== 1. VALIDAR PROJETO =====
  SELECT id, nome, status, workspace_id
  INTO v_projeto
  FROM projetos
  WHERE id = p_projeto_id AND workspace_id = p_workspace_id;

  IF v_projeto IS NULL THEN
    v_errors := v_errors || jsonb_build_object(
      'code', 'PROJETO_NOT_FOUND',
      'message', 'Projeto não encontrado no sistema'
    );
  ELSIF v_projeto.status NOT IN ('EM_ANDAMENTO', 'PLANEJADO') THEN
    v_errors := v_errors || jsonb_build_object(
      'code', 'PROJETO_INATIVO',
      'message', format('Projeto "%s" não está ativo (status: %s)', v_projeto.nome, v_projeto.status)
    );
  END IF;

  -- ===== 2. VALIDAR CADA BOOKMAKER =====
  FOR v_i IN 1..COALESCE(array_length(p_bookmaker_ids, 1), 0) LOOP
    SELECT b.id, b.nome, b.status, b.saldo_atual, b.projeto_id, b.workspace_id
    INTO v_bookmaker
    FROM bookmakers b
    WHERE b.id = p_bookmaker_ids[v_i] AND b.workspace_id = p_workspace_id;

    IF v_bookmaker IS NULL THEN
      v_errors := v_errors || jsonb_build_object(
        'code', 'BOOKMAKER_NOT_FOUND',
        'bookmaker_id', p_bookmaker_ids[v_i],
        'message', 'Casa de aposta não encontrada'
      );
      CONTINUE;
    END IF;

    -- Verificar status
    IF v_bookmaker.status NOT IN ('ATIVO', 'OPERANDO', 'AGUARDANDO_SAQUE') THEN
      v_errors := v_errors || jsonb_build_object(
        'code', 'BOOKMAKER_INATIVO',
        'bookmaker_id', v_bookmaker.id,
        'bookmaker_nome', v_bookmaker.nome,
        'message', format('Casa "%s" não está ativa (status: %s)', v_bookmaker.nome, v_bookmaker.status)
      );
    END IF;

    -- Verificar vínculo com projeto
    IF v_bookmaker.projeto_id IS NULL THEN
      v_warnings := v_warnings || jsonb_build_object(
        'code', 'BOOKMAKER_SEM_VINCULO',
        'bookmaker_id', v_bookmaker.id,
        'bookmaker_nome', v_bookmaker.nome,
        'message', format('Casa "%s" não está vinculada a nenhum projeto', v_bookmaker.nome)
      );
    ELSIF v_bookmaker.projeto_id != p_projeto_id THEN
      v_warnings := v_warnings || jsonb_build_object(
        'code', 'BOOKMAKER_OUTRO_PROJETO',
        'bookmaker_id', v_bookmaker.id,
        'bookmaker_nome', v_bookmaker.nome,
        'message', format('Casa "%s" está vinculada a outro projeto', v_bookmaker.nome)
      );
    END IF;

    -- Verificar saldo (warning, não error)
    IF p_stakes[v_i] IS NOT NULL AND v_bookmaker.saldo_atual < p_stakes[v_i] THEN
      v_warnings := v_warnings || jsonb_build_object(
        'code', 'SALDO_INSUFICIENTE',
        'bookmaker_id', v_bookmaker.id,
        'bookmaker_nome', v_bookmaker.nome,
        'saldo_atual', v_bookmaker.saldo_atual,
        'stake_necessario', p_stakes[v_i],
        'message', format('Casa "%s" tem saldo R$ %.2f insuficiente para stake R$ %.2f', 
          v_bookmaker.nome, v_bookmaker.saldo_atual, p_stakes[v_i])
      );
    END IF;
  END LOOP;

  RETURN jsonb_build_object(
    'valid', jsonb_array_length(v_errors) = 0,
    'errors', v_errors,
    'warnings', v_warnings
  );
END;
$$;

-- 2. Corrigir validate_and_reserve_stakes
CREATE OR REPLACE FUNCTION public.validate_and_reserve_stakes(
  p_workspace_id UUID,
  p_projeto_id UUID,
  p_bookmaker_ids UUID[],
  p_stakes NUMERIC[],
  p_odds NUMERIC[] DEFAULT NULL,
  p_selecoes TEXT[] DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_projeto_status TEXT;
  v_projeto_nome TEXT;
  v_bookmaker RECORD;
  v_validations JSONB := '[]'::JSONB;
  v_all_valid BOOLEAN := TRUE;
  v_i INTEGER;
BEGIN
  -- Validar projeto existe e está ativo
  SELECT status, nome INTO v_projeto_status, v_projeto_nome
  FROM projetos
  WHERE id = p_projeto_id AND workspace_id = p_workspace_id;

  IF v_projeto_status IS NULL THEN
    RETURN jsonb_build_object(
      'valid', false,
      'errors', jsonb_build_array(
        jsonb_build_object(
          'code', 'PROJETO_NOT_FOUND',
          'message', 'Projeto não encontrado'
        )
      ),
      'validations', '[]'::JSONB
    );
  END IF;

  IF v_projeto_status NOT IN ('EM_ANDAMENTO', 'PLANEJADO') THEN
    RETURN jsonb_build_object(
      'valid', false,
      'errors', jsonb_build_array(
        jsonb_build_object(
          'code', 'PROJETO_INATIVO',
          'message', format('Projeto "%s" não está ativo (status: %s)', v_projeto_nome, v_projeto_status)
        )
      ),
      'validations', '[]'::JSONB
    );
  END IF;

  -- Validar cada bookmaker
  FOR v_i IN 1..COALESCE(array_length(p_bookmaker_ids, 1), 0) LOOP
    SELECT id, nome, status, saldo_atual, projeto_id
    INTO v_bookmaker
    FROM bookmakers
    WHERE id = p_bookmaker_ids[v_i] AND workspace_id = p_workspace_id
    FOR UPDATE;

    IF v_bookmaker IS NULL THEN
      v_validations := v_validations || jsonb_build_object(
        'bookmaker_id', p_bookmaker_ids[v_i],
        'valid', false,
        'error', 'BOOKMAKER_NOT_FOUND',
        'message', 'Casa de aposta não encontrada'
      );
      v_all_valid := FALSE;
      CONTINUE;
    END IF;

    -- Verificar status ativo
    IF v_bookmaker.status NOT IN ('ATIVO', 'OPERANDO', 'AGUARDANDO_SAQUE') THEN
      v_validations := v_validations || jsonb_build_object(
        'bookmaker_id', v_bookmaker.id,
        'bookmaker_nome', v_bookmaker.nome,
        'valid', false,
        'error', 'BOOKMAKER_INATIVO',
        'message', format('Casa "%s" não está ativa', v_bookmaker.nome)
      );
      v_all_valid := FALSE;
      CONTINUE;
    END IF;

    -- Verificar saldo
    IF p_stakes[v_i] IS NOT NULL AND v_bookmaker.saldo_atual < p_stakes[v_i] THEN
      v_validations := v_validations || jsonb_build_object(
        'bookmaker_id', v_bookmaker.id,
        'bookmaker_nome', v_bookmaker.nome,
        'valid', false,
        'error', 'SALDO_INSUFICIENTE',
        'saldo_atual', v_bookmaker.saldo_atual,
        'stake', p_stakes[v_i],
        'message', format('Saldo insuficiente: R$ %.2f disponível, R$ %.2f necessário', 
          v_bookmaker.saldo_atual, p_stakes[v_i])
      );
      v_all_valid := FALSE;
      CONTINUE;
    END IF;

    -- Bookmaker válido
    v_validations := v_validations || jsonb_build_object(
      'bookmaker_id', v_bookmaker.id,
      'bookmaker_nome', v_bookmaker.nome,
      'valid', true,
      'saldo_atual', v_bookmaker.saldo_atual,
      'stake', p_stakes[v_i],
      'saldo_pos_reserva', v_bookmaker.saldo_atual - COALESCE(p_stakes[v_i], 0)
    );
  END LOOP;

  RETURN jsonb_build_object(
    'valid', v_all_valid,
    'errors', CASE WHEN v_all_valid THEN '[]'::JSONB ELSE NULL END,
    'validations', v_validations
  );
END;
$$;

-- 3. Corrigir criar_aposta_atomica
CREATE OR REPLACE FUNCTION public.criar_aposta_atomica(
  p_workspace_id UUID,
  p_projeto_id UUID,
  p_user_id UUID,
  p_aposta_data JSONB,
  p_pernas_data JSONB DEFAULT NULL,
  p_atualizar_saldos BOOLEAN DEFAULT TRUE
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_aposta_id UUID;
  v_projeto_nome TEXT;
  v_perna JSONB;
  v_bookmaker_id UUID;
  v_stake NUMERIC;
  v_saldo_atual NUMERIC;
BEGIN
  -- Validar projeto existe e está ativo (CORRIGIDO: aceitar EM_ANDAMENTO e PLANEJADO)
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
    id,
    workspace_id,
    projeto_id,
    user_id,
    data_aposta,
    forma_registro,
    estrategia,
    contexto_operacional,
    evento,
    mercado,
    esporte,
    bookmaker_id,
    selecao,
    odd,
    stake,
    stake_real,
    stake_bonus,
    lucro_esperado,
    status,
    observacoes,
    modo_entrada,
    lay_exchange,
    lay_odd,
    lay_stake,
    lay_liability,
    lay_comissao,
    back_comissao,
    back_em_exchange,
    modelo,
    tipo_freebet,
    is_bonus_bet,
    bonus_id,
    lado_aposta
  )
  VALUES (
    COALESCE((p_aposta_data->>'id')::UUID, gen_random_uuid()),
    p_workspace_id,
    p_projeto_id,
    p_user_id,
    COALESCE((p_aposta_data->>'data_aposta')::DATE, CURRENT_DATE),
    COALESCE(p_aposta_data->>'forma_registro', 'SIMPLES'),
    COALESCE(p_aposta_data->>'estrategia', 'PUNTER'),
    COALESCE(p_aposta_data->>'contexto_operacional', 'NORMAL'),
    p_aposta_data->>'evento',
    p_aposta_data->>'mercado',
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
        aposta_id,
        bookmaker_id,
        selecao,
        selecao_livre,
        odd,
        stake,
        moeda,
        ordem
      )
      VALUES (
        v_aposta_id,
        v_bookmaker_id,
        COALESCE(v_perna->>'selecao', 'BACK'),
        v_perna->>'selecao_livre',
        (v_perna->>'odd')::NUMERIC,
        v_stake,
        COALESCE(v_perna->>'moeda', 'BRL'),
        COALESCE((v_perna->>'ordem')::INTEGER, 1)
      );

      -- Atualizar saldo do bookmaker se solicitado
      IF p_atualizar_saldos AND v_stake IS NOT NULL AND v_stake > 0 THEN
        UPDATE bookmakers
        SET saldo_atual = saldo_atual - v_stake,
            updated_at = NOW()
        WHERE id = v_bookmaker_id
        RETURNING saldo_atual INTO v_saldo_atual;
      END IF;
    END LOOP;
  ELSIF p_atualizar_saldos THEN
    -- Aposta simples - atualizar saldo do bookmaker principal
    v_bookmaker_id := (p_aposta_data->>'bookmaker_id')::UUID;
    v_stake := (p_aposta_data->>'stake')::NUMERIC;
    
    IF v_bookmaker_id IS NOT NULL AND v_stake IS NOT NULL AND v_stake > 0 THEN
      UPDATE bookmakers
      SET saldo_atual = saldo_atual - v_stake,
          updated_at = NOW()
      WHERE id = v_bookmaker_id;
    END IF;
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'aposta_id', v_aposta_id
  );
END;
$$;