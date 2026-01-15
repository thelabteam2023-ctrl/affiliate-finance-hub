-- VERSÃO CANÔNICA DA FUNÇÃO get_bookmaker_saldos
-- NÃO MODIFICAR SEM TESTES EXTENSIVOS
-- Esta função é a ÚNICA fonte de verdade para o cálculo do Saldo Operável

DROP FUNCTION IF EXISTS public.get_bookmaker_saldos(uuid);

CREATE OR REPLACE FUNCTION public.get_bookmaker_saldos(p_projeto_id uuid)
RETURNS TABLE (
  id uuid,
  nome text,
  moeda text,
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
    -- saldo_real = saldo_atual da casa
    COALESCE(b.saldo_atual, 0) AS saldo_real,
    -- saldo_freebet = saldo_freebet da casa
    COALESCE(b.saldo_freebet, 0) AS saldo_freebet,
    -- saldo_bonus = soma dos bônus creditados ativos
    COALESCE(bonus_agg.total_bonus, 0) AS saldo_bonus,
    -- saldo_em_aposta = soma das stakes de apostas pendentes
    COALESCE(apostas_agg.total_em_aposta, 0) AS saldo_em_aposta,
    -- saldo_disponivel = saldo_real - saldo_em_aposta
    (COALESCE(b.saldo_atual, 0) - COALESCE(apostas_agg.total_em_aposta, 0)) AS saldo_disponivel,
    -- saldo_operavel = saldo_disponivel + saldo_freebet + saldo_bonus
    (COALESCE(b.saldo_atual, 0) - COALESCE(apostas_agg.total_em_aposta, 0) + COALESCE(b.saldo_freebet, 0) + COALESCE(bonus_agg.total_bonus, 0)) AS saldo_operavel
  FROM bookmakers b
  -- Agregar bônus creditados
  LEFT JOIN LATERAL (
    SELECT COALESCE(SUM(pblb.saldo_atual), 0) AS total_bonus
    FROM project_bookmaker_link_bonuses pblb
    WHERE pblb.bookmaker_id = b.id
      AND pblb.status = 'credited'
  ) bonus_agg ON true
  -- Agregar apostas pendentes
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

-- Comentário de documentação
COMMENT ON FUNCTION public.get_bookmaker_saldos(uuid) IS 
'FUNÇÃO CANÔNICA - Retorna saldos detalhados de todas as casas de um projeto.
Contrato:
- saldo_real = bookmakers.saldo_atual
- saldo_freebet = bookmakers.saldo_freebet  
- saldo_bonus = SUM(project_bookmaker_link_bonuses.saldo_atual) WHERE status=credited
- saldo_em_aposta = SUM(apostas_unificada.stake) WHERE status=PENDENTE
- saldo_disponivel = saldo_real - saldo_em_aposta
- saldo_operavel = saldo_disponivel + saldo_freebet + saldo_bonus

ATENÇÃO: Não modificar sem testes extensivos. Esta função é a fonte de verdade para o KPI Saldo Operável.';