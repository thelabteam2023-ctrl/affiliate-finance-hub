DROP FUNCTION IF EXISTS public.editar_surebet_completa_v1(
  uuid, jsonb, text, text, text, text, text, text, text, numeric, numeric, numeric, numeric, numeric, numeric, text, text
);

CREATE OR REPLACE FUNCTION public.editar_surebet_completa_v1(
  p_aposta_id uuid,
  p_pernas jsonb,
  p_evento text DEFAULT NULL::text,
  p_esporte text DEFAULT NULL::text,
  p_mercado text DEFAULT NULL::text,
  p_modelo text DEFAULT NULL::text,
  p_estrategia text DEFAULT NULL::text,
  p_contexto text DEFAULT NULL::text,
  p_data_aposta text DEFAULT NULL::text,
  p_stake_total numeric DEFAULT NULL::numeric,
  p_stake_consolidado numeric DEFAULT NULL::numeric,
  p_lucro_esperado numeric DEFAULT NULL::numeric,
  p_roi_esperado numeric DEFAULT NULL::numeric,
  p_lucro_prejuizo numeric DEFAULT NULL::numeric,
  p_roi_real numeric DEFAULT NULL::numeric,
  p_status text DEFAULT NULL::text,
  p_resultado text DEFAULT NULL::text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_aposta record;
  v_perna record;
  v_existing_ids uuid[];
  v_input_ids uuid[] := '{}';
  v_to_delete uuid[];
  v_perna_id uuid;
  v_workspace_id uuid;
  v_new_count integer := 0;
  v_edited_count integer := 0;
  v_deleted_count integer := 0;
  v_ordem integer := 0;
  v_elem jsonb;
  v_id_text text;
  v_perna_stake numeric;
  v_perna_stake_real numeric;
  v_perna_stake_freebet numeric;
BEGIN
  PERFORM set_config('app.surebet_recalc_context', 'on', true);

  SELECT *
  INTO v_aposta
  FROM public.apostas_unificada
  WHERE id = p_aposta_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Aposta não encontrada');
  END IF;

  IF COALESCE(v_aposta.forma_registro, '') <> 'ARBITRAGEM' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Esta rotina edita apenas apostas de arbitragem');
  END IF;

  v_workspace_id := v_aposta.workspace_id;

  SELECT COALESCE(array_agg(id), '{}')
  INTO v_existing_ids
  FROM public.apostas_pernas
  WHERE aposta_id = p_aposta_id;

  FOR v_elem IN SELECT * FROM jsonb_array_elements(COALESCE(p_pernas, '[]'::jsonb)) LOOP
    v_id_text := v_elem->>'id';
    IF v_id_text IS NOT NULL AND v_id_text <> '' THEN
      v_input_ids := array_append(v_input_ids, v_id_text::uuid);
    END IF;
  END LOOP;

  SELECT COALESCE(array_agg(existing_id), '{}')
  INTO v_to_delete
  FROM unnest(v_existing_ids) AS existing_id
  WHERE existing_id <> ALL(v_input_ids);

  IF array_length(v_to_delete, 1) > 0 THEN
    FOR v_perna_id IN SELECT unnest(v_to_delete) LOOP
      PERFORM public.deletar_perna_surebet_v1(v_perna_id);
      v_deleted_count := v_deleted_count + 1;
    END LOOP;
  END IF;

  FOR v_elem IN SELECT * FROM jsonb_array_elements(COALESCE(p_pernas, '[]'::jsonb)) LOOP
    v_ordem := v_ordem + 1;
    v_id_text := v_elem->>'id';

    IF v_id_text IS NOT NULL AND v_id_text <> '' THEN
      v_perna_id := v_id_text::uuid;

      SELECT *
      INTO v_perna
      FROM public.apostas_pernas
      WHERE id = v_perna_id;

      IF FOUND THEN
        IF abs(COALESCE(v_perna.stake, 0) - COALESCE((v_elem->>'stake')::numeric, 0)) > 0.00001
          OR abs(COALESCE(v_perna.odd, 0) - COALESCE((v_elem->>'odd')::numeric, 0)) > 0.00001
          OR v_perna.bookmaker_id IS DISTINCT FROM (v_elem->>'bookmaker_id')::uuid
          OR v_perna.selecao IS DISTINCT FROM (v_elem->>'selecao')
          OR COALESCE(v_perna.selecao_livre, '') IS DISTINCT FROM COALESCE(v_elem->>'selecao_livre', '')
        THEN
          PERFORM public.editar_perna_surebet_atomica(
            p_perna_id := v_perna_id,
            p_new_stake := CASE WHEN abs(COALESCE(v_perna.stake, 0) - COALESCE((v_elem->>'stake')::numeric, 0)) > 0.00001 THEN (v_elem->>'stake')::numeric ELSE NULL END,
            p_new_odd := CASE WHEN abs(COALESCE(v_perna.odd, 0) - COALESCE((v_elem->>'odd')::numeric, 0)) > 0.00001 THEN (v_elem->>'odd')::numeric ELSE NULL END,
            p_new_bookmaker_id := CASE WHEN v_perna.bookmaker_id IS DISTINCT FROM (v_elem->>'bookmaker_id')::uuid THEN (v_elem->>'bookmaker_id')::uuid ELSE NULL END,
            p_new_selecao := CASE WHEN v_perna.selecao IS DISTINCT FROM (v_elem->>'selecao') THEN (v_elem->>'selecao') ELSE NULL END,
            p_new_selecao_livre := CASE WHEN COALESCE(v_perna.selecao_livre, '') IS DISTINCT FROM COALESCE(v_elem->>'selecao_livre', '') THEN (v_elem->>'selecao_livre') ELSE NULL END
          );
          v_edited_count := v_edited_count + 1;
        END IF;

        UPDATE public.apostas_pernas
        SET
          ordem = v_ordem,
          fonte_saldo = COALESCE(v_elem->>'fonte_saldo', fonte_saldo),
          cotacao_snapshot = COALESCE((v_elem->>'cotacao_snapshot')::numeric, cotacao_snapshot),
          stake_brl_referencia = COALESCE((v_elem->>'stake_brl_referencia')::numeric, stake_brl_referencia)
        WHERE id = v_perna_id;
      ELSE
        v_perna_id := NULL;
        v_id_text := NULL;
      END IF;
    END IF;

    IF v_id_text IS NULL OR v_id_text = '' THEN
      v_perna_stake := COALESCE((v_elem->>'stake')::numeric, 0);
      IF COALESCE(v_elem->>'fonte_saldo', 'REAL') = 'FREEBET' THEN
        v_perna_stake_real := 0;
        v_perna_stake_freebet := v_perna_stake;
      ELSE
        v_perna_stake_real := v_perna_stake;
        v_perna_stake_freebet := 0;
      END IF;

      INSERT INTO public.apostas_pernas (
        aposta_id, bookmaker_id, stake, stake_real, stake_freebet, odd, moeda, selecao, selecao_livre,
        ordem, fonte_saldo, cotacao_snapshot, stake_brl_referencia
      ) VALUES (
        p_aposta_id,
        (v_elem->>'bookmaker_id')::uuid,
        v_perna_stake,
        v_perna_stake_real,
        v_perna_stake_freebet,
        COALESCE((v_elem->>'odd')::numeric, 0),
        COALESCE(v_elem->>'moeda', 'BRL'),
        v_elem->>'selecao',
        v_elem->>'selecao_livre',
        v_ordem,
        COALESCE(v_elem->>'fonte_saldo', 'REAL'),
        CASE WHEN v_elem ? 'cotacao_snapshot' AND v_elem->>'cotacao_snapshot' IS NOT NULL THEN (v_elem->>'cotacao_snapshot')::numeric ELSE NULL END,
        CASE WHEN v_elem ? 'stake_brl_referencia' AND v_elem->>'stake_brl_referencia' IS NOT NULL THEN (v_elem->>'stake_brl_referencia')::numeric ELSE NULL END
      );

      INSERT INTO public.financial_events (
        bookmaker_id, workspace_id, aposta_id, created_by,
        tipo_evento, tipo_uso, valor, moeda,
        idempotency_key, descricao, metadata
      ) VALUES (
        (v_elem->>'bookmaker_id')::uuid,
        v_workspace_id,
        p_aposta_id,
        v_aposta.user_id,
        CASE WHEN COALESCE(v_elem->>'fonte_saldo', 'REAL') = 'FREEBET' THEN 'FREEBET_STAKE' ELSE 'STAKE' END,
        CASE WHEN COALESCE(v_elem->>'fonte_saldo', 'REAL') = 'FREEBET' THEN 'FREEBET' ELSE 'NORMAL' END,
        -v_perna_stake,
        COALESCE(v_elem->>'moeda', 'BRL'),
        'stake_perna_' || p_aposta_id || '_new_' || v_ordem || '_' || extract(epoch from now()),
        'Stake nova perna (edição)',
        jsonb_build_object('perna_ordem', v_ordem, 'origem', 'editar_surebet_completa_v1')
      );

      v_new_count := v_new_count + 1;
    END IF;
  END LOOP;

  UPDATE public.apostas_unificada
  SET
    evento = COALESCE(p_evento, evento),
    esporte = COALESCE(p_esporte, esporte),
    mercado = COALESCE(p_mercado, mercado),
    modelo = COALESCE(p_modelo, modelo),
    estrategia = COALESCE(p_estrategia, estrategia),
    contexto_operacional = COALESCE(p_contexto, contexto_operacional),
    data_aposta = CASE WHEN p_data_aposta IS NOT NULL THEN p_data_aposta::timestamptz ELSE data_aposta END,
    stake_total = COALESCE(p_stake_total, stake_total),
    stake_real = (SELECT COALESCE(SUM(ap.stake_real), 0) FROM public.apostas_pernas ap WHERE ap.aposta_id = p_aposta_id),
    stake_freebet = (SELECT COALESCE(SUM(ap.stake_freebet), 0) FROM public.apostas_pernas ap WHERE ap.aposta_id = p_aposta_id),
    stake_consolidado = COALESCE(p_stake_consolidado, stake_consolidado),
    lucro_esperado = COALESCE(p_lucro_esperado, lucro_esperado),
    roi_esperado = COALESCE(p_roi_esperado, roi_esperado),
    lucro_prejuizo = COALESCE(p_lucro_prejuizo, lucro_prejuizo),
    roi_real = COALESCE(p_roi_real, roi_real),
    status = COALESCE(p_status, status),
    resultado = COALESCE(p_resultado, resultado),
    updated_at = now()
  WHERE id = p_aposta_id;

  RETURN jsonb_build_object(
    'success', true,
    'edited', v_edited_count,
    'deleted', v_deleted_count,
    'created', v_new_count,
    'pernas', (
      SELECT jsonb_agg(jsonb_build_object(
        'id', p.id,
        'bookmaker_id', p.bookmaker_id,
        'selecao', p.selecao,
        'selecao_livre', p.selecao_livre,
        'odd', p.odd,
        'stake', p.stake,
        'stake_real', p.stake_real,
        'stake_freebet', p.stake_freebet,
        'resultado', p.resultado,
        'lucro_prejuizo', p.lucro_prejuizo,
        'gerou_freebet', p.gerou_freebet,
        'valor_freebet_gerada', p.valor_freebet_gerada
      ) ORDER BY p.ordem)
      FROM public.apostas_pernas p
      WHERE p.aposta_id = p_aposta_id
    )
  );
END;
$function$;