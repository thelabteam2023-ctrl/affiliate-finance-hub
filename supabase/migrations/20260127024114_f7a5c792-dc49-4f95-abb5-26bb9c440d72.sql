-- ============================================================================
-- REFATORAÇÃO: LEDGER COMO ÚNICA FONTE DE VERDADE
-- ============================================================================
-- Esta migração elimina todos os UPDATEs diretos em bookmakers.saldo_*
-- e consolida toda movimentação financeira via cash_ledger + único trigger.
-- ============================================================================

-- ============================================================================
-- PARTE 1: LIMPAR TRIGGERS DUPLICADOS (manter apenas v4)
-- ============================================================================

DROP TRIGGER IF EXISTS tr_cash_ledger_update_bookmaker_balance ON cash_ledger;
DROP TRIGGER IF EXISTS tr_cash_ledger_update_bookmaker_balance_v2 ON cash_ledger;
DROP TRIGGER IF EXISTS tr_cash_ledger_update_bookmaker_balance_v3 ON cash_ledger;
-- v4 permanece ativo

-- Dropar funções obsoletas
DROP FUNCTION IF EXISTS atualizar_saldo_bookmaker_v2() CASCADE;
DROP FUNCTION IF EXISTS atualizar_saldo_bookmaker_v3() CASCADE;

-- ============================================================================
-- PARTE 2: TRIGGER ÚNICO CONSOLIDADO (v5 - Final)
-- ============================================================================

CREATE OR REPLACE FUNCTION public.atualizar_saldo_bookmaker_v5()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_delta_real NUMERIC := 0;
  v_delta_freebet NUMERIC := 0;
  v_delta_bonus NUMERIC := 0;
  v_saldo_anterior_real NUMERIC;
  v_saldo_anterior_freebet NUMERIC;
  v_saldo_anterior_bonus NUMERIC;
  v_bookmaker_id UUID;
