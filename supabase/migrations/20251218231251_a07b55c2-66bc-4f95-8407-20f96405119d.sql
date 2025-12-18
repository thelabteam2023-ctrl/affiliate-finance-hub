-- ========================================================================
-- MIGRAÇÃO P0: ISOLAMENTO COMPLETO DE WORKSPACE - PARTE 1
-- ========================================================================
-- Adiciona workspace_id e configura RLS em todas as tabelas tenant
-- ========================================================================

-- ========================================================================
-- PARTE 1: ADICIONAR workspace_id EM TABELAS FALTANTES
-- ========================================================================

ALTER TABLE public.apostas ADD COLUMN IF NOT EXISTS workspace_id UUID REFERENCES public.workspaces(id);
ALTER TABLE public.apostas_multiplas ADD COLUMN IF NOT EXISTS workspace_id UUID REFERENCES public.workspaces(id);
ALTER TABLE public.entregas ADD COLUMN IF NOT EXISTS workspace_id UUID REFERENCES public.workspaces(id);
ALTER TABLE public.freebets_recebidas ADD COLUMN IF NOT EXISTS workspace_id UUID REFERENCES public.workspaces(id);
ALTER TABLE public.indicacoes ADD COLUMN IF NOT EXISTS workspace_id UUID REFERENCES public.workspaces(id);
ALTER TABLE public.indicador_acordos ADD COLUMN IF NOT EXISTS workspace_id UUID REFERENCES public.workspaces(id);
ALTER TABLE public.investidor_deals ADD COLUMN IF NOT EXISTS workspace_id UUID REFERENCES public.workspaces(id);
ALTER TABLE public.matched_betting_promocoes ADD COLUMN IF NOT EXISTS workspace_id UUID REFERENCES public.workspaces(id);
ALTER TABLE public.matched_betting_rounds ADD COLUMN IF NOT EXISTS workspace_id UUID REFERENCES public.workspaces(id);
ALTER TABLE public.movimentacoes_indicacao ADD COLUMN IF NOT EXISTS workspace_id UUID REFERENCES public.workspaces(id);
ALTER TABLE public.operador_projetos ADD COLUMN IF NOT EXISTS workspace_id UUID REFERENCES public.workspaces(id);
ALTER TABLE public.pagamentos_operador ADD COLUMN IF NOT EXISTS workspace_id UUID REFERENCES public.workspaces(id);
ALTER TABLE public.pagamentos_propostos ADD COLUMN IF NOT EXISTS workspace_id UUID REFERENCES public.workspaces(id);
ALTER TABLE public.parceiro_lucro_alertas ADD COLUMN IF NOT EXISTS workspace_id UUID REFERENCES public.workspaces(id);
ALTER TABLE public.participacao_ciclos ADD COLUMN IF NOT EXISTS workspace_id UUID REFERENCES public.workspaces(id);
ALTER TABLE public.projeto_bookmaker_historico ADD COLUMN IF NOT EXISTS workspace_id UUID REFERENCES public.workspaces(id);
ALTER TABLE public.projeto_ciclos ADD COLUMN IF NOT EXISTS workspace_id UUID REFERENCES public.workspaces(id);
ALTER TABLE public.projeto_conciliacoes ADD COLUMN IF NOT EXISTS workspace_id UUID REFERENCES public.workspaces(id);
ALTER TABLE public.projeto_perdas ADD COLUMN IF NOT EXISTS workspace_id UUID REFERENCES public.workspaces(id);
ALTER TABLE public.promocao_participantes ADD COLUMN IF NOT EXISTS workspace_id UUID REFERENCES public.workspaces(id);
ALTER TABLE public.promocoes_indicacao ADD COLUMN IF NOT EXISTS workspace_id UUID REFERENCES public.workspaces(id);
ALTER TABLE public.surebets ADD COLUMN IF NOT EXISTS workspace_id UUID REFERENCES public.workspaces(id);
ALTER TABLE public.transacoes_bookmakers ADD COLUMN IF NOT EXISTS workspace_id UUID REFERENCES public.workspaces(id);
ALTER TABLE public.user_favorites ADD COLUMN IF NOT EXISTS workspace_id UUID REFERENCES public.workspaces(id);

