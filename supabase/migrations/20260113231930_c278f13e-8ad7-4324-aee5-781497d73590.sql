
-- ============================================
-- FIX: Dropar funções antigas e recriar com novos campos
-- Incluir cashback_manual e giros_gratis no cálculo
-- ============================================

-- Dropar função dependente primeiro
DROP FUNCTION IF EXISTS public.recalcular_saldos_projeto(uuid, boolean);
-- Dropar função base
DROP FUNCTION IF EXISTS public.recalcular_saldo_bookmaker(uuid);

-- ============================================
-- Recriar RPC recalcular_saldo_bookmaker
-- ============================================
CREATE OR REPLACE FUNCTION public.recalcular_saldo_bookmaker(p_bookmaker_id uuid)
 RETURNS TABLE(
   bookmaker_id uuid, 
   nome text, 
   saldo_anterior numeric, 
   depositos numeric, 
   saques numeric, 
   transferencias_entrada numeric, 
   transferencias_saida numeric, 
   lucro_apostas numeric,
   cashback numeric,
   giros_gratis numeric,
   saldo_calculado numeric, 
   diferenca numeric
 )
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_depositos NUMERIC := 0;
  v_saques NUMERIC := 0;
  v_transf_entrada NUMERIC := 0;
  v_transf_saida NUMERIC := 0;
  v_lucro_apostas NUMERIC := 0;
  v_cashback NUMERIC := 0;
  v_giros_gratis NUMERIC := 0;
  v_saldo_anterior NUMERIC := 0;
  v_saldo_calculado NUMERIC := 0;
  v_nome TEXT;
BEGIN
  -- Buscar dados do bookmaker
  SELECT b.nome, b.saldo_atual 
  INTO v_nome, v_saldo_anterior
  FROM bookmakers b 
  WHERE b.id = p_bookmaker_id;
  
  IF v_nome IS NULL THEN
    RAISE EXCEPTION 'Bookmaker não encontrado: %', p_bookmaker_id;
  END IF;

  -- Calcular depósitos
  SELECT COALESCE(SUM(cl.valor), 0) INTO v_depositos
  FROM cash_ledger cl
  WHERE cl.destino_bookmaker_id = p_bookmaker_id
    AND cl.tipo_transacao = 'DEPOSITO'
    AND cl.status = 'CONFIRMADO';

  -- Calcular saques
  SELECT COALESCE(SUM(cl.valor), 0) INTO v_saques
  FROM cash_ledger cl
  WHERE cl.origem_bookmaker_id = p_bookmaker_id
    AND cl.tipo_transacao = 'SAQUE'
    AND cl.status = 'CONFIRMADO';

  -- Calcular transferências entrada
  SELECT COALESCE(SUM(COALESCE(cl.valor_destino, cl.valor)), 0) INTO v_transf_entrada
  FROM cash_ledger cl
  WHERE cl.destino_bookmaker_id = p_bookmaker_id
    AND cl.tipo_transacao = 'TRANSFERENCIA'
    AND cl.status = 'CONFIRMADO';

  -- Calcular transferências saída
  SELECT COALESCE(SUM(COALESCE(cl.valor_origem, cl.valor)), 0) INTO v_transf_saida
  FROM cash_ledger cl
  WHERE cl.origem_bookmaker_id = p_bookmaker_id
    AND cl.tipo_transacao = 'TRANSFERENCIA'
    AND cl.status = 'CONFIRMADO';

  -- Calcular lucro/prejuízo de apostas liquidadas
  SELECT COALESCE(SUM(a.lucro_prejuizo), 0) INTO v_lucro_apostas
  FROM apostas_unificada a
  WHERE a.bookmaker_id = p_bookmaker_id
    AND a.status = 'LIQUIDADA'
    AND a.cancelled_at IS NULL;

  -- NOVO: Calcular cashback manual (soma de todos os valores creditados)
  SELECT COALESCE(SUM(cm.valor), 0) INTO v_cashback
  FROM cashback_manual cm
  WHERE cm.bookmaker_id = p_bookmaker_id;

  -- NOVO: Calcular giros grátis confirmados (valor_retorno já creditado)
  SELECT COALESCE(SUM(gg.valor_retorno), 0) INTO v_giros_gratis
  FROM giros_gratis gg
  WHERE gg.bookmaker_id = p_bookmaker_id
    AND gg.status = 'confirmado'
    AND gg.valor_retorno IS NOT NULL;

  -- Calcular saldo (AGORA com cashback e giros grátis)
  v_saldo_calculado := v_depositos 
                       - v_saques 
                       + v_transf_entrada 
                       - v_transf_saida 
                       + v_lucro_apostas
                       + v_cashback
                       + v_giros_gratis;

  RETURN QUERY SELECT 
    p_bookmaker_id,
    v_nome,
    v_saldo_anterior,
    v_depositos,
    v_saques,
    v_transf_entrada,
    v_transf_saida,
    v_lucro_apostas,
    v_cashback,
    v_giros_gratis,
    v_saldo_calculado,
    v_saldo_anterior - v_saldo_calculado;
