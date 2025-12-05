-- Adicionar campo de modelo de absorção de taxas no vínculo operador-projeto
ALTER TABLE public.operador_projetos 
ADD COLUMN IF NOT EXISTS modelo_absorcao_taxas TEXT NOT NULL DEFAULT 'EMPRESA_100';

-- Comentário explicativo
COMMENT ON COLUMN public.operador_projetos.modelo_absorcao_taxas IS 
'Modelo de absorção de taxas friccionais: EMPRESA_100 (empresa absorve tudo), OPERADOR_100 (operador absorve tudo), PROPORCIONAL (divisão conforme percentual do deal)';

-- Criar tabela para conciliações de projeto
CREATE TABLE public.projeto_conciliacoes (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  projeto_id UUID NOT NULL REFERENCES public.projetos(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  
  -- Valores nominais (calculados pelo sistema)
  saldo_nominal_fiat NUMERIC NOT NULL DEFAULT 0,
  saldo_nominal_crypto_usd NUMERIC NOT NULL DEFAULT 0,
  
  -- Valores reais (informados na conciliação)
  saldo_real_fiat NUMERIC NOT NULL DEFAULT 0,
  saldo_real_crypto_usd NUMERIC NOT NULL DEFAULT 0,
  
  -- Ajustes calculados (nominal - real)
  ajuste_fiat NUMERIC NOT NULL DEFAULT 0,
  ajuste_crypto_usd NUMERIC NOT NULL DEFAULT 0,
  
  -- Classificação do ajuste
  tipo_ajuste TEXT NOT NULL DEFAULT 'PERDA_FRICCIONAL', -- PERDA_FRICCIONAL ou GANHO_OPERACIONAL
  
  -- Detalhamento opcional
  descricao TEXT,
  observacoes TEXT,
  
  -- Timestamps
  data_conciliacao TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Habilitar RLS
ALTER TABLE public.projeto_conciliacoes ENABLE ROW LEVEL SECURITY;

-- Políticas RLS
CREATE POLICY "Users can view own conciliacoes" 
ON public.projeto_conciliacoes 
FOR SELECT 
USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own conciliacoes" 
ON public.projeto_conciliacoes 
FOR INSERT 
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own conciliacoes" 
ON public.projeto_conciliacoes 
FOR UPDATE 
USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own conciliacoes" 
ON public.projeto_conciliacoes 
FOR DELETE 
USING (auth.uid() = user_id);

-- Trigger para updated_at
CREATE TRIGGER update_projeto_conciliacoes_updated_at
BEFORE UPDATE ON public.projeto_conciliacoes
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Adicionar campo no projeto para indicar se tem investimento crypto (para obrigatoriedade)
ALTER TABLE public.projetos 
ADD COLUMN IF NOT EXISTS tem_investimento_crypto BOOLEAN NOT NULL DEFAULT false;

-- Adicionar campo para indicar se projeto foi conciliado
ALTER TABLE public.projetos 
ADD COLUMN IF NOT EXISTS conciliado BOOLEAN NOT NULL DEFAULT false;