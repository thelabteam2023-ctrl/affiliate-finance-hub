-- Create bookmakers table
CREATE TABLE public.bookmakers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  nome TEXT NOT NULL,
  url TEXT,
  login_username TEXT NOT NULL,
  login_password_encrypted TEXT NOT NULL,
  saldo_atual DECIMAL(15, 2) NOT NULL DEFAULT 0,
  moeda TEXT NOT NULL DEFAULT 'BRL' CHECK (moeda IN ('BRL', 'USD', 'EUR', 'USDT', 'BTC', 'ETH')),
  status TEXT NOT NULL DEFAULT 'ativo' CHECK (status IN ('ativo', 'inativo', 'suspenso', 'bloqueado')),
  observacoes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, nome)
);

ALTER TABLE public.bookmakers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own bookmakers"
  ON public.bookmakers FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own bookmakers"
  ON public.bookmakers FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own bookmakers"
  ON public.bookmakers FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own bookmakers"
  ON public.bookmakers FOR DELETE
  USING (auth.uid() = user_id);

-- Create bookmaker transactions table
CREATE TABLE public.transacoes_bookmakers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  bookmaker_id UUID NOT NULL REFERENCES public.bookmakers(id) ON DELETE CASCADE,
  tipo TEXT NOT NULL CHECK (tipo IN ('deposito', 'retirada', 'aposta', 'ganho', 'ajuste', 'bonus')),
  valor DECIMAL(15, 2) NOT NULL,
  saldo_anterior DECIMAL(15, 2) NOT NULL,
  saldo_novo DECIMAL(15, 2) NOT NULL,
  descricao TEXT,
  referencia_externa TEXT,
  data_transacao TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.transacoes_bookmakers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own bookmaker transactions"
  ON public.transacoes_bookmakers FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM public.bookmakers
    WHERE bookmakers.id = transacoes_bookmakers.bookmaker_id
    AND bookmakers.user_id = auth.uid()
  ));

CREATE POLICY "Users can insert own bookmaker transactions"
  ON public.transacoes_bookmakers FOR INSERT
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.bookmakers
    WHERE bookmakers.id = transacoes_bookmakers.bookmaker_id
    AND bookmakers.user_id = auth.uid()
  ));

CREATE POLICY "Users can update own bookmaker transactions"
  ON public.transacoes_bookmakers FOR UPDATE
  USING (EXISTS (
    SELECT 1 FROM public.bookmakers
    WHERE bookmakers.id = transacoes_bookmakers.bookmaker_id
    AND bookmakers.user_id = auth.uid()
  ));

CREATE POLICY "Users can delete own bookmaker transactions"
  ON public.transacoes_bookmakers FOR DELETE
  USING (EXISTS (
    SELECT 1 FROM public.bookmakers
    WHERE bookmakers.id = transacoes_bookmakers.bookmaker_id
    AND bookmakers.user_id = auth.uid()
  ));

-- Create trigger for bookmakers updated_at
CREATE TRIGGER update_bookmakers_updated_at
  BEFORE UPDATE ON public.bookmakers
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Create function to update bookmaker balance
CREATE OR REPLACE FUNCTION public.atualizar_saldo_bookmaker()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE public.bookmakers
  SET saldo_atual = NEW.saldo_novo
  WHERE id = NEW.bookmaker_id;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Create trigger to auto-update bookmaker balance on transaction
CREATE TRIGGER update_bookmaker_saldo_on_transaction
  AFTER INSERT ON public.transacoes_bookmakers
  FOR EACH ROW
  EXECUTE FUNCTION public.atualizar_saldo_bookmaker();

-- Create index for better performance
CREATE INDEX idx_transacoes_bookmakers_bookmaker_id ON public.transacoes_bookmakers(bookmaker_id);
CREATE INDEX idx_transacoes_bookmakers_data ON public.transacoes_bookmakers(data_transacao DESC);