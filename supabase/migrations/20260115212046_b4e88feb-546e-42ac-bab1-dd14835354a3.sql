
-- Atualizar função get_bookmaker_saldos para calcular corretamente stakes de ARBITRAGEM
-- O stake de arbitragens está no JSON pernas[], não no campo stake

CREATE OR REPLACE FUNCTION public.get_bookmaker_saldos(p_projeto_id UUID)
RETURNS TABLE (
  id UUID,
  nome TEXT,
  moeda TEXT,
  parceiro_primeiro_nome TEXT,
  saldo_real NUMERIC,
  saldo_freebet NUMERIC,
  saldo_bonus NUMERIC,
  saldo_em_aposta NUMERIC,
  saldo_disponivel NUMERIC,
  saldo_operavel NUMERIC
) 
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    b.id,
    b.nome,
    b.moeda,
    SPLIT_PART(COALESCE(p.nome, ''), ' ', 1) AS parceiro_primeiro_nome,
    COALESCE(b.saldo_atual, 0) AS saldo_real,
    COALESCE(b.saldo_freebet, 0) AS saldo_freebet,
    COALESCE(bonus_agg.total_bonus, 0) AS saldo_bonus,
    COALESCE(apostas_agg.total_em_aposta, 0) AS saldo_em_aposta,
    (COALESCE(b.saldo_atual, 0) - COALESCE(apostas_agg.total_em_aposta, 0)) AS saldo_disponivel,
    (COALESCE(b.saldo_atual, 0) - COALESCE(apostas_agg.total_em_aposta, 0) + COALESCE(b.saldo_freebet, 0) + COALESCE(bonus_agg.total_bonus, 0)) AS saldo_operavel
  FROM bookmakers b
  LEFT JOIN parceiros p ON b.parceiro_id = p.id
  -- Agregar saldo de bônus creditados
  LEFT JOIN LATERAL (
    SELECT COALESCE(SUM(pblb.saldo_atual), 0) AS total_bonus
    FROM project_bookmaker_link_bonuses pblb
    WHERE pblb.bookmaker_id = b.id
      AND pblb.status = 'credited'
  ) bonus_agg ON true
  -- Agregar stakes em apostas pendentes (SIMPLES + MULTIPLA usam stake direto, ARBITRAGEM usa pernas)
  LEFT JOIN LATERAL (
    SELECT COALESCE(
      -- Stakes diretos de apostas simples e múltiplas
      (SELECT SUM(au.stake) 
       FROM apostas_unificada au
       WHERE au.bookmaker_id = b.id
         AND au.status = 'PENDENTE'
         AND au.forma_registro IN ('SIMPLES', 'MULTIPLA')
      )
      , 0
    ) + COALESCE(
      -- Stakes de arbitragens (dentro do JSON pernas)
      (SELECT SUM((perna->>'stake')::NUMERIC)
       FROM apostas_unificada au,
            jsonb_array_elements(au.pernas::jsonb) AS perna
       WHERE au.status = 'PENDENTE'
         AND au.forma_registro = 'ARBITRAGEM'
         AND au.projeto_id = p_projeto_id
         AND (perna->>'bookmaker_id')::UUID = b.id
      )
      , 0
    ) AS total_em_aposta
  ) apostas_agg ON true
  WHERE b.projeto_id = p_projeto_id
    AND b.status IN ('ATIVO', 'ativo', 'LIMITADA', 'limitada')
  ORDER BY b.nome;
END;
$$;

-- Adicionar comentário explicativo
COMMENT ON FUNCTION public.get_bookmaker_saldos(UUID) IS 
'Retorna saldos consolidados de bookmakers de um projeto.
Calcula corretamente stakes pendentes de SIMPLES, MULTIPLA e ARBITRAGEM (pernas JSON).
saldo_em_aposta = soma de stakes pendentes por bookmaker
saldo_disponivel = saldo_real - saldo_em_aposta
saldo_operavel = saldo_disponivel + saldo_freebet + saldo_bonus';
