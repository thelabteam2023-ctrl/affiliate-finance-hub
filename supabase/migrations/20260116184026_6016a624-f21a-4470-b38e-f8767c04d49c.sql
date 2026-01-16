
-- =====================================================
-- AUDITORIA DE APOSTAS: VALIDAÇÃO SERVER-SIDE
-- =====================================================

-- 1. Adicionar coluna de versionamento para controle otimista
ALTER TABLE public.bookmakers 
ADD COLUMN IF NOT EXISTS version INTEGER DEFAULT 1;

-- 2. Trigger para incrementar versão automaticamente
CREATE OR REPLACE FUNCTION public.increment_bookmaker_version()
RETURNS TRIGGER AS $$
BEGIN
  NEW.version := COALESCE(OLD.version, 0) + 1;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

DROP TRIGGER IF EXISTS trg_increment_bookmaker_version ON public.bookmakers;
CREATE TRIGGER trg_increment_bookmaker_version
  BEFORE UPDATE ON public.bookmakers
  FOR EACH ROW
  EXECUTE FUNCTION public.increment_bookmaker_version();

-- 3. Função RPC para validação pré-commit de apostas
CREATE OR REPLACE FUNCTION public.validate_aposta_pre_commit(
  p_projeto_id UUID,
  p_bookmaker_ids UUID[],
  p_stakes NUMERIC[],
  p_expected_versions INTEGER[] DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_projeto RECORD;
  v_bookmaker RECORD;
  v_result JSONB;
  v_errors JSONB := '[]'::JSONB;
  v_validations JSONB := '[]'::JSONB;
  v_idx INTEGER := 1;
BEGIN
  -- ===== 1. VALIDAR PROJETO ATIVO =====
  SELECT id, status, nome INTO v_projeto
  FROM projetos
  WHERE id = p_projeto_id;
  
  IF NOT FOUND THEN
    v_errors := v_errors || jsonb_build_object(
      'code', 'PROJETO_NAO_ENCONTRADO',
      'message', 'Projeto não encontrado no sistema'
    );
  ELSIF v_projeto.status != 'ativo' THEN
    v_errors := v_errors || jsonb_build_object(
      'code', 'PROJETO_INATIVO',
      'message', format('Projeto "%s" não está ativo (status: %s)', v_projeto.nome, v_projeto.status)
    );
  END IF;
  
  -- ===== 2. VALIDAR CADA BOOKMAKER =====
  FOREACH v_idx IN ARRAY array_positions(p_bookmaker_ids, p_bookmaker_ids[v_idx])
  LOOP
    v_idx := v_idx;
    EXIT WHEN v_idx > array_length(p_bookmaker_ids, 1);
    
    SELECT 
      b.id,
      b.nome,
      b.projeto_id,
      b.status,
      b.saldo_atual,
      b.saldo_usd,
      b.moeda,
      b.version
    INTO v_bookmaker
    FROM bookmakers b
    WHERE b.id = p_bookmaker_ids[v_idx];
    
    IF NOT FOUND THEN
      v_errors := v_errors || jsonb_build_object(
        'code', 'BOOKMAKER_NAO_ENCONTRADA',
        'message', format('Bookmaker ID %s não encontrada', p_bookmaker_ids[v_idx]),
        'bookmaker_id', p_bookmaker_ids[v_idx]
      );
      v_idx := v_idx + 1;
      CONTINUE;
    END IF;
    
    -- Verificar vínculo com projeto
    IF v_bookmaker.projeto_id IS NULL OR v_bookmaker.projeto_id != p_projeto_id THEN
      v_errors := v_errors || jsonb_build_object(
        'code', 'BOOKMAKER_NAO_VINCULADA',
        'message', format('Bookmaker "%s" não está vinculada a este projeto', v_bookmaker.nome),
        'bookmaker_id', v_bookmaker.id
      );
    END IF;
    
    -- Verificar status da bookmaker
    IF v_bookmaker.status NOT IN ('ativo', 'operacional') THEN
      v_errors := v_errors || jsonb_build_object(
        'code', 'BOOKMAKER_INATIVA',
        'message', format('Bookmaker "%s" não está ativa (status: %s)', v_bookmaker.nome, v_bookmaker.status),
        'bookmaker_id', v_bookmaker.id
      );
    END IF;
    
    -- Verificar saldo disponível
    DECLARE
      v_saldo_atual NUMERIC;
      v_stake_necessario NUMERIC;
    BEGIN
      v_stake_necessario := COALESCE(p_stakes[v_idx], 0);
      
      IF v_bookmaker.moeda IN ('USD', 'USDT') THEN
        v_saldo_atual := COALESCE(v_bookmaker.saldo_usd, 0);
      ELSE
        v_saldo_atual := COALESCE(v_bookmaker.saldo_atual, 0);
      END IF;
      
      IF v_saldo_atual < v_stake_necessario THEN
        v_errors := v_errors || jsonb_build_object(
          'code', 'SALDO_INSUFICIENTE',
          'message', format('Saldo insuficiente em "%s": %.2f disponível, %.2f necessário', 
            v_bookmaker.nome, v_saldo_atual, v_stake_necessario),
          'bookmaker_id', v_bookmaker.id,
          'saldo_atual', v_saldo_atual,
          'stake_necessario', v_stake_necessario
        );
      END IF;
      
      -- Verificar versão (controle otimista)
      IF p_expected_versions IS NOT NULL AND array_length(p_expected_versions, 1) >= v_idx THEN
        IF v_bookmaker.version != p_expected_versions[v_idx] THEN
          v_errors := v_errors || jsonb_build_object(
            'code', 'VERSAO_DESATUALIZADA',
            'message', format('Dados de "%s" foram alterados por outro usuário. Atualize e tente novamente.', v_bookmaker.nome),
            'bookmaker_id', v_bookmaker.id,
            'expected_version', p_expected_versions[v_idx],
            'current_version', v_bookmaker.version
          );
        END IF;
      END IF;
      
      -- Adicionar validação OK
      v_validations := v_validations || jsonb_build_object(
        'bookmaker_id', v_bookmaker.id,
        'bookmaker_nome', v_bookmaker.nome,
        'saldo_atual', v_saldo_atual,
        'stake_necessario', v_stake_necessario,
        'version', v_bookmaker.version,
        'valid', true
      );
    END;
    
    v_idx := v_idx + 1;
  END LOOP;
  
  -- ===== 3. CONSTRUIR RESULTADO =====
  v_result := jsonb_build_object(
    'valid', jsonb_array_length(v_errors) = 0,
    'errors', v_errors,
    'validations', v_validations,
    'projeto', jsonb_build_object(
      'id', v_projeto.id,
      'nome', v_projeto.nome,
      'status', v_projeto.status
    ),
    'timestamp', now()
  );
  
  RETURN v_result;
END;
$$;

-- 4. Função RPC para débito atômico com controle otimista
CREATE OR REPLACE FUNCTION public.debit_bookmaker_with_lock(
  p_bookmaker_id UUID,
  p_stake NUMERIC,
  p_expected_version INTEGER,
  p_origem TEXT,
  p_referencia_id UUID DEFAULT NULL,
  p_referencia_tipo TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_bookmaker RECORD;
  v_saldo_atual NUMERIC;
  v_novo_saldo NUMERIC;
  v_usa_usd BOOLEAN;
BEGIN
  -- Lock na linha para evitar race conditions
  SELECT id, nome, moeda, saldo_atual, saldo_usd, version
  INTO v_bookmaker
  FROM bookmakers
  WHERE id = p_bookmaker_id
  FOR UPDATE;
  
  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'success', false,
      'error_code', 'BOOKMAKER_NAO_ENCONTRADA',
      'message', 'Bookmaker não encontrada'
    );
  END IF;
  
  -- Verificar versão (controle otimista)
  IF v_bookmaker.version != p_expected_version THEN
    RETURN jsonb_build_object(
      'success', false,
      'error_code', 'VERSAO_DESATUALIZADA',
      'message', format('Dados de "%s" foram alterados. Atualize e tente novamente.', v_bookmaker.nome),
      'expected_version', p_expected_version,
      'current_version', v_bookmaker.version
    );
  END IF;
  
  -- Determinar campo de saldo
  v_usa_usd := v_bookmaker.moeda IN ('USD', 'USDT');
  v_saldo_atual := CASE WHEN v_usa_usd THEN v_bookmaker.saldo_usd ELSE v_bookmaker.saldo_atual END;
  
  -- Verificar saldo suficiente
  IF v_saldo_atual < p_stake THEN
    RETURN jsonb_build_object(
      'success', false,
      'error_code', 'SALDO_INSUFICIENTE',
      'message', format('Saldo insuficiente: %.2f disponível, %.2f necessário', v_saldo_atual, p_stake),
      'saldo_atual', v_saldo_atual,
      'stake', p_stake
    );
  END IF;
  
  -- Calcular novo saldo
  v_novo_saldo := v_saldo_atual - p_stake;
  
  -- Atualizar saldo (o trigger incrementará a versão)
  IF v_usa_usd THEN
    UPDATE bookmakers SET saldo_usd = v_novo_saldo WHERE id = p_bookmaker_id;
  ELSE
    UPDATE bookmakers SET saldo_atual = v_novo_saldo WHERE id = p_bookmaker_id;
  END IF;
  
  -- Registrar auditoria
  INSERT INTO bookmaker_balance_audit (
    bookmaker_id, workspace_id, user_id,
    saldo_anterior, saldo_novo, origem,
    referencia_id, referencia_tipo, observacoes
  )
  SELECT 
    p_bookmaker_id, 
    b.workspace_id,
    auth.uid(),
    v_saldo_atual,
    v_novo_saldo,
    p_origem,
    p_referencia_id,
    p_referencia_tipo,
    format('Débito de stake: %.2f', p_stake)
  FROM bookmakers b WHERE b.id = p_bookmaker_id;
  
  RETURN jsonb_build_object(
    'success', true,
    'saldo_anterior', v_saldo_atual,
    'saldo_novo', v_novo_saldo,
    'new_version', v_bookmaker.version + 1
  );
END;
$$;

-- Comentário explicativo
COMMENT ON FUNCTION public.validate_aposta_pre_commit IS 
'Validação server-side obrigatória antes de registrar apostas. 
Verifica: projeto ativo, vínculos bookmaker-projeto, saldos disponíveis, controle de versão.';

COMMENT ON FUNCTION public.debit_bookmaker_with_lock IS 
'Débito atômico com lock pessimista e controle otimista de versão. 
Previne race conditions em cenários de múltiplos usuários.';
