import { useState, useEffect, useRef, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useWorkspace } from '@/hooks/useWorkspace';
import { useCommunityAccess } from '@/hooks/useCommunityAccess';
import { useChatBroadcast } from '@/hooks/useChatBroadcast';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { MessageSquare, Send, Edit2, FileText, X, Check, ExternalLink, Loader2 } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { CommunityChatConvertDialog } from './CommunityChatConvertDialog';

interface ChatMessage {
  id: string;
  user_id: string;
  content: string;
  created_at: string;
  edited_at: string | null;
  expires_at: string;
  profile?: {
    full_name: string | null;
    email: string | null;
  };
}

interface CommunityChatFullProps {
  isPopout?: boolean;
  onGoToERP?: () => void;
}

const MESSAGES_PER_PAGE = 50;

export function CommunityChatFull({ isPopout = false, onGoToERP }: CommunityChatFullProps) {
  const { user } = useAuth();
  const { workspaceId } = useWorkspace();
  const { isOwner, isAdmin } = useCommunityAccess();
  const { toast } = useToast();
  const { notifyMessageSent, subscribe } = useChatBroadcast();

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [sending, setSending] = useState(false);
  const [newMessage, setNewMessage] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editContent, setEditContent] = useState('');
  const [convertMessage, setConvertMessage] = useState<ChatMessage | null>(null);
  const [hasMore, setHasMore] = useState(true);
  const [newMessageCount, setNewMessageCount] = useState(0);
  
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const isAtBottomRef = useRef(true);

  const fetchMessages = useCallback(async (before?: string) => {
    if (!workspaceId) return;

    try {
      let query = supabase
        .from('community_chat_messages')
        .select(`
          id,
          user_id,
          content,
          created_at,
          edited_at,
          expires_at
        `)
        .eq('workspace_id', workspaceId)
        .gt('expires_at', new Date().toISOString())
        .order('created_at', { ascending: false })
        .limit(MESSAGES_PER_PAGE);

      if (before) {
        query = query.lt('created_at', before);
      }

      const { data, error } = await query;

      if (error) throw error;

      // Fetch profiles
      const userIds = [...new Set((data || []).map(m => m.user_id))];
      const { data: profiles } = await supabase
        .from('profiles')
        .select('id, full_name, email')
        .in('id', userIds);

      const profileMap = new Map(profiles?.map(p => [p.id, p]) || []);

      const messagesWithProfiles = (data || []).map(m => ({
        ...m,
        profile: profileMap.get(m.user_id) as ChatMessage['profile'],
      }));

      // Reverse to show oldest first
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
  }, [workspaceId]);

  useEffect(() => {
    if (workspaceId) {
      fetchMessages();
    }
  }, [workspaceId, fetchMessages]);

  // Real-time subscription
  useEffect(() => {
    if (!workspaceId) return;

    const channel = supabase
      .channel(`chat-full-${workspaceId}`)
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
            // Fetch profile for new message
            const { data: profile } = await supabase
              .from('profiles')
              .select('id, full_name, email')
              .eq('id', newMsg.user_id)
              .single();

            setMessages(prev => [...prev, { ...newMsg, profile }]);
            
            // Update new message count if not at bottom
            if (!isAtBottomRef.current && newMsg.user_id !== user?.id) {
              setNewMessageCount(prev => prev + 1);
            }
            
            // Auto-scroll if at bottom
            if (isAtBottomRef.current) {
              setTimeout(() => {
                scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
              }, 100);
            }
          } else if (payload.eventType === 'UPDATE') {
            setMessages(prev => prev.map(m => 
              m.id === payload.new.id ? { ...m, ...payload.new } : m
            ));
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [workspaceId, user?.id]);

  // Listen for broadcast messages from other tabs
  useEffect(() => {
    const unsubscribe = subscribe((msg) => {
      if (msg.type === 'MESSAGE_SENT' || msg.type === 'MESSAGE_UPDATED') {
        // Refresh messages when notified from another tab
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

  // Track scroll position
  const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
    const target = e.target as HTMLDivElement;
    const isAtBottom = target.scrollHeight - target.scrollTop - target.clientHeight < 50;
    isAtBottomRef.current = isAtBottom;
    
    if (isAtBottom) {
      setNewMessageCount(0);
    }
    
    // Load more when scrolling to top
    if (target.scrollTop < 100 && hasMore && !loadingMore && messages.length > 0) {
      setLoadingMore(true);
      fetchMessages(messages[0].created_at);
    }
  };

  const scrollToBottom = () => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
    setNewMessageCount(0);
  };

  const handleSend = async () => {
    if (!newMessage.trim() || !user?.id || !workspaceId) return;

    setSending(true);
    try {
      const { data, error } = await supabase
        .from('community_chat_messages')
        .insert({
          workspace_id: workspaceId,
          user_id: user.id,
          content: newMessage.trim(),
        })
        .select()
        .single();

      if (error) throw error;
      
      setNewMessage('');
      inputRef.current?.focus();
      
      // Notify other tabs
      if (data) {
        notifyMessageSent(data.id);
      }
      
      // Scroll to bottom
      setTimeout(() => {
        scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
      }, 100);
    } catch (error: any) {
      console.error('Error sending message:', error);
      toast({
        title: 'Erro ao enviar mensagem',
        description: error.message,
        variant: 'destructive',
      });
    } finally {
      setSending(false);
    }
  };

  const handleEdit = async (messageId: string) => {
    if (!editContent.trim()) return;

    try {
      const { error } = await supabase
        .from('community_chat_messages')
        .update({
          content: editContent.trim(),
          edited_at: new Date().toISOString(),
        })
        .eq('id', messageId);

      if (error) throw error;
      
      setEditingId(null);
      setEditContent('');
      toast({ title: 'Mensagem editada!' });
    } catch (error: any) {
      console.error('Error editing message:', error);
      toast({
        title: 'Erro ao editar',
        description: error.message,
        variant: 'destructive',
      });
    }
  };

  const startEditing = (message: ChatMessage) => {
    setEditingId(message.id);
    setEditContent(message.content);
  };

  const canEditMessage = (message: ChatMessage) => {
    if (!user?.id) return false;
    return user.id === message.user_id || isOwner || isAdmin;
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <>
      <div className="flex flex-col h-full">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-border shrink-0">
          <div className="flex items-center gap-2">
            <MessageSquare className="h-5 w-5 text-primary" />
            <h1 className="font-semibold">Chat da Comunidade</h1>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="text-xs">
              Histórico: 7 dias
            </Badge>
            {isPopout && onGoToERP && (
              <Button variant="outline" size="sm" onClick={onGoToERP}>
                <ExternalLink className="h-4 w-4 mr-1" />
                Voltar para ERP
              </Button>
            )}
          </div>
        </div>

        {/* Messages Area */}
        <ScrollArea 
          ref={scrollRef} 
          className="flex-1 px-4"
          onScroll={handleScroll}
        >
          {/* Load More Indicator */}
          {loadingMore && (
            <div className="flex justify-center py-4">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
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
              <p className="text-sm text-muted-foreground">
                Nenhuma mensagem ainda
              </p>
              <p className="text-xs text-muted-foreground">
                Seja o primeiro a iniciar a conversa!
              </p>
            </div>
          ) : (
            <div className="space-y-3 py-4">
              {messages.map((msg) => (
                <div
                  key={msg.id}
                  className={`group flex flex-col ${
                    msg.user_id === user?.id ? 'items-end' : 'items-start'
                  }`}
                >
                  {/* Author name */}
                  <span className="text-[10px] text-muted-foreground mb-0.5 px-1">
                    {msg.profile?.full_name || msg.profile?.email?.split('@')[0] || 'Usuário'}
                  </span>
                  
                  <div
                    className={`max-w-[85%] rounded-lg px-3 py-2 ${
                      msg.user_id === user?.id
                        ? 'bg-primary text-primary-foreground'
                        : 'bg-muted'
                    }`}
                  >
                    {editingId === msg.id ? (
                      <div className="flex items-center gap-2">
                        <Input
                          value={editContent}
                          onChange={(e) => setEditContent(e.target.value)}
                          className="h-7 text-sm bg-background text-foreground"
                          autoFocus
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') handleEdit(msg.id);
                            if (e.key === 'Escape') setEditingId(null);
                          }}
                        />
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-6 w-6"
                          onClick={() => handleEdit(msg.id)}
                        >
                          <Check className="h-3 w-3" />
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-6 w-6"
                          onClick={() => setEditingId(null)}
                        >
                          <X className="h-3 w-3" />
                        </Button>
                      </div>
                    ) : (
                      <>
                        <p className="text-sm whitespace-pre-wrap break-words">
                          {msg.content}
                        </p>
                        <div className="flex items-center gap-2 mt-1">
                          <span className={`text-[10px] ${
                            msg.user_id === user?.id 
                              ? 'text-primary-foreground/70' 
                              : 'text-muted-foreground'
                          }`}>
                            {formatDistanceToNow(new Date(msg.created_at), { 
                              addSuffix: true, 
                              locale: ptBR 
                            })}
                          </span>
                          {msg.edited_at && (
                            <span className={`text-[10px] italic ${
                              msg.user_id === user?.id 
                                ? 'text-primary-foreground/70' 
                                : 'text-muted-foreground'
                            }`}>
                              • Editado
                            </span>
                          )}
                        </div>
                      </>
                    )}
                  </div>

                  {/* Actions */}
                  {canEditMessage(msg) && editingId !== msg.id && (
                    <div className="flex gap-1 mt-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-5 w-5"
                        onClick={() => startEditing(msg)}
                        title="Editar"
                      >
                        <Edit2 className="h-3 w-3" />
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-5 w-5"
                        onClick={() => setConvertMessage(msg)}
                        title="Converter em tópico"
                      >
                        <FileText className="h-3 w-3" />
                      </Button>
                    </div>
                  )}
                </div>
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
        <div className="p-4 border-t border-border shrink-0">
          <div className="flex gap-2">
            <Input
              ref={inputRef}
              placeholder="Digite sua mensagem..."
              value={newMessage}
              onChange={(e) => setNewMessage(e.target.value)}
              onKeyDown={handleKeyDown}
              disabled={sending}
              maxLength={500}
              className="flex-1"
            />
            <Button 
              size="icon" 
              onClick={handleSend}
              disabled={!newMessage.trim() || sending}
            >
              <Send className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>

      {/* Convert to Topic Dialog */}
      {convertMessage && (
        <CommunityChatConvertDialog
          open={!!convertMessage}
          onOpenChange={(open) => !open && setConvertMessage(null)}
          message={convertMessage}
          onSuccess={() => {
            setConvertMessage(null);
            toast({ title: 'Tópico criado a partir da mensagem!' });
          }}
        />
      )}
    </>
  );
}
