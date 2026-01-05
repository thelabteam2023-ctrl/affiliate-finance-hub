/**
 * Tab-isolated workspace storage
 * 
 * Usa sessionStorage (que é isolado por aba do navegador) para garantir
 * que cada aba mantenha seu próprio contexto de workspace.
 * 
 * Isso resolve o problema de multi-workspace simultâneo onde:
 * - Aba 1 está no Workspace A
 * - Aba 2 está no Workspace B
 * - Cada aba opera independentemente sem interferência
 */

const TAB_WORKSPACE_KEY = 'lovable_tab_workspace_id';
const TAB_WORKSPACE_INITIALIZED_KEY = 'lovable_tab_workspace_initialized';

/**
 * Obtém o workspace_id armazenado para esta aba específica.
 * Retorna null se não houver workspace definido para esta aba.
 */
export function getTabWorkspaceId(): string | null {
  try {
    return sessionStorage.getItem(TAB_WORKSPACE_KEY);
  } catch {
    // sessionStorage pode não estar disponível em alguns contextos
    console.warn('[TabWorkspace] sessionStorage não disponível');
    return null;
  }
}

/**
 * Define o workspace_id para esta aba específica.
 * Este valor persiste apenas enquanto a aba estiver aberta.
 */
export function setTabWorkspaceId(workspaceId: string): void {
  try {
    sessionStorage.setItem(TAB_WORKSPACE_KEY, workspaceId);
    sessionStorage.setItem(TAB_WORKSPACE_INITIALIZED_KEY, 'true');
    console.log('[TabWorkspace] Workspace da aba definido:', workspaceId);
  } catch (error) {
    console.error('[TabWorkspace] Erro ao salvar workspace da aba:', error);
  }
}

/**
 * Remove o workspace_id da aba (usado no logout).
 */
export function clearTabWorkspaceId(): void {
  try {
    sessionStorage.removeItem(TAB_WORKSPACE_KEY);
    sessionStorage.removeItem(TAB_WORKSPACE_INITIALIZED_KEY);
    console.log('[TabWorkspace] Workspace da aba limpo');
  } catch {
    // Ignora erros silenciosamente
  }
}

/**
 * Verifica se esta aba já foi inicializada com um workspace.
 * Útil para distinguir entre "aba nova" e "aba já inicializada mas sem workspace".
 */
export function isTabWorkspaceInitialized(): boolean {
  try {
    return sessionStorage.getItem(TAB_WORKSPACE_INITIALIZED_KEY) === 'true';
  } catch {
    return false;
  }
}

/**
 * Marca a aba como inicializada (mesmo que sem workspace).
 * Usado quando usuário não tem nenhum workspace.
 */
export function markTabAsInitialized(): void {
  try {
    sessionStorage.setItem(TAB_WORKSPACE_INITIALIZED_KEY, 'true');
  } catch {
    // Ignora erros silenciosamente
  }
}

/**
 * Gera um ID único para esta aba (para debugging e logs).
 */
let tabId: string | null = null;
export function getTabId(): string {
  if (!tabId) {
    try {
      tabId = sessionStorage.getItem('lovable_tab_id');
      if (!tabId) {
        tabId = `tab_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        sessionStorage.setItem('lovable_tab_id', tabId);
      }
    } catch {
      tabId = `tab_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }
  }
  return tabId;
}
