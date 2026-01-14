-- =============================================================================
-- FIX: Adicionar moeda nativa do bookmaker ao cálculo de discrepância
-- Para vínculos USD, deve comparar USD vs USD, não converter para BRL
-- =============================================================================

DROP FUNCTION IF EXISTS public.recalcular_saldo_bookmaker(uuid);

CREATE OR REPLACE FUNCTION public.recalcular_saldo_bookmaker(p_bookmaker_id uuid)
RETURNS TABLE (
  bookmaker_id uuid,
  nome text,
  moeda text,
  saldo_anterior numeric,
  saldo_calculado numeric,
  diferenca numeric,
  depositos numeric,
  saques numeric,
  transferencias_entrada numeric,
  transferencias_saida numeric,
  lucro_apostas numeric,
  cashback numeric,
  giros_gratis numeric
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_depositos numeric := 0;
  v_saques numeric := 0;
  v_transferencias_entrada numeric := 0;
  v_transferencias_saida numeric := 0;
  v_lucro_apostas numeric := 0;
  v_cashback numeric := 0;
  v_giros_gratis numeric := 0;
  v_saldo_anterior numeric := 0;
  v_saldo_calculado numeric := 0;
  v_nome text;
  v_moeda text;
  v_is_usd boolean;
BEGIN
  -- Bookmaker current info including currency
  SELECT b.nome, b.moeda, b.saldo_atual
    INTO v_nome, v_moeda, v_saldo_anterior
  FROM public.bookmakers b
  WHERE b.id = p_bookmaker_id;

  IF v_nome IS NULL THEN
    RETURN;
  END IF;

  -- Check if bookmaker is USD-based (uses saldo_usd)
  v_is_usd := UPPER(v_moeda) IN ('USD', 'USDT', 'USDC');

  -- For USD bookmakers, we need to use valor_usd from cash_ledger when available
  -- For BRL bookmakers, use valor directly

  -- Deposits (destino = bookmaker)
  IF v_is_usd THEN
    -- For USD bookmakers: use valor_usd if available, otherwise valor
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

  -- Bets P/L - For USD bookmakers, check if there's a USD version
  -- apostas_unificada has lucro_prejuizo (in operation currency) 
  -- For USD bookmakers, the bet should have been in USD
  SELECT COALESCE(SUM(au.lucro_prejuizo), 0)
    INTO v_lucro_apostas
  FROM public.apostas_unificada au
  WHERE au.bookmaker_id = p_bookmaker_id
    AND au.resultado IS NOT NULL;

  -- Cashback - cashback_manual has valor in the bookmaker's currency
  SELECT COALESCE(SUM(cm.valor), 0)
    INTO v_cashback
  FROM public.cashback_manual cm
  WHERE cm.bookmaker_id = p_bookmaker_id;

  -- Giros grátis (usar valor_retorno) - in bookmaker's currency
  SELECT COALESCE(SUM(gg.valor_retorno), 0)
    INTO v_giros_gratis
  FROM public.giros_gratis gg
  WHERE gg.bookmaker_id = p_bookmaker_id;

  v_saldo_calculado := v_depositos - v_saques + v_transferencias_entrada - v_transferencias_saida + v_lucro_apostas + v_cashback + v_giros_gratis;

  RETURN QUERY
  SELECT
    p_bookmaker_id,
    v_nome,
    v_moeda,
    v_saldo_anterior,
    v_saldo_calculado,
    (v_saldo_anterior - v_saldo_calculado),
    v_depositos,
    v_saques,
    v_transferencias_entrada,
    v_transferencias_saida,
    v_lucro_apostas,
    v_cashback,
    v_giros_gratis;
END;
$$;


DROP FUNCTION IF EXISTS public.recalcular_saldos_projeto(uuid, boolean);

CREATE OR REPLACE FUNCTION public.recalcular_saldos_projeto(
  p_projeto_id uuid,
  p_aplicar boolean DEFAULT false
)
RETURNS TABLE (
  bookmaker_id uuid,
  nome text,
  moeda text,
  saldo_anterior numeric,
  saldo_calculado numeric,
  diferenca numeric,
  depositos numeric,
  saques numeric,
  transferencias_entrada numeric,
  transferencias_saida numeric,
  lucro_apostas numeric,
  cashback numeric,
  giros_gratis numeric,
  corrigido boolean
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  r RECORD;
  calc RECORD;
BEGIN
  FOR r IN
    SELECT b.id
    FROM public.bookmakers b
    WHERE b.projeto_id = p_projeto_id
  LOOP
    SELECT * INTO calc FROM public.recalcular_saldo_bookmaker(r.id);

    IF calc.bookmaker_id IS NOT NULL THEN
      IF p_aplicar AND ABS(calc.diferenca) > 0.01 THEN
        UPDATE public.bookmakers b
        SET saldo_atual = calc.saldo_calculado,
            updated_at = NOW()
        WHERE b.id = r.id;

        RETURN QUERY
        SELECT
          calc.bookmaker_id,
          calc.nome,
          calc.moeda,
          calc.saldo_anterior,
          calc.saldo_calculado,
          calc.diferenca,
          calc.depositos,
          calc.saques,
          calc.transferencias_entrada,
          calc.transferencias_saida,
          calc.lucro_apostas,
          calc.cashback,
          calc.giros_gratis,
          true;
      ELSE
        RETURN QUERY
        SELECT
          calc.bookmaker_id,
          calc.nome,
          calc.moeda,
          calc.saldo_anterior,
          calc.saldo_calculado,
          calc.diferenca,
          calc.depositos,
          calc.saques,
          calc.transferencias_entrada,
          calc.transferencias_saida,
          calc.lucro_apostas,
          calc.cashback,
          calc.giros_gratis,
          false;
      END IF;
    END IF;
  END LOOP;
END;
$$;