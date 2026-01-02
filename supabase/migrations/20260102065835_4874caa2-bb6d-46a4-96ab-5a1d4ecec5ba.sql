-- Primeiro dropar a função existente para poder alterar o return type
DROP FUNCTION IF EXISTS public.get_bookmaker_saldos(uuid);

-- Recriar com o novo campo bonus_rollover_started
CREATE OR REPLACE FUNCTION public.get_bookmaker_saldos(p_projeto_id uuid)
 RETURNS TABLE(
   id uuid, 
   nome text, 
   parceiro_id uuid, 
   parceiro_nome text, 
   moeda text, 
   logo_url text, 
   saldo_real numeric, 
   saldo_freebet numeric, 
   saldo_bonus numeric, 
   saldo_em_aposta numeric, 
   saldo_disponivel numeric, 
   saldo_operavel numeric,
   bonus_rollover_started boolean
 )
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  RETURN QUERY
  WITH bookmakers_ativos AS (
    SELECT 
      b.id,
      b.nome,
      b.parceiro_id,
      b.moeda,
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
      COALESCE(SUM(pblb.saldo_atual), 0) AS total_bonus,
      BOOL_OR(COALESCE(pblb.rollover_progress, 0) > 0) AS has_rollover_started
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
    (ba.saldo_base - COALESCE(ap.total_stake, 0) + COALESCE(ba.saldo_freebet, 0) + COALESCE(bc.total_bonus, 0))::NUMERIC AS saldo_operavel,
    COALESCE(bc.has_rollover_started, false)::BOOLEAN AS bonus_rollover_started
  FROM bookmakers_ativos ba
  LEFT JOIN apostas_pendentes ap ON ap.bookmaker_id = ba.id
  LEFT JOIN bonus_creditados bc ON bc.bookmaker_id = ba.id
  ORDER BY ba.nome;
END;
$function$;