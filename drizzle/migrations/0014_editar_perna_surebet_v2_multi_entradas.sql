-- Edição de perna de surebet PENDENTE consciente de múltiplas entradas e com
-- validação de saldo por efeito líquido (novo comprometimento - comprometimento atual).
-- Não altera nenhum lançamento histórico; apenas muda a rotina de edição.

CREATE OR REPLACE FUNCTION public.editar_perna_surebet_v2(
  p_perna_id uuid,
  p_stake numeric,
  p_odd numeric,
  p_bookmaker_id uuid,
  p_selecao text,
  p_selecao_livre text,
  p_fonte_saldo text DEFAULT NULL,
  p_entradas jsonb DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_perna RECORD;
  v_ws uuid;
  v_user uuid;
  v_novas jsonb;
  v_n_entradas int;
  v_d RECORD;
  v_bk RECORD;
  v_saldo numeric;
  v_tipo_evento text;
  v_stake_total numeric := 0;
  v_stake_real numeric := 0;
  v_stake_freebet numeric := 0;
  v_ref_total numeric := 0;
  v_odd_final numeric;
  v_first jsonb;
  v_e jsonb;
BEGIN
  PERFORM set_config('app.skip_perna_auto_stake', 'on', true);
  PERFORM set_config('app.surebet_recalc_context', 'on', true);

  SELECT ap.*, au.workspace_id AS ws, au.user_id AS uid
  INTO v_perna
  FROM public.apostas_pernas ap
  JOIN public.apostas_unificada au ON au.id = ap.aposta_id
  WHERE ap.id = p_perna_id
  FOR UPDATE OF ap;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Perna não encontrada');
  END IF;

  v_ws := v_perna.ws;
  v_user := v_perna.uid;

  -- Pernas já liquidadas continuam no fluxo legado (reversões de payout).
  IF v_perna.resultado IS NOT NULL AND v_perna.resultado <> 'PENDENTE' THEN
    RETURN public.editar_perna_surebet_atomica(
      p_perna_id, p_stake, p_odd, p_bookmaker_id, p_selecao, p_selecao_livre
    );
  END IF;

  -- Normaliza estado atual: garante ao menos uma entrada espelhando a perna.
  IF NOT EXISTS (SELECT 1 FROM public.apostas_perna_entradas WHERE perna_id = p_perna_id) THEN
    INSERT INTO public.apostas_perna_entradas (
      perna_id, bookmaker_id, odd, stake, moeda, fonte_saldo,
      stake_real, stake_freebet, cotacao_snapshot, stake_brl_referencia, tipo, comissao
    ) VALUES (
      p_perna_id, v_perna.bookmaker_id, v_perna.odd, v_perna.stake, v_perna.moeda,
      COALESCE(v_perna.fonte_saldo, 'REAL'),
      CASE WHEN COALESCE(v_perna.fonte_saldo,'REAL') = 'FREEBET' THEN 0 ELSE v_perna.stake END,
      CASE WHEN COALESCE(v_perna.fonte_saldo,'REAL') = 'FREEBET' THEN v_perna.stake ELSE 0 END,
      v_perna.cotacao_snapshot, v_perna.stake_brl_referencia, v_perna.tipo, v_perna.comissao
    );
  END IF;

  -- Entradas alvo (payload) ou entrada única derivada dos parâmetros simples.
  v_novas := COALESCE(
    NULLIF(p_entradas, 'null'::jsonb),
    jsonb_build_array(jsonb_build_object(
      'bookmaker_id', p_bookmaker_id,
      'odd', p_odd,
      'stake', p_stake,
      'moeda', v_perna.moeda,
      'fonte_saldo', COALESCE(p_fonte_saldo, v_perna.fonte_saldo, 'REAL'),
      'cotacao_snapshot', v_perna.cotacao_snapshot,
      'stake_brl_referencia', v_perna.stake_brl_referencia,
      'selecao_livre', p_selecao_livre
    ))
  );

  SELECT count(*) INTO v_n_entradas FROM jsonb_array_elements(v_novas);
  IF v_n_entradas = 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Perna sem entradas válidas');
  END IF;

  -- Deltas por (casa, tipo de saldo): créditos primeiro, débitos depois.
  CREATE TEMP TABLE IF NOT EXISTS _edit_perna_deltas (
    bookmaker_id uuid, tipo_uso text, moeda text, delta numeric
  ) ON COMMIT DROP;
  DELETE FROM _edit_perna_deltas;

  INSERT INTO _edit_perna_deltas (bookmaker_id, tipo_uso, moeda, delta)
  WITH old_c AS (
    SELECT bookmaker_id,
           CASE WHEN COALESCE(fonte_saldo,'REAL') = 'FREEBET' THEN 'FREEBET' ELSE 'NORMAL' END AS tipo_uso,
           max(moeda) AS moeda,
           sum(stake) AS v
    FROM public.apostas_perna_entradas
    WHERE perna_id = p_perna_id
    GROUP BY 1, 2
  ),
  new_c AS (
    SELECT (e->>'bookmaker_id')::uuid AS bookmaker_id,
           CASE WHEN COALESCE(e->>'fonte_saldo','REAL') = 'FREEBET' THEN 'FREEBET' ELSE 'NORMAL' END AS tipo_uso,
           max(COALESCE(e->>'moeda', v_perna.moeda)) AS moeda,
           sum(COALESCE((e->>'stake')::numeric, 0)) AS v
    FROM jsonb_array_elements(v_novas) e
    GROUP BY 1, 2
  )
  SELECT COALESCE(n.bookmaker_id, o.bookmaker_id),
         COALESCE(n.tipo_uso, o.tipo_uso),
         COALESCE(n.moeda, o.moeda),
         COALESCE(n.v, 0) - COALESCE(o.v, 0)
  FROM new_c n
  FULL OUTER JOIN old_c o
    ON o.bookmaker_id = n.bookmaker_id AND o.tipo_uso = n.tipo_uso;

  -- 1) Créditos (redução de exposição) antes de qualquer novo débito.
  FOR v_d IN
    SELECT * FROM _edit_perna_deltas WHERE delta < -0.000001 ORDER BY delta ASC
  LOOP
    INSERT INTO public.financial_events (
      bookmaker_id, aposta_id, workspace_id, created_by, tipo_evento, tipo_uso,
      origem, valor, moeda, idempotency_key, descricao, processed_at
    ) VALUES (
      v_d.bookmaker_id, v_perna.aposta_id, v_ws, v_user, 'REVERSAL', v_d.tipo_uso,
      'REVERSAL', -v_d.delta, v_d.moeda,
      'edit_perna_' || p_perna_id || '_cred_' || gen_random_uuid(),
      format('Edição de perna: devolução de exposição %s', -v_d.delta), now()
    );
  END LOOP;

  -- 2) Débitos (aumento de exposição) validados pelo efeito líquido.
  FOR v_d IN
    SELECT * FROM _edit_perna_deltas WHERE delta > 0.000001 ORDER BY delta DESC
  LOOP
    SELECT id, nome, saldo_atual, saldo_freebet INTO v_bk
    FROM public.bookmakers WHERE id = v_d.bookmaker_id FOR UPDATE;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Casa de aposta não encontrada para a perna editada';
    END IF;

    IF v_d.tipo_uso = 'FREEBET' THEN
      v_saldo := COALESCE(v_bk.saldo_freebet, 0);
      IF v_saldo + 0.01 < v_d.delta THEN
        RAISE EXCEPTION 'SALDO_INSUFICIENTE: % — freebet disponível: % %, necessário: % %',
          v_bk.nome, round(v_saldo, 2), v_d.moeda, round(v_d.delta, 2), v_d.moeda;
      END IF;
      v_tipo_evento := 'FREEBET_STAKE';
    ELSE
      v_saldo := COALESCE(v_bk.saldo_atual, 0);
      IF v_saldo + 0.01 < v_d.delta THEN
        RAISE EXCEPTION 'SALDO_INSUFICIENTE: % — saldo real disponível: % %, necessário: % %',
          v_bk.nome, round(v_saldo, 2), v_d.moeda, round(v_d.delta, 2), v_d.moeda;
      END IF;
      v_tipo_evento := 'STAKE';
    END IF;

    INSERT INTO public.financial_events (
      bookmaker_id, aposta_id, workspace_id, created_by, tipo_evento, tipo_uso,
      origem, valor, moeda, idempotency_key, descricao, processed_at
    ) VALUES (
      v_d.bookmaker_id, v_perna.aposta_id, v_ws, v_user, v_tipo_evento, v_d.tipo_uso,
      'APOSTA', -v_d.delta, v_d.moeda,
      'edit_perna_' || p_perna_id || '_deb_' || gen_random_uuid(),
      format('Edição de perna: acréscimo de exposição %s', v_d.delta), now()
    );
  END LOOP;

  -- 3) Sincroniza as entradas da perna preservando identidades informadas.
  DELETE FROM public.apostas_perna_entradas WHERE perna_id = p_perna_id;

  FOR v_e IN SELECT * FROM jsonb_array_elements(v_novas) LOOP
    INSERT INTO public.apostas_perna_entradas (
      id, perna_id, bookmaker_id, odd, stake, moeda, fonte_saldo,
      stake_real, stake_freebet, cotacao_snapshot, stake_brl_referencia, tipo, comissao
    ) VALUES (
      COALESCE(NULLIF(v_e->>'id','')::uuid, gen_random_uuid()),
      p_perna_id,
      (v_e->>'bookmaker_id')::uuid,
      COALESCE((v_e->>'odd')::numeric, p_odd),
      COALESCE((v_e->>'stake')::numeric, 0),
      COALESCE(v_e->>'moeda', v_perna.moeda),
      COALESCE(v_e->>'fonte_saldo', 'REAL'),
      CASE WHEN COALESCE(v_e->>'fonte_saldo','REAL') = 'FREEBET' THEN 0 ELSE COALESCE((v_e->>'stake')::numeric, 0) END,
      CASE WHEN COALESCE(v_e->>'fonte_saldo','REAL') = 'FREEBET' THEN COALESCE((v_e->>'stake')::numeric, 0) ELSE 0 END,
      COALESCE((v_e->>'cotacao_snapshot')::numeric, v_perna.cotacao_snapshot),
      (v_e->>'stake_brl_referencia')::numeric,
      COALESCE(v_e->>'tipo', v_perna.tipo),
      COALESCE((v_e->>'comissao')::numeric, v_perna.comissao)
    );
  END LOOP;

  -- 4) Atualiza a perna com os totais consolidados das entradas.
  SELECT COALESCE(sum(stake), 0), COALESCE(sum(stake_real), 0), COALESCE(sum(stake_freebet), 0),
         COALESCE(sum(stake_brl_referencia), 0),
         CASE WHEN COALESCE(sum(stake), 0) > 0
              THEN sum(odd * stake) / sum(stake) ELSE max(odd) END
  INTO v_stake_total, v_stake_real, v_stake_freebet, v_ref_total, v_odd_final
  FROM public.apostas_perna_entradas WHERE perna_id = p_perna_id;

  v_first := v_novas->0;

  UPDATE public.apostas_pernas SET
    bookmaker_id = (v_first->>'bookmaker_id')::uuid,
    odd = COALESCE(v_odd_final, p_odd),
    stake = v_stake_total,
    stake_real = v_stake_real,
    stake_freebet = v_stake_freebet,
    moeda = COALESCE(v_first->>'moeda', v_perna.moeda),
    fonte_saldo = CASE WHEN v_stake_freebet > 0 AND v_stake_real = 0 THEN 'FREEBET' ELSE 'REAL' END,
    selecao = COALESCE(p_selecao, selecao),
    selecao_livre = p_selecao_livre,
    cotacao_snapshot = COALESCE((v_first->>'cotacao_snapshot')::numeric, cotacao_snapshot),
    stake_brl_referencia = NULLIF(v_ref_total, 0),
    updated_at = now()
  WHERE id = p_perna_id;

  RETURN jsonb_build_object(
    'success', true,
    'perna_id', p_perna_id,
    'stake_total', v_stake_total,
    'entradas', v_n_entradas
  );
END;
$function$;

GRANT EXECUTE ON FUNCTION public.editar_perna_surebet_v2(uuid, numeric, numeric, uuid, text, text, text, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.editar_perna_surebet_v2(uuid, numeric, numeric, uuid, text, text, text, jsonb) TO service_role;