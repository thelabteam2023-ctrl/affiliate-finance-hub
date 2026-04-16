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
 */
export function invalidateCanonicalCaches(queryClient: QueryClient, projetoId: string): void {
  queryClient.invalidateQueries({ queryKey: ["canonical-calendar-daily", projetoId] });
  queryClient.invalidateQueries({ queryKey: ["calendar-apostas-rpc", projetoId] });
  queryClient.invalidateQueries({ queryKey: ["projeto-lucro-kpi-canonical", projetoId] });
  queryClient.invalidateQueries({ queryKey: ["projeto-dashboard-apostas", projetoId] });
  queryClient.invalidateQueries({ queryKey: ["projeto-dashboard-calendario", projetoId] });
  queryClient.invalidateQueries({ queryKey: ["projeto-dashboard-extras", projetoId] });
  queryClient.invalidateQueries({ queryKey: ["projeto-dashboard-data", projetoId] });
  queryClient.invalidateQueries({ queryKey: ["projeto-resultado", projetoId] });
}
