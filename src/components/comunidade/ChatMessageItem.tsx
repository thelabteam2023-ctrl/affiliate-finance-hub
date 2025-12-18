import { useState, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Edit2, FileText, X, Check, Play, Pause } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { ptBR } from 'date-fns/locale';

export interface ChatMessage {
  id: string;
  user_id: string;
  content: string;
  message_type: 'text' | 'image' | 'audio';
  context_type: 'general' | 'bookmaker';
  context_id: string | null;
  created_at: string;
  edited_at: string | null;
  expires_at: string;
  profile?: {
    full_name: string | null;
    email: string | null;
  };
}

interface ChatMessageItemProps {
  message: ChatMessage;
  isOwnMessage: boolean;
  canEdit: boolean;
  onEdit: (id: string, content: string) => void;
  onConvert: (message: ChatMessage) => void;
}

export function ChatMessageItem({
  message,
  isOwnMessage,
  canEdit,
  onEdit,
  onConvert,
}: ChatMessageItemProps) {
  const [editing, setEditing] = useState(false);
  const [editContent, setEditContent] = useState(message.content);
  const [playing, setPlaying] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const handleSaveEdit = () => {
    if (editContent.trim()) {
      onEdit(message.id, editContent.trim());
      setEditing(false);
    }
  };

  const toggleAudio = () => {
    if (!audioRef.current) return;
    
    if (playing) {
      audioRef.current.pause();
    } else {
      audioRef.current.play();
    }
    setPlaying(!playing);
  };

  const renderContent = () => {
    if (editing) {
      return (
        <div className="flex items-center gap-2">
          <Input
            value={editContent}
            onChange={(e) => setEditContent(e.target.value)}
            className="h-7 text-sm bg-background text-foreground"
            autoFocus
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleSaveEdit();
              if (e.key === 'Escape') setEditing(false);
            }}
          />
          <Button
            size="icon"
            variant="ghost"
            className="h-6 w-6"
            onClick={handleSaveEdit}
          >
            <Check className="h-3 w-3" />
          </Button>
          <Button
            size="icon"
            variant="ghost"
            className="h-6 w-6"
            onClick={() => setEditing(false)}
          >
            <X className="h-3 w-3" />
          </Button>
        </div>
      );
    }

    switch (message.message_type) {
      case 'image':
        return (
          <img
            src={message.content}
            alt="Imagem compartilhada"
            className="max-w-full rounded-md cursor-pointer hover:opacity-90 transition-opacity"
            style={{ maxHeight: '300px' }}
            onClick={() => window.open(message.content, '_blank')}
          />
        );
      
      case 'audio':
        return (
          <div className="flex items-center gap-2 min-w-[180px]">
            <audio
              ref={audioRef}
              src={message.content}
              onEnded={() => setPlaying(false)}
              className="hidden"
            />
            <Button
              size="icon"
              variant="ghost"
              className="h-8 w-8 shrink-0"
              onClick={toggleAudio}
            >
              {playing ? (
                <Pause className="h-4 w-4" />
              ) : (
                <Play className="h-4 w-4" />
              )}
            </Button>
            <div className="flex-1 h-1 bg-muted-foreground/20 rounded-full overflow-hidden">
              <div 
                className={`h-full bg-primary transition-all duration-200 ${
                  playing ? 'animate-pulse' : ''
                }`}
                style={{ width: playing ? '100%' : '0%' }}
              />
            </div>
          </div>
        );
      
      default:
        return (
          <p className="text-sm whitespace-pre-wrap break-words">
            {message.content}
          </p>
        );
    }
  };

  return (
    <div
      className={`group flex flex-col ${
        isOwnMessage ? 'items-end' : 'items-start'
      }`}
    >
      {/* Author name */}
      <span className="text-[10px] text-muted-foreground mb-0.5 px-1">
        {message.profile?.full_name || message.profile?.email?.split('@')[0] || 'Usuário'}
      </span>
      
      <div
        className={`max-w-[85%] rounded-lg px-3 py-2 ${
          isOwnMessage
            ? 'bg-primary text-primary-foreground'
            : 'bg-muted'
        }`}
      >
        {renderContent()}
        
        {!editing && (
          <div className="flex items-center gap-2 mt-1">
            <span className={`text-[10px] ${
              isOwnMessage 
                ? 'text-primary-foreground/70' 
                : 'text-muted-foreground'
            }`}>
              {formatDistanceToNow(new Date(message.created_at), { 
                addSuffix: true, 
                locale: ptBR 
              })}
            </span>
            {message.edited_at && (
              <span className={`text-[10px] italic ${
                isOwnMessage 
                  ? 'text-primary-foreground/70' 
                  : 'text-muted-foreground'
              }`}>
                • Editado
              </span>
            )}
          </div>
        )}
      </div>

      {/* Actions */}
      {canEdit && !editing && message.message_type === 'text' && (
        <div className="flex gap-1 mt-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
          <Button
            size="icon"
            variant="ghost"
            className="h-5 w-5"
            onClick={() => {
              setEditContent(message.content);
              setEditing(true);
            }}
            title="Editar"
          >
            <Edit2 className="h-3 w-3" />
          </Button>
          <Button
            size="icon"
            variant="ghost"
            className="h-5 w-5"
            onClick={() => onConvert(message)}
            title="Converter em tópico"
          >
            <FileText className="h-3 w-3" />
          </Button>
        </div>
      )}
      
      {/* Convert only for media */}
      {canEdit && !editing && message.message_type !== 'text' && (
        <div className="flex gap-1 mt-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
          <Button
            size="icon"
            variant="ghost"
            className="h-5 w-5"
            onClick={() => onConvert(message)}
            title="Converter em tópico"
          >
            <FileText className="h-3 w-3" />
          </Button>
        </div>
      )}
    </div>
  );
}
