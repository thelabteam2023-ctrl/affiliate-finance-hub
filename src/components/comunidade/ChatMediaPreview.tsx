import { useState, useRef, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { 
  Send, 
  X, 
  Play, 
  Pause, 
  RotateCcw, 
  Loader2,
  Image as ImageIcon,
  Mic
} from 'lucide-react';
import { AudioWaveform, useAudioWaveform } from './AudioWaveform';

interface MediaPreview {
  blob: Blob;
  url: string;
  type: 'image' | 'audio';
  size: number;
  duration?: number;
}

interface ChatMediaPreviewProps {
  preview: MediaPreview;
  audioLevels?: number[];
  uploading: boolean;
  onConfirm: () => void;
  onCancel: () => void;
  onReRecord?: () => void;
}

export function ChatMediaPreview({
  preview,
  audioLevels = [],
  uploading,
  onConfirm,
  onCancel,
  onReRecord,
}: ChatMediaPreviewProps) {
  const [playing, setPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(preview.duration || 0);
  const audioRef = useRef<HTMLAudioElement>(null);

  // Get static waveform for preview
  const staticLevels = useAudioWaveform(preview.type === 'audio' ? preview.url : null);
  const displayLevels = staticLevels.length > 0 ? staticLevels : audioLevels;

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const handleTimeUpdate = () => {
      setCurrentTime(audio.currentTime);
    };

    const handleLoadedMetadata = () => {
      setDuration(audio.duration);
    };

    const handleEnded = () => {
      setPlaying(false);
      setCurrentTime(0);
    };

    audio.addEventListener('timeupdate', handleTimeUpdate);
    audio.addEventListener('loadedmetadata', handleLoadedMetadata);
    audio.addEventListener('ended', handleEnded);

    return () => {
      audio.removeEventListener('timeupdate', handleTimeUpdate);
      audio.removeEventListener('loadedmetadata', handleLoadedMetadata);
      audio.removeEventListener('ended', handleEnded);
    };
  }, []);

  const togglePlay = () => {
    if (!audioRef.current) return;
    
    if (playing) {
      audioRef.current.pause();
    } else {
      audioRef.current.play();
    }
    setPlaying(!playing);
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const formatSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  if (preview.type === 'image') {
    return (
      <div className="p-4 border-t border-border bg-muted/50 shrink-0">
        <div className="flex items-start gap-3">
          {/* Thumbnail */}
          <div className="relative w-20 h-20 rounded-lg overflow-hidden bg-background border border-border">
            <img 
              src={preview.url} 
              alt="Preview" 
              className="w-full h-full object-cover"
            />
          </div>

          {/* Info */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <ImageIcon className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm font-medium">Imagem</span>
            </div>
            <p className="text-xs text-muted-foreground">
              {formatSize(preview.size)}
            </p>
          </div>

          {/* Actions */}
          <div className="flex gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={onCancel}
              disabled={uploading}
            >
              <X className="h-4 w-4 mr-1" />
              Cancelar
            </Button>
            <Button
              size="sm"
              onClick={onConfirm}
              disabled={uploading}
            >
              {uploading ? (
                <Loader2 className="h-4 w-4 animate-spin mr-1" />
              ) : (
                <Send className="h-4 w-4 mr-1" />
              )}
              Enviar
            </Button>
          </div>
        </div>
      </div>
    );
  }

  // Audio preview
  return (
    <div className="p-4 border-t border-border bg-muted/50 shrink-0">
      <audio ref={audioRef} src={preview.url} preload="metadata" />
      
      <div className="space-y-3">
        {/* Header */}
        <div className="flex items-center gap-2">
          <Mic className="h-4 w-4 text-muted-foreground" />
          <span className="text-sm font-medium">Áudio gravado</span>
          <span className="text-xs text-muted-foreground">
            {formatSize(preview.size)}
          </span>
        </div>

        {/* Player */}
        <div className="flex items-center gap-3 p-3 rounded-lg bg-background border border-border">
          {/* Play/Pause */}
          <Button
            size="icon"
            variant="ghost"
            className="h-10 w-10 shrink-0"
            onClick={togglePlay}
          >
            {playing ? (
              <Pause className="h-5 w-5" />
            ) : (
              <Play className="h-5 w-5 ml-0.5" />
            )}
          </Button>

          {/* Waveform */}
          <div className="flex-1">
            <AudioWaveform
              levels={displayLevels}
              isPlaying={playing}
              progress={duration > 0 ? currentTime / duration : 0}
              className="h-10"
            />
          </div>

          {/* Time */}
          <div className="text-sm tabular-nums text-muted-foreground shrink-0 w-20 text-right">
            {formatTime(currentTime)} / {formatTime(duration)}
          </div>
        </div>

        {/* Actions */}
        <div className="flex justify-end gap-2">
          {onReRecord && (
            <Button
              size="sm"
              variant="ghost"
              onClick={onReRecord}
              disabled={uploading}
            >
              <RotateCcw className="h-4 w-4 mr-1" />
              Regravar
            </Button>
          )}
          <Button
            size="sm"
            variant="outline"
            onClick={onCancel}
            disabled={uploading}
          >
            <X className="h-4 w-4 mr-1" />
            Cancelar
          </Button>
          <Button
            size="sm"
            onClick={onConfirm}
            disabled={uploading}
          >
            {uploading ? (
              <Loader2 className="h-4 w-4 animate-spin mr-1" />
            ) : (
              <Send className="h-4 w-4 mr-1" />
            )}
            Enviar
          </Button>
        </div>
      </div>
    </div>
  );
}

// Recording UI
interface ChatRecordingUIProps {
  recordingTime: number;
  maxDuration: number;
  audioLevels: number[];
  onStop: () => void;
  onCancel: () => void;
}

export function ChatRecordingUI({
  recordingTime,
  maxDuration,
  audioLevels,
  onStop,
  onCancel,
}: ChatRecordingUIProps) {
  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <div className="p-4 border-t border-border bg-muted/50 shrink-0">
      <div className="space-y-3">
        {/* Recording indicator */}
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 bg-destructive rounded-full animate-pulse" />
            <span className="text-sm font-medium">Gravando...</span>
          </div>
          <span className="text-sm tabular-nums text-muted-foreground">
            {formatTime(recordingTime)} / {formatTime(maxDuration)}
          </span>
        </div>

        {/* Live waveform */}
        <div className="p-3 rounded-lg bg-background border border-border">
          <AudioWaveform
            levels={audioLevels}
            isRecording={true}
            className="h-12"
          />
        </div>

        {/* Actions */}
        <div className="flex justify-end gap-2">
          <Button
            size="sm"
            variant="outline"
            onClick={onCancel}
          >
            <X className="h-4 w-4 mr-1" />
            Cancelar
          </Button>
          <Button
            size="sm"
            variant="destructive"
            onClick={onStop}
          >
            <div className="w-3 h-3 bg-current rounded-sm mr-2" />
            Parar
          </Button>
        </div>
      </div>
    </div>
  );
}
