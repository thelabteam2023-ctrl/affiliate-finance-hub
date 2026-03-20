
DROP FUNCTION IF EXISTS public.reliquidar_aposta_v6(uuid, text, numeric);

CREATE OR REPLACE FUNCTION public.reliquidar_aposta_v6(
  p_aposta_id UUID,
  p_novo_resultado TEXT,
  p_lucro_prejuizo NUMERIC DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_aposta RECORD;
  v_resultado_anterior TEXT;
  v_stake NUMERIC;
  v_odd NUMERIC;
  v_novo_lucro NUMERIC;
  v_bookmaker_id UUID;
  v_workspace_id UUID;
  v_user_id UUID;
  v_is_freebet BOOLEAN;
  v_tipo_uso TEXT;
  v_impacto_anterior NUMERIC;
  v_impacto_novo NUMERIC;
  v_diferenca NUMERIC;
  v_idempotency_key TEXT;
  v_moeda TEXT;
  v_evento_existente UUID;
BEGIN
  SELECT 
    au.id, au.resultado, au.lucro_prejuizo, au.stake,
    au.odd, au.odd_final, au.bookmaker_id, au.workspace_id, au.user_id,
    COALESCE(au.usar_freebet, FALSE) as usar_freebet,
    COALESCE(au.fonte_saldo, 'REAL') as fonte_saldo,
    COALESCE(au.moeda_operacao, 'BRL') as moeda
  INTO v_aposta
  FROM apostas_unificada au
  WHERE au.id = p_aposta_id
  FOR UPDATE;
  
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Aposta não encontrada');
  END IF;
  
  v_resultado_anterior := v_aposta.resultado;
  v_stake := COALESCE(v_aposta.stake, 0);
  v_odd := COALESCE(v_aposta.odd, v_aposta.odd_final, 1);
  v_bookmaker_id := v_aposta.bookmaker_id;
  v_workspace_id := v_aposta.workspace_id;
  v_user_id := v_aposta.user_id;
  v_moeda := v_aposta.moeda;
  v_is_freebet := (v_aposta.usar_freebet OR v_aposta.fonte_saldo = 'FREEBET');
  
  IF v_resultado_anterior = p_novo_resultado THEN
    RETURN jsonb_build_object('success', true, 'message', 'Resultado já é o mesmo', 'resultado', p_novo_resultado);
  END IF;
  
  v_tipo_uso := CASE WHEN v_is_freebet THEN 'FREEBET' ELSE 'NORMAL' END;
  
  -- Calcular impacto anterior (SNR para freebet)
  v_impacto_anterior := CASE v_resultado_anterior
    WHEN 'GREEN' THEN v_stake * (v_odd - 1)
    WHEN 'MEIO_GREEN' THEN v_stake * (v_odd - 1) / 2
    WHEN 'VOID' THEN 0
    WHEN 'MEIO_RED' THEN CASE WHEN v_is_freebet THEN 0 ELSE -v_stake / 2 END
    WHEN 'RED' THEN CASE WHEN v_is_freebet THEN 0 ELSE -v_stake END
    ELSE CASE WHEN v_is_freebet THEN 0 ELSE -v_stake END  -- PENDENTE
  END;
  
  -- Calcular impacto novo (SNR para freebet)
  v_impacto_novo := CASE p_novo_resultado
    WHEN 'GREEN' THEN v_stake * (v_odd - 1)
    WHEN 'MEIO_GREEN' THEN v_stake * (v_odd - 1) / 2
    WHEN 'VOID' THEN 0
    WHEN 'MEIO_RED' THEN CASE WHEN v_is_freebet THEN 0 ELSE -v_stake / 2 END
    WHEN 'RED' THEN CASE WHEN v_is_freebet THEN 0 ELSE -v_stake END
    ELSE CASE WHEN v_is_freebet THEN 0 ELSE -v_stake END
  END;
  
  v_diferenca := v_impacto_novo - v_impacto_anterior;
  
  -- Lucro/prejuízo (SNR)
  IF p_lucro_prejuizo IS NOT NULL THEN
    v_novo_lucro := p_lucro_prejuizo;
  ELSE
    v_novo_lucro := CASE p_novo_resultado
      WHEN 'GREEN' THEN v_stake * (v_odd - 1)
      WHEN 'MEIO_GREEN' THEN v_stake * (v_odd - 1) / 2
      WHEN 'VOID' THEN 0
      WHEN 'MEIO_RED' THEN CASE WHEN v_is_freebet THEN 0 ELSE -v_stake / 2 END
      WHEN 'RED' THEN CASE WHEN v_is_freebet THEN 0 ELSE -v_stake END
      ELSE 0
    END;
  END IF;
  
  -- Evento de AJUSTE (idempotente)
  v_idempotency_key := 'reliq_' || p_aposta_id::TEXT || '_' || 
                       COALESCE(v_resultado_anterior, 'NULL') || '_to_' || p_novo_resultado;
  
  IF v_bookmaker_id IS NOT NULL AND v_diferenca <> 0 THEN
    SELECT id INTO v_evento_existente
    FROM financial_events WHERE idempotency_key = v_idempotency_key;
    
    IF v_evento_existente IS NULL THEN
      INSERT INTO financial_events (
        bookmaker_id, aposta_id, tipo_evento, tipo_uso,
        valor, moeda, workspace_id, idempotency_key, created_by, processed_at
      ) VALUES (
        v_bookmaker_id, p_aposta_id, 'AJUSTE', v_tipo_uso,
        v_diferenca, v_moeda, v_workspace_id, v_idempotency_key, auth.uid(), now()
      );
    END IF;
  END IF;
  
  -- Atualizar aposta (SNR para valor_retorno)
  UPDATE apostas_unificada
  SET
    resultado = p_novo_resultado,
    status = 'LIQUIDADA',
    lucro_prejuizo = v_novo_lucro,
    valor_retorno = CASE p_novo_resultado
      WHEN 'GREEN' THEN CASE WHEN v_is_freebet THEN v_stake * (v_odd - 1) ELSE v_stake * v_odd END
      WHEN 'MEIO_GREEN' THEN CASE WHEN v_is_freebet THEN v_stake * (v_odd - 1) / 2 ELSE v_stake + (v_stake * (v_odd - 1) / 2) END
      WHEN 'VOID' THEN v_stake
      WHEN 'MEIO_RED' THEN CASE WHEN v_is_freebet THEN 0 ELSE v_stake / 2 END
      WHEN 'RED' THEN 0
      ELSE 0
    END,
    updated_at = now()
  WHERE id = p_aposta_id;
  
  RETURN jsonb_build_object(
    'success', true,
    'resultado_anterior', v_resultado_anterior,
    'resultado_novo', p_novo_resultado,
    'stake', v_stake, 'odd', v_odd,
    'impacto_anterior', v_impacto_anterior,
    'impacto_novo', v_impacto_novo,
    'diferenca_ajuste', v_diferenca,
    'lucro_prejuizo', v_novo_lucro,
    'is_freebet', v_is_freebet
  );
END;
$fn$;
