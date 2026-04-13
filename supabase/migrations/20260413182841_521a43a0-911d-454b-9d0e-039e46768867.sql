
CREATE OR REPLACE FUNCTION public.get_bookmaker_saldos(p_projeto_id UUID DEFAULT NULL)
RETURNS TABLE(
  id UUID,
  nome TEXT,
  parceiro_id UUID,
  parceiro_nome TEXT,
  parceiro_primeiro_nome TEXT,
  moeda TEXT,
  logo_url TEXT,
  saldo_real NUMERIC,
  saldo_freebet NUMERIC,
  saldo_bonus NUMERIC,
  saldo_em_aposta NUMERIC,
  saldo_disponivel NUMERIC,
  saldo_operavel NUMERIC,
  bonus_rollover_started BOOLEAN,
  has_pending_transactions BOOLEAN,
  instance_identifier TEXT,
  has_pending_withdrawals BOOLEAN,
  saldo_saque_pendente NUMERIC
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
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
  -- Stakes NÃO debitadas (para cálculo de saldo_disponivel)
  apostas_pendentes_nao_debitadas AS (
    SELECT
      au.bookmaker_id,
      COALESCE(SUM(au.stake_real), 0) AS total_stake
    FROM public.apostas_unificada au
    WHERE au.workspace_id = v_workspace_id
      AND au.status = 'PENDENTE'
      AND au.cancelled_at IS NULL
      AND au.bookmaker_id IS NOT NULL
      AND (p_projeto_id IS NULL OR au.projeto_id = p_projeto_id)
      AND NOT EXISTS (
        SELECT 1 FROM public.financial_events fe
        WHERE fe.aposta_id = au.id
          AND fe.tipo_evento = 'STAKE'
          AND fe.bookmaker_id = au.bookmaker_id
      )
    GROUP BY au.bookmaker_id
  ),
  pernas_pendentes_nao_debitadas AS (
    SELECT
      ap.bookmaker_id,
      COALESCE(SUM(ap.stake_real), 0) AS total_stake
    FROM public.apostas_pernas ap
    INNER JOIN public.apostas_unificada au ON au.id = ap.aposta_id
    WHERE au.workspace_id = v_workspace_id
      AND au.status = 'PENDENTE'
      AND au.cancelled_at IS NULL
      AND (p_projeto_id IS NULL OR au.projeto_id = p_projeto_id)
      AND NOT EXISTS (
        SELECT 1 FROM public.financial_events fe
        WHERE fe.aposta_id = au.id
          AND fe.tipo_evento = 'STAKE'
          AND fe.bookmaker_id = ap.bookmaker_id
      )
    GROUP BY ap.bookmaker_id
  ),
  combined_nao_debitadas AS (
    SELECT
      COALESCE(ap.bookmaker_id, pp.bookmaker_id) AS bookmaker_id,
      COALESCE(ap.total_stake, 0) + COALESCE(pp.total_stake, 0) AS total_stake
    FROM apostas_pendentes_nao_debitadas ap
    FULL OUTER JOIN pernas_pendentes_nao_debitadas pp ON pp.bookmaker_id = ap.bookmaker_id
  ),
  -- TODAS as apostas pendentes (para saldo_em_aposta INFORMATIVO - inclui já debitadas)
  todas_apostas_pendentes AS (
    SELECT
      au.bookmaker_id,
      COALESCE(SUM(au.stake_real), 0) AS total_stake_real
    FROM public.apostas_unificada au
    WHERE au.workspace_id = v_workspace_id
      AND au.status = 'PENDENTE'
      AND au.cancelled_at IS NULL
      AND au.bookmaker_id IS NOT NULL
    GROUP BY au.bookmaker_id
  ),
  todas_pernas_pendentes AS (
    SELECT
      ap.bookmaker_id,
      COALESCE(SUM(ap.stake_real), 0) AS total_stake_real
    FROM public.apostas_pernas ap
    INNER JOIN public.apostas_unificada au ON au.id = ap.aposta_id
    WHERE au.workspace_id = v_workspace_id
      AND au.status = 'PENDENTE'
      AND au.cancelled_at IS NULL
    GROUP BY ap.bookmaker_id
  ),
  combined_todas AS (
    SELECT
      COALESCE(tap.bookmaker_id, tpp.bookmaker_id) AS bookmaker_id,
      COALESCE(tap.total_stake_real, 0) + COALESCE(tpp.total_stake_real, 0) AS total_stake_real
    FROM todas_apostas_pendentes tap
    FULL OUTER JOIN todas_pernas_pendentes tpp ON tpp.bookmaker_id = tap.bookmaker_id
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
    -- saldo_em_aposta: TODAS as apostas pendentes (informativo para UI)
    COALESCE(ct.total_stake_real, 0) AS saldo_em_aposta,
    -- saldo_disponivel: saldo real - stakes NÃO debitadas - saques pendentes
    GREATEST(ba.saldo_base - COALESCE(cnd.total_stake, 0) - COALESCE(sp.total_saque_pendente, 0), 0) AS saldo_disponivel,
    -- saldo_operavel: saldo disponível + freebet + bonus
    GREATEST(ba.saldo_base - COALESCE(cnd.total_stake, 0) - COALESCE(sp.total_saque_pendente, 0), 0) + COALESCE(ba.saldo_freebet, 0) + COALESCE(bc2.total_bonus, 0) AS saldo_operavel,
    COALESCE(bc2.has_rollover_started, false) AS bonus_rollover_started,
    dp.bookmaker_id IS NOT NULL AS has_pending_transactions,
    ba.instance_identifier,
    COALESCE(sp.total_saque_pendente, 0) > 0 AS has_pending_withdrawals,
    COALESCE(sp.total_saque_pendente, 0) AS saldo_saque_pendente
  FROM bookmakers_ativos ba
  LEFT JOIN combined_nao_debitadas cnd ON cnd.bookmaker_id = ba.id
  LEFT JOIN combined_todas ct ON ct.bookmaker_id = ba.id
  LEFT JOIN bonus_creditados bc2 ON bc2.bookmaker_id = ba.id
  LEFT JOIN depositos_pendentes dp ON dp.bookmaker_id = ba.id
  LEFT JOIN saques_pendentes sp ON sp.bookmaker_id = ba.id
  ORDER BY ba.nome ASC;
END;
$$;
