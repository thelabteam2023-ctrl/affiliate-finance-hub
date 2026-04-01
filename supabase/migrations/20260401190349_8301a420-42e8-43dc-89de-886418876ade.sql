
-- =============================================================================
-- FIX: Stake split inválido na criação de surebet
-- Problema: RPC criar_surebet_atomica não passa stake_real/stake_freebet no INSERT pai
-- O trigger de normalização recebe total=X, real=0, freebet=0 e rejeita
-- 
-- Correção 1: Tornar trigger resiliente (se ambos são 0 mas total > 0, inferir real=total)
-- Correção 2: RPC agora calcula e passa stake_real/stake_freebet agregados
-- =============================================================================

-- PARTE 1: Corrigir trigger para ser resiliente
CREATE OR REPLACE FUNCTION public.normalize_apostas_unificada_stake_split()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_total NUMERIC;
  v_real NUMERIC;
  v_freebet NUMERIC;
BEGIN
  v_total := COALESCE(NEW.stake_total, NEW.stake, 0);

  -- Se stake_real é explicitamente 0 (ou NULL), determinar o valor correto
  v_real := COALESCE(NULLIF(NEW.stake_real, 0), NULL);
  v_freebet := COALESCE(NULLIF(NEW.stake_freebet, 0), NULL);

  -- Se ambos são NULL/0, inferir a partir de fonte_saldo
  IF v_real IS NULL AND v_freebet IS NULL THEN
    IF NEW.fonte_saldo = 'FREEBET' OR NEW.usar_freebet = TRUE THEN
      v_real := 0;
      v_freebet := v_total;
    ELSE
      v_real := v_total;
      v_freebet := 0;
    END IF;
  ELSIF v_real IS NULL THEN
    v_real := GREATEST(v_total - v_freebet, 0);
  ELSIF v_freebet IS NULL THEN
    v_freebet := GREATEST(v_total - v_real, 0);
  END IF;

  v_real := GREATEST(0, v_real);
  v_freebet := GREATEST(0, v_freebet);

  IF v_total = 0 THEN
    v_total := v_real + v_freebet;
  END IF;

  -- Tolerância para arredondamento
  IF ABS(v_total - (v_real + v_freebet)) > 0.02 THEN
    RAISE EXCEPTION 'Stake split inválido em apostas_unificada: total %, real %, freebet %', v_total, v_real, v_freebet;
  END IF;

  -- Ajustar para garantir consistência exata
  IF ABS(v_total - (v_real + v_freebet)) > 0 AND ABS(v_total - (v_real + v_freebet)) <= 0.02 THEN
    v_real := v_total - v_freebet;
  END IF;

  NEW.stake_total := ROUND(v_total, 2);
  NEW.stake_real := ROUND(v_real, 2);
  NEW.stake_freebet := ROUND(v_freebet, 2);
  NEW.stake := ROUND(v_total, 2);

  RETURN NEW;
END;
$$;

-- PARTE 2: Corrigir trigger de pernas também
CREATE OR REPLACE FUNCTION public.normalize_apostas_pernas_stake_split()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_total NUMERIC;
  v_real NUMERIC;
  v_freebet NUMERIC;
BEGIN
  v_total := COALESCE(NEW.stake, 0);

  v_real := COALESCE(NULLIF(NEW.stake_real, 0), NULL);
  v_freebet := COALESCE(NULLIF(NEW.stake_freebet, 0), NULL);

  IF v_real IS NULL AND v_freebet IS NULL THEN
    IF NEW.fonte_saldo = 'FREEBET' THEN
      v_real := 0;
      v_freebet := v_total;
    ELSE
      v_real := v_total;
      v_freebet := 0;
    END IF;
  ELSIF v_real IS NULL THEN
    v_real := GREATEST(v_total - v_freebet, 0);
  ELSIF v_freebet IS NULL THEN
    v_freebet := GREATEST(v_total - v_real, 0);
  END IF;

  v_real := GREATEST(0, v_real);
  v_freebet := GREATEST(0, v_freebet);

  IF v_total = 0 THEN
    v_total := v_real + v_freebet;
  END IF;

  IF ABS(v_total - (v_real + v_freebet)) > 0.02 THEN
    RAISE EXCEPTION 'Stake split inválido em apostas_pernas: total %, real %, freebet %', v_total, v_real, v_freebet;
  END IF;

  IF ABS(v_total - (v_real + v_freebet)) > 0 AND ABS(v_total - (v_real + v_freebet)) <= 0.02 THEN
    v_real := v_total - v_freebet;
  END IF;

  NEW.stake := ROUND(v_total, 2);
  NEW.stake_real := ROUND(v_real, 2);
  NEW.stake_freebet := ROUND(v_freebet, 2);

  RETURN NEW;
