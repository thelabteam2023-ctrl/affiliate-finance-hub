import { useEffect, useRef, useCallback } from 'react';

/**
 * Hook centralizado para sincronização cross-window via BroadcastChannel.
 * Elimina duplicação de ~650 linhas espalhadas em 12+ arquivos.
 * 
 * @example
 * useCrossWindowSync({
 *   projetoId,
 *   onSync: () => {
 *     fetchData();
 *     onDataChange?.();
 *   }
 * });
 */

export type SyncChannel = 'aposta' | 'multipla' | 'surebet';

export interface CrossWindowSyncOptions {
  /** ID do projeto para filtrar eventos relevantes */
  projetoId: string;
  /** Callback executado quando qualquer evento de sincronização é recebido */
  onSync: () => void;
  /** Canais a escutar. Padrão: todos os 3 */
  channels?: SyncChannel[];
  /** Habilita logging de debug */
  debug?: boolean;
}

// Mapeamento de canais para nomes reais e eventos válidos
const CHANNEL_CONFIG: Record<SyncChannel, {
  channelName: string;
  validEvents: string[];
  storageKey: string;
}> = {
  aposta: {
    channelName: 'aposta_channel',
    validEvents: ['APOSTA_SAVED', 'APOSTA_DELETED', 'resultado_updated'],
    storageKey: 'aposta_saved',
  },
  multipla: {
    channelName: 'aposta_multipla_channel',
    validEvents: ['APOSTA_MULTIPLA_SAVED'],
    storageKey: 'aposta_multipla_saved',
  },
  surebet: {
    channelName: 'surebet_channel',
    validEvents: ['SUREBET_SAVED'],
    storageKey: 'surebet_saved',
  },
};

const ALL_CHANNELS: SyncChannel[] = ['aposta', 'multipla', 'surebet'];

/**
 * Hook centralizado para sincronização entre janelas/abas do navegador.
 * Gerencia BroadcastChannel + fallback localStorage automaticamente.
 */
export function useCrossWindowSync(options: CrossWindowSyncOptions): void {
  const { projetoId, onSync, channels = ALL_CHANNELS, debug = false } = options;
  
  // Refs para evitar re-criação desnecessária
  const onSyncRef = useRef(onSync);
  const debugRef = useRef(debug);
  
  // Atualiza refs quando callbacks mudam
  useEffect(() => {
    onSyncRef.current = onSync;
    debugRef.current = debug;
  }, [onSync, debug]);

  const log = useCallback((message: string, ...args: unknown[]) => {
    if (debugRef.current) {
      console.log(`[useCrossWindowSync] ${message}`, ...args);
    }
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    
    const broadcastChannels: BroadcastChannel[] = [];
    const storageKeys = new Set<string>();
    
    // Tenta criar BroadcastChannels
    let useBroadcastChannel = true;
    
    try {
      channels.forEach((channel) => {
        const config = CHANNEL_CONFIG[channel];
        const bc = new BroadcastChannel(config.channelName);
        
        bc.onmessage = (event: MessageEvent) => {
          const { type, projetoId: eventProjetoId } = event.data || {};
          
          // Valida se é um evento relevante para este projeto
          if (config.validEvents.includes(type) && eventProjetoId === projetoId) {
            log(`Evento recebido: ${type} para projeto ${projetoId}`);
            onSyncRef.current();
          }
        };
        
        broadcastChannels.push(bc);
        storageKeys.add(config.storageKey);
        
        log(`Canal ${config.channelName} registrado`);
      });
    } catch (err) {
      // BroadcastChannel não suportado - usa fallback
      useBroadcastChannel = false;
      log('BroadcastChannel não suportado, usando fallback localStorage');
      
      // Configura storage keys para fallback
      channels.forEach((channel) => {
        storageKeys.add(CHANNEL_CONFIG[channel].storageKey);
      });
    }
    
    // Fallback 1: listener para localStorage (funciona em todos os browsers)
    const handleStorage = (event: StorageEvent) => {
      if (!event.key || !storageKeys.has(event.key) || !event.newValue) return;
      
      try {
        const data = JSON.parse(event.newValue);
        if (data.projetoId === projetoId) {
          log(`Evento localStorage recebido: ${event.key}`);
          onSyncRef.current();
        }
      } catch {
        // Ignora erros de parse
      }
    };
    
    // Fallback 2: postMessage (cross-origin compatible, from window.opener)
    const handleMessage = (event: MessageEvent) => {
      const data = event.data;
      if (!data || data.source !== 'surebet_window') return;
      
      const matchesChannel = channels.some((ch) => {
        const config = CHANNEL_CONFIG[ch];
        return config.validEvents.includes(data.type);
      });
      
      if (matchesChannel && data.projetoId === projetoId) {
        log(`Evento postMessage recebido: ${data.type}`);
        onSyncRef.current();
      }
    };
    
    window.addEventListener('storage', handleStorage);
    window.addEventListener('message', handleMessage);
    
    // Cleanup
    return () => {
      broadcastChannels.forEach((bc) => {
        try {
          bc.close();
        } catch {
          // Ignora erros ao fechar
        }
      });
      window.removeEventListener('storage', handleStorage);
      window.removeEventListener('message', handleMessage);
      log('Canais fechados e listeners removidos');
    };
  }, [projetoId, channels, log]);
}

/**
 * Preset: escuta apenas o canal de apostas simples
 */
export function useApostaSyncListener(projetoId: string, onSync: () => void): void {
  useCrossWindowSync({ projetoId, onSync, channels: ['aposta'] });
}

/**
 * Preset: escuta apenas o canal de apostas múltiplas
 */
export function useMultiplaSyncListener(projetoId: string, onSync: () => void): void {
  useCrossWindowSync({ projetoId, onSync, channels: ['multipla'] });
}

/**
 * Preset: escuta apenas o canal de surebets
 */
export function useSurebetSyncListener(projetoId: string, onSync: () => void): void {
  useCrossWindowSync({ projetoId, onSync, channels: ['surebet'] });
}

/**
 * Preset: escuta todos os canais (default)
 */
export function useAllBetsSyncListener(projetoId: string, onSync: () => void): void {
  useCrossWindowSync({ projetoId, onSync });
}
