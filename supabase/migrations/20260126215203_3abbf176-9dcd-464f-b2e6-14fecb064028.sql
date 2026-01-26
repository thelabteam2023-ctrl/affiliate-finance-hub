
-- ============================================================================
-- AUDITORIA COMPLETA E CORREÇÃO DO MOTOR DE APOSTAS - V2
-- ============================================================================

-- ============================================================================
-- PARTE 1: DESABILITAR TRIGGER DUPLICADO (manter apenas v4)
-- ============================================================================
DROP TRIGGER IF EXISTS tr_cash_ledger_update_bookmaker_balance_v3 ON cash_ledger;

-- ============================================================================
-- PARTE 2: CORRIGIR processar_credito_ganho PARA RESPEITAR FONTE DO SALDO
-- ============================================================================

CREATE OR REPLACE FUNCTION public.processar_credito_ganho(
  p_bookmaker_id UUID,
  p_lucro NUMERIC,
  p_debito_bonus NUMERIC,
  p_debito_freebet NUMERIC,
  p_debito_real NUMERIC,
  p_workspace_id UUID,
  p_user_id UUID,
  p_aposta_id UUID DEFAULT NULL
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_retorno_total NUMERIC;
  v_saldo_anterior NUMERIC;
  v_moeda TEXT;
BEGIN
  -- ========================================
  -- CÁLCULO CORRETO DO RETORNO
  -- ========================================
  -- BONUS consumido: NÃO retorna (foi "gasto")
  -- FREEBET consumido: NÃO retorna (foi "gasto")
  -- REAL consumido: RETORNA o stake (é devolvido)
  -- Lucro: SEMPRE retorna para saldo_real
  -- ========================================
  
  v_retorno_total := p_lucro + p_debito_real;
  
  SELECT saldo_atual, moeda INTO v_saldo_anterior, v_moeda
  FROM bookmakers
  WHERE id = p_bookmaker_id;
  
  -- Inserir no ledger (trigger v4 processa automaticamente)
  INSERT INTO cash_ledger (
    tipo_transacao,
    workspace_id,
    user_id,
    destino_bookmaker_id,
    valor,
    valor_destino,
    moeda,
    tipo_moeda,
    descricao,
    status,
    impacta_caixa_operacional,
    debito_bonus,
    debito_freebet,
    debito_real,
    auditoria_metadata
  ) VALUES (
    'APOSTA_GREEN',
    p_workspace_id,
    p_user_id,
    p_bookmaker_id,
    v_retorno_total,
    v_retorno_total,
    COALESCE(v_moeda, 'USD'),
    'FIAT',
    FORMAT('Aposta GREEN - Retorno: %s (Lucro: %s + Stake Real devolvido: %s). Bonus consumido: %s, Freebet consumido: %s', 
           v_retorno_total, p_lucro, p_debito_real, p_debito_bonus, p_debito_freebet),
    'CONFIRMADO',
    true,
    p_debito_bonus,
    p_debito_freebet,
    p_debito_real,
    jsonb_build_object(
      'aposta_id', p_aposta_id,
      'lucro', p_lucro,
      'stake_real_devolvido', p_debito_real,
      'bonus_consumido', p_debito_bonus,
      'freebet_consumido', p_debito_freebet,
      'retorno_total', v_retorno_total
    )
  );
  
  -- Auditoria (sem campo diferenca que é gerado automaticamente)
  INSERT INTO bookmaker_balance_audit (
    bookmaker_id, workspace_id, user_id, origem,
    saldo_anterior, saldo_novo, observacoes, 
    referencia_id, referencia_tipo
  ) VALUES (
    p_bookmaker_id, p_workspace_id, p_user_id, 'APOSTA_GREEN_CORRETO',
    v_saldo_anterior, v_saldo_anterior + v_retorno_total,
    FORMAT('GREEN CORRETO: lucro=%s, stake_real=%s (devolvido), bonus=%s (consumido), freebet=%s (consumido)', 
           p_lucro, p_debito_real, p_debito_bonus, p_debito_freebet),
    p_aposta_id, 'APOSTA'
  );
  
  RETURN true;
END;
$$;

COMMENT ON FUNCTION public.processar_credito_ganho IS 
'Processa crédito de aposta ganha. REGRAS:
- BONUS/FREEBET consumidos NÃO são devolvidos (foram gastos)
- Apenas stake REAL é devolvido junto com o lucro
- Lucro SEMPRE vai para saldo_real
- NÃO faz UPDATE direto - trigger v4 processa o ledger';

-- ============================================================================
-- PARTE 3: ATUALIZAR liquidar_aposta_atomica_v2 COM CÁLCULO CORRETO
-- ============================================================================

CREATE OR REPLACE FUNCTION public.liquidar_aposta_atomica_v2(
  p_aposta_id UUID,
  p_resultado TEXT,
  p_lucro_prejuizo NUMERIC DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_aposta RECORD;
  v_lucro_final NUMERIC;
  v_debito_bonus NUMERIC;
  v_debito_freebet NUMERIC;
  v_debito_real NUMERIC;
  v_stake_total NUMERIC;
BEGIN
  -- Buscar aposta com lock
  SELECT * INTO v_aposta
  FROM apostas_unificada
  WHERE id = p_aposta_id
  FOR UPDATE;
  
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'APOSTA_NAO_ENCONTRADA');
  END IF;
  
  IF v_aposta.status = 'LIQUIDADA' THEN
    RETURN jsonb_build_object('success', false, 'error', 'APOSTA_JA_LIQUIDADA');
  END IF;
  
  -- Buscar breakdown do débito original do ledger
  SELECT 
    COALESCE(cl.debito_bonus, 0),
    COALESCE(cl.debito_freebet, 0),
    COALESCE(cl.debito_real, 0)
  INTO v_debito_bonus, v_debito_freebet, v_debito_real
  FROM cash_ledger cl
  WHERE cl.origem_bookmaker_id = v_aposta.bookmaker_id
    AND cl.tipo_transacao = 'APOSTA_STAKE'
    AND cl.workspace_id = v_aposta.workspace_id
    AND cl.created_at >= v_aposta.created_at - INTERVAL '1 minute'
  ORDER BY cl.created_at DESC
  LIMIT 1;
  
  -- Fallback para campos da aposta se ledger não encontrado
  IF v_debito_bonus IS NULL THEN
    v_debito_bonus := COALESCE(v_aposta.stake_bonus, 0);
    v_debito_real := COALESCE(v_aposta.stake_real, v_aposta.stake);
    v_debito_freebet := 0;
  END IF;
  
  -- Stake total = soma de todas as fontes
  v_stake_total := COALESCE(v_aposta.stake, v_debito_bonus + v_debito_freebet + v_debito_real);
  
  -- Calcular lucro/prejuízo
  IF p_lucro_prejuizo IS NOT NULL THEN
    v_lucro_final := p_lucro_prejuizo;
    
  ELSIF p_resultado = 'GREEN' THEN
    v_lucro_final := v_stake_total * (COALESCE(v_aposta.odd, 1) - 1);
    
  ELSIF p_resultado = 'RED' THEN
    v_lucro_final := 0;
    
  ELSIF p_resultado IN ('VOID', 'REEMBOLSO') THEN
    v_lucro_final := 0;
    UPDATE bookmakers
    SET 
      saldo_bonus = COALESCE(saldo_bonus, 0) + v_debito_bonus,
      saldo_freebet = COALESCE(saldo_freebet, 0) + v_debito_freebet,
      saldo_atual = saldo_atual + v_debito_real
    WHERE id = v_aposta.bookmaker_id;
    
    INSERT INTO cash_ledger (
      tipo_transacao, workspace_id, user_id, destino_bookmaker_id,
      valor, valor_destino, moeda, tipo_moeda, status, impacta_caixa_operacional,
      debito_bonus, debito_freebet, debito_real, descricao
    ) VALUES (
      'APOSTA_VOID', v_aposta.workspace_id, v_aposta.user_id, v_aposta.bookmaker_id,
      v_stake_total, v_stake_total, COALESCE(v_aposta.moeda_operacao, 'USD'), 'FIAT',
      'CONFIRMADO', true,
      v_debito_bonus, v_debito_freebet, v_debito_real,
      FORMAT('VOID - Devolução: Bonus=%s, Freebet=%s, Real=%s', v_debito_bonus, v_debito_freebet, v_debito_real)
    );
    
  ELSIF p_resultado = 'MEIO_GREEN' THEN
    v_lucro_final := v_stake_total * (COALESCE(v_aposta.odd, 1) - 1) / 2;
    
  ELSIF p_resultado = 'MEIO_RED' THEN
    v_lucro_final := 0;
    UPDATE bookmakers
    SET 
      saldo_bonus = COALESCE(saldo_bonus, 0) + v_debito_bonus / 2,
      saldo_freebet = COALESCE(saldo_freebet, 0) + v_debito_freebet / 2,
      saldo_atual = saldo_atual + v_debito_real / 2
    WHERE id = v_aposta.bookmaker_id;
    
  ELSE
    v_lucro_final := 0;
  END IF;
  
  -- Processar ganho (GREEN ou MEIO_GREEN)
  IF p_resultado IN ('GREEN', 'MEIO_GREEN') AND v_lucro_final > 0 THEN
    PERFORM processar_credito_ganho(
      v_aposta.bookmaker_id,
      v_lucro_final,
      v_debito_bonus, v_debito_freebet, v_debito_real,
      v_aposta.workspace_id, v_aposta.user_id, p_aposta_id
    );
  END IF;
  
  -- Atualizar aposta
  UPDATE apostas_unificada
  SET 
    status = 'LIQUIDADA',
    resultado = p_resultado,
    lucro_prejuizo = CASE 
      WHEN p_resultado IN ('GREEN', 'MEIO_GREEN') THEN v_lucro_final
      WHEN p_resultado = 'RED' THEN -v_stake_total
      WHEN p_resultado = 'MEIO_RED' THEN -v_stake_total / 2
      ELSE 0
    END,
    valor_retorno = CASE 
      WHEN p_resultado = 'GREEN' THEN v_lucro_final + v_debito_real
      WHEN p_resultado = 'MEIO_GREEN' THEN v_lucro_final + v_debito_real
      ELSE 0
    END,
    updated_at = NOW()
  WHERE id = p_aposta_id;
  
  RETURN jsonb_build_object(
    'success', true,
    'resultado', p_resultado,
    'lucro_final', v_lucro_final,
    'stake_total', v_stake_total,
    'breakdown', jsonb_build_object(
      'bonus', v_debito_bonus,
      'freebet', v_debito_freebet,
      'real', v_debito_real
    )
  );
END;
$$;

COMMENT ON FUNCTION public.liquidar_aposta_atomica_v2 IS 
'Liquida aposta com cálculo correto de lucro e waterfall.
- GREEN: lucro = stake_total × (odd - 1), retorno = lucro + stake_real
- RED: perda total do stake (já debitado)
- VOID: devolve stake para cada pool original
- MEIO_GREEN/RED: proporção de 50%';

-- ============================================================================
-- PARTE 4: CORRIGIR SALDO ATUAL DA BANKONBET
-- ============================================================================

UPDATE bookmakers 
SET saldo_atual = 200.00, updated_at = NOW()
WHERE id = '28a61306-f959-4b3a-a3ec-25ef3214e3e3';

INSERT INTO bookmaker_balance_audit (
  bookmaker_id, workspace_id, user_id, origem,
  saldo_anterior, saldo_novo, observacoes
)
SELECT 
  id, workspace_id, user_id, 'CORRECAO_BUG_TRIGGER_DUPLICADO',
  300.00, 200.00,
  'Correção: Removido trigger v3 duplicado. Saldo corrigido de 300 para 200 (100 depósito + 100 lucro)'
FROM bookmakers 
WHERE id = '28a61306-f959-4b3a-a3ec-25ef3214e3e3';
