-- =================================================================
-- RECRIAÇÃO: reliquidar_aposta_v5 usando financial_events diretamente
-- Corrige erro: "Could not find the function in the schema cache"
-- =================================================================

DROP FUNCTION IF EXISTS public.reliquidar_aposta_v5(UUID, TEXT, NUMERIC);

CREATE OR REPLACE FUNCTION public.reliquidar_aposta_v5(
  p_aposta_id UUID,
  p_novo_resultado TEXT,
  p_lucro_prejuizo NUMERIC DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_aposta RECORD;
  v_resultado_anterior TEXT;
  v_lucro_anterior NUMERIC;
  v_stake NUMERIC;
  v_odd NUMERIC;
  v_novo_lucro NUMERIC;
  v_bookmaker_id UUID;
  v_workspace_id UUID;
  v_user_id UUID;
  v_usar_freebet BOOLEAN;
  v_tipo_uso TEXT;
  v_valor_reversao NUMERIC;
  v_valor_novo_payout NUMERIC;
  v_idempotency_key TEXT;
BEGIN
  -- Buscar dados da aposta
  SELECT 
    au.id,
    au.resultado,
    au.lucro_prejuizo,
    au.stake,
    au.odd,
    au.bookmaker_id,
    au.workspace_id,
    au.user_id,
    COALESCE(au.usar_freebet, FALSE) as usar_freebet,
    COALESCE(au.fonte_saldo, 'REAL') as fonte_saldo
  INTO v_aposta
  FROM apostas_unificada au
  WHERE au.id = p_aposta_id
  FOR UPDATE;
  
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Aposta não encontrada');
  END IF;
  
  -- Guardar valores anteriores
  v_resultado_anterior := v_aposta.resultado;
  v_lucro_anterior := COALESCE(v_aposta.lucro_prejuizo, 0);
  v_stake := COALESCE(v_aposta.stake, 0);
  v_odd := COALESCE(v_aposta.odd, 1);
  v_bookmaker_id := v_aposta.bookmaker_id;
  v_workspace_id := v_aposta.workspace_id;
  v_user_id := v_aposta.user_id;
  v_usar_freebet := v_aposta.usar_freebet;
  
  -- Determinar tipo_uso baseado na fonte do saldo
  IF v_usar_freebet OR v_aposta.fonte_saldo = 'FREEBET' THEN
    v_tipo_uso := 'FREEBET';
  ELSIF v_aposta.fonte_saldo = 'BONUS' THEN
    v_tipo_uso := 'BONUS';
  ELSE
    v_tipo_uso := 'NORMAL';
  END IF;
  
  -- Calcular valor de reversão baseado no resultado ANTERIOR
  v_valor_reversao := CASE v_resultado_anterior
    WHEN 'GREEN' THEN v_stake * (v_odd - 1) + v_stake  -- lucro + stake retornado
    WHEN 'MEIO_GREEN' THEN (v_stake * (v_odd - 1) / 2) + v_stake  -- meio lucro + stake
    WHEN 'VOID' THEN v_stake  -- stake retornado
    WHEN 'MEIO_RED' THEN v_stake / 2  -- metade do stake retornado
    WHEN 'RED' THEN 0  -- nada a reverter
    ELSE 0
  END;
  
  -- Calcular novo lucro/prejuízo
  IF p_lucro_prejuizo IS NOT NULL THEN
    v_novo_lucro := p_lucro_prejuizo;
  ELSE
    v_novo_lucro := CASE p_novo_resultado
      WHEN 'GREEN' THEN v_stake * (v_odd - 1)
      WHEN 'MEIO_GREEN' THEN v_stake * (v_odd - 1) / 2
      WHEN 'VOID' THEN 0
      WHEN 'MEIO_RED' THEN -v_stake / 2
      WHEN 'RED' THEN -v_stake
      ELSE 0
    END;
  END IF;
  
  -- Calcular valor do novo payout
  v_valor_novo_payout := CASE p_novo_resultado
    WHEN 'GREEN' THEN v_stake * (v_odd - 1) + v_stake
    WHEN 'MEIO_GREEN' THEN (v_stake * (v_odd - 1) / 2) + v_stake
    WHEN 'VOID' THEN v_stake
    WHEN 'MEIO_RED' THEN v_stake / 2
    WHEN 'RED' THEN 0
    ELSE 0
  END;
  
  -- ========================================================
  -- PASSO 1: Reverter impacto anterior (se houver)
  -- ========================================================
  IF v_valor_reversao > 0 AND v_bookmaker_id IS NOT NULL THEN
    v_idempotency_key := 'reliq_rev_' || p_aposta_id::TEXT || '_' || extract(epoch from now())::TEXT;
    
    INSERT INTO financial_events (
      bookmaker_id,
      aposta_id,
      event_type,
      tipo_uso,
      valor,
      moeda,
      workspace_id,
      user_id,
      idempotency_key,
      metadata
    ) VALUES (
      v_bookmaker_id,
      p_aposta_id,
      'REVERSAL',
      v_tipo_uso,
      -v_valor_reversao,  -- Negativo para debitar/reverter
      'BRL',
      v_workspace_id,
      v_user_id,
      v_idempotency_key,
      jsonb_build_object(
        'operacao', 'reliquidar_aposta_v5',
        'resultado_anterior', v_resultado_anterior,
        'valor_revertido', v_valor_reversao
      )
    );
  END IF;
  
  -- ========================================================
  -- PASSO 2: Aplicar novo payout (se houver)
  -- ========================================================
  IF v_valor_novo_payout > 0 AND v_bookmaker_id IS NOT NULL THEN
    v_idempotency_key := 'reliq_pay_' || p_aposta_id::TEXT || '_' || extract(epoch from now())::TEXT;
    
    INSERT INTO financial_events (
      bookmaker_id,
      aposta_id,
      event_type,
      tipo_uso,
      valor,
      moeda,
      workspace_id,
      user_id,
      idempotency_key,
      metadata
    ) VALUES (
      v_bookmaker_id,
      p_aposta_id,
      CASE WHEN p_novo_resultado = 'VOID' THEN 'VOID_REFUND' ELSE 'PAYOUT' END,
      v_tipo_uso,
      v_valor_novo_payout,  -- Positivo para creditar
      'BRL',
      v_workspace_id,
      v_user_id,
      v_idempotency_key,
      jsonb_build_object(
        'operacao', 'reliquidar_aposta_v5',
        'novo_resultado', p_novo_resultado,
        'valor_payout', v_valor_novo_payout
      )
    );
  END IF;
  
  -- ========================================================
  -- PASSO 3: Atualizar registro da aposta
  -- ========================================================
  UPDATE apostas_unificada
  SET 
    resultado = p_novo_resultado,
    lucro_prejuizo = v_novo_lucro,
    status = 'LIQUIDADA',
    roi_real = CASE 
      WHEN v_stake > 0 THEN (v_novo_lucro / v_stake) * 100 
      ELSE 0 
    END,
    updated_at = NOW()
  WHERE id = p_aposta_id;
  
  RETURN jsonb_build_object(
    'success', true,
    'resultado_anterior', v_resultado_anterior,
    'resultado_novo', p_novo_resultado,
    'lucro_anterior', v_lucro_anterior,
    'lucro_novo', v_novo_lucro,
    'valor_reversao', v_valor_reversao,
    'valor_payout', v_valor_novo_payout
  );
  
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object(
    'success', false,
    'error', SQLERRM,
    'detail', SQLSTATE
  );
END;
$$;

-- Grants
GRANT EXECUTE ON FUNCTION public.reliquidar_aposta_v5(UUID, TEXT, NUMERIC) TO authenticated;
GRANT EXECUTE ON FUNCTION public.reliquidar_aposta_v5(UUID, TEXT, NUMERIC) TO service_role;

COMMENT ON FUNCTION public.reliquidar_aposta_v5 IS 
'v9.5 - Reliquida aposta usando financial_events diretamente (Motor Financeiro v9.5)';