CREATE OR REPLACE FUNCTION public.get_saldo_operavel_por_projeto(p_projeto_ids uuid[])
 RETURNS TABLE(projeto_id uuid, saldo_operavel numeric, saldo_operavel_brl numeric, saldo_operavel_usd numeric, total_bookmakers integer)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  RETURN QUERY
  WITH bookmaker_saldos AS (
    SELECT
      b.projeto_id,
      b.id AS bookmaker_id,
      b.moeda,
      -- saldo_real: usa saldo_usd para USD/USDT, senão saldo_atual
      CASE 
        WHEN b.moeda IN ('USD', 'USDT') THEN COALESCE(b.saldo_usd, 0)
        ELSE COALESCE(b.saldo_atual, 0)
      END AS saldo_real,
      COALESCE(b.saldo_freebet, 0) AS saldo_freebet,
      -- saldo_bonus: soma de bônus creditados
      COALESCE(bonus_agg.total_bonus, 0) AS saldo_bonus,
      -- saldo_em_aposta: apostas pendentes
      COALESCE(apostas_agg.total_em_aposta, 0) AS saldo_em_aposta
    FROM bookmakers b
    -- Agregar bônus creditados
    LEFT JOIN LATERAL (
      SELECT COALESCE(SUM(pblb.saldo_atual), 0) AS total_bonus
      FROM project_bookmaker_link_bonuses pblb
      WHERE pblb.bookmaker_id = b.id
        AND pblb.status = 'credited'
    ) bonus_agg ON true
    -- Agregar apostas pendentes (simples/múltipla + pernas de arbitragem)
    LEFT JOIN LATERAL (
      SELECT COALESCE(SUM(
        CASE 
          WHEN au.forma_registro = 'ARBITRAGEM' THEN 0  -- Pernas são contadas separadamente
          ELSE COALESCE(au.stake, 0)
        END
      ), 0) + COALESCE((
        SELECT SUM(ap.stake)
        FROM apostas_pernas ap
        INNER JOIN apostas_unificada au2 ON ap.aposta_id = au2.id
        WHERE ap.bookmaker_id = b.id
          AND au2.status = 'PENDENTE'
      ), 0) AS total_em_aposta
      FROM apostas_unificada au
      WHERE au.bookmaker_id = b.id
        AND au.status = 'PENDENTE'
    ) apostas_agg ON true
    WHERE b.projeto_id = ANY(p_projeto_ids)
      AND LOWER(b.status) = 'ativo'
  ),
  saldos_calculados AS (
    SELECT
      bs.projeto_id,
      bs.bookmaker_id,
      bs.moeda,
      -- saldo_disponivel = saldo_real - saldo_em_aposta
      GREATEST(0, bs.saldo_real - bs.saldo_em_aposta) AS saldo_disponivel,
      bs.saldo_freebet,
      bs.saldo_bonus
    FROM bookmaker_saldos bs
  ),
  saldos_operaveis AS (
    SELECT
      sc.projeto_id,
      sc.bookmaker_id,
      sc.moeda,
      -- saldo_operavel = saldo_disponivel + saldo_freebet + saldo_bonus
      (sc.saldo_disponivel + sc.saldo_freebet + sc.saldo_bonus) AS saldo_op
    FROM saldos_calculados sc
  )
  SELECT
    so.projeto_id,
    SUM(so.saldo_op) AS saldo_operavel,
    SUM(CASE WHEN so.moeda NOT IN ('USD', 'USDT') THEN so.saldo_op ELSE 0 END) AS saldo_operavel_brl,
    SUM(CASE WHEN so.moeda IN ('USD', 'USDT') THEN so.saldo_op ELSE 0 END) AS saldo_operavel_usd,
    COUNT(*)::INTEGER AS total_bookmakers
  FROM saldos_operaveis so
  GROUP BY so.projeto_id;
END;
$function$;