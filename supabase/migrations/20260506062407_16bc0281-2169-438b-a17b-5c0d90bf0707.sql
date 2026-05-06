
-- =====================================================================
-- LEDGER HARDENING v1 — corrigir raiz das duplicidades de stake/reversal
-- =====================================================================

-- 1) Guard transacional para evitar débito duplo de stake na criação de Surebet.
--    A RPC criar_surebet_atomica seta app.skip_perna_auto_stake='on' antes
--    de inserir pernas, e o trigger respeita esse contexto.
CREATE OR REPLACE FUNCTION public.fn_perna_auto_stake_ledger()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  v_moeda TEXT;
  v_workspace_id UUID;
  v_user_id UUID;
  v_skip TEXT;
BEGIN
  IF NEW.bookmaker_id IS NULL OR COALESCE(NEW.stake, 0) <= 0 THEN
    RETURN NEW;
  END IF;

  -- Contexto: se a RPC canônica (criar_surebet_atomica) está rodando,
  -- ela já cuida de inserir os eventos STAKE no ledger e não queremos
  -- gerar débito duplicado pelo trigger.
  BEGIN
    v_skip := current_setting('app.skip_perna_auto_stake', true);
  EXCEPTION WHEN OTHERS THEN
    v_skip := NULL;
  END;
  IF v_skip = 'on' THEN
    RETURN NEW;
  END IF;

  -- Idempotência ampla: não duplicar se já existe QUALQUER evento de stake
  -- vinculado a esta perna específica.
  IF EXISTS (
    SELECT 1 FROM public.financial_events
    WHERE aposta_id = NEW.aposta_id
      AND bookmaker_id = NEW.bookmaker_id
      AND tipo_evento IN ('STAKE', 'FREEBET_STAKE')
      AND (
        idempotency_key = 'stake_perna_' || NEW.id
        OR idempotency_key LIKE '%' || NEW.id::text || '%'
      )
  ) THEN
    RETURN NEW;
  END IF;

  SELECT moeda, workspace_id INTO v_moeda, v_workspace_id
  FROM public.bookmakers WHERE id = NEW.bookmaker_id;

  SELECT user_id INTO v_user_id FROM public.apostas_unificada WHERE id = NEW.aposta_id;

  INSERT INTO public.financial_events (
    bookmaker_id, aposta_id, workspace_id, tipo_evento, tipo_uso,
    valor, moeda, idempotency_key, descricao, created_by
  ) VALUES (
    NEW.bookmaker_id, NEW.aposta_id, v_workspace_id,
    CASE WHEN NEW.fonte_saldo = 'FREEBET' OR COALESCE(NEW.stake_freebet, 0) > 0 THEN 'FREEBET_STAKE' ELSE 'STAKE' END,
    CASE WHEN NEW.fonte_saldo = 'FREEBET' OR COALESCE(NEW.stake_freebet, 0) > 0 THEN 'FREEBET' ELSE 'NORMAL' END,
    -NEW.stake,
    COALESCE(NEW.moeda, v_moeda),
    'stake_perna_' || NEW.id,
    'Débito automático de stake da perna (Trigger)',
    v_user_id
  );

  RETURN NEW;
END;
$function$;


