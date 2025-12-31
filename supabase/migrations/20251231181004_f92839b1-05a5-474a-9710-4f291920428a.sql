-- CORREÇÃO CRÍTICA: A RPC get_bookmaker_saldos estava usando APENAS saldo_atual,
-- ignorando saldo_usd para bookmakers com moeda USD.
--
-- Regra de negócio (fonte da verdade = aba Vínculos):
-- - Se moeda = 'USD' ou 'USDT' → usar saldo_usd
-- - Se moeda = 'BRL' ou outros → usar saldo_atual

CREATE OR REPLACE FUNCTION get_bookmaker_saldos(p_projeto_id UUID)
RETURNS TABLE (
  id UUID,
  nome TEXT,
  parceiro_id UUID,
  parceiro_nome TEXT,
  moeda TEXT,
  logo_url TEXT,
  saldo_real NUMERIC,
  saldo_freebet NUMERIC,
  saldo_bonus NUMERIC,
  saldo_em_aposta NUMERIC,
  saldo_disponivel NUMERIC,
  saldo_operavel NUMERIC
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  WITH bookmakers_ativos AS (
    SELECT 
      b.id,
      b.nome,
      b.parceiro_id,
      b.moeda,
      -- CORREÇÃO MULTI-MOEDA: usar saldo_usd para moedas USD/USDT
      CASE 
        WHEN b.moeda IN ('USD', 'USDT') THEN COALESCE(b.saldo_usd, 0)
        ELSE COALESCE(b.saldo_atual, 0)
      END AS saldo_base,
      b.saldo_freebet,
      p.nome AS parceiro_nome,
      bc.logo_url
    FROM bookmakers b
    LEFT JOIN parceiros p ON p.id = b.parceiro_id
    LEFT JOIN bookmakers_catalogo bc ON bc.id = b.bookmaker_catalogo_id
    WHERE b.projeto_id = p_projeto_id
      AND b.status IN ('ATIVO', 'ativo', 'LIMITADA', 'limitada')
  ),
  apostas_pendentes AS (
    SELECT 
      au.bookmaker_id,
      COALESCE(SUM(au.stake), 0) AS total_stake
    FROM apostas_unificada au
    WHERE au.projeto_id = p_projeto_id
      AND au.status = 'PENDENTE'
      AND au.cancelled_at IS NULL
      AND au.bookmaker_id IS NOT NULL
    GROUP BY au.bookmaker_id
  ),
  bonus_creditados AS (
    SELECT 
      pblb.bookmaker_id,
      COALESCE(SUM(pblb.saldo_atual), 0) AS total_bonus
    FROM project_bookmaker_link_bonuses pblb
    WHERE pblb.project_id = p_projeto_id
      AND pblb.status = 'credited'
    GROUP BY pblb.bookmaker_id
  )
  SELECT
    ba.id,
    ba.nome,
    ba.parceiro_id,
    ba.parceiro_nome,
    ba.moeda,
    ba.logo_url,
    ba.saldo_base::NUMERIC AS saldo_real,
    COALESCE(ba.saldo_freebet, 0)::NUMERIC AS saldo_freebet,
    COALESCE(bc.total_bonus, 0)::NUMERIC AS saldo_bonus,
    COALESCE(ap.total_stake, 0)::NUMERIC AS saldo_em_aposta,
    (ba.saldo_base - COALESCE(ap.total_stake, 0))::NUMERIC AS saldo_disponivel,
    (ba.saldo_base - COALESCE(ap.total_stake, 0) + COALESCE(ba.saldo_freebet, 0) + COALESCE(bc.total_bonus, 0))::NUMERIC AS saldo_operavel
  FROM bookmakers_ativos ba
  LEFT JOIN apostas_pendentes ap ON ap.bookmaker_id = ba.id
  LEFT JOIN bonus_creditados bc ON bc.bookmaker_id = ba.id
  ORDER BY ba.nome;
END;
$$;