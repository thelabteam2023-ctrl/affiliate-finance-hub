-- ============================================
-- CORREÇÃO SISTÊMICA: RLS e Políticas Duplicadas
-- ============================================

-- 1. PROJETOS - Corrigir INSERT para permitir Admin criar projetos
-- A política atual exige user_id = auth.uid(), bloqueando admins
DROP POLICY IF EXISTS "Workspace isolation projetos INSERT" ON public.projetos;

CREATE POLICY "projetos_ws_insert"
ON public.projetos
FOR INSERT
TO authenticated
WITH CHECK (
  workspace_id = get_current_workspace()
  AND has_permission(auth.uid(), 'projetos.edit', workspace_id)
);

-- 2. REMOVER POLÍTICAS DUPLICADAS
-- Manter apenas as políticas _ws_* que são o padrão correto

-- despesas_administrativas
DROP POLICY IF EXISTS "Workspace isolation despesas_administrativas INSERT" ON public.despesas_administrativas;

-- pagamentos_operador
DROP POLICY IF EXISTS "Workspace isolation pagamentos_operador INSERT" ON public.pagamentos_operador;

-- participacao_ciclos
DROP POLICY IF EXISTS "Workspace isolation participacao_ciclos INSERT" ON public.participacao_ciclos;

-- parceiro_lucro_alertas (remover duplicadas, manter uma)
DROP POLICY IF EXISTS "Workspace isolation parceiro_lucro_alertas INSERT" ON public.parceiro_lucro_alertas;
DROP POLICY IF EXISTS "parceiro_lucro_alertas_insert" ON public.parceiro_lucro_alertas;

-- promocoes_indicacao (remover duplicadas)
DROP POLICY IF EXISTS "Workspace isolation promocoes_indicacao INSERT" ON public.promocoes_indicacao;
DROP POLICY IF EXISTS "promocoes_indicacao_insert" ON public.promocoes_indicacao;

-- transacoes_bookmakers (remover duplicadas)
DROP POLICY IF EXISTS "Workspace isolation transacoes_bookmakers INSERT" ON public.transacoes_bookmakers;
DROP POLICY IF EXISTS "transacoes_bookmakers_insert" ON public.transacoes_bookmakers;

-- entregas
DROP POLICY IF EXISTS "Workspace isolation entregas INSERT" ON public.entregas;

-- freebets_recebidas
DROP POLICY IF EXISTS "Workspace isolation freebets_recebidas INSERT" ON public.freebets_recebidas;

-- indicador_acordos
DROP POLICY IF EXISTS "Workspace isolation indicador_acordos INSERT" ON public.indicador_acordos;

-- investidor_deals
DROP POLICY IF EXISTS "Workspace isolation investidor_deals INSERT" ON public.investidor_deals;

-- operador_projetos
DROP POLICY IF EXISTS "Workspace isolation operador_projetos INSERT" ON public.operador_projetos;

-- pagamentos_propostos
DROP POLICY IF EXISTS "Workspace isolation pagamentos_propostos INSERT" ON public.pagamentos_propostos;

-- project_bookmaker_link_bonuses
DROP POLICY IF EXISTS "Workspace isolation project_bookmaker_link_bonuses INSERT" ON public.project_bookmaker_link_bonuses;

-- projeto_bookmaker_historico
DROP POLICY IF EXISTS "Workspace isolation projeto_bookmaker_historico INSERT" ON public.projeto_bookmaker_historico;

-- projeto_ciclos
DROP POLICY IF EXISTS "Workspace isolation projeto_ciclos INSERT" ON public.projeto_ciclos;

-- projeto_conciliacoes
DROP POLICY IF EXISTS "Workspace isolation projeto_conciliacoes INSERT" ON public.projeto_conciliacoes;

-- projeto_perdas
DROP POLICY IF EXISTS "Workspace isolation projeto_perdas INSERT" ON public.projeto_perdas;

-- promocao_participantes
DROP POLICY IF EXISTS "Workspace isolation promocao_participantes INSERT" ON public.promocao_participantes;

-- user_favorites
DROP POLICY IF EXISTS "Workspace isolation user_favorites INSERT" ON public.user_favorites;

-- bookmakers_catalogo (mantém apenas system para insert de catálogo)
DROP POLICY IF EXISTS "Workspace isolation bookmakers_catalogo INSERT" ON public.bookmakers_catalogo;