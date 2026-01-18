-- Corrigir a função processar_bonus_aposta para aceitar status EM_ANDAMENTO e PLANEJADO
CREATE OR REPLACE FUNCTION public.processar_bonus_aposta(
  p_aposta_id UUID,
  p_bonus_id UUID,
  p_bookmaker_id UUID,
  p_stake_bonus NUMERIC,
  p_resultado TEXT,
  p_lucro_prejuizo NUMERIC DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_bonus RECORD;
  v_bookmaker RECORD;
  v_projeto_id UUID;
  v_workspace_id UUID;
  v_user_id UUID;
  v_valor_retorno NUMERIC;
  v_lucro_real NUMERIC;
  v_ledger_id UUID;
  v_aposta_record RECORD;
BEGIN
  -- Buscar dados da aposta
  SELECT projeto_id, workspace_id, user_id, retorno_potencial
  INTO v_projeto_id, v_workspace_id, v_user_id, v_valor_retorno
  FROM apostas_unificada
  WHERE id = p_aposta_id;
  
  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'APOSTA_NAO_ENCONTRADA',
      'message', 'Aposta não encontrada'
    );
  END IF;
  
  -- Validar projeto ativo (CORRIGIDO: aceitar EM_ANDAMENTO e PLANEJADO)
  IF NOT EXISTS (
    SELECT 1 FROM projetos 
    WHERE id = v_projeto_id 
    AND status IN ('EM_ANDAMENTO', 'PLANEJADO')
  ) THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'PROJETO_INATIVO',
      'message', 'Projeto não está ativo'
    );
  END IF;
  
  -- Buscar dados do bônus
  SELECT * INTO v_bonus
  FROM project_bookmaker_link_bonuses
  WHERE id = p_bonus_id;
  
  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'BONUS_NAO_ENCONTRADO',
      'message', 'Bônus não encontrado'
    );
  END IF;
  
  -- Buscar dados do bookmaker
  SELECT * INTO v_bookmaker
  FROM bookmakers
  WHERE id = p_bookmaker_id;
  
  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'BOOKMAKER_NAO_ENCONTRADO',
      'message', 'Bookmaker não encontrada'
    );
  END IF;
  
  -- Se resultado é pendente, apenas retornar sucesso sem processar
  IF p_resultado IS NULL OR p_resultado = 'PENDENTE' THEN
    RETURN jsonb_build_object(
      'success', true,
      'message', 'Aposta com bônus registrada, aguardando resultado',
      'bonus_id', p_bonus_id,
      'status', 'PENDENTE'
    );
  END IF;
  
  -- Calcular lucro real baseado no resultado
  CASE p_resultado
    WHEN 'GREEN' THEN
      v_lucro_real := COALESCE(p_lucro_prejuizo, v_valor_retorno - p_stake_bonus);
    WHEN 'RED' THEN
      v_lucro_real := COALESCE(p_lucro_prejuizo, -p_stake_bonus);
    WHEN 'HALF_GREEN' THEN
      v_lucro_real := COALESCE(p_lucro_prejuizo, (v_valor_retorno - p_stake_bonus) / 2);
    WHEN 'HALF_RED' THEN
      v_lucro_real := COALESCE(p_lucro_prejuizo, -p_stake_bonus / 2);
    WHEN 'VOID' THEN
      v_lucro_real := 0;
    ELSE
      v_lucro_real := COALESCE(p_lucro_prejuizo, 0);
  END CASE;
  
  -- Atualizar status do bônus para usado
  UPDATE project_bookmaker_link_bonuses
  SET 
    status = 'USADO',
    data_uso = NOW(),
    updated_at = NOW()
  WHERE id = p_bonus_id;
  
  -- Se ganhou, creditar o retorno no saldo do bookmaker
  IF p_resultado IN ('GREEN', 'HALF_GREEN') AND v_lucro_real > 0 THEN
    UPDATE bookmakers
    SET 
      saldo_atual = saldo_atual + v_lucro_real + p_stake_bonus,
      updated_at = NOW()
    WHERE id = p_bookmaker_id;
    
    -- Criar entrada no ledger para o crédito
    INSERT INTO cash_ledger (
      workspace_id,
      user_id,
      tipo_transacao,
      tipo_moeda,
      moeda,
      valor,
      data_transacao,
      status,
      destino_bookmaker_id,
      destino_tipo,
      descricao,
      impacta_caixa_operacional,
      evento_promocional_tipo
    ) VALUES (
      v_workspace_id,
      v_user_id,
      'CREDITO_BONUS',
      'FIAT',
      v_bookmaker.moeda,
      v_lucro_real + p_stake_bonus,
      NOW(),
      'CONFIRMADO',
      p_bookmaker_id,
      'BOOKMAKER',
      'Retorno de aposta com bônus - ' || p_resultado,
      true,
      'BONUS_APOSTA'
    )
    RETURNING id INTO v_ledger_id;
  END IF;
  
  RETURN jsonb_build_object(
    'success', true,
    'message', 'Bônus processado com sucesso',
    'bonus_id', p_bonus_id,
    'resultado', p_resultado,
    'lucro_real', v_lucro_real,
    'ledger_id', v_ledger_id
  );
  
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object(
    'success', false,
    'error', 'ERRO_PROCESSAMENTO',
    'message', SQLERRM
  );
END;
$$;