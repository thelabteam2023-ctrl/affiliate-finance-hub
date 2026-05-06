CREATE OR REPLACE FUNCTION public.get_bookmaker_saldos(p_projeto_id uuid DEFAULT NULL::uuid)
 RETURNS TABLE(id uuid, nome text, parceiro_id uuid, parceiro_nome text, parceiro_primeiro_nome text, moeda text, logo_url text, saldo_real numeric, saldo_freebet numeric, saldo_bonus numeric, saldo_em_aposta numeric, saldo_disponivel numeric, saldo_operavel numeric, bonus_rollover_started boolean, has_pending_transactions boolean, instance_identifier text, has_pending_withdrawals boolean, saldo_saque_pendente numeric)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_workspace_id UUID;
BEGIN
  IF p_projeto_id IS NOT NULL THEN
    SELECT p.workspace_id INTO v_workspace_id
    FROM projetos p
    INNER JOIN workspace_members wm ON wm.workspace_id = p.workspace_id AND wm.user_id = auth.uid()
    WHERE p.id = p_projeto_id
    LIMIT 1;
  END IF;

  IF v_workspace_id IS NULL THEN
    SELECT w.id INTO v_workspace_id
    FROM workspaces w
    INNER JOIN workspace_members wm ON wm.workspace_id = w.id
    WHERE wm.user_id = auth.uid()
    LIMIT 1;
  END IF;

  IF v_workspace_id IS NULL THEN
    RETURN;
  END IF;

  RETURN QUERY
  WITH bookmakers_ativos AS (
    SELECT
      b.id,
      b.nome::TEXT,
      b.parceiro_id,
      p.nome::TEXT AS parceiro_nome,
      SPLIT_PART(p.nome, ' ', 1)::TEXT AS parceiro_primeiro_nome,
      b.moeda::TEXT,
      bc.logo_url::TEXT,
      b.saldo_atual AS saldo_base,
      b.saldo_freebet,
      b.instance_identifier::TEXT
    FROM public.bookmakers b
    LEFT JOIN public.parceiros p ON p.id = b.parceiro_id
    LEFT JOIN public.bookmakers_catalogo bc ON bc.id = b.bookmaker_catalogo_id
    WHERE b.workspace_id = v_workspace_id
      AND b.status NOT IN ('ENCERRADA', 'BLOQUEADA')
      AND (p_projeto_id IS NULL OR b.projeto_id = p_projeto_id)
  ),

  -- Pernas pendentes que possuem entradas (multi-bookmaker)
  pernas_com_entradas AS (
    SELECT DISTINCT ap.id AS perna_id
    FROM public.apostas_pernas ap
    INNER JOIN public.apostas_unificada au ON au.id = ap.aposta_id
    INNER JOIN public.apostas_perna_entradas pe ON pe.perna_id = ap.id
    WHERE au.workspace_id = v_workspace_id
      AND au.status = 'PENDENTE'
      AND au.cancelled_at IS NULL
      AND au.bookmaker_id IS NULL
      AND (p_projeto_id IS NULL OR au.projeto_id = p_projeto_id)
  ),

  todas_apostas_pendentes AS (
    SELECT bookmaker_id, SUM(total_stake) AS total_stake
    FROM (
      -- (1) apostas single-registration
      SELECT
        au.bookmaker_id,
        COALESCE(SUM(COALESCE(au.stake_real, 0)), 0) AS total_stake
      FROM public.apostas_unificada au
      WHERE au.workspace_id = v_workspace_id
        AND au.status = 'PENDENTE'
        AND au.cancelled_at IS NULL
        AND au.bookmaker_id IS NOT NULL
        AND (p_projeto_id IS NULL OR au.projeto_id = p_projeto_id)
      GROUP BY au.bookmaker_id

      UNION ALL

      -- (2) pernas SEM entradas (single-entry por perna) → usa apostas_pernas
      SELECT
        ap.bookmaker_id,
        COALESCE(SUM(COALESCE(ap.stake_real, 0)), 0) AS total_stake
      FROM public.apostas_pernas ap
      INNER JOIN public.apostas_unificada au ON au.id = ap.aposta_id
      WHERE au.workspace_id = v_workspace_id
        AND au.status = 'PENDENTE'
        AND au.cancelled_at IS NULL
        AND au.bookmaker_id IS NULL
        AND ap.bookmaker_id IS NOT NULL
        AND NOT EXISTS (SELECT 1 FROM pernas_com_entradas pce WHERE pce.perna_id = ap.id)
        AND (p_projeto_id IS NULL OR au.projeto_id = p_projeto_id)
      GROUP BY ap.bookmaker_id

      UNION ALL

      -- (3) pernas COM entradas (multi-bookmaker) → usa apostas_perna_entradas
      SELECT
        pe.bookmaker_id,
        COALESCE(SUM(COALESCE(pe.stake_real, 0)), 0) AS total_stake
      FROM public.apostas_perna_entradas pe
      INNER JOIN public.apostas_pernas ap ON ap.id = pe.perna_id
      INNER JOIN public.apostas_unificada au ON au.id = ap.aposta_id
      WHERE au.workspace_id = v_workspace_id
        AND au.status = 'PENDENTE'
        AND au.cancelled_at IS NULL
        AND au.bookmaker_id IS NULL
        AND pe.bookmaker_id IS NOT NULL
        AND (p_projeto_id IS NULL OR au.projeto_id = p_projeto_id)
      GROUP BY pe.bookmaker_id
    ) all_bets
    GROUP BY bookmaker_id
  ),

  apostas_ja_debitadas AS (
    SELECT bookmaker_id, SUM(total_stake) AS total_stake
    FROM (
      -- (1) single-registration
      SELECT
        au.bookmaker_id,
        COALESCE(SUM(COALESCE(au.stake_real, 0)), 0) AS total_stake
      FROM public.apostas_unificada au
      WHERE au.workspace_id = v_workspace_id
        AND au.status = 'PENDENTE'
        AND au.cancelled_at IS NULL
        AND au.bookmaker_id IS NOT NULL
        AND (p_projeto_id IS NULL OR au.projeto_id = p_projeto_id)
        AND EXISTS (
          SELECT 1 FROM public.financial_events fe
          WHERE fe.aposta_id = au.id
            AND fe.tipo_evento = 'STAKE'
            AND fe.bookmaker_id = au.bookmaker_id
        )
      GROUP BY au.bookmaker_id

      UNION ALL

      -- (2) pernas sem entradas
      SELECT
        ap.bookmaker_id,
        COALESCE(SUM(COALESCE(ap.stake_real, 0)), 0) AS total_stake
      FROM public.apostas_pernas ap
      INNER JOIN public.apostas_unificada au ON au.id = ap.aposta_id
      WHERE au.workspace_id = v_workspace_id
        AND au.status = 'PENDENTE'
        AND au.cancelled_at IS NULL
        AND au.bookmaker_id IS NULL
        AND ap.bookmaker_id IS NOT NULL
        AND NOT EXISTS (SELECT 1 FROM pernas_com_entradas pce WHERE pce.perna_id = ap.id)
        AND (p_projeto_id IS NULL OR au.projeto_id = p_projeto_id)
        AND EXISTS (
          SELECT 1 FROM public.financial_events fe
          WHERE fe.aposta_id = au.id
            AND fe.tipo_evento = 'STAKE'
            AND fe.bookmaker_id = ap.bookmaker_id
        )
      GROUP BY ap.bookmaker_id

      UNION ALL

      -- (3) entradas multi-bookmaker
      SELECT
        pe.bookmaker_id,
        COALESCE(SUM(COALESCE(pe.stake_real, 0)), 0) AS total_stake
      FROM public.apostas_perna_entradas pe
      INNER JOIN public.apostas_pernas ap ON ap.id = pe.perna_id
      INNER JOIN public.apostas_unificada au ON au.id = ap.aposta_id
      WHERE au.workspace_id = v_workspace_id
        AND au.status = 'PENDENTE'
        AND au.cancelled_at IS NULL
        AND au.bookmaker_id IS NULL
        AND pe.bookmaker_id IS NOT NULL
        AND (p_projeto_id IS NULL OR au.projeto_id = p_projeto_id)
        AND EXISTS (
          SELECT 1 FROM public.financial_events fe
          WHERE fe.aposta_id = au.id
            AND fe.tipo_evento = 'STAKE'
            AND fe.bookmaker_id = pe.bookmaker_id
        )
      GROUP BY pe.bookmaker_id
    ) debitadas
    GROUP BY bookmaker_id
  ),

  apostas_nao_debitadas AS (
    SELECT
      tap.bookmaker_id,
      GREATEST(tap.total_stake - COALESCE(ajd.total_stake, 0), 0) AS total_stake
    FROM todas_apostas_pendentes tap
    LEFT JOIN apostas_ja_debitadas ajd ON ajd.bookmaker_id = tap.bookmaker_id
  ),

  bonus_creditados AS (
    SELECT
      pblb.bookmaker_id,
      COALESCE(SUM(pblb.saldo_atual), 0) AS total_bonus,
      BOOL_OR(COALESCE(pblb.rollover_progress, 0) > 0) AS has_rollover_started
    FROM public.project_bookmaker_link_bonuses pblb
    WHERE pblb.workspace_id = v_workspace_id
      AND pblb.status = 'credited'
      AND (p_projeto_id IS NULL OR pblb.project_id = p_projeto_id)
    GROUP BY pblb.bookmaker_id
  ),

  depositos_pendentes AS (
    SELECT DISTINCT
      cl.destino_bookmaker_id AS bookmaker_id
    FROM public.cash_ledger cl
    WHERE cl.workspace_id = v_workspace_id
      AND cl.status IN ('PENDENTE', 'pendente')
      AND cl.tipo_transacao IN ('DEPOSITO', 'TRANSFERENCIA')
      AND cl.destino_bookmaker_id IS NOT NULL
  ),

  saques_pendentes AS (
    SELECT
      cl.origem_bookmaker_id AS bookmaker_id,
      COALESCE(SUM(
        CASE 
          WHEN cl.valor_origem IS NOT NULL AND cl.valor_origem > 0 THEN cl.valor_origem
          ELSE cl.valor
        END
      ), 0) AS total_saque_pendente
    FROM public.cash_ledger cl
    WHERE cl.workspace_id = v_workspace_id
      AND cl.status IN ('PENDENTE', 'pendente')
      AND cl.tipo_transacao IN ('SAQUE', 'SAQUE_VIRTUAL')
      AND cl.origem_bookmaker_id IS NOT NULL
    GROUP BY cl.origem_bookmaker_id
  )

  SELECT
    ba.id,
    ba.nome,
    ba.parceiro_id,
    ba.parceiro_nome,
    ba.parceiro_primeiro_nome,
    ba.moeda,
    ba.logo_url,
    ba.saldo_base AS saldo_real,
    COALESCE(ba.saldo_freebet, 0) AS saldo_freebet,
    COALESCE(bc2.total_bonus, 0) AS saldo_bonus,
    COALESCE(tap.total_stake, 0) AS saldo_em_aposta,
    GREATEST(ba.saldo_base - COALESCE(and2.total_stake, 0), 0) AS saldo_disponivel,
    GREATEST(ba.saldo_base + COALESCE(ajd.total_stake, 0), 0)
      + GREATEST(COALESCE(ba.saldo_freebet, 0), 0) AS saldo_operavel,
    COALESCE(bc2.has_rollover_started, false) AS bonus_rollover_started,
    dp.bookmaker_id IS NOT NULL AS has_pending_transactions,
    ba.instance_identifier,
    COALESCE(sp.total_saque_pendente, 0) > 0 AS has_pending_withdrawals,
    COALESCE(sp.total_saque_pendente, 0) AS saldo_saque_pendente
  FROM bookmakers_ativos ba
  LEFT JOIN todas_apostas_pendentes tap ON tap.bookmaker_id = ba.id
  LEFT JOIN apostas_ja_debitadas ajd ON ajd.bookmaker_id = ba.id
  LEFT JOIN apostas_nao_debitadas and2 ON and2.bookmaker_id = ba.id
  LEFT JOIN bonus_creditados bc2 ON bc2.bookmaker_id = ba.id
  LEFT JOIN depositos_pendentes dp ON dp.bookmaker_id = ba.id
  LEFT JOIN saques_pendentes sp ON sp.bookmaker_id = ba.id
  ORDER BY ba.nome ASC;
END;
$function$;