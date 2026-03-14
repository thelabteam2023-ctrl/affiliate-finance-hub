
CREATE OR REPLACE FUNCTION public.desvincular_bookmaker_atomico(
  p_bookmaker_id UUID,
  p_projeto_id UUID,
  p_user_id UUID,
  p_workspace_id UUID,
  p_status_final TEXT,
  p_saldo_virtual_efetivo NUMERIC,
  p_moeda TEXT,
  p_marcar_para_saque BOOLEAN DEFAULT false,
  p_is_investor_account BOOLEAN DEFAULT false
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_saque_virtual_id UUID;
  v_current_projeto_id UUID;
  v_recent_sv_count INTEGER;
  v_sv_status TEXT;
BEGIN
  -- 1. LOCK: Verificar que a bookmaker ainda está vinculada ao projeto esperado
  SELECT projeto_id INTO v_current_projeto_id
  FROM bookmakers
  WHERE id = p_bookmaker_id
  FOR UPDATE;

  IF v_current_projeto_id IS NULL THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Bookmaker já está desvinculada',
      'code', 'ALREADY_UNLINKED'
    );
  END IF;

  IF v_current_projeto_id != p_projeto_id THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Bookmaker está vinculada a outro projeto',
      'code', 'WRONG_PROJECT'
    );
  END IF;

  -- 2. Proteção contra duplicata: verificar SAQUE_VIRTUAL recente (< 10s)
  SELECT COUNT(*) INTO v_recent_sv_count
  FROM cash_ledger
  WHERE origem_bookmaker_id = p_bookmaker_id
    AND tipo_transacao = 'SAQUE_VIRTUAL'
    AND created_at >= (NOW() - INTERVAL '10 seconds');

  IF v_recent_sv_count > 0 THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'SAQUE_VIRTUAL duplicado detectado (operação recente). Aguarde e tente novamente.',
      'code', 'DUPLICATE_DETECTED'
    );
  END IF;

  -- 3. TRAVAR projeto_id_snapshot em transações PENDENTES
  UPDATE cash_ledger
  SET projeto_id_snapshot = p_projeto_id
  WHERE (origem_bookmaker_id = p_bookmaker_id OR destino_bookmaker_id = p_bookmaker_id)
    AND status = 'PENDENTE'
    AND projeto_id_snapshot IS NULL;

  UPDATE cash_ledger
  SET projeto_id_snapshot = p_projeto_id
  WHERE (origem_bookmaker_id = p_bookmaker_id OR destino_bookmaker_id = p_bookmaker_id)
    AND status = 'LIQUIDADO'
    AND projeto_id_snapshot IS NULL;

  -- 4. Determinar status do SAQUE_VIRTUAL
  -- Contas internas: CONFIRMADO (saldo já é nosso)
  -- Contas de investidor: PENDENTE (dinheiro ainda precisa ser devolvido)
  v_sv_status := CASE WHEN p_is_investor_account THEN 'PENDENTE' ELSE 'CONFIRMADO' END;

  -- 5. Criar SAQUE_VIRTUAL (se saldo > 0)
  IF p_saldo_virtual_efetivo > 0 THEN
    INSERT INTO cash_ledger (
      tipo_transacao, valor, moeda, workspace_id, user_id,
      origem_bookmaker_id, valor_origem, descricao, data_transacao,
      impacta_caixa_operacional, tipo_moeda, status, projeto_id_snapshot,
      auditoria_metadata
    ) VALUES (
      'SAQUE_VIRTUAL', p_saldo_virtual_efetivo, p_moeda, p_workspace_id, p_user_id,
      p_bookmaker_id, p_saldo_virtual_efetivo,
      'Saque virtual – desvinculação do projeto', CURRENT_DATE,
      false, 'FIAT', v_sv_status, p_projeto_id,
      jsonb_build_object(
        'tipo', 'saque_virtual_desvinculacao',
        'projeto_id', p_projeto_id,
        'saldo_snapshot', p_saldo_virtual_efetivo,
        'is_investor_account', p_is_investor_account
      )
    )
    RETURNING id INTO v_saque_virtual_id;
  END IF;

  -- 6. Desvincular bookmaker e atualizar estado_conta
  UPDATE bookmakers
  SET projeto_id = NULL,
      status = p_status_final,
      estado_conta = CASE
        WHEN p_status_final IN ('limitada', 'bloqueada', 'encerrada') THEN p_status_final
        ELSE COALESCE(estado_conta, 'ativo')
      END
  WHERE id = p_bookmaker_id;

  -- 7. Se marcar para saque, definir timestamp
  IF p_marcar_para_saque AND p_saldo_virtual_efetivo > 0 THEN
    UPDATE bookmakers
    SET aguardando_saque_at = NOW()
    WHERE id = p_bookmaker_id;
  END IF;

  -- 8. Atualizar histórico
  UPDATE projeto_bookmaker_historico
  SET data_desvinculacao = NOW(),
      status_final = p_status_final
  WHERE projeto_id = p_projeto_id
    AND bookmaker_id = p_bookmaker_id
    AND data_desvinculacao IS NULL;

  RETURN jsonb_build_object(
    'success', true,
    'saque_virtual_id', v_saque_virtual_id,
    'saldo_virtual', p_saldo_virtual_efetivo,
    'status_final', p_status_final,
    'sv_status', v_sv_status
  );
END;
$$;
