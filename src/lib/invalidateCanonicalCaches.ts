import { QueryClient } from "@tanstack/react-query";

/**
 * Invalida TODOS os caches canônicos de um projeto após qualquer mutação de aposta.
 * 
 * MOTIVAÇÃO: BroadcastChannel.postMessage() só envia para OUTRAS janelas.
 * Sem esta invalidação explícita, o badge "Evolução de Lucro" e o calendário
 * da Visão Geral ficam estale quando a mutação ocorre na mesma janela.
 * 
 * DEVE ser chamado em TODOS os pontos de mutação:
 * - ResultadoPill (resolver resultado)
 * - ApostaDialog (salvar / excluir)
 * - ApostaMultiplaDialog (salvar / excluir)
 * - SurebetDialog (salvar / excluir / liquidar perna)
 * - Bônus, Cashback, Giros Grátis, Conciliação
 *
 * Usa refetchType:'active' para forçar refetch IMEDIATO de queries montadas,
 * garantindo que badges/KPIs/calendário atualizem em <1s sem F5.
 */
export async function invalidateCanonicalCaches(queryClient: QueryClient, projetoId: string): Promise<void> {
  const opts = { refetchType: "active" as const };
  await Promise.all([
    // KPIs canônicos (Lucro, Evolução, Calendário)
    queryClient.invalidateQueries({ queryKey: ["canonical-calendar-daily", projetoId], ...opts }),
    queryClient.invalidateQueries({ queryKey: ["calendar-apostas-rpc", projetoId], ...opts }),
    queryClient.invalidateQueries({ queryKey: ["projeto-lucro-kpi-canonical", projetoId], ...opts }),
    // Dashboard / Visão Geral
    queryClient.invalidateQueries({ queryKey: ["projeto-dashboard-apostas", projetoId], ...opts }),
    queryClient.invalidateQueries({ queryKey: ["projeto-dashboard-calendario", projetoId], ...opts }),
    queryClient.invalidateQueries({ queryKey: ["projeto-dashboard-extras", projetoId], ...opts }),
    queryClient.invalidateQueries({ queryKey: ["projeto-dashboard-data", projetoId], ...opts }),
    // Resultado / Breakdowns
    queryClient.invalidateQueries({ queryKey: ["projeto-resultado", projetoId], ...opts }),
    queryClient.invalidateQueries({ queryKey: ["projeto-breakdowns", projetoId], ...opts }),
    // Indicadores Financeiros (Fluxo Líquido Ajustado, Break-Even)
    queryClient.invalidateQueries({ queryKey: ["projeto-financial-metrics", projetoId], ...opts }),
    // Listas operacionais com filtros/períodos: invalidar por prefixo do projeto
    queryClient.invalidateQueries({ queryKey: ["surebets-tab", projetoId], ...opts }),
    queryClient.invalidateQueries({ queryKey: ["apostas", projetoId], ...opts }),
    // Módulos promocionais e financeiros dependentes
    queryClient.invalidateQueries({ queryKey: ["bonus", "project", projetoId], ...opts }),
    queryClient.invalidateQueries({ queryKey: ["bonus-bets-summary", projetoId], ...opts }),
    queryClient.invalidateQueries({ queryKey: ["bonus-analytics", projetoId], ...opts }),
    queryClient.invalidateQueries({ queryKey: ["bonus-bets-juice", projetoId], ...opts }),
    queryClient.invalidateQueries({ queryKey: ["bonus-ajustes-pos-limitacao", projetoId], ...opts }),
    queryClient.invalidateQueries({ queryKey: ["giros-gratis", projetoId], ...opts }),
    queryClient.invalidateQueries({ queryKey: ["giros-disponiveis", projetoId], ...opts }),
    queryClient.invalidateQueries({ queryKey: ["cashback-manual", projetoId], ...opts }),
    // Saldos/vínculos e Central de Operações
    queryClient.invalidateQueries({ queryKey: ["bookmaker-saldos", projetoId], ...opts }),
    queryClient.invalidateQueries({ queryKey: ["bookmaker-saldos"], ...opts }),
    queryClient.invalidateQueries({ queryKey: ["saldo-operavel-rpc", projetoId], ...opts }),
    queryClient.invalidateQueries({ queryKey: ["projeto-vinculos", projetoId], ...opts }),
    queryClient.invalidateQueries({ queryKey: ["central-operacoes-data"], ...opts }),
  ]);
}
