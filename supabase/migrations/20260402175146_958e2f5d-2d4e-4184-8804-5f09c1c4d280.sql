-- Fix criar_aposta_atomica (2-param version) to populate stake_real
-- Without this, get_bookmaker_saldos calculates saldo_em_aposta = 0

CREATE OR REPLACE FUNCTION public.criar_aposta_atomica(
  p_aposta_data jsonb, 
  p_pernas_data jsonb DEFAULT NULL::jsonb
)
RETURNS jsonb
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

  -- Inserir aposta principal com stake_real preenchido
  INSERT INTO apostas_unificada (
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
    v_total_stake,  -- stake_real = total (será freebet=0 por padrão)
    0,              -- stake_freebet = 0
    (p_aposta_data->>'lucro_esperado')::NUMERIC,
    (p_aposta_data->>'roi_esperado')::NUMERIC,
    NOW(), NOW()
  )
  RETURNING id INTO v_aposta_id;

  -- Inserir pernas com stake_real preenchido
  v_perna_ordem := 1;
  FOR v_perna IN SELECT * FROM jsonb_array_elements(COALESCE(p_pernas_data, '[]'::jsonb))
  LOOP
    v_bookmaker_id := (v_perna->>'bookmaker_id')::UUID;
    v_stake := COALESCE((v_perna->>'stake')::NUMERIC, 0);
    v_is_freebet := COALESCE((v_perna->>'is_freebet')::BOOLEAN, false);
    
    -- Calcular split real/freebet
    IF v_is_freebet THEN
      v_stake_freebet := v_stake;
      v_stake_real := 0;
    ELSE
      v_stake_freebet := 0;
      v_stake_real := v_stake;
    END IF;

    INSERT INTO apostas_pernas (
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
$$;

-- Also fix existing orphan data: update pernas where stake_real=0 but stake>0
UPDATE apostas_pernas 
SET stake_real = stake, stake_freebet = 0
WHERE stake_real = 0 AND stake > 0 AND stake_freebet = 0
  AND fonte_saldo IS DISTINCT FROM 'FREEBET';

-- Fix apostas_unificada where stake_real is null/0 but stake_total > 0
UPDATE apostas_unificada
SET stake_real = COALESCE(stake_total, stake, 0)
WHERE COALESCE(stake_real, 0) = 0 
  AND COALESCE(stake_total, stake, 0) > 0
  AND stake_freebet = 0
  AND status = 'PENDENTE';