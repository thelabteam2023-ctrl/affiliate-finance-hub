import { useAuth } from "./useAuth";
import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useCallback } from "react";
import { getTabWorkspaceId, getTabId } from "@/lib/tabWorkspace";

/**
 * Hook para obter o workspace isolado por aba.
 * 
 * IMPORTANTE: Este hook garante que cada aba do navegador mantém
 * seu próprio contexto de workspace, independente de outras abas.
 * 
 * Funcionalidades:
 * - Retorna o workspaceId da aba atual (não do banco)
 * - Invalida cache automaticamente se detectar mudança
 * - Fornece helpers para criar query keys com workspace
 */
export function useTabWorkspace() {
  const { workspace, workspaceId, user, setWorkspaceForTab, tabId } = useAuth();
  const queryClient = useQueryClient();
  const previousWorkspaceId = useRef<string | null>(null);

  // Detectar mudanças de workspace e limpar cache
  useEffect(() => {
    if (previousWorkspaceId.current !== null && 
        previousWorkspaceId.current !== workspaceId &&
        workspaceId !== null) {
      console.log(`[TabWorkspace][${tabId}] Workspace changed from ${previousWorkspaceId.current} to ${workspaceId}, clearing cache`);
      queryClient.clear();
    }
    previousWorkspaceId.current = workspaceId;
  }, [workspaceId, queryClient, tabId]);

  /**
   * Cria uma query key que inclui o workspace da aba.
   * Isso garante que queries são isoladas por workspace.
   */
  const createQueryKey = useCallback((baseKey: string[]) => {
    return [...baseKey, workspaceId];
  }, [workspaceId]);

  /**
   * Retorna o workspaceId ou lança erro se não disponível.
   * Use quando workspace é obrigatório para a operação.
   */
  const getWorkspaceIdOrThrow = useCallback(() => {
    if (!workspaceId) {
      throw new Error('Workspace não disponível nesta aba. Operação bloqueada.');
    }
    return workspaceId;
  }, [workspaceId]);

  /**
   * Verifica se é seguro fazer operações que requerem workspace.
   */
  const canOperate = !!workspaceId && !!user;

  return {
    // Dados do workspace
    workspace,
    workspaceId,
    workspaceName: workspace?.name ?? null,
    workspaceSlug: workspace?.slug ?? null,
    workspacePlan: workspace?.plan ?? 'free',
    
    // Identificação da aba
    tabId,
    
    // Estado
    hasWorkspace: !!workspace,
    canOperate,
    
    // Funções
    createQueryKey,
    getWorkspaceIdOrThrow,
    setWorkspaceForTab,
    
    // Filtro para queries Supabase
    filter: workspaceId ? { workspace_id: workspaceId } : null,
  };
}

/**
 * Hook para injetar workspace_id em operações de banco.
 * 
 * Uso:
 * const { withWorkspace } = useWorkspaceInjector();
 * 
 * // Em inserts
 * const data = withWorkspace({ nome: 'Teste', valor: 100 });
 * // Resultado: { nome: 'Teste', valor: 100, workspace_id: 'xxx' }
 */
export function useWorkspaceInjector() {
  const { workspaceId, tabId } = useTabWorkspace();

  /**
   * Adiciona workspace_id a um objeto de dados.
   * Lança erro se workspace não estiver disponível.
   */
  const withWorkspace = useCallback(<T extends Record<string, unknown>>(data: T): T & { workspace_id: string } => {
    if (!workspaceId) {
      console.error(`[WorkspaceInjector][${tabId}] Tentativa de operação sem workspace`);
      throw new Error('Workspace não disponível. Não é possível executar esta operação.');
    }
    return { ...data, workspace_id: workspaceId };
  }, [workspaceId, tabId]);

  /**
   * Retorna o workspace_id para usar em queries.
   * Retorna null se não disponível (para queries opcionais).
   */
  const getWorkspaceFilter = useCallback(() => {
    return workspaceId ? { workspace_id: workspaceId } : null;
  }, [workspaceId]);

  return {
    workspaceId,
    withWorkspace,
    getWorkspaceFilter,
    canOperate: !!workspaceId,
  };
}

/**
 * Hook de debug para verificar isolamento de workspace.
 */
export function useWorkspaceDebug() {
  const { workspaceId, tabId } = useTabWorkspace();
  const sessionStorageId = getTabWorkspaceId();
  
  return {
    tabId,
    workspaceIdFromContext: workspaceId,
    workspaceIdFromSessionStorage: sessionStorageId,
    isConsistent: workspaceId === sessionStorageId,
    debug: () => {
      console.log(`[WorkspaceDebug][${tabId}]`, {
        context: workspaceId,
        sessionStorage: sessionStorageId,
        consistent: workspaceId === sessionStorageId,
      });
    },
  };
}
