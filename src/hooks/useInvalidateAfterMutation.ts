/**
 * Hook UNIFICADO de invalidação pós-mutação.
 *
 * COMBINA:
 * - invalidateCanonicalCaches (KPIs canônicos: Lucro, Evolução, Calendário, Indicadores)
 * - useInvalidateProjectQueries (saldos, vínculos, breakdowns, listagens por módulo)
 *
 * MOTIVAÇÃO:
 * Antes desta unificação, cada handler chamava manualmente os 2 mecanismos —
 * frequentemente esquecendo um deles, causando o problema reportado pelos
 * usuários: "criei/editei a aposta mas o badge Evolução do Lucro não atualiza".
 *
 * USO:
 * const invalidateAll = useInvalidateAfterMutation();
 * await invalidateAll(projetoId);                        // Invalida TUDO
 * await invalidateAll(projetoId, { only: ["apostas"] }); // Só módulo específico + canônicos
 *
 * REGRA DE OURO:
 * Após QUALQUER mutação financeira (INSERT/UPDATE/DELETE em apostas, bônus,
 * cashback, giros, conciliação, ledger), chame este hook. Sem exceção.
 */

import { useCallback } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { invalidateCanonicalCaches } from "@/lib/invalidateCanonicalCaches";
import { useInvalidateProjectQueries } from "./useInvalidateProjectQueries";

type ProjectInvalidateOpts = Parameters<ReturnType<typeof useInvalidateProjectQueries>>[1];

export function useInvalidateAfterMutation() {
  const queryClient = useQueryClient();
  const invalidateProject = useInvalidateProjectQueries();

  return useCallback(
    async (projetoId: string, options?: ProjectInvalidateOpts) => {
      // 1. Canônicos primeiro (refetchType:'active' → atualização <1s na UI)
      await invalidateCanonicalCaches(queryClient, projetoId);
      // 2. Queries específicas do módulo (saldos, listagens, vínculos)
      await invalidateProject(projetoId, options);
    },
    [queryClient, invalidateProject],
  );
}

/**
 * Versão curried para passar a sub-componentes sem repetir projetoId.
 */
export function useInvalidateAfterMutationCallback(projetoId: string) {
  const invalidateAll = useInvalidateAfterMutation();
  return useCallback(
    async (options?: ProjectInvalidateOpts) => {
      await invalidateAll(projetoId, options);
    },
    [invalidateAll, projetoId],
  );
}