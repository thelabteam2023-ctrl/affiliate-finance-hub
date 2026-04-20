-- 1. Modo de execução do grupo
DO $$ BEGIN
  CREATE TYPE public.grupo_modo_execucao AS ENUM ('AGENDADO', 'SOB_DEMANDA');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE public.bookmaker_grupos
  ADD COLUMN IF NOT EXISTS modo_execucao public.grupo_modo_execucao NOT NULL DEFAULT 'AGENDADO';

-- 2. Depósito sugerido por casa-no-grupo (na moeda nativa da casa)
ALTER TABLE public.bookmaker_grupo_membros
  ADD COLUMN IF NOT EXISTS deposito_sugerido numeric(18,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS deposito_moeda text;

-- moeda preenchida sob demanda (espelha bookmakers_catalogo.moeda_padrao no momento do uso)
COMMENT ON COLUMN public.bookmaker_grupo_membros.deposito_sugerido IS
  'Valor de depósito sugerido para esta casa quando operada dentro deste grupo. Sempre na moeda nativa da casa (bookmakers_catalogo.moeda_padrao).';

-- 3. Meta diária do plano de distribuição (em USD)
ALTER TABLE public.distribuicao_planos
  ADD COLUMN IF NOT EXISTS meta_diaria_usd numeric(18,2);

COMMENT ON COLUMN public.distribuicao_planos.meta_diaria_usd IS
  'Meta diária total de depósitos em USD. O motor de calendário soma o valor sugerido de cada célula (convertido para USD) até atingir esta meta antes de abrir um novo dia.';