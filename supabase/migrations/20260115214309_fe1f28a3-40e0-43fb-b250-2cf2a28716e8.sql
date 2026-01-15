
-- Dropar função existente para poder recriá-la com nova assinatura
DROP FUNCTION IF EXISTS public.get_bookmaker_saldos(UUID);

-- Recriar função get_bookmaker_saldos com TODOS os campos necessários para UI
-- Esta é a ÚNICA fonte de verdade para saldos de bookmakers
CREATE FUNCTION public.get_bookmaker_saldos(p_projeto_id UUID)
RETURNS TABLE (
  id UUID,
  nome TEXT,
  moeda TEXT,
  parceiro_id UUID,
  parceiro_nome TEXT,
  parceiro_primeiro_nome TEXT,
  logo_url TEXT,
  saldo_real NUMERIC,
  saldo_freebet NUMERIC,
  saldo_bonus NUMERIC,
  saldo_em_aposta NUMERIC,
  saldo_disponivel NUMERIC,
  saldo_operavel NUMERIC,
  bonus_rollover_started BOOLEAN
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
    b.parceiro_id,
    COALESCE(p.nome, '') AS parceiro_nome,
    SPLIT_PART(COALESCE(p.nome, ''), ' ', 1) AS parceiro_primeiro_nome,
    bc.logo_url,
    COALESCE(b.saldo_atual, 0) AS saldo_real,
    COALESCE(b.saldo_freebet, 0) AS saldo_freebet,
    COALESCE(bonus_agg.total_bonus, 0) AS saldo_bonus,
    COALESCE(apostas_agg.total_em_aposta, 0) AS saldo_em_aposta,
    -- saldo_disponivel = saldo_real - saldo_em_aposta (capital livre de apostas pendentes)
    (COALESCE(b.saldo_atual, 0) - COALESCE(apostas_agg.total_em_aposta, 0)) AS saldo_disponivel,
    -- saldo_operavel = saldo_disponivel + freebet + bonus (total disponível para apostar)
    (COALESCE(b.saldo_atual, 0) - COALESCE(apostas_agg.total_em_aposta, 0) + COALESCE(b.saldo_freebet, 0) + COALESCE(bonus_agg.total_bonus, 0)) AS saldo_operavel,
    -- bonus_rollover_started = true se existe bônus creditado com rollover_progress > 0
    COALESCE(bonus_agg.has_rollover_started, false) AS bonus_rollover_started
  FROM bookmakers b
  LEFT JOIN parceiros p ON b.parceiro_id = p.id
  LEFT JOIN bookmakers_catalogo bc ON b.bookmaker_catalogo_id = bc.id
  -- Agregar saldo de bônus creditados e verificar se rollover iniciou
  LEFT JOIN LATERAL (
    SELECT 
      COALESCE(SUM(pblb.saldo_atual), 0) AS total_bonus,
      BOOL_OR(COALESCE(pblb.rollover_progress, 0) > 0) AS has_rollover_started
    FROM project_bookmaker_link_bonuses pblb
    WHERE pblb.bookmaker_id = b.id
      AND pblb.project_id = p_projeto_id
      AND pblb.status = 'credited'
  ) bonus_agg ON true
  -- Agregar stakes em apostas pendentes
  -- SIMPLES e MULTIPLA usam stake direto, ARBITRAGEM usa pernas JSON
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
'FONTE ÚNICA DE VERDADE para saldos de bookmakers de um projeto.

CÁLCULO CANÔNICO:
- saldo_real = bookmakers.saldo_atual
- saldo_freebet = bookmakers.saldo_freebet  
- saldo_bonus = SUM(project_bookmaker_link_bonuses.saldo_atual) WHERE status=credited
- saldo_em_aposta = stakes pendentes (SIMPLES/MULTIPLA: stake direto, ARBITRAGEM: pernas JSON)
- saldo_disponivel = saldo_real - saldo_em_aposta (capital livre)
- saldo_operavel = saldo_disponivel + freebet + bonus (total para apostar)

REGRAS:
1. NÃO existe separação entre saldo real e bônus para fins operacionais
2. Apostas pendentes BLOQUEIAM capital (refletido em saldo_disponivel)
3. Freebet não utilizada NÃO entra no saldo_disponivel, apenas no saldo_operavel
4. Esta função DEVE ser a única fonte de dados de saldo usada por toda a aplicação';
