/**
 * Central Alerts Count — SINO da sidebar
 *
 * FONTE ÚNICA (paridade obrigatória com Central de Operações):
 * Consome o MESMO RPC usado pela página (`get_central_operacoes_data`
 * via `useCentralOperacoesData`) + KPIs de Ocorrências e Solicitações.
 * Nada de queries paralelas divergentes — evita duplicidade e drift
 * entre badge do sino e badges visíveis nas abas.
 */

import { useMemo } from "react";
import { useOcorrenciasKpis } from "@/hooks/useOcorrencias";
import { useSolicitacoesKpis } from "@/hooks/useSolicitacoes";
import { useCentralOperacoesData } from "@/hooks/useCentralOperacoesData";
import { useUnreadAnnouncementsCount } from "@/hooks/useAnnouncements";

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
  const { data, loading } = useCentralOperacoesData();
  const { data: kpisOcorrencias } = useOcorrenciasKpis();
  const { data: kpisSolicitacoes } = useSolicitacoesKpis();
  const comunicadosUnread = useUnreadAnnouncementsCount();

  const financialCount = useMemo(() => {
    if (!data) return 0;

    const hoje = new Date();
    hoje.setHours(0, 0, 0, 0);

    // Mesmo filtro (0..10 dias) aplicado na Central de Operações
    const parceriasEncer10d = (data.parceriasEncerramento || []).filter((p: any) => {
      if (!p?.data_fim_prevista) return false;
      const dataFim = new Date(p.data_fim_prevista);
      dataFim.setHours(0, 0, 0, 0);
      const dias = Math.ceil((dataFim.getTime() - hoje.getTime()) / (1000 * 60 * 60 * 24));
      return dias >= 0 && dias <= 10;
    }).length;

    const breakdown = {
      alertas_painel: data.alertas?.length ?? 0,
      entregas_prontas: data.entregasPendentes?.length ?? 0,
      saques_pendentes: data.saquesPendentes?.length ?? 0,
      pagamentos_parceiros: data.pagamentosParceiros?.length ?? 0,
      pagamentos_fornecedores: data.pagamentosFornecedores?.length ?? 0,
      bonus_pendentes: data.bonusPendentes?.length ?? 0,
      comissoes_pendentes: data.comissoesPendentes?.length ?? 0,
      parcerias_encer_10d: parceriasEncer10d,
      parceiros_sem_parceria: data.parceirosSemParceria?.length ?? 0,
      alertas_lucro: data.alertasLucro?.length ?? 0,
      pagamentos_operador: data.pagamentosOperadorPendentes?.length ?? 0,
      participacoes: data.participacoesPendentes?.length ?? 0,
      casas_desvinculadas: data.casasDesvinculadas?.length ?? 0,
      casas_conciliacao: data.casasPendentesConciliacao?.length ?? 0,
      propostas_pagamento: data.propostasPagamentoCount ?? 0,
    };

    const total = Object.values(breakdown).reduce((a, b) => a + b, 0);

    // 🔍 Observabilidade: breakdown auditável do sino (mesma fonte da UI)
    // eslint-disable-next-line no-console
    console.groupCollapsed(
      `[CentralAlerts] financialCount=${total} | ocorrências=${
        kpisOcorrencias?.abertas_total ?? 0
      } | solicitações=${kpisSolicitacoes?.total_abertas ?? 0}`
    );
    // eslint-disable-next-line no-console
    console.table(breakdown);
    // eslint-disable-next-line no-console
    console.groupEnd();

    return total;
  }, [data, kpisOcorrencias?.abertas_total, kpisSolicitacoes?.total_abertas]);

  const count =
    financialCount +
    (kpisOcorrencias?.abertas_total ?? 0) +
    (kpisSolicitacoes?.total_abertas ?? 0) +
    comunicadosUnread;

  return { count, loading };
}
