-- ============================================================================
-- MIGRAÇÃO: Sistema Waterfall Híbrido de Saldo
-- Bônus = automático | Freebet = opcional | Real = residual
-- ============================================================================

-- 1. ADICIONAR COLUNA saldo_bonus EM bookmakers (se não existir)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'bookmakers' 
    AND column_name = 'saldo_bonus'
  ) THEN
    ALTER TABLE public.bookmakers ADD COLUMN saldo_bonus NUMERIC DEFAULT 0;
    COMMENT ON COLUMN public.bookmakers.saldo_bonus IS 'Saldo de bônus ativo - consumido automaticamente antes do saldo real';
  END IF;
END $$;

-- 2. ADICIONAR CAMPOS DE BREAKDOWN NO LEDGER (rastrear origem dos débitos)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'cash_ledger' 
    AND column_name = 'debito_bonus'
  ) THEN
    ALTER TABLE public.cash_ledger ADD COLUMN debito_bonus NUMERIC DEFAULT 0;
    ALTER TABLE public.cash_ledger ADD COLUMN debito_freebet NUMERIC DEFAULT 0;
    ALTER TABLE public.cash_ledger ADD COLUMN debito_real NUMERIC DEFAULT 0;
    ALTER TABLE public.cash_ledger ADD COLUMN usar_freebet BOOLEAN DEFAULT false;
    
    COMMENT ON COLUMN public.cash_ledger.debito_bonus IS 'Quanto foi debitado do saldo_bonus nesta transação';
    COMMENT ON COLUMN public.cash_ledger.debito_freebet IS 'Quanto foi debitado do saldo_freebet nesta transação';
    COMMENT ON COLUMN public.cash_ledger.debito_real IS 'Quanto foi debitado do saldo_atual nesta transação';
    COMMENT ON COLUMN public.cash_ledger.usar_freebet IS 'Se o usuário optou por usar freebet nesta aposta';
  END IF;
END $$;

-- 3. ADICIONAR CAMPO usar_freebet EM apostas_unificada
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'apostas_unificada' 
    AND column_name = 'usar_freebet'
  ) THEN
    ALTER TABLE public.apostas_unificada ADD COLUMN usar_freebet BOOLEAN DEFAULT false;
    COMMENT ON COLUMN public.apostas_unificada.usar_freebet IS 'Toggle do usuário: usar saldo de freebet nesta aposta';
  END IF;
END $$;