BEGIN
  -- Ignorar se já processado (idempotência)
  IF NEW.balance_processed_at IS NOT NULL THEN
    RETURN NEW;
  END IF;
  
  -- Ignorar transações não confirmadas
  IF NEW.status != 'CONFIRMADO' THEN
    RETURN NEW;
  END IF;

  -- ========================================
  -- PROCESSAMENTO POR TIPO DE TRANSAÇÃO
  -- ========================================
  
  CASE NEW.tipo_transacao
    -- ========================================
    -- APOSTAS
    -- ========================================
    WHEN 'APOSTA_STAKE' THEN
      -- Débito: usar breakdown waterfall
      v_bookmaker_id := NEW.origem_bookmaker_id;
      v_delta_real := -COALESCE(NEW.debito_real, NEW.valor);
      v_delta_bonus := -COALESCE(NEW.debito_bonus, 0);
      v_delta_freebet := -COALESCE(NEW.debito_freebet, 0);
      
    WHEN 'APOSTA_GREEN', 'APOSTA_MEIO_GREEN' THEN
      -- Crédito: lucro + stake real devolvido
      v_bookmaker_id := NEW.destino_bookmaker_id;
      v_delta_real := COALESCE(NEW.valor_destino, NEW.valor);
      -- Bonus/Freebet consumido NÃO retorna
      
    WHEN 'APOSTA_RED', 'APOSTA_MEIO_RED' THEN
      -- RED: nenhum crédito (stake já foi debitado)
      -- MEIO_RED: devolução parcial via ledger entry separada
      v_bookmaker_id := NEW.destino_bookmaker_id;
      IF NEW.tipo_transacao = 'APOSTA_MEIO_RED' THEN
        -- Devolver metade das fontes
        v_delta_real := COALESCE(NEW.debito_real, 0) / 2;
        v_delta_bonus := COALESCE(NEW.debito_bonus, 0) / 2;
        v_delta_freebet := COALESCE(NEW.debito_freebet, 0) / 2;
      END IF;
      
    WHEN 'APOSTA_VOID', 'APOSTA_REEMBOLSO' THEN
      -- Devolução total para as fontes originais
      v_bookmaker_id := NEW.destino_bookmaker_id;
      v_delta_real := COALESCE(NEW.debito_real, NEW.valor);
      v_delta_bonus := COALESCE(NEW.debito_bonus, 0);
      v_delta_freebet := COALESCE(NEW.debito_freebet, 0);
      
    WHEN 'APOSTA_REVERSAO' THEN
      -- Reversão: inverter o impacto anterior
      -- Se origem = débito (estava creditado, agora debita)
      -- Se destino = crédito (estava debitado, agora credita)
      IF NEW.origem_bookmaker_id IS NOT NULL THEN
        v_bookmaker_id := NEW.origem_bookmaker_id;
        v_delta_real := -COALESCE(NEW.valor_origem, NEW.valor);
      ELSIF NEW.destino_bookmaker_id IS NOT NULL THEN
        v_bookmaker_id := NEW.destino_bookmaker_id;
        v_delta_real := COALESCE(NEW.valor_destino, NEW.valor);
      END IF;

    -- ========================================
    -- FREEBET OPERATIONS
    -- ========================================
    WHEN 'FREEBET_CREDITADA' THEN
      v_bookmaker_id := NEW.destino_bookmaker_id;
      v_delta_freebet := COALESCE(NEW.valor_destino, NEW.valor);
      
    WHEN 'FREEBET_CONSUMIDA', 'FREEBET_EXPIRADA' THEN
      v_bookmaker_id := NEW.origem_bookmaker_id;
      v_delta_freebet := -COALESCE(NEW.valor_origem, NEW.valor);
      
    WHEN 'FREEBET_ESTORNO' THEN
      v_bookmaker_id := NEW.destino_bookmaker_id;
      v_delta_freebet := COALESCE(NEW.valor_destino, NEW.valor);
      
    WHEN 'FREEBET_CONVERTIDA' THEN
      -- Converte freebet em saldo real
      v_bookmaker_id := COALESCE(NEW.destino_bookmaker_id, NEW.origem_bookmaker_id);
      v_delta_freebet := -COALESCE(NEW.valor_origem, NEW.valor);
      v_delta_real := COALESCE(NEW.valor_destino, NEW.valor);

    -- ========================================
    -- BONUS OPERATIONS (agora tratado como NORMAL)
    -- ========================================
    WHEN 'BONUS_CREDITADO' THEN
      v_bookmaker_id := NEW.destino_bookmaker_id;
      v_delta_real := COALESCE(NEW.valor_destino, NEW.valor); -- Vai para saldo_atual (normal)
      
    WHEN 'BONUS_ESTORNO' THEN
      v_bookmaker_id := NEW.origem_bookmaker_id;
      v_delta_real := -COALESCE(NEW.valor_origem, NEW.valor);

    -- ========================================
    -- DEPÓSITOS, SAQUES, TRANSFERÊNCIAS
    -- ========================================
    WHEN 'DEPOSITO' THEN
      v_bookmaker_id := NEW.destino_bookmaker_id;
      v_delta_real := COALESCE(NEW.valor_destino, NEW.valor);
      
    WHEN 'SAQUE' THEN
      v_bookmaker_id := NEW.origem_bookmaker_id;
      v_delta_real := -COALESCE(NEW.valor_origem, NEW.valor);
      
    WHEN 'TRANSFERENCIA', 'TRANSFERENCIA_INTERNA' THEN
      -- Processar origem (débito)
      IF NEW.origem_bookmaker_id IS NOT NULL THEN
        SELECT saldo_atual INTO v_saldo_anterior_real FROM bookmakers WHERE id = NEW.origem_bookmaker_id FOR UPDATE;
        UPDATE bookmakers SET 
          saldo_atual = saldo_atual - COALESCE(NEW.valor_origem, NEW.valor),
          updated_at = NOW()
        WHERE id = NEW.origem_bookmaker_id;
        
        INSERT INTO bookmaker_balance_audit (bookmaker_id, workspace_id, saldo_anterior, saldo_novo, origem, referencia_tipo, referencia_id, user_id)
        VALUES (NEW.origem_bookmaker_id, NEW.workspace_id, v_saldo_anterior_real, v_saldo_anterior_real - COALESCE(NEW.valor_origem, NEW.valor), 'TRIGGER_V5_TRANSFER_OUT', NEW.tipo_transacao, NEW.id, NEW.user_id);
      END IF;
      
      -- Processar destino (crédito)
      IF NEW.destino_bookmaker_id IS NOT NULL THEN
        SELECT saldo_atual INTO v_saldo_anterior_real FROM bookmakers WHERE id = NEW.destino_bookmaker_id FOR UPDATE;
        UPDATE bookmakers SET 
          saldo_atual = saldo_atual + COALESCE(NEW.valor_destino, NEW.valor),
          updated_at = NOW()
        WHERE id = NEW.destino_bookmaker_id;
        
        INSERT INTO bookmaker_balance_audit (bookmaker_id, workspace_id, saldo_anterior, saldo_novo, origem, referencia_tipo, referencia_id, user_id)
        VALUES (NEW.destino_bookmaker_id, NEW.workspace_id, v_saldo_anterior_real, v_saldo_anterior_real + COALESCE(NEW.valor_destino, NEW.valor), 'TRIGGER_V5_TRANSFER_IN', NEW.tipo_transacao, NEW.id, NEW.user_id);
      END IF;
      
      NEW.balance_processed_at := NOW();
      RETURN NEW;

    -- ========================================
    -- CASHBACK, GIROS, AJUSTES
    -- ========================================
    WHEN 'CASHBACK_MANUAL', 'CREDITO_CASHBACK', 'GIRO_GRATIS' THEN
      v_bookmaker_id := NEW.destino_bookmaker_id;
      v_delta_real := COALESCE(NEW.valor_destino, NEW.valor);
      
    WHEN 'CASHBACK_ESTORNO', 'GIRO_GRATIS_ESTORNO' THEN
      v_bookmaker_id := NEW.origem_bookmaker_id;
      v_delta_real := -COALESCE(NEW.valor_origem, NEW.valor);
      
    WHEN 'AJUSTE_SALDO', 'AJUSTE_MANUAL', 'AJUSTE_POSITIVO', 'CONCILIACAO', 'GANHO_CAMBIAL' THEN
      IF NEW.destino_bookmaker_id IS NOT NULL THEN
        v_bookmaker_id := NEW.destino_bookmaker_id;
        v_delta_real := COALESCE(NEW.valor_destino, NEW.valor);
      ELSIF NEW.origem_bookmaker_id IS NOT NULL THEN
        v_bookmaker_id := NEW.origem_bookmaker_id;
        v_delta_real := -COALESCE(NEW.valor_origem, NEW.valor);
      END IF;
      
    WHEN 'AJUSTE_NEGATIVO', 'PERDA_OPERACIONAL', 'PERDA_CAMBIAL' THEN
      v_bookmaker_id := NEW.origem_bookmaker_id;
      v_delta_real := -COALESCE(NEW.valor_origem, NEW.valor);
      
    WHEN 'PERDA_REVERSAO' THEN
      v_bookmaker_id := NEW.destino_bookmaker_id;
      v_delta_real := COALESCE(NEW.valor_destino, NEW.valor);

    ELSE
      -- Tipo não reconhecido: tentar lógica genérica
      IF NEW.destino_bookmaker_id IS NOT NULL THEN
        v_bookmaker_id := NEW.destino_bookmaker_id;
        v_delta_real := COALESCE(NEW.valor_destino, NEW.valor);
      ELSIF NEW.origem_bookmaker_id IS NOT NULL THEN
        v_bookmaker_id := NEW.origem_bookmaker_id;
        v_delta_real := -COALESCE(NEW.valor_origem, NEW.valor);
      END IF;
  END CASE;

  -- ========================================
  -- APLICAR DELTAS
  -- ========================================
  IF v_bookmaker_id IS NOT NULL AND (v_delta_real != 0 OR v_delta_freebet != 0 OR v_delta_bonus != 0) THEN
    -- Obter saldos anteriores com lock
    SELECT saldo_atual, saldo_freebet, COALESCE(saldo_bonus, 0)
    INTO v_saldo_anterior_real, v_saldo_anterior_freebet, v_saldo_anterior_bonus
    FROM bookmakers
    WHERE id = v_bookmaker_id
    FOR UPDATE;
    
    -- Aplicar deltas
    UPDATE bookmakers SET
      saldo_atual = COALESCE(saldo_atual, 0) + v_delta_real,
      saldo_freebet = COALESCE(saldo_freebet, 0) + v_delta_freebet,
      saldo_bonus = COALESCE(saldo_bonus, 0) + v_delta_bonus,
      updated_at = NOW()
    WHERE id = v_bookmaker_id;
    
    -- Auditoria
    INSERT INTO bookmaker_balance_audit (
      bookmaker_id, workspace_id, saldo_anterior, saldo_novo, 
      origem, referencia_tipo, referencia_id, user_id, observacoes
    ) VALUES (
      v_bookmaker_id, NEW.workspace_id, 
      v_saldo_anterior_real, v_saldo_anterior_real + v_delta_real,
      'TRIGGER_V5', NEW.tipo_transacao, NEW.id, NEW.user_id,
      FORMAT('delta_real=%s, delta_freebet=%s, delta_bonus=%s', v_delta_real, v_delta_freebet, v_delta_bonus)
    );
  END IF;
  
  -- Marcar como processado (idempotência)
  NEW.balance_processed_at := NOW();
  RETURN NEW;
