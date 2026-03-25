
-- ============================================================================
-- PORTAL DO FORNECEDOR - Schema Completo
-- ============================================================================

-- 1. Adicionar campos de hierarquia no workspaces (já existente)
ALTER TABLE public.workspaces 
  ADD COLUMN IF NOT EXISTS parent_workspace_id UUID REFERENCES public.workspaces(id),
  ADD COLUMN IF NOT EXISTS tipo TEXT NOT NULL DEFAULT 'padrao';

-- 2. Tabela de fornecedores (metadados do fornecedor vinculado ao workspace)
CREATE TABLE public.supplier_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  parent_workspace_id UUID NOT NULL REFERENCES public.workspaces(id),
  nome TEXT NOT NULL,
  contato TEXT,
  observacoes TEXT,
  status TEXT NOT NULL DEFAULT 'ATIVO',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID,
  UNIQUE(workspace_id)
);

-- 3. Tokens de acesso (link sem login)
CREATE TABLE public.supplier_access_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  token_hash TEXT NOT NULL UNIQUE,
  supplier_workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  supplier_profile_id UUID NOT NULL REFERENCES public.supplier_profiles(id) ON DELETE CASCADE,
  created_by UUID NOT NULL,
  label TEXT,
  expires_at TIMESTAMPTZ NOT NULL,
  revoked_at TIMESTAMPTZ,
  last_used_at TIMESTAMPTZ,
  max_uses INT,
  use_count INT NOT NULL DEFAULT 0,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_supplier_tokens_hash ON public.supplier_access_tokens(token_hash);
CREATE INDEX idx_supplier_tokens_workspace ON public.supplier_access_tokens(supplier_workspace_id);

-- 4. Titulares (CPFs/nomes vinculados às contas)
CREATE TABLE public.supplier_titulares (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  supplier_workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  nome TEXT NOT NULL,
  documento TEXT,
  documento_tipo TEXT DEFAULT 'CPF',
  email TEXT,
  telefone TEXT,
  status TEXT NOT NULL DEFAULT 'ATIVO',
  observacoes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_supplier_titulares_ws ON public.supplier_titulares(supplier_workspace_id);

-- 5. Contas do fornecedor em casas de apostas
CREATE TABLE public.supplier_bookmaker_accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  supplier_workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  titular_id UUID REFERENCES public.supplier_titulares(id),
  bookmaker_catalogo_id UUID NOT NULL REFERENCES public.bookmakers_catalogo(id),
  login_username TEXT NOT NULL,
  login_password_encrypted TEXT NOT NULL,
  login_email TEXT,
  moeda TEXT NOT NULL DEFAULT 'BRL',
  saldo_atual NUMERIC NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'ATIVA',
  observacoes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_supplier_accounts_ws ON public.supplier_bookmaker_accounts(supplier_workspace_id);

-- 6. Alocações de capital (admin -> fornecedor)
CREATE TABLE public.supplier_alocacoes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  parent_workspace_id UUID NOT NULL REFERENCES public.workspaces(id),
  supplier_workspace_id UUID NOT NULL REFERENCES public.workspaces(id),
  valor NUMERIC NOT NULL,
  moeda TEXT NOT NULL DEFAULT 'BRL',
  valor_sugerido_deposito NUMERIC,
  status TEXT NOT NULL DEFAULT 'ATIVO',
  descricao TEXT,
  created_by UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 7. Ledger imutável do fornecedor
CREATE TABLE public.supplier_ledger (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  supplier_workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  bookmaker_account_id UUID REFERENCES public.supplier_bookmaker_accounts(id),
  
  tipo TEXT NOT NULL,
  direcao TEXT NOT NULL CHECK (direcao IN ('CREDIT', 'DEBIT')),
  
  valor NUMERIC NOT NULL CHECK (valor > 0),
  saldo_antes NUMERIC NOT NULL,
  saldo_depois NUMERIC NOT NULL,
  
  idempotency_key TEXT UNIQUE,
  sequencia BIGINT NOT NULL,
  
  descricao TEXT,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by TEXT NOT NULL
);

CREATE INDEX idx_supplier_ledger_ws_seq ON public.supplier_ledger(supplier_workspace_id, sequencia DESC);
CREATE INDEX idx_supplier_ledger_account ON public.supplier_ledger(bookmaker_account_id);

-- Sequence per workspace para sequencia monotônica
CREATE SEQUENCE IF NOT EXISTS supplier_ledger_seq;

-- 8. Reconciliações / fechamentos
CREATE TABLE public.supplier_reconciliacoes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  supplier_workspace_id UUID NOT NULL REFERENCES public.workspaces(id),
  
  total_alocado NUMERIC NOT NULL DEFAULT 0,
  total_devolvido NUMERIC NOT NULL DEFAULT 0,
  saldo_consolidado_calculado NUMERIC NOT NULL DEFAULT 0,
  
  pnl_calculado NUMERIC NOT NULL DEFAULT 0,
  divergencia NUMERIC NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'PENDENTE',
  
  periodo_inicio DATE,
  periodo_fim DATE,
  aprovado_por UUID,
  aprovado_at TIMESTAMPTZ,
  observacoes TEXT,
  snapshot_contas JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 9. RLS Policies
ALTER TABLE public.supplier_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.supplier_access_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.supplier_titulares ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.supplier_bookmaker_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.supplier_alocacoes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.supplier_ledger ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.supplier_reconciliacoes ENABLE ROW LEVEL SECURITY;

-- Admin policies (workspace members can manage supplier data)
CREATE POLICY "workspace_members_supplier_profiles" ON public.supplier_profiles
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.workspace_members wm 
      WHERE wm.workspace_id = supplier_profiles.parent_workspace_id 
      AND wm.user_id = auth.uid()
    )
  );

