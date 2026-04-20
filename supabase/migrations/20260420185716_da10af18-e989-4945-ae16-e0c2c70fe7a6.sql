CREATE OR REPLACE FUNCTION public.reliquidar_aposta_v6(p_aposta_id uuid, p_novo_resultado text, p_lucro_prejuizo numeric DEFAULT NULL::numeric)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_aposta RECORD;
  v_perna RECORD;
  v_resultado_anterior TEXT;
  v_stake NUMERIC;
  v_odd NUMERIC;
  v_novo_lucro NUMERIC := 0;
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
  v_has_pernas BOOLEAN := FALSE;
  v_perna_count INTEGER := 0;
  v_total_diferenca NUMERIC := 0;
  v_stake_real NUMERIC;
  v_stake_freebet NUMERIC;
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
  
  IF v_resultado_anterior = p_novo_resultado THEN
    RETURN jsonb_build_object('success', true, 'message', 'Resultado já é o mesmo', 'resultado', p_novo_resultado);
  END IF;

  -- Detectar multi-entry
  SELECT COUNT(*) INTO v_perna_count FROM apostas_pernas WHERE aposta_id = p_aposta_id;
  v_has_pernas := v_perna_count > 0;

  IF v_has_pernas THEN
    -- ============== MULTI-ENTRY PATH ==============
    -- Cada perna calcula impacto com split real + freebet (SNR)
    FOR v_perna IN
      SELECT * FROM apostas_pernas WHERE aposta_id = p_aposta_id ORDER BY ordem
    LOOP
      v_odd := COALESCE(v_perna.odd, 1);
      v_stake := COALESCE(v_perna.stake, 0);
      v_stake_freebet := COALESCE(v_perna.stake_freebet, 0);
      -- stake_real: usar coluna se presente, senão derivar
      v_stake_real := COALESCE(v_perna.stake_real, GREATEST(v_stake - v_stake_freebet, 0));
      v_is_freebet := v_stake_freebet > 0 AND v_stake_real <= 0;
      v_tipo_uso := CASE WHEN v_is_freebet THEN 'FREEBET' ELSE 'NORMAL' END;

      -- Impacto = lucro_real(stake_real) + lucro_freebet_SNR(stake_freebet)
      v_impacto_anterior := 
        CASE v_resultado_anterior
          WHEN 'GREEN' THEN v_stake_real * (v_odd - 1) + v_stake_freebet * (v_odd - 1)
          WHEN 'MEIO_GREEN' THEN (v_stake_real * (v_odd - 1) + v_stake_freebet * (v_odd - 1)) / 2
          WHEN 'VOID' THEN 0
          WHEN 'MEIO_RED' THEN -v_stake_real / 2
          WHEN 'RED' THEN -v_stake_real
          ELSE -v_stake_real
        END;

      v_impacto_novo := 
        CASE p_novo_resultado
          WHEN 'GREEN' THEN v_stake_real * (v_odd - 1) + v_stake_freebet * (v_odd - 1)
          WHEN 'MEIO_GREEN' THEN (v_stake_real * (v_odd - 1) + v_stake_freebet * (v_odd - 1)) / 2
          WHEN 'VOID' THEN 0
          WHEN 'MEIO_RED' THEN -v_stake_real / 2
          WHEN 'RED' THEN -v_stake_real
          ELSE -v_stake_real
        END;

      v_diferenca := v_impacto_novo - v_impacto_anterior;
      v_total_diferenca := v_total_diferenca + v_diferenca;

      -- Atualizar a perna com lucro consolidado (real + freebet)
      UPDATE apostas_pernas
      SET
        resultado = p_novo_resultado,
        lucro_prejuizo = v_impacto_novo,
        updated_at = now()
      WHERE id = v_perna.id;

      -- Evento de AJUSTE idempotente por perna
      v_idempotency_key := 'reliq_perna_' || v_perna.id::TEXT || '_' ||
                           COALESCE(v_resultado_anterior, 'NULL') || '_to_' || p_novo_resultado;

      IF v_perna.bookmaker_id IS NOT NULL AND v_diferenca <> 0 THEN
        SELECT id INTO v_evento_existente
        FROM financial_events WHERE idempotency_key = v_idempotency_key;

        IF v_evento_existente IS NULL THEN
          INSERT INTO financial_events (
            bookmaker_id, aposta_id, tipo_evento, tipo_uso,
            valor, moeda, workspace_id, idempotency_key, created_by, processed_at, descricao
          ) VALUES (
            v_perna.bookmaker_id, p_aposta_id, 'AJUSTE', v_tipo_uso,
            v_diferenca, v_perna.moeda, v_aposta.workspace_id, v_idempotency_key, auth.uid(), now(),
            format('Reliquidação multi-entry perna %s (%s -> %s) [real=%s fb=%s]',
                   v_perna.ordem, COALESCE(v_resultado_anterior,'NULL'), p_novo_resultado,
                   v_stake_real, v_stake_freebet)
          );
        END IF;
      END IF;
    END LOOP;

    -- Para multi-entry, lucro do pai = soma dos lucros das pernas (moeda nativa indicativa)
    SELECT COALESCE(SUM(lucro_prejuizo), 0) INTO v_novo_lucro
    FROM apostas_pernas WHERE aposta_id = p_aposta_id;

    IF p_lucro_prejuizo IS NOT NULL THEN
      v_novo_lucro := p_lucro_prejuizo;
    END IF;

    UPDATE apostas_unificada
    SET
      resultado = p_novo_resultado,
      status = 'LIQUIDADA',
      lucro_prejuizo = v_novo_lucro,
      updated_at = now()
    WHERE id = p_aposta_id;

    RETURN jsonb_build_object(
      'success', true,
      'multi_entry', true,
      'pernas_processadas', v_perna_count,
      'resultado_anterior', v_resultado_anterior,
      'resultado_novo', p_novo_resultado,
      'diferenca_total_nominal', v_total_diferenca,
      'lucro_prejuizo', v_novo_lucro
    );
  END IF;

  -- ============== SINGLE-ENTRY PATH (preserva comportamento original) ==============
  v_stake := COALESCE(v_aposta.stake, 0);
  v_odd := COALESCE(v_aposta.odd, v_aposta.odd_final, 1);
  v_bookmaker_id := v_aposta.bookmaker_id;
  v_workspace_id := v_aposta.workspace_id;
  v_user_id := v_aposta.user_id;
  v_moeda := v_aposta.moeda;
  v_is_freebet := (v_aposta.usar_freebet OR v_aposta.fonte_saldo = 'FREEBET');
  v_tipo_uso := CASE WHEN v_is_freebet THEN 'FREEBET' ELSE 'NORMAL' END;
  
  v_impacto_anterior := CASE v_resultado_anterior
    WHEN 'GREEN' THEN v_stake * (v_odd - 1)
    WHEN 'MEIO_GREEN' THEN v_stake * (v_odd - 1) / 2
    WHEN 'VOID' THEN 0
    WHEN 'MEIO_RED' THEN CASE WHEN v_is_freebet THEN 0 ELSE -v_stake / 2 END
    WHEN 'RED' THEN CASE WHEN v_is_freebet THEN 0 ELSE -v_stake END
    ELSE CASE WHEN v_is_freebet THEN 0 ELSE -v_stake END
  END;
  
  v_impacto_novo := CASE p_novo_resultado
    WHEN 'GREEN' THEN v_stake * (v_odd - 1)
    WHEN 'MEIO_GREEN' THEN v_stake * (v_odd - 1) / 2
    WHEN 'VOID' THEN 0
    WHEN 'MEIO_RED' THEN CASE WHEN v_is_freebet THEN 0 ELSE -v_stake / 2 END
    WHEN 'RED' THEN CASE WHEN v_is_freebet THEN 0 ELSE -v_stake END
    ELSE CASE WHEN v_is_freebet THEN 0 ELSE -v_stake END
  END;
  
  v_diferenca := v_impacto_novo - v_impacto_anterior;
  
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
  
  v_idempotency_key := 'reliq_' || p_aposta_id::TEXT || '_' || 
                       COALESCE(v_resultado_anterior, 'NULL') || '_to_' || p_novo_resultado;
  
  IF v_bookmaker_id IS NOT NULL AND v_diferenca <> 0 THEN
    SELECT id INTO v_evento_existente
    FROM financial_events WHERE idempotency_key = v_idempotency_key;
    
    IF v_evento_existente IS NULL THEN
      INSERT INTO financial_events (
        bookmaker_id, aposta_id, tipo_evento, tipo_uso,
        valor, moeda, workspace_id, idempotency_key, created_by, processed_at, descricao
      ) VALUES (
        v_bookmaker_id, p_aposta_id, 'AJUSTE', v_tipo_uso,
        v_diferenca, v_moeda, v_workspace_id, v_idempotency_key, auth.uid(), now(),
        format('Reliquidação single-entry (%s -> %s)', COALESCE(v_resultado_anterior,'NULL'), p_novo_resultado)
      );
    END IF;
  END IF;
  
  UPDATE apostas_unificada
  SET
    resultado = p_novo_resultado,
    status = 'LIQUIDADA',
    lucro_prejuizo = v_novo_lucro,
    updated_at = now()
  WHERE id = p_aposta_id;
  
  RETURN jsonb_build_object(
    'success', true,
    'multi_entry', false,
    'resultado_anterior', v_resultado_anterior,
    'resultado_novo', p_novo_resultado,
    'diferenca', v_diferenca,
    'lucro_prejuizo', v_novo_lucro
  );
END;
$function$;