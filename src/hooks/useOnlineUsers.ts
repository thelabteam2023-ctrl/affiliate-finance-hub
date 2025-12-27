import { useState, useEffect, useCallback, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';

interface PresenceState {
  user_id: string;
  email: string;
  name: string;
  online_at: string;
}

export function useOnlineUsers() {
  const { user } = useAuth();
  const [onlineUsers, setOnlineUsers] = useState<PresenceState[]>([]);
  const [onlineCount, setOnlineCount] = useState(0);
  const [isConnected, setIsConnected] = useState(false);

  // Set of online user IDs for O(1) lookup
  const onlineUserIds = useMemo(() => {
    return new Set(onlineUsers.map(u => u.user_id));
  }, [onlineUsers]);

  // Function to check if a specific user is online
  const isUserOnline = useCallback((userId: string): boolean => {
    return onlineUserIds.has(userId);
  }, [onlineUserIds]);

  // Get user's online info if available
  const getUserOnlineInfo = useCallback((userId: string): PresenceState | undefined => {
    return onlineUsers.find(u => u.user_id === userId);
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

    channel
      .on('presence', { event: 'sync' }, () => {
        const state = channel.presenceState<PresenceState>();
        const users: PresenceState[] = [];
        
        Object.values(state).forEach((presences) => {
          presences.forEach((presence: any) => {
            users.push(presence);
          });
        });
        
        setOnlineUsers(users);
        setOnlineCount(Object.keys(state).length);
        setIsConnected(true);
      })
      .subscribe(async (status) => {
        if (status === 'SUBSCRIBED') {
          await channel.track({
            user_id: user.id,
            email: user.email || '',
            name: user.user_metadata?.full_name || user.email || '',
            online_at: new Date().toISOString(),
          });
        }
      });

    return () => {
      channel.unsubscribe();
      supabase.removeChannel(channel);
    };
  }, [user?.id, user?.email, user?.user_metadata?.full_name]);

  return {
    onlineUsers,
    onlineCount,
    onlineUserIds,
    isConnected,
    isUserOnline,
    getUserOnlineInfo,
  };
}
