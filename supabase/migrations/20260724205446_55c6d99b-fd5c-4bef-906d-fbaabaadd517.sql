
-- =========================================================
-- PILOTO B v2: Reprocessamento canônico ITALO / ITALO - BROCKER THIAGO
-- Estratégia: rodar fn_recalc_pai_surebet em todos os pais SUREBET/ARBITRAGEM
-- desses projetos e registrar before/after. Somente registra em audit_*
-- as linhas cujo stake_consolidado, pl_consolidado ou lucro_realizado mudaram.
-- =========================================================

CREATE TABLE IF NOT EXISTS public.audit_stake_reprocess_20260724 (
  id uuid PRIMARY KEY,
  projeto_id uuid,
  projeto_nome text,
  evento text,
  consolidation_currency text,
  is_multicurrency_antes boolean,
  is_multicurrency_depois boolean,
  stake_consolidado_antes numeric,
  stake_consolidado_depois numeric,
  retorno_consolidado_antes numeric,
  retorno_consolidado_depois numeric,
  pl_consolidado_antes numeric,
  pl_consolidado_depois numeric,
  lucro_realizado_antes numeric,
  lucro_realizado_depois numeric,
  roi_realizado_antes numeric,
  roi_realizado_depois numeric,
  delta_stake numeric,
  delta_pl numeric,
  status text,
  resultado text,
  executed_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.audit_stake_reprocess_20260724 TO authenticated;
GRANT ALL ON public.audit_stake_reprocess_20260724 TO service_role;
ALTER TABLE public.audit_stake_reprocess_20260724 ENABLE ROW LEVEL SECURITY;
-- Leitura apenas via service_role (bypass RLS). Sem policy para authenticated.

DO $$
DECLARE
  v_id uuid;
  v_ids uuid[];
  v_before RECORD;
  v_after RECORD;
  v_count int := 0;
  v_corrigidos int := 0;
BEGIN
  -- Coleta todos os pais SUREBET/ARBITRAGEM dos projetos ITALO
  SELECT array_agg(a.id) INTO v_ids
  FROM public.apostas_unificada a
  JOIN public.projetos p ON p.id = a.projeto_id
  WHERE a.forma_registro IN ('ARBITRAGEM','SUREBET')
    AND a.cancelled_at IS NULL
    AND (
      upper(p.nome) = 'ITALO'
      OR upper(p.nome) LIKE 'ITALO - BROCKER THIAGO%'
      OR upper(p.nome) LIKE 'ITALO-BROCKER THIAGO%'
    );

  IF v_ids IS NULL THEN
    RAISE NOTICE 'Nenhum candidato encontrado.';
    RETURN;
  END IF;

  RAISE NOTICE 'Candidatos avaliados: %', array_length(v_ids, 1);

  FOREACH v_id IN ARRAY v_ids LOOP
    -- Snapshot ANTES
    SELECT a.projeto_id, p.nome AS projeto_nome, a.evento, a.consolidation_currency,
           a.is_multicurrency, a.stake_consolidado, a.retorno_consolidado,
           a.pl_consolidado, a.lucro_realizado, a.roi_realizado, a.status, a.resultado
    INTO v_before
    FROM public.apostas_unificada a
    JOIN public.projetos p ON p.id = a.projeto_id
    WHERE a.id = v_id;

    -- Recalcula canonicamente
    PERFORM public.fn_recalc_pai_surebet(v_id);

    -- Sincroniza lucro_realizado/roi_realizado se liquidada
    UPDATE public.apostas_unificada a
    SET lucro_realizado = a.pl_consolidado,
        roi_realizado = CASE
          WHEN COALESCE(a.stake_consolidado,0) > 0
            THEN ROUND((a.pl_consolidado / a.stake_consolidado) * 100, 4)
          ELSE 0
        END,
        lucro_realizado_at = COALESCE(a.lucro_realizado_at, now()),
        updated_at = now()
    WHERE a.id = v_id
      AND a.resultado IN ('GREEN','RED','MEIO_GREEN','MEIO_RED','VOID','CASHOUT');

    -- Snapshot DEPOIS
    SELECT is_multicurrency, stake_consolidado, retorno_consolidado,
           pl_consolidado, lucro_realizado, roi_realizado
    INTO v_after
    FROM public.apostas_unificada
    WHERE id = v_id;

    v_count := v_count + 1;

    -- Só registra se algo mudou materialmente
    IF ABS(COALESCE(v_before.stake_consolidado,0) - COALESCE(v_after.stake_consolidado,0)) > 0.01
       OR ABS(COALESCE(v_before.pl_consolidado,0) - COALESCE(v_after.pl_consolidado,0)) > 0.01
       OR ABS(COALESCE(v_before.lucro_realizado,0) - COALESCE(v_after.lucro_realizado,0)) > 0.01
    THEN
      v_corrigidos := v_corrigidos + 1;
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
        v_id, v_before.projeto_id, v_before.projeto_nome, v_before.evento, v_before.consolidation_currency,
        v_before.is_multicurrency, v_after.is_multicurrency,
        v_before.stake_consolidado, v_after.stake_consolidado,
        v_before.retorno_consolidado, v_after.retorno_consolidado,
        v_before.pl_consolidado, v_after.pl_consolidado,
        v_before.lucro_realizado, v_after.lucro_realizado,
        v_before.roi_realizado, v_after.roi_realizado,
        ROUND(COALESCE(v_after.stake_consolidado,0) - COALESCE(v_before.stake_consolidado,0), 4),
        ROUND(COALESCE(v_after.pl_consolidado,0) - COALESCE(v_before.pl_consolidado,0), 4),
        v_before.status, v_before.resultado
      )
      ON CONFLICT (id) DO NOTHING;
    END IF;
  END LOOP;

  RAISE NOTICE 'Piloto B v2 concluído. Avaliados: %, Corrigidos: %', v_count, v_corrigidos;
END $$;
