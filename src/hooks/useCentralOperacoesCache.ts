/**
 * Hybrid cache update strategy for CentralOperacoes.
 * 
 * Simple mutations → optimistic setQueryData + debounced reconciliation
 * Complex mutations → immediate full refetch
 * 
 * This avoids re-executing the entire RPC for every small change
 * while keeping data consistent via background reconciliation.
 */

import { useCallback, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { useRole } from "@/hooks/useRole";
import type { CentralOperacoesData } from "@/hooks/useCentralOperacoesData";

const RECONCILE_DELAY_MS = 5_000;

type Updater = (prev: CentralOperacoesData) => CentralOperacoesData;

export function useCentralOperacoesCache() {
  const queryClient = useQueryClient();
  const { workspaceId } = useAuth();
  const { role } = useRole();
  const reconcileTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const queryKey = ["central-operacoes-data", workspaceId, role];

  /**
   * Schedule a background refetch to reconcile optimistic state.
   */
  const scheduleReconcile = useCallback(() => {
    if (reconcileTimer.current) clearTimeout(reconcileTimer.current);
    reconcileTimer.current = setTimeout(() => {
      queryClient.invalidateQueries({ queryKey });
    }, RECONCILE_DELAY_MS);
  }, [queryClient, queryKey]);

  /**
   * Optimistic update: mutate cache immediately, then reconcile in background.
   * Use for simple, predictable mutations (remove item from list, etc.)
   */
  const optimisticUpdate = useCallback((updater: Updater) => {
    queryClient.setQueryData<CentralOperacoesData>(queryKey, (old) => {
      if (!old) return old;
      return updater(old);
    });
    scheduleReconcile();
  }, [queryClient, queryKey, scheduleReconcile]);

  /**
   * Remove an item from a specific array in the cache by ID.
   */
  const removeFromList = useCallback(<K extends keyof CentralOperacoesData>(
    listKey: K,
    idField: string,
    idValue: string,
  ) => {
    optimisticUpdate((prev) => ({
      ...prev,
      [listKey]: (prev[listKey] as any[]).filter(
        (item: any) => item[idField] !== idValue
      ),
    }));
  }, [optimisticUpdate]);

  /**
   * Full refetch — use for complex mutations where optimistic update is risky.
   */
  const fullRefetch = useCallback(() => {
    if (reconcileTimer.current) clearTimeout(reconcileTimer.current);
    queryClient.invalidateQueries({ queryKey });
  }, [queryClient, queryKey]);

  return {
    optimisticUpdate,
    removeFromList,
    fullRefetch,
    scheduleReconcile,
  };
}
