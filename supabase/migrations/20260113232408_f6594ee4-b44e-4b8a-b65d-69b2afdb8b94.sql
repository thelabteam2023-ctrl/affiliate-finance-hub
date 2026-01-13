
-- Drop and recreate the RPC to use case-insensitive status comparison
DROP FUNCTION IF EXISTS recalcular_saldo_bookmaker(uuid);

CREATE OR REPLACE FUNCTION recalcular_saldo_bookmaker(p_bookmaker_id uuid)
RETURNS TABLE (
  bookmaker_id uuid,
  nome text,
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
AS $$
DECLARE
  v_depositos numeric;
  v_saques numeric;
  v_transferencias_entrada numeric;
  v_transferencias_saida numeric;
  v_lucro_apostas numeric;
  v_cashback numeric;
  v_giros_gratis numeric;
  v_saldo_anterior numeric;
  v_saldo_calculado numeric;
  v_nome text;
BEGIN
  -- Get bookmaker current info
  SELECT b.nome, b.saldo_atual 
  INTO v_nome, v_saldo_anterior
  FROM bookmakers b 
  WHERE b.id = p_bookmaker_id;

  IF v_nome IS NULL THEN
    RETURN;
  END IF;

  -- Sum deposits (destino = bookmaker) - CASE INSENSITIVE
  SELECT COALESCE(SUM(valor), 0) INTO v_depositos
  FROM cash_ledger 
  WHERE destino_bookmaker_id = p_bookmaker_id 
    AND UPPER(status) = 'CONFIRMADO'
    AND tipo_transacao IN ('DEPOSITO', 'deposito');

  -- Sum withdrawals (origem = bookmaker) - CASE INSENSITIVE
  SELECT COALESCE(SUM(valor), 0) INTO v_saques
  FROM cash_ledger 
  WHERE origem_bookmaker_id = p_bookmaker_id 
    AND UPPER(status) = 'CONFIRMADO'
    AND tipo_transacao IN ('SAQUE', 'saque');

  -- Sum inbound transfers - CASE INSENSITIVE
  SELECT COALESCE(SUM(valor), 0) INTO v_transferencias_entrada
  FROM cash_ledger 
  WHERE destino_bookmaker_id = p_bookmaker_id 
    AND UPPER(status) = 'CONFIRMADO'
    AND UPPER(tipo_transacao) = 'TRANSFERENCIA';

  -- Sum outbound transfers - CASE INSENSITIVE
  SELECT COALESCE(SUM(valor), 0) INTO v_transferencias_saida
  FROM cash_ledger 
  WHERE origem_bookmaker_id = p_bookmaker_id 
    AND UPPER(status) = 'CONFIRMADO'
    AND UPPER(tipo_transacao) = 'TRANSFERENCIA';

  -- Sum P/L from bets
  SELECT COALESCE(SUM(lucro_prejuizo), 0) INTO v_lucro_apostas
  FROM apostas_unificada 
  WHERE bookmaker_id = p_bookmaker_id 
    AND resultado IS NOT NULL;

  -- Sum cashback
  SELECT COALESCE(SUM(valor), 0) INTO v_cashback
  FROM cashback_manual 
  WHERE bookmaker_id = p_bookmaker_id;

  -- Sum giros gratis (using valor_retorno)
  SELECT COALESCE(SUM(valor_retorno), 0) INTO v_giros_gratis
  FROM giros_gratis 
  WHERE bookmaker_id = p_bookmaker_id;

  -- Calculate expected balance
  v_saldo_calculado := v_depositos - v_saques + v_transferencias_entrada - v_transferencias_saida + v_lucro_apostas + v_cashback + v_giros_gratis;

  RETURN QUERY SELECT 
    p_bookmaker_id as bookmaker_id,
    v_nome as nome,
    v_saldo_anterior as saldo_anterior,
    v_saldo_calculado as saldo_calculado,
    (v_saldo_anterior - v_saldo_calculado) as diferenca,
    v_depositos as depositos,
    v_saques as saques,
    v_transferencias_entrada as transferencias_entrada,
    v_transferencias_saida as transferencias_saida,
    v_lucro_apostas as lucro_apostas,
    v_cashback as cashback,
    v_giros_gratis as giros_gratis;
END;
$$;

-- Also update the project-level RPC
DROP FUNCTION IF EXISTS recalcular_saldos_projeto(uuid, boolean);

CREATE OR REPLACE FUNCTION recalcular_saldos_projeto(p_projeto_id uuid, p_aplicar boolean DEFAULT false)
RETURNS TABLE (
  bookmaker_id uuid,
  nome text,
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
AS $$
DECLARE
  r RECORD;
  calc RECORD;
BEGIN
  FOR r IN 
    SELECT b.id 
    FROM bookmakers b 
    WHERE b.projeto_id = p_projeto_id
  LOOP
    SELECT * INTO calc FROM recalcular_saldo_bookmaker(r.id);
    
    IF calc.bookmaker_id IS NOT NULL THEN
      -- If p_aplicar is true and there's a difference, update the balance
      IF p_aplicar AND ABS(calc.diferenca) > 0.01 THEN
        UPDATE bookmakers 
        SET saldo_atual = calc.saldo_calculado,
            updated_at = NOW()
        WHERE id = r.id;
        
        RETURN QUERY SELECT 
          calc.bookmaker_id,
          calc.nome,
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
          true as corrigido;
      ELSE
        RETURN QUERY SELECT 
          calc.bookmaker_id,
          calc.nome,
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
          false as corrigido;
      END IF;
    END IF;
  END LOOP;
END;
$$;
