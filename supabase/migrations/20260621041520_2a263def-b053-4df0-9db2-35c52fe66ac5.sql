
-- ============================================================
-- FIX 1: liquidar_perna_surebet_v1 — usar clock_timestamp()
-- ============================================================
CREATE OR REPLACE FUNCTION public.liquidar_perna_surebet_v1(p_perna_id uuid, p_resultado text, p_workspace_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_surebet_id UUID;
  v_old_resultado TEXT;
  v_entry RECORD;
  v_payout NUMERIC := 0;
  v_refund NUMERIC := 0;
  v_is_fb BOOLEAN;
  v_is_lay BOOLEAN;
  v_comissao NUMERIC;
  v_liability NUMERIC;
  v_todas_liquidadas BOOLEAN;
  v_lucro_total NUMERIC;
  v_stake_total NUMERIC;
  v_resultado_final TEXT;
  v_is_multicurrency BOOLEAN;
  v_pl_consolidado NUMERIC;
  v_stake_consolidado NUMERIC;
  v_consol_currency TEXT;
  v_events_count INTEGER := 0;
  v_has_entries BOOLEAN := false;
  v_perna_lógica RECORD;
  v_perna_lucro_acumulado NUMERIC := 0;
  v_ts_suffix TEXT := extract(epoch from clock_timestamp())::bigint::text;
  v_now TIMESTAMP WITH TIME ZONE := clock_timestamp();  -- antes: NOW() (transaction_timestamp)
BEGIN
  PERFORM set_config('app.surebet_recalc_context', 'on', true);

  SELECT ap.aposta_id, ap.resultado, ap.bookmaker_id, ap.stake, ap.odd, ap.moeda,
         COALESCE(ap.fonte_saldo,'REAL') AS fonte_saldo,
         COALESCE(ap.tipo,'back')        AS tipo,
         COALESCE(ap.comissao, 0)        AS comissao
    INTO v_perna_lógica
  FROM public.apostas_pernas ap
  WHERE ap.id = p_perna_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Perna não encontrada');
  END IF;

  v_surebet_id := v_perna_lógica.aposta_id;
  v_old_resultado := v_perna_lógica.resultado;

  PERFORM 1 FROM public.apostas_unificada au WHERE au.id = v_surebet_id FOR UPDATE;

  -- 1) ESTORNAR EVENTOS ANTERIORES (PAYOUT / VOID_REFUND / FREEBET_PAYOUT)
  INSERT INTO public.financial_events (
    bookmaker_id, aposta_id, workspace_id, tipo_evento, tipo_uso,
    origem, valor, moeda, idempotency_key, reversed_event_id, descricao, created_by
  )
  SELECT
    fe.bookmaker_id, fe.aposta_id, fe.workspace_id, 'REVERSAL', fe.tipo_uso,
    'liquidation_reset', -fe.valor, fe.moeda,
    'rev_' || fe.id || '_' || v_ts_suffix,
    fe.id, 'Estorno para re-liquidação (Perna Composta)', auth.uid()
  FROM public.financial_events fe
  WHERE fe.aposta_id = v_surebet_id
    AND fe.tipo_evento IN ('PAYOUT','VOID_REFUND','FREEBET_PAYOUT')
    AND fe.created_at < v_now
    AND fe.idempotency_key LIKE '%perna_' || p_perna_id || '%'
    AND NOT EXISTS (
      SELECT 1 FROM public.financial_events r
      WHERE r.tipo_evento = 'REVERSAL' AND r.reversed_event_id = fe.id
    )
  ON CONFLICT (idempotency_key) DO NOTHING;

  -- 2) STATUS DA PERNA
  UPDATE public.apostas_pernas SET
    resultado = CASE WHEN p_resultado = 'PENDENTE' THEN NULL ELSE p_resultado END,
    updated_at = NOW()
  WHERE id = p_perna_id;

  -- 3) PROCESSAR ENTRADAS
  SELECT EXISTS(SELECT 1 FROM public.apostas_perna_entradas WHERE perna_id = p_perna_id) INTO v_has_entries;

  IF p_resultado != 'PENDENTE' AND p_resultado IS NOT NULL THEN
    IF v_has_entries THEN
      FOR v_entry IN
        SELECT ae.id, ae.bookmaker_id, ae.stake, ae.odd, ae.moeda,
               COALESCE(ae.fonte_saldo,'REAL') AS fonte_saldo,
               COALESCE(ae.tipo, v_perna_lógica.tipo, 'back') AS tipo,
               COALESCE(ae.comissao, v_perna_lógica.comissao, 0) AS comissao,
               bk.nome AS bk_nome
        FROM public.apostas_perna_entradas ae
        JOIN public.bookmakers bk ON bk.id = ae.bookmaker_id
        WHERE ae.perna_id = p_perna_id
      LOOP
        v_is_fb := (v_entry.fonte_saldo = 'FREEBET');
        v_is_lay := (v_entry.tipo = 'lay');
        v_comissao := v_entry.comissao;
        v_liability := v_entry.stake * GREATEST(v_entry.odd - 1, 0);
        v_payout := 0;
        v_refund := 0;

        IF v_is_lay THEN
          IF p_resultado = 'GREEN' THEN
            v_payout := v_entry.stake * (1 - v_comissao);
            v_refund := v_liability;
            v_perna_lucro_acumulado := v_perna_lucro_acumulado + v_entry.stake * (1 - v_comissao);
          ELSIF p_resultado = 'MEIO_GREEN' THEN
            v_payout := (v_entry.stake / 2) * (1 - v_comissao);
            v_refund := v_liability;
            v_perna_lucro_acumulado := v_perna_lucro_acumulado + (v_entry.stake / 2) * (1 - v_comissao);
          ELSIF p_resultado = 'MEIO_RED' THEN
            v_refund := v_liability / 2;
            v_perna_lucro_acumulado := v_perna_lucro_acumulado - (v_liability / 2);
          ELSIF p_resultado = 'RED' THEN
            v_perna_lucro_acumulado := v_perna_lucro_acumulado - v_liability;
          ELSIF p_resultado = 'VOID' THEN
            v_refund := v_liability;
          END IF;
        ELSE
          IF p_resultado = 'GREEN' THEN
            v_payout := CASE WHEN v_is_fb THEN v_entry.stake * (v_entry.odd - 1) ELSE v_entry.stake * v_entry.odd END;
            v_perna_lucro_acumulado := v_perna_lucro_acumulado + (v_payout - (CASE WHEN v_is_fb THEN 0 ELSE v_entry.stake END));
          ELSIF p_resultado = 'MEIO_GREEN' THEN
            v_payout := CASE
              WHEN v_is_fb THEN (v_entry.stake * (v_entry.odd - 1)) / 2
              ELSE (v_entry.stake / 2) + ((v_entry.stake / 2) * v_entry.odd)
            END;
            v_perna_lucro_acumulado := v_perna_lucro_acumulado + (v_payout - (CASE WHEN v_is_fb THEN 0 ELSE v_entry.stake END));
          ELSIF p_resultado = 'MEIO_RED' THEN
            v_refund := v_entry.stake / 2;
            v_perna_lucro_acumulado := v_perna_lucro_acumulado - (CASE WHEN v_is_fb THEN 0 ELSE (v_entry.stake / 2) END);
          ELSIF p_resultado = 'RED' THEN
            v_perna_lucro_acumulado := v_perna_lucro_acumulado - (CASE WHEN v_is_fb THEN 0 ELSE v_entry.stake END);
          ELSIF p_resultado = 'VOID' THEN
            v_refund := v_entry.stake;
          END IF;
        END IF;

        IF v_payout > 0 THEN
          INSERT INTO public.financial_events (
            bookmaker_id, aposta_id, workspace_id, tipo_evento, tipo_uso,
            origem, valor, moeda, idempotency_key, descricao, created_by
          ) VALUES (
            v_entry.bookmaker_id, v_surebet_id, p_workspace_id,
            CASE WHEN (v_is_fb AND NOT v_is_lay) THEN 'FREEBET_PAYOUT' ELSE 'PAYOUT' END,
            CASE WHEN (v_is_fb AND NOT v_is_lay) THEN 'FREEBET' ELSE 'NORMAL' END,
            'LUCRO', v_payout, v_entry.moeda,
            'payout_perna_' || p_perna_id || '_ent_' || v_entry.id || '_' || v_ts_suffix,
            format('Payout %s Perna Composta %s (%s)', p_resultado, v_entry.tipo, v_entry.bk_nome),
            auth.uid()
          ) ON CONFLICT (idempotency_key) DO NOTHING;
          v_events_count := v_events_count + 1;
        END IF;

        IF v_refund > 0 THEN
          INSERT INTO public.financial_events (
            bookmaker_id, aposta_id, workspace_id, tipo_evento, tipo_uso,
            origem, valor, moeda, idempotency_key, descricao, created_by
          ) VALUES (
            v_entry.bookmaker_id, v_surebet_id, p_workspace_id, 'VOID_REFUND',
            CASE WHEN (v_is_fb AND NOT v_is_lay) THEN 'FREEBET' ELSE 'NORMAL' END,
            'ESTORNO', v_refund, v_entry.moeda,
            'voidrefund_perna_' || p_perna_id || '_ent_' || v_entry.id || '_' || v_ts_suffix,
            format('Reembolso %s Perna Composta %s (%s)', p_resultado, v_entry.tipo, v_entry.bk_nome),
            auth.uid()
          ) ON CONFLICT (idempotency_key) DO NOTHING;
          v_events_count := v_events_count + 1;
        END IF;
      END LOOP;
    ELSE
      -- Fallback legado (sem entradas)
      v_is_fb := (v_perna_lógica.fonte_saldo = 'FREEBET');
      v_is_lay := (v_perna_lógica.tipo = 'lay');
      v_comissao := v_perna_lógica.comissao;
      v_liability := v_perna_lógica.stake * GREATEST(v_perna_lógica.odd - 1, 0);
      v_payout := 0;
      v_refund := 0;

      IF v_is_lay THEN
        IF p_resultado = 'GREEN' THEN
          v_payout := v_perna_lógica.stake * (1 - v_comissao);
          v_refund := v_liability;
          v_perna_lucro_acumulado := v_perna_lógica.stake * (1 - v_comissao);
        ELSIF p_resultado = 'MEIO_GREEN' THEN
          v_payout := (v_perna_lógica.stake / 2) * (1 - v_comissao);
          v_refund := v_liability;
          v_perna_lucro_acumulado := (v_perna_lógica.stake / 2) * (1 - v_comissao);
        ELSIF p_resultado = 'MEIO_RED' THEN
          v_refund := v_liability / 2;
          v_perna_lucro_acumulado := -(v_liability / 2);
        ELSIF p_resultado = 'RED' THEN
          v_perna_lucro_acumulado := -v_liability;
        ELSIF p_resultado = 'VOID' THEN
          v_refund := v_liability;
          v_perna_lucro_acumulado := 0;
        END IF;
      ELSE
        IF p_resultado = 'GREEN' THEN
          v_payout := CASE WHEN v_is_fb THEN v_perna_lógica.stake * (v_perna_lógica.odd - 1) ELSE v_perna_lógica.stake * v_perna_lógica.odd END;
          v_perna_lucro_acumulado := v_payout - (CASE WHEN v_is_fb THEN 0 ELSE v_perna_lógica.stake END);
        ELSIF p_resultado = 'MEIO_GREEN' THEN
          v_payout := CASE
            WHEN v_is_fb THEN (v_perna_lógica.stake * (v_perna_lógica.odd - 1)) / 2
            ELSE (v_perna_lógica.stake / 2) + ((v_perna_lógica.stake / 2) * v_perna_lógica.odd)
          END;
          v_perna_lucro_acumulado := v_payout - (CASE WHEN v_is_fb THEN 0 ELSE v_perna_lógica.stake END);
        ELSIF p_resultado = 'MEIO_RED' THEN
          v_refund := v_perna_lógica.stake / 2;
          v_perna_lucro_acumulado := -(CASE WHEN v_is_fb THEN 0 ELSE (v_perna_lógica.stake / 2) END);
        ELSIF p_resultado = 'RED' THEN
          v_perna_lucro_acumulado := -(CASE WHEN v_is_fb THEN 0 ELSE v_perna_lógica.stake END);
        ELSIF p_resultado = 'VOID' THEN
          v_refund := v_perna_lógica.stake;
          v_perna_lucro_acumulado := 0;
        END IF;
      END IF;

      IF v_payout > 0 THEN
        INSERT INTO public.financial_events (
          bookmaker_id, aposta_id, workspace_id, tipo_evento, tipo_uso,
          origem, valor, moeda, idempotency_key, descricao, created_by
        ) VALUES (
          v_perna_lógica.bookmaker_id, v_surebet_id, p_workspace_id,
          CASE WHEN (v_is_fb AND NOT v_is_lay) THEN 'FREEBET_PAYOUT' ELSE 'PAYOUT' END,
          CASE WHEN (v_is_fb AND NOT v_is_lay) THEN 'FREEBET' ELSE 'NORMAL' END,
          'LUCRO', v_payout, v_perna_lógica.moeda,
          'payout_perna_' || p_perna_id || '_' || v_ts_suffix,
          format('Payout %s Perna Simples %s', p_resultado, v_perna_lógica.tipo),
          auth.uid()
        ) ON CONFLICT (idempotency_key) DO NOTHING;
        v_events_count := v_events_count + 1;
      END IF;

      IF v_refund > 0 THEN
        INSERT INTO public.financial_events (
          bookmaker_id, aposta_id, workspace_id, tipo_evento, tipo_uso,
          origem, valor, moeda, idempotency_key, descricao, created_by
        ) VALUES (
          v_perna_lógica.bookmaker_id, v_surebet_id, p_workspace_id, 'VOID_REFUND',
          CASE WHEN (v_is_fb AND NOT v_is_lay) THEN 'FREEBET' ELSE 'NORMAL' END,
          'ESTORNO', v_refund, v_perna_lógica.moeda,
          'voidrefund_perna_' || p_perna_id || '_' || v_ts_suffix,
          format('Reembolso %s Perna Simples %s', p_resultado, v_perna_lógica.tipo),
          auth.uid()
        ) ON CONFLICT (idempotency_key) DO NOTHING;
        v_events_count := v_events_count + 1;
      END IF;
    END IF;
  END IF;

  UPDATE public.apostas_pernas SET lucro_prejuizo = v_perna_lucro_acumulado WHERE id = p_perna_id;

  SELECT r.todas_liquidadas, r.lucro_total, r.stake_total, r.resultado_geral, r.is_multicurrency, r.pl_consolidado, r.stake_consolidado, r.consolidation_currency
    INTO v_todas_liquidadas, v_lucro_total, v_stake_total, v_resultado_final, v_is_multicurrency, v_pl_consolidado, v_stake_consolidado, v_consol_currency
  FROM fn_recalc_pai_surebet(v_surebet_id) r;

  UPDATE public.apostas_unificada SET
    status = CASE WHEN v_todas_liquidadas THEN 'LIQUIDADA' ELSE 'PARCIAL' END,
    resultado = CASE WHEN v_todas_liquidadas THEN v_resultado_final ELSE 'PENDENTE' END,
    lucro_prejuizo = v_lucro_total,
    stake = v_stake_total,
    is_multicurrency = v_is_multicurrency,
    pl_consolidado = v_pl_consolidado,
    stake_consolidado = v_stake_consolidado,
    consolidation_currency = v_consol_currency,
    updated_at = NOW()
  WHERE id = v_surebet_id;

  PERFORM public.sync_bookmaker_balance_from_ledger(v_perna_lógica.bookmaker_id);

  RETURN jsonb_build_object('success', true, 'events_created', v_events_count);
