-- Atualiza a RPC para incluir o primeiro nome do parceiro
DROP FUNCTION IF EXISTS public.get_bookmaker_saldos(uuid);

CREATE OR REPLACE FUNCTION public.get_bookmaker_saldos(p_projeto_id uuid)
RETURNS TABLE (
  id uuid,
  nome text,
  moeda text,
  parceiro_primeiro_nome text,
  saldo_real numeric,
  saldo_freebet numeric,
  saldo_bonus numeric,
  saldo_em_aposta numeric,
  saldo_disponivel numeric,
  saldo_operavel numeric
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    b.id,
    b.nome,
    b.moeda,
    -- Primeiro nome do parceiro (antes do primeiro espaço)
    SPLIT_PART(COALESCE(p.nome, ''), ' ', 1) AS parceiro_primeiro_nome,
    COALESCE(b.saldo_atual, 0) AS saldo_real,
    COALESCE(b.saldo_freebet, 0) AS saldo_freebet,
    COALESCE(bonus_agg.total_bonus, 0) AS saldo_bonus,
    COALESCE(apostas_agg.total_em_aposta, 0) AS saldo_em_aposta,
    (COALESCE(b.saldo_atual, 0) - COALESCE(apostas_agg.total_em_aposta, 0)) AS saldo_disponivel,
    (COALESCE(b.saldo_atual, 0) - COALESCE(apostas_agg.total_em_aposta, 0) + COALESCE(b.saldo_freebet, 0) + COALESCE(bonus_agg.total_bonus, 0)) AS saldo_operavel
  FROM bookmakers b
  LEFT JOIN parceiros p ON b.parceiro_id = p.id
  LEFT JOIN LATERAL (
    SELECT COALESCE(SUM(pblb.saldo_atual), 0) AS total_bonus
    FROM project_bookmaker_link_bonuses pblb
    WHERE pblb.bookmaker_id = b.id
      AND pblb.status = 'credited'
  ) bonus_agg ON true
  LEFT JOIN LATERAL (
    SELECT COALESCE(SUM(au.stake), 0) AS total_em_aposta
    FROM apostas_unificada au
    WHERE au.bookmaker_id = b.id
      AND au.status = 'PENDENTE'
  ) apostas_agg ON true
  WHERE b.projeto_id = p_projeto_id
    AND b.status IN ('ATIVO', 'ativo', 'LIMITADA', 'limitada')
  ORDER BY b.nome;
END;
$$;

COMMENT ON FUNCTION public.get_bookmaker_saldos(uuid) IS 
'FUNÇÃO CANÔNICA - Retorna saldos detalhados de todas as casas de um projeto.
Inclui parceiro_primeiro_nome para exibição no tooltip.';