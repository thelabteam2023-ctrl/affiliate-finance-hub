import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useWorkspace } from '@/hooks/useWorkspace';
import { useCommunityAccess } from '@/hooks/useCommunityAccess';
import { useChatBroadcast } from '@/hooks/useChatBroadcast';
import { useChatPresence } from '@/hooks/useChatPresence';
import { useToast } from '@/hooks/use-toast';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { MessageSquare, Lock, ExternalLink, Maximize2, Radio } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { OnlineIndicator } from './OnlineIndicator';
import { useNavigate } from 'react-router-dom';

interface ChatMessage {
  id: string;
  user_id: string;
  content: string;
  message_type: string;
  created_at: string;
  profile?: {
    full_name: string | null;
    email: string | null;
  };
}

interface ActiveTopicRoom {
  id: string;
  titulo: string;
  categoria: string;
}

const PREVIEW_MESSAGES_COUNT = 5;
const POPOUT_WINDOW_FEATURES = 'width=480,height=800,scrollbars=yes,resizable=yes';

export function CommunityChatPreview() {
  const { workspaceId } = useWorkspace();
  const { hasFullAccess, loading: accessLoading } = useCommunityAccess();
  const { isPopoutOpen, newMessageCount, subscribe } = useChatBroadcast();
  const { onlineCount, isConnected } = useChatPresence('general');
  const { toast } = useToast();
  const navigate = useNavigate();

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [activeRooms, setActiveRooms] = useState<ActiveTopicRoom[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchPreviewMessages = useCallback(async () => {
    if (!workspaceId || !hasFullAccess) return;

    try {
      const { data, error } = await supabase
        .from('community_chat_messages')
        .select('id, user_id, content, message_type, created_at')
        .eq('workspace_id', workspaceId)
        .eq('context_type', 'general')
        .gt('expires_at', new Date().toISOString())
        .order('created_at', { ascending: false })
        .limit(PREVIEW_MESSAGES_COUNT);

      if (error) throw error;

      const userIds = [...new Set((data || []).map(m => m.user_id))];
      const { data: profiles } = await supabase
        .from('profiles')
        .select('id, full_name, email')
        .in('id', userIds);

      const profileMap = new Map(profiles?.map(p => [p.id, p]) || []);

      setMessages((data || []).map(m => ({
        ...m,
        profile: profileMap.get(m.user_id) as ChatMessage['profile'],
      })).reverse());
    } catch (error) {
      console.error('Error fetching preview messages:', error);
    } finally {
      setLoading(false);
    }
  }, [workspaceId, hasFullAccess]);

  // Fetch active topic rooms
  const fetchActiveRooms = useCallback(async () => {
    if (!workspaceId || !hasFullAccess) return;

    try {
      const { data } = await supabase
        .from('community_topics')
        .select('id, titulo, categoria')
        .eq('status', 'ATIVO')
        .eq('has_chat_activity', true)
        .order('updated_at', { ascending: false })
        .limit(5);

      setActiveRooms(data || []);
    } catch (error) {
      console.error('Error fetching active rooms:', error);
    }
  }, [workspaceId, hasFullAccess]);

  useEffect(() => {
    if (hasFullAccess && workspaceId && !isPopoutOpen) {
      fetchPreviewMessages();
      fetchActiveRooms();
    }
  }, [hasFullAccess, workspaceId, isPopoutOpen, fetchPreviewMessages, fetchActiveRooms]);

  useEffect(() => {
    const unsubscribe = subscribe((msg) => {
      if (msg.type === 'MESSAGE_SENT') {
        fetchPreviewMessages();
      }
    });
    return unsubscribe;
  }, [subscribe, fetchPreviewMessages]);

  useEffect(() => {
    if (!hasFullAccess || !workspaceId || isPopoutOpen) return;

    const channel = supabase
      .channel(`chat-preview-${workspaceId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'community_chat_messages',
          filter: `workspace_id=eq.${workspaceId}`,
        },
        () => {
          fetchPreviewMessages();
          fetchActiveRooms();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [hasFullAccess, workspaceId, isPopoutOpen, fetchPreviewMessages, fetchActiveRooms]);

  const openPopout = () => {
    const popoutUrl = `/comunidade/chat?mode=popout`;
    const popupWindow = window.open(popoutUrl, 'community-chat', POPOUT_WINDOW_FEATURES);
    
    if (!popupWindow || popupWindow.closed || typeof popupWindow.closed === 'undefined') {
      toast({
        title: 'Pop-up bloqueado',
        description: 'Seu navegador bloqueou o pop-up. Abrindo o chat interno...',
        variant: 'default',
      });
      openInternalChat();
    }
  };

  const openInternalChat = () => {
    window.dispatchEvent(new CustomEvent('open-community-chat'));
  };

  const focusPopout = () => {
    const popupWindow = window.open('', 'community-chat');
    if (popupWindow && !popupWindow.closed) {
      popupWindow.focus();
    } else {
      openPopout();
    }
  };

  if (accessLoading) {
    return (
      <Card className="h-[300px]">
        <CardHeader className="pb-3">
          <Skeleton className="h-6 w-32" />
        </CardHeader>
        <CardContent>
          <Skeleton className="h-[200px]" />
        </CardContent>
      </Card>
    );
  }

  if (!hasFullAccess) {
    return (
      <Card className="h-[300px]">
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <MessageSquare className="h-4 w-4" />
            Chat Geral
          </CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col items-center justify-center h-[200px] text-center">
          <div className="h-12 w-12 rounded-full bg-muted flex items-center justify-center mb-3">
            <Lock className="h-6 w-6 text-muted-foreground" />
          </div>
          <p className="text-sm text-muted-foreground">
            Chat exclusivo para usuários PRO+
          </p>
        </CardContent>
      </Card>
    );
  }

  if (isPopoutOpen) {
    return (
      <Card className="h-auto">
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <MessageSquare className="h-4 w-4" />
            Chat Geral
          </CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col items-center justify-center py-6 text-center">
          <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center mb-3">
            <ExternalLink className="h-5 w-5 text-primary" />
          </div>
          <p className="text-sm text-muted-foreground mb-3">
            Chat aberto em janela
          </p>
          {newMessageCount > 0 && (
            <p className="text-xs text-primary mb-3">
              {newMessageCount} {newMessageCount === 1 ? 'nova mensagem' : 'novas mensagens'}
            </p>
          )}
          <Button variant="outline" size="sm" onClick={focusPopout}>
            <Maximize2 className="h-4 w-4 mr-1" />
            Focar Janela
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {/* Chat Geral Preview */}
      <Card className="flex flex-col">
        <CardHeader className="pb-2 shrink-0">
          <CardTitle className="text-base flex items-center gap-2">
            <MessageSquare className="h-4 w-4" />
            Chat Geral
          </CardTitle>
          <OnlineIndicator count={onlineCount} isConnected={isConnected} className="mt-1" />
        </CardHeader>
        
        <CardContent className="flex-1 flex flex-col p-0 overflow-hidden">
          <div className="flex-1 px-4 py-2 overflow-hidden max-h-[180px]">
            {loading ? (
              <div className="space-y-2">
                {[...Array(3)].map((_, i) => (
                  <Skeleton key={i} className="h-10 w-full" />
                ))}
              </div>
            ) : messages.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full text-center py-4">
                <MessageSquare className="h-6 w-6 text-muted-foreground/30 mb-2" />
                <p className="text-xs text-muted-foreground">
                  Nenhuma mensagem ainda
                </p>
              </div>
            ) : (
              <div className="space-y-2">
                {messages.map((msg) => (
                  <div key={msg.id} className="text-xs">
                    <span className="font-medium text-foreground">
                      {msg.profile?.full_name || msg.profile?.email?.split('@')[0] || 'Usuário'}:
                    </span>{' '}
                    <span className="text-muted-foreground line-clamp-1">
                      {msg.message_type === 'image' ? '📷 Imagem' : 
                       msg.message_type === 'audio' ? '🎙️ Áudio' : 
                       msg.content}
                    </span>
                    <span className="text-muted-foreground/60 text-[10px] ml-1">
                      {formatDistanceToNow(new Date(msg.created_at), { 
                        addSuffix: false, 
                        locale: ptBR 
                      })}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="p-3 border-t border-border shrink-0 space-y-2">
            <Button 
              variant="default" 
              size="sm" 
              className="w-full"
              onClick={openInternalChat}
            >
              <MessageSquare className="h-4 w-4 mr-1" />
              Abrir Chat
            </Button>
            <Button 
              variant="outline" 
              size="sm" 
              className="w-full"
              onClick={openPopout}
            >
              <ExternalLink className="h-4 w-4 mr-1" />
              Abrir em Janela
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Active Topic Rooms */}
      {activeRooms.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <Radio className="h-3.5 w-3.5 text-primary" />
              Conversas Ativas
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="divide-y divide-border">
              {activeRooms.map((room) => (
                <button
                  key={room.id}
                  className="w-full flex items-center gap-2 px-4 py-2.5 text-left hover:bg-muted/50 transition-colors"
                  onClick={() => navigate(`/comunidade/topico/${room.id}`)}
                >
                  <Radio className="h-3 w-3 text-primary/60 shrink-0" />
                  <span className="text-xs text-foreground truncate flex-1">{room.titulo}</span>
                  <Badge variant="outline" className="text-[10px] shrink-0">{room.categoria}</Badge>
                </button>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}