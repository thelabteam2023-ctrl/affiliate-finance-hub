import { useState, useRef, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Edit2, FileText, X, Check, Play, Pause } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { AudioWaveform, useAudioWaveform } from './AudioWaveform';

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
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [imageLoaded, setImageLoaded] = useState(false);
  const [showLightbox, setShowLightbox] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  // Get waveform levels for audio
  const waveformLevels = useAudioWaveform(
    message.message_type === 'audio' ? message.content : null
  );

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const handleTimeUpdate = () => setCurrentTime(audio.currentTime);
    const handleLoadedMetadata = () => setDuration(audio.duration);
    const handleEnded = () => {
      setPlaying(false);
      setCurrentTime(0);
    };
    const handleError = () => {
      console.error('Audio playback error');
    };

    audio.addEventListener('timeupdate', handleTimeUpdate);
    audio.addEventListener('loadedmetadata', handleLoadedMetadata);
    audio.addEventListener('ended', handleEnded);
    audio.addEventListener('error', handleError);

    return () => {
      audio.removeEventListener('timeupdate', handleTimeUpdate);
      audio.removeEventListener('loadedmetadata', handleLoadedMetadata);
      audio.removeEventListener('ended', handleEnded);
      audio.removeEventListener('error', handleError);
    };
  }, []);

  const handleSaveEdit = () => {
    if (editContent.trim()) {
      onEdit(message.id, editContent.trim());
      setEditing(false);
    }
  };

  const toggleAudio = async () => {
    if (!audioRef.current) return;
    
    try {
      if (playing) {
        audioRef.current.pause();
        setPlaying(false);
      } else {
        await audioRef.current.play();
        setPlaying(true);
      }
    } catch (error) {
      console.error('Error playing audio:', error);
    }
  };

  const formatTime = (seconds: number) => {
    if (!isFinite(seconds)) return '0:00';
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
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
          <>
            <div 
              className="relative cursor-pointer rounded-md overflow-hidden"
              onClick={() => setShowLightbox(true)}
            >
              {!imageLoaded && (
                <div className="w-48 h-32 bg-muted animate-pulse rounded-md" />
              )}
              <img
                src={message.content}
                alt="Imagem compartilhada"
                className={`max-w-full rounded-md hover:opacity-90 transition-opacity ${
                  !imageLoaded ? 'hidden' : ''
                }`}
                style={{ maxHeight: '300px', maxWidth: '280px' }}
                onLoad={() => setImageLoaded(true)}
                onError={() => setImageLoaded(true)}
              />
            </div>
            {/* Lightbox */}
            {showLightbox && (
              <div 
                className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4"
                onClick={() => setShowLightbox(false)}
              >
                <img
                  src={message.content}
                  alt="Imagem"
                  className="max-w-full max-h-full object-contain rounded-lg"
                />
                <Button
                  size="icon"
                  variant="ghost"
                  className="absolute top-4 right-4 text-white hover:bg-white/20"
                  onClick={() => setShowLightbox(false)}
                >
                  <X className="h-6 w-6" />
                </Button>
              </div>
            )}
          </>
        );
      
      case 'audio':
        return (
          <div className="min-w-[200px] max-w-[280px]">
            <audio
              ref={audioRef}
              src={message.content}
              preload="metadata"
              className="hidden"
            />
            
            <div className="flex items-center gap-2">
              {/* Play/Pause button */}
              <Button
                size="icon"
                variant={isOwnMessage ? 'secondary' : 'ghost'}
                className="h-9 w-9 shrink-0"
                onClick={toggleAudio}
              >
                {playing ? (
                  <Pause className="h-4 w-4" />
                ) : (
                  <Play className="h-4 w-4 ml-0.5" />
                )}
              </Button>

              {/* Waveform and time */}
              <div className="flex-1 min-w-0">
                <AudioWaveform
                  levels={waveformLevels.length > 0 ? waveformLevels : Array(30).fill(0.3)}
                  isPlaying={playing}
                  progress={duration > 0 ? currentTime / duration : 0}
                  className="h-8"
                  barColor={isOwnMessage ? 'hsl(var(--primary-foreground) / 0.4)' : 'hsl(var(--muted-foreground) / 0.4)'}
                  activeColor={isOwnMessage ? 'hsl(var(--primary-foreground))' : 'hsl(var(--primary))'}
                />
                <div className={`text-[10px] mt-0.5 tabular-nums ${
                  isOwnMessage ? 'text-primary-foreground/70' : 'text-muted-foreground'
                }`}>
                  {formatTime(playing ? currentTime : duration)}
                </div>
              </div>
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
