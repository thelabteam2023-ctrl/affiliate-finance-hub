-- =====================================================
-- CORREÇÃO COMPLETA: RPC get_bookmaker_saldos
-- =====================================================
-- 
-- CONTRATO CANÔNICO DE SALDO OPERÁVEL:
-- saldo_operavel = saldo_disponivel + saldo_bonus
-- 
-- Onde:
-- - saldo_disponivel = saldo_real - saldo_em_aposta (EXCLUI FREEBET!)
-- - saldo_real = bookmakers.saldo_atual
-- - saldo_bonus = SUM(project_bookmaker_link_bonuses.saldo_atual) WHERE status='credited'
-- - saldo_em_aposta = SUM(apostas_unificada.stake) WHERE status='PENDENTE'
-- 
-- IMPORTANTE: Freebet NÃO entra no saldo_operavel (é recurso separado)
-- =====================================================

DROP FUNCTION IF EXISTS public.get_bookmaker_saldos(UUID);

CREATE OR REPLACE FUNCTION public.get_bookmaker_saldos(p_projeto_id UUID)
RETURNS TABLE (
  id UUID,
  nome TEXT,
  login_username TEXT,
  parceiro_id UUID,
  parceiro_nome TEXT,
  moeda TEXT,
  logo_url TEXT,
  saldo_real NUMERIC,
  saldo_freebet NUMERIC,
  saldo_bonus NUMERIC,
  saldo_em_aposta NUMERIC,
  saldo_disponivel NUMERIC,
  saldo_operavel NUMERIC,
  bonus_rollover_started BOOLEAN,
  estado_conta TEXT,
  status TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  WITH 
    -- Bookmakers ativos do projeto com dados básicos
    bookmakers_ativos AS (
      SELECT 
        b.id AS bookmaker_id,
        COALESCE(bc.nome, b.nome) AS nome,
        b.login_username,
        b.parceiro_id,
        p.nome AS parceiro_nome,
        b.moeda,
        bc.logo_url,
        b.saldo_atual AS saldo_base,
        b.saldo_freebet,
        b.estado_conta,
        b.status
      FROM bookmakers b
      LEFT JOIN bookmakers_catalogo bc ON b.bookmaker_catalogo_id = bc.id
      LEFT JOIN parceiros p ON b.parceiro_id = p.id
      WHERE b.projeto_id = p_projeto_id
        AND b.status = 'ativo'
    ),
    
    -- Soma de bônus creditados por bookmaker (via link)
    bonus_creditados AS (
      SELECT 
        pbl.bookmaker_id,
        COALESCE(SUM(pblb.saldo_atual), 0) AS total_bonus,
        -- Verifica se algum bônus já teve rollover iniciado
        BOOL_OR(COALESCE(pblb.rollover_progress, 0) > 0) AS has_rollover_started
      FROM project_bookmaker_link pbl
      INNER JOIN project_bookmaker_link_bonuses pblb ON pblb.link_id = pbl.id
      WHERE pbl.projeto_id = p_projeto_id
        AND pblb.status = 'credited'
      GROUP BY pbl.bookmaker_id
    ),
    
    -- Soma de stakes em apostas pendentes por bookmaker
    apostas_pendentes AS (
      SELECT 
        a.bookmaker_id,
        COALESCE(SUM(a.stake), 0) AS total_stake
      FROM apostas_unificada a
      WHERE a.projeto_id = p_projeto_id
        AND a.status = 'PENDENTE'
        AND a.bookmaker_id IS NOT NULL
      GROUP BY a.bookmaker_id
    )
    
  SELECT
    ba.bookmaker_id AS id,
    ba.nome::TEXT,
    ba.login_username::TEXT,
    ba.parceiro_id,
    ba.parceiro_nome::TEXT,
    ba.moeda::TEXT,
    ba.logo_url::TEXT,
    ba.saldo_base::NUMERIC AS saldo_real,
    COALESCE(ba.saldo_freebet, 0)::NUMERIC AS saldo_freebet,
    COALESCE(bc.total_bonus, 0)::NUMERIC AS saldo_bonus,
    COALESCE(ap.total_stake, 0)::NUMERIC AS saldo_em_aposta,
    -- saldo_disponivel = saldo_real - saldo_em_aposta
    (ba.saldo_base - COALESCE(ap.total_stake, 0))::NUMERIC AS saldo_disponivel,
    -- saldo_operavel = saldo_disponivel + saldo_bonus (EXCLUI FREEBET!)
    (ba.saldo_base - COALESCE(ap.total_stake, 0) + COALESCE(bc.total_bonus, 0))::NUMERIC AS saldo_operavel,
    COALESCE(bc.has_rollover_started, false)::BOOLEAN AS bonus_rollover_started,
    ba.estado_conta::TEXT,
    ba.status::TEXT
  FROM bookmakers_ativos ba
  LEFT JOIN bonus_creditados bc ON bc.bookmaker_id = ba.bookmaker_id
  LEFT JOIN apostas_pendentes ap ON ap.bookmaker_id = ba.bookmaker_id
  ORDER BY ba.nome;
END;
$$;

-- Grant permissions
GRANT EXECUTE ON FUNCTION public.get_bookmaker_saldos(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_bookmaker_saldos(UUID) TO anon;
GRANT EXECUTE ON FUNCTION public.get_bookmaker_saldos(UUID) TO service_role;