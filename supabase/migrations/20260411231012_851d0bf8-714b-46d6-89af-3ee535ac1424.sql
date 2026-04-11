
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
  -- Obter workspace do usuário
  SELECT w.id INTO v_workspace_id
  FROM workspaces w
  INNER JOIN workspace_members wm ON wm.workspace_id = w.id
  WHERE wm.user_id = auth.uid()
  LIMIT 1;

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
  apostas_pendentes AS (
    SELECT
      au.bookmaker_id,
      COALESCE(SUM(au.stake_real), 0) AS total_stake
    FROM public.apostas_unificada au
    WHERE au.workspace_id = v_workspace_id
      AND au.status = 'PENDENTE'
      AND au.cancelled_at IS NULL
      AND au.bookmaker_id IS NOT NULL
      AND (p_projeto_id IS NULL OR au.projeto_id = p_projeto_id)
    GROUP BY au.bookmaker_id
  ),
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
  pernas_pendentes AS (
    SELECT
      ap.bookmaker_id,
      COALESCE(SUM(ap.stake_real), 0) AS total_stake
    FROM public.apostas_pernas ap
    INNER JOIN public.apostas_unificada au ON au.id = ap.aposta_id
    WHERE au.workspace_id = v_workspace_id
      AND au.status = 'PENDENTE'
      AND au.cancelled_at IS NULL
      AND (p_projeto_id IS NULL OR au.projeto_id = p_projeto_id)
    GROUP BY ap.bookmaker_id
  ),
  combined_apostas AS (
    SELECT
      COALESCE(ap.bookmaker_id, pp.bookmaker_id) AS bookmaker_id,
      COALESCE(ap.total_stake, 0) + COALESCE(pp.total_stake, 0) AS total_stake
    FROM apostas_pendentes ap
    FULL OUTER JOIN pernas_pendentes pp ON pp.bookmaker_id = ap.bookmaker_id
  ),
  combined_todas AS (
    SELECT
      COALESCE(tap.bookmaker_id, pp2.bookmaker_id) AS bookmaker_id,
      COALESCE(tap.total_stake_real, 0) + COALESCE(pp2.total_stake, 0) AS total_stake_real
    FROM todas_apostas_pendentes tap
    FULL OUTER JOIN (
      SELECT
        ap2.bookmaker_id,
        COALESCE(SUM(ap2.stake_real), 0) AS total_stake
      FROM public.apostas_pernas ap2
      INNER JOIN public.apostas_unificada au2 ON au2.id = ap2.aposta_id
      WHERE au2.workspace_id = v_workspace_id
        AND au2.status = 'PENDENTE'
        AND au2.cancelled_at IS NULL
      GROUP BY ap2.bookmaker_id
    ) pp2 ON pp2.bookmaker_id = tap.bookmaker_id
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
      -- CORREÇÃO: usar valor_origem para transações cross-currency,
      -- pois cl.valor pode conter o valor convertido na moeda de destino
      COALESCE(SUM(
        CASE 
          WHEN cl.valor_origem IS NOT NULL AND cl.valor_origem > 0 THEN cl.valor_origem
          ELSE cl.valor
        END
      ), 0) AS total_saque_pendente
    FROM public.cash_ledger cl
    WHERE cl.workspace_id = v_workspace_id
      AND cl.status IN ('PENDENTE', 'pendente')
      AND cl.tipo_transacao = 'SAQUE'
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
    ba.saldo_base::NUMERIC AS saldo_real,
    ba.saldo_freebet::NUMERIC AS saldo_freebet,
    COALESCE(bc.total_bonus, 0)::NUMERIC AS saldo_bonus,
    COALESCE(tap.total_stake_real, 0)::NUMERIC AS saldo_em_aposta,
    -- saldo_disponivel = saldo_real - em_aposta - saque_pendente (piso zero)
    GREATEST(0, ba.saldo_base - COALESCE(ap.total_stake, 0) - COALESCE(sp.total_saque_pendente, 0))::NUMERIC AS saldo_disponivel,
    -- saldo_operavel = disponivel + em_aposta + freebet
    (GREATEST(0, ba.saldo_base - COALESCE(ap.total_stake, 0) - COALESCE(sp.total_saque_pendente, 0)) + COALESCE(tap.total_stake_real, 0) + GREATEST(0, ba.saldo_freebet))::NUMERIC AS saldo_operavel,
    COALESCE(bc.has_rollover_started, FALSE) AS bonus_rollover_started,
    (dp.bookmaker_id IS NOT NULL) AS has_pending_transactions,
    ba.instance_identifier,
    (sp.bookmaker_id IS NOT NULL) AS has_pending_withdrawals,
    COALESCE(sp.total_saque_pendente, 0)::NUMERIC AS saldo_saque_pendente
  FROM bookmakers_ativos ba
  LEFT JOIN apostas_pendentes ap ON ap.bookmaker_id = ba.id
  LEFT JOIN combined_todas tap ON tap.bookmaker_id = ba.id
  LEFT JOIN bonus_creditados bc ON bc.bookmaker_id = ba.id
  LEFT JOIN depositos_pendentes dp ON dp.bookmaker_id = ba.id
  LEFT JOIN saques_pendentes sp ON sp.bookmaker_id = ba.id
  ORDER BY ba.nome;
END;
$$;
