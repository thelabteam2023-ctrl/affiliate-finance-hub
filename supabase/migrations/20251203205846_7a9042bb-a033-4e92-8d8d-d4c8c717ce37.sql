-- Enum para status de indicador
DO $$ BEGIN
  CREATE TYPE indicador_status AS ENUM ('ATIVO', 'TOP_VIP', 'EM_OBSERVACAO', 'INATIVO');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- Enum para status de parceria
DO $$ BEGIN
  CREATE TYPE parceria_status AS ENUM ('ATIVA', 'EM_ENCERRAMENTO', 'ENCERRADA', 'RENOVADA');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- 1. Tabela de Indicadores
CREATE TABLE IF NOT EXISTS public.indicadores_referral (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  nome TEXT NOT NULL,
  cpf TEXT NOT NULL,
  telefone TEXT,
  email TEXT,
  status TEXT NOT NULL DEFAULT 'ATIVO',
  observacoes TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(user_id, cpf)
);

ALTER TABLE public.indicadores_referral ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own indicadores" ON public.indicadores_referral
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own indicadores" ON public.indicadores_referral
  FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own indicadores" ON public.indicadores_referral
  FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own indicadores" ON public.indicadores_referral
  FOR DELETE USING (auth.uid() = user_id);

-- 2. Tabela de Indicações (quem indicou quem)
CREATE TABLE IF NOT EXISTS public.indicacoes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  indicador_id UUID NOT NULL REFERENCES public.indicadores_referral(id) ON DELETE CASCADE,
  parceiro_id UUID NOT NULL REFERENCES public.parceiros(id) ON DELETE CASCADE,
  data_indicacao TIMESTAMPTZ DEFAULT now(),
  origem TEXT,
  observacoes TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(user_id, parceiro_id)
);

ALTER TABLE public.indicacoes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own indicacoes" ON public.indicacoes
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own indicacoes" ON public.indicacoes
  FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own indicacoes" ON public.indicacoes
  FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own indicacoes" ON public.indicacoes
  FOR DELETE USING (auth.uid() = user_id);

