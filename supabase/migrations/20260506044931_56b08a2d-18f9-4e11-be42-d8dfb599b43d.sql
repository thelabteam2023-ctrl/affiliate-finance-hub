-- ============================================================================
-- CORREÇÃO DEFINITIVA: Bug de liquidação de apostas Punter
-- ============================================================================
-- Problema: liquidar_aposta_v4 foi sobrescrita e agora FALHA para apostas simples
-- sem pernas porque tenta iterar por apostas_perna_entradas que não existem.
-- Resultado: status/resultado nunca mudam, lucro não é calculado, saldo não altera.
--
-- Solução: Recriar liquidar_aposta_v4 com fallback explícito para aposta simples
-- e remover função RPC órfã reliquidar_aposta_v6(p_aposta_id uuid).
-- ============================================================================

-- 1. REMOVER FUNÇÃO ÓRFÃ E AMBÍGUA
-- Evitar ambiguidade de RPC que pode quebrar chamadas futuras
DROP FUNCTION IF EXISTS public.reliquidar_aposta_v6(uuid);

-- 2. RECRIAR liquidar_aposta_v4 COM SUPORTE COMPLETO
-- Três caminhos: simples sem pernas, simples/múltipla com pernas, surebet
DROP FUNCTION IF EXISTS public.liquidar_aposta_v4(uuid, text, numeric);

