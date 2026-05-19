import { useCallback, useRef, useEffect, useState } from 'react';
import { useChatBroadcast } from './useChatBroadcast';
import { useWorkspace } from './useWorkspace';

// Sons de notificação discretos e profissionais (armazenados localmente)
export const CHAT_SOUNDS = {
  pop: '/sounds/pop.mp3',
  ding: '/sounds/ding.mp3',
  chime: '/sounds/chime.mp3',
};

export function useChatNotifications() {
  const [unreadCount, setUnreadCount] = useState(0);
  const { workspace } = useWorkspace();
  const { broadcast, subscribe } = useChatBroadcast();
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const lastPlayTimeRef = useRef<number>(0);
  const isTabActiveRef = useRef<boolean>(true);

  // Inicializar o áudio com base na configuração do workspace
  useEffect(() => {
    const soundUrl = workspace?.chat_notification_sound || CHAT_SOUNDS.pop;
    audioRef.current = new Audio(soundUrl);
    audioRef.current.volume = 0.4;

    const handleVisibilityChange = () => {
      isTabActiveRef.current = !document.hidden;
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [workspace?.chat_notification_sound]);

  const playNotificationSound = useCallback(() => {
    const now = Date.now();
    // Debounce de 2 segundos para o som
    if (now - lastPlayTimeRef.current < 2000) return;

    if (audioRef.current) {
      audioRef.current.play().catch(err => {
        console.warn('Falha ao reproduzir som de notificação (restrição do navegador):', err);
      });
      lastPlayTimeRef.current = now;
    }
  }, []);

  const incrementUnread = useCallback((isInternalAction = false) => {
    setUnreadCount(prev => {
      const next = prev + 1;
      if (!isInternalAction) {
        broadcast({ type: 'NEW_MESSAGE_COUNT', count: next });
      }
      return next;
    });
  }, [broadcast]);

  const resetUnread = useCallback((isInternalAction = false) => {
    setUnreadCount(0);
    if (!isInternalAction) {
      broadcast({ type: 'NEW_MESSAGE_COUNT', count: 0 });
    }
  }, [broadcast]);

  // Ouvir broadcasts de outras abas
  useEffect(() => {
    const unsubscribe = subscribe((msg) => {
      if (msg.type === 'NEW_MESSAGE_COUNT') {
        setUnreadCount(msg.count);
      }
    });
    return unsubscribe;
  }, [subscribe]);

  return {
    unreadCount,
    playNotificationSound,
    incrementUnread,
    resetUnread,
    isTabActive: isTabActiveRef.current
  };
}
