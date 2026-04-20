-- ============================================================
-- CORREÇÃO V3: PAYOUTs duplicados pelo backfill multi-entry
-- ============================================================

-- 1. Reverter PAYOUTs órfãos
DO $$
DECLARE
  v_evento RECORD;
  v_reversal_id UUID;
BEGIN
  FOR v_evento IN
    SELECT fe.id, fe.bookmaker_id, fe.aposta_id, fe.workspace_id, 
           fe.valor, fe.moeda, fe.idempotency_key, fe.tipo_evento, fe.tipo_uso
    FROM financial_events fe
    WHERE fe.descricao LIKE 'Backfill payout perna%'
      AND fe.reversed_event_id IS NULL
      AND fe.idempotency_key NOT LIKE '%\_GREEN' ESCAPE '\'
      AND fe.idempotency_key NOT LIKE '%\_MEIO\_GREEN' ESCAPE '\'
      AND fe.idempotency_key NOT LIKE '%\_VOID' ESCAPE '\'
      AND fe.idempotency_key NOT LIKE '%\_MEIO\_RED' ESCAPE '\'
      AND fe.idempotency_key NOT LIKE '%\_RED' ESCAPE '\'
  LOOP
    INSERT INTO financial_events (
      bookmaker_id, aposta_id, workspace_id, tipo_evento, tipo_uso,
      valor, moeda, idempotency_key, descricao, processed_at, 
      reversed_event_id, allow_negative
    ) VALUES (
      v_evento.bookmaker_id, v_evento.aposta_id, v_evento.workspace_id,
      'REVERSAL', v_evento.tipo_uso,
      -v_evento.valor, v_evento.moeda,
      'reversal_backfill_dup_' || v_evento.id::TEXT,
      'Reversão de PAYOUT duplicado do backfill multi-entry (chave sem sufixo)',
      now(), v_evento.id, true
    )
    ON CONFLICT (idempotency_key) DO NOTHING
    RETURNING id INTO v_reversal_id;
    
    IF v_reversal_id IS NOT NULL THEN
      UPDATE financial_events
      SET reversed_event_id = v_reversal_id
      WHERE id = v_evento.id;
    END IF;
  END LOOP;
END$$;

-- 2. Ressincronizar saldos
DO $$
DECLARE
  v_bookmaker RECORD;
  v_saldo_calc NUMERIC;
  v_saldo_fb_calc NUMERIC;
  v_saldo_anterior NUMERIC;
BEGIN
  FOR v_bookmaker IN
    SELECT b.id, b.nome, b.saldo_atual, b.saldo_freebet, b.workspace_id
    FROM bookmakers b
    WHERE b.id IN (
      '66b9fb1a-7c24-4efb-b37f-7f15d831d4fd',
      '29628346-7d98-4ba0-a2c8-d61a7ab5d7a7',
      '4c795128-8fd0-4f98-aa90-06cf46290059',
      'a2e43b5f-e01f-4e3a-8fe0-2c2104d006ad'
    )
  LOOP
    SELECT COALESCE(SUM(valor), 0) INTO v_saldo_calc
    FROM financial_events
    WHERE bookmaker_id = v_bookmaker.id
      AND tipo_uso = 'NORMAL'
      AND reversed_event_id IS NULL;

    SELECT COALESCE(SUM(valor), 0) INTO v_saldo_fb_calc
    FROM financial_events
    WHERE bookmaker_id = v_bookmaker.id
      AND tipo_uso = 'FREEBET'
      AND reversed_event_id IS NULL;

    v_saldo_anterior := v_bookmaker.saldo_atual;

    UPDATE bookmakers
    SET saldo_atual = v_saldo_calc,
        saldo_freebet = v_saldo_fb_calc,
        updated_at = now()
    WHERE id = v_bookmaker.id;

    INSERT INTO bookmaker_balance_audit (
      bookmaker_id, workspace_id, saldo_anterior, saldo_novo, 
      origem, observacoes
    ) VALUES (
      v_bookmaker.id, v_bookmaker.workspace_id,
      v_saldo_anterior, v_saldo_calc,
      'CORRECAO_BACKFILL_DUP',
      format('Ressync após reversão de PAYOUTs duplicados. Bookmaker: %s. Saldo freebet: %s', 
             v_bookmaker.nome, v_saldo_fb_calc)
    );
  END LOOP;
END$$;

COMMENT ON FUNCTION public.reliquidar_aposta_v6 IS 
'Reliquidação multi-entry V6 — NÃO cria PAYOUTs (apenas STAKEs e AJUSTEs diferenciais). PAYOUT é responsabilidade exclusiva de liquidar_aposta_v4 com chave canônica payout_<aposta>_perna_<perna>_<RESULTADO>.';