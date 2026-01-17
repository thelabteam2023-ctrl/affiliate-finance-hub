
-- Primeiro dropar a função existente e recriar com a correção
DROP FUNCTION IF EXISTS public.recalcular_saldo_bookmaker(uuid);

CREATE FUNCTION public.recalcular_saldo_bookmaker(p_bookmaker_id uuid)
RETURNS TABLE(
  bookmaker_id uuid,
  nome text,
  moeda text,
  saldo_anterior numeric,
  depositos numeric,
  saques numeric,
  transferencias_entrada numeric,
  transferencias_saida numeric,
  bonus_creditado numeric,
  lucro_apostas numeric,
  cashback numeric,
  giros_gratis numeric,
  saldo_calculado numeric,
  diferenca numeric
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_depositos numeric := 0;
  v_saques numeric := 0;
  v_transferencias_entrada numeric := 0;
  v_transferencias_saida numeric := 0;
  v_bonus_creditado numeric := 0;
  v_lucro_apostas numeric := 0;
  v_lucro_apostas_pernas numeric := 0;
  v_cashback numeric := 0;
  v_giros_gratis numeric := 0;
  v_saldo_atual numeric := 0;
  v_nome text;
  v_moeda text;
BEGIN
  -- Buscar dados do bookmaker
  SELECT b.nome, b.moeda, b.saldo_atual
  INTO v_nome, v_moeda, v_saldo_atual
  FROM bookmakers b
  WHERE b.id = p_bookmaker_id;

  IF v_nome IS NULL THEN
    RETURN;
  END IF;

  -- Depósitos confirmados
  SELECT COALESCE(SUM(valor), 0)
  INTO v_depositos
  FROM cash_ledger
  WHERE destino_bookmaker_id = p_bookmaker_id
    AND tipo_transacao = 'DEPOSITO'
    AND UPPER(status) = 'CONFIRMADO';

  -- Saques confirmados
  SELECT COALESCE(SUM(valor), 0)
  INTO v_saques
  FROM cash_ledger
  WHERE origem_bookmaker_id = p_bookmaker_id
    AND tipo_transacao = 'SAQUE'
    AND UPPER(status) = 'CONFIRMADO';

  -- Transferências de entrada
  SELECT COALESCE(SUM(valor), 0)
  INTO v_transferencias_entrada
  FROM cash_ledger
  WHERE destino_bookmaker_id = p_bookmaker_id
    AND tipo_transacao = 'TRANSFERENCIA_INTERNA'
    AND UPPER(status) = 'CONFIRMADO';

  -- Transferências de saída
  SELECT COALESCE(SUM(valor), 0)
  INTO v_transferencias_saida
  FROM cash_ledger
  WHERE origem_bookmaker_id = p_bookmaker_id
    AND tipo_transacao = 'TRANSFERENCIA_INTERNA'
    AND UPPER(status) = 'CONFIRMADO';

  -- CORREÇÃO: Usar bonus_amount (valor original do bônus) ao invés de valor_creditado_no_saldo
  SELECT COALESCE(SUM(bonus_amount), 0)
  INTO v_bonus_creditado
  FROM project_bookmaker_link_bonuses
  WHERE bookmaker_id = p_bookmaker_id
    AND status = 'credited';

  -- Lucro/prejuízo de apostas diretas (bookmaker_id na aposta)
  SELECT COALESCE(SUM(lucro_prejuizo), 0)
  INTO v_lucro_apostas
  FROM apostas_unificada
  WHERE bookmaker_id = p_bookmaker_id
    AND UPPER(status) = 'LIQUIDADA'
    AND lucro_prejuizo IS NOT NULL;

  -- Lucro/prejuízo de apostas via pernas JSONB
  SELECT COALESCE(SUM((perna->>'lucro_prejuizo')::numeric), 0)
  INTO v_lucro_apostas_pernas
  FROM apostas_unificada a,
       jsonb_array_elements(a.pernas) AS perna
  WHERE UPPER(a.status) = 'LIQUIDADA'
    AND a.pernas IS NOT NULL
    AND perna->>'bookmaker_id' = p_bookmaker_id::text;

  -- Somar lucro direto + lucro pernas
  v_lucro_apostas := v_lucro_apostas + v_lucro_apostas_pernas;

  -- Cashback manual
  SELECT COALESCE(SUM(valor), 0)
  INTO v_cashback
  FROM cashback_manual
  WHERE bookmaker_id = p_bookmaker_id;

  -- Giros grátis
  SELECT COALESCE(SUM(valor_ganho), 0)
  INTO v_giros_gratis
  FROM giros_gratis
  WHERE bookmaker_id = p_bookmaker_id
    AND convertido = true;

  RETURN QUERY SELECT
    p_bookmaker_id,
    v_nome,
    v_moeda,
    v_saldo_atual,
    v_depositos,
    v_saques,
    v_transferencias_entrada,
    v_transferencias_saida,
    v_bonus_creditado,
    v_lucro_apostas,
    v_cashback,
    v_giros_gratis,
    (v_depositos - v_saques + v_transferencias_entrada - v_transferencias_saida + v_bonus_creditado + v_lucro_apostas + v_cashback + v_giros_gratis),
    (v_saldo_atual - (v_depositos - v_saques + v_transferencias_entrada - v_transferencias_saida + v_bonus_creditado + v_lucro_apostas + v_cashback + v_giros_gratis));
END;
$$;