END;
$function$;

-- ============================================
-- Recriar RPC recalcular_saldos_projeto
-- ============================================
CREATE OR REPLACE FUNCTION public.recalcular_saldos_projeto(p_projeto_id uuid, p_aplicar boolean DEFAULT false)
 RETURNS TABLE(
   bookmaker_id uuid, 
   nome text, 
   saldo_anterior numeric, 
   depositos numeric, 
   saques numeric, 
   transferencias_entrada numeric, 
   transferencias_saida numeric, 
   lucro_apostas numeric,
   cashback numeric,
   giros_gratis numeric,
   saldo_calculado numeric, 
   diferenca numeric, 
   atualizado boolean
 )
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_bookmaker RECORD;
  v_resultado RECORD;
BEGIN
  FOR v_bookmaker IN 
    SELECT b.id FROM bookmakers b WHERE b.projeto_id = p_projeto_id
  LOOP
    SELECT * INTO v_resultado FROM recalcular_saldo_bookmaker(v_bookmaker.id);
    
    -- Se aplicar = true, atualiza o saldo
    IF p_aplicar AND v_resultado.diferenca <> 0 THEN
      UPDATE bookmakers 
      SET saldo_atual = v_resultado.saldo_calculado,
          updated_at = NOW()
      WHERE id = v_bookmaker.id;
      
      -- Registrar no audit
      INSERT INTO bookmaker_balance_audit (
        bookmaker_id, workspace_id, saldo_anterior, saldo_novo, 
        diferenca, origem, observacoes
      )
      SELECT 
        v_bookmaker.id,
        b.workspace_id,
        v_resultado.saldo_anterior,
        v_resultado.saldo_calculado,
        v_resultado.diferenca,
        'RECALCULO_SISTEMA',
        format('Recálculo: dep=%s saq=%s transf+=%s transf-=%s apostas=%s cashback=%s giros=%s',
          v_resultado.depositos, v_resultado.saques, 
          v_resultado.transferencias_entrada, v_resultado.transferencias_saida,
          v_resultado.lucro_apostas, v_resultado.cashback, v_resultado.giros_gratis)
      FROM bookmakers b WHERE b.id = v_bookmaker.id;
    END IF;
    
    RETURN QUERY SELECT 
      v_resultado.bookmaker_id,
      v_resultado.nome,
      v_resultado.saldo_anterior,
      v_resultado.depositos,
      v_resultado.saques,
      v_resultado.transferencias_entrada,
      v_resultado.transferencias_saida,
      v_resultado.lucro_apostas,
      v_resultado.cashback,
      v_resultado.giros_gratis,
      v_resultado.saldo_calculado,
      v_resultado.diferenca,
      p_aplicar AND v_resultado.diferenca <> 0;
  END LOOP;
END;
$function$;

-- ============================================
-- COMENTÁRIOS
-- ============================================
COMMENT ON FUNCTION public.recalcular_saldo_bookmaker IS 
'Recalcula o saldo de um bookmaker baseado em: depósitos - saques + transferências + lucro_apostas + cashback + giros_gratis';

COMMENT ON FUNCTION public.recalcular_saldos_projeto IS 
'Recalcula saldos de todos os bookmakers de um projeto, opcionalmente aplicando as correções';
