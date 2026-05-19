import { useCallback, useRef, useEffect, useState } from 'react';
import { useChatBroadcast } from './useChatBroadcast';

// URL para um som de notificação discreto e profissional
const NOTIFICATION_SOUND_URL = 'https://cdn.pixabay.com/audio/2022/03/15/audio_c8c8a73a5a.mp3';

export function useChatNotifications() {
  const [unreadCount, setUnreadCount] = useState(0);
  const { broadcast, subscribe } = useChatBroadcast();
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const lastPlayTimeRef = useRef<number>(0);
  const isTabActiveRef = useRef<boolean>(true);

  // Inicializar o áudio
  useEffect(() => {
    audioRef.current = new Audio(NOTIFICATION_SOUND_URL);
    audioRef.current.volume = 0.4;

    const handleVisibilityChange = () => {
      isTabActiveRef.current = !document.hidden;
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, []);

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