-- 2) criar_surebet_atomica: ativa contexto para silenciar o trigger e
--    permanece como única fonte de eventos STAKE da surebet.
CREATE OR REPLACE FUNCTION public.criar_surebet_atomica(
  p_workspace_id uuid, p_user_id uuid, p_projeto_id uuid, p_evento text,
  p_esporte text DEFAULT NULL::text, p_mercado text DEFAULT NULL::text,
  p_modelo text DEFAULT NULL::text, p_estrategia text DEFAULT 'SUREBET'::text,
  p_contexto_operacional text DEFAULT 'NORMAL'::text,
  p_data_aposta text DEFAULT NULL::text, p_pernas jsonb DEFAULT '[]'::jsonb)
 RETURNS TABLE(success boolean, o_aposta_id uuid, events_created integer, message text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_aposta_id UUID;
  v_perna_json JSONB;
  v_idx INTEGER := 0;
  v_perna_id UUID;
  v_events_count INTEGER := 0;
  v_data_aposta_ts TIMESTAMPTZ;
  v_input_ordem INTEGER;
  v_bookmaker_id UUID;
  v_stake NUMERIC;
  v_odd NUMERIC;
  v_moeda TEXT;
  v_fonte_saldo TEXT;
  v_selecao TEXT;
  v_selecao_livre TEXT;
  v_cotacao_snapshot NUMERIC;
  v_saldo_atual NUMERIC;
  v_saldo_freebet NUMERIC;
  v_bookmaker_nome TEXT;
BEGIN
  -- Silencia o trigger fn_perna_auto_stake_ledger durante a inserção
  -- das pernas; esta RPC é a fonte única de STAKE para Surebet.
  PERFORM set_config('app.skip_perna_auto_stake', 'on', true);

  v_data_aposta_ts := COALESCE(p_data_aposta::TIMESTAMPTZ, NOW());

  INSERT INTO public.apostas_unificada (
    workspace_id, user_id, projeto_id, evento, esporte, mercado, modelo,
    estrategia, contexto_operacional, data_aposta, status, forma_registro,
    created_at, updated_at
  ) VALUES (
    p_workspace_id, p_user_id, p_projeto_id, p_evento, p_esporte, p_mercado, p_modelo,
    p_estrategia, p_contexto_operacional, v_data_aposta_ts, 'PENDENTE', 'ARBITRAGEM',
    NOW(), NOW()
  ) RETURNING id INTO v_aposta_id;

  FOR v_perna_json IN SELECT * FROM jsonb_array_elements(p_pernas) LOOP
    v_idx := v_idx + 1;
    v_bookmaker_id := (v_perna_json->>'bookmaker_id')::UUID;
    v_stake := (v_perna_json->>'stake')::NUMERIC;
    v_odd := (v_perna_json->>'odd')::NUMERIC;
    v_moeda := COALESCE(v_perna_json->>'moeda', 'BRL');
    v_fonte_saldo := COALESCE(v_perna_json->>'fonte_saldo', 'REAL');
    v_selecao := COALESCE(v_perna_json->>'selecao', 'Seleção ' || v_idx);
    v_selecao_livre := v_perna_json->>'selecaoLivre';
    v_cotacao_snapshot := (v_perna_json->>'cotacao_snapshot')::NUMERIC;
    v_input_ordem := COALESCE((v_perna_json->>'ordem')::INTEGER, v_idx);

    SELECT b.saldo_atual, b.saldo_freebet, b.nome
    INTO v_saldo_atual, v_saldo_freebet, v_bookmaker_nome
    FROM public.bookmakers b WHERE b.id = v_bookmaker_id AND b.workspace_id = p_workspace_id;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Bookmaker % não encontrada', v_bookmaker_id;
    END IF;

    INSERT INTO public.apostas_pernas (
      aposta_id, ordem, selecao, selecao_livre,
      bookmaker_id, stake, odd, moeda, fonte_saldo,
      stake_real, stake_freebet,
      created_at, updated_at
    ) VALUES (
      v_aposta_id, v_input_ordem, v_selecao, v_selecao_livre,
      v_bookmaker_id, v_stake, v_odd, v_moeda, v_fonte_saldo,
      CASE WHEN v_fonte_saldo = 'FREEBET' THEN 0 ELSE v_stake END,
      CASE WHEN v_fonte_saldo = 'FREEBET' THEN v_stake ELSE 0 END,
      NOW(), NOW()
    )
    ON CONFLICT (aposta_id, ordem) DO UPDATE
    SET updated_at = NOW()
    RETURNING id INTO v_perna_id;

    INSERT INTO public.apostas_perna_entradas (
      perna_id, bookmaker_id, stake, odd, moeda,
      stake_real, stake_freebet, stake_brl_referencia,
      cotacao_snapshot, fonte_saldo, created_at, updated_at
    ) VALUES (
      v_perna_id, v_bookmaker_id, v_stake, v_odd, v_moeda,
      CASE WHEN v_fonte_saldo = 'FREEBET' THEN 0 ELSE v_stake END,
      CASE WHEN v_fonte_saldo = 'FREEBET' THEN v_stake ELSE 0 END,
      (v_perna_json->>'stake_brl_referencia')::NUMERIC,
      v_cotacao_snapshot, v_fonte_saldo, NOW(), NOW()
    );

    INSERT INTO public.financial_events (
      bookmaker_id, aposta_id, workspace_id,
      tipo_evento, tipo_uso, origem, valor, moeda,
      idempotency_key, descricao, processed_at, created_by
    ) VALUES (
      v_bookmaker_id, v_aposta_id, p_workspace_id,
      CASE WHEN v_fonte_saldo = 'FREEBET' THEN 'FREEBET_STAKE' ELSE 'STAKE' END,
      CASE WHEN v_fonte_saldo = 'FREEBET' THEN 'FREEBET' ELSE 'NORMAL' END,
      'STAKE', -v_stake, v_moeda,
      'stake_' || v_aposta_id || '_idx' || v_idx || '_' || v_perna_id,
      format('Stake Surebet Perna %s (%s)', v_input_ordem, v_bookmaker_nome),
      NOW(), p_user_id
    );

    v_events_count := v_events_count + 1;
  END LOOP;

  PERFORM public.fn_recalc_pai_surebet(v_aposta_id);

  RETURN QUERY SELECT TRUE, v_aposta_id, v_events_count, 'Surebet criada com sucesso'::TEXT;
END;
$function$;


-- 3) liquidar_perna_surebet_v1 idempotente: não cria REVERSAL duplicado
--    para o mesmo evento original; usa chave estável.
CREATE OR REPLACE FUNCTION public.liquidar_perna_surebet_v1(p_perna_id uuid, p_resultado text, p_workspace_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
AS $function$
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
  v_pl_consolidado NUMERIC;
  v_stake_consolidado NUMERIC;
  v_consol_currency TEXT;
  v_events_count INTEGER := 0;
  v_has_entries BOOLEAN := false;
  v_perna_lógica RECORD;
  v_perna_lucro_acumulado NUMERIC := 0;
BEGIN
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

  -- Estornar PAYOUT/VOID anteriores APENAS se ainda não houver REVERSAL
  -- para aquele evento original (evita reversões duplicadas).
  INSERT INTO public.financial_events (
    bookmaker_id, aposta_id, workspace_id, tipo_evento, tipo_uso,
    origem, valor, moeda, idempotency_key, reversed_event_id, descricao, created_by
  )
  SELECT
    fe.bookmaker_id, fe.aposta_id, fe.workspace_id, 'REVERSAL', fe.tipo_uso,
    'liquidation_reset', -fe.valor, fe.moeda,
    'rev_' || fe.id,             -- chave ESTÁVEL por evento original
    fe.id, 'Estorno para re-liquidação (Perna Composta)', auth.uid()
  FROM public.financial_events fe
  WHERE fe.aposta_id = v_surebet_id
    AND fe.tipo_evento IN ('PAYOUT', 'VOID_REFUND', 'FREEBET_PAYOUT')
    AND (
      fe.idempotency_key LIKE '%perna_' || p_perna_id || '%' OR
      fe.idempotency_key LIKE '%payout_perna_' || p_perna_id || '%' OR
      fe.idempotency_key LIKE '%voidrefund_perna_' || p_perna_id || '%'
    )
    AND NOT EXISTS (
      SELECT 1 FROM public.financial_events r
      WHERE r.tipo_evento = 'REVERSAL'
        AND r.reversed_event_id = fe.id
    )
  ON CONFLICT (idempotency_key) DO NOTHING;

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
          v_perna_lucro_acumulado := v_perna_lucro_acumulado + (v_payout - (CASE WHEN v_is_fb THEN 0 ELSE v_entry.stake END));

          INSERT INTO public.financial_events (
            bookmaker_id, aposta_id, workspace_id, tipo_evento, tipo_uso,
            origem, valor, moeda, idempotency_key, descricao, created_by
          ) VALUES (
            v_entry.bookmaker_id, v_surebet_id, p_workspace_id,
            CASE WHEN v_is_fb THEN 'FREEBET_PAYOUT' ELSE 'PAYOUT' END,
            CASE WHEN v_is_fb THEN 'FREEBET' ELSE 'NORMAL' END,
            'LUCRO', v_payout, v_entry.moeda,
            'payout_perna_' || p_perna_id || '_ent_' || v_entry.id,  -- chave ESTÁVEL
            format('Payout %s Perna Composta (%s)', p_resultado, v_entry.bk_nome),
            auth.uid()
          ) ON CONFLICT (idempotency_key) DO NOTHING;
          v_events_count := v_events_count + 1;
        ELSIF p_resultado = 'RED' THEN
          v_perna_lucro_acumulado := v_perna_lucro_acumulado - (CASE WHEN v_is_fb THEN 0 ELSE v_entry.stake END);
        ELSIF p_resultado = 'VOID' THEN
          INSERT INTO public.financial_events (
            bookmaker_id, aposta_id, workspace_id, tipo_evento, tipo_uso,
            origem, valor, moeda, idempotency_key, descricao, created_by
          ) VALUES (
            v_entry.bookmaker_id, v_surebet_id, p_workspace_id, 'VOID_REFUND',
            CASE WHEN v_is_fb THEN 'FREEBET' ELSE 'NORMAL' END,
            'ESTORNO', v_entry.stake, v_entry.moeda,
            'voidrefund_perna_' || p_perna_id || '_ent_' || v_entry.id,
            format('Reembolso VOID Perna Composta (%s)', v_entry.bk_nome),
            auth.uid()
          ) ON CONFLICT (idempotency_key) DO NOTHING;
          v_events_count := v_events_count + 1;
        END IF;
      END LOOP;
    ELSE
      v_is_fb := (v_perna_lógica.fonte_saldo = 'FREEBET');
      IF p_resultado = 'GREEN' THEN
        v_payout := CASE WHEN v_is_fb THEN v_perna_lógica.stake * (v_perna_lógica.odd - 1) ELSE v_perna_lógica.stake * v_perna_lógica.odd END;
        v_perna_lucro_acumulado := v_payout - (CASE WHEN v_is_fb THEN 0 ELSE v_perna_lógica.stake END);

        INSERT INTO public.financial_events (
          bookmaker_id, aposta_id, workspace_id, tipo_evento, tipo_uso,
          origem, valor, moeda, idempotency_key, descricao, created_by
        ) VALUES (
          v_perna_lógica.bookmaker_id, v_surebet_id, p_workspace_id,
          CASE WHEN v_is_fb THEN 'FREEBET_PAYOUT' ELSE 'PAYOUT' END,
          CASE WHEN v_is_fb THEN 'FREEBET' ELSE 'NORMAL' END,
          'LUCRO', v_payout, v_perna_lógica.moeda,
          'payout_perna_' || p_perna_id,
          format('Payout %s Perna Simples', p_resultado),
          auth.uid()
        ) ON CONFLICT (idempotency_key) DO NOTHING;
        v_events_count := v_events_count + 1;
      ELSIF p_resultado = 'RED' THEN
        v_perna_lucro_acumulado := -(CASE WHEN v_is_fb THEN 0 ELSE v_perna_lógica.stake END);
      ELSIF p_resultado = 'VOID' THEN
        INSERT INTO public.financial_events (
          bookmaker_id, aposta_id, workspace_id, tipo_evento, tipo_uso,
          origem, valor, moeda, idempotency_key, descricao, created_by
        ) VALUES (
          v_perna_lógica.bookmaker_id, v_surebet_id, p_workspace_id, 'VOID_REFUND',
          CASE WHEN v_is_fb THEN 'FREEBET' ELSE 'NORMAL' END,
          'ESTORNO', v_perna_lógica.stake, v_perna_lógica.moeda,
          'voidrefund_perna_' || p_perna_id,
          'Reembolso VOID Perna Simples',
          auth.uid()
        ) ON CONFLICT (idempotency_key) DO NOTHING;
        v_events_count := v_events_count + 1;
      END IF;
    END IF;
  END IF;

  UPDATE public.apostas_pernas
  SET lucro_prejuizo = v_perna_lucro_acumulado
  WHERE id = p_perna_id;

  SELECT r.todas_liquidadas, r.lucro_total, r.stake_total, r.resultado_geral, r.is_multicurrency, r.pl_consolidado, r.stake_consolidado, r.consolidation_currency
  INTO v_todas_liquidadas, v_lucro_total, v_stake_total, v_resultado_final, v_is_multicurrency, v_pl_consolidado, v_stake_consolidado, v_consol_currency
  FROM public.fn_recalc_pai_surebet(v_surebet_id) r;

  UPDATE public.apostas_unificada SET
    status = CASE WHEN v_todas_liquidadas THEN 'LIQUIDADA' ELSE 'PENDENTE' END,
    resultado = v_resultado_final,
    stake_total = v_stake_total,
    lucro_prejuizo = v_lucro_total,
    is_multicurrency = v_is_multicurrency,
    pl_consolidado = v_pl_consolidado,
    stake_consolidado = v_stake_consolidado,
    consolidation_currency = v_consol_currency,
    updated_at = NOW()
  WHERE id = v_surebet_id;

  RETURN jsonb_build_object(
    'success', true,
    'perna_id', p_perna_id,
    'resultado', p_resultado,
    'events_created', v_events_count,
    'todas_liquidadas', v_todas_liquidadas,
    'lucro_realizado', v_lucro_total,
    'pl_consolidado', v_pl_consolidado
  );
END;
$function$;


-- 4) View canônica de auditoria do ledger (substitui a antiga enganosa).
DROP VIEW IF EXISTS public.v_bookmaker_saldo_audit;
CREATE VIEW public.v_bookmaker_saldo_audit AS
SELECT
  b.id AS bookmaker_id,
  b.nome,
  b.workspace_id,
  b.moeda,
  b.saldo_atual AS saldo_materializado,
  COALESCE(SUM(CASE
    WHEN fe.tipo_uso = 'NORMAL' AND COALESCE(fe.event_scope::text, 'REAL') = 'REAL'
      THEN fe.valor ELSE 0 END), 0)::numeric AS saldo_calculado_eventos,
  (b.saldo_atual - COALESCE(SUM(CASE
    WHEN fe.tipo_uso = 'NORMAL' AND COALESCE(fe.event_scope::text, 'REAL') = 'REAL'
      THEN fe.valor ELSE 0 END), 0))::numeric AS divergencia
