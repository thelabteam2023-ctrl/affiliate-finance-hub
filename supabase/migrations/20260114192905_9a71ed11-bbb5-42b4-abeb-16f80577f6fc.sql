-- Primeiro remover as funções existentes para poder alterar a assinatura
DROP FUNCTION IF EXISTS public.recalcular_saldos_projeto(uuid, boolean);
DROP FUNCTION IF EXISTS public.recalcular_saldo_bookmaker(uuid);

-- Recriar função recalcular_saldo_bookmaker COM bônus creditado
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
  giros_gratis numeric,
  bonus_creditado numeric
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
  v_bonus_creditado numeric := 0;
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

  -- Bets P/L
  SELECT COALESCE(SUM(au.lucro_prejuizo), 0)
    INTO v_lucro_apostas
  FROM public.apostas_unificada au
  WHERE au.bookmaker_id = p_bookmaker_id
    AND au.resultado IS NOT NULL;

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

  -- BÔNUS CREDITADO: soma dos bônus com status 'credited'
  SELECT COALESCE(SUM(pblb.bonus_amount), 0)
    INTO v_bonus_creditado
  FROM public.project_bookmaker_link_bonuses pblb
  WHERE pblb.bookmaker_id = p_bookmaker_id
    AND pblb.status = 'credited';

  -- Calculate expected balance INCLUDING bonus
  v_saldo_calculado := v_depositos 
                     - v_saques 
                     + v_transferencias_entrada 
                     - v_transferencias_saida 
                     + v_lucro_apostas 
                     + v_cashback 
                     + v_giros_gratis
                     + v_bonus_creditado;

  RETURN QUERY SELECT 
    p_bookmaker_id,
    v_nome,
    v_moeda,
    v_saldo_anterior,
    v_saldo_calculado,
    (v_saldo_anterior - v_saldo_calculado) as diferenca,
    v_depositos,
    v_saques,
    v_transferencias_entrada,
    v_transferencias_saida,
    v_lucro_apostas,
    v_cashback,
    v_giros_gratis,
    v_bonus_creditado;
END;
$$;

-- Recriar recalcular_saldos_projeto com bonus_creditado
CREATE OR REPLACE FUNCTION public.recalcular_saldos_projeto(p_projeto_id uuid, p_aplicar boolean DEFAULT false)
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
  bonus_creditado numeric
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_bookmaker_id uuid;
  v_result RECORD;
BEGIN
  FOR v_bookmaker_id IN 
    SELECT b.id
    FROM public.bookmakers b
    WHERE b.projeto_id = p_projeto_id
      AND b.status = 'ATIVO'
  LOOP
    SELECT * INTO v_result 
    FROM public.recalcular_saldo_bookmaker(v_bookmaker_id) r;
    
    IF v_result IS NOT NULL THEN
      IF p_aplicar AND ABS(v_result.diferenca) > 0.01 THEN
        UPDATE public.bookmakers
        SET saldo_atual = v_result.saldo_calculado,
            updated_at = now()
        WHERE id = v_bookmaker_id;
      END IF;
      
      RETURN QUERY SELECT 
        v_result.bookmaker_id,
        v_result.nome,
        v_result.moeda,
        v_result.saldo_anterior,
        v_result.saldo_calculado,
        v_result.diferenca,
        v_result.depositos,
        v_result.saques,
        v_result.transferencias_entrada,
        v_result.transferencias_saida,
        v_result.lucro_apostas,
        v_result.cashback,
        v_result.giros_gratis,
        v_result.bonus_creditado;
    END IF;
  END LOOP;
END;
$$;