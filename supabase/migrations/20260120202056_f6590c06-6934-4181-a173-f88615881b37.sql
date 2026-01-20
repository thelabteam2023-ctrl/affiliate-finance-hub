-- Atualizar RPC get_bookmaker_saldos para incluir flag de transações pendentes
-- Isso permitirá bloquear operações em casas não conciliadas

DROP FUNCTION IF EXISTS public.get_bookmaker_saldos(uuid);

CREATE OR REPLACE FUNCTION public.get_bookmaker_saldos(p_projeto_id uuid)
RETURNS TABLE(
  id uuid,
  nome text,
  logo_url text,
  moeda text,
  parceiro_id uuid,
  parceiro_nome text,
  parceiro_primeiro_nome text,
  saldo_real numeric,
  saldo_freebet numeric,
  saldo_bonus numeric,
  saldo_em_aposta numeric,
  saldo_disponivel numeric,
  saldo_operavel numeric,
  bonus_rollover_started boolean,
  has_pending_transactions boolean
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  WITH bonus_agg AS (
    SELECT 
      pblb.bookmaker_id,
      COALESCE(SUM(pblb.saldo_atual), 0) AS total_bonus,
      BOOL_OR(COALESCE(pblb.rollover_progress, 0) > 0) AS any_rollover_started
    FROM project_bookmaker_link_bonuses pblb
    WHERE pblb.project_id = p_projeto_id
      AND pblb.status = 'credited'
    GROUP BY pblb.bookmaker_id
  ),
  -- APOSTAS DIRETAS (bookmaker_id preenchido na apostas_unificada)
  apostas_diretas AS (
    SELECT 
      a.bookmaker_id,
      COALESCE(SUM(a.stake), 0) AS total_em_aposta
    FROM apostas_unificada a
    WHERE a.projeto_id = p_projeto_id
      AND a.status IN ('aberta', 'PENDENTE')
      AND a.resultado IS NULL
      AND a.bookmaker_id IS NOT NULL
    GROUP BY a.bookmaker_id
  ),
  -- APOSTAS VIA PERNAS (tabela normalizada - NÃO depende de estratégia!)
  apostas_pernas_agg AS (
    SELECT 
      ap.bookmaker_id,
      COALESCE(SUM(ap.stake), 0) AS total_em_aposta
    FROM apostas_pernas ap
    JOIN apostas_unificada a ON a.id = ap.aposta_id
    WHERE a.projeto_id = p_projeto_id
      AND a.status IN ('aberta', 'PENDENTE')
      AND (ap.resultado IS NULL OR ap.resultado = 'PENDENTE')
    GROUP BY ap.bookmaker_id
  ),
  -- Combina apostas diretas + pernas
  apostas_total AS (
    SELECT 
      bookmaker_id,
      SUM(total_em_aposta) AS total_em_aposta
    FROM (
      SELECT bookmaker_id, total_em_aposta FROM apostas_diretas
      UNION ALL
      SELECT bookmaker_id, total_em_aposta FROM apostas_pernas_agg
    ) combined
    GROUP BY bookmaker_id
  ),
  -- NOVO: Detectar transações pendentes de conciliação
  pending_transactions AS (
    SELECT 
      COALESCE(cl.destino_bookmaker_id, cl.origem_bookmaker_id) AS bookmaker_id,
      TRUE AS has_pending
    FROM cash_ledger cl
    WHERE cl.status = 'PENDENTE'
      AND (cl.destino_bookmaker_id IS NOT NULL OR cl.origem_bookmaker_id IS NOT NULL)
    GROUP BY COALESCE(cl.destino_bookmaker_id, cl.origem_bookmaker_id)
  )
  SELECT 
    b.id,
    b.nome::TEXT,
    bc.logo_url::TEXT,
    b.moeda::TEXT,
    b.parceiro_id,
    p.nome::TEXT AS parceiro_nome,
    SPLIT_PART(COALESCE(p.nome, ''), ' ', 1)::TEXT AS parceiro_primeiro_nome,
    CASE 
      WHEN b.moeda IN ('USD', 'USDT') THEN COALESCE(b.saldo_usd, 0)
      ELSE COALESCE(b.saldo_atual, 0)
    END AS saldo_real,
    COALESCE(b.saldo_freebet, 0) AS saldo_freebet,
    COALESCE(bonus_agg.total_bonus, 0) AS saldo_bonus,
    COALESCE(apostas_total.total_em_aposta, 0) AS saldo_em_aposta,
    -- saldo_disponivel: saldo real menos apostas em aberto (considerando que parte pode estar no bônus)
    (CASE 
      WHEN b.moeda IN ('USD', 'USDT') THEN COALESCE(b.saldo_usd, 0)
      ELSE COALESCE(b.saldo_atual, 0)
    END - GREATEST(0, COALESCE(apostas_total.total_em_aposta, 0) - COALESCE(bonus_agg.total_bonus, 0))) AS saldo_disponivel,
    -- saldo_operavel: disponível + freebet + bônus
    (CASE 
      WHEN b.moeda IN ('USD', 'USDT') THEN COALESCE(b.saldo_usd, 0)
      ELSE COALESCE(b.saldo_atual, 0)
    END - GREATEST(0, COALESCE(apostas_total.total_em_aposta, 0) - COALESCE(bonus_agg.total_bonus, 0)) 
    + COALESCE(b.saldo_freebet, 0) 
    + COALESCE(bonus_agg.total_bonus, 0)) AS saldo_operavel,
    COALESCE(bonus_agg.any_rollover_started, false) AS bonus_rollover_started,
    -- NOVO: Flag de transações pendentes
    COALESCE(pending_transactions.has_pending, false) AS has_pending_transactions
  FROM bookmakers b
  LEFT JOIN bookmakers_catalogo bc ON b.bookmaker_catalogo_id = bc.id
  LEFT JOIN parceiros p ON b.parceiro_id = p.id
  LEFT JOIN bonus_agg ON bonus_agg.bookmaker_id = b.id
  LEFT JOIN apostas_total ON apostas_total.bookmaker_id = b.id
  LEFT JOIN pending_transactions ON pending_transactions.bookmaker_id = b.id
  WHERE b.projeto_id = p_projeto_id
    AND b.status = 'ativo';
END;
$$;