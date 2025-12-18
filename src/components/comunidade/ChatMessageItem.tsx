import { useState, useRef, useEffect, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Edit2, FileText, X, Check, Play, Pause, ImageIcon } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { AudioWaveform, useAudioWaveform } from './AudioWaveform';
import { CollapsedImageCard, ImageLightbox } from './CollapsedImageCard';
import { useChatMediaPreferences, ImageDisplayMode } from '@/hooks/useChatMediaPreferences';

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

function extractChatMediaPath(content: string) {
  const marker = '/storage/v1/object/public/chat-media/';
  const idx = content.indexOf(marker);
  if (idx === -1) return null;
  return content.substring(idx + marker.length);
}

export function ChatMessageItem({
  message,
  isOwnMessage,
  canEdit,
  onEdit,
  onConvert,
}: ChatMessageItemProps) {
  const { imageDisplayMode } = useChatMediaPreferences();
  
  const [editing, setEditing] = useState(false);
  const [editContent, setEditContent] = useState(message.content);
  const [playing, setPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [imageExpanded, setImageExpanded] = useState(false);
  const [showLightbox, setShowLightbox] = useState(false);
  const [mediaUrl, setMediaUrl] = useState<string | null>(null);
  const [mediaError, setMediaError] = useState<string | null>(null);
  const [imageLoaded, setImageLoaded] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const mediaPath = useMemo(() => {
    if (!message.content.startsWith('http')) return message.content;
    const extracted = extractChatMediaPath(message.content);
    return extracted ?? null;
  }, [message.content]);

  useEffect(() => {
    let cancelled = false;

    const resolveMedia = async () => {
      if (message.message_type === 'text') return;

      if (message.content.startsWith('http') && !message.content.includes('/storage/v1/object/public/chat-media/')) {
        setMediaUrl(message.content);
        return;
      }

      if (!mediaPath) {
        setMediaError('Mídia indisponível');
        return;
      }

      const { data, error } = await supabase.storage
        .from('chat-media')
        .createSignedUrl(mediaPath, 60 * 60);

      if (cancelled) return;

      if (error || !data?.signedUrl) {
        console.error('[chat-media] signedUrl:error', { error, mediaPath, messageId: message.id });
        setMediaError('Falha ao carregar mídia');
        setMediaUrl(null);
        return;
      }

      setMediaError(null);
      setMediaUrl(data.signedUrl);
    };

    resolveMedia();

    return () => {
      cancelled = true;
    };
  }, [message.id, message.message_type, message.content, mediaPath]);

  // Waveform for audio
  const waveformLevels = useAudioWaveform(message.message_type === 'audio' ? mediaUrl : null);

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
      console.error('[chat-media] playback:error', {
        messageId: message.id,
        src: audio.currentSrc,
        networkState: audio.networkState,
        readyState: audio.readyState,
        error: audio.error?.code,
      });
      setMediaError('Falha ao tocar áudio');
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
  }, [message.id]);

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

  // Determine if image should be shown based on preference
  const shouldShowImage = () => {
    if (imageDisplayMode === 'auto') return true;
    if (imageDisplayMode === 'hidden') return false;
    // collapsed mode - show only if manually expanded
    return imageExpanded;
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
          <Button size="icon" variant="ghost" className="h-6 w-6" onClick={handleSaveEdit}>
            <Check className="h-3 w-3" />
          </Button>
          <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => setEditing(false)}>
            <X className="h-3 w-3" />
          </Button>
        </div>
      );
    }

    switch (message.message_type) {
      case 'image':
        // Hidden mode - just show text
        if (imageDisplayMode === 'hidden') {
          return (
            <div className={`flex items-center gap-2 text-sm opacity-70`}>
              <ImageIcon className="h-4 w-4" />
              <span>Imagem compartilhada</span>
            </div>
          );
        }

        // Collapsed mode (default) - show card until clicked
        if (!shouldShowImage()) {
          return (
            <CollapsedImageCard
              mediaUrl={mediaUrl}
              isOwnMessage={isOwnMessage}
              onExpand={() => setImageExpanded(true)}
              mediaError={mediaError}
            />
          );
        }

        // Expanded or auto mode - show image
        return (
          <>
            <div 
              className="relative cursor-pointer rounded-md overflow-hidden"
              onClick={() => mediaUrl && setShowLightbox(true)}
            >
              {!imageLoaded && !mediaError && (
                <div className="w-48 h-32 bg-muted animate-pulse rounded-md" />
              )}
              {mediaError ? (
                <div className="w-48 h-32 bg-muted rounded-md flex items-center justify-center">
                  <span className="text-xs text-muted-foreground">{mediaError}</span>
                </div>
              ) : (
                <img
                  src={mediaUrl || undefined}
                  alt="Imagem compartilhada"
                  className={`max-w-full rounded-md hover:opacity-90 transition-opacity ${
                    !imageLoaded ? 'hidden' : ''
                  }`}
                  style={{ maxHeight: '200px', maxWidth: '240px' }}
                  onLoad={() => setImageLoaded(true)}
                  onError={() => {
                    setImageLoaded(true);
                    setMediaError('Falha ao carregar imagem');
                  }}
                  loading="lazy"
                />
              )}
              {/* Collapse button */}
              {imageDisplayMode === 'collapsed' && imageExpanded && !mediaError && (
                <Button
                  size="icon"
                  variant="ghost"
                  className="absolute top-1 right-1 h-6 w-6 bg-black/50 hover:bg-black/70 text-white"
                  onClick={(e) => {
                    e.stopPropagation();
                    setImageExpanded(false);
                  }}
                  title="Colapsar"
                >
                  <X className="h-3 w-3" />
                </Button>
              )}
            </div>
            {/* Lightbox */}
            {showLightbox && mediaUrl && (
              <ImageLightbox src={mediaUrl} onClose={() => setShowLightbox(false)} />
            )}
          </>
        );

      case 'audio':
        return (
          <div className="min-w-[200px] max-w-[280px]">
            <audio
              ref={audioRef}
              src={mediaUrl || undefined}
              preload="metadata"
              className="hidden"
            />

            <div className="flex items-center gap-2">
              <Button
                size="icon"
                variant={isOwnMessage ? 'secondary' : 'ghost'}
                className="h-9 w-9 shrink-0"
                onClick={toggleAudio}
                disabled={!mediaUrl || !!mediaError}
                title={mediaError || undefined}
              >
                {playing ? (
                  <Pause className="h-4 w-4" />
                ) : (
                  <Play className="h-4 w-4 ml-0.5" />
                )}
              </Button>

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
                  {mediaError ? mediaError : formatTime(playing ? currentTime : duration)}
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
