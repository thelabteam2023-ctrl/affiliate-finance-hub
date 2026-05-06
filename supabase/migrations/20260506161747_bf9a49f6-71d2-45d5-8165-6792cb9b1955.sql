CREATE OR REPLACE FUNCTION public.rpc_override_surebet_v1(
  p_aposta_id UUID,
  p_novo_resultado TEXT,
  p_novo_lucro NUMERIC,
  p_perna_id_ajuste UUID,
  p_motivo TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
DECLARE
  v_old_lucro NUMERIC;
  v_delta NUMERIC;
  v_workspace_id UUID;
  v_projeto_id UUID;
  v_bookmaker_id UUID;
  v_moeda TEXT;
  v_user_id UUID := auth.uid();
  v_forma_reg TEXT;
BEGIN
  -- 1. Validar aposta
  SELECT workspace_id, projeto_id, lucro_prejuizo, forma_registro
  INTO v_workspace_id, v_projeto_id, v_old_lucro, v_forma_reg
  FROM public.apostas_unificada
  WHERE id = p_aposta_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Aposta não encontrada');
  END IF;

  IF v_forma_reg <> 'ARBITRAGEM' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Override manual só é permitido para Surebets (ARBITRAGEM)');
  END IF;

  -- 2. Calcular Delta
  v_delta := p_novo_lucro - COALESCE(v_old_lucro, 0);

  -- 3. Identificar casa/moeda para o ajuste do Ledger
  IF p_perna_id_ajuste IS NOT NULL THEN
    SELECT bookmaker_id, moeda INTO v_bookmaker_id, v_moeda
    FROM public.apostas_pernas
    WHERE id = p_perna_id_ajuste AND aposta_id = p_aposta_id;
  ELSE
    SELECT bookmaker_id, moeda INTO v_bookmaker_id, v_moeda
    FROM public.apostas_pernas
    WHERE aposta_id = p_aposta_id
    ORDER BY ordem ASC LIMIT 1;
  END IF;

  IF v_bookmaker_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Não foi possível identificar uma casa para o ajuste financeiro');
  END IF;

  -- 4. Criar Evento Financeiro de Ajuste (Ledger) se houver delta
  -- tipo_uso deve ser 'NORMAL' ou 'FREEBET'
  -- origem deve ser um dos permitidos (ex: 'AJUSTE_MANUAL')
  IF ABS(v_delta) > 0.0001 THEN
    INSERT INTO public.financial_events (
      bookmaker_id, aposta_id, workspace_id, tipo_evento, tipo_uso,
      origem, valor, moeda, idempotency_key, descricao, created_by, metadata
    ) VALUES (
      v_bookmaker_id, p_aposta_id, v_workspace_id, 'AJUSTE', 'NORMAL',
      'AJUSTE_MANUAL', v_delta, v_moeda,
      'override_' || p_aposta_id || '_' || extract(epoch from now()),
      'Ajuste manual de lucro (Surebet): ' || p_motivo,
      v_user_id,
      jsonb_build_object('old_lucro', v_old_lucro, 'new_lucro', p_novo_lucro, 'delta', v_delta, 'perna_id', p_perna_id_ajuste)
    );
  END IF;

  -- 5. Atualizar Aposta Unificada
  UPDATE public.apostas_unificada SET
    is_manual_override = true,
    manual_override_at = NOW(),
    manual_override_by = v_user_id,
    manual_override_reason = p_motivo,
    lucro_prejuizo = p_novo_lucro,
    pl_consolidado = p_novo_lucro,
    resultado = p_novo_resultado,
    updated_at = NOW()
  WHERE id = p_aposta_id;

  RETURN jsonb_build_object(
    'success', true, 
    'message', 'Override aplicado com sucesso', 
    'delta', v_delta,
    'house_adjusted', v_bookmaker_id
  );
END;
$function$;
