-- ============================================
-- FASE 0: INFRAESTRUTURA BASE
-- ============================================

-- 1. RPC: criar_aposta_atomica
-- Cria aposta SEM debitar saldo (stake fica em saldo_em_aposta)
CREATE OR REPLACE FUNCTION public.criar_aposta_atomica(
  p_aposta_data JSONB,
  p_pernas JSONB DEFAULT NULL
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_aposta_id UUID;
  v_projeto_id UUID;
  v_workspace_id UUID;
  v_user_id UUID;
  v_perna JSONB;
  v_bookmaker_id UUID;
  v_stake NUMERIC;
  v_saldo_disponivel NUMERIC;
  v_validation_errors JSONB := '[]'::JSONB;
BEGIN
  -- Extrair IDs essenciais
  v_projeto_id := (p_aposta_data->>'projeto_id')::UUID;
  v_workspace_id := (p_aposta_data->>'workspace_id')::UUID;
  v_user_id := (p_aposta_data->>'user_id')::UUID;

  -- Validar projeto ativo
  IF NOT EXISTS (
    SELECT 1 FROM projetos 
    WHERE id = v_projeto_id 
    AND status = 'ATIVO'
  ) THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'PROJETO_INATIVO',
      'message', 'Projeto não está ativo'
    );
  END IF;

  -- Validar saldo disponível para cada perna (sem debitar)
  IF p_pernas IS NOT NULL AND jsonb_array_length(p_pernas) > 0 THEN
    FOR v_perna IN SELECT * FROM jsonb_array_elements(p_pernas)
    LOOP
      v_bookmaker_id := (v_perna->>'bookmaker_id')::UUID;
      v_stake := COALESCE((v_perna->>'stake')::NUMERIC, 0);
      
      -- Pular validação para freebets
      IF COALESCE((v_perna->>'is_freebet')::BOOLEAN, false) THEN
        CONTINUE;
      END IF;
      
      -- Verificar saldo disponível via RPC existente
      SELECT saldo_operavel INTO v_saldo_disponivel
      FROM get_bookmaker_saldos(v_projeto_id)
      WHERE bookmaker_id = v_bookmaker_id;
      
      IF v_saldo_disponivel IS NULL THEN
        v_validation_errors := v_validation_errors || jsonb_build_object(
          'bookmaker_id', v_bookmaker_id,
          'error', 'BOOKMAKER_NAO_VINCULADA',
          'message', 'Bookmaker não vinculada ao projeto'
        );
      ELSIF v_saldo_disponivel < v_stake THEN
        v_validation_errors := v_validation_errors || jsonb_build_object(
          'bookmaker_id', v_bookmaker_id,
          'error', 'SALDO_INSUFICIENTE',
          'saldo_disponivel', v_saldo_disponivel,
          'stake_necessario', v_stake
        );
      END IF;
    END LOOP;
    
    -- Se houver erros de validação, retornar sem criar
    IF jsonb_array_length(v_validation_errors) > 0 THEN
      RETURN jsonb_build_object(
        'success', false,
        'error', 'VALIDATION_FAILED',
        'validation_errors', v_validation_errors
      );
    END IF;
  END IF;

  -- Inserir aposta principal
  INSERT INTO apostas_unificada (
    projeto_id,
    workspace_id,
    user_id,
    estrategia,
    status,
    data_aposta,
    bookmaker_id,
    stake,
    stake_real,
    stake_bonus,
    stake_total,
    odd,
    selecao,
    evento,
    mercado,
    esporte,
    observacoes,
    is_bonus_bet,
    tipo_freebet,
    bonus_id,
    moeda_operacao,
    cotacao_snapshot,
    cotacao_snapshot_at,
    lucro_esperado,
    retorno_potencial,
    roi_esperado,
    forma_registro,
    contexto_operacional,
    pernas,
    lay_odd,
    lay_stake,
    lay_liability,
    lay_exchange,
    lay_comissao,
    back_comissao,
    back_em_exchange,
    spread_calculado,
    lado_aposta,
    modelo,
    modo_entrada
  )
  VALUES (
    v_projeto_id,
    v_workspace_id,
    v_user_id,
    COALESCE(p_aposta_data->>'estrategia', 'SIMPLES'),
    'PENDENTE',
    COALESCE((p_aposta_data->>'data_aposta')::DATE, CURRENT_DATE),
    (p_aposta_data->>'bookmaker_id')::UUID,
    (p_aposta_data->>'stake')::NUMERIC,
    (p_aposta_data->>'stake_real')::NUMERIC,
    (p_aposta_data->>'stake_bonus')::NUMERIC,
    (p_aposta_data->>'stake_total')::NUMERIC,
    (p_aposta_data->>'odd')::NUMERIC,
    p_aposta_data->>'selecao',
    p_aposta_data->>'evento',
    p_aposta_data->>'mercado',
    p_aposta_data->>'esporte',
    p_aposta_data->>'observacoes',
    COALESCE((p_aposta_data->>'is_bonus_bet')::BOOLEAN, false),
    p_aposta_data->>'tipo_freebet',
    (p_aposta_data->>'bonus_id')::UUID,
    COALESCE(p_aposta_data->>'moeda_operacao', 'BRL'),
    (p_aposta_data->>'cotacao_snapshot')::NUMERIC,
    (p_aposta_data->>'cotacao_snapshot_at')::TIMESTAMPTZ,
    (p_aposta_data->>'lucro_esperado')::NUMERIC,
    (p_aposta_data->>'retorno_potencial')::NUMERIC,
    (p_aposta_data->>'roi_esperado')::NUMERIC,
    COALESCE(p_aposta_data->>'forma_registro', 'MANUAL'),
    COALESCE(p_aposta_data->>'contexto_operacional', 'OPERACIONAL'),
    p_aposta_data->'pernas',
    (p_aposta_data->>'lay_odd')::NUMERIC,
    (p_aposta_data->>'lay_stake')::NUMERIC,
    (p_aposta_data->>'lay_liability')::NUMERIC,
    p_aposta_data->>'lay_exchange',
    (p_aposta_data->>'lay_comissao')::NUMERIC,
    (p_aposta_data->>'back_comissao')::NUMERIC,
    COALESCE((p_aposta_data->>'back_em_exchange')::BOOLEAN, false),
    (p_aposta_data->>'spread_calculado')::NUMERIC,
    p_aposta_data->>'lado_aposta',
    p_aposta_data->>'modelo',
    p_aposta_data->>'modo_entrada'
  )
  RETURNING id INTO v_aposta_id;

  -- Inserir pernas se fornecidas
  IF p_pernas IS NOT NULL AND jsonb_array_length(p_pernas) > 0 THEN
    INSERT INTO apostas_pernas (
      aposta_id,
      bookmaker_id,
      ordem,
      stake,
      odd,
      selecao,
      selecao_livre,
      moeda,
      cotacao_snapshot,
      cotacao_snapshot_at,
      stake_brl_referencia
    )
    SELECT 
      v_aposta_id,
      (perna->>'bookmaker_id')::UUID,
      COALESCE((perna->>'ordem')::INT, row_number() OVER ()),
      (perna->>'stake')::NUMERIC,
      (perna->>'odd')::NUMERIC,
      perna->>'selecao',
      perna->>'selecao_livre',
      COALESCE(perna->>'moeda', 'BRL'),
      (perna->>'cotacao_snapshot')::NUMERIC,
      (perna->>'cotacao_snapshot_at')::TIMESTAMPTZ,
      (perna->>'stake_brl_referencia')::NUMERIC
    FROM jsonb_array_elements(p_pernas) AS perna;
  END IF;

  -- NÃO DEBITA SALDO - stake fica em saldo_em_aposta
  -- A RPC get_bookmaker_saldos calcula isso automaticamente
  
  RETURN jsonb_build_object(
    'success', true,
    'aposta_id', v_aposta_id,
    'message', 'Aposta criada com sucesso (stake reservado, não debitado)'
  );

