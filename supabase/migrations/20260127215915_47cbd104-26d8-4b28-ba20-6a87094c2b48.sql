
-- 1) Corrigir processamento de MEIO_RED no trigger do ledger
CREATE OR REPLACE FUNCTION public.fn_cash_ledger_generate_financial_events()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public
AS $$
DECLARE
    v_bookmaker_record RECORD;
    v_idempotency_key TEXT;
    v_valor_efetivo NUMERIC;
BEGIN
    IF NEW.status != 'CONFIRMADO' THEN
        RETURN NEW;
    END IF;

    IF NEW.financial_events_generated = TRUE THEN
        RETURN NEW;
    END IF;

    -- DEPÓSITO
    IF NEW.tipo_transacao = 'DEPOSITO' AND NEW.destino_bookmaker_id IS NOT NULL THEN
        v_idempotency_key := 'ledger_deposit_' || NEW.id::TEXT;
        IF NOT EXISTS (SELECT 1 FROM financial_events WHERE idempotency_key = v_idempotency_key) THEN
            SELECT moeda INTO v_bookmaker_record FROM bookmakers WHERE id = NEW.destino_bookmaker_id;
            v_valor_efetivo := COALESCE(NEW.valor_destino, NEW.valor);
            INSERT INTO financial_events (
                bookmaker_id, workspace_id, tipo_evento, tipo_uso, origem,
                valor, moeda, idempotency_key, descricao, metadata, processed_at, created_by
            ) VALUES (
                NEW.destino_bookmaker_id, NEW.workspace_id,
                'DEPOSITO', 'NORMAL', 'DEPOSITO',
                v_valor_efetivo, COALESCE(v_bookmaker_record.moeda, NEW.moeda),
                v_idempotency_key,
                'Depósito via cash_ledger #' || NEW.id::TEXT,
                jsonb_build_object('ledger_id', NEW.id, 'tipo_transacao', NEW.tipo_transacao),
                NOW(), NEW.user_id
            );
            UPDATE bookmakers
            SET saldo_atual = saldo_atual + v_valor_efetivo, updated_at = NOW()
            WHERE id = NEW.destino_bookmaker_id;
        END IF;
    END IF;

    -- SAQUE
    IF NEW.tipo_transacao = 'SAQUE' AND NEW.origem_bookmaker_id IS NOT NULL THEN
        v_idempotency_key := 'ledger_withdraw_' || NEW.id::TEXT;
        IF NOT EXISTS (SELECT 1 FROM financial_events WHERE idempotency_key = v_idempotency_key) THEN
            SELECT moeda INTO v_bookmaker_record FROM bookmakers WHERE id = NEW.origem_bookmaker_id;
            v_valor_efetivo := COALESCE(NEW.valor_origem, NEW.valor);
            INSERT INTO financial_events (
                bookmaker_id, workspace_id, tipo_evento, tipo_uso, origem,
                valor, moeda, idempotency_key, descricao, metadata, processed_at, created_by
            ) VALUES (
                NEW.origem_bookmaker_id, NEW.workspace_id,
                'SAQUE', 'NORMAL', NULL,
                v_valor_efetivo, COALESCE(v_bookmaker_record.moeda, NEW.moeda),
                v_idempotency_key,
                'Saque via cash_ledger #' || NEW.id::TEXT,
                jsonb_build_object('ledger_id', NEW.id, 'tipo_transacao', NEW.tipo_transacao),
                NOW(), NEW.user_id
            );
            UPDATE bookmakers
            SET saldo_atual = saldo_atual - v_valor_efetivo, updated_at = NOW()
            WHERE id = NEW.origem_bookmaker_id;
        END IF;
    END IF;

    -- BONUS
    IF NEW.tipo_transacao = 'BONUS_CREDITADO' AND NEW.destino_bookmaker_id IS NOT NULL THEN
        v_idempotency_key := 'ledger_bonus_' || NEW.id::TEXT;
        IF NOT EXISTS (SELECT 1 FROM financial_events WHERE idempotency_key = v_idempotency_key) THEN
            SELECT moeda INTO v_bookmaker_record FROM bookmakers WHERE id = NEW.destino_bookmaker_id;
            v_valor_efetivo := COALESCE(NEW.valor_destino, NEW.valor);
            INSERT INTO financial_events (
                bookmaker_id, workspace_id, tipo_evento, tipo_uso, origem,
                valor, moeda, idempotency_key, descricao, metadata, processed_at, created_by
            ) VALUES (
                NEW.destino_bookmaker_id, NEW.workspace_id,
                CASE WHEN NEW.usar_freebet = TRUE THEN 'FREEBET_CREDIT' ELSE 'BONUS' END,
                CASE WHEN NEW.usar_freebet = TRUE THEN 'FREEBET' ELSE 'NORMAL' END,
                'BONUS',
                v_valor_efetivo, COALESCE(v_bookmaker_record.moeda, NEW.moeda),
                v_idempotency_key,
                'Bônus via cash_ledger #' || NEW.id::TEXT,
                jsonb_build_object('ledger_id', NEW.id, 'evento_tipo', NEW.evento_promocional_tipo),
                NOW(), NEW.user_id
            );
            IF NEW.usar_freebet = TRUE THEN
                UPDATE bookmakers
                SET saldo_freebet = saldo_freebet + v_valor_efetivo, updated_at = NOW()
                WHERE id = NEW.destino_bookmaker_id;
            ELSE
                UPDATE bookmakers
                SET saldo_atual = saldo_atual + v_valor_efetivo, updated_at = NOW()
                WHERE id = NEW.destino_bookmaker_id;
            END IF;
        END IF;
    END IF;

    -- GIRO GRÁTIS
    IF NEW.tipo_transacao = 'GIRO_GRATIS' AND NEW.destino_bookmaker_id IS NOT NULL THEN
        v_idempotency_key := 'ledger_freespin_' || NEW.id::TEXT;
        IF NOT EXISTS (SELECT 1 FROM financial_events WHERE idempotency_key = v_idempotency_key) THEN
            SELECT moeda INTO v_bookmaker_record FROM bookmakers WHERE id = NEW.destino_bookmaker_id;
            v_valor_efetivo := COALESCE(NEW.valor_destino, NEW.valor);
            INSERT INTO financial_events (
                bookmaker_id, workspace_id, tipo_evento, tipo_uso, origem,
                valor, moeda, idempotency_key, descricao, metadata, processed_at, created_by
            ) VALUES (
                NEW.destino_bookmaker_id, NEW.workspace_id,
                'PAYOUT', 'NORMAL', 'PROMO',
                v_valor_efetivo, COALESCE(v_bookmaker_record.moeda, NEW.moeda),
                v_idempotency_key,
                'Giro grátis via cash_ledger #' || NEW.id::TEXT,
                jsonb_build_object('ledger_id', NEW.id),
                NOW(), NEW.user_id
            );
            UPDATE bookmakers
            SET saldo_atual = saldo_atual + v_valor_efetivo, updated_at = NOW()
            WHERE id = NEW.destino_bookmaker_id;
        END IF;
    END IF;

    -- CASHBACK
    IF NEW.tipo_transacao = 'CASHBACK_MANUAL' AND NEW.destino_bookmaker_id IS NOT NULL THEN
        v_idempotency_key := 'ledger_cashback_' || NEW.id::TEXT;
        IF NOT EXISTS (SELECT 1 FROM financial_events WHERE idempotency_key = v_idempotency_key) THEN
            SELECT moeda INTO v_bookmaker_record FROM bookmakers WHERE id = NEW.destino_bookmaker_id;
            v_valor_efetivo := COALESCE(NEW.valor_destino, NEW.valor);
            INSERT INTO financial_events (
                bookmaker_id, workspace_id, tipo_evento, tipo_uso, origem,
                valor, moeda, idempotency_key, descricao, metadata, processed_at, created_by
            ) VALUES (
                NEW.destino_bookmaker_id, NEW.workspace_id,
                'CASHBACK', 'NORMAL', 'CASHBACK',
                v_valor_efetivo, COALESCE(v_bookmaker_record.moeda, NEW.moeda),
                v_idempotency_key,
                'Cashback via cash_ledger #' || NEW.id::TEXT,
                jsonb_build_object('ledger_id', NEW.id),
                NOW(), NEW.user_id
            );
            UPDATE bookmakers
            SET saldo_atual = saldo_atual + v_valor_efetivo, updated_at = NOW()
            WHERE id = NEW.destino_bookmaker_id;
        END IF;
    END IF;

    -- AJUSTE MANUAL
    IF NEW.tipo_transacao = 'AJUSTE_MANUAL' THEN
        IF NEW.destino_bookmaker_id IS NOT NULL AND NEW.ajuste_direcao = 'CREDITO' THEN
            v_idempotency_key := 'ledger_adjust_credit_' || NEW.id::TEXT;
            IF NOT EXISTS (SELECT 1 FROM financial_events WHERE idempotency_key = v_idempotency_key) THEN
                SELECT moeda INTO v_bookmaker_record FROM bookmakers WHERE id = NEW.destino_bookmaker_id;
                v_valor_efetivo := COALESCE(NEW.valor_destino, NEW.valor);
                INSERT INTO financial_events (
                    bookmaker_id, workspace_id, tipo_evento, tipo_uso, origem,
                    valor, moeda, idempotency_key, descricao, metadata, processed_at, created_by
                ) VALUES (
                    NEW.destino_bookmaker_id, NEW.workspace_id,
                    'AJUSTE', 'NORMAL', 'AJUSTE',
                    v_valor_efetivo, COALESCE(v_bookmaker_record.moeda, NEW.moeda),
                    v_idempotency_key,
                    COALESCE(NEW.ajuste_motivo, 'Ajuste manual'),
                    jsonb_build_object('ledger_id', NEW.id, 'motivo', NEW.ajuste_motivo, 'direcao', 'CREDITO'),
                    NOW(), NEW.user_id
                );
                UPDATE bookmakers
                SET saldo_atual = saldo_atual + v_valor_efetivo, updated_at = NOW()
                WHERE id = NEW.destino_bookmaker_id;
            END IF;
        END IF;

        IF NEW.origem_bookmaker_id IS NOT NULL AND NEW.ajuste_direcao = 'DEBITO' THEN
            v_idempotency_key := 'ledger_adjust_debit_' || NEW.id::TEXT;
            IF NOT EXISTS (SELECT 1 FROM financial_events WHERE idempotency_key = v_idempotency_key) THEN
                SELECT moeda INTO v_bookmaker_record FROM bookmakers WHERE id = NEW.origem_bookmaker_id;
                v_valor_efetivo := COALESCE(NEW.valor_origem, NEW.valor);
                INSERT INTO financial_events (
                    bookmaker_id, workspace_id, tipo_evento, tipo_uso, origem,
                    valor, moeda, idempotency_key, descricao, metadata, processed_at, created_by
                ) VALUES (
                    NEW.origem_bookmaker_id, NEW.workspace_id,
                    'AJUSTE', 'NORMAL', 'AJUSTE',
                    -v_valor_efetivo,
                    COALESCE(v_bookmaker_record.moeda, NEW.moeda),
                    v_idempotency_key,
                    COALESCE(NEW.ajuste_motivo, 'Ajuste manual'),
                    jsonb_build_object('ledger_id', NEW.id, 'motivo', NEW.ajuste_motivo, 'direcao', 'DEBITO'),
                    NOW(), NEW.user_id
                );
                UPDATE bookmakers
                SET saldo_atual = saldo_atual - v_valor_efetivo, updated_at = NOW()
                WHERE id = NEW.origem_bookmaker_id;
            END IF;
        END IF;
    END IF;

    -- ===== BET EDITS =====
    IF NEW.tipo_transacao = 'APOSTA_REVERSAO' AND NEW.destino_bookmaker_id IS NOT NULL THEN
        v_idempotency_key := 'ledger_bet_reversal_' || NEW.id::TEXT;
        IF NOT EXISTS (SELECT 1 FROM financial_events WHERE idempotency_key = v_idempotency_key) THEN
            SELECT moeda INTO v_bookmaker_record FROM bookmakers WHERE id = NEW.destino_bookmaker_id;
            v_valor_efetivo := COALESCE(NEW.valor_destino, NEW.valor);
            INSERT INTO financial_events (
                bookmaker_id, workspace_id, tipo_evento, tipo_uso, origem,
                valor, moeda, idempotency_key, descricao, metadata, processed_at, created_by
            ) VALUES (
                NEW.destino_bookmaker_id, NEW.workspace_id,
                'REVERSAL', 'NORMAL', 'BET_EDIT',
                v_valor_efetivo, COALESCE(v_bookmaker_record.moeda, NEW.moeda),
                v_idempotency_key,
                'Reversão de resultado de aposta',
                jsonb_build_object('ledger_id', NEW.id, 'tipo', 'APOSTA_REVERSAO'),
                NOW(), NEW.user_id
            );
            UPDATE bookmakers
            SET saldo_atual = saldo_atual + v_valor_efetivo, updated_at = NOW()
            WHERE id = NEW.destino_bookmaker_id;
        END IF;
    END IF;

    IF NEW.tipo_transacao = 'APOSTA_GREEN' AND NEW.destino_bookmaker_id IS NOT NULL THEN
        v_idempotency_key := 'ledger_bet_green_' || NEW.id::TEXT;
        IF NOT EXISTS (SELECT 1 FROM financial_events WHERE idempotency_key = v_idempotency_key) THEN
            SELECT moeda INTO v_bookmaker_record FROM bookmakers WHERE id = NEW.destino_bookmaker_id;
            v_valor_efetivo := COALESCE(NEW.valor_destino, NEW.valor);
            INSERT INTO financial_events (
                bookmaker_id, workspace_id, tipo_evento, tipo_uso, origem,
                valor, moeda, idempotency_key, descricao, metadata, processed_at, created_by
            ) VALUES (
                NEW.destino_bookmaker_id, NEW.workspace_id,
                'PAYOUT', 'NORMAL', 'BET_EDIT',
                v_valor_efetivo, COALESCE(v_bookmaker_record.moeda, NEW.moeda),
                v_idempotency_key,
                'Payout de aposta GREEN',
                jsonb_build_object('ledger_id', NEW.id, 'tipo', 'APOSTA_GREEN'),
                NOW(), NEW.user_id
            );
            UPDATE bookmakers
            SET saldo_atual = saldo_atual + v_valor_efetivo, updated_at = NOW()
            WHERE id = NEW.destino_bookmaker_id;
        END IF;
    END IF;

    IF NEW.tipo_transacao = 'APOSTA_VOID' AND NEW.destino_bookmaker_id IS NOT NULL THEN
        v_idempotency_key := 'ledger_bet_void_' || NEW.id::TEXT;
        IF NOT EXISTS (SELECT 1 FROM financial_events WHERE idempotency_key = v_idempotency_key) THEN
            SELECT moeda INTO v_bookmaker_record FROM bookmakers WHERE id = NEW.destino_bookmaker_id;
            v_valor_efetivo := COALESCE(NEW.valor_destino, NEW.valor);
            INSERT INTO financial_events (
                bookmaker_id, workspace_id, tipo_evento, tipo_uso, origem,
                valor, moeda, idempotency_key, descricao, metadata, processed_at, created_by
            ) VALUES (
                NEW.destino_bookmaker_id, NEW.workspace_id,
                'REVERSAL', 'NORMAL', 'BET_EDIT',
                v_valor_efetivo, COALESCE(v_bookmaker_record.moeda, NEW.moeda),
                v_idempotency_key,
                'Stake devolvido - aposta VOID',
                jsonb_build_object('ledger_id', NEW.id, 'tipo', 'APOSTA_VOID'),
                NOW(), NEW.user_id
            );
            UPDATE bookmakers
            SET saldo_atual = saldo_atual + v_valor_efetivo, updated_at = NOW()
            WHERE id = NEW.destino_bookmaker_id;
        END IF;
    END IF;

    -- MEIO_RED: crédito de metade do stake devolvido
    IF NEW.tipo_transacao = 'APOSTA_MEIO_RED' AND NEW.destino_bookmaker_id IS NOT NULL THEN
        v_idempotency_key := 'ledger_bet_meio_red_' || NEW.id::TEXT;
        IF NOT EXISTS (SELECT 1 FROM financial_events WHERE idempotency_key = v_idempotency_key) THEN
            SELECT moeda INTO v_bookmaker_record FROM bookmakers WHERE id = NEW.destino_bookmaker_id;
            v_valor_efetivo := COALESCE(NEW.valor_destino, NEW.valor);
            INSERT INTO financial_events (
                bookmaker_id, workspace_id, tipo_evento, tipo_uso, origem,
                valor, moeda, idempotency_key, descricao, metadata, processed_at, created_by
            ) VALUES (
                NEW.destino_bookmaker_id, NEW.workspace_id,
                'REVERSAL', 'NORMAL', 'BET_EDIT',
                v_valor_efetivo, COALESCE(v_bookmaker_record.moeda, NEW.moeda),
                v_idempotency_key,
                'Devolução parcial - aposta MEIO_RED',
                jsonb_build_object('ledger_id', NEW.id, 'tipo', 'APOSTA_MEIO_RED'),
                NOW(), NEW.user_id
            );
            UPDATE bookmakers
            SET saldo_atual = saldo_atual + v_valor_efetivo, updated_at = NOW()
            WHERE id = NEW.destino_bookmaker_id;
        END IF;
    END IF;

    NEW.financial_events_generated := TRUE;
    RETURN NEW;
