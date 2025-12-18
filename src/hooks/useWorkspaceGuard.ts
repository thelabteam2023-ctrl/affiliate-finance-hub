import { useWorkspace } from "./useWorkspace";
import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef } from "react";

/**
 * Hook que garante isolamento de workspace em queries.
 * 
 * - Retorna workspaceId ou null se ainda carregando
 * - Invalida cache do React Query ao trocar de workspace
 * - Lança erro se usado sem workspace (após carregamento)
 */
export function useWorkspaceGuard() {
  const { workspaceId, hasWorkspace } = useWorkspace();
  const queryClient = useQueryClient();
  const previousWorkspaceId = useRef<string | null>(null);

  // Invalidar cache quando workspace mudar
  useEffect(() => {
    if (previousWorkspaceId.current !== null && 
        previousWorkspaceId.current !== workspaceId) {
      // Workspace mudou - limpar todo o cache
      console.log('[WorkspaceGuard] Workspace changed, clearing cache');
      queryClient.clear();
    }
    previousWorkspaceId.current = workspaceId;
  }, [workspaceId, queryClient]);

  return {
    workspaceId,
    hasWorkspace,
    // Helper para criar query keys com workspace
    createQueryKey: (baseKey: string[]) => [...baseKey, workspaceId],
    // Guard: só retorna workspaceId se válido
    getWorkspaceIdOrThrow: () => {
      if (!workspaceId) {
        throw new Error('Workspace não disponível. Operação bloqueada.');
      }
      return workspaceId;
    }
  };
}

/**
 * Hook para filtrar queries por workspace.
 * Retorna um objeto de filtro pronto para uso com Supabase.
 */
export function useWorkspaceFilter() {
  const { workspaceId } = useWorkspace();
  
  return {
    workspaceId,
    // Filtro para queries Supabase
    filter: workspaceId ? { workspace_id: workspaceId } : null,
    // Verificar se pode fazer query
    canQuery: !!workspaceId,
  };
}