EXCEPTION
  WHEN OTHERS THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'DATABASE_ERROR',
      'message', SQLERRM
    );
END;
$$;

-- 2. RPC: liquidar_aposta_atomica
-- Liquida aposta e registra impacto financeiro via cash_ledger
CREATE OR REPLACE FUNCTION public.liquidar_aposta_atomica(
  p_aposta_id UUID,
  p_resultado TEXT,
  p_lucro_prejuizo NUMERIC DEFAULT NULL,
  p_resultados_pernas JSONB DEFAULT NULL
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_aposta RECORD;
  v_perna RECORD;
  v_resultado_perna TEXT;
  v_lucro_perna NUMERIC;
  v_workspace_id UUID;
  v_user_id UUID;
  v_total_impacto NUMERIC := 0;
BEGIN
  -- Buscar aposta
  SELECT * INTO v_aposta
  FROM apostas_unificada
  WHERE id = p_aposta_id
  FOR UPDATE; -- Lock para evitar race condition
  
  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'APOSTA_NAO_ENCONTRADA'
    );
  END IF;
  
  IF v_aposta.status = 'LIQUIDADA' THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'APOSTA_JA_LIQUIDADA'
    );
  END IF;
  
  v_workspace_id := v_aposta.workspace_id;
  v_user_id := v_aposta.user_id;

  -- Atualizar aposta principal
  UPDATE apostas_unificada
  SET 
    status = 'LIQUIDADA',
    resultado = p_resultado,
    lucro_prejuizo = COALESCE(p_lucro_prejuizo, lucro_prejuizo),
    updated_at = NOW()
  WHERE id = p_aposta_id;

  -- Processar cada perna
  FOR v_perna IN 
    SELECT ap.*, b.moeda as bookmaker_moeda
    FROM apostas_pernas ap
    JOIN bookmakers b ON b.id = ap.bookmaker_id
    WHERE ap.aposta_id = p_aposta_id
  LOOP
    -- Determinar resultado da perna
    IF p_resultados_pernas IS NOT NULL THEN
      v_resultado_perna := p_resultados_pernas->>v_perna.id::TEXT;
    END IF;
    v_resultado_perna := COALESCE(v_resultado_perna, p_resultado);
    
    -- Calcular lucro/prejuízo da perna
    IF v_resultado_perna = 'GREEN' THEN
      v_lucro_perna := v_perna.stake * (v_perna.odd - 1);
    ELSIF v_resultado_perna = 'RED' THEN
      v_lucro_perna := -v_perna.stake;
    ELSIF v_resultado_perna = 'VOID' OR v_resultado_perna = 'REEMBOLSO' THEN
      v_lucro_perna := 0;
    ELSIF v_resultado_perna = 'MEIO_GREEN' THEN
      v_lucro_perna := v_perna.stake * (v_perna.odd - 1) / 2;
    ELSIF v_resultado_perna = 'MEIO_RED' THEN
      v_lucro_perna := -v_perna.stake / 2;
    ELSE
      v_lucro_perna := 0;
    END IF;
    
    -- Atualizar perna
    UPDATE apostas_pernas
    SET 
      resultado = v_resultado_perna,
      lucro_prejuizo = v_lucro_perna,
      updated_at = NOW()
    WHERE id = v_perna.id;
    
    -- Inserir no cash_ledger para registrar impacto
    IF v_resultado_perna = 'GREEN' THEN
      -- GREEN: retorna stake + lucro
      INSERT INTO cash_ledger (
        workspace_id,
        user_id,
        tipo_transacao,
        destino_bookmaker_id,
        destino_tipo,
        valor,
        moeda,
        tipo_moeda,
        status,
        descricao,
        impacta_caixa_operacional
      ) VALUES (
        v_workspace_id,
        v_user_id,
        'APOSTA_GREEN',
        v_perna.bookmaker_id,
        'BOOKMAKER',
        v_perna.stake + v_lucro_perna, -- stake + lucro
        COALESCE(v_perna.moeda, 'BRL'),
        CASE WHEN v_perna.moeda IN ('USD', 'USDT') THEN 'CRYPTO' ELSE 'FIAT' END,
        'CONFIRMADO',
        'Aposta GREEN - Retorno: ' || (v_perna.stake + v_lucro_perna)::TEXT,
        true
      );
      
    ELSIF v_resultado_perna = 'RED' THEN
      -- RED: stake perdido (já estava reservado, agora confirma perda)
      INSERT INTO cash_ledger (
        workspace_id,
        user_id,
        tipo_transacao,
        origem_bookmaker_id,
        origem_tipo,
        valor,
        moeda,
        tipo_moeda,
        status,
        descricao,
        impacta_caixa_operacional
      ) VALUES (
        v_workspace_id,
        v_user_id,
        'APOSTA_RED',
        v_perna.bookmaker_id,
        'BOOKMAKER',
        v_perna.stake,
        COALESCE(v_perna.moeda, 'BRL'),
        CASE WHEN v_perna.moeda IN ('USD', 'USDT') THEN 'CRYPTO' ELSE 'FIAT' END,
        'CONFIRMADO',
        'Aposta RED - Stake perdido: ' || v_perna.stake::TEXT,
        true
      );
      
    ELSIF v_resultado_perna IN ('VOID', 'REEMBOLSO') THEN
      -- VOID: stake devolvido (estava reservado, agora libera)
      INSERT INTO cash_ledger (
        workspace_id,
        user_id,
        tipo_transacao,
        destino_bookmaker_id,
        destino_tipo,
        valor,
        moeda,
        tipo_moeda,
        status,
        descricao,
        impacta_caixa_operacional
      ) VALUES (
        v_workspace_id,
        v_user_id,
        'APOSTA_VOID',
        v_perna.bookmaker_id,
        'BOOKMAKER',
        v_perna.stake,
        COALESCE(v_perna.moeda, 'BRL'),
        CASE WHEN v_perna.moeda IN ('USD', 'USDT') THEN 'CRYPTO' ELSE 'FIAT' END,
        'CONFIRMADO',
        'Aposta VOID - Stake devolvido: ' || v_perna.stake::TEXT,
        true
      );
      
    ELSIF v_resultado_perna = 'MEIO_GREEN' THEN
      -- MEIO_GREEN: retorna stake + meio lucro
      INSERT INTO cash_ledger (
        workspace_id,
        user_id,
        tipo_transacao,
        destino_bookmaker_id,
        destino_tipo,
        valor,
        moeda,
        tipo_moeda,
        status,
        descricao,
        impacta_caixa_operacional
      ) VALUES (
        v_workspace_id,
        v_user_id,
        'APOSTA_MEIO_GREEN',
        v_perna.bookmaker_id,
        'BOOKMAKER',
        v_perna.stake + v_lucro_perna,
        COALESCE(v_perna.moeda, 'BRL'),
        CASE WHEN v_perna.moeda IN ('USD', 'USDT') THEN 'CRYPTO' ELSE 'FIAT' END,
        'CONFIRMADO',
        'Aposta MEIO GREEN - Retorno: ' || (v_perna.stake + v_lucro_perna)::TEXT,
        true
      );
      
    ELSIF v_resultado_perna = 'MEIO_RED' THEN
      -- MEIO_RED: perde metade do stake
      INSERT INTO cash_ledger (
        workspace_id,
        user_id,
        tipo_transacao,
        origem_bookmaker_id,
        origem_tipo,
        valor,
        moeda,
        tipo_moeda,
        status,
        descricao,
        impacta_caixa_operacional
      ) VALUES (
        v_workspace_id,
        v_user_id,
        'APOSTA_MEIO_RED',
        v_perna.bookmaker_id,
        'BOOKMAKER',
        v_perna.stake / 2, -- metade do stake perdido
        COALESCE(v_perna.moeda, 'BRL'),
        CASE WHEN v_perna.moeda IN ('USD', 'USDT') THEN 'CRYPTO' ELSE 'FIAT' END,
        'CONFIRMADO',
        'Aposta MEIO RED - Stake perdido: ' || (v_perna.stake / 2)::TEXT,
        true
      );
    END IF;
    
    v_total_impacto := v_total_impacto + v_lucro_perna;
  END LOOP;

  RETURN jsonb_build_object(
    'success', true,
    'aposta_id', p_aposta_id,
    'resultado', p_resultado,
    'impacto_total', v_total_impacto,
    'message', 'Aposta liquidada e registrada no ledger'
  );

