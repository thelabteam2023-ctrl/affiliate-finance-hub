import { useState, useRef, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Send, Image, Mic, Loader2 } from 'lucide-react';
import { useChatMedia } from '@/hooks/useChatMedia';
import { useChatMediaRateLimit } from '@/hooks/useChatMediaPreferences';
import { ChatMediaPreview, ChatRecordingUI } from './ChatMediaPreview';
import { useToast } from '@/hooks/use-toast';

interface ChatInputProps {
  workspaceId: string | null;
  userId: string | null;
  onSendText: (content: string) => Promise<void>;
  onSendMedia: (type: 'image' | 'audio', storagePath: string) => Promise<void>;
  disabled?: boolean;
}

export function ChatInput({
  workspaceId,
  userId,
  onSendText,
  onSendMedia,
  disabled = false,
}: ChatInputProps) {
  const { toast } = useToast();
  const [message, setMessage] = useState('');
  const [sending, setSending] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const {
    state,
    mediaPreview,
    recordingTime,
    audioLevels,
    maxAudioDuration,
    uploading,
    startRecording,
    stopRecording,
    cancelRecording,
    setImagePreview,
    handleImagePaste,
    confirmAndSend,
    cancelPreview,
    reRecord,
  } = useChatMedia(workspaceId, userId);

  const { checkImageRateLimit, recordImageSent, getRemainingImages } = useChatMediaRateLimit();

  // Handle paste event for images
  useEffect(() => {
    const handlePaste = async (e: ClipboardEvent) => {
      // Check rate limit before processing
      const rateCheck = checkImageRateLimit();
      if (!rateCheck.allowed) {
        e.preventDefault();
        toast({
          title: 'Limite de imagens atingido',
          description: rateCheck.reason,
          variant: 'destructive',
        });
        return;
      }
      await handleImagePaste(e);
    };

    const input = inputRef.current;
    if (input) {
      input.addEventListener('paste', handlePaste as any);
      return () => input.removeEventListener('paste', handlePaste as any);
    }
  }, [handleImagePaste, checkImageRateLimit, toast]);

  const handleSend = async () => {
    if (!message.trim() || sending || disabled) return;
    
    setSending(true);
    try {
      await onSendText(message.trim());
      setMessage('');
      inputRef.current?.focus();
    } finally {
      setSending(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    
    // Check rate limit
    const rateCheck = checkImageRateLimit();
    if (!rateCheck.allowed) {
      toast({
        title: 'Limite de imagens atingido',
        description: rateCheck.reason,
        variant: 'destructive',
      });
      e.target.value = '';
      return;
    }
    
    await setImagePreview(file);
    e.target.value = '';
  };

  const handleImageButtonClick = () => {
    const rateCheck = checkImageRateLimit();
    if (!rateCheck.allowed) {
      toast({
        title: 'Limite de imagens atingido',
        description: rateCheck.reason,
        variant: 'destructive',
      });
      return;
    }
    fileInputRef.current?.click();
  };

  const handleConfirmMedia = async () => {
    if (!mediaPreview) return;

    const type = mediaPreview.type;
    
    // Record image usage for rate limiting
    if (type === 'image') {
      recordImageSent();
    }
    
    const result = await confirmAndSend();

    if (result) {
      await onSendMedia(type, result.path);
    }
  };

  // Show recording UI
  if (state === 'recording_audio') {
    return (
      <ChatRecordingUI
        recordingTime={recordingTime}
        maxDuration={maxAudioDuration}
        audioLevels={audioLevels}
        onStop={stopRecording}
        onCancel={cancelRecording}
      />
    );
  }

  // Show preview UI
  if ((state === 'preview_audio' || state === 'preview_image') && mediaPreview) {
    return (
      <ChatMediaPreview
        preview={mediaPreview}
        audioLevels={audioLevels}
        uploading={uploading}
        onConfirm={handleConfirmMedia}
        onCancel={cancelPreview}
        onReRecord={mediaPreview.type === 'audio' ? reRecord : undefined}
      />
    );
  }

  // Get remaining for tooltip
  const remaining = getRemainingImages();

  return (
    <div className="p-4 border-t border-border shrink-0">
      <div className="flex gap-2">
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={handleFileSelect}
        />
        
        {/* Image button with rate limit info */}
        <Button
          size="icon"
          variant="ghost"
          onClick={handleImageButtonClick}
          disabled={uploading || disabled || state !== 'idle'}
          title={`Enviar imagem (CTRL+V)\n${remaining.intervalRemaining}/${3} restantes (10 min)\n${remaining.dailyRemaining}/${10} restantes (dia)`}
        >
          {uploading ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Image className="h-4 w-4" />
          )}
        </Button>

        {/* Audio button */}
        <Button
          size="icon"
          variant="ghost"
          onClick={startRecording}
          disabled={uploading || disabled || state !== 'idle'}
          title="Gravar áudio (máx. 30s)"
        >
          <Mic className="h-4 w-4" />
        </Button>

        {/* Text input */}
        <Input
          ref={inputRef}
          placeholder="Digite sua mensagem... (CTRL+V para imagem)"
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          onKeyDown={handleKeyDown}
          disabled={sending || uploading || disabled || state !== 'idle'}
          maxLength={500}
          className="flex-1"
        />

        {/* Send button */}
        <Button 
          size="icon" 
          onClick={handleSend}
          disabled={!message.trim() || sending || uploading || disabled || state !== 'idle'}
        >
          {sending ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Send className="h-4 w-4" />
          )}
        </Button>
      </div>
    </div>
  );
}
