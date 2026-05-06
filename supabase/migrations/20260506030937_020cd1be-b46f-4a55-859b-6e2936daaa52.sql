-- 1. Fix liquidar_perna_surebet_v1 to NOT set lucro_prejuizo to NULL if pending
CREATE OR REPLACE FUNCTION public.liquidar_perna_surebet_v1(p_perna_id UUID, p_resultado TEXT, p_workspace_id UUID)
RETURNS JSONB AS $$
DECLARE
  v_surebet_id UUID;
  v_old_resultado TEXT;
  v_entry RECORD;
  v_payout NUMERIC := 0;
  v_is_fb BOOLEAN;
  v_todas_liquidadas BOOLEAN;
  v_lucro_total NUMERIC;
  v_stake_total NUMERIC;
  v_resultado_final TEXT;
  v_is_multicurrency BOOLEAN;
  v_events_count INTEGER := 0;
  v_has_entries BOOLEAN := false;
  v_perna_lógica RECORD;
BEGIN
  -- Contexto de recálculo (bypass triggers de proteção)
  PERFORM set_config('app.surebet_recalc_context', 'on', true);

  SELECT ap.aposta_id, ap.resultado, ap.bookmaker_id, ap.stake, ap.odd, ap.moeda, COALESCE(ap.fonte_saldo, 'REAL') as fonte_saldo
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

  IF COALESCE(v_old_resultado, 'PENDENTE') = p_resultado THEN
    RETURN jsonb_build_object('success', true, 'message', 'Resultado já é o mesmo', 'perna_id', p_perna_id);
  END IF;

  INSERT INTO public.financial_events (
    bookmaker_id, aposta_id, workspace_id, tipo_evento, tipo_uso,
    origem, valor, moeda, idempotency_key, reversed_event_id, descricao, created_by
  )
  SELECT 
    fe.bookmaker_id, fe.aposta_id, fe.workspace_id, 'REVERSAL', fe.tipo_uso,
    'liquidation_reset', -fe.valor, fe.moeda,
    'rev_' || fe.id || '_' || extract(epoch from now())::text,
    fe.id, 'Estorno para re-liquidação (Perna Composta)', auth.uid()
  FROM public.financial_events fe
  WHERE fe.aposta_id = v_surebet_id
    AND fe.tipo_evento IN ('PAYOUT', 'VOID_REFUND', 'FREEBET_PAYOUT')
    AND (
      fe.idempotency_key LIKE '%perna_' || p_perna_id || '%' OR
      fe.idempotency_key LIKE '%payout_perna_' || p_perna_id || '%' OR
      fe.idempotency_key LIKE '%voidrefund_perna_' || p_perna_id || '%'
    );

  UPDATE public.apostas_pernas SET
    resultado = CASE WHEN p_resultado = 'PENDENTE' THEN NULL ELSE p_resultado END,
    updated_at = NOW()
  WHERE id = p_perna_id;

  SELECT EXISTS(SELECT 1 FROM public.apostas_perna_entradas WHERE perna_id = p_perna_id) INTO v_has_entries;

  IF p_resultado != 'PENDENTE' THEN
    IF v_has_entries THEN
      FOR v_entry IN 
        SELECT id, bookmaker_id, stake, odd, moeda, COALESCE(fonte_saldo, 'REAL') as fonte_saldo,
               (SELECT nome FROM public.bookmakers WHERE id = ae.bookmaker_id) as bk_nome
        FROM public.apostas_perna_entradas ae 
        WHERE perna_id = p_perna_id 
      LOOP
        v_is_fb := (v_entry.fonte_saldo = 'FREEBET');
        
        IF p_resultado = 'GREEN' THEN
          v_payout := CASE WHEN v_is_fb THEN v_entry.stake * (v_entry.odd - 1) ELSE v_entry.stake * v_entry.odd END;
          INSERT INTO public.financial_events (
            bookmaker_id, aposta_id, workspace_id, tipo_evento, tipo_uso,
            origem, valor, moeda, idempotency_key, descricao, created_by
          ) VALUES (
            v_entry.bookmaker_id, v_surebet_id, p_workspace_id,
            CASE WHEN v_is_fb THEN 'FREEBET_PAYOUT' ELSE 'PAYOUT' END,
            CASE WHEN v_is_fb THEN 'FREEBET' ELSE 'NORMAL' END,
            'LUCRO', v_payout, v_entry.moeda,
            'payout_perna_' || p_perna_id || '_ent_' || v_entry.id || '_' || extract(epoch from now())::text,
            format('Payout %s Perna Composta (%s)', p_resultado, v_entry.bk_nome),
            auth.uid()
          );
          v_events_count := v_events_count + 1;
        ELSIF p_resultado = 'VOID' THEN
          INSERT INTO public.financial_events (
            bookmaker_id, aposta_id, workspace_id, tipo_evento, tipo_uso,
            origem, valor, moeda, idempotency_key, descricao, created_by
          ) VALUES (
            v_entry.bookmaker_id, v_surebet_id, p_workspace_id, 'VOID_REFUND',
            CASE WHEN v_is_fb THEN 'FREEBET' ELSE 'NORMAL' END,
            'ESTORNO', v_entry.stake, v_entry.moeda,
            'voidrefund_perna_' || p_perna_id || '_ent_' || v_entry.id || '_' || extract(epoch from now())::text,
            format('Reembolso VOID Perna Composta (%s)', v_entry.bk_nome),
            auth.uid()
          );
          v_events_count := v_events_count + 1;
        END IF;
      END LOOP;
    END IF;
  END IF;

  SELECT r.todas_liquidadas, r.lucro_total, r.stake_total, r.resultado_geral, r.is_multicurrency
  INTO v_todas_liquidadas, v_lucro_total, v_stake_total, v_resultado_final, v_is_multicurrency
  FROM public.fn_recalc_pai_surebet(v_surebet_id) r;

  UPDATE public.apostas_unificada SET
    status = CASE WHEN v_todas_liquidadas THEN 'LIQUIDADA' ELSE 'PENDENTE' END,
    resultado = v_resultado_final,
    stake_total = v_stake_total,
    lucro_prejuizo = v_lucro_total, -- SEMPRE define o lucro, mesmo se pendente
    is_multicurrency = v_is_multicurrency,
    updated_at = NOW()
  WHERE id = v_surebet_id;

  RETURN jsonb_build_object(
    'success', true,
    'perna_id', p_perna_id,
    'resultado', p_resultado,
    'events_created', v_events_count,
    'todas_liquidadas', v_todas_liquidadas
  );