END;
$$;

-- 2) Corrigir regra de reversão/aplicação no RPC de edição:
--    RED tem payout 0 => não gera reversão; e novo resultado RED não debita stake (stake já foi debitado na criação)
CREATE OR REPLACE FUNCTION public.atualizar_aposta_liquidada_atomica(
  p_aposta_id uuid,
  p_novo_bookmaker_id uuid DEFAULT NULL::uuid,
  p_novo_stake numeric DEFAULT NULL::numeric,
  p_nova_odd numeric DEFAULT NULL::numeric,
  p_nova_moeda text DEFAULT NULL::text,
  p_novo_resultado text DEFAULT NULL::text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public
AS $function$
DECLARE
  v_aposta RECORD;
  v_perna RECORD;
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
  v_houve_mudanca_financeira BOOLEAN := false;
  v_has_pernas BOOLEAN := false;
  v_valor_reversao NUMERIC;
  v_valor_payout NUMERIC;
BEGIN
  SELECT * INTO v_aposta
  FROM apostas_unificada
  WHERE id = p_aposta_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'APOSTA_NAO_ENCONTRADA');
  END IF;

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

    IF p_novo_bookmaker_id IS NOT NULL OR p_novo_stake IS NOT NULL OR p_nova_odd IS NOT NULL THEN
      UPDATE apostas_pernas
      SET 
        bookmaker_id = COALESCE(p_novo_bookmaker_id, bookmaker_id),
        stake = COALESCE(p_novo_stake, stake),
        odd = COALESCE(p_nova_odd, odd),
        moeda = COALESCE(p_nova_moeda, moeda),
        updated_at = NOW()
      WHERE aposta_id = p_aposta_id;
    END IF;

    RETURN jsonb_build_object('success', true, 'message', 'Aposta não liquidada atualizada');
  END IF;

  v_workspace_id := v_aposta.workspace_id;
  v_user_id := v_aposta.user_id;
  v_resultado_atual := v_aposta.resultado;

  SELECT EXISTS(SELECT 1 FROM apostas_pernas WHERE aposta_id = p_aposta_id) INTO v_has_pernas;

  -- ========================
  -- SIMPLES (sem pernas)
  -- ========================
  IF NOT v_has_pernas THEN
    v_bookmaker_anterior_id := v_aposta.bookmaker_id;
    v_stake_anterior := COALESCE(v_aposta.stake, 0);
    v_odd_anterior := COALESCE(v_aposta.odd, 1);
    v_moeda_anterior := COALESCE(v_aposta.moeda_operacao, 'BRL');
    v_lucro_anterior := COALESCE(v_aposta.lucro_prejuizo, 0);

    v_bookmaker_novo_id := COALESCE(p_novo_bookmaker_id, v_bookmaker_anterior_id);
    v_stake_novo := COALESCE(p_novo_stake, v_stake_anterior);
    v_odd_novo := COALESCE(p_nova_odd, v_odd_anterior);
    v_moeda_nova := COALESCE(p_nova_moeda, v_moeda_anterior);
    v_resultado_novo := COALESCE(p_novo_resultado, v_resultado_atual);

    IF v_bookmaker_novo_id != v_bookmaker_anterior_id
       OR v_stake_novo != v_stake_anterior
       OR v_odd_novo != v_odd_anterior
       OR v_resultado_novo != v_resultado_atual THEN
      v_houve_mudanca_financeira := true;
    END IF;

    IF v_houve_mudanca_financeira THEN
      -- Reverter resultado anterior (RED tem payout 0 => não reverte nada)
      IF v_resultado_atual = 'GREEN' THEN
        v_valor_reversao := v_stake_anterior + v_lucro_anterior;
        INSERT INTO cash_ledger (workspace_id, user_id, tipo_transacao, origem_bookmaker_id, origem_tipo, valor_origem, valor, moeda, tipo_moeda, status, descricao, impacta_caixa_operacional)
        VALUES (v_workspace_id, v_user_id, 'APOSTA_REVERSAO', v_bookmaker_anterior_id, 'BOOKMAKER', v_valor_reversao, v_valor_reversao, v_moeda_anterior, 'FIAT', 'CONFIRMADO', 'Reversão GREEN por edição', false);
      ELSIF v_resultado_atual = 'VOID' THEN
        v_valor_reversao := v_stake_anterior;
        INSERT INTO cash_ledger (workspace_id, user_id, tipo_transacao, origem_bookmaker_id, origem_tipo, valor_origem, valor, moeda, tipo_moeda, status, descricao, impacta_caixa_operacional)
        VALUES (v_workspace_id, v_user_id, 'APOSTA_REVERSAO', v_bookmaker_anterior_id, 'BOOKMAKER', v_valor_reversao, v_valor_reversao, v_moeda_anterior, 'FIAT', 'CONFIRMADO', 'Reversão VOID', false);
      ELSIF v_resultado_atual = 'MEIO_GREEN' THEN
        v_valor_reversao := v_stake_anterior + (v_lucro_anterior / 2);
        INSERT INTO cash_ledger (workspace_id, user_id, tipo_transacao, origem_bookmaker_id, origem_tipo, valor_origem, valor, moeda, tipo_moeda, status, descricao, impacta_caixa_operacional)
        VALUES (v_workspace_id, v_user_id, 'APOSTA_REVERSAO', v_bookmaker_anterior_id, 'BOOKMAKER', v_valor_reversao, v_valor_reversao, v_moeda_anterior, 'FIAT', 'CONFIRMADO', 'Reversão MEIO_GREEN', false);
      ELSIF v_resultado_atual = 'MEIO_RED' THEN
        v_valor_reversao := v_stake_anterior / 2;
        INSERT INTO cash_ledger (workspace_id, user_id, tipo_transacao, origem_bookmaker_id, origem_tipo, valor_origem, valor, moeda, tipo_moeda, status, descricao, impacta_caixa_operacional)
        VALUES (v_workspace_id, v_user_id, 'APOSTA_REVERSAO', v_bookmaker_anterior_id, 'BOOKMAKER', v_valor_reversao, v_valor_reversao, v_moeda_anterior, 'FIAT', 'CONFIRMADO', 'Reversão MEIO_RED', false);
      END IF;

      -- Aplicar novo resultado (RED não debita stake aqui)
      IF v_resultado_novo = 'GREEN' THEN
        v_lucro_novo := v_stake_novo * (v_odd_novo - 1);
        v_valor_payout := v_stake_novo + v_lucro_novo;
        INSERT INTO cash_ledger (workspace_id, user_id, tipo_transacao, destino_bookmaker_id, destino_tipo, valor_destino, valor, moeda, tipo_moeda, status, descricao, impacta_caixa_operacional)
        VALUES (v_workspace_id, v_user_id, 'APOSTA_GREEN', v_bookmaker_novo_id, 'BOOKMAKER', v_valor_payout, v_valor_payout, v_moeda_nova, 'FIAT', 'CONFIRMADO', 'Re-liquidação - GREEN', true);
      ELSIF v_resultado_novo = 'RED' THEN
        v_lucro_novo := -v_stake_novo;
        -- Sem cash_ledger (payout 0). Stake já foi debitado na criação.
      ELSIF v_resultado_novo = 'VOID' THEN
        v_lucro_novo := 0;
        v_valor_payout := v_stake_novo;
        INSERT INTO cash_ledger (workspace_id, user_id, tipo_transacao, destino_bookmaker_id, destino_tipo, valor_destino, valor, moeda, tipo_moeda, status, descricao, impacta_caixa_operacional)
        VALUES (v_workspace_id, v_user_id, 'APOSTA_VOID', v_bookmaker_novo_id, 'BOOKMAKER', v_valor_payout, v_valor_payout, v_moeda_nova, 'FIAT', 'CONFIRMADO', 'Re-liquidação - VOID', false);
      ELSIF v_resultado_novo = 'MEIO_GREEN' THEN
        v_lucro_novo := (v_stake_novo * (v_odd_novo - 1)) / 2;
        v_valor_payout := v_stake_novo + v_lucro_novo;
        INSERT INTO cash_ledger (workspace_id, user_id, tipo_transacao, destino_bookmaker_id, destino_tipo, valor_destino, valor, moeda, tipo_moeda, status, descricao, impacta_caixa_operacional)
        VALUES (v_workspace_id, v_user_id, 'APOSTA_GREEN', v_bookmaker_novo_id, 'BOOKMAKER', v_valor_payout, v_valor_payout, v_moeda_nova, 'FIAT', 'CONFIRMADO', 'Re-liquidação - MEIO_GREEN', true);
      ELSIF v_resultado_novo = 'MEIO_RED' THEN
        v_lucro_novo := -(v_stake_novo / 2);
        v_valor_payout := v_stake_novo / 2;
        INSERT INTO cash_ledger (workspace_id, user_id, tipo_transacao, destino_bookmaker_id, destino_tipo, valor_destino, valor, moeda, tipo_moeda, status, descricao, impacta_caixa_operacional)
        VALUES (v_workspace_id, v_user_id, 'APOSTA_MEIO_RED', v_bookmaker_novo_id, 'BOOKMAKER', v_valor_payout, v_valor_payout, v_moeda_nova, 'FIAT', 'CONFIRMADO', 'Re-liquidação - MEIO_RED', true);
      END IF;

      UPDATE apostas_unificada
      SET bookmaker_id = v_bookmaker_novo_id,
          stake = v_stake_novo,
          odd = v_odd_novo,
          moeda_operacao = v_moeda_nova,
          resultado = v_resultado_novo,
          lucro_prejuizo = v_lucro_novo,
          updated_at = NOW()
      WHERE id = p_aposta_id;

      RETURN jsonb_build_object('success', true, 'message', 'Aposta simples re-liquidada', 'lucro_novo', v_lucro_novo, 'reversao_aplicada', true);
    END IF;

    UPDATE apostas_unificada
    SET bookmaker_id = v_bookmaker_novo_id,
        stake = v_stake_novo,
        odd = v_odd_novo,
        moeda_operacao = v_moeda_nova,
        resultado = v_resultado_novo,
        updated_at = NOW()
    WHERE id = p_aposta_id;

    RETURN jsonb_build_object('success', true, 'message', 'Aposta simples atualizada');
  END IF;

  -- ========================
  -- COM PERNAS
  -- ========================
  FOR v_perna IN SELECT * FROM apostas_pernas WHERE aposta_id = p_aposta_id LOOP
    v_bookmaker_anterior_id := v_perna.bookmaker_id;
    v_stake_anterior := COALESCE(v_perna.stake, 0);
    v_odd_anterior := COALESCE(v_perna.odd, 1);
    v_moeda_anterior := COALESCE(v_perna.moeda, 'BRL');
    v_lucro_anterior := COALESCE(v_perna.lucro_prejuizo, 0);

    v_bookmaker_novo_id := COALESCE(p_novo_bookmaker_id, v_bookmaker_anterior_id);
    v_stake_novo := COALESCE(p_novo_stake, v_stake_anterior);
    v_odd_novo := COALESCE(p_nova_odd, v_odd_anterior);
    v_moeda_nova := COALESCE(p_nova_moeda, v_moeda_anterior);
    v_resultado_novo := COALESCE(p_novo_resultado, v_resultado_atual);

    v_houve_mudanca_financeira := (v_bookmaker_novo_id != v_bookmaker_anterior_id
       OR v_stake_novo != v_stake_anterior
       OR v_odd_novo != v_odd_anterior
       OR v_resultado_novo != v_resultado_atual);

    IF v_houve_mudanca_financeira THEN
      -- Reverter resultado anterior (RED payout 0 => nada)
      IF v_resultado_atual = 'GREEN' THEN
        v_valor_reversao := v_stake_anterior + v_lucro_anterior;
        INSERT INTO cash_ledger (workspace_id, user_id, tipo_transacao, origem_bookmaker_id, origem_tipo, valor_origem, valor, moeda, tipo_moeda, status, descricao, impacta_caixa_operacional)
        VALUES (v_workspace_id, v_user_id, 'APOSTA_REVERSAO', v_bookmaker_anterior_id, 'BOOKMAKER', v_valor_reversao, v_valor_reversao, v_moeda_anterior, 'FIAT', 'CONFIRMADO', 'Reversão GREEN', false);
      ELSIF v_resultado_atual = 'VOID' THEN
        v_valor_reversao := v_stake_anterior;
        INSERT INTO cash_ledger (workspace_id, user_id, tipo_transacao, origem_bookmaker_id, origem_tipo, valor_origem, valor, moeda, tipo_moeda, status, descricao, impacta_caixa_operacional)
        VALUES (v_workspace_id, v_user_id, 'APOSTA_REVERSAO', v_bookmaker_anterior_id, 'BOOKMAKER', v_valor_reversao, v_valor_reversao, v_moeda_anterior, 'FIAT', 'CONFIRMADO', 'Reversão VOID', false);
      ELSIF v_resultado_atual = 'MEIO_GREEN' THEN
        v_valor_reversao := v_stake_anterior + (v_lucro_anterior / 2);
        INSERT INTO cash_ledger (workspace_id, user_id, tipo_transacao, origem_bookmaker_id, origem_tipo, valor_origem, valor, moeda, tipo_moeda, status, descricao, impacta_caixa_operacional)
        VALUES (v_workspace_id, v_user_id, 'APOSTA_REVERSAO', v_bookmaker_anterior_id, 'BOOKMAKER', v_valor_reversao, v_valor_reversao, v_moeda_anterior, 'FIAT', 'CONFIRMADO', 'Reversão MEIO_GREEN', false);
      ELSIF v_resultado_atual = 'MEIO_RED' THEN
        v_valor_reversao := v_stake_anterior / 2;
        INSERT INTO cash_ledger (workspace_id, user_id, tipo_transacao, origem_bookmaker_id, origem_tipo, valor_origem, valor, moeda, tipo_moeda, status, descricao, impacta_caixa_operacional)
        VALUES (v_workspace_id, v_user_id, 'APOSTA_REVERSAO', v_bookmaker_anterior_id, 'BOOKMAKER', v_valor_reversao, v_valor_reversao, v_moeda_anterior, 'FIAT', 'CONFIRMADO', 'Reversão MEIO_RED', false);
      END IF;

      -- Aplicar novo resultado (RED sem ledger)
      IF v_resultado_novo = 'GREEN' THEN
        v_lucro_novo := v_stake_novo * (v_odd_novo - 1);
        v_valor_payout := v_stake_novo + v_lucro_novo;
        INSERT INTO cash_ledger (workspace_id, user_id, tipo_transacao, destino_bookmaker_id, destino_tipo, valor_destino, valor, moeda, tipo_moeda, status, descricao, impacta_caixa_operacional)
        VALUES (v_workspace_id, v_user_id, 'APOSTA_GREEN', v_bookmaker_novo_id, 'BOOKMAKER', v_valor_payout, v_valor_payout, v_moeda_nova, 'FIAT', 'CONFIRMADO', 'Re-liquidação - GREEN', true);
      ELSIF v_resultado_novo = 'RED' THEN
        v_lucro_novo := -v_stake_novo;
      ELSIF v_resultado_novo = 'VOID' THEN
        v_lucro_novo := 0;
        v_valor_payout := v_stake_novo;
        INSERT INTO cash_ledger (workspace_id, user_id, tipo_transacao, destino_bookmaker_id, destino_tipo, valor_destino, valor, moeda, tipo_moeda, status, descricao, impacta_caixa_operacional)
        VALUES (v_workspace_id, v_user_id, 'APOSTA_VOID', v_bookmaker_novo_id, 'BOOKMAKER', v_valor_payout, v_valor_payout, v_moeda_nova, 'FIAT', 'CONFIRMADO', 'Re-liquidação - VOID', false);
      ELSIF v_resultado_novo = 'MEIO_GREEN' THEN
        v_lucro_novo := (v_stake_novo * (v_odd_novo - 1)) / 2;
        v_valor_payout := v_stake_novo + v_lucro_novo;
        INSERT INTO cash_ledger (workspace_id, user_id, tipo_transacao, destino_bookmaker_id, destino_tipo, valor_destino, valor, moeda, tipo_moeda, status, descricao, impacta_caixa_operacional)
        VALUES (v_workspace_id, v_user_id, 'APOSTA_GREEN', v_bookmaker_novo_id, 'BOOKMAKER', v_valor_payout, v_valor_payout, v_moeda_nova, 'FIAT', 'CONFIRMADO', 'Re-liquidação - MEIO_GREEN', true);
      ELSIF v_resultado_novo = 'MEIO_RED' THEN
        v_lucro_novo := -(v_stake_novo / 2);
        v_valor_payout := v_stake_novo / 2;
        INSERT INTO cash_ledger (workspace_id, user_id, tipo_transacao, destino_bookmaker_id, destino_tipo, valor_destino, valor, moeda, tipo_moeda, status, descricao, impacta_caixa_operacional)
        VALUES (v_workspace_id, v_user_id, 'APOSTA_MEIO_RED', v_bookmaker_novo_id, 'BOOKMAKER', v_valor_payout, v_valor_payout, v_moeda_nova, 'FIAT', 'CONFIRMADO', 'Re-liquidação - MEIO_RED', true);
      END IF;

      UPDATE apostas_pernas
      SET bookmaker_id = v_bookmaker_novo_id,
          stake = v_stake_novo,
          odd = v_odd_novo,
          moeda = v_moeda_nova,
          resultado = v_resultado_novo,
          lucro_prejuizo = v_lucro_novo,
          updated_at = NOW()
      WHERE id = v_perna.id;
    END IF;
  END LOOP;

  UPDATE apostas_unificada
  SET bookmaker_id = COALESCE(p_novo_bookmaker_id, bookmaker_id),
      stake = COALESCE(p_novo_stake, stake),
      odd = COALESCE(p_nova_odd, odd),
      moeda_operacao = COALESCE(p_nova_moeda, moeda_operacao),
      resultado = COALESCE(p_novo_resultado, resultado),
      lucro_prejuizo = COALESCE(v_lucro_novo, lucro_prejuizo),
      updated_at = NOW()
  WHERE id = p_aposta_id;

  RETURN jsonb_build_object('success', true, 'message', 'Aposta com pernas re-liquidada');
END;
$function$;