END;
$$;

-- PARTE 3: Atualizar RPC criar_surebet_atomica para passar stake_real/stake_freebet
CREATE OR REPLACE FUNCTION public.criar_surebet_atomica(
  p_workspace_id uuid,
  p_user_id uuid,
  p_projeto_id uuid,
  p_evento text,
  p_esporte text DEFAULT NULL::text,
  p_mercado text DEFAULT NULL::text,
  p_modelo text DEFAULT NULL::text,
  p_estrategia text DEFAULT 'SUREBET'::text,
  p_contexto_operacional text DEFAULT 'NORMAL'::text,
  p_data_aposta text DEFAULT NULL::text,
  p_pernas jsonb DEFAULT '[]'::jsonb
)
RETURNS TABLE(success boolean, aposta_id uuid, events_created integer, message text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
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
  v_saldo_freebet NUMERIC;
  v_bookmaker_status TEXT;
  v_stake_total NUMERIC := 0;
  v_stake_real_total NUMERIC := 0;
  v_stake_freebet_total NUMERIC := 0;
  v_events_created INTEGER := 0;
  v_perna_id UUID;
  v_event_id UUID;
  v_roi_esperado NUMERIC;
  v_lucro_esperado NUMERIC;
  v_inverse_sum NUMERIC := 0;
  v_cotacao_snapshot NUMERIC;
  v_stake_brl_referencia NUMERIC;
  v_fonte_saldo TEXT;
  v_data_aposta timestamptz;
  v_perna_stake_real NUMERIC;
  v_perna_stake_freebet NUMERIC;
BEGIN
  IF p_data_aposta IS NULL OR btrim(p_data_aposta) = '' THEN
    v_data_aposta := now();
  ELSE
    v_data_aposta := p_data_aposta::timestamptz;
  END IF;

  IF jsonb_array_length(p_pernas) < 2 THEN
    RETURN QUERY SELECT 
      FALSE::BOOLEAN, NULL::UUID, 0::INTEGER, 
      'Surebet requer no mínimo 2 pernas'::TEXT;
    RETURN;
  END IF;

  -- Primeira passada: validar saldos e acumular totais
  FOR v_perna IN SELECT * FROM jsonb_array_elements(p_pernas)
  LOOP
    v_perna_idx := v_perna_idx + 1;
    v_bookmaker_id := (v_perna->>'bookmaker_id')::UUID;
    v_stake := (v_perna->>'stake')::NUMERIC;
    v_odd := (v_perna->>'odd')::NUMERIC;
    v_fonte_saldo := COALESCE(v_perna->>'fonte_saldo', 'REAL');
    
    SELECT b.saldo_atual, b.saldo_freebet, b.status 
    INTO v_saldo_atual, v_saldo_freebet, v_bookmaker_status
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
    
    IF v_fonte_saldo = 'FREEBET' THEN
      IF v_stake > COALESCE(v_saldo_freebet, 0) THEN
        RETURN QUERY SELECT 
          FALSE::BOOLEAN, NULL::UUID, 0::INTEGER, 
          format('Perna %s: Saldo freebet insuficiente (stake: %s, disponível: %s)', v_perna_idx, v_stake, COALESCE(v_saldo_freebet, 0))::TEXT;
        RETURN;
      END IF;
      v_stake_freebet_total := v_stake_freebet_total + v_stake;
    ELSE
      IF v_stake > v_saldo_atual THEN
        RETURN QUERY SELECT 
          FALSE::BOOLEAN, NULL::UUID, 0::INTEGER, 
          format('Perna %s: Saldo insuficiente (stake: %s, disponível: %s)', v_perna_idx, v_stake, v_saldo_atual)::TEXT;
        RETURN;
      END IF;
      v_stake_real_total := v_stake_real_total + v_stake;
    END IF;
    
    v_stake_total := v_stake_total + v_stake;
    v_inverse_sum := v_inverse_sum + (1.0 / v_odd);
  END LOOP;
  
  v_roi_esperado := (1.0 - v_inverse_sum) * 100;
  v_lucro_esperado := v_stake_total * (v_roi_esperado / 100);
  
  -- Inserir registro pai com stake_real e stake_freebet calculados
  INSERT INTO apostas_unificada (
    workspace_id, user_id, projeto_id,
    forma_registro, estrategia, contexto_operacional,
    evento, esporte, mercado, modelo,
    data_aposta, stake_total, stake_real, stake_freebet,
    lucro_esperado, roi_esperado,
    status, resultado
  ) VALUES (
    p_workspace_id, p_user_id, p_projeto_id,
    'ARBITRAGEM', p_estrategia, p_contexto_operacional,
    p_evento, p_esporte, p_mercado, p_modelo,
    v_data_aposta, v_stake_total, v_stake_real_total, v_stake_freebet_total,
    v_lucro_esperado, v_roi_esperado,
    'PENDENTE', 'PENDENTE'
  )
  RETURNING id INTO v_aposta_id;

  -- Segunda passada: inserir pernas e eventos financeiros
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
    v_fonte_saldo := COALESCE(v_perna->>'fonte_saldo', 'REAL');

    -- Calcular split por perna
    IF v_fonte_saldo = 'FREEBET' THEN
      v_perna_stake_real := 0;
      v_perna_stake_freebet := v_stake;
    ELSE
      v_perna_stake_real := v_stake;
      v_perna_stake_freebet := 0;
    END IF;
    
    INSERT INTO apostas_pernas (
      aposta_id, bookmaker_id, ordem, selecao, selecao_livre,
      odd, stake, stake_real, stake_freebet,
      moeda, cotacao_snapshot, stake_brl_referencia, 
      resultado, fonte_saldo
    ) VALUES (
      v_aposta_id, v_bookmaker_id, v_perna_idx, v_selecao, v_selecao_livre,
      v_odd, v_stake, v_perna_stake_real, v_perna_stake_freebet,
      v_moeda, v_cotacao_snapshot, v_stake_brl_referencia, 
      NULL, v_fonte_saldo
    )
    RETURNING id INTO v_perna_id;
    
    INSERT INTO financial_events (
      bookmaker_id, aposta_id, workspace_id,
      tipo_evento, tipo_uso, origem, valor, moeda,
      idempotency_key, descricao, processed_at, created_by
    ) VALUES (
      v_bookmaker_id, v_aposta_id, p_workspace_id,
      'STAKE',
      CASE WHEN v_fonte_saldo = 'FREEBET' THEN 'FREEBET' ELSE 'NORMAL' END,
      'STAKE',
      -v_stake,
      v_moeda,
      'stake_' || v_aposta_id || '_leg' || v_perna_idx,
      'Stake Surebet Perna ' || v_perna_idx || CASE WHEN v_fonte_saldo = 'FREEBET' THEN ' (FB)' ELSE '' END,
      NOW(), p_user_id
    )
    RETURNING id INTO v_event_id;
    
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
$function$;

COMMENT ON FUNCTION criar_surebet_atomica IS 
'v10 - Corrigido stake split: agora calcula e passa stake_real/stake_freebet no registro pai e nas pernas.';
