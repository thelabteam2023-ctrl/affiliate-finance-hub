-- Tabela de apostas/operações de betting
CREATE TABLE public.apostas (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  projeto_id UUID NOT NULL REFERENCES public.projetos(id) ON DELETE CASCADE,
  
  -- Vínculo parceiro-bookmaker (qual conta está sendo usada)
  bookmaker_id UUID NOT NULL REFERENCES public.bookmakers(id) ON DELETE RESTRICT,
  
  -- Informações da aposta
  data_aposta TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  esporte TEXT NOT NULL,
  evento TEXT NOT NULL,
  mercado TEXT,
  selecao TEXT NOT NULL,
  odd NUMERIC NOT NULL,
  stake NUMERIC NOT NULL,
  
  -- Estratégia (arbitragem, surebet, valor, etc)
  estrategia TEXT DEFAULT 'VALOR',
  
  -- Aposta relacionada (para surebets/arbitragem - aposta de hedge)
  aposta_relacionada_id UUID REFERENCES public.apostas(id) ON DELETE SET NULL,
  
  -- Status e resultado
  status TEXT NOT NULL DEFAULT 'PENDENTE',
  resultado TEXT,
  valor_retorno NUMERIC,
  lucro_prejuizo NUMERIC,
  
  -- Metadados
  observacoes TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Índices para performance
CREATE INDEX idx_apostas_projeto ON public.apostas(projeto_id);
CREATE INDEX idx_apostas_bookmaker ON public.apostas(bookmaker_id);
CREATE INDEX idx_apostas_status ON public.apostas(status);
CREATE INDEX idx_apostas_data ON public.apostas(data_aposta);

-- Enable RLS
ALTER TABLE public.apostas ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Users can view own apostas"
ON public.apostas FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own apostas"
ON public.apostas FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own apostas"
ON public.apostas FOR UPDATE
USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own apostas"
ON public.apostas FOR DELETE
USING (auth.uid() = user_id);

-- Trigger para updated_at
CREATE TRIGGER update_apostas_updated_at
BEFORE UPDATE ON public.apostas
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- View para resumo de apostas por projeto
CREATE OR REPLACE VIEW public.v_projeto_apostas_resumo AS
SELECT 
  p.id as projeto_id,
  p.user_id,
  COUNT(a.id) as total_apostas,
  COUNT(CASE WHEN a.status = 'PENDENTE' THEN 1 END) as apostas_pendentes,
  COUNT(CASE WHEN a.status = 'REALIZADA' THEN 1 END) as apostas_realizadas,
  COUNT(CASE WHEN a.status = 'CONCLUIDA' THEN 1 END) as apostas_concluidas,
  COUNT(CASE WHEN a.resultado = 'GREEN' THEN 1 END) as greens,
  COUNT(CASE WHEN a.resultado = 'RED' THEN 1 END) as reds,
  COUNT(CASE WHEN a.resultado = 'VOID' THEN 1 END) as voids,
  COALESCE(SUM(a.stake), 0) as total_stake,
  COALESCE(SUM(a.lucro_prejuizo), 0) as lucro_total,
  CASE WHEN SUM(a.stake) > 0 THEN (SUM(a.lucro_prejuizo) / SUM(a.stake)) * 100 ELSE 0 END as roi_percentual
FROM public.projetos p
LEFT JOIN public.apostas a ON p.id = a.projeto_id
WHERE p.user_id = auth.uid()
GROUP BY p.id, p.user_id;