END;
$$;

-- Dropar trigger v4 e criar v5
DROP TRIGGER IF EXISTS tr_cash_ledger_update_bookmaker_balance_v4 ON cash_ledger;

CREATE TRIGGER tr_cash_ledger_update_bookmaker_balance_v5
  BEFORE INSERT ON public.cash_ledger
  FOR EACH ROW
  EXECUTE FUNCTION public.atualizar_saldo_bookmaker_v5();

-- ============================================================================
-- PARTE 3: REFATORAR liquidar_aposta_atomica_v2 (SEM UPDATEs DIRETOS)
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
  v_moeda TEXT;
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
  
  -- Fallback para campos da aposta
  IF v_debito_bonus IS NULL THEN
    v_debito_bonus := COALESCE(v_aposta.stake_bonus, 0);
    v_debito_real := COALESCE(v_aposta.stake_real, v_aposta.stake);
    v_debito_freebet := 0;
    IF v_aposta.usar_freebet = TRUE THEN
      v_debito_freebet := COALESCE(v_aposta.stake, 0);
      v_debito_real := 0;
    END IF;
  END IF;
  
  v_stake_total := COALESCE(v_aposta.stake, v_debito_bonus + v_debito_freebet + v_debito_real);
  v_moeda := COALESCE(v_aposta.moeda_operacao, 'USD');
  
  -- ========================================
  -- PROCESSAR RESULTADO VIA LEDGER (SEM UPDATEs DIRETOS!)
  -- ========================================
  
  IF p_resultado IN ('GREEN', 'MEIO_GREEN') THEN
    -- Calcular lucro
    IF p_lucro_prejuizo IS NOT NULL THEN
      v_lucro_final := p_lucro_prejuizo;
    ELSIF p_resultado = 'GREEN' THEN
      v_lucro_final := v_stake_total * (COALESCE(v_aposta.odd, 1) - 1);
    ELSE -- MEIO_GREEN
      v_lucro_final := v_stake_total * (COALESCE(v_aposta.odd, 1) - 1) / 2;
    END IF;
    
    -- Inserir crédito via ledger (trigger v5 processa)
    INSERT INTO cash_ledger (
      tipo_transacao, workspace_id, user_id, destino_bookmaker_id,
      valor, valor_destino, moeda, tipo_moeda, status, impacta_caixa_operacional,
      debito_bonus, debito_freebet, debito_real, descricao,
      auditoria_metadata
    ) VALUES (
      CASE WHEN p_resultado = 'GREEN' THEN 'APOSTA_GREEN' ELSE 'APOSTA_MEIO_GREEN' END,
      v_aposta.workspace_id, v_aposta.user_id, v_aposta.bookmaker_id,
      v_lucro_final + v_debito_real, -- Lucro + stake real devolvido
      v_lucro_final + v_debito_real,
      v_moeda, 'FIAT', 'CONFIRMADO', true,
      v_debito_bonus, v_debito_freebet, v_debito_real,
      FORMAT('%s: Lucro=%s, Stake Real=%s (devolvido), Bonus=%s (consumido), Freebet=%s (consumido)',
             p_resultado, v_lucro_final, v_debito_real, v_debito_bonus, v_debito_freebet),
      jsonb_build_object('aposta_id', p_aposta_id, 'lucro', v_lucro_final, 'stake_real', v_debito_real)
    );
    
  ELSIF p_resultado = 'RED' THEN
    -- RED: nenhum crédito (stake já foi consumido)
    v_lucro_final := 0;
    
  ELSIF p_resultado = 'MEIO_RED' THEN
    -- MEIO_RED: devolver metade via ledger
    v_lucro_final := 0;
    
    INSERT INTO cash_ledger (
      tipo_transacao, workspace_id, user_id, destino_bookmaker_id,
      valor, valor_destino, moeda, tipo_moeda, status, impacta_caixa_operacional,
      debito_bonus, debito_freebet, debito_real, descricao
    ) VALUES (
      'APOSTA_MEIO_RED',
      v_aposta.workspace_id, v_aposta.user_id, v_aposta.bookmaker_id,
      v_stake_total / 2, v_stake_total / 2,
      v_moeda, 'FIAT', 'CONFIRMADO', true,
      v_debito_bonus / 2, v_debito_freebet / 2, v_debito_real / 2,
      FORMAT('MEIO_RED: Devolução 50%% - Bonus=%s, Freebet=%s, Real=%s', 
             v_debito_bonus/2, v_debito_freebet/2, v_debito_real/2)
    );
    
  ELSIF p_resultado IN ('VOID', 'REEMBOLSO') THEN
    -- VOID: devolver tudo via ledger
    v_lucro_final := 0;
    
    INSERT INTO cash_ledger (
      tipo_transacao, workspace_id, user_id, destino_bookmaker_id,
      valor, valor_destino, moeda, tipo_moeda, status, impacta_caixa_operacional,
      debito_bonus, debito_freebet, debito_real, descricao
    ) VALUES (
      'APOSTA_VOID',
      v_aposta.workspace_id, v_aposta.user_id, v_aposta.bookmaker_id,
      v_stake_total, v_stake_total,
      v_moeda, 'FIAT', 'CONFIRMADO', true,
      v_debito_bonus, v_debito_freebet, v_debito_real,
      FORMAT('VOID: Devolução total - Bonus=%s, Freebet=%s, Real=%s', 
             v_debito_bonus, v_debito_freebet, v_debito_real)
    );
  ELSE
    v_lucro_final := 0;
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
      WHEN p_resultado IN ('VOID', 'REEMBOLSO') THEN v_stake_total
      WHEN p_resultado = 'MEIO_RED' THEN v_stake_total / 2
      ELSE 0
    END,
    updated_at = NOW()
  WHERE id = p_aposta_id;
  
  RETURN jsonb_build_object(
    'success', true,
    'resultado', p_resultado,
    'lucro_prejuizo', v_lucro_final,
    'stake_total', v_stake_total,
    'breakdown', jsonb_build_object(
      'debito_bonus', v_debito_bonus,
      'debito_freebet', v_debito_freebet,
      'debito_real', v_debito_real
    )
  );
