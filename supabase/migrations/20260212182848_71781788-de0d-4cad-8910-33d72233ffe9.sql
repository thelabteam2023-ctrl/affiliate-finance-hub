
-- =================================================================
-- FIX: liquidar_aposta_v4 e reliquidar_aposta_v6 devem usar odd_final
-- para apostas MULTIPLA onde odd é NULL mas odd_final tem a odd combinada
-- =================================================================

-- 1. Recriar liquidar_aposta_v4 com COALESCE(odd, odd_final, 1)
CREATE OR REPLACE FUNCTION public.liquidar_aposta_v4(
  p_aposta_id UUID,
  p_resultado TEXT,
  p_lucro_prejuizo NUMERIC DEFAULT NULL
)
RETURNS TABLE(success BOOLEAN, events_created INTEGER, message TEXT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_aposta RECORD;
  v_payout NUMERIC := 0;
  v_event_id UUID;
  v_events_count INTEGER := 0;
  v_tipo_evento TEXT;
  v_tipo_uso TEXT;
  v_stake_evento TEXT;
  v_has_stake_event BOOLEAN := FALSE;
  v_odd NUMERIC;
BEGIN
  -- Buscar aposta
  SELECT * INTO v_aposta FROM apostas_unificada WHERE id = p_aposta_id FOR UPDATE;

  IF v_aposta.id IS NULL THEN
    RETURN QUERY SELECT FALSE, 0, 'Aposta não encontrada'::TEXT;
    RETURN;
  END IF;

  IF v_aposta.status = 'LIQUIDADA' THEN
    RETURN QUERY SELECT FALSE, 0, 'Aposta já liquidada'::TEXT;
    RETURN;
  END IF;

  -- FIX: Usar odd_final como fallback para MULTIPLA
  v_odd := COALESCE(v_aposta.odd, v_aposta.odd_final, 1);

  -- Determinar tipo de uso
  IF v_aposta.fonte_saldo = 'FREEBET' OR v_aposta.usar_freebet THEN
    v_tipo_uso := 'FREEBET';
    v_stake_evento := 'FREEBET_STAKE';
  ELSE
    v_tipo_uso := 'NORMAL';
    v_stake_evento := 'STAKE';
  END IF;

  -- GARANTIA DE INTEGRIDADE (LEGADO): STAKE pode não existir
  SELECT EXISTS(
    SELECT 1
    FROM financial_events
    WHERE aposta_id = v_aposta.id
      AND tipo_evento = v_stake_evento
      AND idempotency_key = 'stake_' || v_aposta.id::TEXT
  ) INTO v_has_stake_event;

  IF NOT v_has_stake_event THEN
    INSERT INTO financial_events (
      bookmaker_id, aposta_id, workspace_id, tipo_evento, tipo_uso,
      valor, moeda, idempotency_key, descricao, processed_at, created_by
    ) VALUES (
      v_aposta.bookmaker_id,
      v_aposta.id,
      v_aposta.workspace_id,
      v_stake_evento,
      v_tipo_uso,
      -v_aposta.stake,
      v_aposta.moeda_operacao,
      'stake_' || v_aposta.id::TEXT,
      'Débito de stake para aposta (auto-heal na liquidação)',
      now(),
      auth.uid()
    )
    ON CONFLICT DO NOTHING
    RETURNING id INTO v_event_id;

    v_events_count := v_events_count + 1;
  END IF;

  -- Calcular payout baseado no resultado (USANDO v_odd que inclui odd_final)
  CASE p_resultado
    WHEN 'GREEN' THEN
      IF v_tipo_uso = 'FREEBET' THEN
        v_payout := v_aposta.stake * (v_odd - 1);
        v_tipo_evento := 'FREEBET_PAYOUT';
      ELSE
        v_payout := v_aposta.stake * v_odd;
        v_tipo_evento := 'PAYOUT';
      END IF;

    WHEN 'RED' THEN
      v_payout := 0;
      v_tipo_evento := NULL;

    WHEN 'VOID' THEN
      v_payout := v_aposta.stake;
      v_tipo_evento := 'VOID_REFUND';

    WHEN 'MEIO_GREEN' THEN
      IF v_tipo_uso = 'FREEBET' THEN
        v_payout := v_aposta.stake * (v_odd - 1) / 2;
        v_tipo_evento := 'FREEBET_PAYOUT';
      ELSE
        v_payout := v_aposta.stake + (v_aposta.stake * (v_odd - 1) / 2);
        v_tipo_evento := 'PAYOUT';
      END IF;

    WHEN 'MEIO_RED' THEN
      v_payout := v_aposta.stake / 2;
      v_tipo_evento := 'VOID_REFUND';

    ELSE
      RETURN QUERY SELECT FALSE, 0, format('Resultado inválido: %s', p_resultado)::TEXT;
      RETURN;
  END CASE;

  -- Criar evento de payout se aplicável
  IF v_tipo_evento IS NOT NULL AND v_payout > 0 THEN
    INSERT INTO financial_events (
      bookmaker_id, aposta_id, workspace_id, tipo_evento, tipo_uso,
      origem, valor, moeda, idempotency_key, descricao, processed_at, created_by
    ) VALUES (
      v_aposta.bookmaker_id,
      v_aposta.id,
      v_aposta.workspace_id,
      v_tipo_evento,
      CASE WHEN v_tipo_evento LIKE 'FREEBET%' THEN 'NORMAL' ELSE v_tipo_uso END,
      'LUCRO',
      v_payout,
      v_aposta.moeda_operacao,
      'payout_' || v_aposta.id::TEXT || '_' || p_resultado,
      format('Payout %s: %s (odd=%s)', p_resultado, v_payout, v_odd),
      now(),
      auth.uid()
    )
    ON CONFLICT DO NOTHING
    RETURNING id INTO v_event_id;

    IF v_event_id IS NOT NULL THEN
      v_events_count := v_events_count + 1;
    END IF;
  END IF;

  -- Atualizar status da aposta
  UPDATE apostas_unificada
  SET 
    status = 'LIQUIDADA',
    resultado = p_resultado,
    lucro_prejuizo = COALESCE(p_lucro_prejuizo, 
      CASE p_resultado
        WHEN 'GREEN' THEN v_aposta.stake * (v_odd - 1)
        WHEN 'MEIO_GREEN' THEN v_aposta.stake * (v_odd - 1) / 2
        WHEN 'VOID' THEN 0
        WHEN 'MEIO_RED' THEN -(v_aposta.stake / 2)
        WHEN 'RED' THEN -v_aposta.stake
        ELSE 0
      END
    ),
    valor_retorno = CASE p_resultado
      WHEN 'GREEN' THEN v_aposta.stake * v_odd
      WHEN 'MEIO_GREEN' THEN v_aposta.stake + (v_aposta.stake * (v_odd - 1) / 2)
      WHEN 'VOID' THEN v_aposta.stake
      WHEN 'MEIO_RED' THEN v_aposta.stake / 2
      WHEN 'RED' THEN 0
      ELSE 0
    END,
    updated_at = now()
  WHERE id = p_aposta_id;

  RETURN QUERY SELECT TRUE, v_events_count, format('Liquidação concluída: %s', p_resultado)::TEXT;
END;
$$;


-- 2. Recriar reliquidar_aposta_v6 com COALESCE(odd, odd_final, 1)
CREATE OR REPLACE FUNCTION public.reliquidar_aposta_v6(
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
  v_stake NUMERIC;
  v_odd NUMERIC;
  v_novo_lucro NUMERIC;
  v_bookmaker_id UUID;
  v_workspace_id UUID;
  v_user_id UUID;
  v_usar_freebet BOOLEAN;
  v_tipo_uso TEXT;
  v_impacto_anterior NUMERIC;
  v_impacto_novo NUMERIC;
  v_diferenca NUMERIC;
  v_idempotency_key TEXT;
  v_moeda TEXT;
  v_evento_existente UUID;
BEGIN
  -- ETAPA 1: Buscar e bloquear aposta
  SELECT 
    au.id,
    au.resultado,
    au.lucro_prejuizo,
    au.stake,
    au.odd,
    au.odd_final,
    au.bookmaker_id,
    au.workspace_id,
    au.user_id,
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
  
  -- ETAPA 2: Validar e guardar valores
  v_resultado_anterior := v_aposta.resultado;
  v_stake := COALESCE(v_aposta.stake, 0);
  -- FIX: Usar odd_final como fallback para MULTIPLA
  v_odd := COALESCE(v_aposta.odd, v_aposta.odd_final, 1);
  v_bookmaker_id := v_aposta.bookmaker_id;
  v_workspace_id := v_aposta.workspace_id;
  v_user_id := v_aposta.user_id;
  v_usar_freebet := v_aposta.usar_freebet;
  v_moeda := v_aposta.moeda;
  
  -- GUARD: Se resultado é o mesmo, retornar sem fazer nada
  IF v_resultado_anterior = p_novo_resultado THEN
    RETURN jsonb_build_object(
      'success', true, 
      'message', 'Resultado já é o mesmo, nenhuma alteração necessária',
      'resultado', p_novo_resultado
    );
  END IF;
  
  -- Determinar tipo_uso
  IF v_usar_freebet OR v_aposta.fonte_saldo = 'FREEBET' THEN
    v_tipo_uso := 'FREEBET';
  ELSE
    v_tipo_uso := 'NORMAL';
  END IF;
  
  -- ETAPA 3: Calcular impacto financeiro (retorno - stake)
  v_impacto_anterior := CASE v_resultado_anterior
    WHEN 'GREEN' THEN v_stake * v_odd - v_stake
    WHEN 'MEIO_GREEN' THEN (v_stake * (1 + (v_odd - 1) / 2)) - v_stake
    WHEN 'VOID' THEN 0
    WHEN 'MEIO_RED' THEN -v_stake / 2
    WHEN 'RED' THEN -v_stake
    ELSE -v_stake  -- PENDENTE = stake debitado
  END;
  
  v_impacto_novo := CASE p_novo_resultado
    WHEN 'GREEN' THEN v_stake * v_odd - v_stake
    WHEN 'MEIO_GREEN' THEN (v_stake * (1 + (v_odd - 1) / 2)) - v_stake
    WHEN 'VOID' THEN 0
    WHEN 'MEIO_RED' THEN -v_stake / 2
    WHEN 'RED' THEN -v_stake
    ELSE -v_stake
  END;
  
  v_diferenca := v_impacto_novo - v_impacto_anterior;
  
  -- Calcular lucro/prejuízo para registrar na aposta
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
  
  -- ETAPA 4: Criar evento de AJUSTE (IDEMPOTENTE!)
  v_idempotency_key := 'reliq_' || p_aposta_id::TEXT || '_' || 
                       COALESCE(v_resultado_anterior, 'NULL') || '_to_' || p_novo_resultado;
  
  IF v_bookmaker_id IS NOT NULL AND v_diferenca <> 0 THEN
    SELECT id INTO v_evento_existente
    FROM financial_events
    WHERE idempotency_key = v_idempotency_key;
    
    IF v_evento_existente IS NULL THEN
      INSERT INTO financial_events (
        bookmaker_id,
        aposta_id,
        tipo_evento,
        tipo_uso,
        valor,
        moeda,
        workspace_id,
        idempotency_key,
        created_by,
        processed_at
      ) VALUES (
        v_bookmaker_id,
        p_aposta_id,
        'AJUSTE',
        v_tipo_uso,
        v_diferenca,
        v_moeda,
        v_workspace_id,
        v_idempotency_key,
        auth.uid(),
        now()
      );
    END IF;
  END IF;
  
  -- ETAPA 5: Atualizar aposta
  UPDATE apostas_unificada
  SET
    resultado = p_novo_resultado,
    status = 'LIQUIDADA',
    lucro_prejuizo = v_novo_lucro,
    valor_retorno = CASE p_novo_resultado
      WHEN 'GREEN' THEN v_stake * v_odd
      WHEN 'MEIO_GREEN' THEN v_stake + (v_stake * (v_odd - 1) / 2)
      WHEN 'VOID' THEN v_stake
      WHEN 'MEIO_RED' THEN v_stake / 2
      WHEN 'RED' THEN 0
      ELSE 0
    END,
    updated_at = now()
  WHERE id = p_aposta_id;
  
  -- Retorno
  RETURN jsonb_build_object(
    'success', true,
    'resultado_anterior', v_resultado_anterior,
    'resultado_novo', p_novo_resultado,
    'stake', v_stake,
    'odd', v_odd,
    'impacto_anterior', v_impacto_anterior,
    'impacto_novo', v_impacto_novo,
    'diferenca_ajuste', v_diferenca,
    'lucro_prejuizo', v_novo_lucro
  );
END;
$$;
