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

const DEFAULT_WINDOW_FEATURES = 'width=680,height=720,menubar=no,toolbar=no,location=no,status=no,resizable=yes,scrollbars=yes';

/**
 * Calcula altura ideal da janela de Surebet baseada na quantidade de pernas.
 * Base fixa (header + campos + resumo + footer) + altura por perna.
 */
export function calcSurebetWindowHeight(numPernas: number): number {
  const BASE_HEIGHT = 510; // header (2 lines now) + game fields + model tabs + summary + footer + padding
  const HEIGHT_PER_LEG = 80; // each leg row height
  const calculated = BASE_HEIGHT + (HEIGHT_PER_LEG * numPernas);
  // Cap at screen height
  const maxHeight = typeof window !== 'undefined' ? window.screen.availHeight - 40 : 900;
  return Math.min(calculated, maxHeight);
}

const SUREBET_WINDOW_FEATURES = 'width=780,menubar=no,toolbar=no,location=no,status=no,resizable=yes,scrollbars=yes';

/**
 * Abre o formulário de Surebet em uma nova janela.
 */
export function openSurebetWindow(params: WindowOpenParams & { numPernas?: number }) {
  const { projetoId, id, activeTab = 'surebet', numPernas = 3 } = params;
  const surebetId = id || 'novo';
  const url = `/janela/surebet/${surebetId}?projetoId=${encodeURIComponent(projetoId)}&tab=${encodeURIComponent(activeTab)}`;
  const height = calcSurebetWindowHeight(numPernas);
  window.open(url, '_blank', `${SUREBET_WINDOW_FEATURES},height=${height}`);
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

// ============================================================================
// BROADCAST HELPERS - Funções padronizadas para emissão de eventos cross-window
// ============================================================================

export type AppostaBroadcastType = 'APOSTA_SAVED' | 'APOSTA_DELETED' | 'resultado_updated';
export type MultiplaBroadcastType = 'APOSTA_MULTIPLA_SAVED';
export type SurebetBroadcastType = 'SUREBET_SAVED';

interface BroadcastPayload {
  type: string;
  projetoId: string;
  apostaId?: string;
  timestamp: number;
}

/**
 * Emite evento de aposta simples via BroadcastChannel + localStorage fallback
 */
export function broadcastAposta(
  type: AppostaBroadcastType,
  projetoId: string,
  apostaId?: string
): void {
  const payload: BroadcastPayload = {
    type,
    projetoId,
    apostaId,
    timestamp: Date.now(),
  };
  
  try {
    const channel = new BroadcastChannel('aposta_channel');
    channel.postMessage(payload);
    channel.close();
  } catch {
    // Fallback para localStorage
    localStorage.setItem('aposta_saved', JSON.stringify(payload));
  }
}

/**
 * Emite evento de aposta múltipla via BroadcastChannel + localStorage fallback
 */
export function broadcastMultipla(
  type: MultiplaBroadcastType,
  projetoId: string,
  apostaId?: string
): void {
  const payload: BroadcastPayload = {
    type,
    projetoId,
    apostaId,
    timestamp: Date.now(),
  };
  
  try {
    const channel = new BroadcastChannel('aposta_multipla_channel');
    channel.postMessage(payload);
    channel.close();
  } catch {
    localStorage.setItem('aposta_multipla_saved', JSON.stringify(payload));
  }
}

/**
 * Emite evento de surebet via BroadcastChannel + localStorage fallback
 */
export function broadcastSurebet(
  type: SurebetBroadcastType,
  projetoId: string,
  surebetId?: string
): void {
  const payload: BroadcastPayload = {
    type,
    projetoId,
    apostaId: surebetId,
    timestamp: Date.now(),
  };
  
  try {
    const channel = new BroadcastChannel('surebet_channel');
    channel.postMessage(payload);
    channel.close();
  } catch {
    localStorage.setItem('surebet_saved', JSON.stringify(payload));
  }
}

/**
 * Emite evento de resultado atualizado (usa canal de aposta)
 */
export function broadcastResultadoUpdated(projetoId: string, apostaId?: string): void {
  broadcastAposta('resultado_updated', projetoId, apostaId);
}

// ============================================================================
// LEGACY LISTENERS - Mantidos para compatibilidade, mas preferir useCrossWindowSync
// ============================================================================

/**
 * @deprecated Use `useCrossWindowSync` do hook centralizado
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
 * @deprecated Use `useCrossWindowSync` do hook centralizado
 */
export function useSurebetWindowListener(callback: (projetoId: string) => void) {
  return useWindowListener('surebet_channel', 'SUREBET_SAVED', callback);
}

/**
 * @deprecated Use `useCrossWindowSync` do hook centralizado
 */
export function useApostaWindowListener(callback: (projetoId: string) => void) {
  return useWindowListener('aposta_channel', 'APOSTA_SAVED', callback);
}

/**
 * @deprecated Use `useCrossWindowSync` do hook centralizado
 */
export function useApostaMultiplaWindowListener(callback: (projetoId: string) => void) {
  return useWindowListener('aposta_multipla_channel', 'APOSTA_MULTIPLA_SAVED', callback);
}
