
-- ============================================================================
-- MOTOR FINANCEIRO v10 - CORREÇÃO DE IDEMPOTÊNCIA E RECONCILIAÇÃO
-- ============================================================================

-- ============================================================================
-- PARTE 1: CORRIGIR RPC reliquidar_aposta_v5 → v6
-- ============================================================================
CREATE OR REPLACE FUNCTION public.reliquidar_aposta_v6(
  p_aposta_id UUID,
  p_novo_resultado TEXT,
  p_lucro_prejuizo NUMERIC DEFAULT NULL
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public
AS $$
DECLARE
  v_aposta RECORD;
  v_resultado_anterior TEXT;
  v_stake NUMERIC;
  v_odd NUMERIC;
  v_novo_lucro NUMERIC;
  v_bookmaker_id UUID;
  v_workspace_id UUID;
  v_user_id UUID;
  v_usar_freebet BOOLEAN;
  v_tipo_uso TEXT;
  v_impacto_anterior NUMERIC;
  v_impacto_novo NUMERIC;
  v_diferenca NUMERIC;
  v_idempotency_key TEXT;
  v_moeda TEXT;
  v_evento_existente UUID;
BEGIN
  -- ========================================================
  -- ETAPA 1: Buscar e bloquear aposta
  -- ========================================================
  SELECT 
    au.id,
    au.resultado,
    au.lucro_prejuizo,
    au.stake,
    au.odd,
    au.bookmaker_id,
    au.workspace_id,
    au.user_id,
    COALESCE(au.usar_freebet, FALSE) as usar_freebet,
    COALESCE(au.fonte_saldo, 'REAL') as fonte_saldo,
    COALESCE(au.moeda_operacao, 'BRL') as moeda
  INTO v_aposta
  FROM apostas_unificada au
  WHERE au.id = p_aposta_id
  FOR UPDATE;
  
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Aposta não encontrada');
  END IF;
  
  -- ========================================================
  -- ETAPA 2: Validar e guardar valores
  -- ========================================================
  v_resultado_anterior := v_aposta.resultado;
  v_stake := COALESCE(v_aposta.stake, 0);
  v_odd := COALESCE(v_aposta.odd, 1);
  v_bookmaker_id := v_aposta.bookmaker_id;
  v_workspace_id := v_aposta.workspace_id;
  v_user_id := v_aposta.user_id;
  v_usar_freebet := v_aposta.usar_freebet;
  v_moeda := v_aposta.moeda;
  
  -- GUARD: Se resultado é o mesmo, retornar sem fazer nada
  IF v_resultado_anterior = p_novo_resultado THEN
    RETURN jsonb_build_object(
      'success', true, 
      'message', 'Resultado já é o mesmo, nenhuma alteração necessária',
      'resultado', p_novo_resultado
    );
  END IF;
  
  -- Determinar tipo_uso
  IF v_usar_freebet OR v_aposta.fonte_saldo = 'FREEBET' THEN
    v_tipo_uso := 'FREEBET';
  ELSE
    v_tipo_uso := 'NORMAL';
  END IF;
  
  -- ========================================================
  -- ETAPA 3: Calcular impacto financeiro (retorno - stake)
  -- ========================================================
  -- IMPACTO ANTERIOR: quanto o resultado anterior CREDITOU ao saldo
  v_impacto_anterior := CASE v_resultado_anterior
    WHEN 'GREEN' THEN v_stake * v_odd - v_stake  -- payout - stake = lucro
    WHEN 'MEIO_GREEN' THEN (v_stake * (1 + (v_odd - 1) / 2)) - v_stake  -- meio lucro
    WHEN 'VOID' THEN 0  -- stake retornado - stake = 0
    WHEN 'MEIO_RED' THEN -v_stake / 2  -- perdeu metade
    WHEN 'RED' THEN -v_stake  -- perdeu stake
    ELSE -v_stake  -- PENDENTE = stake debitado
  END;
  
  -- IMPACTO NOVO: quanto o novo resultado vai CREDITAR
  v_impacto_novo := CASE p_novo_resultado
    WHEN 'GREEN' THEN v_stake * v_odd - v_stake
    WHEN 'MEIO_GREEN' THEN (v_stake * (1 + (v_odd - 1) / 2)) - v_stake
    WHEN 'VOID' THEN 0
    WHEN 'MEIO_RED' THEN -v_stake / 2
    WHEN 'RED' THEN -v_stake
    ELSE -v_stake
  END;
  
  -- DIFERENÇA: quanto precisa ajustar no saldo
  v_diferenca := v_impacto_novo - v_impacto_anterior;
  
  -- Calcular lucro/prejuízo para registrar na aposta
  IF p_lucro_prejuizo IS NOT NULL THEN
    v_novo_lucro := p_lucro_prejuizo;
  ELSE
    v_novo_lucro := CASE p_novo_resultado
      WHEN 'GREEN' THEN v_stake * (v_odd - 1)
      WHEN 'MEIO_GREEN' THEN v_stake * (v_odd - 1) / 2
      WHEN 'VOID' THEN 0
      WHEN 'MEIO_RED' THEN -v_stake / 2
      WHEN 'RED' THEN -v_stake
      ELSE 0
    END;
  END IF;
  
  -- ========================================================
  -- ETAPA 4: Criar evento de AJUSTE (IDEMPOTENTE!)
  -- ========================================================
  -- REGRA DE OURO: Uma única key por combinação aposta+resultado_anterior+resultado_novo
  v_idempotency_key := 'reliq_' || p_aposta_id::TEXT || '_' || 
                       COALESCE(v_resultado_anterior, 'NULL') || '_to_' || p_novo_resultado;
  
  IF v_bookmaker_id IS NOT NULL AND v_diferenca <> 0 THEN
    -- Verificar se já existe evento com essa key
    SELECT id INTO v_evento_existente
    FROM financial_events
    WHERE idempotency_key = v_idempotency_key;
    
    IF v_evento_existente IS NULL THEN
      INSERT INTO financial_events (
        bookmaker_id,
        aposta_id,
        tipo_evento,
        tipo_uso,
        origem,
        valor,
        moeda,
        workspace_id,
        created_by,
        idempotency_key,
        metadata,
        processed_at
      ) VALUES (
        v_bookmaker_id,
        p_aposta_id,
        'AJUSTE',
        v_tipo_uso,
        'RELIQUIDACAO',
        v_diferenca,  -- Positivo = crédito, Negativo = débito
        v_moeda,
        v_workspace_id,
        v_user_id,
        v_idempotency_key,
        jsonb_build_object(
          'operacao', 'reliquidar_aposta_v6',
          'resultado_anterior', v_resultado_anterior,
          'resultado_novo', p_novo_resultado,
          'impacto_anterior', v_impacto_anterior,
          'impacto_novo', v_impacto_novo,
          'diferenca_aplicada', v_diferenca
        ),
        NOW()
      );
    END IF;
  END IF;
  
  -- ========================================================
  -- ETAPA 5: Atualizar aposta
  -- ========================================================
  UPDATE apostas_unificada
  SET 
    resultado = p_novo_resultado,
    lucro_prejuizo = v_novo_lucro,
    status = CASE WHEN p_novo_resultado IS NOT NULL THEN 'LIQUIDADA' ELSE status END,
    updated_at = NOW()
  WHERE id = p_aposta_id;
  
  RETURN jsonb_build_object(
    'success', true,
    'resultado_anterior', v_resultado_anterior,
    'resultado_novo', p_novo_resultado,
    'impacto_anterior', v_impacto_anterior,
    'impacto_novo', v_impacto_novo,
    'diferenca_aplicada', v_diferenca,
    'lucro_prejuizo', v_novo_lucro
  );
END;
$$;

-- ============================================================================
-- PARTE 2: FUNÇÃO DE RECONCILIAÇÃO FORÇADA
-- ============================================================================
CREATE OR REPLACE FUNCTION public.reconciliar_saldo_bookmaker(
  p_bookmaker_id UUID
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public
AS $$
DECLARE
  v_bookmaker RECORD;
  v_saldo_calculado NUMERIC;
  v_saldo_freebet_calculado NUMERIC;
  v_saldo_anterior NUMERIC;
  v_diferenca NUMERIC;
BEGIN
  -- Buscar bookmaker
  SELECT id, nome, saldo_atual, saldo_freebet, workspace_id
  INTO v_bookmaker
  FROM bookmakers
  WHERE id = p_bookmaker_id
  FOR UPDATE;
  
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Bookmaker não encontrado');
  END IF;
  
  v_saldo_anterior := v_bookmaker.saldo_atual;
  
  -- Calcular saldo correto a partir dos eventos
  SELECT 
    COALESCE(SUM(CASE WHEN tipo_uso = 'NORMAL' THEN valor ELSE 0 END), 0),
    COALESCE(SUM(CASE WHEN tipo_uso = 'FREEBET' THEN valor ELSE 0 END), 0)
  INTO v_saldo_calculado, v_saldo_freebet_calculado
  FROM financial_events
  WHERE bookmaker_id = p_bookmaker_id
    AND processed_at IS NOT NULL;
  
  v_diferenca := v_saldo_anterior - v_saldo_calculado;
  
  -- Atualizar saldo se houver diferença
  IF ABS(v_diferenca) > 0.001 THEN
    UPDATE bookmakers
    SET 
      saldo_atual = v_saldo_calculado,
      saldo_freebet = v_saldo_freebet_calculado,
      updated_at = NOW()
    WHERE id = p_bookmaker_id;
    
    -- Registrar na auditoria
    INSERT INTO bookmaker_balance_audit (
      bookmaker_id,
      workspace_id,
      saldo_anterior,
      saldo_novo,
      origem,
      observacoes
    ) VALUES (
      p_bookmaker_id,
      v_bookmaker.workspace_id,
      v_saldo_anterior,
      v_saldo_calculado,
      'RECONCILIACAO',
      'Reconciliação forçada - diferença de ' || ROUND(v_diferenca, 2)
    );
  END IF;
  
  RETURN jsonb_build_object(
    'success', true,
    'bookmaker_nome', v_bookmaker.nome,
    'saldo_anterior', v_saldo_anterior,
    'saldo_calculado', v_saldo_calculado,
    'saldo_freebet_calculado', v_saldo_freebet_calculado,
    'diferenca_corrigida', v_diferenca,
    'corrigido', ABS(v_diferenca) > 0.001
  );
END;
$$;

-- ============================================================================
-- PARTE 3: FUNÇÃO PARA RECALCULAR SALDO BASEADO EM APOSTAS (REGRA DE OURO)
-- ============================================================================
CREATE OR REPLACE FUNCTION public.recalcular_saldo_por_apostas(
  p_bookmaker_id UUID
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public
AS $$
DECLARE
  v_bookmaker RECORD;
  v_saldo_inicial NUMERIC := 0;
  v_total_ganhos NUMERIC;
  v_total_stakes NUMERIC;
  v_total_bonus NUMERIC;
  v_saldo_calculado NUMERIC;
  v_saldo_anterior NUMERIC;
  v_diferenca NUMERIC;
BEGIN
  -- Buscar bookmaker
  SELECT id, nome, saldo_atual, workspace_id
  INTO v_bookmaker
  FROM bookmakers
  WHERE id = p_bookmaker_id
  FOR UPDATE;
  
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Bookmaker não encontrado');
  END IF;
  
  v_saldo_anterior := v_bookmaker.saldo_atual;
  
  -- Buscar depósitos como saldo inicial
  SELECT COALESCE(SUM(valor), 0)
  INTO v_saldo_inicial
  FROM financial_events
  WHERE bookmaker_id = p_bookmaker_id
    AND tipo_evento = 'DEPOSITO';
  
  -- Calcular ganhos das apostas (baseado no ESTADO FINAL)
  SELECT 
    COALESCE(SUM(
      CASE resultado
        WHEN 'GREEN' THEN stake * odd  -- retorno total
        WHEN 'MEIO_GREEN' THEN stake * (1 + (odd - 1) / 2)
        WHEN 'VOID' THEN stake  -- stake devolvido
        WHEN 'MEIO_RED' THEN stake / 2  -- metade devolvido
        ELSE 0  -- RED = 0
      END
    ), 0),
    COALESCE(SUM(stake), 0)
  INTO v_total_ganhos, v_total_stakes
  FROM apostas_unificada
  WHERE bookmaker_id = p_bookmaker_id
    AND status = 'LIQUIDADA';
  
  -- Buscar bônus creditados
  SELECT COALESCE(SUM(valor), 0)
  INTO v_total_bonus
  FROM financial_events
  WHERE bookmaker_id = p_bookmaker_id
    AND tipo_evento = 'BONUS';
  
  -- REGRA DE OURO: saldo = inicial + ganhos - stakes + bonus
  v_saldo_calculado := v_saldo_inicial + v_total_ganhos - v_total_stakes + v_total_bonus;
  
  v_diferenca := v_saldo_anterior - v_saldo_calculado;
  
  RETURN jsonb_build_object(
    'success', true,
    'bookmaker_nome', v_bookmaker.nome,
    'saldo_anterior', v_saldo_anterior,
    'saldo_inicial', v_saldo_inicial,
    'total_ganhos', v_total_ganhos,
    'total_stakes', v_total_stakes,
    'total_bonus', v_total_bonus,
    'saldo_calculado', v_saldo_calculado,
    'diferenca', v_diferenca,
    'formula', 'saldo_inicial + ganhos - stakes + bonus'
  );
END;
$$;

-- ============================================================================
-- PARTE 4: LIMPAR EVENTOS DUPLICADOS DO MAFIA CASINO (CORREÇÃO IMEDIATA)
-- ============================================================================
-- Deletar o PAYOUT duplicado de Manchester
DELETE FROM financial_events 
WHERE idempotency_key = 'reliq_pay_29fe4f8c-28eb-49a2-b505-3ee45577e7d4_1770253836.522567';

-- Deletar o PAYOUT indevido de Leeds (que está RED)
DELETE FROM financial_events 
WHERE idempotency_key = 'reliq_pay_454a25af-8e57-4f91-b93e-64213664ba6f_1770238942.941228';

-- Deletar a reversão correspondente (pois não deveria ter payout para reverter)
DELETE FROM financial_events 
WHERE idempotency_key = 'reliq_rev_454a25af-8e57-4f91-b93e-64213664ba6f_1770238975.148145';

-- Deletar ajustes indevidos
DELETE FROM financial_events 
WHERE idempotency_key LIKE 'edit_v2_454a25af-8e57-4f91-b93e-64213664ba6f%';

-- ============================================================================
-- PARTE 5: RECONCILIAR SALDO DO MAFIA CASINO
-- ============================================================================
-- Atualizar saldo baseado nos eventos limpos
UPDATE bookmakers
SET 
  saldo_atual = (
    SELECT COALESCE(SUM(valor), 0)
    FROM financial_events
    WHERE bookmaker_id = '896fef9f-cdf2-4302-a44b-af2afcf4db68'
      AND tipo_uso = 'NORMAL'
  ),
  updated_at = NOW()
WHERE id = '896fef9f-cdf2-4302-a44b-af2afcf4db68';

-- Registrar auditoria
INSERT INTO bookmaker_balance_audit (
  bookmaker_id,
  workspace_id,
  saldo_anterior,
  saldo_novo,
  origem,
  observacoes
)
SELECT 
  '896fef9f-cdf2-4302-a44b-af2afcf4db68',
  workspace_id,
  517.63,
  saldo_atual,
  'RECONCILIACAO_AUDITORIA',
  'Correção pós-auditoria: remoção de eventos duplicados e recálculo'
FROM bookmakers
WHERE id = '896fef9f-cdf2-4302-a44b-af2afcf4db68';