CREATE POLICY "workspace_members_supplier_tokens" ON public.supplier_access_tokens
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.supplier_profiles sp
      JOIN public.workspace_members wm ON wm.workspace_id = sp.parent_workspace_id
      WHERE sp.workspace_id = supplier_access_tokens.supplier_workspace_id
      AND wm.user_id = auth.uid()
    )
  );

CREATE POLICY "workspace_members_supplier_titulares" ON public.supplier_titulares
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.supplier_profiles sp
      JOIN public.workspace_members wm ON wm.workspace_id = sp.parent_workspace_id
      WHERE sp.workspace_id = supplier_titulares.supplier_workspace_id
      AND wm.user_id = auth.uid()
    )
  );

CREATE POLICY "workspace_members_supplier_accounts" ON public.supplier_bookmaker_accounts
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.supplier_profiles sp
      JOIN public.workspace_members wm ON wm.workspace_id = sp.parent_workspace_id
      WHERE sp.workspace_id = supplier_bookmaker_accounts.supplier_workspace_id
      AND wm.user_id = auth.uid()
    )
  );

CREATE POLICY "workspace_members_supplier_alocacoes" ON public.supplier_alocacoes
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.workspace_members wm 
      WHERE wm.workspace_id = supplier_alocacoes.parent_workspace_id 
      AND wm.user_id = auth.uid()
    )
  );

CREATE POLICY "workspace_members_supplier_ledger" ON public.supplier_ledger
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.supplier_profiles sp
      JOIN public.workspace_members wm ON wm.workspace_id = sp.parent_workspace_id
      WHERE sp.workspace_id = supplier_ledger.supplier_workspace_id
      AND wm.user_id = auth.uid()
    )
  );

CREATE POLICY "workspace_members_supplier_reconciliacoes" ON public.supplier_reconciliacoes
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.supplier_profiles sp
      JOIN public.workspace_members wm ON wm.workspace_id = sp.parent_workspace_id
      WHERE sp.workspace_id = supplier_reconciliacoes.supplier_workspace_id
      AND wm.user_id = auth.uid()
    )
  );

-- 10. View de P&L por fornecedor
CREATE OR REPLACE VIEW public.v_supplier_pnl AS
SELECT 
  sl.supplier_workspace_id,
  sp.nome AS supplier_nome,
  COALESCE(SUM(CASE WHEN sl.tipo = 'ALOCACAO' AND sl.direcao = 'CREDIT' THEN sl.valor ELSE 0 END), 0) AS total_alocado,
  COALESCE(SUM(CASE WHEN sl.tipo = 'DEVOLUCAO' AND sl.direcao = 'DEBIT' THEN sl.valor ELSE 0 END), 0) AS total_devolvido,
  COALESCE(SUM(CASE WHEN sl.tipo = 'SAQUE' AND sl.direcao = 'DEBIT' THEN sl.valor ELSE 0 END), 0) AS total_sacado,
  COALESCE(SUM(CASE WHEN sl.tipo = 'DEPOSITO' AND sl.direcao = 'CREDIT' THEN sl.valor ELSE 0 END), 0) AS total_depositado_contas,
  (SELECT COALESCE(SUM(sba.saldo_atual), 0) 
   FROM public.supplier_bookmaker_accounts sba 
   WHERE sba.supplier_workspace_id = sl.supplier_workspace_id 
   AND sba.status = 'ATIVA') AS saldo_consolidado
FROM public.supplier_ledger sl
JOIN public.supplier_profiles sp ON sp.workspace_id = sl.supplier_workspace_id
GROUP BY sl.supplier_workspace_id, sp.nome;

