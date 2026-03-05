/**
 * useFreebetEstoque — Slim composer hook
 * 
 * Compõe os 3 módulos especializados:
 * - useFreebetEstoqueQuery (fetch via useQuery)
 * - useFreebetEstoqueMutations (CRUD via useMutation)
 * - useFreebetEstoqueMetrics (métricas derivadas)
 * 
 * Mantém a mesma API pública para retrocompatibilidade.
 */
import { useFreebetEstoqueQuery } from "./freebet-estoque/useFreebetEstoqueQuery";
import { useFreebetEstoqueMutations } from "./freebet-estoque/useFreebetEstoqueMutations";
import { useFreebetEstoqueMetrics } from "./freebet-estoque/useFreebetEstoqueMetrics";
import type { UseFreebetEstoqueProps } from "./freebet-estoque/types";

// Re-export types for backward compatibility
export type { FreebetRecebidaCompleta, BookmakerEstoque, EstoqueMetrics } from "./freebet-estoque/types";
export { FREEBET_ESTOQUE_KEYS } from "./freebet-estoque/types";

export function useFreebetEstoque({ projetoId, dataInicio, dataFim }: UseFreebetEstoqueProps) {
  // 1. Data fetching via useQuery (reativo, invalidável)
  const { data, isLoading, error, refetch } = useFreebetEstoqueQuery({ projetoId, dataInicio, dataFim });

  const freebets = data?.freebets ?? [];
  const bookmakersEstoque = data?.bookmakersEstoque ?? [];

  // 2. Mutations (CRUD com invalidação centralizada)
  const mutations = useFreebetEstoqueMutations(projetoId);

  // 3. Métricas derivadas
  const { metrics, moedaConsolidacao, cotacaoInfo } = useFreebetEstoqueMetrics(projetoId, freebets, bookmakersEstoque);

  return {
    freebets,
    bookmakersEstoque,
    metrics,
    loading: isLoading,
    error: error?.message ?? null,
    refresh: refetch,
    createFreebet: mutations.createFreebet,
    updateFreebet: mutations.updateFreebet,
    // Adapter: deleteFreebet agora precisa do objeto freebet, mas manter API compatível
    deleteFreebet: async (id: string) => {
      const freebet = freebets.find(fb => fb.id === id);
      if (!freebet) {
        const { toast } = await import("sonner");
        toast.error("Freebet não encontrada");
        return false;
      }
      return mutations.deleteFreebet(id, freebet);
    },
    moedaConsolidacao,
    cotacaoInfo,
  };
}