END;
$function$;


-- ============================================================
-- FIX 2 & 3: editar_surebet_completa_v3
--   - REVERSAL unificado ANTES do DELETE (fix double-debit)
--   - INSERT em aposta_edit_audit_logs (fix auditoria)
--   - cotacao_snapshot preservado em INSERT de novas entradas
-- ============================================================
CREATE OR REPLACE FUNCTION public.editar_surebet_completa_v3(
  p_aposta_id uuid, p_pernas jsonb, p_entradas jsonb,
  p_evento text, p_esporte text, p_mercado text, p_modelo text,
  p_estrategia text, p_contexto text, p_data_aposta timestamp with time zone,
  p_status_manual text DEFAULT NULL::text
)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_aposta record; v_workspace_id UUID; v_user_id UUID;
  v_elem jsonb; v_perna_id UUID; v_entrada_id UUID;
  v_perna_idx INTEGER := 0;
  v_input_perna_ids UUID[] := '{}';
  v_input_entrada_ids UUID[] := '{}';
  v_audit_log_id UUID;
  v_snapshot_pernas_antes JSONB;
  v_snapshot_entradas_antes JSONB;
  v_status_after TEXT;
  v_resultado_after TEXT;
  v_ts_suffix TEXT := extract(epoch from clock_timestamp())::bigint::text;