FROM public.bookmakers b
LEFT JOIN public.financial_events fe ON fe.bookmaker_id = b.id
GROUP BY b.id, b.nome, b.workspace_id, b.moeda, b.saldo_atual;


-- 5) RECONCILIAÇÃO: compensar contaminação atual do workspace via eventos
--    auditáveis (sem deletar histórico, sem UPDATE direto em saldo_atual).

-- 5a) Cancelar débitos duplicados de stake feitos pelo trigger quando a
--     RPC criar_surebet_atomica também debitou (caso d810ca80...).
WITH dup AS (
  SELECT fe.id, fe.bookmaker_id, fe.aposta_id, fe.workspace_id, fe.valor,
         fe.moeda, fe.tipo_uso
  FROM public.financial_events fe
  WHERE fe.workspace_id = 'f8b6f7ce-92b9-4d26-899a-0f0eeb1324cd'
    AND fe.tipo_evento IN ('STAKE','FREEBET_STAKE')
    AND fe.idempotency_key LIKE 'stake_perna_%'
    AND EXISTS (
      SELECT 1 FROM public.financial_events sib
      WHERE sib.aposta_id = fe.aposta_id
        AND sib.bookmaker_id = fe.bookmaker_id
        AND sib.tipo_evento IN ('STAKE','FREEBET_STAKE')
        AND sib.idempotency_key LIKE 'stake_%_idx%'
        AND sib.idempotency_key <> fe.idempotency_key
    )
)
INSERT INTO public.financial_events (
  bookmaker_id, aposta_id, workspace_id, tipo_evento, tipo_uso,
  origem, valor, moeda, idempotency_key, reversed_event_id, descricao
)
SELECT
  d.bookmaker_id, d.aposta_id, d.workspace_id, 'REVERSAL', d.tipo_uso,
  'ledger_dedup_stake', -d.valor, d.moeda,
  'dedup_stake_' || d.id, d.id,
  'Estorno automático: stake duplicado (trigger + RPC) — Ledger Hardening v1'
