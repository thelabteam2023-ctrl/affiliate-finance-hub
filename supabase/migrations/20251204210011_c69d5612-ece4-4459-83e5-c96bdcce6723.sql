-- Tabela de promoções de Matched Betting
CREATE TABLE public.matched_betting_promocoes (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  bookmaker_catalogo_id UUID REFERENCES public.bookmakers_catalogo(id),
  nome TEXT NOT NULL,
  tipo TEXT NOT NULL DEFAULT 'WELCOME_BONUS',
  valor_bonus NUMERIC NOT NULL,
  valor_minimo_aposta NUMERIC,
  odd_minima NUMERIC DEFAULT 1.5,
  rollover NUMERIC DEFAULT 1,
  stake_returned BOOLEAN NOT NULL DEFAULT false,
  data_expiracao DATE,
  observacoes TEXT,
  status TEXT NOT NULL DEFAULT 'ATIVA',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Tabela de rounds de Matched Betting
CREATE TABLE public.matched_betting_rounds (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  projeto_id UUID NOT NULL REFERENCES public.projetos(id) ON DELETE CASCADE,
  promocao_id UUID REFERENCES public.matched_betting_promocoes(id),
  tipo_round TEXT NOT NULL DEFAULT 'QUALIFYING_BET',
  evento TEXT NOT NULL,
  esporte TEXT NOT NULL,
  mercado TEXT NOT NULL,
  data_evento TIMESTAMPTZ NOT NULL,
  status TEXT NOT NULL DEFAULT 'PENDENTE',
  lucro_esperado NUMERIC,
  lucro_real NUMERIC,
  observacoes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Tabela de pernas (apostas individuais) dentro de um round
CREATE TABLE public.matched_betting_pernas (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  round_id UUID NOT NULL REFERENCES public.matched_betting_rounds(id) ON DELETE CASCADE,
  bookmaker_id UUID NOT NULL REFERENCES public.bookmakers(id),
  tipo_aposta TEXT NOT NULL,
  selecao TEXT NOT NULL,
  odd NUMERIC NOT NULL,
  stake NUMERIC NOT NULL,
  comissao_exchange NUMERIC DEFAULT 0,
  is_free_bet BOOLEAN NOT NULL DEFAULT false,
  liability NUMERIC,
  resultado TEXT,
  retorno NUMERIC,
  lucro_prejuizo NUMERIC,
  status TEXT NOT NULL DEFAULT 'PENDENTE',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.matched_betting_promocoes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.matched_betting_rounds ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.matched_betting_pernas ENABLE ROW LEVEL SECURITY;

-- RLS Policies para promocoes
CREATE POLICY "Users can view own promocoes" ON public.matched_betting_promocoes
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own promocoes" ON public.matched_betting_promocoes
  FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own promocoes" ON public.matched_betting_promocoes
  FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own promocoes" ON public.matched_betting_promocoes
  FOR DELETE USING (auth.uid() = user_id);

-- RLS Policies para rounds
CREATE POLICY "Users can view own rounds" ON public.matched_betting_rounds
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own rounds" ON public.matched_betting_rounds
  FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own rounds" ON public.matched_betting_rounds
  FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own rounds" ON public.matched_betting_rounds
  FOR DELETE USING (auth.uid() = user_id);

-- RLS Policies para pernas (via round ownership)
CREATE POLICY "Users can view own pernas" ON public.matched_betting_pernas
  FOR SELECT USING (EXISTS (
    SELECT 1 FROM matched_betting_rounds r WHERE r.id = round_id AND r.user_id = auth.uid()
  ));
CREATE POLICY "Users can insert own pernas" ON public.matched_betting_pernas
  FOR INSERT WITH CHECK (EXISTS (
    SELECT 1 FROM matched_betting_rounds r WHERE r.id = round_id AND r.user_id = auth.uid()
  ));
CREATE POLICY "Users can update own pernas" ON public.matched_betting_pernas
  FOR UPDATE USING (EXISTS (
    SELECT 1 FROM matched_betting_rounds r WHERE r.id = round_id AND r.user_id = auth.uid()
  ));
CREATE POLICY "Users can delete own pernas" ON public.matched_betting_pernas
  FOR DELETE USING (EXISTS (
    SELECT 1 FROM matched_betting_rounds r WHERE r.id = round_id AND r.user_id = auth.uid()
  ));

-- Triggers para updated_at
CREATE TRIGGER update_matched_betting_promocoes_updated_at
  BEFORE UPDATE ON public.matched_betting_promocoes
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_matched_betting_rounds_updated_at
  BEFORE UPDATE ON public.matched_betting_rounds
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- View para resumo de Matched Betting por projeto
CREATE VIEW public.v_matched_betting_resumo WITH (security_invoker = true) AS
SELECT 
  r.projeto_id,
  r.user_id,
  COUNT(*) as total_rounds,
  SUM(CASE WHEN r.status = 'CONCLUIDO' THEN 1 ELSE 0 END) as rounds_concluidos,
  SUM(CASE WHEN r.tipo_round = 'QUALIFYING_BET' THEN 1 ELSE 0 END) as qualifying_bets,
  SUM(CASE WHEN r.tipo_round = 'FREE_BET' THEN 1 ELSE 0 END) as free_bets,
  COALESCE(SUM(r.lucro_real), 0) as lucro_total,
  COALESCE(AVG(r.lucro_real), 0) as lucro_medio,
  CASE 
    WHEN COUNT(*) FILTER (WHERE r.status = 'CONCLUIDO') > 0 
    THEN (COUNT(*) FILTER (WHERE r.lucro_real > 0 AND r.status = 'CONCLUIDO')::float / 
          COUNT(*) FILTER (WHERE r.status = 'CONCLUIDO') * 100)
    ELSE 0 
  END as taxa_sucesso
FROM public.matched_betting_rounds r
WHERE r.status != 'CANCELADO'
  AND r.user_id = auth.uid()
GROUP BY r.projeto_id, r.user_id;