END;
$$;

-- ============================================================================
-- PARTE 4: REFATORAR reverter_liquidacao_para_pendente (VIA LEDGER)
-- ============================================================================

CREATE OR REPLACE FUNCTION public.reverter_liquidacao_para_pendente(
  p_aposta_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_aposta RECORD;
  v_lucro_anterior NUMERIC;
  v_retorno_anterior NUMERIC;
  v_debito_bonus NUMERIC;
  v_debito_freebet NUMERIC;
  v_debito_real NUMERIC;
  v_moeda TEXT;
BEGIN
  -- Buscar aposta com lock
  SELECT * INTO v_aposta
  FROM apostas_unificada
  WHERE id = p_aposta_id
  FOR UPDATE;
  
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'APOSTA_NAO_ENCONTRADA');
  END IF;
  
  IF v_aposta.status = 'PENDENTE' THEN
    RETURN jsonb_build_object('success', false, 'error', 'APOSTA_JA_PENDENTE');
  END IF;
  
  -- Buscar breakdown do débito original
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
  
  -- Fallback
  IF v_debito_bonus IS NULL THEN
    v_debito_bonus := COALESCE(v_aposta.stake_bonus, 0);
    v_debito_real := COALESCE(v_aposta.stake_real, v_aposta.stake);
    v_debito_freebet := 0;
    IF v_aposta.usar_freebet = TRUE THEN
      v_debito_freebet := COALESCE(v_aposta.stake, 0);
      v_debito_real := 0;
    END IF;
  END IF;
  
  v_lucro_anterior := COALESCE(v_aposta.lucro_prejuizo, 0);
  v_retorno_anterior := COALESCE(v_aposta.valor_retorno, 0);
  v_moeda := COALESCE(v_aposta.moeda_operacao, 'USD');
  
  -- ========================================
  -- REVERTER VIA LEDGER (SEM UPDATEs DIRETOS!)
  -- ========================================
  
  IF v_aposta.resultado IN ('GREEN', 'MEIO_GREEN') THEN
    -- Foi creditado (lucro + stake real). Precisamos DEBITAR via ledger.
    INSERT INTO cash_ledger (
      tipo_transacao, workspace_id, user_id, origem_bookmaker_id,
      valor, valor_origem, moeda, tipo_moeda, status, impacta_caixa_operacional,
      descricao, auditoria_metadata
    ) VALUES (
      'APOSTA_REVERSAO',
      v_aposta.workspace_id, v_aposta.user_id, v_aposta.bookmaker_id,
      v_retorno_anterior, v_retorno_anterior,
      v_moeda, 'FIAT', 'CONFIRMADO', true,
      FORMAT('Reversão %s→PENDENTE: debitando retorno de %s', v_aposta.resultado, v_retorno_anterior),
      jsonb_build_object('aposta_id', p_aposta_id, 'resultado_anterior', v_aposta.resultado, 'retorno_revertido', v_retorno_anterior)
    );
    
  ELSIF v_aposta.resultado IN ('VOID', 'REEMBOLSO') THEN
    -- Foi devolvido tudo. Precisamos RE-DEBITAR via ledger.
    INSERT INTO cash_ledger (
      tipo_transacao, workspace_id, user_id, origem_bookmaker_id,
      valor, valor_origem, moeda, tipo_moeda, status, impacta_caixa_operacional,
      debito_bonus, debito_freebet, debito_real, descricao
    ) VALUES (
      'APOSTA_REVERSAO',
      v_aposta.workspace_id, v_aposta.user_id, v_aposta.bookmaker_id,
      v_debito_bonus + v_debito_freebet + v_debito_real,
      v_debito_bonus + v_debito_freebet + v_debito_real,
      v_moeda, 'FIAT', 'CONFIRMADO', true,
      v_debito_bonus, v_debito_freebet, v_debito_real,
      FORMAT('Reversão VOID→PENDENTE: re-debitando Bonus=%s, Freebet=%s, Real=%s', 
             v_debito_bonus, v_debito_freebet, v_debito_real)
    );
    
  ELSIF v_aposta.resultado = 'MEIO_RED' THEN
    -- Foi devolvido metade. Precisamos RE-DEBITAR metade via ledger.
    INSERT INTO cash_ledger (
      tipo_transacao, workspace_id, user_id, origem_bookmaker_id,
      valor, valor_origem, moeda, tipo_moeda, status, impacta_caixa_operacional,
      debito_bonus, debito_freebet, debito_real, descricao
    ) VALUES (
      'APOSTA_REVERSAO',
      v_aposta.workspace_id, v_aposta.user_id, v_aposta.bookmaker_id,
      (v_debito_bonus + v_debito_freebet + v_debito_real) / 2,
      (v_debito_bonus + v_debito_freebet + v_debito_real) / 2,
      v_moeda, 'FIAT', 'CONFIRMADO', true,
      v_debito_bonus / 2, v_debito_freebet / 2, v_debito_real / 2,
      FORMAT('Reversão MEIO_RED→PENDENTE: re-debitando 50%%')
    );
  END IF;
  -- RED: Nada foi creditado/devolvido, então nada a reverter
  
  -- Atualizar aposta para PENDENTE
  UPDATE apostas_unificada
  SET 
    status = 'PENDENTE',
    resultado = 'PENDENTE',
    lucro_prejuizo = NULL,
    valor_retorno = NULL,
    updated_at = NOW()
  WHERE id = p_aposta_id;
  
  RETURN jsonb_build_object(
    'success', true,
    'resultado_anterior', v_aposta.resultado,
    'lucro_revertido', v_lucro_anterior,
    'retorno_revertido', v_retorno_anterior
  );
