-- 1. Melhorar recalcular_perna_por_entradas para consolidar todos os campos financeiros
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
  -- Calcular totais das entradas vinculadas
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

  -- Atualizar a perna pai (seleção lógica)
  -- A perna pai agora reflete o agregado de todas as suas casas/moedas
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

-- 2. Garantir que fn_recalc_pai_surebet use os dados das entradas para o consolidado final
CREATE OR REPLACE FUNCTION public.fn_recalc_pai_surebet(p_surebet_id uuid)
RETURNS TABLE(
    todas_liquidadas boolean, 
    lucro_total numeric, 
    stake_total numeric, 
    resultado_geral text, 
    is_multicurrency boolean, 
    pl_consolidado numeric, 
    stake_consolidado numeric, 
    consolidation_currency text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_moeda_consolidacao TEXT;
  v_entry RECORD;
  v_rate NUMERIC;
  v_todas_liquidadas BOOLEAN := true;
  v_lucro_total_calc NUMERIC := 0;
  v_stake_total_calc NUMERIC := 0;
  v_is_multicurrency_calc BOOLEAN := false;
  v_rates JSONB;
  v_brl_rate_from NUMERIC;
  v_brl_rate_to NUMERIC;
  v_res_geral TEXT;
BEGIN
  -- Contexto para triggers de bloqueio
  PERFORM set_config('app.surebet_recalc_context', 'on', true);
  
  -- Buscar moeda de consolidação e cotações de trabalho do projeto
  SELECT 
    proj.moeda_consolidacao,
    jsonb_build_object(
      'USD', COALESCE(proj.cotacao_trabalho, 1),
      'EUR', COALESCE(proj.cotacao_trabalho_eur, 1),
      'GBP', COALESCE(proj.cotacao_trabalho_gbp, 1),
      'MYR', COALESCE(proj.cotacao_trabalho_myr, 1),
      'MXN', COALESCE(proj.cotacao_trabalho_mxn, 1),
      'ARS', COALESCE(proj.cotacao_trabalho_ars, 1),
      'COP', COALESCE(proj.cotacao_trabalho_cop, 1),
      'BRL', 1
    )
  INTO v_moeda_consolidacao, v_rates
  FROM public.projetos proj
  JOIN public.apostas_unificada au ON au.projeto_id = proj.id
  WHERE au.id = p_surebet_id;

  v_moeda_consolidacao := COALESCE(v_moeda_consolidacao, 'BRL');

  -- Verificar se todas as pernas lógicas estão liquidadas
  SELECT bool_and(ap.resultado IS NOT NULL AND ap.resultado != 'PENDENTE')
  INTO v_todas_liquidadas
  FROM public.apostas_pernas ap
  WHERE ap.aposta_id = p_surebet_id;

  -- Iterar por cada ENTRADA real para calcular os consolidados
  -- Isso garante que moedas diferentes na mesma perna sejam tratadas corretamente
  FOR v_entry IN
    SELECT 
      ae.moeda, ae.stake, ae.odd, ap.resultado, ae.fonte_saldo
    FROM public.apostas_perna_entradas ae
    JOIN public.apostas_pernas ap ON ap.id = ae.perna_id
    WHERE ap.aposta_id = p_surebet_id
  LOOP
    IF v_entry.moeda != v_moeda_consolidacao THEN
      v_is_multicurrency_calc := true;
    END IF;

    -- Calcular taxa de conversão para moeda de consolidação
    v_brl_rate_from := COALESCE((v_rates->>UPPER(v_entry.moeda))::NUMERIC, 1);
    v_brl_rate_to := COALESCE((v_rates->>UPPER(v_moeda_consolidacao))::NUMERIC, 1);

    v_rate := CASE 
      WHEN v_entry.moeda = v_moeda_consolidacao THEN 1 
      WHEN v_brl_rate_to > 0 THEN v_brl_rate_from / v_brl_rate_to 
      ELSE 1 
    END;

    DECLARE
      v_entry_payout NUMERIC := 0;
      v_entry_lucro NUMERIC := 0;
      v_is_fb BOOLEAN := (v_entry.fonte_saldo = 'FREEBET');
    BEGIN
      CASE v_entry.resultado
        WHEN 'GREEN' THEN 
          -- SNR: Freebet payout líquido = stake*(odd-1); aposta real payout = stake*odd
          IF v_is_fb THEN
            v_entry_lucro := v_entry.stake * (v_entry.odd - 1);
          ELSE
            v_entry_payout := v_entry.stake * v_entry.odd;
            v_entry_lucro := v_entry_payout - v_entry.stake;
          END IF;
        WHEN 'RED' THEN 
          v_entry_lucro := CASE WHEN v_is_fb THEN 0 ELSE -v_entry.stake END;
        WHEN 'VOID' THEN 
          v_entry_lucro := 0;
        WHEN 'MEIO_GREEN' THEN 
          IF v_is_fb THEN
            v_entry_lucro := (v_entry.stake * (v_entry.odd - 1)) / 2;
          ELSE
            v_entry_payout := v_entry.stake + (v_entry.stake * (v_entry.odd - 1) / 2);
            v_entry_lucro := v_entry_payout - v_entry.stake;
          END IF;
        WHEN 'MEIO_RED' THEN 
          v_entry_lucro := CASE WHEN v_is_fb THEN 0 ELSE -(v_entry.stake / 2) END;
        ELSE 
          v_entry_lucro := 0;
      END CASE;

      v_lucro_total_calc := v_lucro_total_calc + v_entry_lucro * v_rate;
      v_stake_total_calc := v_stake_total_calc + (CASE WHEN v_is_fb THEN 0 ELSE v_entry.stake END) * v_rate;
    END;
  END LOOP;

  v_lucro_total_calc := ROUND(v_lucro_total_calc, 4);
  v_stake_total_calc := ROUND(v_stake_total_calc, 4);

  -- Resultado geral baseado no lucro consolidado
  v_res_geral := CASE 
    WHEN v_todas_liquidadas AND v_lucro_total_calc > 0.0001 THEN 'GREEN'
    WHEN v_todas_liquidadas AND v_lucro_total_calc < -0.0001 THEN 'RED'
    WHEN v_todas_liquidadas THEN 'VOID'
    ELSE NULL
  END;

  RETURN QUERY SELECT
    COALESCE(v_todas_liquidadas, false),
    v_lucro_total_calc,
    v_stake_total_calc,
    v_res_geral,
    v_is_multicurrency_calc,
    v_lucro_total_calc,
    v_stake_total_calc,
    v_moeda_consolidacao;
END;
$function$;
