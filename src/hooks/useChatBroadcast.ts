import { useEffect, useRef, useCallback, useState } from 'react';

export type ChatBroadcastMessage = 
  | { type: 'WINDOW_OPENED'; windowId: string }
  | { type: 'WINDOW_CLOSED'; windowId: string }
  | { type: 'MESSAGE_SENT'; messageId: string }
  | { type: 'MESSAGE_UPDATED'; messageId: string }
  | { type: 'NEW_MESSAGE_COUNT'; count: number }
  | { type: 'PING' }
  | { type: 'PONG'; windowId: string };

const CHANNEL_NAME = 'community-chat-sync';
const STORAGE_KEY = 'community-chat-window-state';

export function useChatBroadcast() {
  const channelRef = useRef<BroadcastChannel | null>(null);
  const [isPopoutOpen, setIsPopoutOpen] = useState(false);
  const [newMessageCount, setNewMessageCount] = useState(0);
  const windowIdRef = useRef<string>(Math.random().toString(36).substring(7));
  const listenersRef = useRef<Set<(msg: ChatBroadcastMessage) => void>>(new Set());

  // Initialize BroadcastChannel
  useEffect(() => {
    try {
      channelRef.current = new BroadcastChannel(CHANNEL_NAME);
      
      channelRef.current.onmessage = (event: MessageEvent<ChatBroadcastMessage>) => {
        const message = event.data;
        
        // Handle specific messages
        if (message.type === 'WINDOW_OPENED') {
          setIsPopoutOpen(true);
          localStorage.setItem(STORAGE_KEY, JSON.stringify({ 
            open: true, 
            windowId: message.windowId,
            timestamp: Date.now() 
          }));
        } else if (message.type === 'WINDOW_CLOSED') {
          setIsPopoutOpen(false);
          localStorage.removeItem(STORAGE_KEY);
        } else if (message.type === 'NEW_MESSAGE_COUNT') {
          setNewMessageCount(message.count);
        } else if (message.type === 'PING') {
          // Respond to ping if we're a popout window
          channelRef.current?.postMessage({ 
            type: 'PONG', 
            windowId: windowIdRef.current 
          } as ChatBroadcastMessage);
        } else if (message.type === 'PONG') {
          setIsPopoutOpen(true);
        }
        
        // Notify all listeners
        listenersRef.current.forEach(listener => listener(message));
      };
      
      // Check localStorage for existing window state on mount
      const storedState = localStorage.getItem(STORAGE_KEY);
      if (storedState) {
        try {
          const state = JSON.parse(storedState);
          // Check if state is recent (within 30 seconds)
          if (state.open && Date.now() - state.timestamp < 30000) {
            // Send ping to verify window is still open
            channelRef.current.postMessage({ type: 'PING' } as ChatBroadcastMessage);
            // Set timeout to assume closed if no response
            setTimeout(() => {
              // Re-check after timeout
              const currentState = localStorage.getItem(STORAGE_KEY);
              if (currentState) {
                const parsed = JSON.parse(currentState);
                if (Date.now() - parsed.timestamp > 30000) {
                  setIsPopoutOpen(false);
                  localStorage.removeItem(STORAGE_KEY);
                }
              }
            }, 2000);
          } else {
            localStorage.removeItem(STORAGE_KEY);
          }
        } catch {
          localStorage.removeItem(STORAGE_KEY);
        }
      }
    } catch (error) {
      console.warn('BroadcastChannel not supported, falling back to localStorage');
    }
    
    // Fallback: listen to storage events
    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === STORAGE_KEY) {
        if (e.newValue) {
          const state = JSON.parse(e.newValue);
          setIsPopoutOpen(state.open);
        } else {
          setIsPopoutOpen(false);
        }
      }
    };
    
    window.addEventListener('storage', handleStorageChange);
    
    return () => {
      channelRef.current?.close();
      window.removeEventListener('storage', handleStorageChange);
    };
  }, []);

  const broadcast = useCallback((message: ChatBroadcastMessage) => {
    try {
      channelRef.current?.postMessage(message);
      
      // Also update localStorage for fallback
      if (message.type === 'WINDOW_OPENED') {
        localStorage.setItem(STORAGE_KEY, JSON.stringify({ 
          open: true, 
          windowId: message.windowId,
          timestamp: Date.now() 
        }));
        setIsPopoutOpen(true);
      } else if (message.type === 'WINDOW_CLOSED') {
        localStorage.removeItem(STORAGE_KEY);
        setIsPopoutOpen(false);
      }
    } catch (error) {
      console.warn('Failed to broadcast message:', error);
    }
  }, []);

  const subscribe = useCallback((listener: (msg: ChatBroadcastMessage) => void) => {
    listenersRef.current.add(listener);
    return () => {
      listenersRef.current.delete(listener);
    };
  }, []);

  const notifyWindowOpened = useCallback(() => {
    broadcast({ type: 'WINDOW_OPENED', windowId: windowIdRef.current });
  }, [broadcast]);

  const notifyWindowClosed = useCallback(() => {
    broadcast({ type: 'WINDOW_CLOSED', windowId: windowIdRef.current });
  }, [broadcast]);

  const notifyMessageSent = useCallback((messageId: string) => {
    broadcast({ type: 'MESSAGE_SENT', messageId });
  }, [broadcast]);

  const notifyNewMessageCount = useCallback((count: number) => {
    broadcast({ type: 'NEW_MESSAGE_COUNT', count });
    setNewMessageCount(count);
  }, [broadcast]);

  return {
    isPopoutOpen,
    newMessageCount,
    windowId: windowIdRef.current,
    broadcast,
    subscribe,
    notifyWindowOpened,
    notifyWindowClosed,
    notifyMessageSent,
    notifyNewMessageCount,
  };
}
