-- =====================================================================================
-- FIX: atualizar_aposta_liquidada_atomica v2
-- Corrige o problema onde mudança de stake não era refletida no saldo
--
-- LÓGICA:
-- Para aposta RED: stake é a perda. Se stake muda de 85 → 35, a diferença (+50) é creditada
-- Para aposta GREEN: payout = stake + lucro. Se stake/odd mudam, reverter payout antigo e aplicar novo
-- =====================================================================================
CREATE OR REPLACE FUNCTION public.atualizar_aposta_liquidada_atomica_v2(
  p_aposta_id UUID,
  p_novo_bookmaker_id UUID DEFAULT NULL,
  p_novo_stake NUMERIC DEFAULT NULL,
  p_nova_odd NUMERIC DEFAULT NULL,
  p_nova_moeda TEXT DEFAULT NULL,
  p_novo_resultado TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public
AS $$
DECLARE
  v_aposta RECORD;
  v_workspace_id UUID;
  v_user_id UUID;
  v_resultado_atual TEXT;
  v_bookmaker_anterior_id UUID;
  v_stake_anterior NUMERIC;
  v_odd_anterior NUMERIC;
  v_moeda_anterior TEXT;
  v_lucro_anterior NUMERIC;
  v_bookmaker_novo_id UUID;
  v_stake_novo NUMERIC;
  v_odd_novo NUMERIC;
  v_moeda_nova TEXT;
  v_resultado_novo TEXT;
  v_lucro_novo NUMERIC;
  v_fonte_saldo TEXT;
  v_tipo_uso TEXT;
  v_idempotency_prefix TEXT;
  
  -- Para cálculos de impacto financeiro
  v_impacto_anterior NUMERIC; -- Impacto total no saldo do resultado anterior
  v_impacto_novo NUMERIC;     -- Impacto total no saldo do novo resultado
  v_diferenca NUMERIC;        -- Diferença a aplicar
BEGIN
  -- Lock para evitar race conditions
  SELECT * INTO v_aposta
  FROM apostas_unificada
  WHERE id = p_aposta_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'APOSTA_NAO_ENCONTRADA');
  END IF;

  -- Se não está liquidada, apenas atualizar campos
  IF v_aposta.status != 'LIQUIDADA' THEN
    UPDATE apostas_unificada
    SET 
      bookmaker_id = COALESCE(p_novo_bookmaker_id, bookmaker_id),
      stake = COALESCE(p_novo_stake, stake),
      odd = COALESCE(p_nova_odd, odd),
      moeda_operacao = COALESCE(p_nova_moeda, moeda_operacao),
      resultado = COALESCE(p_novo_resultado, resultado),
      updated_at = NOW()
    WHERE id = p_aposta_id;

    RETURN jsonb_build_object('success', true, 'message', 'Aposta não liquidada atualizada');
  END IF;

  v_workspace_id := v_aposta.workspace_id;
  v_user_id := v_aposta.user_id;
  v_resultado_atual := v_aposta.resultado;
  v_fonte_saldo := COALESCE(v_aposta.fonte_saldo, 'REAL');
  
  v_tipo_uso := CASE 
    WHEN v_fonte_saldo = 'FREEBET' THEN 'FREEBET'
    ELSE 'NORMAL'
  END;

  -- Valores anteriores
  v_bookmaker_anterior_id := v_aposta.bookmaker_id;
  v_stake_anterior := COALESCE(v_aposta.stake, 0);
  v_odd_anterior := COALESCE(v_aposta.odd, 1);
  v_moeda_anterior := COALESCE(v_aposta.moeda_operacao, 'BRL');
  v_lucro_anterior := COALESCE(v_aposta.lucro_prejuizo, 0);

  -- Valores novos
  v_bookmaker_novo_id := COALESCE(p_novo_bookmaker_id, v_bookmaker_anterior_id);
  v_stake_novo := COALESCE(p_novo_stake, v_stake_anterior);
  v_odd_novo := COALESCE(p_nova_odd, v_odd_anterior);
  v_moeda_nova := COALESCE(p_nova_moeda, v_moeda_anterior);
  v_resultado_novo := COALESCE(p_novo_resultado, v_resultado_atual);

  -- Verificar se houve alguma mudança
  IF v_bookmaker_novo_id = v_bookmaker_anterior_id
     AND v_stake_novo = v_stake_anterior
     AND v_odd_novo = v_odd_anterior
     AND v_resultado_novo = v_resultado_atual THEN
    RETURN jsonb_build_object('success', true, 'message', 'Nenhuma mudança detectada');
  END IF;

  v_idempotency_prefix := 'edit_v2_' || p_aposta_id::TEXT || '_' || EXTRACT(EPOCH FROM NOW())::TEXT;

  -- ==========================================================================
  -- CALCULAR IMPACTO FINANCEIRO ANTERIOR (quanto foi creditado/debitado)
  -- ==========================================================================
  -- O STAKE já foi debitado na criação. O "impacto" é o que foi creditado na liquidação.
  -- GREEN: creditou stake + lucro (retorno total)
  -- RED: creditou 0 (perdeu tudo)
  -- VOID: creditou stake (devolveu stake)
  -- MEIO_GREEN: creditou stake + (lucro/2)
  -- MEIO_RED: creditou stake/2
  
  CASE v_resultado_atual
    WHEN 'GREEN' THEN
      v_impacto_anterior := v_stake_anterior + v_lucro_anterior;
    WHEN 'RED' THEN
      v_impacto_anterior := 0;
    WHEN 'VOID' THEN
      v_impacto_anterior := v_stake_anterior;
    WHEN 'MEIO_GREEN' THEN
      v_impacto_anterior := v_stake_anterior + (v_lucro_anterior / 2);
    WHEN 'MEIO_RED' THEN
      v_impacto_anterior := v_stake_anterior / 2;
    ELSE
      v_impacto_anterior := 0;
  END CASE;

  -- ==========================================================================
  -- CALCULAR NOVO LUCRO E IMPACTO NOVO
  -- ==========================================================================
  CASE v_resultado_novo
    WHEN 'GREEN' THEN
      v_lucro_novo := (v_stake_novo * v_odd_novo) - v_stake_novo;
      v_impacto_novo := v_stake_novo + v_lucro_novo;
    WHEN 'RED' THEN
      v_lucro_novo := -v_stake_novo;
      v_impacto_novo := 0;
    WHEN 'VOID' THEN
      v_lucro_novo := 0;
      v_impacto_novo := v_stake_novo;
    WHEN 'MEIO_GREEN' THEN
      v_lucro_novo := ((v_stake_novo * v_odd_novo) - v_stake_novo) / 2;
      v_impacto_novo := v_stake_novo + v_lucro_novo;
    WHEN 'MEIO_RED' THEN
      v_lucro_novo := -v_stake_novo / 2;
      v_impacto_novo := v_stake_novo / 2;
    ELSE
      v_lucro_novo := 0;
      v_impacto_novo := 0;
  END CASE;

  -- ==========================================================================
  -- CALCULAR DIFERENÇA E AJUSTE DE STAKE
  -- ==========================================================================
  -- Se o stake mudou, também precisamos ajustar o débito original
  -- Stake anterior foi debitado (-stake_anterior), stake novo deveria ser (-stake_novo)
  -- Diferença de stake = stake_anterior - stake_novo (positivo se reduziu stake)
  
  -- Diferença de payout (crédito)
  v_diferenca := v_impacto_novo - v_impacto_anterior;
  
  -- Ajustar pela diferença de stake (se mudou)
  -- Se stake diminuiu de 85 → 35, a diferença de 50 deve ser creditada de volta
  IF v_stake_novo != v_stake_anterior THEN
    v_diferenca := v_diferenca + (v_stake_anterior - v_stake_novo);
  END IF;

  -- ==========================================================================
  -- INSERIR EVENTO DE AJUSTE SE HOUVER DIFERENÇA
  -- ==========================================================================
  IF v_diferenca != 0 THEN
    INSERT INTO financial_events (
      bookmaker_id, aposta_id, workspace_id, tipo_evento, tipo_uso, origem,
      valor, moeda, idempotency_key, descricao, metadata, processed_at, created_by
    ) VALUES (
      v_bookmaker_novo_id, p_aposta_id, v_workspace_id,
      'AJUSTE', v_tipo_uso, 'AJUSTE',
      v_diferenca, -- Positivo = crédito, Negativo = débito
      v_moeda_nova,
      v_idempotency_prefix || '_adj',
      'Ajuste por edição de aposta liquidada',
      jsonb_build_object(
        'resultado_anterior', v_resultado_atual,
        'resultado_novo', v_resultado_novo,
        'stake_anterior', v_stake_anterior,
        'stake_novo', v_stake_novo,
        'odd_anterior', v_odd_anterior,
        'odd_novo', v_odd_novo,
        'impacto_anterior', v_impacto_anterior,
        'impacto_novo', v_impacto_novo,
        'diferenca_aplicada', v_diferenca
      ),
      NOW(), v_user_id
    );
  END IF;

  -- ==========================================================================
  -- ATUALIZAR A APOSTA
  -- ==========================================================================
  UPDATE apostas_unificada
  SET 
    bookmaker_id = v_bookmaker_novo_id,
    stake = v_stake_novo,
    odd = v_odd_novo,
    moeda_operacao = v_moeda_nova,
    resultado = v_resultado_novo,
    lucro_prejuizo = v_lucro_novo,
    roi_real = CASE WHEN v_stake_novo > 0 THEN (v_lucro_novo / v_stake_novo) * 100 ELSE 0 END,
    status = 'LIQUIDADA',
    updated_at = NOW()
  WHERE id = p_aposta_id;

  RETURN jsonb_build_object(
    'success', true,
    'message', 'Aposta atualizada com sucesso',
    'diferenca_aplicada', v_diferenca,
    'lucro_novo', v_lucro_novo,
    'impacto_anterior', v_impacto_anterior,
    'impacto_novo', v_impacto_novo
  );

EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$;