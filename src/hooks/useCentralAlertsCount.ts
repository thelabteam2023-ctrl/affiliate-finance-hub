/**
 * REGRA DE VISIBILIDADE (NÃO MODIFICAR SEM REVISÃO DE SEGURANÇA):
 * 
 * Operadores enxergam somente eventos operacionais de projetos vinculados.
 * Financeiro, parceiros e administração NÃO fazem parte do escopo operacional.
 */

import { useState, useEffect, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useRole } from "@/hooks/useRole";
import { useAuth } from "@/hooks/useAuth";
import { useOcorrenciasKpis } from "@/hooks/useOcorrencias";
import { useSolicitacoesKpis } from "@/hooks/useSolicitacoes";

// Classificação de domínio dos eventos
type EventDomain = 'project_event' | 'financial_event' | 'partner_event' | 'admin_event';

// Mapa de visibilidade por role
const ROLE_VISIBILITY: Record<string, EventDomain[]> = {
  owner: ['project_event', 'financial_event', 'partner_event', 'admin_event'],
  admin: ['project_event', 'financial_event', 'partner_event', 'admin_event'],
  finance: ['project_event', 'financial_event', 'partner_event'],
  operator: ['project_event'], // Operadores veem apenas eventos de projeto
  viewer: [], // Viewer não vê ações pendentes
};