-- 3. Tabela de Parcerias
CREATE TABLE IF NOT EXISTS public.parcerias (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  parceiro_id UUID NOT NULL REFERENCES public.parceiros(id) ON DELETE CASCADE,
  indicacao_id UUID REFERENCES public.indicacoes(id) ON DELETE SET NULL,
  
  data_inicio DATE NOT NULL DEFAULT CURRENT_DATE,
  duracao_dias INTEGER NOT NULL DEFAULT 60,
  data_fim_prevista DATE,
  data_fim_real DATE,
  
  valor_comissao_indicador NUMERIC DEFAULT 0,
  comissao_paga BOOLEAN DEFAULT FALSE,
  
  status TEXT NOT NULL DEFAULT 'ATIVA',
  motivo_encerramento TEXT,
  elegivel_renovacao BOOLEAN DEFAULT TRUE,
  
  observacoes TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.parcerias ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own parcerias" ON public.parcerias
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own parcerias" ON public.parcerias
  FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own parcerias" ON public.parcerias
  FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own parcerias" ON public.parcerias
  FOR DELETE USING (auth.uid() = user_id);

-- Trigger para calcular data_fim_prevista automaticamente
CREATE OR REPLACE FUNCTION public.calculate_data_fim_prevista()
RETURNS TRIGGER AS $$
BEGIN
  NEW.data_fim_prevista := NEW.data_inicio + (NEW.duracao_dias || ' days')::INTERVAL;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS tr_calculate_data_fim ON public.parcerias;
CREATE TRIGGER tr_calculate_data_fim
  BEFORE INSERT OR UPDATE OF data_inicio, duracao_dias ON public.parcerias
  FOR EACH ROW EXECUTE FUNCTION public.calculate_data_fim_prevista();

-- 4. Tabela de Movimentações de Indicação (isolada do caixa)
CREATE TABLE IF NOT EXISTS public.movimentacoes_indicacao (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  parceria_id UUID NOT NULL REFERENCES public.parcerias(id) ON DELETE CASCADE,
  indicador_id UUID REFERENCES public.indicadores_referral(id) ON DELETE SET NULL,
  
  tipo TEXT NOT NULL,
  valor NUMERIC NOT NULL,
  moeda TEXT NOT NULL DEFAULT 'BRL',
  
  data_movimentacao TIMESTAMPTZ DEFAULT now(),
  descricao TEXT,
  status TEXT NOT NULL DEFAULT 'CONFIRMADO',
  
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.movimentacoes_indicacao ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own movimentacoes_indicacao" ON public.movimentacoes_indicacao
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own movimentacoes_indicacao" ON public.movimentacoes_indicacao
  FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own movimentacoes_indicacao" ON public.movimentacoes_indicacao
  FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own movimentacoes_indicacao" ON public.movimentacoes_indicacao
  FOR DELETE USING (auth.uid() = user_id);

-- 5. Tabela de Promoções de Indicação
CREATE TABLE IF NOT EXISTS public.promocoes_indicacao (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  
  nome TEXT NOT NULL,
  descricao TEXT,
  
  data_inicio DATE NOT NULL,
  data_fim DATE NOT NULL,
  
  meta_parceiros INTEGER NOT NULL,
  valor_bonus NUMERIC NOT NULL,
  
  status TEXT NOT NULL DEFAULT 'ATIVA',
  
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.promocoes_indicacao ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own promocoes" ON public.promocoes_indicacao
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own promocoes" ON public.promocoes_indicacao
  FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own promocoes" ON public.promocoes_indicacao
  FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own promocoes" ON public.promocoes_indicacao
  FOR DELETE USING (auth.uid() = user_id);

-- 6. Tabela de Participantes de Promoção
CREATE TABLE IF NOT EXISTS public.promocao_participantes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  promocao_id UUID NOT NULL REFERENCES public.promocoes_indicacao(id) ON DELETE CASCADE,
  indicador_id UUID NOT NULL REFERENCES public.indicadores_referral(id) ON DELETE CASCADE,
  
  parceiros_indicados INTEGER DEFAULT 0,
  meta_atingida BOOLEAN DEFAULT FALSE,
  bonus_pago BOOLEAN DEFAULT FALSE,
  data_pagamento_bonus TIMESTAMPTZ,
  
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  
  UNIQUE(promocao_id, indicador_id)
);

ALTER TABLE public.promocao_participantes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own promocao_participantes" ON public.promocao_participantes
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own promocao_participantes" ON public.promocao_participantes
  FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own promocao_participantes" ON public.promocao_participantes
  FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own promocao_participantes" ON public.promocao_participantes
  FOR DELETE USING (auth.uid() = user_id);

-- Views para relatórios

-- View: Performance dos Indicadores
CREATE OR REPLACE VIEW public.v_indicador_performance AS
SELECT 
  i.id AS indicador_id,
  i.user_id,
  i.nome,
  i.cpf,
  i.status,
  i.telefone,
  i.email,
  COUNT(DISTINCT ind.parceiro_id) AS total_parceiros_indicados,
  COUNT(DISTINCT CASE WHEN p.status = 'ATIVA' THEN p.id END) AS parcerias_ativas,
  COUNT(DISTINCT CASE WHEN p.status = 'ENCERRADA' THEN p.id END) AS parcerias_encerradas,
  COALESCE(SUM(m.valor) FILTER (WHERE m.tipo = 'COMISSAO_INDICADOR' AND m.status = 'CONFIRMADO'), 0) AS total_comissoes,
  COALESCE(SUM(m.valor) FILTER (WHERE m.tipo = 'BONUS_PROMOCAO' AND m.status = 'CONFIRMADO'), 0) AS total_bonus
FROM public.indicadores_referral i
LEFT JOIN public.indicacoes ind ON i.id = ind.indicador_id AND i.user_id = ind.user_id
LEFT JOIN public.parcerias p ON ind.id = p.indicacao_id AND i.user_id = p.user_id
LEFT JOIN public.movimentacoes_indicacao m ON i.id = m.indicador_id AND i.user_id = m.user_id
WHERE i.user_id = auth.uid()
GROUP BY i.id, i.user_id, i.nome, i.cpf, i.status, i.telefone, i.email;

-- View: Parcerias com Alerta de Encerramento
CREATE OR REPLACE VIEW public.v_parcerias_alerta AS
SELECT 
  p.id,
  p.user_id,
  p.parceiro_id,
  p.indicacao_id,
  p.data_inicio,
  p.duracao_dias,
  p.data_fim_prevista,
  p.data_fim_real,
  p.valor_comissao_indicador,
  p.comissao_paga,
  p.status,
  p.elegivel_renovacao,
  p.observacoes,
  par.nome AS parceiro_nome,
  par.cpf AS parceiro_cpf,
  i.nome AS indicador_nome,
  (p.data_fim_prevista - CURRENT_DATE) AS dias_restantes,
  CASE 
    WHEN (p.data_fim_prevista - CURRENT_DATE) <= 0 THEN 'VENCIDA'
    WHEN (p.data_fim_prevista - CURRENT_DATE) <= 10 THEN 'ALERTA'
    WHEN (p.data_fim_prevista - CURRENT_DATE) <= 20 THEN 'ATENCAO'
    ELSE 'OK'
  END AS nivel_alerta
FROM public.parcerias p
JOIN public.parceiros par ON p.parceiro_id = par.id
LEFT JOIN public.indicacoes ind ON p.indicacao_id = ind.id
LEFT JOIN public.indicadores_referral i ON ind.indicador_id = i.id
WHERE p.user_id = auth.uid() AND p.status IN ('ATIVA', 'EM_ENCERRAMENTO');

-- Função para atualizar status de parcerias próximas do vencimento
CREATE OR REPLACE FUNCTION public.update_parcerias_em_encerramento()
RETURNS void AS $$
BEGIN
  UPDATE public.parcerias
  SET status = 'EM_ENCERRAMENTO', updated_at = now()
  WHERE status = 'ATIVA'
    AND (data_fim_prevista - CURRENT_DATE) <= 10
    AND (data_fim_prevista - CURRENT_DATE) > 0;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;