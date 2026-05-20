
import React, { useEffect, useState } from 'react';
import { Play, Square, Loader2, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { notificationAudioManager, AudioState } from '@/services/audio/notificationAudioManager';
import { cn } from '@/lib/utils';

interface AudioPreviewButtonProps {
  soundUrl: string;
  className?: string;
  size?: "default" | "sm" | "lg" | "icon";
}

export const AudioPreviewButton = ({ soundUrl, className, size = "icon" }: AudioPreviewButtonProps) => {
  const [status, setStatus] = useState(() => notificationAudioManager.getStatus(soundUrl));

  useEffect(() => {
    return notificationAudioManager.subscribe(soundUrl, (newStatus) => {
      setStatus(newStatus);
    });
  }, [soundUrl]);

  const handleToggle = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();

    if (status.state === 'playing') {
      notificationAudioManager.stop(soundUrl);
    } else {
      try {
        await notificationAudioManager.play(soundUrl);
      } catch (error) {
        console.error('[AudioPreview] Failed to play:', error);
      }
    }
  };

  const getIcon = () => {
    switch (status.state) {
      case 'loading':
        return <Loader2 className="h-3.5 w-3.5 animate-spin" />;
      case 'playing':
        return <Square className="h-3.5 w-3.5 fill-current" />;
      case 'error':
        return <AlertCircle className="h-3.5 w-3.5 text-destructive" />;
      default:
        return <Play className="h-3.5 w-3.5" />;
    }
  };

  // Progress percentage
  const progress = status.duration > 0 ? (status.currentTime / status.duration) * 100 : 0;

  return (
    <Button
      variant="ghost"
      size={size}
      className={cn(
        "relative h-8 w-8 overflow-hidden group",
        status.state === 'playing' && "text-primary",
        className
      )}
      onClick={handleToggle}
      disabled={status.state === 'loading'}
      data-testid="audio-preview-button"
      data-audio-state={status.state}
      data-audio-url={soundUrl}
      data-audio-progress={progress.toFixed(2)}
    >
      <div className="relative z-10 flex items-center justify-center">
        {getIcon()}
      </div>
      
      {/* Visual Progress ring/bar background */}
      {status.state === 'playing' && (
        <div 
          className="absolute inset-0 bg-primary/10 transition-all duration-100 ease-linear origin-left"
          style={{ width: `${progress}%` }}
        />
      )}
      
      {/* State label for accessibility/testing (hidden) */}
      <span className="sr-only">
        {status.state === 'playing' ? 'Pausar preview' : 'Tocar preview'}
      </span>
    </Button>
  );
};