END;
$$ LANGUAGE plpgsql;

-- 2. Modify trigger function fn_recalc_aposta_consolidado to run on all statuses
CREATE OR REPLACE FUNCTION public.fn_recalc_aposta_consolidado()
RETURNS TRIGGER AS $$
DECLARE
  v_proj RECORD;
  v_total_nativo NUMERIC := 0;
  v_total_consolidado NUMERIC := 0;
  v_perna RECORD;
  v_rate_perna NUMERIC;
  v_rate_consol NUMERIC;
  v_rate_aposta NUMERIC;
  v_moedas_distintas INT := 0;
  v_is_multi BOOLEAN := FALSE;
  v_perna_count INT := 0;
  v_moeda_origem TEXT;
BEGIN
  -- REMOVED: IF NEW.status <> 'LIQUIDADA' THEN RETURN NEW; END IF;
  -- Always recalculate for updated PL, regardless of status.

  IF TG_OP = 'UPDATE'
     AND OLD.status = NEW.status
     AND OLD.resultado IS NOT DISTINCT FROM NEW.resultado
     AND COALESCE(OLD.lucro_prejuizo, 0) = COALESCE(NEW.lucro_prejuizo, 0) THEN
    RETURN NEW;
  END IF;

  SELECT
    COALESCE(moeda_consolidacao, 'BRL') AS moeda_consolidacao,
    COALESCE(cotacao_trabalho, 1) AS r_usd,
    COALESCE(cotacao_trabalho_eur, 1) AS r_eur,
    COALESCE(cotacao_trabalho_gbp, 1) AS r_gbp,
    COALESCE(cotacao_trabalho_myr, 1) AS r_myr,
    COALESCE(cotacao_trabalho_mxn, 1) AS r_mxn,
    COALESCE(cotacao_trabalho_ars, 1) AS r_ars,
    COALESCE(cotacao_trabalho_cop, 1) AS r_cop
  INTO v_proj
  FROM public.projetos
  WHERE id = NEW.projeto_id;

  IF NOT FOUND THEN
    RETURN NEW;
  END IF;

  v_rate_consol := CASE v_proj.moeda_consolidacao
    WHEN 'BRL' THEN 1
    WHEN 'USD' THEN v_proj.r_usd
    WHEN 'EUR' THEN v_proj.r_eur
    WHEN 'GBP' THEN v_proj.r_gbp
    WHEN 'MYR' THEN v_proj.r_myr
    WHEN 'MXN' THEN v_proj.r_mxn
    WHEN 'ARS' THEN v_proj.r_ars
    WHEN 'COP' THEN v_proj.r_cop
    ELSE 1
  END;

  IF COALESCE(v_rate_consol, 0) = 0 THEN
    v_rate_consol := 1;
  END IF;

  SELECT COUNT(*)
  INTO v_perna_count
  FROM public.apostas_pernas
  WHERE aposta_id = NEW.id;

  IF v_perna_count = 0 THEN
    v_moeda_origem := COALESCE(NULLIF(NEW.moeda_operacao, ''), v_proj.moeda_consolidacao, 'BRL');
    v_rate_aposta := CASE v_moeda_origem
      WHEN 'BRL' THEN 1
      WHEN 'USD' THEN v_proj.r_usd
      WHEN 'EUR' THEN v_proj.r_eur
      WHEN 'GBP' THEN v_proj.r_gbp
      WHEN 'MYR' THEN v_proj.r_myr
      WHEN 'MXN' THEN v_proj.r_mxn
      WHEN 'ARS' THEN v_proj.r_ars
      WHEN 'COP' THEN v_proj.r_cop
      ELSE 1
    END;

    IF COALESCE(v_rate_aposta, 0) = 0 THEN v_rate_aposta := 1; END IF;

    NEW.pl_consolidado := (COALESCE(NEW.lucro_prejuizo, 0) * v_rate_aposta) / v_rate_consol;
    NEW.consolidation_currency := v_proj.moeda_consolidacao;
    NEW.is_multicurrency := (v_moeda_origem <> v_proj.moeda_consolidacao);
    NEW.conversion_rate_used := v_rate_aposta / v_rate_consol;

    RETURN NEW;
  END IF;

  SELECT COUNT(DISTINCT moeda)
  INTO v_moedas_distintas
  FROM public.apostas_pernas
  WHERE aposta_id = NEW.id;

  v_is_multi := v_moedas_distintas > 1
    OR EXISTS (
      SELECT 1
      FROM public.apostas_pernas
      WHERE aposta_id = NEW.id
        AND moeda <> v_proj.moeda_consolidacao
    );

  FOR v_perna IN
    SELECT moeda, COALESCE(lucro_prejuizo, 0) AS lp
    FROM public.apostas_pernas
    WHERE aposta_id = NEW.id
  LOOP
    v_rate_perna := CASE v_perna.moeda
      WHEN 'BRL' THEN 1
      WHEN 'USD' THEN v_proj.r_usd
      WHEN 'EUR' THEN v_proj.r_eur
      WHEN 'GBP' THEN v_proj.r_gbp
      WHEN 'MYR' THEN v_proj.r_myr
      WHEN 'MXN' THEN v_proj.r_mxn
      WHEN 'ARS' THEN v_proj.r_ars
      WHEN 'COP' THEN v_proj.r_cop
      ELSE 1
    END;

    IF COALESCE(v_rate_perna, 0) = 0 THEN v_rate_perna := 1; END IF;

    v_total_consolidado := v_total_consolidado + (v_perna.lp * v_rate_perna) / v_rate_consol;
  END LOOP;

  NEW.pl_consolidado := v_total_consolidado;
  NEW.consolidation_currency := v_proj.moeda_consolidacao;
  NEW.is_multicurrency := v_is_multi;

  IF v_is_multi THEN
    NEW.moeda_operacao := 'MULTI';
    NEW.lucro_prejuizo := v_total_consolidado;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;