export function useCentralAlertsCount() {
  const [financialCount, setFinancialCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const { role, isOperator } = useRole();
  const { user, workspaceId } = useAuth();
  const { data: kpisOcorrencias } = useOcorrenciasKpis();
  const { data: kpisSolicitacoes } = useSolicitacoesKpis();

  const count = financialCount + (kpisOcorrencias?.abertas_total ?? 0) + (kpisSolicitacoes?.total_abertas ?? 0);

  // Domínios permitidos para o role atual
  const allowedDomains = useMemo(() => {
    return ROLE_VISIBILITY[role || 'viewer'] || [];
  }, [role]);

  useEffect(() => {
    if (!user || !workspaceId) return;

    const fetchCount = async () => {
      try {
        const hoje = new Date();
        hoje.setHours(0, 0, 0, 0);

        // Para operadores, primeiro buscar os projetos vinculados
        let operatorProjectIds: string[] = [];
        let operadorId: string | null = null;

        if (isOperator && user) {
          const { data: operadorData } = await supabase
            .from("operadores")
            .select("id")
            .eq("auth_user_id", user.id)
            .single();

          if (operadorData) {
            operadorId = operadorData.id;
            const { data: vinculos } = await supabase
              .from("operador_projetos")
              .select("projeto_id")
              .eq("operador_id", operadorData.id)
              .eq("status", "ATIVO");
            operatorProjectIds = (vinculos || []).map((v: any) => v.projeto_id);
          }
        }

        const canSeeAdminData = allowedDomains.includes('admin_event');
        const canSeeFinancialData = allowedDomains.includes('financial_event');
        const canSeePartnerData = allowedDomains.includes('partner_event');
        const canSeeProjectData = allowedDomains.includes('project_event');

        // Fetch all alert sources in parallel, respecting role restrictions
        const results = await Promise.all([
          // Alertas do painel operacional (saques e casas limitadas) - financial_event
          canSeeFinancialData
            ? supabase.from("v_painel_operacional").select("entidade_id", { count: "exact", head: true })
            : Promise.resolve({ count: 0, error: null }),
          // Entregas pendentes - project_event
          canSeeProjectData
            ? supabase.from("v_entregas_pendentes").select("id, projeto_id").in("status_conciliacao", ["PRONTA"])
            : Promise.resolve({ data: [], error: null }),
          // Saques pendentes - financial_event
          canSeeFinancialData
            ? supabase.from("cash_ledger").select("id", { count: "exact", head: true }).eq("tipo_transacao", "SAQUE").eq("status", "PENDENTE")
            : Promise.resolve({ count: 0, error: null }),
          // Parcerias para pagamentos - partner_event
          canSeePartnerData
            ? supabase
                .from("parcerias")
                .select("id")
                .in("status", ["ATIVA", "EM_ENCERRAMENTO"])
                .or("custo_aquisicao_isento.is.null,custo_aquisicao_isento.eq.false")
                .gt("valor_parceiro", 0)
                .eq("pagamento_dispensado", false)
            : Promise.resolve({ data: [], error: null }),
          // Movimentações para filtrar pagamentos já feitos
          canSeePartnerData
            ? supabase
                .from("movimentacoes_indicacao")
                .select("parceria_id, tipo, status, indicador_id")
            : Promise.resolve({ data: [], error: null }),
          // Alertas de lucro - partner_event
          canSeePartnerData
            ? supabase.from("parceiro_lucro_alertas").select("id", { count: "exact", head: true }).eq("notificado", false)
            : Promise.resolve({ count: 0, error: null }),
          // Pagamentos de operador pendentes - project_event
          canSeeProjectData
            ? supabase.from("pagamentos_operador").select("id, operador_id").eq("status", "PENDENTE")
            : Promise.resolve({ data: [], error: null }),
          // Participações pendentes - financial_event
          canSeeFinancialData
            ? supabase.from("participacao_ciclos").select("id", { count: "exact", head: true }).eq("status", "A_PAGAR")
            : Promise.resolve({ count: 0, error: null }),
          // Parcerias próximas do encerramento - partner_event
          canSeePartnerData
            ? supabase
                .from("parcerias")
                .select("id, data_fim_prevista")
                .in("status", ["ATIVA", "EM_ENCERRAMENTO"])
                .not("data_fim_prevista", "is", null)
            : Promise.resolve({ data: [], error: null }),
          // Parceiros sem parceria - partner_event
          canSeePartnerData
            ? supabase.from("parceiros").select("id").eq("status", "ativo")
            : Promise.resolve({ data: [], error: null }),
          // Todas as parcerias ativas (para filtrar parceiros sem parceria)
          canSeePartnerData
            ? supabase.from("parcerias").select("parceiro_id").in("status", ["ATIVA", "EM_ENCERRAMENTO"])
            : Promise.resolve({ data: [], error: null }),
          // Custos para bonus - partner_event
          canSeePartnerData
            ? supabase.from("v_custos_aquisicao").select("indicador_id")
            : Promise.resolve({ data: [], error: null }),
          // Acordos ativos
          canSeePartnerData
            ? supabase.from("indicador_acordos").select("indicador_id, meta_parceiros, valor_bonus").eq("ativo", true)
            : Promise.resolve({ data: [], error: null }),
          // Comissões pendentes - partner_event
          canSeePartnerData
            ? supabase
                .from("parcerias")
                .select("id, parceiro_id")
                .eq("comissao_paga", false)
                .not("valor_comissao_indicador", "is", null)
                .gt("valor_comissao_indicador", 0)
            : Promise.resolve({ data: [], error: null }),
          // Indicações para mapping
          canSeePartnerData
            ? supabase.from("indicacoes").select("parceiro_id, indicador_id")
            : Promise.resolve({ data: [], error: null }),
          // Casas desvinculadas - financial_event
          canSeeFinancialData
            ? supabase.from("v_bookmakers_desvinculados").select("id", { count: "exact", head: true })
            : Promise.resolve({ count: 0, error: null }),
          // Propostas de pagamento pendentes - project_event
          canSeeProjectData
            ? supabase.from("pagamentos_propostos").select("id", { count: "exact", head: true }).eq("status", "PENDENTE")
            : Promise.resolve({ count: 0, error: null }),
          // Casas pendentes de conciliação - financial_event
          canSeeFinancialData
            ? supabase.rpc("get_bookmakers_pendentes_conciliacao", { p_workspace_id: workspaceId })
            : Promise.resolve({ data: [], error: null }),
        ]);

        const [
          alertasResult,
          entregasResult,
          saquesPendentesResult,
          parceriasResult,
          movimentacoesResult,
          alertasLucroResult,
          pagamentosOperadorResult,
          participacoesResult,
          encerResult,
          todosParceirosResult,
          todasParceriasResult,
          custosResult,
          acordosResult,
          comissoesResult,
          indicacoesResult,
          casasDesvinculadasResult,
          propostasPagamentoResult,
          conciliacaoPendenteResult,
        ] = results as any[];

        let totalCount = 0;

        // Count from v_painel_operacional (admin_event)
        if (alertasResult.count) totalCount += alertasResult.count;

        // Count entregas pendentes (project_event)
        if (entregasResult.data) {
          let entregasData = entregasResult.data || [];
          // Operador: filtrar por projetos vinculados
          if (isOperator && operatorProjectIds.length > 0) {
            entregasData = entregasData.filter((e: any) => operatorProjectIds.includes(e.projeto_id));
          } else if (isOperator) {
            entregasData = [];
          }
          totalCount += entregasData.length;
        }

        // Count saques pendentes (financial_event)
        if (saquesPendentesResult.count) totalCount += saquesPendentesResult.count;

        // Count alertas de lucro (partner_event)
        if (alertasLucroResult.count) totalCount += alertasLucroResult.count;

        // Count pagamentos operador pendentes (project_event)
        if (pagamentosOperadorResult.data) {
          let pagamentosData = pagamentosOperadorResult.data || [];
          // Operador: filtrar por seus próprios pagamentos
          if (isOperator && operadorId) {
            pagamentosData = pagamentosData.filter((p: any) => p.operador_id === operadorId);
          }
          totalCount += pagamentosData.length;
        }

        // Count participações pendentes (financial_event)
        if (participacoesResult.count) totalCount += participacoesResult.count;

        // Count pagamentos pendentes a parceiros (partner_event)
        if (parceriasResult.data && movimentacoesResult.data) {
          const parceriasPagas = (movimentacoesResult.data || [])
            .filter((m: any) => m.tipo === "PAGTO_PARCEIRO" && m.status === "CONFIRMADO")
            .map((m: any) => m.parceria_id);
          
          const pagamentosPendentes = (parceriasResult.data || [])
            .filter((p: any) => !parceriasPagas.includes(p.id)).length;
          totalCount += pagamentosPendentes;
        }

        // Count parcerias próximas do encerramento (≤ 7 dias) - partner_event
        if (encerResult.data) {
          const alertasEncer = (encerResult.data || []).filter((p: any) => {
            const dataFim = new Date(p.data_fim_prevista);
            dataFim.setHours(0, 0, 0, 0);
            const diasRestantes = Math.ceil((dataFim.getTime() - hoje.getTime()) / (1000 * 60 * 60 * 24));
            return diasRestantes >= 0 && diasRestantes <= 7;
          }).length;
          totalCount += alertasEncer;
        }

        // Count parceiros sem parceria (partner_event)
        if (todosParceirosResult.data && todasParceriasResult.data) {
          const parceirosComParceria = new Set((todasParceriasResult.data || []).map((p: any) => p.parceiro_id));
          const parceirosSemParceria = (todosParceirosResult.data || [])
            .filter((p: any) => !parceirosComParceria.has(p.id)).length;
          totalCount += parceirosSemParceria;
        }

        // Count bonus pendentes (partner_event)
        if (custosResult.data && acordosResult.data && movimentacoesResult.data) {
          const indicadorQtd: Record<string, number> = {};
          custosResult.data.forEach((c: any) => {
            if (c.indicador_id) {
              indicadorQtd[c.indicador_id] = (indicadorQtd[c.indicador_id] || 0) + 1;
            }
          });

          const bonusPagosPorIndicador: Record<string, number> = {};
          (movimentacoesResult.data || [])
            .filter((m: any) => m.tipo === "BONUS_INDICADOR" && m.status === "CONFIRMADO")
            .forEach((m: any) => {
              if (m.indicador_id) {
                bonusPagosPorIndicador[m.indicador_id] = (bonusPagosPorIndicador[m.indicador_id] || 0) + 1;
              }
            });

          (acordosResult.data || []).forEach((acordo: any) => {
            const qtd = indicadorQtd[acordo.indicador_id] || 0;
            if (acordo.meta_parceiros && acordo.meta_parceiros > 0) {
              const ciclosCompletos = Math.floor(qtd / acordo.meta_parceiros);
              const bonusJaPagos = bonusPagosPorIndicador[acordo.indicador_id] || 0;
              const ciclosPendentes = ciclosCompletos - bonusJaPagos;
              if (ciclosPendentes > 0) totalCount += 1;
            }
          });
        }

        // Count comissões pendentes (partner_event)
        if (comissoesResult.data && indicacoesResult.data) {
          const parceiroIndicadorMap: Record<string, boolean> = {};
          indicacoesResult.data.forEach((ind: any) => {
            if (ind.parceiro_id && ind.indicador_id) {
              parceiroIndicadorMap[ind.parceiro_id] = true;
            }
          });

          const comissoesPendentes = (comissoesResult.data || [])
            .filter((p: any) => p.parceiro_id && parceiroIndicadorMap[p.parceiro_id]).length;
          totalCount += comissoesPendentes;
        }

        // Count casas desvinculadas (financial_event)
        if (casasDesvinculadasResult.count) totalCount += casasDesvinculadasResult.count;

        // Count propostas de pagamento pendentes (project_event)
        if (propostasPagamentoResult.count) totalCount += propostasPagamentoResult.count;

        // Count casas pendentes de conciliação (financial_event)
        if (conciliacaoPendenteResult.data && Array.isArray(conciliacaoPendenteResult.data)) {
          totalCount += conciliacaoPendenteResult.data.length;
        }

        setFinancialCount(totalCount);
      } catch (error) {
        console.error("Error fetching central alerts count:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchCount();

    // Refresh every 60 seconds
    const interval = setInterval(fetchCount, 60000);
    return () => clearInterval(interval);
  }, [user, workspaceId, role, isOperator, allowedDomains]);

  return { count, loading };
}
