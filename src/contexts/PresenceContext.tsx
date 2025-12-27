import { createContext, useContext, useState, useEffect, useCallback, useMemo, useRef, ReactNode } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';

const STALE_THRESHOLD_MINUTES = 5; // Consider stale after 5 minutes without heartbeat
const HEARTBEAT_INTERVAL_MS = 60000; // Send heartbeat every 1 minute

interface PresenceState {
  user_id: string;
  email: string;
  name: string;
  online_at: string;
}

interface PresenceContextType {
  onlineUsers: PresenceState[];
  onlineCount: number;
  onlineUserIds: Set<string>;
  isConnected: boolean;
  isUserOnline: (userId: string) => boolean;
  getUserOnlineInfo: (userId: string) => PresenceState | undefined;
}

const PresenceContext = createContext<PresenceContextType | null>(null);

// Filter out stale users (those who haven't sent heartbeat recently)
function filterActiveUsers(users: PresenceState[]): PresenceState[] {
  const now = new Date();
  return users.filter(user => {
    const onlineAt = new Date(user.online_at);
    const diffMinutes = (now.getTime() - onlineAt.getTime()) / (1000 * 60);
    return diffMinutes < STALE_THRESHOLD_MINUTES;
  });
}

export function PresenceProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [onlineUsers, setOnlineUsers] = useState<PresenceState[]>([]);
  const [onlineCount, setOnlineCount] = useState(0);
  const [isConnected, setIsConnected] = useState(false);
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);

  // Set of online user IDs for O(1) lookup - only active (non-stale) users
  const onlineUserIds = useMemo(() => {
    const activeUsers = filterActiveUsers(onlineUsers);
    return new Set(activeUsers.map(u => u.user_id));
  }, [onlineUsers]);

  // Function to check if a specific user is online (and not stale)
  const isUserOnline = useCallback((userId: string): boolean => {
    return onlineUserIds.has(userId);
  }, [onlineUserIds]);

  // Get user's online info if available and not stale
  const getUserOnlineInfo = useCallback((userId: string): PresenceState | undefined => {
    const activeUsers = filterActiveUsers(onlineUsers);
    return activeUsers.find(u => u.user_id === userId);
  }, [onlineUsers]);

  useEffect(() => {
    if (!user?.id) return;

    const channel = supabase.channel('system-presence', {
      config: {
        presence: {
          key: user.id,
        },
      },
    });
    channelRef.current = channel;

    // Function to send heartbeat
    const sendHeartbeat = async () => {
      if (channelRef.current) {
        await channelRef.current.track({
          user_id: user.id,
          email: user.email || '',
          name: user.user_metadata?.full_name || user.email || '',
          online_at: new Date().toISOString(),
        });
      }
    };

    channel
      .on('presence', { event: 'sync' }, () => {
        const state = channel.presenceState<PresenceState>();
        const users: PresenceState[] = [];
        
        Object.values(state).forEach((presences) => {
          presences.forEach((presence: any) => {
            users.push(presence);
          });
        });
        
        // Filter out stale users before setting state
        const activeUsers = filterActiveUsers(users);
        setOnlineUsers(users); // Keep all for raw data
        setOnlineCount(activeUsers.length); // Count only active users
        setIsConnected(true);
      })
      .subscribe(async (status) => {
        if (status === 'SUBSCRIBED') {
          await sendHeartbeat();
        }
      });

    // Heartbeat interval - re-track every minute to update online_at
    const heartbeatInterval = setInterval(sendHeartbeat, HEARTBEAT_INTERVAL_MS);

    // Cleanup stale users periodically from local state
    const cleanupInterval = setInterval(() => {
      setOnlineUsers(prev => {
        const activeUsers = filterActiveUsers(prev);
        if (activeUsers.length !== prev.length) {
          setOnlineCount(activeUsers.length);
        }
        return prev; // Keep raw data, filtering happens in useMemo
      });
    }, HEARTBEAT_INTERVAL_MS);

    return () => {
      clearInterval(heartbeatInterval);
      clearInterval(cleanupInterval);
      channel.unsubscribe();
      supabase.removeChannel(channel);
      channelRef.current = null;
    };
  }, [user?.id, user?.email, user?.user_metadata?.full_name]);

  const value: PresenceContextType = {
    onlineUsers,
    onlineCount,
    onlineUserIds,
    isConnected,
    isUserOnline,
    getUserOnlineInfo,
  };

  return (
    <PresenceContext.Provider value={value}>
      {children}
    </PresenceContext.Provider>
  );
}

export function usePresence() {
  const context = useContext(PresenceContext);
  if (!context) {
    throw new Error('usePresence must be used within a PresenceProvider');
  }
  return context;
}