EXCEPTION
  WHEN OTHERS THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'DATABASE_ERROR',
      'message', SQLERRM
    );
END;
$$;

-- 3. Trigger de proteção contra UPDATE direto em saldo
CREATE OR REPLACE FUNCTION public.protect_bookmaker_balance()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Permitir se flag de bypass está ativa (chamado pelo trigger do cash_ledger)
  IF current_setting('app.allow_balance_update', true) = 'true' THEN
    RETURN NEW;
  END IF;
  
  -- Verificar se está tentando alterar saldo
  IF OLD.saldo_atual IS DISTINCT FROM NEW.saldo_atual OR
     OLD.saldo_usd IS DISTINCT FROM NEW.saldo_usd OR
     OLD.saldo_freebet IS DISTINCT FROM NEW.saldo_freebet THEN
    -- Por enquanto, apenas logar (modo warning)
    -- Depois de validação, mudar para RAISE EXCEPTION
    RAISE WARNING '[BALANCE_PROTECTION] UPDATE direto em saldo detectado para bookmaker %. Use cash_ledger.', NEW.id;
    
    -- Comentar linha abaixo para ativar bloqueio real:
    -- RAISE EXCEPTION 'UPDATE direto em saldo bloqueado. Use cash_ledger para alterações de saldo.';
  END IF;
  
  RETURN NEW;
