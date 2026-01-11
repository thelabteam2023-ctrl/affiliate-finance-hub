
-- ============================================
-- FUNÇÃO: Recalcular saldo de bookmakers
-- ============================================
-- Calcula o saldo correto baseado em:
-- 1. Depósitos recebidos (cash_ledger)
-- 2. Saques realizados (cash_ledger)
-- 3. Transferências entrada/saída (cash_ledger)
-- 4. Lucro/Prejuízo de apostas liquidadas (apostas_unificada)
-- ============================================

CREATE OR REPLACE FUNCTION public.recalcular_saldo_bookmaker(p_bookmaker_id UUID)
RETURNS TABLE (
  bookmaker_id UUID,
  nome TEXT,
  saldo_anterior NUMERIC,
  depositos NUMERIC,
  saques NUMERIC,
  transferencias_entrada NUMERIC,
  transferencias_saida NUMERIC,
  lucro_apostas NUMERIC,
  saldo_calculado NUMERIC,
  diferenca NUMERIC
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_depositos NUMERIC := 0;
  v_saques NUMERIC := 0;
  v_transf_entrada NUMERIC := 0;
  v_transf_saida NUMERIC := 0;
  v_lucro_apostas NUMERIC := 0;
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

  -- Calcular saldo
  v_saldo_calculado := v_depositos - v_saques + v_transf_entrada - v_transf_saida + v_lucro_apostas;

  RETURN QUERY SELECT 
    p_bookmaker_id,
    v_nome,
    v_saldo_anterior,
    v_depositos,
    v_saques,
    v_transf_entrada,
    v_transf_saida,
    v_lucro_apostas,
    v_saldo_calculado,
    v_saldo_anterior - v_saldo_calculado;
END;
$$;

-- ============================================
-- FUNÇÃO: Recalcular TODOS os bookmakers de um projeto
-- ============================================
CREATE OR REPLACE FUNCTION public.recalcular_saldos_projeto(p_projeto_id UUID, p_aplicar BOOLEAN DEFAULT FALSE)
RETURNS TABLE (
  bookmaker_id UUID,
  nome TEXT,
  saldo_anterior NUMERIC,
  depositos NUMERIC,
  saques NUMERIC,
  transferencias_entrada NUMERIC,
  transferencias_saida NUMERIC,
  lucro_apostas NUMERIC,
  saldo_calculado NUMERIC,
  diferenca NUMERIC,
  atualizado BOOLEAN
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
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
        'Recálculo automático de saldo baseado em cash_ledger e apostas'
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
      v_resultado.saldo_calculado,
      v_resultado.diferenca,
      p_aplicar AND v_resultado.diferenca <> 0;
  END LOOP;
END;
$$;

-- ============================================
-- FUNÇÃO: Recalcular TODOS os bookmakers do workspace
-- ============================================
CREATE OR REPLACE FUNCTION public.recalcular_saldos_workspace(p_workspace_id UUID, p_aplicar BOOLEAN DEFAULT FALSE)
RETURNS TABLE (
  bookmaker_id UUID,
  nome TEXT,
  saldo_anterior NUMERIC,
  saldo_calculado NUMERIC,
  diferenca NUMERIC,
  atualizado BOOLEAN
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_bookmaker RECORD;
  v_resultado RECORD;
BEGIN
  FOR v_bookmaker IN 
    SELECT b.id FROM bookmakers b WHERE b.workspace_id = p_workspace_id
  LOOP
    SELECT * INTO v_resultado FROM recalcular_saldo_bookmaker(v_bookmaker.id);
    
    IF p_aplicar AND v_resultado.diferenca <> 0 THEN
      UPDATE bookmakers 
      SET saldo_atual = v_resultado.saldo_calculado,
          updated_at = NOW()
      WHERE id = v_bookmaker.id;
      
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
        'Recálculo automático de saldo'
      FROM bookmakers b WHERE b.id = v_bookmaker.id;
    END IF;
    
    RETURN QUERY SELECT 
      v_resultado.bookmaker_id,
      v_resultado.nome,
      v_resultado.saldo_anterior,
      v_resultado.saldo_calculado,
      v_resultado.diferenca,
      p_aplicar AND v_resultado.diferenca <> 0;
  END LOOP;
END;
$$;

-- Comentários
COMMENT ON FUNCTION public.recalcular_saldo_bookmaker IS 'Recalcula o saldo de um bookmaker específico baseado em transações e apostas';
COMMENT ON FUNCTION public.recalcular_saldos_projeto IS 'Recalcula saldos de todos os bookmakers de um projeto. Use p_aplicar=true para salvar';
COMMENT ON FUNCTION public.recalcular_saldos_workspace IS 'Recalcula saldos de todos os bookmakers de um workspace. Use p_aplicar=true para salvar';