-- 11. RPC para inserir no ledger com sequência atômica e validação de saldo
CREATE OR REPLACE FUNCTION public.supplier_ledger_insert(
  p_supplier_workspace_id UUID,
  p_bookmaker_account_id UUID,
  p_tipo TEXT,
  p_direcao TEXT,
  p_valor NUMERIC,
  p_descricao TEXT DEFAULT NULL,
  p_metadata JSONB DEFAULT '{}',
  p_created_by TEXT DEFAULT 'SYSTEM',
  p_idempotency_key TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_saldo_antes NUMERIC;
  v_saldo_depois NUMERIC;
  v_seq BIGINT;
  v_new_id UUID;
  v_total_alocado NUMERIC;
  v_total_usado NUMERIC;
BEGIN
  -- Idempotency check
  IF p_idempotency_key IS NOT NULL THEN
    IF EXISTS (SELECT 1 FROM supplier_ledger WHERE idempotency_key = p_idempotency_key) THEN
      RETURN jsonb_build_object('success', true, 'message', 'Evento já processado (idempotente)');
    END IF;
  END IF;

  -- Calcular saldo atual do workspace (último evento)
  SELECT COALESCE(saldo_depois, 0) INTO v_saldo_antes
  FROM supplier_ledger
  WHERE supplier_workspace_id = p_supplier_workspace_id
  ORDER BY sequencia DESC
  LIMIT 1;
  
  IF v_saldo_antes IS NULL THEN
    v_saldo_antes := 0;
  END IF;

  -- Calcular novo saldo
  IF p_direcao = 'CREDIT' THEN
    v_saldo_depois := v_saldo_antes + p_valor;
  ELSIF p_direcao = 'DEBIT' THEN
    -- Validar saldo suficiente (exceto para AJUSTE)
    IF p_tipo != 'AJUSTE' AND v_saldo_antes < p_valor THEN
      RETURN jsonb_build_object(
        'success', false, 
        'error', 'Saldo insuficiente. Disponível: ' || v_saldo_antes || ', Solicitado: ' || p_valor
      );
    END IF;
    v_saldo_depois := v_saldo_antes - p_valor;
  ELSE
    RETURN jsonb_build_object('success', false, 'error', 'Direção inválida: ' || p_direcao);
  END IF;

  -- Obter próxima sequência
  v_seq := nextval('supplier_ledger_seq');

  -- Inserir evento
  INSERT INTO supplier_ledger (
    supplier_workspace_id, bookmaker_account_id, tipo, direcao,
    valor, saldo_antes, saldo_depois, sequencia,
    descricao, metadata, created_by, idempotency_key
  ) VALUES (
    p_supplier_workspace_id, p_bookmaker_account_id, p_tipo, p_direcao,
    p_valor, v_saldo_antes, v_saldo_depois, v_seq,
    p_descricao, p_metadata, p_created_by, p_idempotency_key
  )
  RETURNING id INTO v_new_id;

  -- Se for depósito em conta, atualizar saldo da conta
  IF p_bookmaker_account_id IS NOT NULL THEN
    IF p_direcao = 'CREDIT' THEN
      UPDATE supplier_bookmaker_accounts 
      SET saldo_atual = saldo_atual + p_valor, updated_at = now()
      WHERE id = p_bookmaker_account_id;
    ELSE
      UPDATE supplier_bookmaker_accounts 
      SET saldo_atual = saldo_atual - p_valor, updated_at = now()
      WHERE id = p_bookmaker_account_id;
    END IF;
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'event_id', v_new_id,
    'saldo_antes', v_saldo_antes,
    'saldo_depois', v_saldo_depois,
    'sequencia', v_seq
  );
END;
$$;

-- 12. RPC para validar token de acesso do fornecedor
CREATE OR REPLACE FUNCTION public.validate_supplier_token(p_token_hash TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_token RECORD;
  v_profile RECORD;
BEGIN
  SELECT * INTO v_token
  FROM supplier_access_tokens
  WHERE token_hash = p_token_hash
  AND revoked_at IS NULL
  AND expires_at > now()
  AND (max_uses IS NULL OR use_count < max_uses);

  IF NOT FOUND THEN
    RETURN jsonb_build_object('valid', false, 'error', 'Token inválido ou expirado');
  END IF;

  -- Buscar perfil do fornecedor
  SELECT * INTO v_profile
  FROM supplier_profiles
  WHERE workspace_id = v_token.supplier_workspace_id
  AND status = 'ATIVO';

  IF NOT FOUND THEN
    RETURN jsonb_build_object('valid', false, 'error', 'Fornecedor não encontrado ou inativo');
  END IF;

  -- Incrementar uso
  UPDATE supplier_access_tokens 
  SET use_count = use_count + 1, last_used_at = now()
  WHERE id = v_token.id;

  RETURN jsonb_build_object(
    'valid', true,
    'supplier_workspace_id', v_token.supplier_workspace_id,
    'supplier_profile_id', v_profile.id,
    'supplier_nome', v_profile.nome,
    'token_id', v_token.id,
    'expires_at', v_token.expires_at
  );
END;
$$;
