import { useState, useRef, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Send, Image, Mic, Loader2 } from 'lucide-react';
import { useChatMedia } from '@/hooks/useChatMedia';
import { ChatMediaPreview, ChatRecordingUI } from './ChatMediaPreview';

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

  // Handle paste event for images
  useEffect(() => {
    const handlePaste = async (e: ClipboardEvent) => {
      await handleImagePaste(e);
    };

    const input = inputRef.current;
    if (input) {
      input.addEventListener('paste', handlePaste as any);
      return () => input.removeEventListener('paste', handlePaste as any);
    }
  }, [handleImagePaste]);

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
    
    await setImagePreview(file);
    
    // Reset input
    e.target.value = '';
  };

  const handleConfirmMedia = async () => {
    if (!mediaPreview) return;

    const type = mediaPreview.type;
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

  // Normal input state
  return (
    <div className="p-4 border-t border-border shrink-0">
      <div className="flex gap-2">
        {/* Hidden file input */}
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={handleFileSelect}
        />
        
        {/* Image button */}
        <Button
          size="icon"
          variant="ghost"
          onClick={() => fileInputRef.current?.click()}
          disabled={uploading || disabled || state !== 'idle'}
          title="Enviar imagem (ou CTRL+V)"
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
          placeholder="Digite sua mensagem... (CTRL+V para colar imagem)"
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
