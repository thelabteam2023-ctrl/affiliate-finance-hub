import { useState, useEffect, useRef, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useWorkspace } from '@/hooks/useWorkspace';
import { useCommunityAccess } from '@/hooks/useCommunityAccess';
import { useToast } from '@/hooks/use-toast';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Skeleton } from '@/components/ui/skeleton';
import { MessageSquare, Send, Lock, Edit2, FileText, X, Check } from 'lucide-react';
import { format, formatDistanceToNow } from 'date-fns';
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

const MAX_MESSAGES_DISPLAY = 100;

export function CommunityChat() {
  const { user } = useAuth();
  const { workspaceId } = useWorkspace();
  const { hasFullAccess, canWrite, isOwner, isAdmin, loading: accessLoading } = useCommunityAccess();
  const { toast } = useToast();

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [newMessage, setNewMessage] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editContent, setEditContent] = useState('');
  const [convertMessage, setConvertMessage] = useState<ChatMessage | null>(null);
  
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const fetchMessages = useCallback(async () => {
    if (!workspaceId) return;

    try {
      const { data, error } = await supabase
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
        .limit(MAX_MESSAGES_DISPLAY);

      if (error) throw error;

      // Fetch profiles separately
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
      setMessages(messagesWithProfiles.reverse());
    } catch (error) {
      console.error('Error fetching chat messages:', error);
    } finally {
      setLoading(false);
    }
  }, [workspaceId]);

  useEffect(() => {
    if (hasFullAccess && workspaceId) {
      fetchMessages();
    }
  }, [hasFullAccess, workspaceId, fetchMessages]);

  // Real-time subscription
  useEffect(() => {
    if (!hasFullAccess || !workspaceId) return;

    const channel = supabase
      .channel(`chat-${workspaceId}`)
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

            setMessages(prev => [...prev, { ...newMsg, profile }].slice(-MAX_MESSAGES_DISPLAY));
            
            // Scroll to bottom
            setTimeout(() => {
              scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
            }, 100);
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
  }, [hasFullAccess, workspaceId]);

  // Auto-scroll on initial load
  useEffect(() => {
    if (!loading && messages.length > 0) {
      setTimeout(() => {
        scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
      }, 100);
    }
  }, [loading, messages.length]);

  const handleSend = async () => {
    if (!newMessage.trim() || !user?.id || !workspaceId) return;

    setSending(true);
    try {
      const { error } = await supabase
        .from('community_chat_messages')
        .insert({
          workspace_id: workspaceId,
          user_id: user.id,
          content: newMessage.trim(),
        });

      if (error) throw error;
      
      setNewMessage('');
      inputRef.current?.focus();
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

  // Check if user can edit a message (own message or admin, AND can write)
  const canEditMessage = (message: ChatMessage) => {
    if (!user?.id || !canWrite) return false;
    return user.id === message.user_id || isOwner || isAdmin;
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  // Access control
  if (accessLoading) {
    return (
      <Card className="h-[400px]">
        <CardHeader className="pb-3">
          <Skeleton className="h-6 w-32" />
        </CardHeader>
        <CardContent>
          <Skeleton className="h-[300px]" />
        </CardContent>
      </Card>
    );
  }

  if (!hasFullAccess) {
    return (
      <Card className="h-[400px]">
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <MessageSquare className="h-4 w-4" />
            Chat Geral
          </CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col items-center justify-center h-[300px] text-center">
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

  return (
    <>
      <Card className="h-[400px] flex flex-col">
        <CardHeader className="pb-3 shrink-0">
          <CardTitle className="text-base flex items-center gap-2">
            <MessageSquare className="h-4 w-4" />
            Chat Geral
          </CardTitle>
        </CardHeader>
        
        <CardContent className="flex-1 flex flex-col p-0 overflow-hidden">
          {/* Messages Area */}
          <ScrollArea ref={scrollRef} className="flex-1 px-4">
            {loading ? (
              <div className="space-y-3 py-4">
                {[...Array(5)].map((_, i) => (
                  <Skeleton key={i} className="h-12 w-full" />
                ))}
              </div>
            ) : messages.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full py-8 text-center">
                <MessageSquare className="h-8 w-8 text-muted-foreground/30 mb-2" />
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
                      className={`max-w-[80%] rounded-lg px-3 py-2 ${
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

          {/* Input Area - Only for users who can write */}
          {canWrite ? (
            <div className="p-3 border-t border-border shrink-0">
              <div className="flex gap-2">
                <Input
                  ref={inputRef}
                  placeholder="Digite sua mensagem..."
                  value={newMessage}
                  onChange={(e) => setNewMessage(e.target.value)}
                  onKeyDown={handleKeyDown}
                  disabled={sending}
                  maxLength={500}
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
          ) : (
            <div className="p-3 border-t border-border shrink-0 text-center text-sm text-muted-foreground">
              Modo somente leitura
            </div>
          )}
        </CardContent>
      </Card>

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
