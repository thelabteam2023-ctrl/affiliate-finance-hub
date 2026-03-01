
CREATE OR REPLACE FUNCTION public.calculate_bonus_rollover(p_bonus_id uuid)
RETURNS numeric
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_bonus RECORD;
  v_rollover_progress numeric := 0;
  v_pernas_total numeric := 0;
  v_credit_date date;
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
  
  -- Extrair apenas a DATA do crédito (sem hora)
  v_credit_date := (v_bonus.credited_at)::date;
  
  -- 1. Calcular soma das stakes de apostas SIMPLES (bookmaker_id direto, NÃO arbitragem)
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
    AND a.status = 'LIQUIDADA'
    AND a.cancelled_at IS NULL
    AND a.forma_registro != 'ARBITRAGEM'
    AND (v_credit_date IS NULL OR a.data_aposta::date >= v_credit_date)
    AND (v_bonus.min_odds IS NULL OR COALESCE(a.odd, a.odd_final, 0) >= v_bonus.min_odds);
  
  -- 2. Calcular soma das stakes das PERNAS de arbitragem usando a tabela apostas_pernas
  --    (CORREÇÃO: antes usava jsonb_array_elements(a.pernas) que pode estar vazio/desatualizado)
  SELECT COALESCE(SUM(ap.stake), 0)
  INTO v_pernas_total
  FROM public.apostas_pernas ap
  JOIN public.apostas_unificada a ON a.id = ap.aposta_id
  WHERE a.projeto_id = v_bonus.project_id
    AND a.forma_registro = 'ARBITRAGEM'
    AND a.status = 'LIQUIDADA'
    AND a.cancelled_at IS NULL
    -- Perna é da bookmaker do bônus
    AND ap.bookmaker_id = v_bonus.bookmaker_id
    -- Perna tem resultado válido
    AND ap.resultado IS NOT NULL
    AND ap.resultado NOT IN ('VOID', 'PENDENTE')
    -- Comparar apenas a data (sem hora)
    AND (v_credit_date IS NULL OR a.data_aposta::date >= v_credit_date)
    -- Odd da perna atende min_odds
    AND (v_bonus.min_odds IS NULL OR ap.odd >= v_bonus.min_odds);
  
  RETURN v_rollover_progress + v_pernas_total;
END;
$$;
