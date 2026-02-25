import { useState, useEffect, useRef, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useWorkspace } from '@/hooks/useWorkspace';
import { useCommunityAccess } from '@/hooks/useCommunityAccess';
import { useChatBroadcast } from '@/hooks/useChatBroadcast';
import { useChatPresence } from '@/hooks/useChatPresence';
import { useCommunityModeration } from '@/hooks/useCommunityModeration';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Skeleton } from '@/components/ui/skeleton';
import { MessageSquare, ExternalLink, Loader2, ChevronUp, Trash2, Shield } from 'lucide-react';
import { CommunityChatConvertDialog } from './CommunityChatConvertDialog';
import { ChatMessageItem, ChatMessage } from './ChatMessageItem';
import { ChatInput } from './ChatInput';
import { ChatSettingsPopover } from './ChatSettingsPopover';
import { OnlineIndicator } from './OnlineIndicator';
import { ClearChatDialog } from './ClearChatDialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu';

interface CommunityChatFullProps {
  isPopout?: boolean;
  isEmbedded?: boolean;
  onGoToERP?: () => void;
  initialContextType?: 'general' | 'topic';
  initialContextId?: string | null;
  topicTitle?: string;
}

const MESSAGES_PER_PAGE = 50;
const HISTORY_DAYS = 3; // visible history

