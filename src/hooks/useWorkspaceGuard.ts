import { useTabWorkspace, useWorkspaceInjector } from "./useTabWorkspace";

/**
 * Hook que garante isolamento de workspace em queries.
 * 
 * ATUALIZADO: Agora usa sessionStorage para isolamento por aba.
 * Cada aba do navegador mantém seu próprio contexto de workspace.
 * 
 * - Retorna workspaceId da aba atual ou null se ainda carregando
 * - Invalida cache do React Query ao trocar de workspace
 * - Lança erro se usado sem workspace (após carregamento)
 */
export function useWorkspaceGuard() {
  const { 
    workspaceId, 
    hasWorkspace, 
    createQueryKey, 
    canOperate,
    tabId 
  } = useTabWorkspace();

  return {
    workspaceId,
    hasWorkspace,
    canOperate,
    tabId,
    // Helper para criar query keys com workspace
    createQueryKey,
    // Guard: só retorna workspaceId se válido
    getWorkspaceIdOrThrow: () => {
      if (!workspaceId) {
        throw new Error('Workspace não disponível nesta aba. Operação bloqueada.');
      }
      return workspaceId;
    }
  };
}

/**
 * Hook para filtrar queries por workspace.
 * Retorna um objeto de filtro pronto para uso com Supabase.
 * 
 * ATUALIZADO: Usa workspace da aba atual, não do banco.
 */
export function useWorkspaceFilter() {
  const { workspaceId, filter, canOperate } = useTabWorkspace();
  
  return {
    workspaceId,
    // Filtro para queries Supabase
    filter,
    // Verificar se pode fazer query
    canQuery: canOperate,
  };
}

// Re-export para conveniência
export { useWorkspaceInjector } from "./useTabWorkspace";
