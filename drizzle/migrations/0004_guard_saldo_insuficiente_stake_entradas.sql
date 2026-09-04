-- Trava de saldo fail-closed no funil único de débito de stake de arbitragem.
-- Cobre criação (criar_surebet_atomica_v3), edição (editar_surebet_completa_v3)
-- e qualquer outro fluxo que persista entradas, inclusive chamada direta da RPC.
CREATE OR REPLACE FUNCTION public.fn_sync_stake_event_v1(p_entrada_id uuid, p_aposta_id uuid, p_workspace_id uuid, p_bookmaker_id uuid, p_stake numeric, p_moeda text, p_fonte_saldo text, p_user_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_tipo_evento TEXT;
  v_tipo_uso TEXT;
  v_idempotency_key TEXT;
  v_tipo TEXT;
  v_odd NUMERIC;
  v_valor_debitar NUMERIC;
  v_descricao TEXT;
  v_existing RECORD;
  v_ts TEXT := extract(epoch from clock_timestamp())::bigint::text;
  v_identidade_mudou BOOLEAN := false;
  v_valor_ja_debitado NUMERIC := 0;
  v_delta NUMERIC;
  v_saldo_real NUMERIC;
  v_saldo_freebet NUMERIC;
  v_saldo_disponivel NUMERIC;
  v_bk_nome TEXT;
  v_bk_moeda TEXT;
BEGIN
  SELECT COALESCE(tipo,'back'), COALESCE(odd, 1)
    INTO v_tipo, v_odd
  FROM public.apostas_perna_entradas
  WHERE id = p_entrada_id;

  IF v_tipo = 'lay' AND v_odd > 1 THEN
    v_valor_debitar := p_stake * (v_odd - 1);
    v_descricao := 'Liability lay (Surebet)';
  ELSE
    v_valor_debitar := p_stake;
    v_descricao := 'Stake de entrada (Surebet)';
  END IF;

  v_tipo_evento := CASE WHEN p_fonte_saldo = 'FREEBET' THEN 'FREEBET_STAKE' ELSE 'STAKE' END;
  v_tipo_uso    := CASE WHEN p_fonte_saldo = 'FREEBET' THEN 'FREEBET' ELSE 'NORMAL' END;
  v_idempotency_key := 'stake_entry_' || p_entrada_id;

  -- Normaliza chaves legadas
  UPDATE public.financial_events
    SET idempotency_key = v_idempotency_key
  WHERE aposta_id = p_aposta_id
    AND tipo_evento IN ('STAKE','FREEBET_STAKE')
    AND idempotency_key LIKE '%' || p_entrada_id || '%'
    AND idempotency_key != v_idempotency_key
    AND NOT EXISTS (SELECT 1 FROM public.financial_events x WHERE x.idempotency_key = v_idempotency_key);

  SELECT id, bookmaker_id, tipo_uso, moeda, valor, tipo_evento
    INTO v_existing
  FROM public.financial_events
  WHERE idempotency_key = v_idempotency_key;

  IF FOUND THEN
    v_identidade_mudou := (
         v_existing.bookmaker_id IS DISTINCT FROM p_bookmaker_id
      OR COALESCE(v_existing.tipo_uso,'NORMAL') IS DISTINCT FROM v_tipo_uso
      OR COALESCE(v_existing.moeda,'') IS DISTINCT FROM COALESCE(p_moeda,'')
    );
  END IF;

  IF FOUND AND v_identidade_mudou THEN
    -- Arquiva a chave do evento antigo (mantém o registro histórico)
    UPDATE public.financial_events
      SET idempotency_key = v_idempotency_key || '_old_' || v_ts
    WHERE id = v_existing.id;

    -- Estorno auditável do evento antigo (restaura a casa/bucket anterior)
    INSERT INTO public.financial_events (
      bookmaker_id, workspace_id, aposta_id, tipo_evento, tipo_uso,
      valor, moeda, idempotency_key, reversed_event_id, descricao, created_by
    ) VALUES (
      v_existing.bookmaker_id, p_workspace_id, p_aposta_id, 'REVERSAL', v_existing.tipo_uso,
      -v_existing.valor, v_existing.moeda,
      'rev_stake_entry_' || p_entrada_id || '_' || v_ts,
      v_existing.id, 'Estorno por edição (troca de casa/fonte/moeda)', p_user_id
    )
    ON CONFLICT (idempotency_key) DO NOTHING;
  END IF;

  -- ============================================================
  -- TRAVA DE SALDO (fail-closed)
  -- Valida o recurso EFETIVAMENTE usado: entrada REAL só consome
  -- saldo real; entrada FREEBET só consome saldo de freebet.
  -- Nunca somar freebet ao saldo real.
  -- ============================================================
  IF v_existing.id IS NOT NULL AND NOT v_identidade_mudou THEN
    v_valor_ja_debitado := ABS(COALESCE(v_existing.valor, 0));
  END IF;

  v_delta := COALESCE(v_valor_debitar, 0) - v_valor_ja_debitado;

  IF v_delta > 0 THEN
    SELECT b.saldo_atual, b.saldo_freebet, b.nome, b.moeda
      INTO v_saldo_real, v_saldo_freebet, v_bk_nome, v_bk_moeda
    FROM public.bookmakers b
    WHERE b.id = p_bookmaker_id
    FOR UPDATE;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'SALDO_INSUFICIENTE: casa de aposta não encontrada para validação de saldo.';
    END IF;

    v_saldo_disponivel := CASE
      WHEN v_tipo_uso = 'FREEBET' THEN COALESCE(v_saldo_freebet, 0)
      ELSE COALESCE(v_saldo_real, 0)
    END;

    IF v_delta > v_saldo_disponivel + 0.01 THEN
      RAISE EXCEPTION 'SALDO_INSUFICIENTE: % — % disponível: % %, necessário: % %.',
        v_bk_nome,
        CASE WHEN v_tipo_uso = 'FREEBET' THEN 'freebet' ELSE 'saldo real' END,
        ROUND(v_saldo_disponivel, 2), COALESCE(v_bk_moeda, p_moeda),
        ROUND(v_delta, 2), COALESCE(v_bk_moeda, p_moeda);
    END IF;
  END IF;

  INSERT INTO public.financial_events (
    bookmaker_id, workspace_id, aposta_id, tipo_evento, tipo_uso,
    valor, moeda, idempotency_key, descricao, created_by
  ) VALUES (
    p_bookmaker_id, p_workspace_id, p_aposta_id, v_tipo_evento, v_tipo_uso,
    -v_valor_debitar, p_moeda, v_idempotency_key, v_descricao, p_user_id
  )
  ON CONFLICT (idempotency_key) DO UPDATE SET
    valor = EXCLUDED.valor,
    bookmaker_id = EXCLUDED.bookmaker_id,
    moeda = EXCLUDED.moeda,
    tipo_evento = EXCLUDED.tipo_evento,
    tipo_uso = EXCLUDED.tipo_uso,
    descricao = EXCLUDED.descricao;
END;
$function$;