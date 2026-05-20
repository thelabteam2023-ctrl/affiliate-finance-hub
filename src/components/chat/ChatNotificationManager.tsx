import { useEffect, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useChatNotifications } from '@/hooks/useChatNotifications';
import { getDisplayFirstName } from '@/lib/utils';


interface ChatNotificationManagerProps {
  isChatOpen: boolean;
}

export const ChatNotificationManager = ({ isChatOpen }: ChatNotificationManagerProps) => {
  const { user, workspace } = useAuth();
  const { incrementUnread, playNotificationSound } = useChatNotifications();
  const lastProcessedIdRef = useRef<string | null>(null);

  useEffect(() => {
    if (!user?.id || !workspace?.id) return;

    console.log(`[ChatNotifications] Initializing global listener for workspace: ${workspace.id}`);

    const channel = supabase
      .channel(`chat-global-notifications-${workspace.id}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'community_chat_messages',
          filter: `workspace_id=eq.${workspace.id}`,
        },
        (payload) => {
          const newMessage = payload.new;
          const messageId = newMessage.id;
          const senderId = newMessage.user_id;

          // 1. Ignore messages from self
          if (senderId === user.id) return;

          // 2. Prevent duplicate processing (idempotency)
          if (messageId === lastProcessedIdRef.current) return;
          lastProcessedIdRef.current = messageId;

          console.log('[ChatNotifications] New message received:', messageId);

          // 3. Increment unread count if chat is closed
          if (!isChatOpen) {
            incrementUnread();
          }

          // 4. Play sound notification (hook handles cross-tab coordination)
          playNotificationSound(messageId);

          // 5. Check for mentions to trigger global state/animation if needed
          const content = newMessage.content as string;
          const myName = (user as any).full_name || user.email?.split('@')[0];
          const myFirst = getDisplayFirstName(myName);
          
          if (new RegExp(`@${myFirst}\\b`, 'i').test(content)) {
             // In the future, we could broadcast a 'MENTION_RECEIVED' event here
             console.log('[ChatNotifications] Mention detected for user:', myFirst);
          }

        }
      )
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          console.log('[ChatNotifications] Successfully subscribed to realtime messages');
        }
      });

    return () => {
      console.log('[ChatNotifications] Cleaning up global listener');
      supabase.removeChannel(channel);
    };
  }, [user?.id, workspace?.id, isChatOpen, incrementUnread, playNotificationSound]);

  return null; // This component doesn't render anything UI-wise
};
