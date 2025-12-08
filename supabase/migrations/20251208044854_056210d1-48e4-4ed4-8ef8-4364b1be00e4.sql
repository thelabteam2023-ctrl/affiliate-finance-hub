-- Adicionar coluna status para controlar liberação de freebets
ALTER TABLE public.freebets_recebidas 
ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'LIBERADA';

-- Adicionar coluna para referência direta a apostas múltiplas
ALTER TABLE public.freebets_recebidas 
ADD COLUMN IF NOT EXISTS aposta_multipla_id uuid REFERENCES public.apostas_multiplas(id) ON DELETE SET NULL;

-- Criar índice para consultas por status
CREATE INDEX IF NOT EXISTS idx_freebets_status ON public.freebets_recebidas(status);

-- Criar índice para consultas por aposta_multipla_id
CREATE INDEX IF NOT EXISTS idx_freebets_aposta_multipla ON public.freebets_recebidas(aposta_multipla_id);

-- Comentário para documentação
COMMENT ON COLUMN public.freebets_recebidas.status IS 'Status da freebet: PENDENTE (aguardando resultado), LIBERADA (aposta GREEN), NAO_LIBERADA (aposta RED/VOID)';