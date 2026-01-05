import { useAuth } from "./useAuth";

/**
 * Hook para acessar informações do workspace.
 * 
 * ATUALIZADO: Agora usa isolamento por aba do navegador.
 * O workspace é lido do sessionStorage, garantindo que cada
 * aba mantém seu próprio contexto.
 */
export function useWorkspace() {
  const { 
    workspace, 
    workspaceId, 
    refreshWorkspace,
    setWorkspaceForTab,
    tabId,
  } = useAuth();

  return {
    workspace,
    workspaceId,
    workspaceName: workspace?.name ?? null,
    workspaceSlug: workspace?.slug ?? null,
    workspacePlan: workspace?.plan ?? 'free',
    hasWorkspace: !!workspace,
    tabId,
    // Função para recarregar workspace da aba atual
    refreshWorkspace,
    // Função para trocar workspace nesta aba
    setWorkspaceForTab,
  };
}
