-- =============================================
-- MÓDULO DE OPERADORES - FASE 1: INFRAESTRUTURA
-- =============================================

-- 1. TABELA: operadores
CREATE TABLE public.operadores (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  nome TEXT NOT NULL,
  cpf TEXT NOT NULL,
  email TEXT,
  telefone TEXT,
  data_nascimento DATE,
  status TEXT NOT NULL DEFAULT 'ATIVO',
  tipo_contrato TEXT NOT NULL DEFAULT 'CLT',
  data_admissao DATE NOT NULL DEFAULT CURRENT_DATE,
  data_desligamento DATE,
  observacoes TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  CONSTRAINT operadores_cpf_user_unique UNIQUE (user_id, cpf),
  CONSTRAINT operadores_status_check CHECK (status IN ('ATIVO', 'INATIVO', 'BLOQUEADO')),
  CONSTRAINT operadores_tipo_contrato_check CHECK (tipo_contrato IN ('CLT', 'PJ', 'AUTONOMO', 'FREELANCER'))
);

-- Índices para operadores
CREATE INDEX idx_operadores_user_id ON public.operadores(user_id);
CREATE INDEX idx_operadores_status ON public.operadores(status);
CREATE INDEX idx_operadores_cpf ON public.operadores(cpf);

-- RLS para operadores
ALTER TABLE public.operadores ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own operadores"
ON public.operadores FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own operadores"
ON public.operadores FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own operadores"
ON public.operadores FOR UPDATE
USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own operadores"
ON public.operadores FOR DELETE
USING (auth.uid() = user_id);

-- Trigger para updated_at
CREATE TRIGGER update_operadores_updated_at
BEFORE UPDATE ON public.operadores
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- 2. TABELA: projetos
CREATE TABLE public.projetos (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  nome TEXT NOT NULL,
  descricao TEXT,
  status TEXT NOT NULL DEFAULT 'PLANEJADO',
  data_inicio DATE,
  data_fim_prevista DATE,
  data_fim_real DATE,
  orcamento_inicial NUMERIC DEFAULT 0,
  observacoes TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  CONSTRAINT projetos_status_check CHECK (status IN ('PLANEJADO', 'EM_ANDAMENTO', 'PAUSADO', 'FINALIZADO'))
);

-- Índices para projetos
CREATE INDEX idx_projetos_user_id ON public.projetos(user_id);
CREATE INDEX idx_projetos_status ON public.projetos(status);

-- RLS para projetos
ALTER TABLE public.projetos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own projetos"
ON public.projetos FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own projetos"
ON public.projetos FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own projetos"
ON public.projetos FOR UPDATE
USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own projetos"
ON public.projetos FOR DELETE
USING (auth.uid() = user_id);

-- Trigger para updated_at
CREATE TRIGGER update_projetos_updated_at
BEFORE UPDATE ON public.projetos
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- 3. TABELA: operador_projetos (vínculo N:N com histórico)
CREATE TABLE public.operador_projetos (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  operador_id UUID NOT NULL REFERENCES public.operadores(id) ON DELETE CASCADE,
  projeto_id UUID NOT NULL REFERENCES public.projetos(id) ON DELETE CASCADE,
  data_entrada DATE NOT NULL DEFAULT CURRENT_DATE,
  data_saida DATE,
  status TEXT NOT NULL DEFAULT 'ATIVO',
  funcao TEXT,
  motivo_saida TEXT,
  observacoes TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  CONSTRAINT operador_projetos_status_check CHECK (status IN ('ATIVO', 'FINALIZADO', 'SUSPENSO'))
);

-- Índices para operador_projetos
CREATE INDEX idx_operador_projetos_user_id ON public.operador_projetos(user_id);
CREATE INDEX idx_operador_projetos_operador_id ON public.operador_projetos(operador_id);
CREATE INDEX idx_operador_projetos_projeto_id ON public.operador_projetos(projeto_id);
CREATE INDEX idx_operador_projetos_status ON public.operador_projetos(status);

-- RLS para operador_projetos
ALTER TABLE public.operador_projetos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own operador_projetos"
ON public.operador_projetos FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own operador_projetos"
ON public.operador_projetos FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own operador_projetos"
ON public.operador_projetos FOR UPDATE
USING (auth.uid() = user_id);

-- Não permitir DELETE para manter histórico (append-only)
-- Usuários devem atualizar status para FINALIZADO

