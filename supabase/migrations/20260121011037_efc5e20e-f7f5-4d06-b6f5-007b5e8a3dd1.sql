
-- Simplificar a RPC para usar APENAS saldo_atual como fonte de verdade
-- Elimina a lógica duplicada saldo_atual vs saldo_usd

DROP FUNCTION IF EXISTS public.get_bookmaker_saldos(UUID);

CREATE FUNCTION public.get_bookmaker_saldos(p_projeto_id UUID)
RETURNS TABLE (
  id UUID,
  nome TEXT,
  logo_url TEXT,
  moeda TEXT,
  parceiro_id UUID,
  parceiro_nome TEXT,
  parceiro_primeiro_nome TEXT,
  saldo_real NUMERIC,
  saldo_freebet NUMERIC,
  saldo_bonus NUMERIC,
  saldo_em_aposta NUMERIC,
  saldo_disponivel NUMERIC,
  saldo_operavel NUMERIC,
  bonus_rollover_started BOOLEAN
)
LANGUAGE SQL
STABLE
SECURITY DEFINER
AS $$
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
  apostas_agg AS (
    SELECT 
      a.bookmaker_id,
      COALESCE(SUM(a.stake), 0) AS total_em_aposta
    FROM apostas_unificada a
    WHERE a.projeto_id = p_projeto_id
      AND a.status IN ('aberta', 'PENDENTE')
      AND a.resultado IS NULL
      AND a.estrategia IN ('SIMPLES', 'MULTIPLA')
      AND a.bookmaker_id IS NOT NULL
    GROUP BY a.bookmaker_id
    
    UNION ALL
    
    SELECT 
      (perna->>'bookmaker_id')::UUID AS bookmaker_id,
      COALESCE(SUM((perna->>'stake')::numeric), 0) AS total_em_aposta
    FROM apostas_unificada a,
         jsonb_array_elements(a.pernas) AS perna
    WHERE a.projeto_id = p_projeto_id
      AND a.status IN ('aberta', 'PENDENTE')
      AND a.estrategia NOT IN ('SIMPLES', 'MULTIPLA')
      AND a.pernas IS NOT NULL
      AND (perna->>'resultado') IS NULL
    GROUP BY (perna->>'bookmaker_id')::UUID
  ),
  apostas_total AS (
    SELECT 
      bookmaker_id,
      COALESCE(SUM(total_em_aposta), 0) AS total_em_aposta
    FROM apostas_agg
    GROUP BY bookmaker_id
  )
  SELECT 
    b.id,
    b.nome::TEXT,
    bc.logo_url::TEXT,
    b.moeda::TEXT,
    b.parceiro_id,
    p.nome::TEXT AS parceiro_nome,
    SPLIT_PART(COALESCE(p.nome, ''), ' ', 1)::TEXT AS parceiro_primeiro_nome,
    -- SIMPLIFICADO: Usar apenas saldo_atual como fonte de verdade
    COALESCE(b.saldo_atual, 0) AS saldo_real,
    COALESCE(b.saldo_freebet, 0) AS saldo_freebet,
    COALESCE(bonus_agg.total_bonus, 0) AS saldo_bonus,
    COALESCE(apostas_total.total_em_aposta, 0) AS saldo_em_aposta,
    -- saldo_disponivel = saldo_real - MAX(0, em_aposta - bonus)
    (COALESCE(b.saldo_atual, 0) - GREATEST(0, COALESCE(apostas_total.total_em_aposta, 0) - COALESCE(bonus_agg.total_bonus, 0))) AS saldo_disponivel,
    -- saldo_operavel = saldo_disponivel + freebet + bonus
    (COALESCE(b.saldo_atual, 0) - GREATEST(0, COALESCE(apostas_total.total_em_aposta, 0) - COALESCE(bonus_agg.total_bonus, 0)) 
    + COALESCE(b.saldo_freebet, 0) 
    + COALESCE(bonus_agg.total_bonus, 0)) AS saldo_operavel,
    COALESCE(bonus_agg.any_rollover_started, false) AS bonus_rollover_started
  FROM bookmakers b
  LEFT JOIN bookmakers_catalogo bc ON b.bookmaker_catalogo_id = bc.id
  LEFT JOIN parceiros p ON b.parceiro_id = p.id
  LEFT JOIN bonus_agg ON bonus_agg.bookmaker_id = b.id
  LEFT JOIN apostas_total ON apostas_total.bookmaker_id = b.id
  WHERE b.projeto_id = p_projeto_id
    AND b.status = 'ativo';
$$;

COMMENT ON FUNCTION public.get_bookmaker_saldos(UUID) IS 
'FONTE ÚNICA DE VERDADE para saldos de bookmakers - v3.0

SIMPLIFICAÇÃO: Usa apenas saldo_atual como fonte (saldo_usd é DEPRECATED).

Contrato:
- saldo_real = bookmakers.saldo_atual (ÚNICA coluna de saldo)
- saldo_bonus = SUM(bonus.saldo_atual) WHERE status=credited
- saldo_disponivel = saldo_real - GREATEST(0, em_aposta - bonus)
- saldo_operavel = saldo_disponivel + freebet + bonus

Bônus NÃO entra em saldo_real. Bônus é somado apenas uma vez no saldo_operavel.';