FROM dup d
ON CONFLICT (idempotency_key) DO NOTHING;

-- 5b) Neutralizar reversões duplicadas (mesmo reversed_event_id mais de uma vez).
WITH ranked AS (
  SELECT fe.id, fe.bookmaker_id, fe.aposta_id, fe.workspace_id, fe.valor,
         fe.moeda, fe.tipo_uso, fe.reversed_event_id, fe.created_at,
         row_number() OVER (PARTITION BY fe.reversed_event_id ORDER BY fe.created_at, fe.id) AS rn
  FROM public.financial_events fe
  WHERE fe.workspace_id = 'f8b6f7ce-92b9-4d26-899a-0f0eeb1324cd'
    AND fe.tipo_evento = 'REVERSAL'
    AND fe.reversed_event_id IS NOT NULL
)
INSERT INTO public.financial_events (
  bookmaker_id, aposta_id, workspace_id, tipo_evento, tipo_uso,
  origem, valor, moeda, idempotency_key, reversed_event_id, descricao
)
SELECT
  r.bookmaker_id, r.aposta_id, r.workspace_id, 'AJUSTE', r.tipo_uso,
  'ledger_dedup_reversal', -r.valor, r.moeda,
  'dedup_reversal_' || r.id, r.id,
  'Estorno automático: reversal duplicado — Ledger Hardening v1'
FROM ranked r
WHERE r.rn > 1
ON CONFLICT (idempotency_key) DO NOTHING;
