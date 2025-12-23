-- Adicionar coluna JSONB para armazenar pernas internamente na operação Surebet
-- Estrutura: [{bookmaker_id, bookmaker_nome, selecao, odd, stake, resultado, lucro_prejuizo, gerou_freebet, valor_freebet_gerada}]
ALTER TABLE public.surebets 
ADD COLUMN IF NOT EXISTS pernas JSONB DEFAULT '[]'::jsonb;

-- Adicionar campos de registro de aposta que estavam faltando
ALTER TABLE public.surebets 
ADD COLUMN IF NOT EXISTS forma_registro TEXT,
ADD COLUMN IF NOT EXISTS estrategia TEXT,
ADD COLUMN IF NOT EXISTS contexto_operacional TEXT;

-- Criar índice para buscas em pernas (opcional, para performance)
CREATE INDEX IF NOT EXISTS idx_surebets_pernas ON public.surebets USING GIN (pernas);

-- Comentário documentando a estrutura
COMMENT ON COLUMN public.surebets.pernas IS 'Array JSON com pernas da operação: [{bookmaker_id, bookmaker_nome, selecao, odd, stake, resultado, lucro_prejuizo, gerou_freebet, valor_freebet_gerada}]';