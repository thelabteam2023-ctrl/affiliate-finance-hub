import { useCallback, useRef, useEffect, useState } from 'react';
import { useChatBroadcast } from './useChatBroadcast';
import { useWorkspace } from './useWorkspace';
import { notificationAudioManager, CHAT_SOUNDS } from '@/services/audio/notificationAudioManager';

export { CHAT_SOUNDS };

export function useChatNotifications() {
  const [unreadCount, setUnreadCount] = useState(0);
  const { workspace } = useWorkspace();
  const { broadcast, subscribe } = useChatBroadcast();
  const lastPlayTimeRef = useRef<number>(0);
  const isTabActiveRef = useRef<boolean>(true);
  const lastPlayedMessageIdRef = useRef<string | null>(null);

  useEffect(() => {
    const handleVisibilityChange = () => {
      isTabActiveRef.current = !document.hidden;
    };

    const handleInteraction = () => {
      notificationAudioManager.unlock();
    };

    document.addEventListener('click', handleInteraction, { once: true });
    document.addEventListener('keydown', handleInteraction, { once: true });
    document.addEventListener('touchstart', handleInteraction, { once: true });
    document.addEventListener('visibilitychange', handleVisibilityChange);
    
    return () => {
      document.removeEventListener('click', handleInteraction);
      document.removeEventListener('keydown', handleInteraction);
      document.removeEventListener('touchstart', handleInteraction);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, []);

  const playNotificationSound = useCallback((messageId?: string) => {
    const now = Date.now();
    
    // 1. Debounce local playback (2 seconds)
    if (now - lastPlayTimeRef.current < 2000) return;

    // 2. Prevent duplicate playback for same message ID across tabs
    if (messageId && messageId === lastPlayedMessageIdRef.current) return;

    const soundUrl = workspace?.chat_notification_sound || CHAT_SOUNDS.pop;

    const play = async () => {
      try {
        await notificationAudioManager.play(soundUrl);
        lastPlayTimeRef.current = Date.now();
        if (messageId) {
          lastPlayedMessageIdRef.current = messageId;
          broadcast({ type: 'SOUND_PLAYED', timestamp: now, messageId });
        }
      } catch (err) {
        // Logged by manager
      }
    };

    // If we are not the active tab, wait slightly to see if the active tab plays it
    if (!isTabActiveRef.current) {
      setTimeout(play, 200);
    } else {
      play();
    }
  }, [broadcast, workspace?.chat_notification_sound]);

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

  // Listen for coordination events
  useEffect(() => {
    const unsubscribe = subscribe((msg) => {
      if (msg.type === 'NEW_MESSAGE_COUNT') {
        setUnreadCount(msg.count);
      } else if (msg.type === 'SOUND_PLAYED') {
        // Another tab already played this sound, mark as played locally to avoid echo
        lastPlayedMessageIdRef.current = msg.messageId;
        lastPlayTimeRef.current = Date.now();
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