END;
$$;

-- ============================================================================
-- PARTE 5: REFATORAR processar_debito_waterfall (VIA LEDGER)
-- ============================================================================

CREATE OR REPLACE FUNCTION public.processar_debito_waterfall(
  p_bookmaker_id UUID,
  p_stake NUMERIC,
  p_usar_freebet BOOLEAN DEFAULT FALSE,
  p_workspace_id UUID DEFAULT NULL,
  p_user_id UUID DEFAULT NULL
)
RETURNS TABLE(
  debito_bonus NUMERIC,
  debito_freebet NUMERIC,
  debito_real NUMERIC,
  sucesso BOOLEAN,
  erro TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_saldo_bonus NUMERIC;
  v_saldo_freebet NUMERIC;
  v_saldo_real NUMERIC;
  v_moeda TEXT;
  v_calc RECORD;
BEGIN
  -- Buscar saldos com lock
  SELECT 
    COALESCE(b.saldo_bonus, 0),
    COALESCE(b.saldo_freebet, 0),
    b.saldo_atual,
    b.moeda
  INTO v_saldo_bonus, v_saldo_freebet, v_saldo_real, v_moeda
  FROM bookmakers b
  WHERE b.id = p_bookmaker_id
  FOR UPDATE;
  
  IF NOT FOUND THEN
    RETURN QUERY SELECT 0::NUMERIC, 0::NUMERIC, 0::NUMERIC, FALSE, 'BOOKMAKER_NOT_FOUND'::TEXT;
    RETURN;
  END IF;
  
  -- Calcular distribuição waterfall
  SELECT * INTO v_calc FROM calcular_debito_waterfall(
    p_stake, v_saldo_bonus, v_saldo_freebet, v_saldo_real, p_usar_freebet
  );
  
  IF NOT v_calc.sucesso THEN
    RETURN QUERY SELECT 0::NUMERIC, 0::NUMERIC, 0::NUMERIC, FALSE, v_calc.erro;
    RETURN;
  END IF;
  
  -- ========================================
  -- INSERIR DÉBITO VIA LEDGER (trigger v5 atualiza saldo)
  -- ========================================
  INSERT INTO cash_ledger (
    tipo_transacao, workspace_id, user_id, origem_bookmaker_id,
    valor, valor_origem, moeda, tipo_moeda, status, impacta_caixa_operacional,
    debito_bonus, debito_freebet, debito_real, usar_freebet, descricao
  ) VALUES (
    'APOSTA_STAKE',
    p_workspace_id, p_user_id, p_bookmaker_id,
    p_stake, p_stake,
    v_moeda, 'FIAT', 'CONFIRMADO', true,
    v_calc.debito_bonus, v_calc.debito_freebet, v_calc.debito_real, p_usar_freebet,
    FORMAT('Stake waterfall: Bonus=%s, Freebet=%s, Real=%s', 
           v_calc.debito_bonus, v_calc.debito_freebet, v_calc.debito_real)
  );
  
  RETURN QUERY SELECT v_calc.debito_bonus, v_calc.debito_freebet, v_calc.debito_real, TRUE, NULL::TEXT;
END;
$$;

-- ============================================================================
-- PARTE 6: REMOVER UPDATEs DIRETOS DOS TRIGGERS DE GIRO/CASHBACK
-- ============================================================================

-- O trigger de giro grátis agora só insere no ledger, sem UPDATE direto
CREATE OR REPLACE FUNCTION public.fn_giro_gratis_gerar_lancamento()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_bookmaker RECORD;
BEGIN
  -- Só processar quando status muda para CONVERTIDO
  IF NEW.status = 'CONVERTIDO' AND (OLD IS NULL OR OLD.status != 'CONVERTIDO') THEN
    IF COALESCE(NEW.valor_retorno, 0) > 0 AND NEW.cash_ledger_id IS NULL THEN
      
      SELECT id, moeda, workspace_id INTO v_bookmaker
      FROM bookmakers WHERE id = NEW.bookmaker_id;
      
      -- Inserir no ledger (trigger v5 atualiza saldo automaticamente)
      INSERT INTO cash_ledger (
        workspace_id, user_id, tipo_transacao, tipo_moeda, moeda,
        valor, valor_destino, data_transacao, status, descricao,
        destino_bookmaker_id, impacta_caixa_operacional
      ) VALUES (
        NEW.workspace_id, NEW.user_id, 'GIRO_GRATIS', 'FIAT',
        COALESCE(v_bookmaker.moeda, 'BRL'), NEW.valor_retorno, NEW.valor_retorno,
        COALESCE(NEW.data_jogo, NOW()), 'CONFIRMADO', 'Giro Grátis convertido',
        NEW.bookmaker_id, false
      )
      RETURNING id INTO NEW.cash_ledger_id;
      
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$;

-- O trigger de cashback agora só insere no ledger, sem UPDATE direto
CREATE OR REPLACE FUNCTION public.fn_cashback_gerar_lancamento()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_bookmaker RECORD;
  v_should_process BOOLEAN := FALSE;
BEGIN
  IF TG_OP = 'INSERT' THEN
    v_should_process := NEW.status = 'recebido' 
                        AND COALESCE(NEW.valor_recebido, 0) > 0 
                        AND NEW.cash_ledger_id IS NULL;
  ELSIF TG_OP = 'UPDATE' THEN
    v_should_process := NEW.status = 'recebido' 
                        AND OLD.status != 'recebido'
                        AND COALESCE(NEW.valor_recebido, 0) > 0 
                        AND NEW.cash_ledger_id IS NULL;
  END IF;

  IF v_should_process THEN
    SELECT id, moeda, workspace_id INTO v_bookmaker
    FROM bookmakers WHERE id = NEW.bookmaker_id;
    
    -- Inserir no ledger (trigger v5 atualiza saldo automaticamente)
    INSERT INTO cash_ledger (
      workspace_id, user_id, tipo_transacao, tipo_moeda, moeda,
      valor, valor_destino, data_transacao, status, descricao,
      destino_bookmaker_id, impacta_caixa_operacional
    ) VALUES (
      NEW.workspace_id, NEW.user_id, 'CREDITO_CASHBACK', 'FIAT',
      NEW.moeda_operacao, NEW.valor_recebido, NEW.valor_recebido,
      COALESCE(NEW.data_credito, NOW()), 'CONFIRMADO', 'Crédito de Cashback',
      NEW.bookmaker_id, false
    )
    RETURNING id INTO NEW.cash_ledger_id;
    
  END IF;
  
  RETURN NEW;
END;
$$;

-- ============================================================================
-- COMENTÁRIO FINAL
-- ============================================================================
-- Esta migração consolida TODA movimentação financeira via cash_ledger.
-- O trigger v5 é o ÚNICO ponto que atualiza bookmakers.saldo_*.
-- Nenhuma RPC ou trigger deve fazer UPDATE direto nos saldos.
-- 
-- Para verificar integridade:
-- SELECT * FROM recalcular_saldo_bookmaker_v2(bookmaker_id);
-- ============================================================================