-- ========================================================================
-- PARTE 2: BACKFILL - PREENCHER workspace_id EXISTENTES (CORRIGIDO)
-- ========================================================================

-- 2.1 apostas: Herdar do bookmaker->workspace_id
UPDATE public.apostas a
SET workspace_id = b.workspace_id
FROM public.bookmakers b
WHERE a.bookmaker_id = b.id AND a.workspace_id IS NULL AND b.workspace_id IS NOT NULL;

-- 2.2 apostas_multiplas: Herdar do bookmaker->workspace_id
UPDATE public.apostas_multiplas am
SET workspace_id = b.workspace_id
FROM public.bookmakers b
WHERE am.bookmaker_id = b.id AND am.workspace_id IS NULL AND b.workspace_id IS NOT NULL;

-- 2.3 entregas: Herdar do operador_projetos->projeto->workspace_id
UPDATE public.entregas e
SET workspace_id = p.workspace_id
FROM public.operador_projetos op
JOIN public.projetos p ON op.projeto_id = p.id
WHERE e.operador_projeto_id = op.id AND e.workspace_id IS NULL AND p.workspace_id IS NOT NULL;

-- 2.4 freebets_recebidas: Herdar do projeto->workspace_id
UPDATE public.freebets_recebidas f
SET workspace_id = p.workspace_id
FROM public.projetos p
WHERE f.projeto_id = p.id AND f.workspace_id IS NULL AND p.workspace_id IS NOT NULL;

-- 2.5 indicacoes: Herdar do parceiro->workspace_id
UPDATE public.indicacoes i
SET workspace_id = pa.workspace_id
FROM public.parceiros pa
WHERE i.parceiro_id = pa.id AND i.workspace_id IS NULL AND pa.workspace_id IS NOT NULL;

-- 2.6 indicador_acordos: Herdar do indicador->workspace_id
UPDATE public.indicador_acordos ia
SET workspace_id = ir.workspace_id
FROM public.indicadores_referral ir
WHERE ia.indicador_id = ir.id AND ia.workspace_id IS NULL AND ir.workspace_id IS NOT NULL;

-- 2.7 investidor_deals: Herdar do investidor->workspace_id
UPDATE public.investidor_deals idl
SET workspace_id = inv.workspace_id
FROM public.investidores inv
WHERE idl.investidor_id = inv.id AND idl.workspace_id IS NULL AND inv.workspace_id IS NOT NULL;

-- 2.8 matched_betting_rounds: Herdar do projeto->workspace_id
UPDATE public.matched_betting_rounds mbr
SET workspace_id = p.workspace_id
FROM public.projetos p
WHERE mbr.projeto_id = p.id AND mbr.workspace_id IS NULL AND p.workspace_id IS NOT NULL;

-- 2.9 matched_betting_promocoes: Herdar do workspace_members
UPDATE public.matched_betting_promocoes mbp
SET workspace_id = wm.workspace_id
FROM public.workspace_members wm
WHERE mbp.user_id = wm.user_id AND mbp.workspace_id IS NULL AND wm.is_active = true;

-- 2.10 movimentacoes_indicacao: Herdar da parceria->workspace_id
UPDATE public.movimentacoes_indicacao m
SET workspace_id = pa.workspace_id
FROM public.parcerias pa
WHERE m.parceria_id = pa.id AND m.workspace_id IS NULL AND pa.workspace_id IS NOT NULL;

-- 2.11 operador_projetos: Herdar do projeto->workspace_id
UPDATE public.operador_projetos op
SET workspace_id = p.workspace_id
FROM public.projetos p
WHERE op.projeto_id = p.id AND op.workspace_id IS NULL AND p.workspace_id IS NOT NULL;

