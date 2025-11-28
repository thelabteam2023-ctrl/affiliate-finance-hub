-- Create profiles table for user data
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT,
  full_name TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own profile"
  ON public.profiles FOR SELECT
  USING (auth.uid() = id);

CREATE POLICY "Users can update own profile"
  ON public.profiles FOR UPDATE
  USING (auth.uid() = id);

-- Create partners table
CREATE TABLE public.parceiros (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  nome TEXT NOT NULL,
  cpf TEXT NOT NULL,
  email TEXT,
  telefone TEXT,
  data_nascimento DATE,
  status TEXT NOT NULL DEFAULT 'ativo' CHECK (status IN ('ativo', 'inativo', 'suspenso')),
  observacoes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, cpf)
);

ALTER TABLE public.parceiros ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own partners"
  ON public.parceiros FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own partners"
  ON public.parceiros FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own partners"
  ON public.parceiros FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own partners"
  ON public.parceiros FOR DELETE
  USING (auth.uid() = user_id);

-- Create bank accounts table
CREATE TABLE public.contas_bancarias (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  parceiro_id UUID NOT NULL REFERENCES public.parceiros(id) ON DELETE CASCADE,
  banco TEXT NOT NULL,
  agencia TEXT NOT NULL,
  conta TEXT NOT NULL,
  tipo_conta TEXT NOT NULL CHECK (tipo_conta IN ('corrente', 'poupanca', 'pagamento')),
  titular TEXT NOT NULL,
  pix_key TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.contas_bancarias ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own bank accounts"
  ON public.contas_bancarias FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM public.parceiros
    WHERE parceiros.id = contas_bancarias.parceiro_id
    AND parceiros.user_id = auth.uid()
  ));

CREATE POLICY "Users can insert own bank accounts"
  ON public.contas_bancarias FOR INSERT
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.parceiros
    WHERE parceiros.id = contas_bancarias.parceiro_id
    AND parceiros.user_id = auth.uid()
  ));

CREATE POLICY "Users can update own bank accounts"
  ON public.contas_bancarias FOR UPDATE
  USING (EXISTS (
    SELECT 1 FROM public.parceiros
    WHERE parceiros.id = contas_bancarias.parceiro_id
    AND parceiros.user_id = auth.uid()
  ));

CREATE POLICY "Users can delete own bank accounts"
  ON public.contas_bancarias FOR DELETE
  USING (EXISTS (
    SELECT 1 FROM public.parceiros
    WHERE parceiros.id = contas_bancarias.parceiro_id
    AND parceiros.user_id = auth.uid()
  ));

-- Create crypto wallets table
CREATE TABLE public.wallets_crypto (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  parceiro_id UUID NOT NULL REFERENCES public.parceiros(id) ON DELETE CASCADE,
  moeda TEXT NOT NULL CHECK (moeda IN ('BTC', 'ETH', 'USDT', 'USDC', 'BNB', 'SOL', 'ADA', 'DOT', 'MATIC', 'TRX')),
  endereco TEXT NOT NULL,
  network TEXT NOT NULL,
  label TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.wallets_crypto ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own crypto wallets"
  ON public.wallets_crypto FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM public.parceiros
    WHERE parceiros.id = wallets_crypto.parceiro_id
    AND parceiros.user_id = auth.uid()
  ));

CREATE POLICY "Users can insert own crypto wallets"
  ON public.wallets_crypto FOR INSERT
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.parceiros
    WHERE parceiros.id = wallets_crypto.parceiro_id
    AND parceiros.user_id = auth.uid()
  ));

CREATE POLICY "Users can update own crypto wallets"
  ON public.wallets_crypto FOR UPDATE
  USING (EXISTS (
    SELECT 1 FROM public.parceiros
    WHERE parceiros.id = wallets_crypto.parceiro_id
    AND parceiros.user_id = auth.uid()
  ));

CREATE POLICY "Users can delete own crypto wallets"
  ON public.wallets_crypto FOR DELETE
  USING (EXISTS (
    SELECT 1 FROM public.parceiros
    WHERE parceiros.id = wallets_crypto.parceiro_id
    AND parceiros.user_id = auth.uid()
  ));

-- Create trigger function for updating updated_at
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create triggers for updated_at
CREATE TRIGGER update_profiles_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_parceiros_updated_at
  BEFORE UPDATE ON public.parceiros
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_contas_bancarias_updated_at
  BEFORE UPDATE ON public.contas_bancarias
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_wallets_crypto_updated_at
  BEFORE UPDATE ON public.wallets_crypto
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Create trigger to auto-create profile on user signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', '')
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();