-- 4. CRIAR FUNÇÃO calcular_debito_waterfall
-- Calcula automaticamente quanto sai de cada pool
CREATE OR REPLACE FUNCTION public.calcular_debito_waterfall(
  p_bookmaker_id UUID,
  p_stake NUMERIC,
  p_usar_freebet BOOLEAN DEFAULT false
)
RETURNS TABLE(
  debito_bonus NUMERIC,
  debito_freebet NUMERIC,
  debito_real NUMERIC,
  saldo_bonus_disponivel NUMERIC,
  saldo_freebet_disponivel NUMERIC,
  saldo_real_disponivel NUMERIC,
  stake_coberto BOOLEAN
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_saldo_bonus NUMERIC;
  v_saldo_freebet NUMERIC;
  v_saldo_real NUMERIC;
  v_restante NUMERIC;
  v_debito_bonus NUMERIC := 0;
  v_debito_freebet NUMERIC := 0;
  v_debito_real NUMERIC := 0;
BEGIN
  -- Buscar saldos atuais
  SELECT 
    COALESCE(b.saldo_bonus, 0),
    COALESCE(b.saldo_freebet, 0),
    COALESCE(b.saldo_atual, 0)
  INTO v_saldo_bonus, v_saldo_freebet, v_saldo_real
  FROM bookmakers b
  WHERE b.id = p_bookmaker_id;
  
  IF NOT FOUND THEN
    RETURN QUERY SELECT 
      0::NUMERIC, 0::NUMERIC, 0::NUMERIC,
      0::NUMERIC, 0::NUMERIC, 0::NUMERIC,
      false;
    RETURN;
  END IF;
  
  v_restante := p_stake;
  
  -- PASSO 1: Debitar BONUS primeiro (SEMPRE automático)
  IF v_saldo_bonus > 0 AND v_restante > 0 THEN
    v_debito_bonus := LEAST(v_saldo_bonus, v_restante);
    v_restante := v_restante - v_debito_bonus;
  END IF;
  
  -- PASSO 2: Debitar FREEBET (APENAS se toggle ativo)
  IF p_usar_freebet AND v_saldo_freebet > 0 AND v_restante > 0 THEN
    v_debito_freebet := LEAST(v_saldo_freebet, v_restante);
    v_restante := v_restante - v_debito_freebet;
  END IF;
  
  -- PASSO 3: Debitar REAL (restante)
  IF v_restante > 0 THEN
    v_debito_real := LEAST(v_saldo_real, v_restante);
    v_restante := v_restante - v_debito_real;
  END IF;
  
  RETURN QUERY SELECT 
    v_debito_bonus,
    v_debito_freebet,
    v_debito_real,
    v_saldo_bonus,
    v_saldo_freebet,
    v_saldo_real,
    (v_restante = 0); -- stake_coberto = true se restante = 0
END;
$$;

COMMENT ON FUNCTION public.calcular_debito_waterfall IS 
'Calcula distribuição automática de débito: BONUS (auto) → FREEBET (se toggle) → REAL';

-- 5. CRIAR FUNÇÃO processar_debito_waterfall (executa os débitos)
CREATE OR REPLACE FUNCTION public.processar_debito_waterfall(
  p_bookmaker_id UUID,
  p_stake NUMERIC,
  p_usar_freebet BOOLEAN,
  p_workspace_id UUID,
  p_user_id UUID,
  p_aposta_id UUID DEFAULT NULL
)
RETURNS TABLE(
  success BOOLEAN,
  debito_bonus NUMERIC,
  debito_freebet NUMERIC,
  debito_real NUMERIC,
  error_message TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_calc RECORD;
  v_saldo_anterior_bonus NUMERIC;
  v_saldo_anterior_freebet NUMERIC;
  v_saldo_anterior_real NUMERIC;
BEGIN
  -- Calcular distribuição
  SELECT * INTO v_calc
  FROM calcular_debito_waterfall(p_bookmaker_id, p_stake, p_usar_freebet);
  
  -- Verificar se stake está coberto
  IF NOT v_calc.stake_coberto THEN
    RETURN QUERY SELECT 
      false,
      0::NUMERIC,
      0::NUMERIC,
      0::NUMERIC,
      'SALDO_INSUFICIENTE: stake excede saldo operável'::TEXT;
    RETURN;
  END IF;
  
  -- Buscar saldos anteriores para auditoria
  SELECT saldo_bonus, saldo_freebet, saldo_atual
  INTO v_saldo_anterior_bonus, v_saldo_anterior_freebet, v_saldo_anterior_real
  FROM bookmakers
  WHERE id = p_bookmaker_id
  FOR UPDATE;
  
  -- Executar débitos atômicos
  UPDATE bookmakers
  SET 
    saldo_bonus = COALESCE(saldo_bonus, 0) - v_calc.debito_bonus,
    saldo_freebet = COALESCE(saldo_freebet, 0) - v_calc.debito_freebet,
    saldo_atual = saldo_atual - v_calc.debito_real,
    updated_at = NOW()
  WHERE id = p_bookmaker_id;
  
  -- Registrar auditoria
  INSERT INTO bookmaker_balance_audit (
    bookmaker_id, workspace_id, user_id, origem,
    saldo_anterior, saldo_novo, diferenca, observacoes, referencia_id, referencia_tipo
  ) VALUES (
    p_bookmaker_id, p_workspace_id, p_user_id, 'APOSTA_WATERFALL',
    v_saldo_anterior_real, v_saldo_anterior_real - v_calc.debito_real,
    -v_calc.debito_real,
    FORMAT('Waterfall: bonus=-%s, freebet=-%s, real=-%s', 
           v_calc.debito_bonus, v_calc.debito_freebet, v_calc.debito_real),
    p_aposta_id, 'APOSTA'
  );
  
  RETURN QUERY SELECT 
    true,
    v_calc.debito_bonus,
    v_calc.debito_freebet,
    v_calc.debito_real,
    NULL::TEXT;
END;
$$;

-- 6. CRIAR FUNÇÃO processar_credito_ganho (lucro sempre vai para saldo_real)
CREATE OR REPLACE FUNCTION public.processar_credito_ganho(
  p_bookmaker_id UUID,
  p_lucro NUMERIC,
  p_debito_bonus NUMERIC,
  p_debito_freebet NUMERIC,
  p_debito_real NUMERIC,
  p_workspace_id UUID,
  p_user_id UUID,
  p_aposta_id UUID DEFAULT NULL
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_retorno_total NUMERIC;
  v_saldo_anterior NUMERIC;
BEGIN
  -- Calcular retorno total
  -- Bônus e Freebet: apenas lucro retorna
  -- Real: stake + lucro retorna
  v_retorno_total := p_lucro + p_debito_real; -- lucro + stake real devolvido
  
  -- Buscar saldo anterior
  SELECT saldo_atual INTO v_saldo_anterior
  FROM bookmakers
  WHERE id = p_bookmaker_id
  FOR UPDATE;
  
  -- Creditar no saldo real
  UPDATE bookmakers
  SET 
    saldo_atual = saldo_atual + v_retorno_total,
    updated_at = NOW()
  WHERE id = p_bookmaker_id;
  
  -- Auditoria
  INSERT INTO bookmaker_balance_audit (
    bookmaker_id, workspace_id, user_id, origem,
    saldo_anterior, saldo_novo, diferenca, observacoes, referencia_id, referencia_tipo
  ) VALUES (
    p_bookmaker_id, p_workspace_id, p_user_id, 'APOSTA_GREEN_WATERFALL',
    v_saldo_anterior, v_saldo_anterior + v_retorno_total,
    v_retorno_total,
    FORMAT('GREEN: lucro=%s, stake_real_devolvido=%s, total=%s (bonus=%s e freebet=%s consumidos)', 
           p_lucro, p_debito_real, v_retorno_total, p_debito_bonus, p_debito_freebet),
    p_aposta_id, 'APOSTA'
  );
  
  RETURN true;
END;
$$;

-- 7. ATUALIZAR criar_aposta_atomica PARA USAR WATERFALL
CREATE OR REPLACE FUNCTION public.criar_aposta_atomica_v2(
  p_projeto_id UUID,
  p_workspace_id UUID,
  p_user_id UUID,
  p_bookmaker_id UUID,
  p_stake NUMERIC,
  p_odd NUMERIC,
  p_usar_freebet BOOLEAN DEFAULT false,
  p_evento TEXT DEFAULT NULL,
  p_esporte TEXT DEFAULT NULL,
  p_mercado TEXT DEFAULT NULL,
  p_selecao TEXT DEFAULT NULL,
  p_data_aposta TIMESTAMPTZ DEFAULT NOW(),
  p_estrategia TEXT DEFAULT 'PUNTER',
  p_forma_registro TEXT DEFAULT 'SIMPLES',
  p_observacoes TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_debito RECORD;
  v_aposta_id UUID;
  v_fonte_saldo TEXT;
BEGIN
  -- Validar bookmaker ativo/limitada
  IF NOT EXISTS (
    SELECT 1 FROM bookmakers 
    WHERE id = p_bookmaker_id 
    AND UPPER(status) IN ('ATIVO', 'LIMITADA')
    AND (projeto_id = p_projeto_id OR workspace_id = p_workspace_id)
  ) THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'BOOKMAKER_INVALIDA'
    );
  END IF;
  
  -- Processar débito waterfall
  SELECT * INTO v_debito
  FROM processar_debito_waterfall(
    p_bookmaker_id, p_stake, p_usar_freebet, 
    p_workspace_id, p_user_id
  );
  
  IF NOT v_debito.success THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', v_debito.error_message
    );
  END IF;
  
  -- Determinar fonte_saldo principal (para compatibilidade)
  IF v_debito.debito_bonus > 0 THEN
    v_fonte_saldo := 'BONUS';
  ELSIF v_debito.debito_freebet > 0 THEN
    v_fonte_saldo := 'FREEBET';
  ELSE
    v_fonte_saldo := 'REAL';
  END IF;
  
  -- Criar aposta
  INSERT INTO apostas_unificada (
    projeto_id, workspace_id, user_id, bookmaker_id,
    stake, odd, data_aposta, evento, esporte, mercado, selecao,
    estrategia, forma_registro, observacoes,
    usar_freebet, fonte_saldo,
    stake_bonus, stake_real, status, contexto_operacional
  ) VALUES (
    p_projeto_id, p_workspace_id, p_user_id, p_bookmaker_id,
    p_stake, p_odd, p_data_aposta, p_evento, p_esporte, p_mercado, p_selecao,
    p_estrategia, p_forma_registro, p_observacoes,
    p_usar_freebet, v_fonte_saldo,
    v_debito.debito_bonus + v_debito.debito_freebet, -- stake não-real
    v_debito.debito_real, -- stake real
    'PENDENTE', 'NORMAL'
  )
  RETURNING id INTO v_aposta_id;
  
  -- Registrar ledger com breakdown
  INSERT INTO cash_ledger (
    workspace_id, user_id, tipo_transacao, status,
    origem_bookmaker_id, valor, moeda, data_transacao,
    debito_bonus, debito_freebet, debito_real, usar_freebet,
    impacta_caixa_operacional
  ) VALUES (
    p_workspace_id, p_user_id, 'APOSTA_STAKE', 'CONFIRMADO',
    p_bookmaker_id, p_stake, 
    (SELECT moeda FROM bookmakers WHERE id = p_bookmaker_id),
    p_data_aposta,
    v_debito.debito_bonus, v_debito.debito_freebet, v_debito.debito_real,
    p_usar_freebet, true
  );
  
  RETURN jsonb_build_object(
    'success', true,
    'aposta_id', v_aposta_id,
    'debito', jsonb_build_object(
      'bonus', v_debito.debito_bonus,
      'freebet', v_debito.debito_freebet,
      'real', v_debito.debito_real
    )
  );
END;
$$;

-- 8. ATUALIZAR liquidar_aposta_atomica PARA USAR WATERFALL
CREATE OR REPLACE FUNCTION public.liquidar_aposta_atomica_v2(
  p_aposta_id UUID,
  p_resultado TEXT,
  p_lucro_prejuizo NUMERIC DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_aposta RECORD;
  v_lucro_final NUMERIC;
  v_debito_bonus NUMERIC;
  v_debito_freebet NUMERIC;
  v_debito_real NUMERIC;
BEGIN
  -- Buscar aposta com lock
  SELECT * INTO v_aposta
  FROM apostas_unificada
  WHERE id = p_aposta_id
  FOR UPDATE;
  
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'APOSTA_NAO_ENCONTRADA');
  END IF;
  
  IF v_aposta.status = 'LIQUIDADA' THEN
    RETURN jsonb_build_object('success', false, 'error', 'APOSTA_JA_LIQUIDADA');
  END IF;
  
  -- Buscar breakdown do débito original do ledger
  SELECT 
    COALESCE(cl.debito_bonus, 0),
    COALESCE(cl.debito_freebet, 0),
    COALESCE(cl.debito_real, 0)
  INTO v_debito_bonus, v_debito_freebet, v_debito_real
  FROM cash_ledger cl
  WHERE cl.origem_bookmaker_id = v_aposta.bookmaker_id
    AND cl.tipo_transacao = 'APOSTA_STAKE'
    AND cl.workspace_id = v_aposta.workspace_id
    AND cl.created_at >= v_aposta.created_at - INTERVAL '1 minute'
  ORDER BY cl.created_at DESC
  LIMIT 1;
  
  -- Fallback para campos da aposta se ledger não encontrado
  IF v_debito_bonus IS NULL THEN
    v_debito_bonus := COALESCE(v_aposta.stake_bonus, 0);
    v_debito_real := COALESCE(v_aposta.stake_real, v_aposta.stake);
    v_debito_freebet := 0;
  END IF;
  
  -- Calcular lucro/prejuízo
  IF p_lucro_prejuizo IS NOT NULL THEN
    v_lucro_final := p_lucro_prejuizo;
  ELSIF p_resultado = 'GREEN' THEN
    v_lucro_final := v_aposta.stake * (v_aposta.odd - 1);
  ELSIF p_resultado = 'RED' THEN
    v_lucro_final := 0; -- Perda já foi debitada no waterfall
  ELSIF p_resultado IN ('VOID', 'REEMBOLSO') THEN
    v_lucro_final := 0;
    -- Devolver tudo que foi debitado
    UPDATE bookmakers
    SET 
      saldo_bonus = COALESCE(saldo_bonus, 0) + v_debito_bonus,
      saldo_freebet = COALESCE(saldo_freebet, 0) + v_debito_freebet,
      saldo_atual = saldo_atual + v_debito_real
    WHERE id = v_aposta.bookmaker_id;
  ELSIF p_resultado = 'MEIO_GREEN' THEN
    v_lucro_final := v_aposta.stake * (v_aposta.odd - 1) / 2;
  ELSIF p_resultado = 'MEIO_RED' THEN
    v_lucro_final := 0;
    -- Devolver metade
    UPDATE bookmakers
    SET 
      saldo_bonus = COALESCE(saldo_bonus, 0) + v_debito_bonus / 2,
      saldo_freebet = COALESCE(saldo_freebet, 0) + v_debito_freebet / 2,
      saldo_atual = saldo_atual + v_debito_real / 2
    WHERE id = v_aposta.bookmaker_id;
  ELSE
    v_lucro_final := 0;
  END IF;
  
  -- Processar ganho (se GREEN ou MEIO_GREEN)
  IF p_resultado IN ('GREEN', 'MEIO_GREEN') AND v_lucro_final > 0 THEN
    PERFORM processar_credito_ganho(
      v_aposta.bookmaker_id,
      v_lucro_final,
      v_debito_bonus, v_debito_freebet, v_debito_real,
      v_aposta.workspace_id, v_aposta.user_id, p_aposta_id
    );
  END IF;
  
  -- Atualizar status da aposta
  UPDATE apostas_unificada
  SET 
    status = 'LIQUIDADA',
    resultado = p_resultado,
    lucro_prejuizo = v_lucro_final,
    updated_at = NOW()
  WHERE id = p_aposta_id;
  
  -- Registrar ledger de liquidação
  IF p_resultado IN ('GREEN', 'MEIO_GREEN') THEN
    INSERT INTO cash_ledger (
      workspace_id, user_id, tipo_transacao, status,
      destino_bookmaker_id, valor, moeda, data_transacao,
      debito_bonus, debito_freebet, debito_real,
      impacta_caixa_operacional
    ) VALUES (
      v_aposta.workspace_id, v_aposta.user_id, 
      CASE WHEN p_resultado = 'GREEN' THEN 'APOSTA_GREEN' ELSE 'APOSTA_MEIO_GREEN' END,
      'CONFIRMADO',
      v_aposta.bookmaker_id, v_lucro_final + v_debito_real,
      (SELECT moeda FROM bookmakers WHERE id = v_aposta.bookmaker_id),
      NOW(),
      v_debito_bonus, v_debito_freebet, v_debito_real,
      true
    );
  END IF;
  
  RETURN jsonb_build_object(
    'success', true,
    'resultado', p_resultado,
    'lucro', v_lucro_final,
    'breakdown', jsonb_build_object(
      'bonus_consumido', v_debito_bonus,
      'freebet_consumido', v_debito_freebet,
      'real_consumido', v_debito_real
    )
  );
END;
$$;

-- 9. CRIAR VIEW PARA SALDO OPERÁVEL (UI)
CREATE OR REPLACE VIEW public.v_bookmaker_saldo_operavel AS
SELECT 
  b.id,
  b.nome,
  b.moeda,
  b.projeto_id,
  b.workspace_id,
  b.saldo_atual AS saldo_real,
  COALESCE(b.saldo_bonus, 0) AS saldo_bonus,
  COALESCE(b.saldo_freebet, 0) AS saldo_freebet,
  b.saldo_atual + COALESCE(b.saldo_bonus, 0) + COALESCE(b.saldo_freebet, 0) AS saldo_operavel,
  b.status
FROM bookmakers b
WHERE b.status IN ('ativo', 'limitada', 'ATIVO', 'LIMITADA');

COMMENT ON VIEW public.v_bookmaker_saldo_operavel IS 
'Saldo operável = real + bonus + freebet. UI mostra saldo_operavel, sistema debita via waterfall.';

-- 10. GRANT PERMISSIONS
GRANT EXECUTE ON FUNCTION public.calcular_debito_waterfall TO authenticated;
GRANT EXECUTE ON FUNCTION public.processar_debito_waterfall TO authenticated;
GRANT EXECUTE ON FUNCTION public.processar_credito_ganho TO authenticated;
GRANT EXECUTE ON FUNCTION public.criar_aposta_atomica_v2 TO authenticated;
GRANT EXECUTE ON FUNCTION public.liquidar_aposta_atomica_v2 TO authenticated;
GRANT SELECT ON public.v_bookmaker_saldo_operavel TO authenticated;