END;
$$;

-- Criar trigger (inicialmente em modo warning)
DROP TRIGGER IF EXISTS tr_protect_bookmaker_balance ON bookmakers;
CREATE TRIGGER tr_protect_bookmaker_balance
  BEFORE UPDATE ON bookmakers
  FOR EACH ROW
  EXECUTE FUNCTION protect_bookmaker_balance();

-- 4. Atualizar trigger do cash_ledger para suportar novos tipos
CREATE OR REPLACE FUNCTION public.atualizar_saldo_bookmaker_v2()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_valor NUMERIC;
  v_bookmaker_id UUID;
  v_saldo_anterior NUMERIC;
BEGIN
  -- Só processar transações confirmadas
  IF NEW.status != 'CONFIRMADO' THEN
    RETURN NEW;
  END IF;
  
  -- Usar valor confirmado se disponível
  v_valor := COALESCE(NEW.valor_confirmado, NEW.valor);
  
  -- Determinar bookmaker e direção
  CASE NEW.tipo_transacao
    -- Entradas (aumentam saldo)
    WHEN 'DEPOSITO', 'APOSTA_GREEN', 'APOSTA_VOID', 'APOSTA_MEIO_GREEN', 
         'BONUS_CREDITO', 'CASHBACK', 'TRANSFERENCIA_ENTRADA' THEN
      v_bookmaker_id := NEW.destino_bookmaker_id;
      
      IF v_bookmaker_id IS NOT NULL THEN
        -- Setar flag para permitir update
        PERFORM set_config('app.allow_balance_update', 'true', true);
        
        SELECT saldo_atual INTO v_saldo_anterior FROM bookmakers WHERE id = v_bookmaker_id;
        
        UPDATE bookmakers 
        SET 
          saldo_atual = saldo_atual + v_valor,
          updated_at = NOW(),
          version = COALESCE(version, 0) + 1
        WHERE id = v_bookmaker_id;
        
        -- Registrar auditoria
        INSERT INTO bookmaker_balance_audit (
          workspace_id, bookmaker_id, saldo_anterior, saldo_novo, 
          diferenca, origem, referencia_id, referencia_tipo, user_id
        ) VALUES (
          NEW.workspace_id, v_bookmaker_id, v_saldo_anterior, 
          v_saldo_anterior + v_valor, v_valor, NEW.tipo_transacao,
          NEW.id, 'cash_ledger', NEW.user_id
        );
      END IF;
      
    -- Saídas (diminuem saldo)
    WHEN 'SAQUE', 'APOSTA_RED', 'APOSTA_MEIO_RED', 'TRANSFERENCIA_SAIDA' THEN
      v_bookmaker_id := NEW.origem_bookmaker_id;
      
      IF v_bookmaker_id IS NOT NULL THEN
        -- Setar flag para permitir update
        PERFORM set_config('app.allow_balance_update', 'true', true);
        
        SELECT saldo_atual INTO v_saldo_anterior FROM bookmakers WHERE id = v_bookmaker_id;
        
        UPDATE bookmakers 
        SET 
          saldo_atual = saldo_atual - v_valor,
          updated_at = NOW(),
          version = COALESCE(version, 0) + 1
        WHERE id = v_bookmaker_id;
        
        -- Registrar auditoria
        INSERT INTO bookmaker_balance_audit (
          workspace_id, bookmaker_id, saldo_anterior, saldo_novo, 
          diferenca, origem, referencia_id, referencia_tipo, user_id
        ) VALUES (
          NEW.workspace_id, v_bookmaker_id, v_saldo_anterior, 
          v_saldo_anterior - v_valor, -v_valor, NEW.tipo_transacao,
          NEW.id, 'cash_ledger', NEW.user_id
        );
      END IF;
      
    ELSE
      -- Outros tipos não alteram saldo de bookmaker
      NULL;
  END CASE;
  
  RETURN NEW;
END;
$$;

-- Recriar trigger com nova função
DROP TRIGGER IF EXISTS tr_atualizar_saldo_bookmaker_v2 ON cash_ledger;
CREATE TRIGGER tr_atualizar_saldo_bookmaker_v2
  AFTER INSERT ON cash_ledger
  FOR EACH ROW
  EXECUTE FUNCTION atualizar_saldo_bookmaker_v2();

-- Comentar grants
COMMENT ON FUNCTION criar_aposta_atomica IS 'Cria aposta sem debitar saldo. Stake fica reservado em saldo_em_aposta até liquidação.';
COMMENT ON FUNCTION liquidar_aposta_atomica IS 'Liquida aposta e registra impacto financeiro via cash_ledger. Trigger atualiza saldos automaticamente.';
COMMENT ON FUNCTION protect_bookmaker_balance IS 'Protege contra UPDATE direto em saldo. Atualmente em modo warning.';