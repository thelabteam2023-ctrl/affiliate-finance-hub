
-- Corrigir RPC liquidar_aposta_atomica para processar APOSTAS SIMPLES
-- (sem pernas - dados direto em apostas_unificada)
CREATE OR REPLACE FUNCTION public.liquidar_aposta_atomica(
  p_aposta_id uuid, 
  p_resultado text, 
  p_lucro_prejuizo numeric DEFAULT NULL::numeric, 
  p_resultados_pernas jsonb DEFAULT NULL::jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_aposta RECORD;
  v_perna RECORD;
  v_resultado_perna TEXT;
  v_lucro_perna NUMERIC;
  v_workspace_id UUID;
  v_user_id UUID;
  v_total_impacto NUMERIC := 0;
  v_tem_pernas BOOLEAN := false;
  v_lucro_final NUMERIC;
BEGIN
  -- Buscar aposta
  SELECT * INTO v_aposta
  FROM apostas_unificada
  WHERE id = p_aposta_id
  FOR UPDATE; -- Lock para evitar race condition
  
  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'APOSTA_NAO_ENCONTRADA'
    );
  END IF;
  
  IF v_aposta.status = 'LIQUIDADA' THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'APOSTA_JA_LIQUIDADA'
    );
  END IF;
  
  v_workspace_id := v_aposta.workspace_id;
  v_user_id := v_aposta.user_id;

  -- Verificar se tem pernas
  SELECT EXISTS(SELECT 1 FROM apostas_pernas WHERE aposta_id = p_aposta_id) INTO v_tem_pernas;

  -- Calcular lucro/prejuízo final
  IF p_lucro_prejuizo IS NOT NULL THEN
    v_lucro_final := p_lucro_prejuizo;
  ELSIF p_resultado = 'GREEN' THEN
    v_lucro_final := v_aposta.stake * (v_aposta.odd - 1);
  ELSIF p_resultado = 'RED' THEN
    v_lucro_final := -v_aposta.stake;
  ELSIF p_resultado IN ('VOID', 'REEMBOLSO') THEN
    v_lucro_final := 0;
  ELSIF p_resultado = 'MEIO_GREEN' THEN
    v_lucro_final := v_aposta.stake * (v_aposta.odd - 1) / 2;
  ELSIF p_resultado = 'MEIO_RED' THEN
    v_lucro_final := -v_aposta.stake / 2;
  ELSE
    v_lucro_final := 0;
  END IF;

  -- Atualizar aposta principal
  UPDATE apostas_unificada
  SET 
    status = 'LIQUIDADA',
    resultado = p_resultado,
    lucro_prejuizo = v_lucro_final,
    updated_at = NOW()
  WHERE id = p_aposta_id;

  -- =====================================================
  -- CASO 1: APOSTA SIMPLES (sem pernas) - processar direto
  -- =====================================================
  IF NOT v_tem_pernas AND v_aposta.bookmaker_id IS NOT NULL THEN
    RAISE NOTICE '[liquidar_aposta_atomica] Processando aposta SIMPLES id=% bookmaker=% resultado=%', 
      p_aposta_id, v_aposta.bookmaker_id, p_resultado;
    
    IF p_resultado = 'GREEN' THEN
      -- GREEN: creditar stake + lucro na bookmaker
      INSERT INTO cash_ledger (
        workspace_id,
        user_id,
        tipo_transacao,
        destino_bookmaker_id,
        destino_tipo,
        valor,
        valor_destino, -- CRÍTICO: para trigger atualizar saldo
        moeda,
        tipo_moeda,
        status,
        descricao,
        impacta_caixa_operacional,
        data_transacao
      ) VALUES (
        v_workspace_id,
        v_user_id,
        'APOSTA_GREEN',
        v_aposta.bookmaker_id,
        'BOOKMAKER',
        v_aposta.stake + v_lucro_final, -- stake + lucro
        v_aposta.stake + v_lucro_final, -- valor_destino para trigger
        COALESCE(v_aposta.moeda_operacao, 'BRL'),
        CASE WHEN v_aposta.moeda_operacao IN ('USD', 'USDT') THEN 'CRYPTO' ELSE 'FIAT' END,
        'CONFIRMADO',
        'Aposta GREEN (Simples) - Retorno: ' || (v_aposta.stake + v_lucro_final)::TEXT,
        true,
        NOW()
      );
      v_total_impacto := v_aposta.stake + v_lucro_final;
      
    ELSIF p_resultado = 'RED' THEN
      -- RED: debitar stake perdido da bookmaker
      INSERT INTO cash_ledger (
        workspace_id,
        user_id,
        tipo_transacao,
        origem_bookmaker_id,
        origem_tipo,
        valor,
        valor_origem, -- CRÍTICO: para trigger atualizar saldo
        moeda,
        tipo_moeda,
        status,
        descricao,
        impacta_caixa_operacional,
        data_transacao
      ) VALUES (
        v_workspace_id,
        v_user_id,
        'APOSTA_RED',
        v_aposta.bookmaker_id,
        'BOOKMAKER',
        v_aposta.stake,
        v_aposta.stake, -- valor_origem para trigger
        COALESCE(v_aposta.moeda_operacao, 'BRL'),
        CASE WHEN v_aposta.moeda_operacao IN ('USD', 'USDT') THEN 'CRYPTO' ELSE 'FIAT' END,
        'CONFIRMADO',
        'Aposta RED (Simples) - Stake perdido: ' || v_aposta.stake::TEXT,
        true,
        NOW()
      );
      v_total_impacto := -v_aposta.stake;
      
    ELSIF p_resultado IN ('VOID', 'REEMBOLSO') THEN
      -- VOID: stake devolvido (estava reservado, agora libera)
      -- Não precisa de lançamento pois o stake nunca saiu do saldo
      v_total_impacto := 0;
      
    ELSIF p_resultado = 'MEIO_GREEN' THEN
      INSERT INTO cash_ledger (
        workspace_id,
        user_id,
        tipo_transacao,
        destino_bookmaker_id,
        destino_tipo,
        valor,
        valor_destino,
        moeda,
        tipo_moeda,
        status,
        descricao,
        impacta_caixa_operacional,
        data_transacao
      ) VALUES (
        v_workspace_id,
        v_user_id,
        'APOSTA_GREEN',
        v_aposta.bookmaker_id,
        'BOOKMAKER',
        v_aposta.stake + v_lucro_final,
        v_aposta.stake + v_lucro_final,
        COALESCE(v_aposta.moeda_operacao, 'BRL'),
        CASE WHEN v_aposta.moeda_operacao IN ('USD', 'USDT') THEN 'CRYPTO' ELSE 'FIAT' END,
        'CONFIRMADO',
        'Aposta MEIO_GREEN (Simples) - Retorno: ' || (v_aposta.stake + v_lucro_final)::TEXT,
        true,
        NOW()
      );
      v_total_impacto := v_aposta.stake + v_lucro_final;
      
    ELSIF p_resultado = 'MEIO_RED' THEN
      INSERT INTO cash_ledger (
        workspace_id,
        user_id,
        tipo_transacao,
        origem_bookmaker_id,
        origem_tipo,
        valor,
        valor_origem,
        moeda,
        tipo_moeda,
        status,
        descricao,
        impacta_caixa_operacional,
        data_transacao
      ) VALUES (
        v_workspace_id,
        v_user_id,
        'APOSTA_RED',
        v_aposta.bookmaker_id,
        'BOOKMAKER',
        ABS(v_lucro_final),
        ABS(v_lucro_final),
        COALESCE(v_aposta.moeda_operacao, 'BRL'),
        CASE WHEN v_aposta.moeda_operacao IN ('USD', 'USDT') THEN 'CRYPTO' ELSE 'FIAT' END,
        'CONFIRMADO',
        'Aposta MEIO_RED (Simples) - Perda: ' || ABS(v_lucro_final)::TEXT,
        true,
        NOW()
      );
      v_total_impacto := v_lucro_final;
    END IF;

    RETURN jsonb_build_object(
      'success', true,
      'tipo', 'SIMPLES',
      'aposta_id', p_aposta_id,
      'resultado', p_resultado,
      'lucro_prejuizo', v_lucro_final,
      'impacto_saldo', v_total_impacto
    );
  END IF;

  -- =====================================================
  -- CASO 2: APOSTA COM PERNAS - processar cada perna
  -- =====================================================
  FOR v_perna IN 
    SELECT ap.*, b.moeda as bookmaker_moeda
    FROM apostas_pernas ap
    JOIN bookmakers b ON b.id = ap.bookmaker_id
    WHERE ap.aposta_id = p_aposta_id
  LOOP
    -- Determinar resultado da perna
    IF p_resultados_pernas IS NOT NULL THEN
      v_resultado_perna := p_resultados_pernas->>v_perna.id::TEXT;
    END IF;
    v_resultado_perna := COALESCE(v_resultado_perna, p_resultado);
    
    -- Calcular lucro/prejuízo da perna
    IF v_resultado_perna = 'GREEN' THEN
      v_lucro_perna := v_perna.stake * (v_perna.odd - 1);
    ELSIF v_resultado_perna = 'RED' THEN
      v_lucro_perna := -v_perna.stake;
    ELSIF v_resultado_perna = 'VOID' OR v_resultado_perna = 'REEMBOLSO' THEN
      v_lucro_perna := 0;
    ELSIF v_resultado_perna = 'MEIO_GREEN' THEN
      v_lucro_perna := v_perna.stake * (v_perna.odd - 1) / 2;
    ELSIF v_resultado_perna = 'MEIO_RED' THEN
      v_lucro_perna := -v_perna.stake / 2;
    ELSE
      v_lucro_perna := 0;
    END IF;
    
    -- Atualizar perna
    UPDATE apostas_pernas
    SET 
      resultado = v_resultado_perna,
      lucro_prejuizo = v_lucro_perna,
      updated_at = NOW()
    WHERE id = v_perna.id;
    
    -- Inserir no cash_ledger para registrar impacto
    IF v_resultado_perna = 'GREEN' THEN
      -- GREEN: retorna stake + lucro
      INSERT INTO cash_ledger (
        workspace_id,
        user_id,
        tipo_transacao,
        destino_bookmaker_id,
        destino_tipo,
        valor,
        valor_destino,
        moeda,
        tipo_moeda,
        status,
        descricao,
        impacta_caixa_operacional,
        data_transacao
      ) VALUES (
        v_workspace_id,
        v_user_id,
        'APOSTA_GREEN',
        v_perna.bookmaker_id,
        'BOOKMAKER',
        v_perna.stake + v_lucro_perna,
        v_perna.stake + v_lucro_perna,
        COALESCE(v_perna.moeda, 'BRL'),
        CASE WHEN v_perna.moeda IN ('USD', 'USDT') THEN 'CRYPTO' ELSE 'FIAT' END,
        'CONFIRMADO',
        'Aposta GREEN (Perna) - Retorno: ' || (v_perna.stake + v_lucro_perna)::TEXT,
        true,
        NOW()
      );
      v_total_impacto := v_total_impacto + v_perna.stake + v_lucro_perna;
      
    ELSIF v_resultado_perna = 'RED' THEN
      -- RED: stake perdido
      INSERT INTO cash_ledger (
        workspace_id,
        user_id,
        tipo_transacao,
        origem_bookmaker_id,
        origem_tipo,
        valor,
        valor_origem,
        moeda,
        tipo_moeda,
        status,
        descricao,
        impacta_caixa_operacional,
        data_transacao
      ) VALUES (
        v_workspace_id,
        v_user_id,
        'APOSTA_RED',
        v_perna.bookmaker_id,
        'BOOKMAKER',
        v_perna.stake,
        v_perna.stake,
        COALESCE(v_perna.moeda, 'BRL'),
        CASE WHEN v_perna.moeda IN ('USD', 'USDT') THEN 'CRYPTO' ELSE 'FIAT' END,
        'CONFIRMADO',
        'Aposta RED (Perna) - Stake perdido: ' || v_perna.stake::TEXT,
        true,
        NOW()
      );
      v_total_impacto := v_total_impacto - v_perna.stake;
      
    ELSIF v_resultado_perna IN ('VOID', 'REEMBOLSO') THEN
      -- VOID: stake devolvido
      v_total_impacto := v_total_impacto + 0;
      
    ELSIF v_resultado_perna = 'MEIO_GREEN' THEN
      INSERT INTO cash_ledger (
        workspace_id,
        user_id,
        tipo_transacao,
        destino_bookmaker_id,
        destino_tipo,
        valor,
        valor_destino,
        moeda,
        tipo_moeda,
        status,
        descricao,
        impacta_caixa_operacional,
        data_transacao
      ) VALUES (
        v_workspace_id,
        v_user_id,
        'APOSTA_GREEN',
        v_perna.bookmaker_id,
        'BOOKMAKER',
        v_perna.stake + v_lucro_perna,
        v_perna.stake + v_lucro_perna,
        COALESCE(v_perna.moeda, 'BRL'),
        CASE WHEN v_perna.moeda IN ('USD', 'USDT') THEN 'CRYPTO' ELSE 'FIAT' END,
        'CONFIRMADO',
        'Aposta MEIO_GREEN (Perna) - Retorno: ' || (v_perna.stake + v_lucro_perna)::TEXT,
        true,
        NOW()
      );
      v_total_impacto := v_total_impacto + v_perna.stake + v_lucro_perna;
      
    ELSIF v_resultado_perna = 'MEIO_RED' THEN
      INSERT INTO cash_ledger (
        workspace_id,
        user_id,
        tipo_transacao,
        origem_bookmaker_id,
        origem_tipo,
        valor,
        valor_origem,
        moeda,
        tipo_moeda,
        status,
        descricao,
        impacta_caixa_operacional,
        data_transacao
      ) VALUES (
        v_workspace_id,
        v_user_id,
        'APOSTA_RED',
        v_perna.bookmaker_id,
        'BOOKMAKER',
        ABS(v_lucro_perna),
        ABS(v_lucro_perna),
        COALESCE(v_perna.moeda, 'BRL'),
        CASE WHEN v_perna.moeda IN ('USD', 'USDT') THEN 'CRYPTO' ELSE 'FIAT' END,
        'CONFIRMADO',
        'Aposta MEIO_RED (Perna) - Perda: ' || ABS(v_lucro_perna)::TEXT,
        true,
        NOW()
      );
      v_total_impacto := v_total_impacto + v_lucro_perna;
    END IF;
  END LOOP;

  RETURN jsonb_build_object(
    'success', true,
    'tipo', 'MULTIPLA',
    'aposta_id', p_aposta_id,
    'resultado', p_resultado,
    'lucro_prejuizo', v_lucro_final,
    'impacto_saldo', v_total_impacto
  );
END;
$function$;

-- Adicionar comentário explicativo
COMMENT ON FUNCTION public.liquidar_aposta_atomica IS 
'Liquida uma aposta (simples ou múltipla) de forma atômica, inserindo lançamentos no cash_ledger.
Para apostas SIMPLES: usa bookmaker_id/stake/odd direto de apostas_unificada.
Para apostas MÚLTIPLAS: itera sobre apostas_pernas.
Inclui valor_destino/valor_origem para trigger atualizar saldo corretamente.';
