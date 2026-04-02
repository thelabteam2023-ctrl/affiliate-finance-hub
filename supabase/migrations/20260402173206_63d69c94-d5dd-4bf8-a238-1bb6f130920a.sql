
-- ============================================================
-- REESTRUTURAÇÃO DEFINITIVA: BROKER ISOLATION
-- ============================================================

-- 1. Adicionar flag direta na bookmaker
ALTER TABLE bookmakers ADD COLUMN IF NOT EXISTS is_broker_account boolean NOT NULL DEFAULT false;

-- 2. Populair flag para contas broker existentes
UPDATE bookmakers b
SET is_broker_account = true
FROM projetos p
WHERE b.projeto_id = p.id AND p.is_broker = true;

-- 3. Criar trigger para sincronizar flag quando conta é vinculada/desvinculada
CREATE OR REPLACE FUNCTION fn_sync_broker_account_flag()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_is_broker boolean := false;
BEGIN
  -- Quando projeto_id muda, verificar se o novo projeto é broker
  IF NEW.projeto_id IS NOT NULL THEN
    SELECT COALESCE(p.is_broker, false) INTO v_is_broker
    FROM projetos p WHERE p.id = NEW.projeto_id;
  END IF;
  
  NEW.is_broker_account := v_is_broker;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tr_sync_broker_flag_on_link ON bookmakers;
CREATE TRIGGER tr_sync_broker_flag_on_link
  BEFORE UPDATE OF projeto_id ON bookmakers
  FOR EACH ROW
  EXECUTE FUNCTION fn_sync_broker_account_flag();

-- Also on INSERT
DROP TRIGGER IF EXISTS tr_sync_broker_flag_on_insert ON bookmakers;
CREATE TRIGGER tr_sync_broker_flag_on_insert
  BEFORE INSERT ON bookmakers
  FOR EACH ROW
  EXECUTE FUNCTION fn_sync_broker_account_flag();

-- 4. MODIFICAR RECONCILIAÇÃO: Skip broker accounts
CREATE OR REPLACE FUNCTION reconciliar_saldo_bookmaker(p_bookmaker_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_bookmaker RECORD;
  v_saldo_calculado NUMERIC;
  v_saldo_freebet_calculado NUMERIC;
  v_saldo_anterior NUMERIC;
  v_diferenca NUMERIC;
BEGIN
  -- Buscar bookmaker
  SELECT id, nome, saldo_atual, saldo_freebet, workspace_id, is_broker_account
  INTO v_bookmaker
  FROM bookmakers
  WHERE id = p_bookmaker_id
  FOR UPDATE;
  
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Bookmaker não encontrado');
  END IF;
  
  -- ============================================================
  -- BROKER ISOLATION: Contas broker NÃO são reconciliadas
  -- O saldo_atual é a fonte de verdade direta
  -- ============================================================
  IF v_bookmaker.is_broker_account = true THEN
    RETURN jsonb_build_object(
      'success', true,
      'skipped', true,
      'reason', 'Conta broker: saldo gerido diretamente, reconciliação não aplicável',
      'bookmaker_id', p_bookmaker_id,
      'saldo_atual', v_bookmaker.saldo_atual
    );
  END IF;
  
  v_saldo_anterior := v_bookmaker.saldo_atual;
  
  -- Calcular saldo correto a partir dos eventos (APENAS para contas padrão)
  SELECT 
    COALESCE(SUM(CASE WHEN tipo_uso = 'NORMAL' THEN valor ELSE 0 END), 0),
    COALESCE(SUM(CASE WHEN tipo_uso = 'FREEBET' THEN valor ELSE 0 END), 0)
  INTO v_saldo_calculado, v_saldo_freebet_calculado
  FROM financial_events
  WHERE bookmaker_id = p_bookmaker_id
    AND processed_at IS NOT NULL;
  
  v_diferenca := v_saldo_anterior - v_saldo_calculado;
  
  -- Atualizar saldo se houver diferença
  IF ABS(v_diferenca) > 0.001 THEN
    UPDATE bookmakers
    SET 
      saldo_atual = v_saldo_calculado,
      saldo_freebet = v_saldo_freebet_calculado,
      reconciled_at = now(),
      updated_at = now()
    WHERE id = p_bookmaker_id;
    
    -- Registrar auditoria da reconciliação
    INSERT INTO bookmaker_balance_audit (
      bookmaker_id, workspace_id, origem,
      saldo_anterior, saldo_novo,
      observacoes
    ) VALUES (
      p_bookmaker_id, v_bookmaker.workspace_id, 'RECONCILIACAO',
      v_saldo_anterior, v_saldo_calculado,
      format('Reconciliação automática: saldo_anterior=%.2f, saldo_calculado=%.2f, diferença=%.2f', 
        v_saldo_anterior, v_saldo_calculado, v_diferenca)
    );
  END IF;
  
  RETURN jsonb_build_object(
    'success', true,
    'bookmaker_id', p_bookmaker_id,
    'saldo_anterior', v_saldo_anterior,
    'saldo_calculado', v_saldo_calculado,
    'diferenca', v_diferenca,
    'ajustado', ABS(v_diferenca) > 0.001
  );
END;
$$;

-- 5. ATUALIZAR PROTEÇÃO: Usar flag direta em vez de JOIN
CREATE OR REPLACE FUNCTION fn_protect_broker_baseline()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_is_broker boolean;
  v_original_descricao text;
BEGIN
  -- Only check REVERSAL events
  IF NEW.tipo_evento = 'REVERSAL' THEN
    -- Check directly on bookmaker flag (no JOIN needed)
    SELECT is_broker_account INTO v_is_broker
    FROM bookmakers
    WHERE id = NEW.bookmaker_id;
    
    IF v_is_broker = true THEN
      -- Check if reversing a baseline deposit
      IF NEW.reversed_event_id IS NOT NULL THEN
        SELECT descricao INTO v_original_descricao
        FROM financial_events WHERE id = NEW.reversed_event_id;
        
        IF v_original_descricao ILIKE '%baseline broker%' OR v_original_descricao ILIKE '%deposito_virtual%' THEN
          RAISE EXCEPTION 'BLOQUEADO: Não é permitido reverter o baseline de capital de uma conta broker (bookmaker_id: %, evento: %)', 
            NEW.bookmaker_id, NEW.reversed_event_id;
        END IF;
      END IF;
      
      -- Also block mass reversals that target broker baselines
      IF NEW.descricao ILIKE '%reversão de evento virtual indevido%' THEN
        RAISE EXCEPTION 'BLOQUEADO: Reversão em massa de eventos virtuais não permitida em contas broker (bookmaker_id: %)', 
          NEW.bookmaker_id;
      END IF;
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$;