-- Trigger para updated_at
CREATE TRIGGER update_operador_projetos_updated_at
BEFORE UPDATE ON public.operador_projetos
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- 4. TABELA: pagamentos_operador
CREATE TABLE public.pagamentos_operador (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  operador_id UUID NOT NULL REFERENCES public.operadores(id) ON DELETE CASCADE,
  projeto_id UUID REFERENCES public.projetos(id) ON DELETE SET NULL,
  tipo_pagamento TEXT NOT NULL DEFAULT 'SALARIO',
  valor NUMERIC NOT NULL,
  moeda TEXT NOT NULL DEFAULT 'BRL',
  data_pagamento DATE NOT NULL DEFAULT CURRENT_DATE,
  data_competencia DATE,
  descricao TEXT,
  status TEXT NOT NULL DEFAULT 'PENDENTE',
  cash_ledger_id UUID REFERENCES public.cash_ledger(id) ON DELETE SET NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  CONSTRAINT pagamentos_operador_tipo_check CHECK (tipo_pagamento IN ('SALARIO', 'COMISSAO', 'BONUS', 'ADIANTAMENTO', 'REEMBOLSO', 'OUTROS')),
  CONSTRAINT pagamentos_operador_status_check CHECK (status IN ('PENDENTE', 'CONFIRMADO', 'CANCELADO'))
);

-- Índices para pagamentos_operador
CREATE INDEX idx_pagamentos_operador_user_id ON public.pagamentos_operador(user_id);
CREATE INDEX idx_pagamentos_operador_operador_id ON public.pagamentos_operador(operador_id);
CREATE INDEX idx_pagamentos_operador_projeto_id ON public.pagamentos_operador(projeto_id);
CREATE INDEX idx_pagamentos_operador_data ON public.pagamentos_operador(data_pagamento);
CREATE INDEX idx_pagamentos_operador_status ON public.pagamentos_operador(status);

-- RLS para pagamentos_operador
ALTER TABLE public.pagamentos_operador ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own pagamentos_operador"
ON public.pagamentos_operador FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own pagamentos_operador"
ON public.pagamentos_operador FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own pagamentos_operador"
ON public.pagamentos_operador FOR UPDATE
USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own pagamentos_operador"
ON public.pagamentos_operador FOR DELETE
USING (auth.uid() = user_id);

-- Trigger para updated_at
CREATE TRIGGER update_pagamentos_operador_updated_at
BEFORE UPDATE ON public.pagamentos_operador
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- 5. VIEW: v_operador_performance (consolidado do operador)
CREATE OR REPLACE VIEW public.v_operador_performance AS
SELECT 
  o.id AS operador_id,
  o.user_id,
  o.nome,
  o.cpf,
  o.status,
  o.tipo_contrato,
  o.data_admissao,
  (SELECT COUNT(*) FROM public.operador_projetos op WHERE op.operador_id = o.id AND op.status = 'ATIVO') AS projetos_ativos,
  (SELECT COUNT(*) FROM public.operador_projetos op WHERE op.operador_id = o.id) AS total_projetos,
  (SELECT COALESCE(SUM(p.valor), 0) FROM public.pagamentos_operador p WHERE p.operador_id = o.id AND p.status = 'CONFIRMADO') AS total_pago,
  (SELECT COALESCE(SUM(p.valor), 0) FROM public.pagamentos_operador p WHERE p.operador_id = o.id AND p.status = 'PENDENTE') AS total_pendente
FROM public.operadores o
WHERE o.user_id = auth.uid();

-- 6. VIEW: v_projeto_resumo (resumo do projeto com operadores)
CREATE OR REPLACE VIEW public.v_projeto_resumo AS
SELECT 
  p.id AS projeto_id,
  p.user_id,
  p.nome,
  p.status,
  p.data_inicio,
  p.data_fim_prevista,
  p.orcamento_inicial,
  (SELECT COUNT(*) FROM public.operador_projetos op WHERE op.projeto_id = p.id AND op.status = 'ATIVO') AS operadores_ativos,
  (SELECT COALESCE(SUM(pg.valor), 0) FROM public.pagamentos_operador pg WHERE pg.projeto_id = p.id AND pg.status = 'CONFIRMADO') AS total_gasto_operadores
FROM public.projetos p
WHERE p.user_id = auth.uid();