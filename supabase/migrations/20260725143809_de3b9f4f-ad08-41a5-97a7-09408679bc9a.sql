DO $$
DECLARE
  r RECORD;
  v_before RECORD;
  v_after RECORD;
  v_projeto_nome TEXT;
  v_moeda TEXT;
  v_novo_stake NUMERIC;
  v_novo_retorno NUMERIC;
  v_count INT := 0;
BEGIN
  -- Bypass do guard de arbitragem (mesmo canal das funções internas)
  PERFORM set_config('app.surebet_recalc_context', 'on', true);

  FOR r IN
    WITH sums AS (
      SELECT au.id, au.projeto_id, au.stake_consolidado,
             SUM(ap.stake_brl_referencia) AS soma_brl,
             MAX(ap.cotacao_snapshot) AS max_cot
      FROM public.apostas_unificada au
      JOIN public.apostas_pernas ap ON ap.aposta_id = au.id
      WHERE au.forma_registro='ARBITRAGEM' AND au.status='LIQUIDADA'
        AND au.stake_consolidado IS NOT NULL
        AND au.cancelled_at IS NULL
      GROUP BY au.id
      HAVING COUNT(DISTINCT ap.moeda) > 1
    )
    SELECT id, projeto_id FROM sums
    WHERE max_cot IS NOT NULL AND max_cot > 0
      AND ABS(stake_consolidado - soma_brl / NULLIF(max_cot,0)) > 0.5
  LOOP
    -- Snapshot ANTES
    SELECT stake_consolidado, retorno_consolidado, pl_consolidado,
           lucro_realizado, roi_realizado, consolidation_currency,
           is_multicurrency
      INTO v_before
    FROM public.apostas_unificada WHERE id = r.id;

    SELECT nome INTO v_projeto_nome FROM public.projetos WHERE id = r.projeto_id;

    -- Determinar moeda consolidação
    SELECT COALESCE(moeda_consolidacao,'BRL') INTO v_moeda
    FROM public.projetos WHERE id = r.projeto_id;

    -- Novo stake_consolidado: soma das pernas convertidas via snapshot
    SELECT
      SUM(
        CASE
          WHEN UPPER(COALESCE(ap.moeda,'BRL')) = v_moeda THEN ap.stake
          WHEN v_moeda = 'BRL' AND UPPER(COALESCE(ap.moeda,'BRL')) IN ('USD','USDT','USDC')
               AND ap.cotacao_snapshot > 0 THEN ap.stake * ap.cotacao_snapshot
          WHEN v_moeda = 'USD' AND UPPER(COALESCE(ap.moeda,'BRL')) = 'BRL'
               AND ap.cotacao_snapshot > 0 THEN ap.stake / ap.cotacao_snapshot
          ELSE ap.stake
        END
      ),
      SUM(
        CASE
          WHEN ap.resultado IN ('GREEN','MEIO_GREEN') THEN
            CASE
              WHEN UPPER(COALESCE(ap.moeda,'BRL')) = v_moeda THEN
                CASE ap.resultado WHEN 'GREEN' THEN ap.stake*ap.odd
                                  WHEN 'MEIO_GREEN' THEN ap.stake + ap.stake*(ap.odd-1)/2 END
              WHEN v_moeda = 'BRL' AND UPPER(COALESCE(ap.moeda,'BRL')) IN ('USD','USDT','USDC')
                   AND ap.cotacao_snapshot > 0 THEN
                (CASE ap.resultado WHEN 'GREEN' THEN ap.stake*ap.odd
                                    WHEN 'MEIO_GREEN' THEN ap.stake + ap.stake*(ap.odd-1)/2 END) * ap.cotacao_snapshot
              WHEN v_moeda = 'USD' AND UPPER(COALESCE(ap.moeda,'BRL')) = 'BRL'
                   AND ap.cotacao_snapshot > 0 THEN
                (CASE ap.resultado WHEN 'GREEN' THEN ap.stake*ap.odd
                                    WHEN 'MEIO_GREEN' THEN ap.stake + ap.stake*(ap.odd-1)/2 END) / ap.cotacao_snapshot
              ELSE 0
            END
          ELSE 0
        END
      )
    INTO v_novo_stake, v_novo_retorno
    FROM public.apostas_pernas ap
    WHERE ap.aposta_id = r.id;

    -- Touch para acionar a trigger de consolidação (pl_consolidado, lucro_realizado, roi_realizado)
    UPDATE public.apostas_unificada
    SET stake_consolidado  = ROUND(v_novo_stake, 4),
        retorno_consolidado = ROUND(v_novo_retorno, 4),
        updated_at = now()
    WHERE id = r.id;

    -- Snapshot DEPOIS
    SELECT stake_consolidado, retorno_consolidado, pl_consolidado,
           lucro_realizado, roi_realizado, consolidation_currency,
           is_multicurrency
      INTO v_after
    FROM public.apostas_unificada WHERE id = r.id;

    INSERT INTO public.audit_stake_reprocess_20260724 (
      id, projeto_id, projeto_nome, evento, consolidation_currency,
      is_multicurrency_antes, is_multicurrency_depois,
      stake_consolidado_antes, stake_consolidado_depois,
      retorno_consolidado_antes, retorno_consolidado_depois,
      pl_consolidado_antes, pl_consolidado_depois,
      lucro_realizado_antes, lucro_realizado_depois,
      roi_realizado_antes, roi_realizado_depois,
      delta_stake, delta_pl, status, resultado
    ) VALUES (
      r.id, r.projeto_id, v_projeto_nome, 'FASE_B_BULK', v_after.consolidation_currency,
      v_before.is_multicurrency, v_after.is_multicurrency,
      v_before.stake_consolidado, v_after.stake_consolidado,
      v_before.retorno_consolidado, v_after.retorno_consolidado,
      v_before.pl_consolidado, v_after.pl_consolidado,
      v_before.lucro_realizado, v_after.lucro_realizado,
      v_before.roi_realizado, v_after.roi_realizado,
      COALESCE(v_after.stake_consolidado,0) - COALESCE(v_before.stake_consolidado,0),
      COALESCE(v_after.pl_consolidado,0) - COALESCE(v_before.pl_consolidado,0),
      'OK', NULL
    )
    ON CONFLICT (id) DO UPDATE SET
      projeto_nome = EXCLUDED.projeto_nome,
      evento = EXCLUDED.evento,
      consolidation_currency = EXCLUDED.consolidation_currency,
      is_multicurrency_antes = EXCLUDED.is_multicurrency_antes,
      is_multicurrency_depois = EXCLUDED.is_multicurrency_depois,
      stake_consolidado_antes = EXCLUDED.stake_consolidado_antes,
      stake_consolidado_depois = EXCLUDED.stake_consolidado_depois,
      retorno_consolidado_antes = EXCLUDED.retorno_consolidado_antes,
      retorno_consolidado_depois = EXCLUDED.retorno_consolidado_depois,
      pl_consolidado_antes = EXCLUDED.pl_consolidado_antes,
      pl_consolidado_depois = EXCLUDED.pl_consolidado_depois,
      lucro_realizado_antes = EXCLUDED.lucro_realizado_antes,
      lucro_realizado_depois = EXCLUDED.lucro_realizado_depois,
      roi_realizado_antes = EXCLUDED.roi_realizado_antes,
      roi_realizado_depois = EXCLUDED.roi_realizado_depois,
      delta_stake = EXCLUDED.delta_stake,
      delta_pl = EXCLUDED.delta_pl,
      status = EXCLUDED.status,
      resultado = EXCLUDED.resultado,
      executed_at = now();

    v_count := v_count + 1;
  END LOOP;

  RAISE NOTICE 'Fase B: % operações reprocessadas', v_count;
END $$;