CREATE OR REPLACE FUNCTION public.liquidar_aposta_v4(
  p_aposta_id uuid, 
  p_resultado text, 
  p_lucro_prejuizo numeric DEFAULT NULL::numeric
)
RETURNS TABLE(success boolean, events_created integer, message text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_aposta RECORD;
  v_perna RECORD;
  v_entry RECORD;
  v_events_count INTEGER := 0;
  v_payout NUMERIC;
  v_lucro NUMERIC;
  v_retorno NUMERIC;
  v_stake_real NUMERIC;
  v_stake_freebet NUMERIC;
  v_payout_real NUMERIC;
  v_payout_freebet NUMERIC;
  v_odd NUMERIC;
  v_type_evento TEXT;
  v_type_uso TEXT;
  v_event_id UUID;
  v_has_pernas BOOLEAN := FALSE;
  v_perna_count INTEGER := 0;
  v_consolidada NUMERIC;
  v_rate NUMERIC;
  v_proj_cotacao NUMERIC;
BEGIN
  -- Lock na aposta
  SELECT * INTO v_aposta FROM apostas_unificada WHERE id = p_aposta_id FOR UPDATE;
  
  IF v_aposta.id IS NULL THEN
    RETURN QUERY SELECT FALSE, 0, 'Aposta não encontrada'::TEXT;
    RETURN;
  END IF;
  
  IF v_aposta.status = 'LIQUIDADA' THEN
    RETURN QUERY SELECT FALSE, 0, 'Aposta já liquidada'::TEXT;
    RETURN;
  END IF;
  
  -- Verificar se tem pernas
  SELECT COUNT(*) INTO v_perna_count FROM apostas_pernas WHERE aposta_id = p_aposta_id;
  v_has_pernas := v_perna_count > 0;
  v_odd := COALESCE(v_aposta.odd, v_aposta.odd_final, 1);
  
  -- Obter cotação de consolidação do projeto
  SELECT COALESCE(cotacao_trabalho, 1) INTO v_proj_cotacao 
  FROM projetos WHERE id = v_aposta.projeto_id;
  
  -- ============= CAMINHO A: Aposta simples SEM pernas =============
  IF NOT v_has_pernas THEN
    v_stake_real := COALESCE(v_aposta.stake_real, v_aposta.stake);
    v_stake_freebet := COALESCE(v_aposta.stake_freebet, 0);
    
    -- Debitar STAKE REAL se não existir
    IF v_stake_real > 0 THEN
      SELECT EXISTS(
        SELECT 1 FROM financial_events 
        WHERE aposta_id = v_aposta.id 
          AND idempotency_key = 'stake_' || v_aposta.id::TEXT
      ) INTO v_has_pernas;  -- Reutilizando variável para check
      
      IF NOT v_has_pernas THEN
        INSERT INTO financial_events (
          bookmaker_id, aposta_id, workspace_id, tipo_evento, tipo_uso,
          valor, moeda, idempotency_key, descricao, processed_at, created_by
        ) VALUES (
          v_aposta.bookmaker_id, v_aposta.id, v_aposta.workspace_id,
          'STAKE', 'NORMAL',
          -v_stake_real, v_aposta.moeda_operacao,
          'stake_' || v_aposta.id::TEXT,
          'Débito de stake (aposta simples)',
          now(), auth.uid()
        ) ON CONFLICT DO NOTHING
        RETURNING id INTO v_event_id;
        IF v_event_id IS NOT NULL THEN v_events_count := v_events_count + 1; END IF;
      END IF;
    END IF;
    
    -- Debitar STAKE FREEBET se não existir
    IF v_stake_freebet > 0 THEN
      SELECT EXISTS(
        SELECT 1 FROM financial_events 
        WHERE aposta_id = v_aposta.id 
          AND idempotency_key = 'stake_fb_' || v_aposta.id::TEXT
      ) INTO v_has_pernas;
      
      IF NOT v_has_pernas THEN
        INSERT INTO financial_events (
          bookmaker_id, aposta_id, workspace_id, tipo_evento, tipo_uso,
          valor, moeda, idempotency_key, descricao, processed_at, created_by
        ) VALUES (
          v_aposta.bookmaker_id, v_aposta.id, v_aposta.workspace_id,
          'FREEBET_STAKE', 'FREEBET',
          -v_stake_freebet, v_aposta.moeda_operacao,
          'stake_fb_' || v_aposta.id::TEXT,
          'Débito de stake freebet (aposta simples)',
          now(), auth.uid()
        ) ON CONFLICT DO NOTHING
        RETURNING id INTO v_event_id;
        IF v_event_id IS NOT NULL THEN v_events_count := v_events_count + 1; END IF;
      END IF;
    END IF;
    
    -- Calcular payout e lucro conforme resultado
    v_payout := 0;
    v_lucro := COALESCE(p_lucro_prejuizo, 0);
    
    IF p_lucro_prejuizo IS NULL THEN
      -- Calcular lucro a partir do resultado
      CASE p_resultado
        WHEN 'GREEN' THEN
          v_payout := v_stake_real * v_odd + v_stake_freebet * (v_odd - 1);
          v_lucro := v_stake_real * (v_odd - 1) + v_stake_freebet * (v_odd - 1);
        WHEN 'RED' THEN
          v_payout := 0;
          v_lucro := -v_stake_real;
        WHEN 'VOID' THEN
          v_payout := v_stake_real;
          v_lucro := 0;
        WHEN 'MEIO_GREEN' THEN
          v_payout := v_stake_real + (v_stake_real * (v_odd - 1) / 2) + (v_stake_freebet * (v_odd - 1) / 2);
          v_lucro := (v_stake_real * (v_odd - 1) / 2) + (v_stake_freebet * (v_odd - 1) / 2);
        WHEN 'MEIO_RED' THEN
          v_payout := v_stake_real / 2;
          v_lucro := -(v_stake_real / 2);
        ELSE
          RETURN QUERY SELECT FALSE, 0, format('Resultado inválido: %s', p_resultado)::TEXT;
          RETURN;
      END CASE;
    ELSE
      v_payout := v_stake_real + p_lucro_prejuizo;
      IF v_payout < 0 THEN v_payout := 0; END IF;
    END IF;
    
    -- Criar evento PAYOUT/VOID_REFUND
    IF v_payout > 0 THEN
      v_type_evento := CASE 
        WHEN p_resultado IN ('GREEN', 'MEIO_GREEN') THEN 'PAYOUT'
        WHEN p_resultado IN ('VOID', 'MEIO_RED') THEN 'VOID_REFUND'
        ELSE NULL
      END;
      
      IF v_type_evento IS NOT NULL THEN
        INSERT INTO financial_events (
          bookmaker_id, aposta_id, workspace_id, tipo_evento, tipo_uso,
          origem, valor, moeda, idempotency_key, descricao, processed_at, created_by
        ) VALUES (
          v_aposta.bookmaker_id, v_aposta.id, v_aposta.workspace_id,
          v_type_evento, 'NORMAL', 'LUCRO',
          v_payout, v_aposta.moeda_operacao,
          'payout_' || v_aposta.id::TEXT || '_' || p_resultado,
          format('Payout %s: %s', p_resultado, v_payout),
          now(), auth.uid()
        ) ON CONFLICT DO NOTHING
        RETURNING id INTO v_event_id;
        IF v_event_id IS NOT NULL THEN v_events_count := v_events_count + 1; END IF;
      END IF;
    END IF;
    
    -- Atualizar aposta com status LIQUIDADA
    v_retorno := COALESCE(v_payout, 0);
    v_consolidada := v_lucro; -- Para simples, consolidado = nominal
    
    UPDATE apostas_unificada
    SET 
      status = 'LIQUIDADA',
      resultado = p_resultado,
      lucro_prejuizo = v_lucro,
      valor_retorno = v_retorno,
      pl_consolidado = v_consolidada,
      retorno_consolidado = v_retorno,
      consolidation_currency = 'BRL',  -- Simplificado para aposta simples
      is_multicurrency = FALSE,
      updated_at = now()
    WHERE id = p_aposta_id;
    
    RETURN QUERY SELECT TRUE, v_events_count, 'Aposta simples liquidada com sucesso'::TEXT;
    RETURN;
  END IF;
  
  -- ============= CAMINHO B: Aposta com pernas =============
  -- Processar cada perna e suas entradas
  FOR v_perna IN
    SELECT * FROM apostas_pernas WHERE aposta_id = p_aposta_id ORDER BY ordem
  LOOP
    -- Buscar entradas desta perna
    FOR v_entry IN
      SELECT * FROM apostas_perna_entradas WHERE perna_id = v_perna.id
    LOOP
      v_stake_real := COALESCE(v_entry.stake_real, v_entry.stake);
      v_stake_freebet := COALESCE(v_entry.stake_freebet, 0);
      v_odd := COALESCE(v_entry.odd, 1);
      
      -- Debitar STAKE da entrada
      IF v_stake_real > 0 THEN
        SELECT EXISTS(
          SELECT 1 FROM financial_events 
          WHERE aposta_id = v_aposta.id 
            AND idempotency_key = 'stake_' || v_aposta.id::TEXT || '_entry_' || v_entry.id::TEXT
        ) INTO v_has_pernas;
        
        IF NOT v_has_pernas THEN
          INSERT INTO financial_events (
            bookmaker_id, aposta_id, workspace_id, tipo_evento, tipo_uso,
            valor, moeda, idempotency_key, descricao, processed_at, created_by
          ) VALUES (
            v_entry.bookmaker_id, v_aposta.id, v_aposta.workspace_id,
            'STAKE', 'NORMAL',
            -v_stake_real, v_entry.moeda,
            'stake_' || v_aposta.id::TEXT || '_entry_' || v_entry.id::TEXT,
            format('Débito stake real entrada %s', v_entry.id),
            now(), auth.uid()
          ) ON CONFLICT DO NOTHING
          RETURNING id INTO v_event_id;
          IF v_event_id IS NOT NULL THEN v_events_count := v_events_count + 1; END IF;
        END IF;
      END IF;
      
      -- Calcular payout conforme resultado
      v_payout_real := 0;
      v_payout_freebet := 0;
      
      CASE p_resultado
        WHEN 'GREEN' THEN
          v_payout_real := v_stake_real * v_odd;
          v_payout_freebet := v_stake_freebet * (v_odd - 1);
        WHEN 'RED' THEN
          v_payout_real := 0;
          v_payout_freebet := 0;
        WHEN 'VOID' THEN
          v_payout_real := v_stake_real;
          v_payout_freebet := 0;
        WHEN 'MEIO_GREEN' THEN
          v_payout_real := v_stake_real + (v_stake_real * (v_odd - 1) / 2);
          v_payout_freebet := v_stake_freebet * (v_odd - 1) / 2;
        WHEN 'MEIO_RED' THEN
          v_payout_real := v_stake_real / 2;
          v_payout_freebet := 0;
      END CASE;
      
      -- Criar evento PAYOUT real
      IF v_payout_real > 0 THEN
        v_type_evento := CASE 
          WHEN p_resultado IN ('GREEN', 'MEIO_GREEN') THEN 'PAYOUT'
          WHEN p_resultado IN ('VOID', 'MEIO_RED') THEN 'VOID_REFUND'
          ELSE NULL
        END;
        
        IF v_type_evento IS NOT NULL THEN
          INSERT INTO financial_events (
            bookmaker_id, aposta_id, workspace_id, tipo_evento, tipo_uso,
            origem, valor, moeda, idempotency_key, descricao, processed_at, created_by
          ) VALUES (
            v_entry.bookmaker_id, v_aposta.id, v_aposta.workspace_id,
            v_type_evento, 'NORMAL', 'LUCRO',
            v_payout_real, v_entry.moeda,
            'payout_' || v_aposta.id::TEXT || '_entry_' || v_entry.id::TEXT || '_real',
            format('Payout %s real entrada', p_resultado),
            now(), auth.uid()
          ) ON CONFLICT DO NOTHING
          RETURNING id INTO v_event_id;
          IF v_event_id IS NOT NULL THEN v_events_count := v_events_count + 1; END IF;
        END IF;
      END IF;
      
      -- Criar evento PAYOUT freebet (lucro vai para NORMAL por SNR)
      IF v_payout_freebet > 0 THEN
        INSERT INTO financial_events (
          bookmaker_id, aposta_id, workspace_id, tipo_evento, tipo_uso,
          origem, valor, moeda, idempotency_key, descricao, processed_at, created_by
        ) VALUES (
          v_entry.bookmaker_id, v_aposta.id, v_aposta.workspace_id,
          'FREEBET_PAYOUT', 'NORMAL', 'LUCRO',
          v_payout_freebet, v_entry.moeda,
          'payout_' || v_aposta.id::TEXT || '_entry_' || v_entry.id::TEXT || '_fb',
          format('Payout %s freebet entrada (lucro para NORMAL)', p_resultado),
          now(), auth.uid()
        ) ON CONFLICT DO NOTHING
        RETURNING id INTO v_event_id;
        IF v_event_id IS NOT NULL THEN v_events_count := v_events_count + 1; END IF;
      END IF;
    END LOOP;
  END LOOP;
  
  -- Atualizar status da aposta
  UPDATE apostas_unificada
  SET 
    status = 'LIQUIDADA',
    resultado = p_resultado,
    updated_at = now()
  WHERE id = p_aposta_id;
  
  RETURN QUERY SELECT TRUE, v_events_count, 'Aposta com pernas liquidada com sucesso'::TEXT;
END;
$function$;

COMMENT ON FUNCTION public.liquidar_aposta_v4(uuid, text, numeric) IS 
'Liquidar aposta com suporte completo: simples sem pernas, simples/múltipla com pernas, surebet. 
Cria eventos STAKE e PAYOUT idempotentes. Motor financeiro v14.';

-- ============================================================================
-- FIM DA CORREÇÃO
-- ============================================================================
