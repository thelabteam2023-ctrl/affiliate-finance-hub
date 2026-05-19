import React, { useState, useEffect, useRef, useMemo } from 'react';
import { 
  MessageCircle, 
  X, 
  SendHorizontal, 
  Loader2,
  User as UserIcon,
  ImagePlus,
  Maximize2
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { format, isToday, isYesterday } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { usePresence } from '@/contexts/PresenceContext';
import { useImageUpload } from '@/hooks/useImageUpload';
import { ScrollArea } from './ui/scroll-area';
import { toast } from 'sonner';

interface ChatDrawerProps {
  isOpen: boolean;
  onClose: () => void;
}

interface ChatMessage {
  id: string;
  content: string;
  user_id: string;
  image_url?: string;
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
  const [showMentions, setShowMentions] = useState(false);
  const [mentionFilter, setMentionFilter] = useState('');
  const [selectedImage, setSelectedImage] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [fullscreenImage, setFullscreenImage] = useState<string | null>(null);
  const [mentionIndex, setMentionIndex] = useState(-1);
  
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const { uploadImage, isUploading } = useImageUpload({
    userId: user?.id || '',
    bucket: 'chat-images',
    onImageUploaded: () => {}, // Handled manually in handleSendMessage
  });

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
        .select('id, content, user_id, image_url, created_at')
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
    if ((!newMessage.trim() && !selectedImage) || !user?.id || !workspace?.id || sending || isUploading) return;

    setSending(true);
    try {
      let imageUrl = null;
      if (selectedImage) {
        imageUrl = await uploadImage(selectedImage);
        if (!imageUrl) {
          setSending(false);
          return;
        }
      }

      const { error } = await supabase.from('community_chat_messages').insert([{
        content: newMessage.trim(),
        user_id: user.id,
        workspace_id: workspace.id,
        context_type: 'workspace',
        message_type: imageUrl ? 'image' : 'text',
        image_url: imageUrl,
        expires_at: new Date(Date.now() + 1000 * 60 * 60 * 24 * 7).toISOString(),
      } as any]);

      if (!error) {
        setNewMessage('');
        setSelectedImage(null);
        setImagePreview(null);
      } else {
        toast.error("Erro ao enviar mensagem");
      }
    } catch (error) {
      toast.error("Erro inesperado");
    } finally {
      setSending(false);
    }
  };

  const handleImageSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (file.size > 5 * 1024 * 1024) {
        toast.error("A imagem deve ter no máximo 5MB");
        return;
      }
      setSelectedImage(file);
      const reader = new FileReader();
      reader.onloadend = () => {
        setImagePreview(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (showMentions) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setMentionIndex(prev => (prev + 1) % filteredMembers.length);
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setMentionIndex(prev => (prev - 1 + filteredMembers.length) % filteredMembers.length);
        return;
      }
      if (e.key === 'Enter' || e.key === 'Tab') {
        e.preventDefault();
        const member = filteredMembers[mentionIndex >= 0 ? mentionIndex : 0];
        if (member) insertMention(member);
        return;
      }
      if (e.key === 'Escape') {
        setShowMentions(false);
        return;
      }
    }

    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  const handleTextChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const value = e.target.value;
    setNewMessage(value);

    const lastAtPos = value.lastIndexOf('@', textareaRef.current?.selectionStart || 0);
    if (lastAtPos !== -1) {
      const textAfterAt = value.substring(lastAtPos + 1, textareaRef.current?.selectionStart || 0);
      if (!textAfterAt.includes(' ')) {
        setShowMentions(true);
        setMentionFilter(textAfterAt.toLowerCase());
        setMentionIndex(0);
        return;
      }
    }
    setShowMentions(false);
  };

  const filteredMembers = useMemo(() => {
    return onlineUsers.filter(u => 
      u.name?.toLowerCase().includes(mentionFilter)
    );
  }, [onlineUsers, mentionFilter]);

  const insertMention = (member: any) => {
    const pos = textareaRef.current?.selectionStart || 0;
    const lastAtPos = newMessage.lastIndexOf('@', pos);
    const before = newMessage.substring(0, lastAtPos);
    const after = newMessage.substring(pos);
    const name = member.name || member.email?.split('@')[0] || 'Usuário';
    setNewMessage(`${before}@${name} ${after}`);
    setShowMentions(false);
    textareaRef.current?.focus();
  };

  const renderContent = (content: string) => {
    const parts = content.split(/(@[\wÀ-ú]+)/g);
    return parts.map((part, i) => {
      if (part.startsWith('@')) {
        return (
          <span key={i} className="text-black font-semibold bg-black/10 px-1 rounded mx-0.5">
            {part}
          </span>
        );
      }
      return part;
    });
  };

  const renderContentOther = (content: string) => {
    const parts = content.split(/(@[\wÀ-ú]+)/g);
    return parts.map((part, i) => {
      if (part.startsWith('@')) {
        return (
          <span key={i} className="text-[#00c853] font-semibold bg-[#00c853]/10 px-1 rounded mx-0.5 border border-[#00c853]/20">
            {part}
          </span>
        );
      }
      return part;
    });
  };

  const formatMessageDate = (dateStr: string) => {
    const date = new Date(dateStr);
    if (isToday(date)) return 'Hoje';
    if (isYesterday(date)) return 'Ontem';
    return format(date, "dd 'de' MMM", { locale: ptBR });
  };

  const renderDateSeparator = (currentMsg: ChatMessage, prevMsg: ChatMessage | null) => {
    if (!prevMsg) {
      return (
        <div className="flex justify-center my-4">
          <span className="text-[10px] px-2 py-0.5 bg-[#1a1e26] text-gray-500 rounded-full border border-[#2a2d35]">
            {formatMessageDate(currentMsg.created_at)}
          </span>
        </div>
      );
    }

    const currentDateStr = format(new Date(currentMsg.created_at), 'yyyy-MM-dd');
    const prevDateStr = format(new Date(prevMsg.created_at), 'yyyy-MM-dd');

    if (currentDateStr !== prevDateStr) {
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
                
                const myName = (user as any).full_name || user?.email?.split('@')[0];
                const hasMentionMe = msg.content.includes(`@${myName}`);

                return (
                  <React.Fragment key={msg.id}>
                    {renderDateSeparator(msg, prevMsg)}
                    <div className={cn(
                      "flex flex-col max-w-[85%] group/msg",
                      isMe ? "ml-auto items-end" : "mr-auto items-start",
                      hasMentionMe && "border-l-4 border-[#00c853] bg-[#00c853]/5 -mx-4 px-4 py-1"
                    )}>
                      {!isMe && !isSameAuthor && (
                        <span className="text-[10px] text-gray-500 mb-1 ml-1 flex items-center gap-1">
                          {msg.profiles?.full_name || 'Usuário'}
                        </span>
                      )}
                      
                      <div className={cn(
                        "px-3 py-2 text-sm relative break-words shadow-sm flex flex-col gap-2",
                        isMe 
                          ? "bg-[#00c853] text-black rounded-[12px_12px_2px_12px]" 
                          : "bg-[#1e2128] text-white border border-[#2a2d35] rounded-[12px_12px_12px_2px]"
                      )}>
                        {msg.image_url && (
                          <div className="relative group/img max-w-full overflow-hidden rounded-md border border-black/10">
                            <img 
                              src={msg.image_url} 
                              alt="Chat" 
                              className="max-h-[200px] w-full object-cover cursor-pointer hover:opacity-90 transition-opacity"
                              onClick={() => setFullscreenImage(msg.image_url!)}
                            />
                            <button 
                              onClick={() => setFullscreenImage(msg.image_url!)}
                              className="absolute top-2 right-2 p-1.5 bg-black/50 rounded-full opacity-0 group-hover/img:opacity-100 transition-opacity"
                            >
                              <Maximize2 className="w-3 h-3 text-white" />
                            </button>
                          </div>
                        )}
                        {msg.content && (
                          <p>{isMe ? renderContent(msg.content) : renderContentOther(msg.content)}</p>
                        )}
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

        {/* Fullscreen Image Overlay */}
        {fullscreenImage && (
          <div 
            className="fixed inset-0 z-[100] bg-black/95 flex items-center justify-center p-4 cursor-default"
            onClick={() => setFullscreenImage(null)}
          >
            <button className="absolute top-6 right-6 p-2 bg-white/10 hover:bg-white/20 rounded-full transition-colors">
              <X className="w-6 h-6 text-white" />
            </button>
            <img 
              src={fullscreenImage} 
              alt="Full size" 
              className="max-w-full max-h-full object-contain"
            />
          </div>
        )}

        {/* Input Area */}
        <div className="p-4 bg-[#13161c] border-t border-[#2a2d35] relative">
          {/* Mentions Popup */}
          {showMentions && filteredMembers.length > 0 && (
            <div className="absolute bottom-[100%] left-4 right-4 bg-[#1e2128] border border-[#2a2d35] rounded-lg shadow-2xl overflow-hidden mb-2 z-[100] max-h-[200px] overflow-y-auto">
              <div className="p-2 border-b border-[#2a2d35] bg-[#1a1e26]">
                <span className="text-[10px] text-gray-500 uppercase font-bold tracking-wider">Mencionar membro</span>
              </div>
              {filteredMembers.map((member, i) => (
                <button
                  key={member.user_id}
                  onClick={() => insertMention(member)}
                  className={cn(
                    "w-full flex items-center gap-2 px-3 py-2 text-sm transition-colors text-left",
                    i === mentionIndex ? "bg-[#00c853]/10 text-[#00c853]" : "text-gray-300 hover:bg-[#2a2d35]"
                  )}
                >
                  <div className="w-6 h-6 rounded-full bg-[#2a2d35] flex items-center justify-center border border-[#3a3d45] shrink-0">
                    <span className="text-[10px] font-bold uppercase">{member.name?.charAt(0) || '?'}</span>
                  </div>
                  <span className="truncate">{member.name}</span>
                  {member.user_id === user?.id && <span className="text-[10px] text-gray-500 ml-auto">(Você)</span>}
                </button>
              ))}
            </div>
          )}

          {/* Image Preview */}
          {imagePreview && (
            <div className="mb-3 flex items-center gap-2 p-2 bg-[#1a1e26] rounded-lg border border-[#2a2d35] animate-in slide-in-from-bottom-2">
              <div className="relative w-14 h-14 shrink-0">
                <img src={imagePreview} alt="Preview" className="w-full h-full object-cover rounded-md border border-[#3a3d45]" />
                <button 
                  onClick={() => { setSelectedImage(null); setImagePreview(null); }}
                  className="absolute -top-2 -right-2 bg-red-500 text-white rounded-full p-0.5 hover:bg-red-600 shadow-lg"
                >
                  <X className="w-3 h-3" />
                </button>
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-[11px] text-white truncate font-medium">{selectedImage?.name}</p>
                <p className="text-[10px] text-gray-500">Pronto para enviar</p>
              </div>
            </div>
          )}

          <form onSubmit={handleSendMessage} className="flex flex-col gap-2">
            <div className="relative group">
              <textarea
                ref={textareaRef}
                value={newMessage}
                onChange={handleTextChange}
                onKeyDown={onKeyDown}
                placeholder="Digite uma mensagem..."
                rows={1}
                className="w-full bg-[#1e2128] text-white border border-[#2a2d35] rounded-lg pl-3 pr-10 py-2.5 text-sm resize-none focus:outline-none focus:border-[#00c853] transition-colors max-h-[150px] min-h-[42px]"
              />
              <button
                type="submit"
                disabled={(!newMessage.trim() && !selectedImage) || sending || isUploading}
                className={cn(
                  "absolute right-2 bottom-2 p-1.5 rounded-md transition-all",
                  (newMessage.trim() || selectedImage) && !sending && !isUploading
                    ? "text-[#00c853] hover:bg-[#00c853]/10"
                    : "text-gray-600 cursor-not-allowed"
                )}
              >
                {sending || isUploading ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <SendHorizontal className="w-4 h-4" />
                )}
              </button>
            </div>
            
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="p-1.5 text-gray-500 hover:text-[#00c853] transition-colors flex items-center gap-1.5 group"
                >
                  <ImagePlus className="w-4 h-4" />
                  <span className="text-[11px] font-medium opacity-0 group-hover:opacity-100 transition-opacity">Anexar imagem</span>
                </button>
                <input 
                  type="file" 
                  ref={fileInputRef}
                  onChange={handleImageSelect}
                  accept="image/*"
                  className="hidden"
                />
              </div>
              
              <div className="flex items-center gap-2 text-[10px] text-gray-600">
                <kbd className="px-1.5 py-0.5 rounded bg-[#1e2128] border border-[#2a2d35]">Enter</kbd>
                <span>para enviar</span>
              </div>
            </div>
          </form>
        </div>
      </div>
    </>
  );
};
