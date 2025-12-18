import { useState } from 'react';
import { ImageIcon, Eye, X, Download } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface CollapsedImageCardProps {
  mediaUrl: string | null;
  isOwnMessage: boolean;
  onExpand: () => void;
  mediaError?: string | null;
}

export function CollapsedImageCard({
  mediaUrl,
  isOwnMessage,
  onExpand,
  mediaError,
}: CollapsedImageCardProps) {
  if (mediaError) {
    return (
      <div 
        className={`flex items-center gap-2 px-3 py-2 rounded-md ${
          isOwnMessage ? 'bg-primary-foreground/10' : 'bg-muted-foreground/10'
        }`}
      >
        <ImageIcon className="h-4 w-4 opacity-50" />
        <span className="text-xs opacity-70">{mediaError}</span>
      </div>
    );
  }

  return (
    <button
      onClick={onExpand}
      className={`flex items-center gap-2 px-3 py-2 rounded-md transition-colors cursor-pointer text-left w-full ${
        isOwnMessage 
          ? 'bg-primary-foreground/10 hover:bg-primary-foreground/20' 
          : 'bg-muted-foreground/10 hover:bg-muted-foreground/20'
      }`}
    >
      <ImageIcon className="h-4 w-4 shrink-0" />
      <span className="text-sm">Imagem compartilhada</span>
      <Eye className="h-3 w-3 ml-auto opacity-60" />
    </button>
  );
}

interface ImageLightboxProps {
  src: string;
  onClose: () => void;
}

export function ImageLightbox({ src, onClose }: ImageLightboxProps) {
  const handleDownload = () => {
    const link = document.createElement('a');
    link.href = src;
    link.download = `imagem-${Date.now()}.webp`;
    link.target = '_blank';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div 
      className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <img
        src={src}
        alt="Imagem"
        className="max-w-full max-h-full object-contain rounded-lg"
        onClick={(e) => e.stopPropagation()}
      />
      <div className="absolute top-4 right-4 flex gap-2">
        <Button
          size="icon"
          variant="ghost"
          className="text-white hover:bg-white/20"
          onClick={(e) => {
            e.stopPropagation();
            handleDownload();
          }}
          title="Baixar imagem"
        >
          <Download className="h-5 w-5" />
        </Button>
        <Button
          size="icon"
          variant="ghost"
          className="text-white hover:bg-white/20"
          onClick={onClose}
        >
          <X className="h-6 w-6" />
        </Button>
      </div>
    </div>
  );
}