-- 2.12 pagamentos_operador: Herdar do projeto->workspace_id
UPDATE public.pagamentos_operador po
SET workspace_id = p.workspace_id
FROM public.projetos p
WHERE po.projeto_id = p.id AND po.workspace_id IS NULL AND p.workspace_id IS NOT NULL;

-- 2.13 pagamentos_propostos: Herdar do operador->workspace_id
UPDATE public.pagamentos_propostos pp
SET workspace_id = o.workspace_id
FROM public.operadores o
WHERE pp.operador_id = o.id AND pp.workspace_id IS NULL AND o.workspace_id IS NOT NULL;

-- 2.14 parceiro_lucro_alertas: Herdar do parceiro->workspace_id
UPDATE public.parceiro_lucro_alertas pla
SET workspace_id = pa.workspace_id
FROM public.parceiros pa
WHERE pla.parceiro_id = pa.id AND pla.workspace_id IS NULL AND pa.workspace_id IS NOT NULL;

-- 2.15 participacao_ciclos: Herdar do ciclo->projeto->workspace_id
UPDATE public.participacao_ciclos pc
SET workspace_id = p.workspace_id
FROM public.projeto_ciclos pciclo
JOIN public.projetos p ON pciclo.projeto_id = p.id
WHERE pc.ciclo_id = pciclo.id AND pc.workspace_id IS NULL AND p.workspace_id IS NOT NULL;

-- 2.16 projeto_bookmaker_historico: Herdar do projeto->workspace_id
UPDATE public.projeto_bookmaker_historico pbh
SET workspace_id = p.workspace_id
FROM public.projetos p
WHERE pbh.projeto_id = p.id AND pbh.workspace_id IS NULL AND p.workspace_id IS NOT NULL;

-- 2.17 projeto_ciclos: Herdar do projeto->workspace_id
UPDATE public.projeto_ciclos pcc
SET workspace_id = p.workspace_id
FROM public.projetos p
WHERE pcc.projeto_id = p.id AND pcc.workspace_id IS NULL AND p.workspace_id IS NOT NULL;

-- 2.18 projeto_conciliacoes: Herdar do projeto->workspace_id
UPDATE public.projeto_conciliacoes pcon
SET workspace_id = p.workspace_id
FROM public.projetos p
WHERE pcon.projeto_id = p.id AND pcon.workspace_id IS NULL AND p.workspace_id IS NOT NULL;

-- 2.19 projeto_perdas: Herdar do projeto->workspace_id
UPDATE public.projeto_perdas pperdas
SET workspace_id = p.workspace_id
FROM public.projetos p
WHERE pperdas.projeto_id = p.id AND pperdas.workspace_id IS NULL AND p.workspace_id IS NOT NULL;

-- 2.20 promocao_participantes: Herdar do indicador->workspace_id (usa indicador_id, não parceiro_id)
UPDATE public.promocao_participantes pp
SET workspace_id = ir.workspace_id
FROM public.indicadores_referral ir
WHERE pp.indicador_id = ir.id AND pp.workspace_id IS NULL AND ir.workspace_id IS NOT NULL;

-- 2.21 promocoes_indicacao: Herdar do workspace_members
UPDATE public.promocoes_indicacao pi
SET workspace_id = wm.workspace_id
FROM public.workspace_members wm
WHERE pi.user_id = wm.user_id AND pi.workspace_id IS NULL AND wm.is_active = true;

-- 2.22 surebets: Herdar do projeto->workspace_id
UPDATE public.surebets s
SET workspace_id = p.workspace_id
FROM public.projetos p
WHERE s.projeto_id = p.id AND s.workspace_id IS NULL AND p.workspace_id IS NOT NULL;

