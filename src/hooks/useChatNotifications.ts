import { useCallback, useRef, useEffect, useState } from 'react';
import { useChatBroadcast } from './useChatBroadcast';
import { useWorkspace } from './useWorkspace';

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
  const audioUnlockedRef = useRef<boolean>(false);
  const lastPlayedMessageIdRef = useRef<string | null>(null);

  // Initialize audio and unlock mechanism
  useEffect(() => {
    const soundUrl = workspace?.chat_notification_sound || CHAT_SOUNDS.pop;
    const audio = new Audio(soundUrl);
    audio.volume = 0.4;
    audio.preload = 'auto';
    audioRef.current = audio;

    const unlockAudio = () => {
      if (audioUnlockedRef.current) return;
      
      // Play and immediately pause to "unlock" audio context
      const promise = audio.play();
      if (promise !== undefined) {
        promise.then(() => {
          audio.pause();
          audioUnlockedRef.current = true;
          console.log('[Audio] Context unlocked successfully');
        }).catch(() => {
          // Still locked, will try again on next interaction
        });
      }
    };

    const handleVisibilityChange = () => {
      isTabActiveRef.current = !document.hidden;
    };

    document.addEventListener('click', unlockAudio, { once: true });
    document.addEventListener('keydown', unlockAudio, { once: true });
    document.addEventListener('visibilitychange', handleVisibilityChange);
    
    return () => {
      document.removeEventListener('click', unlockAudio);
      document.removeEventListener('keydown', unlockAudio);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [workspace?.chat_notification_sound]);

  const playNotificationSound = useCallback((messageId?: string) => {
    const now = Date.now();
    
    // 1. Debounce local playback (2 seconds)
    if (now - lastPlayTimeRef.current < 2000) return;

    // 2. Prevent duplicate playback for same message ID across tabs
    if (messageId && messageId === lastPlayedMessageIdRef.current) return;

    if (audioRef.current) {
      // Small delay to let other tabs communicate if they are playing it
      const play = () => {
        audioRef.current?.play().then(() => {
          lastPlayTimeRef.current = Date.now();
          if (messageId) {
            lastPlayedMessageIdRef.current = messageId;
            broadcast({ type: 'SOUND_PLAYED', timestamp: now, messageId });
          }
        }).catch(err => {
          console.warn('[Audio] Playback blocked by browser policy. Interaction required.', err);
        });
      };

      // If we are not the active tab, wait slightly to see if the active tab plays it
      if (!isTabActiveRef.current) {
        setTimeout(play, 200);
      } else {
        play();
      }
    }
  }, [broadcast]);

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
