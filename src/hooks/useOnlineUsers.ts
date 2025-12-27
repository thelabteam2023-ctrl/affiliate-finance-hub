import { useState, useEffect } from 'react';
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
    isConnected,
  };
}