BEGIN
  PERFORM set_config('app.surebet_recalc_context', 'on', true);

  SELECT * INTO v_aposta FROM public.apostas_unificada WHERE id = p_aposta_id FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('success', false, 'error', 'Aposta não encontrada'); END IF;

  v_workspace_id := v_aposta.workspace_id;
  v_user_id := COALESCE(auth.uid(), v_aposta.user_id);

  -- Snapshot BEFORE
  SELECT jsonb_agg(jsonb_build_object('id', id, 'stake', stake, 'odd', odd, 'resultado', resultado, 'lucro_prejuizo', lucro_prejuizo))
  INTO v_snapshot_pernas_antes
  FROM public.apostas_pernas WHERE aposta_id = p_aposta_id;

  SELECT jsonb_agg(jsonb_build_object('id', id, 'perna_id', perna_id, 'stake', stake, 'odd', odd, 'bookmaker_id', bookmaker_id, 'cotacao_snapshot', cotacao_snapshot))
  INTO v_snapshot_entradas_antes
  FROM public.apostas_perna_entradas
  WHERE perna_id IN (SELECT id FROM public.apostas_pernas WHERE aposta_id = p_aposta_id);

  INSERT INTO public.debug_logs (modulo, evento, payload, user_id)
  VALUES ('Surebet', 'AUDIT_EDIT_START',
    jsonb_build_object('aposta_id', p_aposta_id, 'lucro_antes', v_aposta.lucro_prejuizo,
      'status_antes', v_aposta.status, 'pernas_antes', v_snapshot_pernas_antes,
      'entradas_antes', v_snapshot_entradas_antes), v_user_id);

  -- Coletar IDs de pernas que VÃO permanecer (vindos do payload com id)
  FOR v_elem IN SELECT * FROM jsonb_array_elements(p_pernas) LOOP
    v_perna_id := (v_elem->>'id')::UUID;
    IF v_perna_id IS NOT NULL THEN
      v_input_perna_ids := array_append(v_input_perna_ids, v_perna_id);
    END IF;
  END LOOP;

  -- Coletar IDs de entradas que VÃO permanecer
  FOR v_elem IN SELECT * FROM jsonb_array_elements(p_entradas) LOOP
    v_entrada_id := (v_elem->>'id')::UUID;
    IF v_entrada_id IS NOT NULL THEN
      v_input_entrada_ids := array_append(v_input_entrada_ids, v_entrada_id);
    END IF;
  END LOOP;

  -- === FIX #3: REVERSAL UNIFICADO ANTES DO DELETE ===
  -- Estorna TODOS os eventos (stake/payout/refund) vinculados a pernas/entradas
  -- que serão REMOVIDAS, ANTES do cascade DELETE remover as evidências.
  INSERT INTO public.financial_events (
    bookmaker_id, aposta_id, workspace_id, tipo_evento, tipo_uso,
    valor, moeda, idempotency_key, reversed_event_id, descricao, created_by
  )
  SELECT
    fe.bookmaker_id, fe.aposta_id, fe.workspace_id, 'REVERSAL', fe.tipo_uso,
    -fe.valor, fe.moeda,
    'rev_edit_' || fe.id || '_' || v_ts_suffix,
    fe.id, 'Estorno por edição (perna/entrada removida)', v_user_id
  FROM public.financial_events fe
  WHERE fe.aposta_id = p_aposta_id
    AND fe.tipo_evento NOT IN ('REVERSAL')
    AND NOT EXISTS (
      SELECT 1 FROM public.financial_events r
      WHERE r.tipo_evento = 'REVERSAL' AND r.reversed_event_id = fe.id
    )
    AND (
      -- perna-level keys (stake_perna_X, payout_perna_X, voidrefund_perna_X)
      EXISTS (
        SELECT 1 FROM public.apostas_pernas ap
        WHERE ap.aposta_id = p_aposta_id
          AND ap.id <> ALL(v_input_perna_ids)
          AND fe.idempotency_key LIKE '%perna_' || ap.id::text || '%'
      )
      -- entry-level keys (stake_entry_Y, payout_perna_X_ent_Y, voidrefund_perna_X_ent_Y)
      OR EXISTS (
        SELECT 1 FROM public.apostas_perna_entradas ae
        JOIN public.apostas_pernas ap ON ap.id = ae.perna_id
        WHERE ap.aposta_id = p_aposta_id
          AND (ap.id <> ALL(v_input_perna_ids) OR ae.id <> ALL(v_input_entrada_ids))
          AND fe.idempotency_key LIKE '%' || ae.id::text || '%'
      )
    )
  ON CONFLICT (idempotency_key) DO NOTHING;

  -- DELETE pernas removidas (cascade limpa entradas)
  DELETE FROM public.apostas_pernas WHERE aposta_id = p_aposta_id AND id <> ALL(v_input_perna_ids);
  UPDATE public.apostas_pernas SET ordem = ordem + 1000 WHERE aposta_id = p_aposta_id;

  -- UPSERT pernas
  v_perna_idx := 0;
  FOR v_elem IN SELECT * FROM jsonb_array_elements(p_pernas) LOOP
    v_perna_idx := v_perna_idx + 1;
    v_perna_id := (v_elem->>'id')::UUID;

    IF v_perna_id IS NOT NULL THEN
      UPDATE public.apostas_pernas SET
        selecao = v_elem->>'selecao',
        selecao_livre = v_elem->>'selecao_livre',
        ordem = v_perna_idx,
        resultado = COALESCE(v_elem->>'resultado', resultado),
        tipo = COALESCE(NULLIF(v_elem->>'tipo',''), tipo),
        comissao = COALESCE((v_elem->>'comissao')::NUMERIC, comissao),
        updated_at = NOW()
      WHERE id = v_perna_id;
    ELSE
      INSERT INTO public.apostas_pernas (
        aposta_id, ordem, selecao, selecao_livre, bookmaker_id,
        stake, odd, moeda, resultado, tipo, comissao
      ) VALUES (
        p_aposta_id, v_perna_idx, v_elem->>'selecao', v_elem->>'selecao_livre',
        (v_elem->>'casa_id')::UUID, 1, 1, 'BRL', v_elem->>'resultado',
        COALESCE(NULLIF(v_elem->>'tipo',''), 'back'),
        COALESCE((v_elem->>'comissao')::NUMERIC, 0)
      ) RETURNING id INTO v_perna_id;
      v_input_perna_ids := array_append(v_input_perna_ids, v_perna_id);
    END IF;
  END LOOP;

  -- UPSERT entradas (+ stake events)
  FOR v_elem IN SELECT * FROM jsonb_array_elements(p_entradas) LOOP
    v_entrada_id := (v_elem->>'id')::UUID;
    v_perna_id := NULL;

    IF v_entrada_id IS NOT NULL THEN
      SELECT perna_id INTO v_perna_id FROM public.apostas_perna_entradas WHERE id = v_entrada_id;
    END IF;

    IF v_perna_id IS NULL THEN
      IF v_elem ? 'perna_id' AND (v_elem->>'perna_id') IS NOT NULL THEN
        v_perna_id := (v_elem->>'perna_id')::UUID;
      ELSIF v_elem ? 'perna_index' THEN
        v_perna_id := v_input_perna_ids[(v_elem->>'perna_index')::INTEGER + 1];
      ELSIF v_elem ? 'perna_ordem' THEN
        v_perna_id := v_input_perna_ids[(v_elem->>'perna_ordem')::INTEGER];
      END IF;
    END IF;

    IF v_perna_id IS NULL THEN
      RETURN jsonb_build_object('success', false, 'error', 'Não foi possível associar a entrada a uma perna válida');
    END IF;

    IF v_entrada_id IS NOT NULL THEN
      v_input_entrada_ids := array_append(v_input_entrada_ids, v_entrada_id);
      UPDATE public.apostas_perna_entradas SET
        perna_id = v_perna_id,
        bookmaker_id = (v_elem->>'bookmaker_id')::UUID,
        stake = (v_elem->>'stake')::NUMERIC,
        odd = (v_elem->>'odd')::NUMERIC,
        moeda = COALESCE(v_elem->>'moeda', 'BRL'),
        fonte_saldo = COALESCE(v_elem->>'fonte_saldo', 'REAL'),
        stake_real = CASE WHEN (v_elem->>'fonte_saldo') = 'FREEBET' THEN 0 ELSE (v_elem->>'stake')::NUMERIC END,
        stake_freebet = CASE WHEN (v_elem->>'fonte_saldo') = 'FREEBET' THEN (v_elem->>'stake')::NUMERIC ELSE 0 END,
        tipo = COALESCE(NULLIF(v_elem->>'tipo',''), tipo),
        comissao = COALESCE((v_elem->>'comissao')::NUMERIC, comissao),
        -- FIX: preservar cotacao_snapshot se vier no payload, senão manter o existente
        cotacao_snapshot = COALESCE((v_elem->>'cotacao_snapshot')::NUMERIC, cotacao_snapshot),
        stake_brl_referencia = COALESCE((v_elem->>'stake_brl_referencia')::NUMERIC, stake_brl_referencia),
        updated_at = NOW()
      WHERE id = v_entrada_id;
    ELSE
      INSERT INTO public.apostas_perna_entradas (
        perna_id, bookmaker_id, stake, odd, moeda, fonte_saldo,
        stake_real, stake_freebet, tipo, comissao,
        cotacao_snapshot, stake_brl_referencia,
        created_at, updated_at
      ) VALUES (
        v_perna_id, (v_elem->>'bookmaker_id')::UUID, (v_elem->>'stake')::NUMERIC, (v_elem->>'odd')::NUMERIC,
        COALESCE(v_elem->>'moeda', 'BRL'), COALESCE(v_elem->>'fonte_saldo', 'REAL'),
        CASE WHEN (v_elem->>'fonte_saldo') = 'FREEBET' THEN 0 ELSE (v_elem->>'stake')::NUMERIC END,
        CASE WHEN (v_elem->>'fonte_saldo') = 'FREEBET' THEN (v_elem->>'stake')::NUMERIC ELSE 0 END,
        COALESCE(NULLIF(v_elem->>'tipo',''), 'back'),
        COALESCE((v_elem->>'comissao')::NUMERIC, 0),
        -- FIX: cotacao_snapshot e stake_brl_referencia preservados do payload
        COALESCE((v_elem->>'cotacao_snapshot')::NUMERIC, 1),
        COALESCE((v_elem->>'stake_brl_referencia')::NUMERIC, (v_elem->>'stake')::NUMERIC),
        NOW(), NOW()
      ) RETURNING id INTO v_entrada_id;
      v_input_entrada_ids := array_append(v_input_entrada_ids, v_entrada_id);
    END IF;

    PERFORM public.fn_sync_stake_event_v1(
      v_entrada_id, p_aposta_id, v_workspace_id, (v_elem->>'bookmaker_id')::UUID,
      (v_elem->>'stake')::NUMERIC, COALESCE(v_elem->>'moeda', 'BRL'),
      COALESCE(v_elem->>'fonte_saldo', 'REAL'), v_user_id
    );
  END LOOP;

  -- DELETE entradas órfãs (não vieram no payload e sobreviveram ao cascade)
  DELETE FROM public.apostas_perna_entradas
  WHERE perna_id IN (SELECT id FROM public.apostas_pernas WHERE aposta_id = p_aposta_id)
    AND id <> ALL(v_input_entrada_ids);

  -- Reconsolida pernas a partir das entradas
  UPDATE public.apostas_pernas ap
  SET
    stake = sub.total_stake,
    odd = sub.avg_odd,
    moeda = sub.main_moeda,
    bookmaker_id = sub.main_bookmaker_id::UUID,
    stake_real = sub.total_real,
    stake_freebet = sub.total_freebet,
    stake_brl_referencia = sub.total_brl
  FROM (
    SELECT perna_id,
      SUM(stake) as total_stake,
      CASE WHEN SUM(stake) > 0 THEN SUM(odd * stake) / SUM(stake) ELSE 1 END as avg_odd,
      MAX(moeda) as main_moeda,
      MAX(bookmaker_id::TEXT) as main_bookmaker_id,
      SUM(stake_real) as total_real,
      SUM(stake_freebet) as total_freebet,
      SUM(COALESCE(stake_brl_referencia, stake)) as total_brl
    FROM public.apostas_perna_entradas
    WHERE perna_id IN (SELECT id FROM public.apostas_pernas WHERE aposta_id = p_aposta_id)
    GROUP BY perna_id
  ) sub
  WHERE ap.id = sub.perna_id;

  -- Re-liquidar pernas que tinham resultado
  FOR v_perna_id IN SELECT id FROM public.apostas_pernas WHERE aposta_id = p_aposta_id AND resultado IS NOT NULL AND resultado <> 'PENDENTE' LOOP
    PERFORM public.liquidar_perna_surebet_v1(v_perna_id, (SELECT resultado FROM public.apostas_pernas WHERE id = v_perna_id), v_workspace_id);
  END LOOP;

  UPDATE public.apostas_unificada SET
    evento = p_evento, esporte = p_esporte, mercado = p_mercado,
    modelo = p_modelo, estrategia = p_estrategia,
    contexto_operacional = p_contexto, data_aposta = p_data_aposta,
    updated_at = NOW()
  WHERE id = p_aposta_id;

  PERFORM public.fn_recalc_pai_surebet(p_aposta_id);

  -- === FIX #1: AUDITORIA OFICIAL ===
  SELECT status, resultado INTO v_status_after, v_resultado_after
    FROM public.apostas_unificada WHERE id = p_aposta_id;

  INSERT INTO public.aposta_edit_audit_logs (
    workspace_id, projeto_id, aposta_id, actor_user_id,
    action,
    status_before, resultado_before,
    status_after, resultado_after,
    before_data, after_data,
    success
  ) VALUES (
    v_workspace_id, v_aposta.projeto_id, p_aposta_id, v_user_id,
    'EDIT_SUREBET_COMPLETA',
    v_aposta.status, v_aposta.resultado,
    v_status_after, v_resultado_after,
    jsonb_build_object('pernas', COALESCE(v_snapshot_pernas_antes, '[]'::jsonb),
                       'entradas', COALESCE(v_snapshot_entradas_antes, '[]'::jsonb)),
    jsonb_build_object(
      'pernas', COALESCE((SELECT jsonb_agg(jsonb_build_object('id', id, 'stake', stake, 'odd', odd, 'resultado', resultado, 'lucro_prejuizo', lucro_prejuizo))
                          FROM public.apostas_pernas WHERE aposta_id = p_aposta_id), '[]'::jsonb),
      'entradas', COALESCE((SELECT jsonb_agg(jsonb_build_object('id', id, 'perna_id', perna_id, 'stake', stake, 'odd', odd, 'bookmaker_id', bookmaker_id, 'cotacao_snapshot', cotacao_snapshot))
                            FROM public.apostas_perna_entradas
                            WHERE perna_id IN (SELECT id FROM public.apostas_pernas WHERE aposta_id = p_aposta_id)), '[]'::jsonb)
    ),
    true
  );

  RETURN jsonb_build_object('success', true, 'aposta_id', p_aposta_id);

EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$function$;

NOTIFY pgrst, 'reload schema';
