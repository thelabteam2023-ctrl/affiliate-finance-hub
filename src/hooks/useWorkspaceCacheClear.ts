/**
 * Hook centralizado para limpeza de caches na troca de workspace
 * 
 * OBJETIVO: Garantir que NENHUM dado do workspace anterior sobreviva
 * após a troca, eliminando qualquer risco de vazamento de tenant.
 * 
 * Limpa:
 * - React Query cache (queryClient.clear)
 * - LRU caches manuais (parceiros, financeiro)
 * - Estado local de componentes (via evento)
 */

import { useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useState } from "react";

// Evento customizado para notificar componentes sobre troca de workspace
export const WORKSPACE_CHANGED_EVENT = "lovable:workspace-changed";

interface WorkspaceChangedDetail {
  previousWorkspaceId: string | null;
  newWorkspaceId: string;
  timestamp: number;
}

/**
 * Hook para disparar limpeza completa de cache
 */
export function useWorkspaceCacheClear() {
  const queryClient = useQueryClient();

  const clearAllCaches = useCallback((previousId: string | null, newId: string) => {
    console.log(`[WorkspaceCacheClear] Iniciando limpeza completa de cache`);
    console.log(`[WorkspaceCacheClear] Workspace anterior: ${previousId}`);
    console.log(`[WorkspaceCacheClear] Workspace novo: ${newId}`);
    
    // 1. Limpar React Query cache completamente
    queryClient.clear();
    console.log(`[WorkspaceCacheClear] React Query cache limpo`);
    
    // 2. Disparar evento para componentes com cache local
    const event = new CustomEvent<WorkspaceChangedDetail>(WORKSPACE_CHANGED_EVENT, {
      detail: {
        previousWorkspaceId: previousId,
        newWorkspaceId: newId,
        timestamp: Date.now()
      }
    });
    window.dispatchEvent(event);
    console.log(`[WorkspaceCacheClear] Evento de troca disparado`);
    
    // 3. Forçar garbage collection de referências stale
    // (React Query já faz isso, mas reforçamos)
    queryClient.removeQueries();
    
    console.log(`[WorkspaceCacheClear] Limpeza completa finalizada`);
  }, [queryClient]);

  return { clearAllCaches };
}

/**
 * Hook para ouvir eventos de troca de workspace
 * Útil para componentes com cache local ou estado que precisa ser resetado
 */
export function useWorkspaceChangeListener(callback: (detail: WorkspaceChangedDetail) => void) {
  useEffect(() => {
    const handler = (event: Event) => {
      const customEvent = event as CustomEvent<WorkspaceChangedDetail>;
      callback(customEvent.detail);
    };

    window.addEventListener(WORKSPACE_CHANGED_EVENT, handler);
    
    return () => {
      window.removeEventListener(WORKSPACE_CHANGED_EVENT, handler);
    };
  }, [callback]);
}

/**
 * Hook para componentes que precisam resetar estado na troca
 * Retorna um contador que incrementa a cada troca (pode ser usado como key)
 */
export function useWorkspaceResetKey(): number {
  const [resetKey, setResetKey] = useState(0);
  
  useWorkspaceChangeListener(useCallback(() => {
    setResetKey(prev => prev + 1);
  }, []));
  
  return resetKey;
}
