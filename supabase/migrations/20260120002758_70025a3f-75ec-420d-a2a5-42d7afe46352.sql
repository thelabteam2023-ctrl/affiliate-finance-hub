-- Corrigir validação de status do projeto na função validate_and_reserve_stakes
-- O problema: validação antiga procurava status = 'ativo', mas os projetos agora usam 'EM_ANDAMENTO' e 'PLANEJADO'

CREATE OR REPLACE FUNCTION public.validate_and_reserve_stakes(
  p_projeto_id UUID,
  p_bookmaker_stakes JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_item JSONB;
  v_bookmaker_id UUID;
  v_stake NUMERIC;
  v_expected_version INTEGER;
  v_saldo_atual NUMERIC;
  v_current_version INTEGER;
  v_projeto_status TEXT;
  v_projeto_nome TEXT;
  v_bookmaker_nome TEXT;
  v_bookmaker_projeto_id UUID;
  v_errors JSONB := '[]'::JSONB;
  v_validations JSONB := '[]'::JSONB;
  v_is_valid BOOLEAN := TRUE;
BEGIN
  -- 1. Validar projeto
  SELECT status, nome INTO v_projeto_status, v_projeto_nome
  FROM public.projetos
  WHERE id = p_projeto_id;
  
  IF v_projeto_status IS NULL THEN
    RETURN jsonb_build_object(
      'valid', false,
      'errors', jsonb_build_array(
        jsonb_build_object(
          'code', 'PROJETO_NAO_ENCONTRADO',
          'message', 'Projeto não encontrado no sistema'
        )
      ),
      'validations', '[]'::JSONB
    );
  END IF;
  
  -- CORRIGIDO: Aceitar EM_ANDAMENTO e PLANEJADO como status ativos
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

  -- 2. Iterar sobre cada bookmaker e validar com LOCK
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_bookmaker_stakes)
  LOOP
    v_bookmaker_id := (v_item->>'bookmaker_id')::UUID;
    v_stake := (v_item->>'stake')::NUMERIC;
    v_expected_version := COALESCE((v_item->>'expected_version')::INTEGER, 0);
    
    -- Obter dados com lock para prevenir leitura paralela
    SELECT saldo_atual, version, nome, projeto_id
    INTO v_saldo_atual, v_current_version, v_bookmaker_nome, v_bookmaker_projeto_id
    FROM public.bookmakers
    WHERE id = v_bookmaker_id
    FOR UPDATE NOWAIT; -- NOWAIT falha imediatamente se linha está locked
    
    IF v_saldo_atual IS NULL THEN
      v_is_valid := FALSE;
      v_errors := v_errors || jsonb_build_object(
        'code', 'BOOKMAKER_NAO_ENCONTRADA',
        'message', format('Bookmaker não encontrada: %s', v_bookmaker_id),
        'bookmaker_id', v_bookmaker_id
      );
      CONTINUE;
    END IF;
    
    -- Verificar vínculo com projeto
    IF v_bookmaker_projeto_id IS NULL OR v_bookmaker_projeto_id != p_projeto_id THEN
      v_is_valid := FALSE;
      v_errors := v_errors || jsonb_build_object(
        'code', 'BOOKMAKER_NAO_VINCULADA',
        'message', format('"%s" não está vinculada a este projeto', v_bookmaker_nome),
        'bookmaker_id', v_bookmaker_id
      );
      CONTINUE;
    END IF;
    
    -- Verificar controle de versão (se fornecido)
    IF v_expected_version > 0 AND v_current_version != v_expected_version THEN
      v_is_valid := FALSE;
      v_errors := v_errors || jsonb_build_object(
        'code', 'VERSAO_DESATUALIZADA',
        'message', format('"%s" foi modificada por outro processo. Atualize e tente novamente.', v_bookmaker_nome),
        'bookmaker_id', v_bookmaker_id,
        'expected_version', v_expected_version,
        'current_version', v_current_version
      );
      CONTINUE;
    END IF;
    
    -- CRÍTICO: Verificar se saldo suficiente (não pode ficar negativo)
    IF v_saldo_atual < v_stake THEN
      v_is_valid := FALSE;
      v_errors := v_errors || jsonb_build_object(
        'code', 'SALDO_INSUFICIENTE',
        'message', format('"%s": Saldo insuficiente (Disponível: %s, Necessário: %s)', 
                         v_bookmaker_nome, 
                         ROUND(v_saldo_atual, 2), 
                         ROUND(v_stake, 2)),
        'bookmaker_id', v_bookmaker_id,
        'saldo_atual', v_saldo_atual,
        'stake_necessario', v_stake
      );
    END IF;
    
    -- Registrar validação
    v_validations := v_validations || jsonb_build_object(
      'bookmaker_id', v_bookmaker_id,
      'bookmaker_nome', v_bookmaker_nome,
      'saldo_atual', v_saldo_atual,
      'stake_necessario', v_stake,
      'saldo_restante', v_saldo_atual - v_stake,
      'version', v_current_version,
      'valid', (v_saldo_atual >= v_stake)
    );
  END LOOP;

  RETURN jsonb_build_object(
    'valid', v_is_valid,
    'errors', v_errors,
    'validations', v_validations,
    'projeto', jsonb_build_object('id', p_projeto_id, 'nome', v_projeto_nome, 'status', v_projeto_status),
    'timestamp', NOW()
  );
  
EXCEPTION
  WHEN lock_not_available THEN
    -- Outra transação está processando esta bookmaker
    RETURN jsonb_build_object(
      'valid', false,
      'errors', jsonb_build_array(
        jsonb_build_object(
          'code', 'OPERACAO_EM_ANDAMENTO',
          'message', 'Outra operação está em andamento nesta casa de apostas. Aguarde e tente novamente.'
        )
      ),
      'validations', '[]'::JSONB
    );
END;
$function$;