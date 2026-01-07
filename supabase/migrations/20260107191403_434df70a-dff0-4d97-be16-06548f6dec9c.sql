
-- Criar tabela de audit log específica para saldos de bookmakers
CREATE TABLE public.bookmaker_balance_audit (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  bookmaker_id UUID NOT NULL REFERENCES public.bookmakers(id) ON DELETE CASCADE,
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  user_id UUID,
  saldo_anterior NUMERIC NOT NULL,
  saldo_novo NUMERIC NOT NULL,
  diferenca NUMERIC GENERATED ALWAYS AS (saldo_novo - saldo_anterior) STORED,
  origem TEXT NOT NULL, -- 'SAQUE', 'DEPOSITO', 'APOSTA', 'CORRECAO_MANUAL', 'TRIGGER', etc.
  referencia_id UUID, -- ID da transação, aposta ou cash_ledger relacionado
  referencia_tipo TEXT, -- 'cash_ledger', 'apostas_unificada', 'manual', etc.
  observacoes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Índices para performance
CREATE INDEX idx_bookmaker_balance_audit_bookmaker ON public.bookmaker_balance_audit(bookmaker_id);
CREATE INDEX idx_bookmaker_balance_audit_workspace ON public.bookmaker_balance_audit(workspace_id);
CREATE INDEX idx_bookmaker_balance_audit_created ON public.bookmaker_balance_audit(created_at DESC);

-- Habilitar RLS
ALTER TABLE public.bookmaker_balance_audit ENABLE ROW LEVEL SECURITY;

-- Política: usuários só veem audits do seu workspace
CREATE POLICY "Usuários podem ver audits do seu workspace"
ON public.bookmaker_balance_audit
FOR SELECT
USING (
  workspace_id IN (
    SELECT workspace_id FROM public.workspace_members 
    WHERE user_id = auth.uid() AND is_active = true
  )
);

-- Política: apenas admins/owners podem inserir (via código backend)
CREATE POLICY "Admins podem inserir audits"
ON public.bookmaker_balance_audit
FOR INSERT
WITH CHECK (
  workspace_id IN (
    SELECT workspace_id FROM public.workspace_members 
    WHERE user_id = auth.uid() 
      AND is_active = true 
      AND role IN ('owner', 'admin')
  )
);

-- Função para registrar alteração de saldo com auditoria
CREATE OR REPLACE FUNCTION public.update_bookmaker_balance_with_audit(
  p_bookmaker_id UUID,
  p_novo_saldo NUMERIC,
  p_origem TEXT,
  p_referencia_id UUID DEFAULT NULL,
  p_referencia_tipo TEXT DEFAULT NULL,
  p_observacoes TEXT DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_saldo_anterior NUMERIC;
  v_workspace_id UUID;
BEGIN
  -- Buscar saldo atual e workspace
  SELECT saldo_atual, workspace_id 
  INTO v_saldo_anterior, v_workspace_id
  FROM bookmakers 
  WHERE id = p_bookmaker_id;
  
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Bookmaker não encontrado: %', p_bookmaker_id;
  END IF;
  
  -- Só registrar se houve alteração
  IF v_saldo_anterior IS DISTINCT FROM p_novo_saldo THEN
    -- Registrar no audit log
    INSERT INTO bookmaker_balance_audit (
      bookmaker_id,
      workspace_id,
      user_id,
      saldo_anterior,
      saldo_novo,
      origem,
      referencia_id,
      referencia_tipo,
      observacoes
    ) VALUES (
      p_bookmaker_id,
      v_workspace_id,
      auth.uid(),
      v_saldo_anterior,
      p_novo_saldo,
      p_origem,
      p_referencia_id,
      p_referencia_tipo,
      p_observacoes
    );
    
    -- Atualizar o saldo
    UPDATE bookmakers 
    SET saldo_atual = p_novo_saldo, updated_at = now()
    WHERE id = p_bookmaker_id;
  END IF;
END;
$$;

-- Função para incrementar/decrementar saldo com auditoria
CREATE OR REPLACE FUNCTION public.adjust_bookmaker_balance_with_audit(
  p_bookmaker_id UUID,
  p_delta NUMERIC,
  p_origem TEXT,
  p_referencia_id UUID DEFAULT NULL,
  p_referencia_tipo TEXT DEFAULT NULL,
  p_observacoes TEXT DEFAULT NULL
)
RETURNS NUMERIC
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_saldo_anterior NUMERIC;
  v_saldo_novo NUMERIC;
  v_workspace_id UUID;
BEGIN
  -- Buscar saldo atual e workspace
  SELECT saldo_atual, workspace_id 
  INTO v_saldo_anterior, v_workspace_id
  FROM bookmakers 
  WHERE id = p_bookmaker_id;
  
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Bookmaker não encontrado: %', p_bookmaker_id;
  END IF;
  
  v_saldo_novo := v_saldo_anterior + p_delta;
  
  -- Só registrar se houve alteração
  IF p_delta != 0 THEN
    -- Registrar no audit log
    INSERT INTO bookmaker_balance_audit (
      bookmaker_id,
      workspace_id,
      user_id,
      saldo_anterior,
      saldo_novo,
      origem,
      referencia_id,
      referencia_tipo,
      observacoes
    ) VALUES (
      p_bookmaker_id,
      v_workspace_id,
      auth.uid(),
      v_saldo_anterior,
      v_saldo_novo,
      p_origem,
      p_referencia_id,
      p_referencia_tipo,
      p_observacoes
    );
    
    -- Atualizar o saldo
    UPDATE bookmakers 
    SET saldo_atual = v_saldo_novo, updated_at = now()
    WHERE id = p_bookmaker_id;
  END IF;
  
  RETURN v_saldo_novo;
END;
$$;

-- Comentários para documentação
COMMENT ON TABLE public.bookmaker_balance_audit IS 'Registro de auditoria para todas as alterações de saldo de bookmakers';
COMMENT ON FUNCTION public.update_bookmaker_balance_with_audit IS 'Atualiza saldo de bookmaker com registro de auditoria';
COMMENT ON FUNCTION public.adjust_bookmaker_balance_with_audit IS 'Incrementa/decrementa saldo de bookmaker com registro de auditoria';
