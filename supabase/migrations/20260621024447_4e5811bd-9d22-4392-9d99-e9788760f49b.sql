
-- ============================================================
-- FASE 1: Ledger LAY = liability + comissão correta
-- ============================================================

DROP FUNCTION IF EXISTS public.criar_surebet_atomica(uuid, uuid, uuid, text, text, text, text, text, text, text, jsonb);

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
RETURNS TABLE(success boolean, o_aposta_id uuid, events_created integer, message text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_aposta_id UUID;
  v_perna_json JSONB;
  v_entrada_json JSONB;
  v_idx INTEGER := 0;
  v_ent_idx INTEGER := 0;
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
  v_bookmaker_nome TEXT;
  v_tipo TEXT;
  v_comissao NUMERIC;
  v_debito NUMERIC;
  v_perna_tipo TEXT;
  v_perna_comissao NUMERIC;
BEGIN
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
    v_input_ordem := COALESCE((v_perna_json->>'ordem')::INTEGER, v_idx);
    v_perna_tipo := LOWER(COALESCE(v_perna_json->>'tipo', 'back'));
    v_perna_comissao := COALESCE((v_perna_json->>'comissao')::NUMERIC, 0);

    INSERT INTO public.apostas_pernas (
      aposta_id, ordem, selecao, selecao_livre,
      bookmaker_id, stake, odd, moeda, fonte_saldo,
      stake_real, stake_freebet, tipo, comissao,
      created_at, updated_at
    ) VALUES (
      v_aposta_id, v_input_ordem, v_selecao, v_selecao_livre,
      v_bookmaker_id, v_stake, v_odd, v_moeda, v_fonte_saldo,
      CASE WHEN v_fonte_saldo = 'FREEBET' THEN 0 ELSE v_stake END,
      CASE WHEN v_fonte_saldo = 'FREEBET' THEN v_stake ELSE 0 END,
      v_perna_tipo, v_perna_comissao,
      NOW(), NOW()
    )
    RETURNING id INTO v_perna_id;

    -- Se houver array de entradas, processa cada uma
    IF v_perna_json ? 'entradas' AND jsonb_array_length(v_perna_json->'entradas') > 0 THEN
      v_ent_idx := 0;
      FOR v_entrada_json IN SELECT * FROM jsonb_array_elements(v_perna_json->'entradas') LOOP
        v_ent_idx := v_ent_idx + 1;

        v_bookmaker_id := (v_entrada_json->>'bookmaker_id')::UUID;
        v_stake := (v_entrada_json->>'stake')::NUMERIC;
        v_odd := (v_entrada_json->>'odd')::NUMERIC;
        v_moeda := COALESCE(v_entrada_json->>'moeda', 'BRL');
        v_fonte_saldo := COALESCE(v_entrada_json->>'fonte_saldo', 'REAL');
        v_cotacao_snapshot := (v_entrada_json->>'cotacao_snapshot')::NUMERIC;
        v_tipo := LOWER(COALESCE(v_entrada_json->>'tipo', v_perna_tipo, 'back'));
        v_comissao := COALESCE((v_entrada_json->>'comissao')::NUMERIC, v_perna_comissao, 0);

        SELECT b.nome INTO v_bookmaker_nome FROM public.bookmakers b WHERE b.id = v_bookmaker_id;

        INSERT INTO public.apostas_perna_entradas (
          perna_id, bookmaker_id, stake, odd, moeda,
          stake_real, stake_freebet, cotacao_snapshot, fonte_saldo,
          tipo, comissao, created_at, updated_at
        ) VALUES (
          v_perna_id, v_bookmaker_id, v_stake, v_odd, v_moeda,
          CASE WHEN v_fonte_saldo = 'FREEBET' THEN 0 ELSE v_stake END,
          CASE WHEN v_fonte_saldo = 'FREEBET' THEN v_stake ELSE 0 END,
          v_cotacao_snapshot, v_fonte_saldo,
          v_tipo, v_comissao, NOW(), NOW()
        );

        -- LAY: debita liability (stake * (odd-1)); BACK: debita stake
        v_debito := CASE
          WHEN v_tipo = 'lay' THEN v_stake * GREATEST(v_odd - 1, 0)
          ELSE v_stake
        END;

        INSERT INTO public.financial_events (
          bookmaker_id, aposta_id, workspace_id,
          tipo_evento, tipo_uso, origem, valor, moeda,
          idempotency_key, descricao, processed_at, created_by, metadata
        ) VALUES (
          v_bookmaker_id, v_aposta_id, p_workspace_id,
          CASE WHEN v_fonte_saldo = 'FREEBET' THEN 'FREEBET_STAKE' ELSE 'STAKE' END,
          CASE WHEN v_fonte_saldo = 'FREEBET' THEN 'FREEBET' ELSE 'NORMAL' END,
          'STAKE', -v_debito, v_moeda,
          'stake_' || v_aposta_id || '_p' || v_idx || '_e' || v_ent_idx
            || CASE WHEN v_tipo = 'lay' THEN '_lay' ELSE '' END,
          format('Stake Surebet Perna %s - Entrada %s (%s) [%s]', v_input_ordem, v_ent_idx, v_bookmaker_nome, UPPER(v_tipo)),
          NOW(), p_user_id,
          jsonb_build_object('tipo', v_tipo, 'comissao', v_comissao, 'stake', v_stake, 'odd', v_odd, 'liability', v_stake * GREATEST(v_odd - 1, 0))
        );
        v_events_count := v_events_count + 1;
      END LOOP;
    ELSE
      -- Fallback para comportamento legado (1 perna = 1 entrada)
      SELECT b.nome INTO v_bookmaker_nome FROM public.bookmakers b WHERE b.id = v_bookmaker_id;

      INSERT INTO public.apostas_perna_entradas (
        perna_id, bookmaker_id, stake, odd, moeda,
        stake_real, stake_freebet, fonte_saldo,
        tipo, comissao, created_at, updated_at
      ) VALUES (
        v_perna_id, v_bookmaker_id, v_stake, v_odd, v_moeda,
        CASE WHEN v_fonte_saldo = 'FREEBET' THEN 0 ELSE v_stake END,
        CASE WHEN v_fonte_saldo = 'FREEBET' THEN v_stake ELSE 0 END,
        v_fonte_saldo, v_perna_tipo, v_perna_comissao, NOW(), NOW()
      );

      v_debito := CASE
        WHEN v_perna_tipo = 'lay' THEN v_stake * GREATEST(v_odd - 1, 0)
        ELSE v_stake
      END;

      INSERT INTO public.financial_events (
        bookmaker_id, aposta_id, workspace_id,
        tipo_evento, tipo_uso, origem, valor, moeda,
        idempotency_key, descricao, processed_at, created_by, metadata
      ) VALUES (
        v_bookmaker_id, v_aposta_id, p_workspace_id,
        CASE WHEN v_fonte_saldo = 'FREEBET' THEN 'FREEBET_STAKE' ELSE 'STAKE' END,
        CASE WHEN v_fonte_saldo = 'FREEBET' THEN 'FREEBET' ELSE 'NORMAL' END,
        'STAKE', -v_debito, v_moeda,
        'stake_' || v_aposta_id || '_p' || v_idx || '_legacy'
          || CASE WHEN v_perna_tipo = 'lay' THEN '_lay' ELSE '' END,
        format('Stake Surebet Perna %s (%s) [%s]', v_input_ordem, v_bookmaker_nome, UPPER(v_perna_tipo)),
        NOW(), p_user_id,
        jsonb_build_object('tipo', v_perna_tipo, 'comissao', v_perna_comissao, 'stake', v_stake, 'odd', v_odd, 'liability', v_stake * GREATEST(v_odd - 1, 0))
      );
      v_events_count := v_events_count + 1;
    END IF;
  END LOOP;

  PERFORM public.fn_recalc_pai_surebet(v_aposta_id);

  RETURN QUERY SELECT TRUE, v_aposta_id, v_events_count, 'Surebet criada com sucesso'::TEXT;
END;
$function$;


-- ============================================================
-- fn_recalc_pai_surebet — LAY aware
-- ============================================================

DROP FUNCTION IF EXISTS public.fn_recalc_pai_surebet(uuid);

CREATE OR REPLACE FUNCTION public.fn_recalc_pai_surebet(p_surebet_id uuid)
RETURNS TABLE(todas_liquidadas boolean, lucro_total numeric, stake_total numeric, resultado_geral text, is_multicurrency boolean, pl_consolidado numeric, stake_consolidado numeric, consolidation_currency text)
LANGUAGE plpgsql
AS $function$
DECLARE
  v_moeda_consolidacao TEXT;
  v_entry RECORD;
  v_rate NUMERIC;
  v_todas_liquidadas BOOLEAN := true;
  v_lucro_total_calc NUMERIC := 0;
  v_stake_total_calc NUMERIC := 0;
  v_is_multicurrency_calc BOOLEAN := false;
  v_rates JSONB;
  v_brl_rate_from NUMERIC;
  v_brl_rate_to NUMERIC;
  v_res_geral TEXT;
  v_is_override BOOLEAN;
  v_current_lucro NUMERIC;
  v_current_res TEXT;
  v_projeto_id UUID;
BEGIN
  PERFORM set_config('app.surebet_recalc_context', 'on', true);

  SELECT is_manual_override, lucro_prejuizo, resultado, projeto_id
  INTO v_is_override, v_current_lucro, v_current_res, v_projeto_id
  FROM public.apostas_unificada
  WHERE id = p_surebet_id;

  SELECT
    proj.moeda_consolidacao,
    jsonb_build_object(
      'USD', COALESCE(proj.cotacao_trabalho, 1),
      'EUR', COALESCE(proj.cotacao_trabalho_eur, 1),
      'GBP', COALESCE(proj.cotacao_trabalho_gbp, 1),
      'MYR', COALESCE(proj.cotacao_trabalho_myr, 1),
      'MXN', COALESCE(proj.cotacao_trabalho_mxn, 1),
      'ARS', COALESCE(proj.cotacao_trabalho_ars, 1),
      'COP', COALESCE(proj.cotacao_trabalho_cop, 1),
      'BRL', 1
    )
  INTO v_moeda_consolidacao, v_rates
  FROM public.projetos proj
  WHERE proj.id = v_projeto_id;

  v_moeda_consolidacao := COALESCE(v_moeda_consolidacao, 'BRL');

  SELECT COALESCE(bool_and(ap.resultado IS NOT NULL AND ap.resultado != 'PENDENTE'), false)
  INTO v_todas_liquidadas
  FROM public.apostas_pernas ap
  WHERE ap.aposta_id = p_surebet_id;

  FOR v_entry IN
    SELECT ae.moeda, ae.stake, ae.odd, ap.resultado, ae.fonte_saldo,
           LOWER(COALESCE(ae.tipo, ap.tipo, 'back')) AS tipo,
           COALESCE(ae.comissao, ap.comissao, 0) AS comissao
    FROM public.apostas_perna_entradas ae
    JOIN public.apostas_pernas ap ON ap.id = ae.perna_id
    WHERE ap.aposta_id = p_surebet_id
  LOOP
    IF v_entry.moeda != v_moeda_consolidacao THEN
      v_is_multicurrency_calc := true;
    END IF;

    v_brl_rate_from := COALESCE((v_rates->>UPPER(v_entry.moeda))::NUMERIC, 1);
    v_brl_rate_to := COALESCE((v_rates->>UPPER(v_moeda_consolidacao))::NUMERIC, 1);

    v_rate := CASE
      WHEN v_entry.moeda = v_moeda_consolidacao THEN 1
      WHEN v_brl_rate_to > 0 THEN v_brl_rate_from / v_brl_rate_to
      ELSE 1
    END;

    DECLARE
      v_entry_lucro NUMERIC := 0;
      v_entry_risco NUMERIC := 0;
      v_is_fb BOOLEAN := (v_entry.fonte_saldo = 'FREEBET');
      v_is_lay BOOLEAN := (v_entry.tipo = 'lay');
      v_liability NUMERIC := v_entry.stake * GREATEST(v_entry.odd - 1, 0);
    BEGIN
      IF v_is_lay THEN
        -- LAY: risco = liability, ganho líquido = stake*(1-comissao)
        v_entry_risco := v_liability;
        CASE v_entry.resultado
          WHEN 'GREEN'      THEN v_entry_lucro :=  v_entry.stake * (1 - v_entry.comissao);
          WHEN 'MEIO_GREEN' THEN v_entry_lucro := (v_entry.stake / 2) * (1 - v_entry.comissao);
          WHEN 'MEIO_RED'   THEN v_entry_lucro := -(v_liability / 2);
          WHEN 'RED'        THEN v_entry_lucro := -v_liability;
          WHEN 'VOID'       THEN v_entry_lucro := 0;
          ELSE                    v_entry_lucro := 0;
        END CASE;
      ELSE
        -- BACK (comportamento original)
        v_entry_risco := CASE WHEN v_is_fb THEN 0 ELSE v_entry.stake END;
        CASE v_entry.resultado
          WHEN 'GREEN' THEN
            v_entry_lucro := CASE WHEN v_is_fb THEN v_entry.stake * (v_entry.odd - 1) ELSE (v_entry.stake * v_entry.odd) - v_entry.stake END;
          WHEN 'RED' THEN
            v_entry_lucro := CASE WHEN v_is_fb THEN 0 ELSE -v_entry.stake END;
          WHEN 'VOID' THEN
            v_entry_lucro := 0;
          WHEN 'MEIO_GREEN' THEN
            v_entry_lucro := CASE WHEN v_is_fb THEN (v_entry.stake * (v_entry.odd - 1)) / 2 ELSE (v_entry.stake + (v_entry.stake * (v_entry.odd - 1) / 2)) - v_entry.stake END;
          WHEN 'MEIO_RED' THEN
            v_entry_lucro := CASE WHEN v_is_fb THEN 0 ELSE -(v_entry.stake / 2) END;
          ELSE
            v_entry_lucro := 0;
        END CASE;
      END IF;

      v_lucro_total_calc := v_lucro_total_calc + v_entry_lucro * v_rate;
      v_stake_total_calc := v_stake_total_calc + v_entry_risco * v_rate;
    END;
  END LOOP;

  v_lucro_total_calc := ROUND(v_lucro_total_calc, 4);
  v_stake_total_calc := ROUND(v_stake_total_calc, 4);

  IF v_is_override = true THEN
    v_lucro_total_calc := v_current_lucro;
    v_res_geral := v_current_res;
  ELSE
    v_res_geral := CASE
      WHEN v_todas_liquidadas AND v_lucro_total_calc > 0.001 THEN 'GREEN'
      WHEN v_todas_liquidadas AND v_lucro_total_calc < -0.001 THEN 'RED'
      WHEN v_todas_liquidadas THEN 'VOID'
      ELSE 'PENDENTE'
    END;
  END IF;

  RETURN QUERY SELECT
    v_todas_liquidadas,
    v_lucro_total_calc,
    v_stake_total_calc,
    v_res_geral,
    v_is_multicurrency_calc,
    v_lucro_total_calc,
    v_stake_total_calc,
    v_moeda_consolidacao;
END;
$function$;
