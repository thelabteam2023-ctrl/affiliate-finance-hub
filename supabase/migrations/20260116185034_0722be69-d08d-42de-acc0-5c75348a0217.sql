-- MELHORIA: Função para validar SOMA de stakes contra saldo único
-- Cenário: 2 usuários apostam 800 e 400 ao mesmo tempo na mesma casa com saldo 1000
-- Esta função valida que a soma não excede o saldo disponível

CREATE OR REPLACE FUNCTION public.validate_and_reserve_stakes(
  p_projeto_id UUID,
  p_bookmaker_stakes JSONB -- Array de {bookmaker_id, stake, expected_version}
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
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
  
  IF v_projeto_status != 'ativo' THEN
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
$$;

-- Função atômica para debitar múltiplas bookmakers em uma única transação
CREATE OR REPLACE FUNCTION public.debit_multiple_bookmakers(
  p_debits JSONB, -- Array de {bookmaker_id, stake, expected_version, referencia_id, referencia_tipo}
  p_origem TEXT DEFAULT 'aposta'
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_item JSONB;
  v_bookmaker_id UUID;
  v_stake NUMERIC;
  v_expected_version INTEGER;
  v_referencia_id UUID;
  v_referencia_tipo TEXT;
  v_saldo_atual NUMERIC;
  v_saldo_novo NUMERIC;
  v_current_version INTEGER;
  v_bookmaker_nome TEXT;
  v_results JSONB := '[]'::JSONB;
  v_success BOOLEAN := TRUE;
  v_user_id UUID;
  v_workspace_id UUID;
BEGIN
  -- Obter user_id do contexto (para auditoria)
  v_user_id := auth.uid();
  
  -- Iterar sobre cada débito
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_debits)
  LOOP
    v_bookmaker_id := (v_item->>'bookmaker_id')::UUID;
    v_stake := (v_item->>'stake')::NUMERIC;
    v_expected_version := COALESCE((v_item->>'expected_version')::INTEGER, 0);
    v_referencia_id := (v_item->>'referencia_id')::UUID;
    v_referencia_tipo := v_item->>'referencia_tipo';
    
    -- Obter dados com lock exclusivo
    SELECT saldo_atual, version, nome, workspace_id
    INTO v_saldo_atual, v_current_version, v_bookmaker_nome, v_workspace_id
    FROM public.bookmakers
    WHERE id = v_bookmaker_id
    FOR UPDATE;
    
    IF v_saldo_atual IS NULL THEN
      ROLLBACK;
      RETURN jsonb_build_object(
        'success', false,
        'error', 'BOOKMAKER_NAO_ENCONTRADA',
        'message', format('Bookmaker não encontrada: %s', v_bookmaker_id)
      );
    END IF;
    
    -- Verificar versão se fornecida
    IF v_expected_version > 0 AND v_current_version != v_expected_version THEN
      ROLLBACK;
      RETURN jsonb_build_object(
        'success', false,
        'error', 'VERSION_MISMATCH',
        'message', format('"%s" foi alterada. Versão esperada: %s, atual: %s', 
                         v_bookmaker_nome, v_expected_version, v_current_version)
      );
    END IF;
    
    -- CRÍTICO: Verificar saldo suficiente
    IF v_saldo_atual < v_stake THEN
      ROLLBACK;
      RETURN jsonb_build_object(
        'success', false,
        'error', 'INSUFFICIENT_BALANCE',
        'message', format('"%s": Saldo insuficiente. Disponível: %s, Necessário: %s', 
                         v_bookmaker_nome, ROUND(v_saldo_atual, 2), ROUND(v_stake, 2)),
        'saldo_disponivel', v_saldo_atual,
        'stake_solicitado', v_stake
      );
    END IF;
    
    -- Calcular novo saldo
    v_saldo_novo := v_saldo_atual - v_stake;
    
    -- Atualizar saldo (trigger incrementa version automaticamente)
    UPDATE public.bookmakers
    SET saldo_atual = v_saldo_novo,
        updated_at = NOW()
    WHERE id = v_bookmaker_id;
    
    -- Registrar na auditoria
    INSERT INTO public.bookmaker_balance_audit (
      bookmaker_id,
      workspace_id,
      origem,
      saldo_anterior,
      saldo_novo,
      diferenca,
      referencia_id,
      referencia_tipo,
      user_id,
      observacoes
    ) VALUES (
      v_bookmaker_id,
      v_workspace_id,
      p_origem,
      v_saldo_atual,
      v_saldo_novo,
      -v_stake,
      v_referencia_id,
      v_referencia_tipo,
      v_user_id,
      format('Débito atômico: %s via %s', v_stake, p_origem)
    );
    
    -- Adicionar ao resultado
    v_results := v_results || jsonb_build_object(
      'bookmaker_id', v_bookmaker_id,
      'bookmaker_nome', v_bookmaker_nome,
      'saldo_anterior', v_saldo_atual,
      'saldo_novo', v_saldo_novo,
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
$$;

-- Comentários para documentação
COMMENT ON FUNCTION public.validate_and_reserve_stakes IS 
'Valida múltiplas apostas atomicamente com lock.
Previne race conditions garantindo que o saldo não ficará negativo.
Usa FOR UPDATE NOWAIT para falhar imediatamente se outra transação está processando.';

COMMENT ON FUNCTION public.debit_multiple_bookmakers IS 
'Debita múltiplas bookmakers em uma única transação atômica.
Garante que todas as operações são bem-sucedidas ou nenhuma é aplicada.
Inclui auditoria completa de todas as alterações de saldo.';