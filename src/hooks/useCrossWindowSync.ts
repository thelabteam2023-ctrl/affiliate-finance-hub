import { useEffect, useRef, useCallback } from 'react';

/**
 * Hook centralizado para sincronização cross-window.
 * 
 * ESTRATÉGIA DEFINITIVA (4 camadas):
 * 1. BroadcastChannel — instantâneo, same-origin
 * 2. window.postMessage — cross-context (iframe ↔ popup)
 * 3. localStorage StorageEvent — fallback universal
 * 4. ✅ visibilitychange + focus — SAFETY NET GARANTIDO
 *    Quando o usuário volta à janela principal, refetch automático.
 *    Funciona independentemente de qualquer canal de mensagem.
 * 
 * A camada 4 elimina o problema de ambientes onde BroadcastChannel
 * não funciona (iframe sandbox, cross-origin, etc).
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
  /** Desabilita refetch ao ganhar foco (default: false) */
  disableFocusRefetch?: boolean;
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

/** Debounce mínimo entre refetches por foco (ms) */
const FOCUS_DEBOUNCE_MS = 2000;

/**
 * Hook centralizado para sincronização entre janelas/abas do navegador.
 * 
 * Além dos canais de mensagem, implementa refetch automático ao ganhar
 * foco como safety net definitivo — independente de BroadcastChannel.
 */
export function useCrossWindowSync(options: CrossWindowSyncOptions): void {
  const { 
    projetoId, 
    onSync, 
    channels = ALL_CHANNELS, 
    debug = false,
    disableFocusRefetch = false,
  } = options;
  
  // Refs para evitar re-criação desnecessária
  const onSyncRef = useRef(onSync);
  const debugRef = useRef(debug);
  const lastFocusSyncRef = useRef<number>(0);
  const wasHiddenRef = useRef(false);
  
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

  // ================================================================
  // CAMADAS 1-3: BroadcastChannel + postMessage + localStorage
  // ================================================================
  useEffect(() => {
    if (typeof window === 'undefined') return;
    
    const broadcastChannels: BroadcastChannel[] = [];
    const storageKeys = new Set<string>();
    
    // Camada 1: BroadcastChannel (instantâneo, same-origin)
    try {
      channels.forEach((channel) => {
        const config = CHANNEL_CONFIG[channel];
        const bc = new BroadcastChannel(config.channelName);
        
        bc.onmessage = (event: MessageEvent) => {
          const { type, projetoId: eventProjetoId } = event.data || {};
          
          if (config.validEvents.includes(type) && eventProjetoId === projetoId) {
            log(`[BC] Evento: ${type}`);
            onSyncRef.current();
          }
        };
        
        broadcastChannels.push(bc);
        storageKeys.add(config.storageKey);
      });
    } catch {
      channels.forEach((channel) => {
        storageKeys.add(CHANNEL_CONFIG[channel].storageKey);
      });
    }
    
    // Camada 3: localStorage StorageEvent (fallback universal)
    const handleStorage = (event: StorageEvent) => {
      if (!event.key || !storageKeys.has(event.key) || !event.newValue) return;
      
      try {
        const data = JSON.parse(event.newValue);
        if (data.projetoId === projetoId) {
          log(`[LS] Evento: ${event.key}`);
          onSyncRef.current();
        }
      } catch {
        // Ignora erros de parse
      }
    };
    
    // Camada 2: postMessage (cross-context, iframe ↔ popup)
    const VALID_SOURCES = new Set(['surebet_window', 'aposta_window', 'aposta_multipla_window']);
    const handleMessage = (event: MessageEvent) => {
      const data = event.data;
      if (!data || !VALID_SOURCES.has(data.source)) return;
      
      const matchesChannel = channels.some((ch) => {
        const config = CHANNEL_CONFIG[ch];
        return config.validEvents.includes(data.type);
      });
      
      if (matchesChannel && data.projetoId === projetoId) {
        log(`[PM] Evento: ${data.type}`);
        onSyncRef.current();
      }
    };
    
    window.addEventListener('storage', handleStorage);
    window.addEventListener('message', handleMessage);
    
    return () => {
      broadcastChannels.forEach((bc) => {
        try { bc.close(); } catch { /* ignore */ }
      });
      window.removeEventListener('storage', handleStorage);
      window.removeEventListener('message', handleMessage);
    };
  }, [projetoId, channels, log]);

  // ================================================================
  // CAMADA 4: SAFETY NET — visibilitychange + focus
  // Garante refetch quando o usuário volta à janela principal,
  // independentemente de qualquer canal de mensagem funcionar.
  // ================================================================
  useEffect(() => {
    if (typeof window === 'undefined' || disableFocusRefetch) return;

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden') {
        // Marca que a janela ficou oculta (potencialmente o usuário foi ao popup)
        wasHiddenRef.current = true;
        return;
      }

      // Voltou a ficar visível — refetch se ficou oculto antes
      if (!wasHiddenRef.current) return;
      wasHiddenRef.current = false;

      const now = Date.now();
      if (now - lastFocusSyncRef.current < FOCUS_DEBOUNCE_MS) return;
      lastFocusSyncRef.current = now;

      log('[FOCUS] Janela visível novamente — refetch');
      onSyncRef.current();
    };

    const handleFocus = () => {
      // focus complementa visibilitychange para janelas popup
      if (!wasHiddenRef.current) return;
      wasHiddenRef.current = false;

      const now = Date.now();
      if (now - lastFocusSyncRef.current < FOCUS_DEBOUNCE_MS) return;
      lastFocusSyncRef.current = now;

      log('[FOCUS] Window focus — refetch');
      onSyncRef.current();
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('focus', handleFocus);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('focus', handleFocus);
    };
  }, [disableFocusRefetch, log]);
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
