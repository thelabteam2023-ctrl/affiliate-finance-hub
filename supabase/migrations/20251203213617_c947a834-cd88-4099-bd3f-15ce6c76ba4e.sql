
-- Criar tabela de fornecedores de parceiros
CREATE TABLE public.fornecedores (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  nome TEXT NOT NULL,
  documento TEXT,
  tipo_documento TEXT DEFAULT 'CPF',
  telefone TEXT,
  email TEXT,
  observacoes TEXT,
  status TEXT NOT NULL DEFAULT 'ATIVO',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.fornecedores ENABLE ROW LEVEL SECURITY;

-- RLS policies for fornecedores
CREATE POLICY "Users can view own fornecedores" ON public.fornecedores
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own fornecedores" ON public.fornecedores
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own fornecedores" ON public.fornecedores
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own fornecedores" ON public.fornecedores
  FOR DELETE USING (auth.uid() = user_id);

-- Criar tabela de acordos de indicadores
CREATE TABLE public.indicador_acordos (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  indicador_id UUID NOT NULL REFERENCES public.indicadores_referral(id) ON DELETE CASCADE,
  orcamento_por_parceiro NUMERIC NOT NULL DEFAULT 0,
  meta_parceiros INTEGER,
  valor_bonus NUMERIC,
  ativo BOOLEAN DEFAULT true,
  vigencia_inicio DATE DEFAULT CURRENT_DATE,
  vigencia_fim DATE,
  observacoes TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.indicador_acordos ENABLE ROW LEVEL SECURITY;

-- RLS policies for indicador_acordos
CREATE POLICY "Users can view own indicador_acordos" ON public.indicador_acordos
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own indicador_acordos" ON public.indicador_acordos
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own indicador_acordos" ON public.indicador_acordos
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own indicador_acordos" ON public.indicador_acordos
  FOR DELETE USING (auth.uid() = user_id);

-- Adicionar colunas na tabela parcerias
ALTER TABLE public.parcerias 
  ADD COLUMN IF NOT EXISTS origem_tipo TEXT DEFAULT 'INDICADOR',
  ADD COLUMN IF NOT EXISTS fornecedor_id UUID REFERENCES public.fornecedores(id),
  ADD COLUMN IF NOT EXISTS valor_fornecedor NUMERIC DEFAULT 0,
  ADD COLUMN IF NOT EXISTS valor_parceiro NUMERIC DEFAULT 0,
  ADD COLUMN IF NOT EXISTS valor_indicador NUMERIC DEFAULT 0;

-- Migrar dados existentes (valor_comissao_indicador -> valor_indicador)
UPDATE public.parcerias 
SET valor_indicador = COALESCE(valor_comissao_indicador, 0)
WHERE valor_indicador = 0 AND valor_comissao_indicador IS NOT NULL;

-- Criar view de custos de aquisição
CREATE OR REPLACE VIEW public.v_custos_aquisicao AS
SELECT 
  p.user_id,
  p.id as parceria_id,
  p.parceiro_id,
  par.nome as parceiro_nome,
  p.origem_tipo,
  p.data_inicio,
  p.status,
  -- Indicador info
  p.indicacao_id,
  ind.indicador_id,
  ir.nome as indicador_nome,
  p.valor_indicador,
  p.valor_parceiro,
  -- Fornecedor info
  p.fornecedor_id,
  f.nome as fornecedor_nome,
  p.valor_fornecedor,
  -- Custo total
  COALESCE(p.valor_indicador, 0) + COALESCE(p.valor_parceiro, 0) + COALESCE(p.valor_fornecedor, 0) as custo_total
FROM public.parcerias p
LEFT JOIN public.parceiros par ON p.parceiro_id = par.id
LEFT JOIN public.indicacoes ind ON p.indicacao_id = ind.id
LEFT JOIN public.indicadores_referral ir ON ind.indicador_id = ir.id
LEFT JOIN public.fornecedores f ON p.fornecedor_id = f.id
WHERE p.user_id = auth.uid();

-- Trigger para updated_at em fornecedores
CREATE TRIGGER update_fornecedores_updated_at
  BEFORE UPDATE ON public.fornecedores
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Trigger para updated_at em indicador_acordos
CREATE TRIGGER update_indicador_acordos_updated_at
  BEFORE UPDATE ON public.indicador_acordos
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();
