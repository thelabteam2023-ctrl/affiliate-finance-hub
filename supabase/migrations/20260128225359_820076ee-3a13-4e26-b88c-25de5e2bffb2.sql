-- ============================================================
-- MOTOR FINANCEIRO v9.5 - REMOÇÃO DE DOUBLE-WRITE
-- ============================================================
-- PROBLEMA: criar_aposta_atomica_v3 faz INSERT em financial_events (que dispara
-- o trigger de atualização de saldo) E depois faz UPDATE manual em bookmakers.
-- Resultado: stake é debitado 2x.
--
-- CORREÇÃO: Remover todos os UPDATEs manuais. O trigger é a única SST.
-- ============================================================

-- PARTE 1: CORRIGIR criar_aposta_atomica_v3

CREATE OR REPLACE FUNCTION criar_aposta_atomica_v3(
  p_workspace_id UUID,
  p_user_id UUID,
  p_projeto_id UUID,
  p_bookmaker_id UUID,
  p_stake NUMERIC,
  p_odd NUMERIC,
  p_selecao TEXT,
  p_estrategia TEXT DEFAULT 'PUNTER',
  p_forma_registro TEXT DEFAULT 'SIMPLES',
  p_fonte_saldo TEXT DEFAULT 'REAL',
  p_evento TEXT DEFAULT NULL,
  p_esporte TEXT DEFAULT NULL,
  p_mercado TEXT DEFAULT NULL,
  p_observacoes TEXT DEFAULT NULL,
  p_data_aposta TIMESTAMPTZ DEFAULT now()
)
RETURNS TABLE(
  success BOOLEAN,
  aposta_id UUID,
  event_id UUID,
  message TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_aposta_id UUID;
  v_event_id UUID;
  v_moeda TEXT;
  v_saldo_atual NUMERIC;
  v_saldo_freebet NUMERIC;
  v_tipo_uso TEXT;
  v_tipo_evento TEXT;
BEGIN
  -- Determinar tipo de saldo a usar
  IF p_fonte_saldo = 'FREEBET' THEN
    v_tipo_uso := 'FREEBET';
    v_tipo_evento := 'FREEBET_STAKE';
  ELSE
    v_tipo_uso := 'NORMAL';
    v_tipo_evento := 'STAKE';
  END IF;
  
  -- Buscar bookmaker e validar saldo
  SELECT moeda, saldo_atual, saldo_freebet INTO v_moeda, v_saldo_atual, v_saldo_freebet
  FROM bookmakers 
  WHERE id = p_bookmaker_id
  FOR UPDATE;
  
  IF v_moeda IS NULL THEN
    RETURN QUERY SELECT FALSE, NULL::UUID, NULL::UUID, 'Bookmaker não encontrado'::TEXT;
    RETURN;
  END IF;
  
  -- Validar saldo
  IF v_tipo_uso = 'FREEBET' THEN
    IF v_saldo_freebet < p_stake THEN
      RETURN QUERY SELECT FALSE, NULL::UUID, NULL::UUID, 
        format('Saldo freebet insuficiente: %.2f disponível', v_saldo_freebet)::TEXT;
      RETURN;
    END IF;
  ELSE
    IF v_saldo_atual < p_stake THEN
      RETURN QUERY SELECT FALSE, NULL::UUID, NULL::UUID,
        format('Saldo insuficiente: %.2f disponível', v_saldo_atual)::TEXT;
      RETURN;
    END IF;
  END IF;
  
  -- Criar aposta
  INSERT INTO apostas_unificada (
    workspace_id, user_id, projeto_id, bookmaker_id,
    stake, odd, selecao, estrategia, forma_registro,
    fonte_saldo, usar_freebet, evento, esporte, mercado, observacoes,
    data_aposta, status, resultado, moeda_operacao
  ) VALUES (
    p_workspace_id, p_user_id, p_projeto_id, p_bookmaker_id,
    p_stake, p_odd, p_selecao, p_estrategia, p_forma_registro,
    p_fonte_saldo, p_fonte_saldo = 'FREEBET', p_evento, p_esporte, p_mercado, p_observacoes,
    p_data_aposta, 'PENDENTE', 'PENDENTE', v_moeda
  ) RETURNING id INTO v_aposta_id;
  
  -- ============================================================
  -- MOTOR FINANCEIRO v9.5:
  -- Apenas INSERT em financial_events. O trigger tr_financial_events_sync_balance
  -- é a ÚNICA fonte de verdade que atualiza bookmakers.saldo_atual/saldo_freebet.
  -- NÃO fazer UPDATE manual aqui.
  -- ============================================================
  INSERT INTO financial_events (
    bookmaker_id, aposta_id, workspace_id, tipo_evento, tipo_uso,
    valor, moeda, idempotency_key, descricao, processed_at, created_by
  ) VALUES (
    p_bookmaker_id, v_aposta_id, p_workspace_id, v_tipo_evento, v_tipo_uso,
    -p_stake, -- Valor NEGATIVO = débito
    v_moeda, 'stake_' || v_aposta_id::TEXT, 
    'Débito de stake para aposta', now(), p_user_id
  ) RETURNING id INTO v_event_id;
  
  -- REMOVIDO: UPDATE bookmakers SET saldo_atual = saldo_atual - p_stake
  -- O trigger tr_financial_events_sync_balance cuida disso automaticamente!
  
  RETURN QUERY SELECT TRUE, v_aposta_id, v_event_id, 'Aposta criada com débito via Motor v9.5'::TEXT;
END;
$$;

COMMENT ON FUNCTION criar_aposta_atomica_v3 IS 
'[MOTOR FINANCEIRO v9.5] Cria aposta e debita stake via financial_events.
CORREÇÃO: Removido UPDATE manual em bookmakers - o trigger é a única SST.
Double-write eliminado.';

GRANT EXECUTE ON FUNCTION criar_aposta_atomica_v3 TO authenticated;