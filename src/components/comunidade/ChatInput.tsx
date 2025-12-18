import { useState, useRef, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Send, Image, Mic, Square, Loader2 } from 'lucide-react';
import { useChatMedia } from '@/hooks/useChatMedia';

interface ChatInputProps {
  workspaceId: string | null;
  userId: string | null;
  onSendText: (content: string) => Promise<void>;
  onSendMedia: (type: 'image' | 'audio', url: string) => Promise<void>;
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
    uploading,
    recording,
    recordingTime,
    maxAudioDuration,
    handleImagePaste,
    startRecording,
    stopRecording,
    cancelRecording,
    uploadFile,
  } = useChatMedia(workspaceId, userId);

  // Handle paste event for images
  useEffect(() => {
    const handlePaste = async (e: ClipboardEvent) => {
      const result = await handleImagePaste(e);
      if (result) {
        await onSendMedia('image', result.url);
      }
    };

    const input = inputRef.current;
    if (input) {
      input.addEventListener('paste', handlePaste as any);
      return () => input.removeEventListener('paste', handlePaste as any);
    }
  }, [handleImagePaste, onSendMedia]);

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

    if (file.size > 3 * 1024 * 1024) {
      return; // useChatMedia already shows toast
    }

    // Convert to WebP
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    const img = new window.Image();

    img.onload = async () => {
      const maxDim = 1920;
      let { width, height } = img;
      
      if (width > maxDim || height > maxDim) {
        if (width > height) {
          height = (height / width) * maxDim;
          width = maxDim;
        } else {
          width = (width / height) * maxDim;
          height = maxDim;
        }
      }

      canvas.width = width;
      canvas.height = height;
      ctx?.drawImage(img, 0, 0, width, height);

      canvas.toBlob(
        async (blob) => {
          if (blob) {
            const result = await uploadFile(blob, 'image');
            if (result) {
              await onSendMedia('image', result.url);
            }
          }
        },
        'image/webp',
        0.85
      );
    };

    img.src = URL.createObjectURL(file);
    
    // Reset input
    e.target.value = '';
  };

  const handleStopRecording = async () => {
    const result = await stopRecording();
    if (result) {
      await onSendMedia('audio', result.url);
    }
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  if (recording) {
    return (
      <div className="p-4 border-t border-border shrink-0">
        <div className="flex items-center gap-3">
          <div className="flex-1 flex items-center gap-2">
            <div className="w-3 h-3 bg-destructive rounded-full animate-pulse" />
            <span className="text-sm font-medium">
              Gravando... {formatTime(recordingTime)} / {formatTime(maxAudioDuration)}
            </span>
          </div>
          <Button
            size="sm"
            variant="outline"
            onClick={cancelRecording}
          >
            Cancelar
          </Button>
          <Button
            size="sm"
            onClick={handleStopRecording}
          >
            <Square className="h-4 w-4 mr-1" />
            Parar
          </Button>
        </div>
      </div>
    );
  }

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
          disabled={uploading || disabled}
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
          disabled={uploading || disabled}
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
          disabled={sending || uploading || disabled}
          maxLength={500}
          className="flex-1"
        />

        {/* Send button */}
        <Button 
          size="icon" 
          onClick={handleSend}
          disabled={!message.trim() || sending || uploading || disabled}
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
