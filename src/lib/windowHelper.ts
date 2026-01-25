/**
 * Helper para abrir formulários em janelas independentes do navegador.
 * Centraliza a lógica de abertura de janelas para apostas, surebets, etc.
 */

export interface WindowOpenParams {
  projetoId: string;
  id?: string | null;
  activeTab?: string;
  estrategia?: string;
}

const DEFAULT_WINDOW_FEATURES = 'width=680,height=900,menubar=no,toolbar=no,location=no,status=no,resizable=yes,scrollbars=yes';

/**
 * Abre o formulário de Surebet em uma nova janela.
 */
export function openSurebetWindow(params: WindowOpenParams) {
  const { projetoId, id, activeTab = 'surebet' } = params;
  const surebetId = id || 'novo';
  const url = `/janela/surebet/${surebetId}?projetoId=${encodeURIComponent(projetoId)}&tab=${encodeURIComponent(activeTab)}`;
  window.open(url, '_blank', DEFAULT_WINDOW_FEATURES);
}

/**
 * Abre o formulário de Aposta Simples em uma nova janela.
 */
export function openApostaWindow(params: WindowOpenParams) {
  const { projetoId, id, activeTab = 'apostas', estrategia = 'PUNTER' } = params;
  const apostaId = id || 'novo';
  const url = `/janela/aposta/${apostaId}?projetoId=${encodeURIComponent(projetoId)}&tab=${encodeURIComponent(activeTab)}&estrategia=${encodeURIComponent(estrategia)}`;
  window.open(url, '_blank', DEFAULT_WINDOW_FEATURES);
}

/**
 * Abre o formulário de Aposta Múltipla em uma nova janela.
 */
export function openApostaMultiplaWindow(params: WindowOpenParams) {
  const { projetoId, id, activeTab = 'apostas', estrategia = 'PUNTER' } = params;
  const apostaId = id || 'novo';
  const url = `/janela/multipla/${apostaId}?projetoId=${encodeURIComponent(projetoId)}&tab=${encodeURIComponent(activeTab)}&estrategia=${encodeURIComponent(estrategia)}`;
  window.open(url, '_blank', DEFAULT_WINDOW_FEATURES);
}

/**
 * Hook para escutar eventos de salvamento vindos de janelas externas.
 * Usa BroadcastChannel para comunicação entre janelas.
 */
export function useWindowListener(
  channelName: string,
  eventType: string,
  callback: (projetoId: string) => void
) {
  if (typeof window === 'undefined') return;
  
  try {
    const channel = new BroadcastChannel(channelName);
    
    channel.onmessage = (event) => {
      if (event.data?.type === eventType && event.data?.projetoId) {
        callback(event.data.projetoId);
      }
    };
    
    return () => {
      channel.close();
    };
  } catch (err) {
    // Fallback: localStorage event
    const storageKey = channelName.replace('_channel', '_saved');
    
    const handleStorage = (event: StorageEvent) => {
      if (event.key === storageKey && event.newValue) {
        try {
          const data = JSON.parse(event.newValue);
          if (data.projetoId) {
            callback(data.projetoId);
          }
        } catch (e) {
          console.error(`Erro ao parsear ${storageKey}:`, e);
        }
      }
    };
    
    window.addEventListener('storage', handleStorage);
    
    return () => {
      window.removeEventListener('storage', handleStorage);
    };
  }
}

/**
 * Escuta eventos de Surebet salvos.
 */
export function useSurebetWindowListener(callback: (projetoId: string) => void) {
  return useWindowListener('surebet_channel', 'SUREBET_SAVED', callback);
}

/**
 * Escuta eventos de Aposta Simples salvos.
 */
export function useApostaWindowListener(callback: (projetoId: string) => void) {
  return useWindowListener('aposta_channel', 'APOSTA_SAVED', callback);
}

/**
 * Escuta eventos de Aposta Múltipla salvos.
 */
export function useApostaMultiplaWindowListener(callback: (projetoId: string) => void) {
  return useWindowListener('aposta_multipla_channel', 'APOSTA_MULTIPLA_SAVED', callback);
}
