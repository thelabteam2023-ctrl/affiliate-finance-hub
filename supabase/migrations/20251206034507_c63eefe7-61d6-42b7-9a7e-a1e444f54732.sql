
-- Add saldo_irrecuperavel field to bookmakers table
-- This tracks funds that cannot be withdrawn (locked bonuses, limited accounts, etc.)
ALTER TABLE public.bookmakers 
ADD COLUMN saldo_irrecuperavel numeric NOT NULL DEFAULT 0;

-- Add comment for documentation
COMMENT ON COLUMN public.bookmakers.saldo_irrecuperavel IS 'Saldo que não pode ser sacado (bônus travados, contas limitadas/bloqueadas, etc.)';

-- Add perdas_confirmadas field to projeto_conciliacoes for formal loss registration
ALTER TABLE public.projeto_conciliacoes
ADD COLUMN perdas_confirmadas numeric NOT NULL DEFAULT 0;

-- Add motivo_perda field to document why funds are irrecoverable
ALTER TABLE public.projeto_conciliacoes
ADD COLUMN motivo_perda text;

COMMENT ON COLUMN public.projeto_conciliacoes.perdas_confirmadas IS 'Valor confirmado como perda irrecuperável (contas bloqueadas, bônus expirados, etc.)';
COMMENT ON COLUMN public.projeto_conciliacoes.motivo_perda IS 'Descrição do motivo da perda confirmada';
