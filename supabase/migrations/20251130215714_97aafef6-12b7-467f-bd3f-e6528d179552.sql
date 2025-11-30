-- Create cash_ledger table for centralized financial tracking
CREATE TABLE public.cash_ledger (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  data_transacao TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  
  -- Transaction type
  tipo_transacao TEXT NOT NULL CHECK (tipo_transacao IN ('APORTE_FINANCEIRO', 'TRANSFERENCIA', 'DEPOSITO', 'SAQUE')),
  
  -- Currency information
  tipo_moeda TEXT NOT NULL CHECK (tipo_moeda IN ('FIAT', 'CRYPTO')),
  moeda TEXT NOT NULL, -- BRL, USD, EUR for FIAT
  coin TEXT, -- BTC, ETH, USDT for CRYPTO
  
  -- Amount details
  valor NUMERIC NOT NULL CHECK (valor > 0),
  valor_usd NUMERIC, -- Converted value in USD
  qtd_coin NUMERIC, -- Quantity for crypto
  cotacao NUMERIC, -- Exchange rate used
  
  -- Origin tracking (polymorphic)
  origem_tipo TEXT CHECK (origem_tipo IN ('CAIXA_OPERACIONAL', 'PARCEIRO_CONTA', 'PARCEIRO_WALLET', 'BOOKMAKER')),
  origem_parceiro_id UUID REFERENCES public.parceiros(id) ON DELETE SET NULL,
  origem_conta_bancaria_id UUID REFERENCES public.contas_bancarias(id) ON DELETE SET NULL,
  origem_wallet_id UUID REFERENCES public.wallets_crypto(id) ON DELETE SET NULL,
  origem_bookmaker_id UUID REFERENCES public.bookmakers(id) ON DELETE SET NULL,
  
  -- Destination tracking (polymorphic)
  destino_tipo TEXT CHECK (destino_tipo IN ('CAIXA_OPERACIONAL', 'PARCEIRO_CONTA', 'PARCEIRO_WALLET', 'BOOKMAKER')),
  destino_parceiro_id UUID REFERENCES public.parceiros(id) ON DELETE SET NULL,
  destino_conta_bancaria_id UUID REFERENCES public.contas_bancarias(id) ON DELETE SET NULL,
  destino_wallet_id UUID REFERENCES public.wallets_crypto(id) ON DELETE SET NULL,
  destino_bookmaker_id UUID REFERENCES public.bookmakers(id) ON DELETE SET NULL,
  
  -- Additional information
  descricao TEXT,
  status TEXT NOT NULL DEFAULT 'CONFIRMADO' CHECK (status IN ('CONFIRMADO', 'PENDENTE', 'CANCELADO')),
  
  -- Metadata
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.cash_ledger ENABLE ROW LEVEL SECURITY;

-- RLS Policies for tenant isolation
CREATE POLICY "Users can view own cash ledger"
ON public.cash_ledger
FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own cash ledger"
ON public.cash_ledger
FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own cash ledger"
ON public.cash_ledger
FOR UPDATE
USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own cash ledger"
ON public.cash_ledger
FOR DELETE
USING (auth.uid() = user_id);

-- Create indexes for performance
CREATE INDEX idx_cash_ledger_user_id ON public.cash_ledger(user_id);
CREATE INDEX idx_cash_ledger_data_transacao ON public.cash_ledger(data_transacao DESC);
CREATE INDEX idx_cash_ledger_tipo_transacao ON public.cash_ledger(tipo_transacao);
CREATE INDEX idx_cash_ledger_origem_bookmaker ON public.cash_ledger(origem_bookmaker_id) WHERE origem_bookmaker_id IS NOT NULL;
CREATE INDEX idx_cash_ledger_destino_bookmaker ON public.cash_ledger(destino_bookmaker_id) WHERE destino_bookmaker_id IS NOT NULL;

-- Trigger to update updated_at
CREATE TRIGGER update_cash_ledger_updated_at
BEFORE UPDATE ON public.cash_ledger
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Create view for operational cash balance (FIAT)
CREATE OR REPLACE VIEW public.v_saldo_caixa_fiat AS
SELECT 
  user_id,
  moeda,
  SUM(CASE 
    WHEN destino_tipo = 'CAIXA_OPERACIONAL' THEN valor
    WHEN origem_tipo = 'CAIXA_OPERACIONAL' THEN -valor
    ELSE 0
  END) as saldo
FROM public.cash_ledger
WHERE tipo_moeda = 'FIAT' 
  AND status = 'CONFIRMADO'
GROUP BY user_id, moeda;

-- Create view for operational cash balance (CRYPTO)
CREATE OR REPLACE VIEW public.v_saldo_caixa_crypto AS
SELECT 
  user_id,
  coin,
  SUM(CASE 
    WHEN destino_tipo = 'CAIXA_OPERACIONAL' THEN qtd_coin
    WHEN origem_tipo = 'CAIXA_OPERACIONAL' THEN -qtd_coin
    ELSE 0
  END) as saldo_coin,
  SUM(CASE 
    WHEN destino_tipo = 'CAIXA_OPERACIONAL' THEN valor_usd
    WHEN origem_tipo = 'CAIXA_OPERACIONAL' THEN -valor_usd
    ELSE 0
  END) as saldo_usd
FROM public.cash_ledger
WHERE tipo_moeda = 'CRYPTO' 
  AND status = 'CONFIRMADO'
GROUP BY user_id, coin;

-- Create view for partner bank account balances
CREATE OR REPLACE VIEW public.v_saldo_parceiro_contas AS
SELECT 
  cl.user_id,
  p.id as parceiro_id,
  p.nome as parceiro_nome,
  cb.id as conta_id,
  cb.banco as banco,
  cb.titular,
  cl.moeda,
  SUM(CASE 
    WHEN cl.destino_conta_bancaria_id = cb.id THEN cl.valor
    WHEN cl.origem_conta_bancaria_id = cb.id THEN -cl.valor
    ELSE 0
  END) as saldo
FROM public.cash_ledger cl
INNER JOIN public.contas_bancarias cb ON (
  cl.destino_conta_bancaria_id = cb.id OR 
  cl.origem_conta_bancaria_id = cb.id
)
INNER JOIN public.parceiros p ON cb.parceiro_id = p.id
WHERE cl.tipo_moeda = 'FIAT' 
  AND cl.status = 'CONFIRMADO'
GROUP BY cl.user_id, p.id, p.nome, cb.id, cb.banco, cb.titular, cl.moeda;

-- Create view for partner crypto wallet balances
CREATE OR REPLACE VIEW public.v_saldo_parceiro_wallets AS
SELECT 
  cl.user_id,
  p.id as parceiro_id,
  p.nome as parceiro_nome,
  w.id as wallet_id,
  w.exchange,
  w.endereco,
  cl.coin,
  SUM(CASE 
    WHEN cl.destino_wallet_id = w.id THEN cl.qtd_coin
    WHEN cl.origem_wallet_id = w.id THEN -cl.qtd_coin
    ELSE 0
  END) as saldo_coin,
  SUM(CASE 
    WHEN cl.destino_wallet_id = w.id THEN cl.valor_usd
    WHEN cl.origem_wallet_id = w.id THEN -cl.valor_usd
    ELSE 0
  END) as saldo_usd
FROM public.cash_ledger cl
INNER JOIN public.wallets_crypto w ON (
  cl.destino_wallet_id = w.id OR 
  cl.origem_wallet_id = w.id
)
INNER JOIN public.parceiros p ON w.parceiro_id = p.id
WHERE cl.tipo_moeda = 'CRYPTO' 
  AND cl.status = 'CONFIRMADO'
GROUP BY cl.user_id, p.id, p.nome, w.id, w.exchange, w.endereco, cl.coin;

-- Create trigger to update bookmaker balance on deposit/withdrawal
CREATE OR REPLACE FUNCTION public.atualizar_saldo_bookmaker_caixa()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_bookmaker_id UUID;
  v_valor_alteracao NUMERIC;
BEGIN
  -- Only process confirmed transactions
  IF NEW.status != 'CONFIRMADO' THEN
    RETURN NEW;
  END IF;

  -- Check if this is a deposit (to bookmaker)
  IF NEW.tipo_transacao = 'DEPOSITO' AND NEW.destino_bookmaker_id IS NOT NULL THEN
    v_bookmaker_id := NEW.destino_bookmaker_id;
    v_valor_alteracao := NEW.valor;
    
    UPDATE public.bookmakers
    SET saldo_atual = saldo_atual + v_valor_alteracao
    WHERE id = v_bookmaker_id;
  END IF;

  -- Check if this is a withdrawal (from bookmaker)
  IF NEW.tipo_transacao = 'SAQUE' AND NEW.origem_bookmaker_id IS NOT NULL THEN
    v_bookmaker_id := NEW.origem_bookmaker_id;
    v_valor_alteracao := NEW.valor;
    
    UPDATE public.bookmakers
    SET saldo_atual = saldo_atual - v_valor_alteracao
    WHERE id = v_bookmaker_id;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trigger_atualizar_saldo_bookmaker_caixa
AFTER INSERT ON public.cash_ledger
FOR EACH ROW
EXECUTE FUNCTION public.atualizar_saldo_bookmaker_caixa();