export function CommunityChatFull({ 
  isPopout = false, 
  isEmbedded = false,
  onGoToERP,
  initialContextType = 'general',
  initialContextId = null,
  topicTitle,
}: CommunityChatFullProps) {
  const { user } = useAuth();
  const { workspaceId } = useWorkspace();
  const { isOwner, isAdmin } = useCommunityAccess();
  const { toast } = useToast();
  const { notifyMessageSent, subscribe } = useChatBroadcast();

  const { canModerate } = useCommunityModeration();

  const [contextType, setContextType] = useState<'general' | 'topic'>(initialContextType);
  const [contextId, setContextId] = useState<string | null>(initialContextId);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [convertMessage, setConvertMessage] = useState<ChatMessage | null>(null);
  const [hasMore, setHasMore] = useState(true);
  const [newMessageCount, setNewMessageCount] = useState(0);
  const [clearChatOpen, setClearChatOpen] = useState(false);
  
  // Real-time presence tracking
  const { onlineCount, isConnected } = useChatPresence(contextType, contextId);
  const scrollRef = useRef<HTMLDivElement>(null);
  const isAtBottomRef = useRef(true);

  // Calculate the cutoff date for default visible history (3 days)
  const getHistoryCutoff = useCallback(() => {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - HISTORY_DAYS);
    return cutoff.toISOString();
  }, []);

  const fetchMessages = useCallback(async (before?: string, loadOlder?: boolean) => {
    if (!workspaceId) return;

    try {
      let query = supabase
        .from('community_chat_messages')
        .select(`
          id,
          user_id,
          content,
          message_type,
          context_type,
          context_id,
          created_at,
          edited_at,
          expires_at
        `)
        .eq('workspace_id', workspaceId)
        .eq('context_type', contextType)
        .gt('expires_at', new Date().toISOString())
        .order('created_at', { ascending: false })
        .limit(MESSAGES_PER_PAGE);

      // Apply history cutoff only for initial load, not when loading older
      if (!loadOlder && !before) {
        query = query.gt('created_at', getHistoryCutoff());
      }

      if (contextType === 'topic' && contextId) {
        query = query.eq('context_id', contextId);
      } else if (contextType === 'general') {
        query = query.is('context_id', null);
      }

      if (before) {
        query = query.lt('created_at', before);
      }

      const { data, error } = await query;

      if (error) throw error;

      const userIds = [...new Set((data || []).map(m => m.user_id))];
      const { data: profiles } = await supabase
        .from('profiles')
        .select('id, full_name, email')
        .in('id', userIds);

      const profileMap = new Map(profiles?.map(p => [p.id, p]) || []);

      const messagesWithProfiles = (data || []).map(m => ({
        ...m,
        message_type: m.message_type as 'text' | 'image' | 'audio',
        context_type: m.context_type as 'general' | 'bookmaker',
        profile: profileMap.get(m.user_id) as ChatMessage['profile'],
      }));

      const orderedMessages = messagesWithProfiles.reverse();

      if (before) {
        setMessages(prev => [...orderedMessages, ...prev]);
      } else {
        setMessages(orderedMessages);
      }

      setHasMore((data?.length || 0) >= MESSAGES_PER_PAGE);
    } catch (error) {
      console.error('Error fetching chat messages:', error);
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }, [workspaceId, contextType, contextId, getHistoryCutoff]);

  useEffect(() => {
    if (workspaceId) {
      setLoading(true);
      setMessages([]);
      fetchMessages();
    }
  }, [workspaceId, fetchMessages, contextType, contextId]);

  // Real-time subscription
  useEffect(() => {
    if (!workspaceId) return;

    const channel = supabase
      .channel(`chat-full-${workspaceId}-${contextType}-${contextId || 'general'}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'community_chat_messages',
          filter: `workspace_id=eq.${workspaceId}`,
        },
        async (payload) => {
          if (payload.eventType === 'INSERT') {
            const newMsg = payload.new as any;
            
            if (newMsg.context_type !== contextType) return;
            if (contextType === 'topic' && newMsg.context_id !== contextId) return;
            if (contextType === 'general' && newMsg.context_id !== null) return;

            const { data: profile } = await supabase
              .from('profiles')
              .select('id, full_name, email')
              .eq('id', newMsg.user_id)
              .single();

            const formattedMsg: ChatMessage = {
              ...newMsg,
              message_type: newMsg.message_type as 'text' | 'image' | 'audio',
              context_type: newMsg.context_type as 'general' | 'bookmaker',
              profile,
            };

            setMessages(prev => [...prev, formattedMsg]);
            
            if (!isAtBottomRef.current && newMsg.user_id !== user?.id) {
              setNewMessageCount(prev => prev + 1);
            }
            
            if (isAtBottomRef.current) {
              setTimeout(() => {
                scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
              }, 100);
            }
          } else if (payload.eventType === 'UPDATE') {
            setMessages(prev => prev.map(m => 
              m.id === payload.new.id ? { 
                ...m, 
                ...payload.new,
                message_type: (payload.new as any).message_type as 'text' | 'image' | 'audio',
                context_type: (payload.new as any).context_type as 'general' | 'bookmaker',
              } : m
            ));
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [workspaceId, user?.id, contextType, contextId]);

  // Listen for broadcast messages
  useEffect(() => {
    const unsubscribe = subscribe((msg) => {
      if (msg.type === 'MESSAGE_SENT' || msg.type === 'MESSAGE_UPDATED') {
        fetchMessages();
      }
    });
    return unsubscribe;
  }, [subscribe, fetchMessages]);

  // Auto-scroll on initial load
  useEffect(() => {
    if (!loading && messages.length > 0) {
      setTimeout(() => {
        scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
      }, 100);
    }
  }, [loading]);

  const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
    const target = e.target as HTMLDivElement;
    const isAtBottom = target.scrollHeight - target.scrollTop - target.clientHeight < 50;
    isAtBottomRef.current = isAtBottom;
    
    if (isAtBottom) {
      setNewMessageCount(0);
    }
  };

  const handleLoadMore = () => {
    if (!loadingMore && messages.length > 0 && hasMore) {
      setLoadingMore(true);
      fetchMessages(messages[0].created_at, true);
    }
  };

  const scrollToBottom = () => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
    setNewMessageCount(0);
  };

  const handleSendText = async (content: string) => {
    if (!user?.id || !workspaceId) return;

    const { data, error } = await supabase
      .from('community_chat_messages')
      .insert({
        workspace_id: workspaceId,
        user_id: user.id,
        content,
        message_type: 'text',
        context_type: contextType,
        context_id: contextType === 'topic' ? contextId : null,
      })
      .select()
      .single();

    if (error) {
      toast({
        title: 'Erro ao enviar mensagem',
        description: error.message,
        variant: 'destructive',
      });
      throw error;
    }
    
    if (data) {
      notifyMessageSent(data.id);
    }
    
    setTimeout(() => {
      scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
    }, 100);
  };

  const handleSendMedia = async (type: 'image' | 'audio', storagePath: string) => {
    if (!user?.id || !workspaceId) return;

    const { data, error } = await supabase
      .from('community_chat_messages')
      .insert({
        workspace_id: workspaceId,
        user_id: user.id,
        content: storagePath,
        message_type: type,
        context_type: contextType,
        context_id: contextType === 'topic' ? contextId : null,
      })
      .select()
      .single();

    if (error) {
      toast({
        title: 'Erro ao enviar mídia',
        description: error.message,
        variant: 'destructive',
      });
      throw error;
    }

    if (data) {
      notifyMessageSent(data.id);
    }

    setTimeout(() => {
      scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
    }, 100);
  };

  const handleEditMessage = async (messageId: string, newContent: string) => {
    const { error } = await supabase
      .from('community_chat_messages')
      .update({
        content: newContent,
        edited_at: new Date().toISOString(),
      })
      .eq('id', messageId);

    if (error) {
      toast({
        title: 'Erro ao editar',
        description: error.message,
        variant: 'destructive',
      });
    } else {
      toast({ title: 'Mensagem editada!' });
    }
  };

  const canEditMessage = (message: ChatMessage) => {
    if (!user?.id) return false;
    return user.id === message.user_id || isOwner || isAdmin;
  };

  return (
    <>
      <div className="flex flex-col h-full">
        {/* Header - only show when in popout mode */}
        {isPopout && (
          <div className="flex flex-col px-4 py-3 border-b border-border shrink-0">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <MessageSquare className="h-5 w-5 text-primary" />
                <div>
                  <h1 className="font-semibold">
                    {contextType === 'topic' && topicTitle 
                      ? topicTitle
                      : 'Chat Geral'
                    }
                  </h1>
                  {contextType === 'topic' && (
                    <span className="text-xs text-muted-foreground">Conversa ao vivo</span>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-2">
                {canModerate && (
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon" className="h-8 w-8">
                        <Shield className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <div className="px-2 py-1.5 text-xs text-muted-foreground flex items-center gap-1">
                        <Shield className="h-3 w-3" />
                        Moderação
                      </div>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem
                        className="text-destructive focus:text-destructive cursor-pointer"
                        onClick={() => setClearChatOpen(true)}
                      >
                        <Trash2 className="h-4 w-4 mr-2" />
                        Limpar Chat
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                )}
                <ChatSettingsPopover />
                {onGoToERP && (
                  <Button variant="outline" size="sm" onClick={onGoToERP}>
                    <ExternalLink className="h-4 w-4 mr-1" />
                    Voltar para ERP
                  </Button>
                )}
              </div>
            </div>
            <OnlineIndicator count={onlineCount} isConnected={isConnected} className="mt-2" />
          </div>
        )}

        {/* Embedded header with settings only */}
        {isEmbedded && (
          <div className="flex flex-col px-4 py-2 border-b border-border shrink-0">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <MessageSquare className="h-4 w-4 text-primary" />
                <span className="text-sm font-medium">
                  {contextType === 'topic' && topicTitle 
                    ? `${topicTitle} · Chat`
                    : 'Chat Geral'
                  }
                </span>
              </div>
              <div className="flex items-center gap-1">
                {canModerate && (
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon" className="h-7 w-7">
                        <Shield className="h-3.5 w-3.5" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <div className="px-2 py-1.5 text-xs text-muted-foreground flex items-center gap-1">
                        <Shield className="h-3 w-3" />
                        Moderação
                      </div>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem
                        className="text-destructive focus:text-destructive cursor-pointer"
                        onClick={() => setClearChatOpen(true)}
                      >
                        <Trash2 className="h-4 w-4 mr-2" />
                        Limpar Chat
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                )}
                <ChatSettingsPopover />
              </div>
            </div>
            <OnlineIndicator count={onlineCount} isConnected={isConnected} className="mt-1.5" />
          </div>
        )}

        {/* Online indicator when no specific header */}
        {!isPopout && !isEmbedded && (
          <div className="px-4 py-2 border-b border-border">
            <OnlineIndicator count={onlineCount} isConnected={isConnected} />
          </div>
        )}

        {/* Messages Area */}
        <ScrollArea 
          ref={scrollRef} 
          className="flex-1 px-4"
          onScroll={handleScroll}
        >
          {/* Load More Button */}
          {hasMore && !loading && messages.length > 0 && (
            <div className="flex justify-center py-3">
              <Button
                variant="ghost"
                size="sm"
                onClick={handleLoadMore}
                disabled={loadingMore}
                className="text-xs text-muted-foreground hover:text-foreground"
              >
                {loadingMore ? (
                  <Loader2 className="h-4 w-4 animate-spin mr-1" />
                ) : (
                  <ChevronUp className="h-4 w-4 mr-1" />
                )}
                Carregar mensagens anteriores
              </Button>
            </div>
          )}
          
          {loading ? (
            <div className="space-y-3 py-4">
              {[...Array(10)].map((_, i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : messages.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full py-8 text-center">
              <MessageSquare className="h-12 w-12 text-muted-foreground/30 mb-3" />
              <p className="text-sm font-medium mb-1">
                {contextType === 'topic' && topicTitle 
                  ? `Ainda não há mensagens neste tópico`
                  : 'Nenhuma mensagem ainda'
                }
              </p>
              <p className="text-xs text-muted-foreground mb-3">
                Seja o primeiro a iniciar uma conversa!
              </p>
              <OnlineIndicator count={onlineCount} isConnected={isConnected} />
            </div>
          ) : (
            <div className="space-y-3 py-4">
              {messages.map((msg) => (
                <ChatMessageItem
                  key={msg.id}
                  message={msg}
                  isOwnMessage={msg.user_id === user?.id}
                  canEdit={canEditMessage(msg)}
                  onEdit={handleEditMessage}
                  onConvert={setConvertMessage}
                />
              ))}
            </div>
          )}
        </ScrollArea>

        {/* New Messages Indicator */}
        {newMessageCount > 0 && (
          <div className="absolute bottom-20 left-1/2 -translate-x-1/2 z-10">
            <Button 
              size="sm" 
              onClick={scrollToBottom}
              className="shadow-lg"
            >
              {newMessageCount} {newMessageCount === 1 ? 'nova mensagem' : 'novas mensagens'}
            </Button>
          </div>
        )}

        {/* Input Area */}
        <ChatInput
          workspaceId={workspaceId}
          userId={user?.id || null}
          onSendText={handleSendText}
          onSendMedia={handleSendMedia}
        />
      </div>

      {/* Convert Dialog */}
      {convertMessage && (
        <CommunityChatConvertDialog
          open={true}
          onOpenChange={(open) => !open && setConvertMessage(null)}
          message={convertMessage}
          onSuccess={() => {
            toast({ title: 'Tópico criado com sucesso!' });
            setConvertMessage(null);
          }}
        />
      )}

      {/* Clear Chat Dialog */}
      {workspaceId && (
        <ClearChatDialog
          open={clearChatOpen}
          onOpenChange={setClearChatOpen}
          workspaceId={workspaceId}
          contextType={contextType}
          contextId={contextId}
          contextName={topicTitle}
          onCleared={() => {
            setMessages([]);
            fetchMessages();
          }}
        />
      )}
    </>
  );
}
