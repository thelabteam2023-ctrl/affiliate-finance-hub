
-- ============================================================================
-- CORREÇÃO CRÍTICA: Double-Write Bug na criar_surebet_atomica
-- ============================================================================
-- BUG: A RPC inseria eventos STAKE com valor POSITIVO e fazia UPDATE manual
-- em bookmakers.saldo_atual. O trigger fn_financial_events_sync_balance também
-- atualiza o saldo, resultando em:
--   trigger: saldo += +100 (CRÉDITO errado!)
--   manual:  saldo -= 100  (débito manual)
--   NET: 0 (saldo NÃO muda — deveria diminuir 100)
--
-- CORREÇÃO:
-- 1. RPC: usar valor NEGATIVO para STAKE e REMOVER UPDATE manual
-- 2. Histórico: corrigir sinal dos eventos e ajustar saldos
-- ============================================================================

-- ============================================================================
-- PARTE 1: Corrigir RPC criar_surebet_atomica
-- ============================================================================
CREATE OR REPLACE FUNCTION criar_surebet_atomica(
  p_workspace_id UUID,
  p_user_id UUID,
  p_projeto_id UUID,
  p_evento TEXT,
  p_esporte TEXT DEFAULT 'Futebol',
  p_mercado TEXT DEFAULT NULL,
  p_modelo TEXT DEFAULT '1-X-2',
  p_estrategia TEXT DEFAULT 'SUREBET',
  p_contexto_operacional TEXT DEFAULT 'NORMAL',
  p_data_aposta TIMESTAMPTZ DEFAULT NOW(),
  p_pernas JSONB DEFAULT '[]'::JSONB
)
RETURNS TABLE(
  success BOOLEAN,
  aposta_id UUID,
  events_created INTEGER,
  message TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public
AS $$
DECLARE
  v_aposta_id UUID;
  v_perna JSONB;
  v_perna_idx INTEGER := 0;
  v_bookmaker_id UUID;
  v_stake NUMERIC;
  v_odd NUMERIC;
  v_moeda TEXT;
  v_selecao TEXT;
  v_selecao_livre TEXT;
  v_saldo_atual NUMERIC;
  v_bookmaker_status TEXT;
  v_stake_total NUMERIC := 0;
  v_events_created INTEGER := 0;
  v_perna_id UUID;
  v_event_id UUID;
  v_roi_esperado NUMERIC;
  v_lucro_esperado NUMERIC;
  v_inverse_sum NUMERIC := 0;
  v_cotacao_snapshot NUMERIC;
  v_stake_brl_referencia NUMERIC;
BEGIN
  -- ================================================================
  -- ETAPA 1: VALIDAR TODAS AS PERNAS
  -- ================================================================
  
  IF jsonb_array_length(p_pernas) < 2 THEN
    RETURN QUERY SELECT 
      FALSE::BOOLEAN, NULL::UUID, 0::INTEGER, 
      'Surebet requer no mínimo 2 pernas'::TEXT;
    RETURN;
  END IF;

  FOR v_perna IN SELECT * FROM jsonb_array_elements(p_pernas)
  LOOP
    v_perna_idx := v_perna_idx + 1;
    v_bookmaker_id := (v_perna->>'bookmaker_id')::UUID;
    v_stake := (v_perna->>'stake')::NUMERIC;
    v_odd := (v_perna->>'odd')::NUMERIC;
    
    SELECT b.saldo_atual, b.status 
    INTO v_saldo_atual, v_bookmaker_status
    FROM bookmakers b
    WHERE b.id = v_bookmaker_id 
      AND b.workspace_id = p_workspace_id;
    
    IF NOT FOUND THEN
      RETURN QUERY SELECT 
        FALSE::BOOLEAN, NULL::UUID, 0::INTEGER, 
        format('Perna %s: Bookmaker não encontrada', v_perna_idx)::TEXT;
      RETURN;
    END IF;
    
    IF LOWER(v_bookmaker_status) NOT IN ('ativo', 'limitada') THEN
      RETURN QUERY SELECT 
        FALSE::BOOLEAN, NULL::UUID, 0::INTEGER, 
        format('Perna %s: Bookmaker com status "%s" não permite apostas', v_perna_idx, v_bookmaker_status)::TEXT;
      RETURN;
    END IF;
    
    IF v_stake > v_saldo_atual THEN
      RETURN QUERY SELECT 
        FALSE::BOOLEAN, NULL::UUID, 0::INTEGER, 
        format('Perna %s: Saldo insuficiente (stake: %s, disponível: %s)', v_perna_idx, v_stake, v_saldo_atual)::TEXT;
      RETURN;
    END IF;
    
    v_stake_total := v_stake_total + v_stake;
    v_inverse_sum := v_inverse_sum + (1.0 / v_odd);
  END LOOP;
  
  v_roi_esperado := (1.0 - v_inverse_sum) * 100;
  v_lucro_esperado := v_stake_total * (v_roi_esperado / 100);

  -- ================================================================
  -- ETAPA 2: INSERIR REGISTRO PAI
  -- ================================================================
  
  INSERT INTO apostas_unificada (
    workspace_id, user_id, projeto_id,
    forma_registro, estrategia, contexto_operacional,
    evento, esporte, mercado, modelo,
    data_aposta, stake_total, lucro_esperado, roi_esperado,
    status, resultado
  ) VALUES (
    p_workspace_id, p_user_id, p_projeto_id,
    'ARBITRAGEM', p_estrategia, p_contexto_operacional,
    p_evento, p_esporte, p_mercado, p_modelo,
    p_data_aposta, v_stake_total, v_lucro_esperado, v_roi_esperado,
    'PENDENTE', 'PENDENTE'
  )
  RETURNING id INTO v_aposta_id;

  -- ================================================================
  -- ETAPA 3: INSERIR PERNAS + GERAR EVENTOS STAKE
  -- CORREÇÃO v9.5: 
  --   - Valor NEGATIVO para STAKE (convenção v9.4)
  --   - SEM UPDATE manual em bookmakers (trigger cuida)
  -- ================================================================
  
  v_perna_idx := 0;
  
  FOR v_perna IN SELECT * FROM jsonb_array_elements(p_pernas)
  LOOP
    v_perna_idx := v_perna_idx + 1;
    v_bookmaker_id := (v_perna->>'bookmaker_id')::UUID;
    v_stake := (v_perna->>'stake')::NUMERIC;
    v_odd := (v_perna->>'odd')::NUMERIC;
    v_moeda := COALESCE(v_perna->>'moeda', 'BRL');
    v_selecao := COALESCE(v_perna->>'selecao', '');
    v_selecao_livre := v_perna->>'selecao_livre';
    v_cotacao_snapshot := (v_perna->>'cotacao_snapshot')::NUMERIC;
    v_stake_brl_referencia := (v_perna->>'stake_brl_referencia')::NUMERIC;
    
    -- Inserir perna
    INSERT INTO apostas_pernas (
      aposta_id, bookmaker_id, ordem, selecao, selecao_livre,
      odd, stake, moeda, cotacao_snapshot, stake_brl_referencia, resultado
    ) VALUES (
      v_aposta_id, v_bookmaker_id, v_perna_idx, v_selecao, v_selecao_livre,
      v_odd, v_stake, v_moeda, v_cotacao_snapshot, v_stake_brl_referencia, NULL
    )
    RETURNING id INTO v_perna_id;
    
    -- Gerar evento STAKE com valor NEGATIVO (convenção v9.4)
    INSERT INTO financial_events (
      bookmaker_id, aposta_id, workspace_id,
      tipo_evento, tipo_uso, origem, valor, moeda,
      idempotency_key, descricao, processed_at, created_by
    ) VALUES (
      v_bookmaker_id, v_aposta_id, p_workspace_id,
      'STAKE',
      CASE WHEN p_contexto_operacional = 'FREEBET' THEN 'FREEBET' ELSE 'NORMAL' END,
      'STAKE',
      -v_stake,  -- ✅ NEGATIVO (débito) — trigger aplica direto
      v_moeda,
      'stake_' || v_aposta_id || '_leg' || v_perna_idx,
      'Stake Surebet Perna ' || v_perna_idx,
      NOW(), p_user_id
    )
    RETURNING id INTO v_event_id;
    
    -- ❌ REMOVIDO: UPDATE direto em bookmakers (causava double write)
    -- O trigger fn_financial_events_sync_balance é o ÚNICO responsável
    
    v_events_created := v_events_created + 1;
  END LOOP;

  RETURN QUERY SELECT 
    TRUE::BOOLEAN, v_aposta_id, v_events_created,
    format('Surebet criada com %s pernas', v_events_created)::TEXT;
    
EXCEPTION
  WHEN OTHERS THEN
    RETURN QUERY SELECT 
      FALSE::BOOLEAN, NULL::UUID, 0::INTEGER, 
      format('Erro: %s', SQLERRM)::TEXT;
END;
$$;

COMMENT ON FUNCTION criar_surebet_atomica IS 
'v9.5 - Corrigido double-write: STAKE agora usa valor NEGATIVO e removido UPDATE manual em bookmakers. 
O trigger fn_financial_events_sync_balance é o ÚNICO responsável por atualizar saldos.';

-- ============================================================================
-- PARTE 2: Corrigir eventos históricos (STAKE com valor positivo)
-- ============================================================================
-- O bug: evento STAKE +100 → trigger adicionou +100 ao saldo
-- E manual subtraiu -100 → net 0. Correto seria -100.
-- Para corrigir: inverter sinal E subtrair o valor do saldo (que está inflado).

-- 2a. Corrigir sinal dos eventos
UPDATE financial_events
SET valor = -ABS(valor),
    descricao = COALESCE(descricao, '') || ' [corrigido: sinal invertido v9.5]'
WHERE idempotency_key LIKE 'stake_%_leg%'
  AND tipo_evento = 'STAKE'
  AND valor > 0;

-- 2b. Corrigir saldos das bookmakers afetadas
-- O trigger tinha adicionado +X ao saldo (errado). Precisamos reverter esse crédito.
-- Como net era 0 (trigger+100, manual-100) mas deveria ser -100,
-- o saldo está 100 a mais para cada evento. Subtrair o total.
UPDATE bookmakers b
SET saldo_atual = b.saldo_atual - sub.total_correcao,
    updated_at = NOW()
FROM (
  SELECT bookmaker_id, SUM(ABS(valor)) as total_correcao
  FROM financial_events
  WHERE idempotency_key LIKE 'stake_%_leg%'
    AND tipo_evento = 'STAKE'
    AND descricao LIKE '%corrigido: sinal invertido v9.5%'
  GROUP BY bookmaker_id
) sub
WHERE b.id = sub.bookmaker_id;

-- 2c. Registrar auditoria da correção
INSERT INTO bookmaker_balance_audit (bookmaker_id, workspace_id, origem, saldo_anterior, saldo_novo, observacoes)
SELECT 
  b.id,
  b.workspace_id,
  'CORRECAO_DOUBLE_WRITE_V95',
  b.saldo_atual + sub.total_correcao,  -- saldo antes da correção
  b.saldo_atual,  -- saldo após correção
  format('Correção double-write criar_surebet_atomica: %s eventos com sinal errado, total corrigido: %s', sub.qtd, sub.total_correcao)
FROM bookmakers b
JOIN (
  SELECT bookmaker_id, COUNT(*) as qtd, SUM(ABS(valor)) as total_correcao
  FROM financial_events
  WHERE idempotency_key LIKE 'stake_%_leg%'
    AND tipo_evento = 'STAKE'
    AND descricao LIKE '%corrigido: sinal invertido v9.5%'
  GROUP BY bookmaker_id
) sub ON b.id = sub.bookmaker_id;
