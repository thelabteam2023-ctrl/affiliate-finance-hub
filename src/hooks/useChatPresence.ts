import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useWorkspace } from '@/hooks/useWorkspace';

interface PresenceState {
  user_id: string;
  context: string;
  online_at: string;
}

export function useChatPresence(contextType: 'general' | 'topic', contextId?: string | null) {
  const { user } = useAuth();
  const { workspaceId } = useWorkspace();
  const [onlineCount, setOnlineCount] = useState(0);
  const [isConnected, setIsConnected] = useState(false);

  const contextKey = contextType === 'topic' && contextId 
    ? `topic:${contextId}` 
    : 'general';

  const channelName = `presence-chat-${workspaceId}-${contextKey}`;

  useEffect(() => {
    if (!user?.id || !workspaceId) return;

    const channel = supabase.channel(channelName, {
      config: {
        presence: {
          key: user.id,
        },
      },
    });

    channel
      .on('presence', { event: 'sync' }, () => {
        const state = channel.presenceState<PresenceState>();
        const count = Object.keys(state).length;
        setOnlineCount(count);
        setIsConnected(true);
      })
      .on('presence', { event: 'join' }, ({ newPresences }) => {
        console.log('User joined:', newPresences);
      })
      .on('presence', { event: 'leave' }, ({ leftPresences }) => {
        console.log('User left:', leftPresences);
      })
      .subscribe(async (status) => {
        if (status === 'SUBSCRIBED') {
          await channel.track({
            user_id: user.id,
            context: contextKey,
            online_at: new Date().toISOString(),
          });
        }
      });

    return () => {
      channel.unsubscribe();
      supabase.removeChannel(channel);
    };
  }, [user?.id, workspaceId, channelName, contextKey]);

  return {
    onlineCount,
    isConnected,
  };
}

// Hook to get presence for multiple contexts (for displaying on bookmaker cards)
export function useChatPresenceMultiple() {
  const { user } = useAuth();
  const { workspaceId } = useWorkspace();
  const [presenceCounts, setPresenceCounts] = useState<Record<string, number>>({});

  // This would require a more complex implementation with multiple channels
  // For now, we'll use a simpler approach with just the general count
  
  return {
    getOnlineCount: (context: string) => presenceCounts[context] || 0,
    presenceCounts,
  };
}
