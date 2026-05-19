import React, { useState, useEffect, useRef, useMemo } from 'react';
import { 
  MessageCircle, 
  X, 
  SendHorizontal, 
  Loader2,
  User as UserIcon
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { format, isToday, isYesterday } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { usePresence } from '@/contexts/PresenceContext';
import { ScrollArea } from './ui/scroll-area';

interface ChatDrawerProps {
  isOpen: boolean;
  onClose: () => void;
}

interface ChatMessage {
  id: string;
  content: string;
  user_id: string;
  created_at: string;
  profiles?: {
    full_name: string | null;
  };
}

export const ChatDrawer = ({ isOpen, onClose }: ChatDrawerProps) => {
  const { user, workspace } = useAuth();
  const { onlineUsers } = usePresence();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Memoize workspace members (online only for now as requested)
  const workspaceOnlineMembers = useMemo(() => {
    return onlineUsers.filter(u => u.user_id !== user?.id);
  }, [onlineUsers, user?.id]);

  useEffect(() => {
    if (!isOpen || !workspace?.id) return;

    const fetchMessages = async () => {
      setLoading(true);
      const { data, error } = await supabase
        .from('community_chat_messages')
        .select('id, content, user_id, created_at')
        .eq('workspace_id', workspace.id)
        .eq('context_type', 'workspace')
        .order('created_at', { ascending: true })
        .limit(50);

      if (!error && data) {
        // Fetch profiles separately to avoid deep type instantiation issues
        const userIds = Array.from(new Set(data.map(m => m.user_id)));
        const { data: profiles } = await supabase
          .from('profiles')
          .select('id, full_name')
          .in('id', userIds);
        
        const profileMap = (profiles || []).reduce((acc: any, p) => {
          acc[p.id] = p.full_name;
          return acc;
        }, {});

        const messagesWithProfiles = data.map(m => ({
          ...m,
          profiles: { full_name: profileMap[m.user_id] || null }
        }));

        setMessages(messagesWithProfiles as any);
      }
      setLoading(false);
      scrollToBottom();
    };

    fetchMessages();

    // Realtime subscription
    const channel = supabase
      .channel(`workspace-chat-${workspace.id}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'community_chat_messages',
          filter: `workspace_id=eq.${workspace.id}`,
        },
        async (payload) => {
          const newMessage = payload.new as ChatMessage;
          
          // Fetch profile for the new message
          const { data: profileData } = await supabase
            .from('profiles')
            .select('full_name')
            .eq('id', newMessage.user_id)
            .single();
          
          const messageWithProfile = {
            ...newMessage,
            profiles: profileData
          };

          setMessages((prev) => [...prev, messageWithProfile]);
          scrollToBottom();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [isOpen, workspace?.id]);

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  const handleSendMessage = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!newMessage.trim() || !user?.id || !workspace?.id || sending) return;

    setSending(true);
    const { error } = await supabase.from('community_chat_messages').insert({
      content: newMessage.trim(),
      user_id: user.id,
      workspace_id: workspace.id,
      context_type: 'workspace',
      message_type: 'text',
      expires_at: new Date(Date.now() + 1000 * 60 * 60 * 24 * 7).toISOString(), // 7 days as requested in schema
    });

    if (!error) {
      setNewMessage('');
    }
    setSending(false);
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  const formatMessageDate = (dateStr: string) => {
    const date = new Date(dateStr);
    if (isToday(date)) return 'Hoje';
    if (isYesterday(date)) return 'Ontem';
    return format(date, "dd 'de' MMM", { locale: ptBR });
  };

  const renderDateSeparator = (currentMsg: ChatMessage, prevMsg: ChatMessage | null) => {
    if (!prevMsg) return (
      <div className="flex justify-center my-4">
        <span className="text-[10px] px-2 py-0.5 bg-[#1a1e26] text-gray-500 rounded-full border border-[#2a2d35]">
          {formatMessageDate(currentMsg.created_at)}
        </span>
      </div>
    );

    const currentDate = format(new Date(currentMsg.created_at), 'yyyy-MM-dd');
    const prevDate = format(new Date(prevMsg.created_at), 'yyyy-MM-dd');

    if (currentDate !== prevDate) {
      return (
        <div className="flex justify-center my-4">
          <span className="text-[10px] px-2 py-0.5 bg-[#1a1e26] text-gray-500 rounded-full border border-[#2a2d35]">
            {formatMessageDate(currentMsg.created_at)}
          </span>
        </div>
      );
    }
    return null;
  };

  return (
    <>
      {/* Overlay */}
      <div 
        className={cn(
          "fixed inset-0 bg-black/50 z-[60] transition-opacity duration-300",
          isOpen ? "opacity-100 pointer-events-auto" : "opacity-0 pointer-events-none"
        )}
        onClick={onClose}
      />

      {/* Drawer */}
      <div 
        className={cn(
          "fixed top-0 right-0 h-full bg-[#13161c] z-[70] border-l border-[#2a2d35] transition-transform duration-300 ease-in-out shadow-2xl flex flex-col",
          "w-full sm:w-[380px]",
          isOpen ? "translate-x-0" : "translate-x-full"
        )}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-[#2a2d35]">
          <div className="flex flex-col">
            <div className="flex items-center gap-2">
              <MessageCircle className="w-4 h-4 text-[#00c853]" />
              <h2 className="text-white font-semibold text-sm">Chat</h2>
            </div>
            <p className="text-[10px] text-gray-500 uppercase tracking-wider font-medium mt-0.5">
              {workspace?.name || 'Workspace'}
            </p>
          </div>
          <button 
            onClick={onClose}
            className="p-1.5 hover:bg-white/10 rounded-md transition-colors"
          >
            <X className="w-4 h-4 text-gray-400" />
          </button>
        </div>

        {/* Online Members Bar */}
        <div className="px-4 py-2 border-b border-[#2a2d35] bg-[#1a1e26]/30">
          <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar py-1">
            {workspaceOnlineMembers.length > 0 ? (
              <>
                {workspaceOnlineMembers.slice(0, 5).map((member) => (
                  <div key={member.user_id} className="relative group shrink-0" title={member.name}>
                    <div className="w-7 h-7 rounded-full bg-[#2a2d35] flex items-center justify-center border border-[#3a3d45] overflow-hidden">
                      <span className="text-[10px] font-bold text-white uppercase">
                        {member.name?.charAt(0) || '?'}
                      </span>
                    </div>
                    <div className="absolute bottom-0 right-0 w-2 h-2 bg-green-500 border-2 border-[#13161c] rounded-full" />
                  </div>
                ))}
                {workspaceOnlineMembers.length > 5 && (
                  <div className="w-7 h-7 rounded-full bg-[#2a2d35] flex items-center justify-center border border-[#3a3d45] shrink-0">
                    <span className="text-[9px] font-bold text-gray-400">+{workspaceOnlineMembers.length - 5}</span>
                  </div>
                )}
              </>
            ) : (
              <p className="text-[10px] text-gray-500 italic">Nenhum membro online</p>
            )}
          </div>
        </div>

        {/* Messages Area */}
        <ScrollArea className="flex-1 px-4">
          <div className="py-4 space-y-4">
            {loading ? (
              <div className="flex flex-col items-center justify-center py-20 gap-3">
                <Loader2 className="h-6 w-6 animate-spin text-[#00c853]" />
                <p className="text-xs text-gray-500">Carregando mensagens...</p>
              </div>
            ) : messages.length === 0 ? (
              <div className="text-center py-20 px-8">
                <div className="w-12 h-12 bg-[#1a1e26] rounded-full flex items-center justify-center mx-auto mb-4 border border-[#2a2d35]">
                  <MessageCircle className="w-6 h-6 text-gray-600" />
                </div>
                <p className="text-sm text-gray-400 font-medium">Inicie uma conversa!</p>
                <p className="text-xs text-gray-500 mt-1">As mensagens enviadas aqui são visíveis para todos os membros do workspace.</p>
              </div>
            ) : (
              messages.map((msg, index) => {
                const isMe = msg.user_id === user?.id;
                const prevMsg = index > 0 ? messages[index - 1] : null;
                const isSameAuthor = prevMsg?.user_id === msg.user_id && 
                                   format(new Date(prevMsg.created_at), 'HH:mm') === format(new Date(msg.created_at), 'HH:mm');

                return (
                  <React.Fragment key={msg.id}>
                    {renderDateSeparator(msg, prevMsg)}
                    <div className={cn(
                      "flex flex-col max-w-[85%]",
                      isMe ? "ml-auto items-end" : "mr-auto items-start"
                    )}>
                      {!isMe && !isSameAuthor && (
                        <span className="text-[10px] text-gray-500 mb-1 ml-1 flex items-center gap-1">
                          {msg.profiles?.full_name || 'Usuário'}
                        </span>
                      )}
                      
                      <div className={cn(
                        "px-3 py-2 text-sm relative break-words shadow-sm",
                        isMe 
                          ? "bg-[#00c853] text-black rounded-[12px_12px_2px_12px]" 
                          : "bg-[#1e2128] text-white border border-[#2a2d35] rounded-[12px_12px_12px_2px]"
                      )}>
                        {msg.content}
                        <div className={cn(
                          "text-[9px] mt-1 text-right leading-none",
                          isMe ? "text-black/50" : "text-gray-500"
                        )}>
                          {format(new Date(msg.created_at), 'HH:mm')}
                        </div>
                      </div>
                    </div>
                  </React.Fragment>
                );
              })
            )}
            <div ref={messagesEndRef} />
          </div>
        </ScrollArea>

        {/* Input Area */}
        <div className="p-4 bg-[#13161c] border-t border-[#2a2d35]">
          <form onSubmit={handleSendMessage} className="relative">
            <textarea
              value={newMessage}
              onChange={(e) => setNewMessage(e.target.value)}
              onKeyDown={onKeyDown}
              placeholder="Digite uma mensagem..."
              rows={1}
              className="w-full bg-[#1e2128] text-white border border-[#2a2d35] rounded-lg pl-3 pr-10 py-2.5 text-sm resize-none focus:outline-none focus:border-[#00c853] transition-colors max-h-[100px]"
              style={{ minHeight: '42px' }}
            />
            <button
              type="submit"
              disabled={!newMessage.trim() || sending}
              className={cn(
                "absolute right-2 bottom-2 p-1.5 rounded-md transition-all",
                newMessage.trim() && !sending
                  ? "text-[#00c853] hover:bg-[#00c853]/10"
                  : "text-gray-600 cursor-not-allowed"
              )}
            >
              {sending ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <SendHorizontal className="w-4 h-4" />
              )}
            </button>
          </form>
        </div>
      </div>
    </>
  );
};
