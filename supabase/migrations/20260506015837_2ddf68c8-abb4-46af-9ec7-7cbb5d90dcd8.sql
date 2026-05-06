CREATE OR REPLACE FUNCTION public.recalcular_perna_por_entradas(p_perna_id UUID)
RETURNS VOID AS $$
DECLARE
  v_total_stake NUMERIC := 0;
  v_total_payout NUMERIC := 0;
  v_weighted_odd NUMERIC := 0;
  v_total_brl NUMERIC := 0;
  v_total_stake_real NUMERIC := 0;
  v_total_stake_freebet NUMERIC := 0;
BEGIN
  -- Calcular totais das entradas
  SELECT 
    COALESCE(SUM(stake), 0),
    COALESCE(SUM(stake * odd), 0),
    COALESCE(SUM(stake_brl_referencia), 0),
    COALESCE(SUM(stake_real), 0),
    COALESCE(SUM(stake_freebet), 0)
  INTO 
    v_total_stake, v_total_payout, v_total_brl, 
    v_total_stake_real, v_total_stake_freebet
  FROM public.apostas_perna_entradas
  WHERE perna_id = p_perna_id;

  IF v_total_stake > 0 THEN
    v_weighted_odd := v_total_payout / v_total_stake;
  END IF;

  -- Atualizar a perna pai (seleção)
  UPDATE public.apostas_pernas
  SET 
    stake = v_total_stake,
    odd = v_weighted_odd,
    stake_brl_referencia = v_total_brl,
    stake_real = v_total_stake_real,
    stake_freebet = v_total_stake_freebet,
    updated_at = NOW()
  WHERE id = p_perna_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
