
-- =====================================================
-- CORREÇÃO CRÍTICA: MODELO DE DOMÍNIO FINANCEIRO
-- =====================================================
-- Primeiro, dropar funções existentes para permitir alteração de assinatura

-- 1. DROP das funções existentes
DROP FUNCTION IF EXISTS get_bookmaker_saldos(UUID);
DROP FUNCTION IF EXISTS get_bookmaker_saldos();

-- 2. NOVA RPC: get_bookmaker_saldos_financeiro
-- Fonte de verdade para TODAS as operações financeiras
-- Filtra por WORKSPACE (tenant), NÃO por projeto

CREATE OR REPLACE FUNCTION get_bookmaker_saldos_financeiro(
  p_parceiro_id UUID DEFAULT NULL,
  p_include_zero_balance BOOLEAN DEFAULT FALSE
)
RETURNS TABLE (
  id UUID,
  nome TEXT,
  parceiro_id UUID,
  parceiro_nome TEXT,
  parceiro_primeiro_nome TEXT,
  projeto_id UUID,
  projeto_nome TEXT,
  moeda TEXT,
  logo_url TEXT,
  status TEXT,
  saldo_real NUMERIC,
  saldo_freebet NUMERIC,
  saldo_bonus NUMERIC,
  saldo_em_aposta NUMERIC,
  saldo_disponivel NUMERIC,
  saldo_operavel NUMERIC,
  bonus_rollover_started BOOLEAN,
  has_pending_transactions BOOLEAN
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_workspace_id UUID;
BEGIN
  v_workspace_id := get_current_workspace();
  
  IF v_workspace_id IS NULL THEN
    RAISE EXCEPTION 'Workspace não definido no contexto de sessão';
  END IF;

  RETURN QUERY
  WITH bookmakers_ativos AS (
    SELECT 
      b.id,
      b.nome,
      b.parceiro_id,
      b.projeto_id,
      b.moeda,
      b.status,
      COALESCE(b.saldo_atual, 0) AS saldo_base,
      COALESCE(b.saldo_freebet, 0) AS saldo_freebet,
      p.nome AS parceiro_nome,
      SPLIT_PART(p.nome, ' ', 1) AS parceiro_primeiro_nome,
      proj.nome AS projeto_nome,
      bc.logo_url
    FROM bookmakers b
    LEFT JOIN parceiros p ON p.id = b.parceiro_id
    LEFT JOIN projetos proj ON proj.id = b.projeto_id
    LEFT JOIN bookmakers_catalogo bc ON bc.id = b.bookmaker_catalogo_id
    WHERE b.workspace_id = v_workspace_id
      AND b.status IN ('ATIVO', 'ativo', 'LIMITADA', 'limitada')
      AND (p_parceiro_id IS NULL OR b.parceiro_id = p_parceiro_id)
  ),
  apostas_pendentes AS (
    SELECT 
      au.bookmaker_id,
      COALESCE(SUM(au.stake), 0) AS total_stake
    FROM apostas_unificada au
    JOIN bookmakers b ON b.id = au.bookmaker_id
    WHERE b.workspace_id = v_workspace_id
      AND au.status = 'PENDENTE'
      AND au.cancelled_at IS NULL
      AND au.bookmaker_id IS NOT NULL
    GROUP BY au.bookmaker_id
  ),
  bonus_creditados AS (
    SELECT 
      pblb.bookmaker_id,
      COALESCE(SUM(pblb.saldo_atual), 0) AS total_bonus,
      BOOL_OR(pblb.status = 'credited' AND COALESCE(pblb.rollover_current, 0) > 0) AS has_rollover_started
    FROM project_bookmaker_link_bonuses pblb
    JOIN bookmakers b ON b.id = pblb.bookmaker_id
    WHERE b.workspace_id = v_workspace_id
      AND pblb.status = 'credited'
    GROUP BY pblb.bookmaker_id
  ),
  transacoes_pendentes AS (
    SELECT DISTINCT
      COALESCE(cl.origem_bookmaker_id, cl.destino_bookmaker_id) AS bookmaker_id
    FROM cash_ledger cl
    WHERE cl.workspace_id = v_workspace_id
      AND cl.status IN ('PENDENTE', 'pendente')
      AND (cl.origem_bookmaker_id IS NOT NULL OR cl.destino_bookmaker_id IS NOT NULL)
  )
  SELECT
    ba.id,
    ba.nome,
    ba.parceiro_id,
    ba.parceiro_nome,
    ba.parceiro_primeiro_nome,
    ba.projeto_id,
    ba.projeto_nome,
    ba.moeda,
    ba.logo_url,
    ba.status,
    ba.saldo_base::NUMERIC AS saldo_real,
    ba.saldo_freebet::NUMERIC AS saldo_freebet,
    COALESCE(bc.total_bonus, 0)::NUMERIC AS saldo_bonus,
    COALESCE(ap.total_stake, 0)::NUMERIC AS saldo_em_aposta,
    GREATEST(0, ba.saldo_base - COALESCE(ap.total_stake, 0))::NUMERIC AS saldo_disponivel,
    (GREATEST(0, ba.saldo_base - COALESCE(ap.total_stake, 0)) + ba.saldo_freebet + COALESCE(bc.total_bonus, 0))::NUMERIC AS saldo_operavel,
    COALESCE(bc.has_rollover_started, FALSE) AS bonus_rollover_started,
    (tp.bookmaker_id IS NOT NULL) AS has_pending_transactions
  FROM bookmakers_ativos ba
  LEFT JOIN apostas_pendentes ap ON ap.bookmaker_id = ba.id
  LEFT JOIN bonus_creditados bc ON bc.bookmaker_id = ba.id
  LEFT JOIN transacoes_pendentes tp ON tp.bookmaker_id = ba.id
  WHERE p_include_zero_balance = TRUE 
     OR (ba.saldo_base + ba.saldo_freebet + COALESCE(bc.total_bonus, 0)) > 0
  ORDER BY ba.nome;
END;
$$;

-- 3. RECRIAR get_bookmaker_saldos com nova assinatura
-- p_projeto_id agora é OPCIONAL (NULL = retorna todas do workspace)

CREATE OR REPLACE FUNCTION get_bookmaker_saldos(p_projeto_id UUID DEFAULT NULL)
RETURNS TABLE (
  id UUID,
  nome TEXT,
  parceiro_id UUID,
  parceiro_nome TEXT,
  parceiro_primeiro_nome TEXT,
  moeda TEXT,
  logo_url TEXT,
  saldo_real NUMERIC,
  saldo_freebet NUMERIC,
  saldo_bonus NUMERIC,
  saldo_em_aposta NUMERIC,
  saldo_disponivel NUMERIC,
  saldo_operavel NUMERIC,
  bonus_rollover_started BOOLEAN,
  has_pending_transactions BOOLEAN
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_workspace_id UUID;
BEGIN
  IF p_projeto_id IS NOT NULL THEN
    SELECT workspace_id INTO v_workspace_id
    FROM projetos WHERE id = p_projeto_id;
  END IF;
  
  IF v_workspace_id IS NULL THEN
    v_workspace_id := get_current_workspace();
  END IF;
  
  IF v_workspace_id IS NULL THEN
    RAISE EXCEPTION 'Workspace não definido';
  END IF;

  RETURN QUERY
  WITH bookmakers_ativos AS (
    SELECT 
      b.id,
      b.nome,
      b.parceiro_id,
      b.moeda,
      COALESCE(b.saldo_atual, 0) AS saldo_base,
      COALESCE(b.saldo_freebet, 0) AS saldo_freebet,
      p.nome AS parceiro_nome,
      SPLIT_PART(p.nome, ' ', 1) AS parceiro_primeiro_nome,
      bc.logo_url
    FROM bookmakers b
    LEFT JOIN parceiros p ON p.id = b.parceiro_id
    LEFT JOIN bookmakers_catalogo bc ON bc.id = b.bookmaker_catalogo_id
    WHERE b.workspace_id = v_workspace_id
      AND b.status IN ('ATIVO', 'ativo', 'LIMITADA', 'limitada')
      -- MUDANÇA CRÍTICA: Se projeto_id = NULL, retorna TODAS as casas do workspace
      AND (p_projeto_id IS NULL OR b.projeto_id = p_projeto_id)
  ),
  apostas_pendentes AS (
    SELECT 
      au.bookmaker_id,
      COALESCE(SUM(au.stake), 0) AS total_stake
    FROM apostas_unificada au
    WHERE au.status = 'PENDENTE'
      AND au.cancelled_at IS NULL
      AND au.bookmaker_id IS NOT NULL
      AND (p_projeto_id IS NULL OR au.projeto_id = p_projeto_id)
    GROUP BY au.bookmaker_id
  ),
  bonus_creditados AS (
    SELECT 
      pblb.bookmaker_id,
      COALESCE(SUM(pblb.saldo_atual), 0) AS total_bonus,
      BOOL_OR(pblb.status = 'credited' AND COALESCE(pblb.rollover_current, 0) > 0) AS has_rollover_started
    FROM project_bookmaker_link_bonuses pblb
    WHERE pblb.status = 'credited'
      AND (p_projeto_id IS NULL OR pblb.project_id = p_projeto_id)
    GROUP BY pblb.bookmaker_id
  ),
  transacoes_pendentes AS (
    SELECT DISTINCT
      COALESCE(cl.origem_bookmaker_id, cl.destino_bookmaker_id) AS bookmaker_id
    FROM cash_ledger cl
    WHERE cl.workspace_id = v_workspace_id
      AND cl.status IN ('PENDENTE', 'pendente')
      AND (cl.origem_bookmaker_id IS NOT NULL OR cl.destino_bookmaker_id IS NOT NULL)
  )
  SELECT
    ba.id,
    ba.nome,
    ba.parceiro_id,
    ba.parceiro_nome,
    ba.parceiro_primeiro_nome,
    ba.moeda,
    ba.logo_url,
    ba.saldo_base::NUMERIC AS saldo_real,
    ba.saldo_freebet::NUMERIC AS saldo_freebet,
    COALESCE(bc.total_bonus, 0)::NUMERIC AS saldo_bonus,
    COALESCE(ap.total_stake, 0)::NUMERIC AS saldo_em_aposta,
    GREATEST(0, ba.saldo_base - COALESCE(ap.total_stake, 0))::NUMERIC AS saldo_disponivel,
    (GREATEST(0, ba.saldo_base - COALESCE(ap.total_stake, 0)) + ba.saldo_freebet + COALESCE(bc.total_bonus, 0))::NUMERIC AS saldo_operavel,
    COALESCE(bc.has_rollover_started, FALSE) AS bonus_rollover_started,
    (tp.bookmaker_id IS NOT NULL) AS has_pending_transactions
  FROM bookmakers_ativos ba
  LEFT JOIN apostas_pendentes ap ON ap.bookmaker_id = ba.id
  LEFT JOIN bonus_creditados bc ON bc.bookmaker_id = ba.id
  LEFT JOIN transacoes_pendentes tp ON tp.bookmaker_id = ba.id
  ORDER BY ba.nome;
END;
$$;

-- 4. CORRIGIR TRIGGER: Não atualizar saldo se status = PENDENTE

CREATE OR REPLACE FUNCTION atualizar_saldo_bookmaker_v3()
RETURNS TRIGGER AS $$
DECLARE
  v_bookmaker_id UUID;
  v_valor NUMERIC;
  v_operacao TEXT;
  v_saldo_anterior NUMERIC;
  v_saldo_novo NUMERIC;
BEGIN
  -- REGRA CRÍTICA: Não atualizar saldo se status = PENDENTE
  IF NEW.status IN ('PENDENTE', 'pendente') THEN
    RETURN NEW;
  END IF;
  
  -- Para UPDATE: só processar se mudou de PENDENTE para CONFIRMADO
  IF TG_OP = 'UPDATE' THEN
    IF OLD.status IN ('PENDENTE', 'pendente') AND NEW.status IN ('CONFIRMADO', 'confirmado') THEN
      NULL; -- Continua
    ELSIF OLD.status = NEW.status THEN
      RETURN NEW; -- Sem mudança de status
    END IF;
  END IF;

  -- Determinar bookmaker e operação
  CASE NEW.tipo_transacao
    WHEN 'DEPOSITO', 'BONUS_CREDITADO', 'CASHBACK_MANUAL', 'GANHO_CAMBIAL', 'APOSTA_GREEN', 'APOSTA_VOID' THEN
      v_bookmaker_id := NEW.destino_bookmaker_id;
      v_valor := COALESCE(NEW.valor_destino, NEW.valor);
      v_operacao := 'CREDITO';
    
    WHEN 'SAQUE', 'APOSTA_RED', 'PERDA_CAMBIAL', 'BONUS_ESTORNO', 'CASHBACK_ESTORNO', 'PERDA_OPERACIONAL' THEN
      v_bookmaker_id := NEW.origem_bookmaker_id;
      v_valor := COALESCE(NEW.valor_origem, NEW.valor);
      v_operacao := 'DEBITO';
    
    WHEN 'AJUSTE_SALDO', 'AJUSTE_MANUAL' THEN
      IF NEW.ajuste_direcao = 'ENTRADA' THEN
        v_bookmaker_id := NEW.destino_bookmaker_id;
        v_valor := COALESCE(NEW.valor_destino, NEW.valor);
        v_operacao := 'CREDITO';
      ELSE
        v_bookmaker_id := NEW.origem_bookmaker_id;
        v_valor := COALESCE(NEW.valor_origem, NEW.valor);
        v_operacao := 'DEBITO';
      END IF;
    
    ELSE
      RETURN NEW;
  END CASE;

  IF v_bookmaker_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT saldo_atual INTO v_saldo_anterior
  FROM bookmakers
  WHERE id = v_bookmaker_id
  FOR UPDATE;

  v_saldo_anterior := COALESCE(v_saldo_anterior, 0);

  IF v_operacao = 'CREDITO' THEN
    v_saldo_novo := v_saldo_anterior + v_valor;
  ELSE
    v_saldo_novo := v_saldo_anterior - v_valor;
  END IF;

  UPDATE bookmakers
  SET saldo_atual = v_saldo_novo, updated_at = NOW()
  WHERE id = v_bookmaker_id;

  INSERT INTO bookmaker_balance_audit (
    bookmaker_id, workspace_id, saldo_anterior, saldo_novo,
    origem, referencia_tipo, referencia_id, user_id
  ) VALUES (
    v_bookmaker_id, NEW.workspace_id, v_saldo_anterior, v_saldo_novo,
    'LEDGER_TRIGGER_V3', NEW.tipo_transacao, NEW.id, NEW.user_id
  );

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- 5. SUBSTITUIR TRIGGER
DROP TRIGGER IF EXISTS tr_cash_ledger_update_bookmaker_balance ON cash_ledger;
DROP TRIGGER IF EXISTS tr_cash_ledger_update_bookmaker_balance_v2 ON cash_ledger;

CREATE TRIGGER tr_cash_ledger_update_bookmaker_balance_v3
AFTER INSERT OR UPDATE ON cash_ledger
FOR EACH ROW
EXECUTE FUNCTION atualizar_saldo_bookmaker_v3();

-- 6. DOCUMENTAÇÃO
COMMENT ON FUNCTION get_bookmaker_saldos_financeiro IS 
'RPC para operações financeiras. Filtra por WORKSPACE, não por projeto.
REGRA: Dinheiro pertence a Parceiro + Bookmaker + Moeda, nunca a Projeto.';

COMMENT ON FUNCTION get_bookmaker_saldos IS 
'RPC para Vínculos. Se p_projeto_id = NULL, retorna TODAS as casas do workspace.';

COMMENT ON FUNCTION atualizar_saldo_bookmaker_v3 IS 
'Trigger que só atualiza saldo quando status = CONFIRMADO.
Transações PENDENTE não impactam saldo.';
