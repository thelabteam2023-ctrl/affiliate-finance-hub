
-- CORREÇÃO: Usar bonus_amount em vez de saldo_creditado
-- Também corrigir para não duplicar bônus já contabilizados via saldo_atual

CREATE OR REPLACE FUNCTION public.recalcular_saldo_bookmaker(p_bookmaker_id uuid)
 RETURNS TABLE(bookmaker_id uuid, nome text, moeda text, saldo_anterior numeric, saldo_calculado numeric, diferenca numeric, depositos numeric, saques numeric, transferencias_entrada numeric, transferencias_saida numeric, lucro_apostas numeric, cashback numeric, giros_gratis numeric, bonus_creditado numeric)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_depositos numeric := 0;
  v_saques numeric := 0;
  v_transferencias_entrada numeric := 0;
  v_transferencias_saida numeric := 0;
  v_lucro_apostas numeric := 0;
  v_lucro_pernas numeric := 0;
  v_cashback numeric := 0;
  v_giros_gratis numeric := 0;
  v_bonus_creditado numeric := 0;
  v_saldo_anterior numeric := 0;
  v_saldo_calculado numeric := 0;
  v_nome text;
  v_moeda text;
  v_is_usd boolean;
BEGIN
  -- Bookmaker current info including currency
  SELECT b.nome, b.moeda, 
         CASE WHEN UPPER(b.moeda) IN ('USD', 'USDT', 'USDC') THEN b.saldo_usd ELSE b.saldo_atual END
    INTO v_nome, v_moeda, v_saldo_anterior
  FROM public.bookmakers b
  WHERE b.id = p_bookmaker_id;

  IF v_nome IS NULL THEN
    RETURN;
  END IF;

  -- Check if bookmaker is USD-based
  v_is_usd := UPPER(v_moeda) IN ('USD', 'USDT', 'USDC');

  -- Deposits (destino = bookmaker)
  IF v_is_usd THEN
    SELECT COALESCE(SUM(COALESCE(cl.valor_usd, cl.valor)), 0)
      INTO v_depositos
    FROM public.cash_ledger cl
    WHERE cl.destino_bookmaker_id = p_bookmaker_id
      AND UPPER(cl.status) = 'CONFIRMADO'
      AND UPPER(cl.tipo_transacao) = 'DEPOSITO';
  ELSE
    SELECT COALESCE(SUM(cl.valor), 0)
      INTO v_depositos
    FROM public.cash_ledger cl
    WHERE cl.destino_bookmaker_id = p_bookmaker_id
      AND UPPER(cl.status) = 'CONFIRMADO'
      AND UPPER(cl.tipo_transacao) = 'DEPOSITO';
  END IF;

  -- Withdrawals (origem = bookmaker)
  IF v_is_usd THEN
    SELECT COALESCE(SUM(COALESCE(cl.valor_usd, cl.valor)), 0)
      INTO v_saques
    FROM public.cash_ledger cl
    WHERE cl.origem_bookmaker_id = p_bookmaker_id
      AND UPPER(cl.status) = 'CONFIRMADO'
      AND UPPER(cl.tipo_transacao) = 'SAQUE';
  ELSE
    SELECT COALESCE(SUM(cl.valor), 0)
      INTO v_saques
    FROM public.cash_ledger cl
    WHERE cl.origem_bookmaker_id = p_bookmaker_id
      AND UPPER(cl.status) = 'CONFIRMADO'
      AND UPPER(cl.tipo_transacao) = 'SAQUE';
  END IF;

  -- Transfers in (destino = bookmaker)
  IF v_is_usd THEN
    SELECT COALESCE(SUM(COALESCE(cl.valor_usd, cl.valor)), 0)
      INTO v_transferencias_entrada
    FROM public.cash_ledger cl
    WHERE cl.destino_bookmaker_id = p_bookmaker_id
      AND UPPER(cl.status) = 'CONFIRMADO'
      AND UPPER(cl.tipo_transacao) = 'TRANSFERENCIA';
  ELSE
    SELECT COALESCE(SUM(cl.valor), 0)
      INTO v_transferencias_entrada
    FROM public.cash_ledger cl
    WHERE cl.destino_bookmaker_id = p_bookmaker_id
      AND UPPER(cl.status) = 'CONFIRMADO'
      AND UPPER(cl.tipo_transacao) = 'TRANSFERENCIA';
  END IF;

  -- Transfers out (origem = bookmaker)
  IF v_is_usd THEN
    SELECT COALESCE(SUM(COALESCE(cl.valor_usd, cl.valor)), 0)
      INTO v_transferencias_saida
    FROM public.cash_ledger cl
    WHERE cl.origem_bookmaker_id = p_bookmaker_id
      AND UPPER(cl.status) = 'CONFIRMADO'
      AND UPPER(cl.tipo_transacao) = 'TRANSFERENCIA';
  ELSE
    SELECT COALESCE(SUM(cl.valor), 0)
      INTO v_transferencias_saida
    FROM public.cash_ledger cl
    WHERE cl.origem_bookmaker_id = p_bookmaker_id
      AND UPPER(cl.status) = 'CONFIRMADO'
      AND UPPER(cl.tipo_transacao) = 'TRANSFERENCIA';
  END IF;

  -- =====================================================
  -- CORREÇÃO PRINCIPAL: Bets P/L incluindo pernas JSONB
  -- =====================================================
  
  -- 1. Apostas diretas (SIMPLES, MULTIPLA, etc. com bookmaker_id direto)
  SELECT COALESCE(SUM(au.lucro_prejuizo), 0)
    INTO v_lucro_apostas
  FROM public.apostas_unificada au
  WHERE au.bookmaker_id = p_bookmaker_id
    AND au.resultado IS NOT NULL
    AND au.status = 'LIQUIDADA';

  -- 2. Pernas de SUREBET/ARBITRAGEM (lucro armazenado em pernas JSONB)
  SELECT COALESCE(SUM((perna->>'lucro_prejuizo')::numeric), 0)
    INTO v_lucro_pernas
  FROM public.apostas_unificada a
  CROSS JOIN LATERAL jsonb_array_elements(a.pernas) AS perna
  WHERE a.pernas IS NOT NULL
    AND a.status = 'LIQUIDADA'
    AND a.estrategia IN ('SUREBET', 'ARBITRAGEM')
    AND (perna->>'bookmaker_id')::uuid = p_bookmaker_id;

  -- Soma total do lucro de apostas
  v_lucro_apostas := v_lucro_apostas + v_lucro_pernas;

  -- Cashback
  SELECT COALESCE(SUM(cm.valor), 0)
    INTO v_cashback
  FROM public.cashback_manual cm
  WHERE cm.bookmaker_id = p_bookmaker_id;

  -- Free spins from cash_ledger
  IF v_is_usd THEN
    SELECT COALESCE(SUM(COALESCE(cl.valor_usd, cl.valor)), 0)
      INTO v_giros_gratis
    FROM public.cash_ledger cl
    WHERE cl.destino_bookmaker_id = p_bookmaker_id
      AND UPPER(cl.status) = 'CONFIRMADO'
      AND cl.evento_promocional_tipo = 'GIRO_GRATIS';
  ELSE
    SELECT COALESCE(SUM(cl.valor), 0)
      INTO v_giros_gratis
    FROM public.cash_ledger cl
    WHERE cl.destino_bookmaker_id = p_bookmaker_id
      AND UPPER(cl.status) = 'CONFIRMADO'
      AND cl.evento_promocional_tipo = 'GIRO_GRATIS';
  END IF;

  -- Credited bonuses: soma o valor_creditado_no_saldo (parte que foi para saldo real)
  -- Nota: bônus que já foram migrados para saldo unificado usam valor_creditado_no_saldo
  SELECT COALESCE(SUM(COALESCE(pb.valor_creditado_no_saldo, 0)), 0)
    INTO v_bonus_creditado
  FROM public.project_bookmaker_link_bonuses pb
  WHERE pb.bookmaker_id = p_bookmaker_id
    AND pb.status = 'credited'
    AND pb.migrado_para_saldo_unificado = true;

  -- Calculate expected balance
  v_saldo_calculado := v_depositos 
                     - v_saques 
                     + v_transferencias_entrada 
                     - v_transferencias_saida 
                     + v_lucro_apostas 
                     + v_cashback 
                     + v_giros_gratis 
                     + v_bonus_creditado;

  -- Return results
  RETURN QUERY SELECT
    p_bookmaker_id,
    v_nome,
    v_moeda,
    v_saldo_anterior,
    v_saldo_calculado,
    v_saldo_calculado - v_saldo_anterior,
    v_depositos,
    v_saques,
    v_transferencias_entrada,
    v_transferencias_saida,
    v_lucro_apostas,
    v_cashback,
    v_giros_gratis,
    v_bonus_creditado;
END;
$function$;
