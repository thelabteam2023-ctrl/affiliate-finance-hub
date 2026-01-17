
-- Corrigir ambiguidade usando alias nas tabelas
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
  SELECT bk.nome, bk.moeda, bk.saldo_atual
  INTO v_nome, v_moeda, v_saldo_atual
  FROM bookmakers bk
  WHERE bk.id = p_bookmaker_id;

  IF v_nome IS NULL THEN
    RETURN;
  END IF;

  -- Depósitos confirmados
  SELECT COALESCE(SUM(cl.valor), 0)
  INTO v_depositos
  FROM cash_ledger cl
  WHERE cl.destino_bookmaker_id = p_bookmaker_id
    AND cl.tipo_transacao = 'DEPOSITO'
    AND UPPER(cl.status) = 'CONFIRMADO';

  -- Saques confirmados
  SELECT COALESCE(SUM(cl.valor), 0)
  INTO v_saques
  FROM cash_ledger cl
  WHERE cl.origem_bookmaker_id = p_bookmaker_id
    AND cl.tipo_transacao = 'SAQUE'
    AND UPPER(cl.status) = 'CONFIRMADO';

  -- Transferências de entrada
  SELECT COALESCE(SUM(cl.valor), 0)
  INTO v_transferencias_entrada
  FROM cash_ledger cl
  WHERE cl.destino_bookmaker_id = p_bookmaker_id
    AND cl.tipo_transacao = 'TRANSFERENCIA_INTERNA'
    AND UPPER(cl.status) = 'CONFIRMADO';

  -- Transferências de saída
  SELECT COALESCE(SUM(cl.valor), 0)
  INTO v_transferencias_saida
  FROM cash_ledger cl
  WHERE cl.origem_bookmaker_id = p_bookmaker_id
    AND cl.tipo_transacao = 'TRANSFERENCIA_INTERNA'
    AND UPPER(cl.status) = 'CONFIRMADO';

  -- Bônus creditados (usando bonus_amount - valor original)
  SELECT COALESCE(SUM(pb.bonus_amount), 0)
  INTO v_bonus_creditado
  FROM project_bookmaker_link_bonuses pb
  WHERE pb.bookmaker_id = p_bookmaker_id
    AND pb.status = 'credited';

  -- Lucro/prejuízo de apostas diretas
  SELECT COALESCE(SUM(ap.lucro_prejuizo), 0)
  INTO v_lucro_apostas
  FROM apostas_unificada ap
  WHERE ap.bookmaker_id = p_bookmaker_id
    AND UPPER(ap.status) = 'LIQUIDADA'
    AND ap.lucro_prejuizo IS NOT NULL;

  -- Lucro/prejuízo de apostas via pernas JSONB
  SELECT COALESCE(SUM((perna->>'lucro_prejuizo')::numeric), 0)
  INTO v_lucro_apostas_pernas
  FROM apostas_unificada ap,
       jsonb_array_elements(ap.pernas) AS perna
  WHERE UPPER(ap.status) = 'LIQUIDADA'
    AND ap.pernas IS NOT NULL
    AND perna->>'bookmaker_id' = p_bookmaker_id::text;

  -- Somar lucro direto + lucro pernas
  v_lucro_apostas := v_lucro_apostas + v_lucro_apostas_pernas;

  -- Cashback manual
  SELECT COALESCE(SUM(cm.valor), 0)
  INTO v_cashback
  FROM cashback_manual cm
  WHERE cm.bookmaker_id = p_bookmaker_id;

  -- Giros grátis
  SELECT COALESCE(SUM(gg.valor_ganho), 0)
  INTO v_giros_gratis
  FROM giros_gratis gg
  WHERE gg.bookmaker_id = p_bookmaker_id
    AND gg.convertido = true;

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
