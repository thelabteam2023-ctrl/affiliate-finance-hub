-- Permite salvar planos em modo rascunho com perfis genéricos (sem parceiro real)
ALTER TABLE public.distribuicao_plano_celulas
  ALTER COLUMN parceiro_id DROP NOT NULL;

ALTER TABLE public.distribuicao_plano_celulas
  ADD COLUMN IF NOT EXISTS perfil_planejamento_id uuid REFERENCES public.planning_perfis(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_distribuicao_celulas_perfil_planejamento
  ON public.distribuicao_plano_celulas(perfil_planejamento_id);

-- Garante que a célula identifique o "quem" — perfil de planejamento OU parceiro real
ALTER TABLE public.distribuicao_plano_celulas
  DROP CONSTRAINT IF EXISTS chk_celula_tem_alvo;
ALTER TABLE public.distribuicao_plano_celulas
  ADD CONSTRAINT chk_celula_tem_alvo
  CHECK (parceiro_id IS NOT NULL OR perfil_planejamento_id IS NOT NULL);