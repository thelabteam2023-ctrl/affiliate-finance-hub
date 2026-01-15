
-- Corrigir a função calculate_bonus_rollover para considerar pernas de arbitragem
CREATE OR REPLACE FUNCTION public.calculate_bonus_rollover(p_bonus_id uuid)
RETURNS numeric
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_bonus RECORD;
  v_rollover_progress numeric := 0;
  v_pernas_total numeric := 0;
BEGIN
  -- Buscar dados do bônus
  SELECT 
    status,
    credited_at,
    min_odds,
    rollover_target_amount,
    bookmaker_id,
    project_id
  INTO v_bonus
  FROM public.project_bookmaker_link_bonuses
  WHERE id = p_bonus_id;
  
  -- Se bônus não existe ou não está creditado, retorna 0
  IF v_bonus IS NULL OR v_bonus.status != 'credited' THEN
    RETURN 0;
  END IF;
  
  -- 1. Calcular soma das stakes de apostas SIMPLES (bookmaker_id direto)
  SELECT COALESCE(SUM(
    CASE 
      WHEN a.stake_consolidado IS NOT NULL THEN a.stake_consolidado
      ELSE COALESCE(a.stake, 0) + COALESCE(a.stake_bonus, 0)
    END
  ), 0)
  INTO v_rollover_progress
  FROM public.apostas_unificada a
  WHERE a.bookmaker_id = v_bonus.bookmaker_id
    AND a.projeto_id = v_bonus.project_id
    AND a.status = 'LIQUIDADA'  -- Apenas liquidadas contam para rollover
    AND a.cancelled_at IS NULL
    -- Apenas apostas após creditação do bônus
    AND (v_bonus.credited_at IS NULL OR a.data_aposta >= v_bonus.credited_at)
    -- Apenas apostas com odd >= min_odds (se min_odds definida)
    AND (v_bonus.min_odds IS NULL OR COALESCE(a.odd, a.odd_final, 0) >= v_bonus.min_odds);
  
  -- 2. NOVO: Calcular soma das stakes das PERNAS de arbitragem
  -- Cada perna liquidada (resultado != null e != PENDENTE) conta para o rollover
  SELECT COALESCE(SUM((perna->>'stake')::numeric), 0)
  INTO v_pernas_total
  FROM public.apostas_unificada a,
       jsonb_array_elements(a.pernas) AS perna
  WHERE a.projeto_id = v_bonus.project_id
    AND a.forma_registro = 'ARBITRAGEM'
    AND a.status = 'LIQUIDADA'  -- Operação liquidada
    AND a.cancelled_at IS NULL
    -- Perna é da bookmaker do bônus
    AND (perna->>'bookmaker_id') = v_bonus.bookmaker_id::text
    -- Perna tem resultado válido (não VOID, não PENDENTE)
    AND (perna->>'resultado') IS NOT NULL
    AND (perna->>'resultado') NOT IN ('VOID', 'PENDENTE')
    -- Após creditação do bônus
    AND (v_bonus.credited_at IS NULL OR a.data_aposta >= v_bonus.credited_at)
    -- Odd da perna atende min_odds
    AND (v_bonus.min_odds IS NULL OR (perna->>'odd')::numeric >= v_bonus.min_odds);
  
  RETURN v_rollover_progress + v_pernas_total;
END;
$$;

-- Comentário explicativo
COMMENT ON FUNCTION public.calculate_bonus_rollover(uuid) IS 
'Calcula o progresso do rollover para um bônus, considerando tanto apostas simples quanto pernas de arbitragem que pertencem à bookmaker do bônus e foram liquidadas.';
