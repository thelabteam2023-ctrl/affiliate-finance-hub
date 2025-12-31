-- Adicionar campo de moeda de consolidação nos projetos
ALTER TABLE public.projetos 
ADD COLUMN IF NOT EXISTS moeda_consolidacao TEXT DEFAULT 'USD';

-- Adicionar campo de cotação de trabalho personalizada
ALTER TABLE public.projetos 
ADD COLUMN IF NOT EXISTS cotacao_trabalho NUMERIC DEFAULT NULL;

-- Adicionar campo para fonte preferida de cotação
ALTER TABLE public.projetos 
ADD COLUMN IF NOT EXISTS fonte_cotacao TEXT DEFAULT 'TRABALHO';

-- Adicionar campos de consolidação nas apostas_unificada
-- Estes campos só serão preenchidos para operações multi-moeda
ALTER TABLE public.apostas_unificada 
ADD COLUMN IF NOT EXISTS is_multicurrency BOOLEAN DEFAULT FALSE;

ALTER TABLE public.apostas_unificada 
ADD COLUMN IF NOT EXISTS consolidation_currency TEXT DEFAULT NULL;

ALTER TABLE public.apostas_unificada 
ADD COLUMN IF NOT EXISTS conversion_rate_used NUMERIC DEFAULT NULL;

ALTER TABLE public.apostas_unificada 
ADD COLUMN IF NOT EXISTS conversion_source TEXT DEFAULT NULL;

ALTER TABLE public.apostas_unificada 
ADD COLUMN IF NOT EXISTS stake_consolidado NUMERIC DEFAULT NULL;

ALTER TABLE public.apostas_unificada 
ADD COLUMN IF NOT EXISTS retorno_consolidado NUMERIC DEFAULT NULL;

ALTER TABLE public.apostas_unificada 
ADD COLUMN IF NOT EXISTS pl_consolidado NUMERIC DEFAULT NULL;

-- Comentários para documentação
COMMENT ON COLUMN public.projetos.moeda_consolidacao IS 'Moeda única de consolidação para KPIs (BRL ou USD)';
COMMENT ON COLUMN public.projetos.cotacao_trabalho IS 'Cotação de trabalho personalizada USD/BRL';
COMMENT ON COLUMN public.projetos.fonte_cotacao IS 'Fonte preferida de cotação: PTAX ou TRABALHO';

COMMENT ON COLUMN public.apostas_unificada.is_multicurrency IS 'Indica se a operação envolve múltiplas moedas';
COMMENT ON COLUMN public.apostas_unificada.consolidation_currency IS 'Moeda usada para consolidação (BRL ou USD)';
COMMENT ON COLUMN public.apostas_unificada.conversion_rate_used IS 'Taxa de conversão utilizada';
COMMENT ON COLUMN public.apostas_unificada.conversion_source IS 'Fonte da cotação: PTAX ou TRABALHO';
COMMENT ON COLUMN public.apostas_unificada.stake_consolidado IS 'Stake convertido para moeda de consolidação';
COMMENT ON COLUMN public.apostas_unificada.retorno_consolidado IS 'Retorno convertido para moeda de consolidação';
COMMENT ON COLUMN public.apostas_unificada.pl_consolidado IS 'P/L convertido para moeda de consolidação';