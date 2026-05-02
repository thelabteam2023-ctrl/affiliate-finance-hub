-- Adicionar coluna de tags como array de texto
ALTER TABLE public.cash_ledger 
ADD COLUMN IF NOT EXISTS tags TEXT[] DEFAULT '{}';

-- Criar índice GIN para busca rápida dentro do array de tags
CREATE INDEX IF NOT EXISTS idx_cash_ledger_tags ON public.cash_ledger USING GIN(tags);

-- Comentário para documentação
COMMENT ON COLUMN public.cash_ledger.tags IS 'Tags personalizadas para categorização e filtragem de movimentações (ex: Aporte Extra, Investimento Inicial)';