-- 2.23 transacoes_bookmakers: Herdar do bookmaker->workspace_id
UPDATE public.transacoes_bookmakers tb
SET workspace_id = b.workspace_id
FROM public.bookmakers b
WHERE tb.bookmaker_id = b.id AND tb.workspace_id IS NULL AND b.workspace_id IS NOT NULL;

-- 2.24 user_favorites: Herdar do workspace_members
UPDATE public.user_favorites uf
SET workspace_id = wm.workspace_id
FROM public.workspace_members wm
WHERE uf.user_id = wm.user_id AND uf.workspace_id IS NULL AND wm.is_active = true;

-- ========================================================================
-- PARTE 3: ÍNDICES PARA PERFORMANCE
-- ========================================================================

CREATE INDEX IF NOT EXISTS idx_apostas_workspace_id ON public.apostas(workspace_id);
CREATE INDEX IF NOT EXISTS idx_apostas_multiplas_workspace_id ON public.apostas_multiplas(workspace_id);
CREATE INDEX IF NOT EXISTS idx_entregas_workspace_id ON public.entregas(workspace_id);
CREATE INDEX IF NOT EXISTS idx_freebets_recebidas_workspace_id ON public.freebets_recebidas(workspace_id);
CREATE INDEX IF NOT EXISTS idx_indicacoes_workspace_id ON public.indicacoes(workspace_id);
CREATE INDEX IF NOT EXISTS idx_indicador_acordos_workspace_id ON public.indicador_acordos(workspace_id);
CREATE INDEX IF NOT EXISTS idx_investidor_deals_workspace_id ON public.investidor_deals(workspace_id);
CREATE INDEX IF NOT EXISTS idx_matched_betting_promocoes_workspace_id ON public.matched_betting_promocoes(workspace_id);
CREATE INDEX IF NOT EXISTS idx_matched_betting_rounds_workspace_id ON public.matched_betting_rounds(workspace_id);
CREATE INDEX IF NOT EXISTS idx_movimentacoes_indicacao_workspace_id ON public.movimentacoes_indicacao(workspace_id);
CREATE INDEX IF NOT EXISTS idx_operador_projetos_workspace_id ON public.operador_projetos(workspace_id);
CREATE INDEX IF NOT EXISTS idx_pagamentos_operador_workspace_id ON public.pagamentos_operador(workspace_id);
CREATE INDEX IF NOT EXISTS idx_pagamentos_propostos_workspace_id ON public.pagamentos_propostos(workspace_id);
CREATE INDEX IF NOT EXISTS idx_parceiro_lucro_alertas_workspace_id ON public.parceiro_lucro_alertas(workspace_id);
CREATE INDEX IF NOT EXISTS idx_participacao_ciclos_workspace_id ON public.participacao_ciclos(workspace_id);
CREATE INDEX IF NOT EXISTS idx_projeto_bookmaker_historico_workspace_id ON public.projeto_bookmaker_historico(workspace_id);
CREATE INDEX IF NOT EXISTS idx_projeto_ciclos_workspace_id ON public.projeto_ciclos(workspace_id);
CREATE INDEX IF NOT EXISTS idx_projeto_conciliacoes_workspace_id ON public.projeto_conciliacoes(workspace_id);
CREATE INDEX IF NOT EXISTS idx_projeto_perdas_workspace_id ON public.projeto_perdas(workspace_id);
CREATE INDEX IF NOT EXISTS idx_promocao_participantes_workspace_id ON public.promocao_participantes(workspace_id);
CREATE INDEX IF NOT EXISTS idx_promocoes_indicacao_workspace_id ON public.promocoes_indicacao(workspace_id);
CREATE INDEX IF NOT EXISTS idx_surebets_workspace_id ON public.surebets(workspace_id);
CREATE INDEX IF NOT EXISTS idx_transacoes_bookmakers_workspace_id ON public.transacoes_bookmakers(workspace_id);
CREATE INDEX IF NOT EXISTS idx_user_favorites_workspace_id ON public.user_favorites(workspace_id);