import React, { useCallback, useRef, useState, useEffect, ReactNode } from 'react';
import { X, Minus, Maximize2, Minimize2, GripVertical, GripHorizontal, SquareArrowOutUpRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';

interface ApostaPopupWrapperProps {
  isOpen: boolean;
  isMinimized: boolean;
  position: { x: number; y: number };
  onClose: () => void;
  onToggleMinimize: () => void;
  onPositionChange: (pos: { x: number; y: number }) => void;
  title: string;
  icon: ReactNode;
  minimizedIcon: ReactNode;
  children: ReactNode;
  defaultWidth?: number;
  defaultHeight?: number;
  minWidth?: number;
  minHeight?: number;
  storageKey?: string;
  externalUrl?: string;
}

export const ApostaPopupWrapper: React.FC<ApostaPopupWrapperProps> = ({
  isOpen,
  isMinimized,
  position,
  onClose,
  onToggleMinimize,
  onPositionChange,
  title,
  icon,
  minimizedIcon,
  children,
  defaultWidth = 850,
  defaultHeight = 700,
  minWidth = 500,
  minHeight = 400,
  storageKey,
  externalUrl,
}) => {
  const [isDragging, setIsDragging] = useState(false);
  const [isResizing, setIsResizing] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);
  const [size, setSize] = useState({ width: defaultWidth, height: defaultHeight });
  const dragOffset = useRef({ x: 0, y: 0 });
  const resizeStart = useRef({ x: 0, y: 0, width: 0, height: 0 });
  const containerRef = useRef<HTMLDivElement>(null);

  // Abrir em nova janela externa (popup do navegador)
  const handleOpenInNewWindow = () => {
    if (!externalUrl) return;
    
    const width = 1000;
    const height = 800;
    const left = Math.max(0, (window.screen.width - width) / 2);
    const top = Math.max(0, (window.screen.height - height) / 2);
    
    const popup = window.open(
      externalUrl,
      '_blank',
      `width=${width},height=${height},left=${left},top=${top},resizable=yes,scrollbars=yes`
    );
    
    if (popup) {
      popup.focus();
      onClose();
    }
  };

  // Carregar tamanho salvo do localStorage
  useEffect(() => {
    if (!storageKey) return;
    
    const savedSize = localStorage.getItem(storageKey);
    if (savedSize) {
      try {
        const parsed = JSON.parse(savedSize);
        setSize({
          width: Math.max(minWidth, Math.min(parsed.width, window.innerWidth * 0.95)),
          height: Math.max(minHeight, Math.min(parsed.height, window.innerHeight * 0.9)),
        });
      } catch {
        // Ignora erro de parse
      }
    }
  }, [storageKey, minWidth, minHeight]);

  // Salvar tamanho no localStorage
  useEffect(() => {
    if (!storageKey || isResizing || size.width === defaultWidth) return;
    localStorage.setItem(storageKey, JSON.stringify(size));
  }, [size, isResizing, storageKey, defaultWidth]);

  // Auto-expandir em telas pequenas (mobile)
  useEffect(() => {
    if (isOpen && !isMinimized && window.innerWidth < 768) {
      setIsExpanded(true);
    }
  }, [isOpen, isMinimized]);

  // Drag handlers
  const handleMouseDown = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if ((e.target as HTMLElement).closest('button')) return;
    
    setIsDragging(true);
    dragOffset.current = {
      x: e.clientX - position.x,
      y: e.clientY - position.y,
    };
  }, [position]);

  const handleMouseMove = useCallback((e: MouseEvent) => {
    if (isDragging) {
      const newX = Math.max(0, Math.min(window.innerWidth - size.width, e.clientX - dragOffset.current.x));
      const newY = Math.max(0, Math.min(window.innerHeight - 100, e.clientY - dragOffset.current.y));
      onPositionChange({ x: newX, y: newY });
    }
    
    if (isResizing) {
      const deltaX = e.clientX - resizeStart.current.x;
      const deltaY = e.clientY - resizeStart.current.y;
      
      const maxWidth = window.innerWidth * 0.95;
      const maxHeight = window.innerHeight * 0.9;
      
      setSize({
        width: Math.max(minWidth, Math.min(maxWidth, resizeStart.current.width + deltaX)),
        height: Math.max(minHeight, Math.min(maxHeight, resizeStart.current.height + deltaY)),
      });
    }
  }, [isDragging, isResizing, size.width, onPositionChange, minWidth, minHeight]);

  const handleMouseUp = useCallback(() => {
    setIsDragging(false);
    setIsResizing(false);
  }, []);

  // Resize handler
  const handleResizeMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsResizing(true);
    resizeStart.current = {
      x: e.clientX,
      y: e.clientY,
      width: size.width,
      height: size.height,
    };
  }, [size]);

  useEffect(() => {
    if (isDragging || isResizing) {
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
      return () => {
        window.removeEventListener('mousemove', handleMouseMove);
        window.removeEventListener('mouseup', handleMouseUp);
      };
    }
  }, [isDragging, isResizing, handleMouseMove, handleMouseUp]);

  // Ajustar posição inicial para não sair da tela
  useEffect(() => {
    if (isOpen && !isMinimized && !isExpanded) {
      const maxX = window.innerWidth - size.width;
      const maxY = window.innerHeight - size.height;
      if (position.x > maxX || position.y > maxY) {
        onPositionChange({
          x: Math.min(position.x, Math.max(20, maxX)),
          y: Math.min(position.y, Math.max(20, maxY)),
        });
      }
    }
  }, [isOpen, isMinimized, isExpanded, position, size, onPositionChange]);

  if (!isOpen) return null;

  // Versão minimizada - ícone flutuante
  if (isMinimized) {
    return (
      <div
        ref={containerRef}
        className="fixed z-[9999] cursor-move"
        style={{ top: position.y, left: position.x }}
        onMouseDown={handleMouseDown}
      >
        <Button
          onClick={onToggleMinimize}
          className="h-14 w-14 rounded-full shadow-lg bg-primary hover:bg-primary/90"
        >
          {minimizedIcon}
        </Button>
      </div>
    );
  }

  // Botão de ação externa
  const ExternalWindowButton = ({ size: btnSize = 'sm' }: { size?: 'sm' | 'default' }) => (
    externalUrl ? (
      <Button 
        variant="ghost" 
        size="icon" 
        className={btnSize === 'sm' ? 'h-7 w-7' : 'h-8 w-8'}
        onClick={handleOpenInNewWindow}
        title="Abrir em janela externa"
      >
        <SquareArrowOutUpRight className={btnSize === 'sm' ? 'h-3.5 w-3.5' : 'h-4 w-4'} />
      </Button>
    ) : null
  );

  // Versão expandida (tela cheia interna)
  if (isExpanded) {
    return (
      <div className="fixed inset-0 z-[9999] bg-background">
        <div className="flex flex-col h-full">
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-muted/30">
            <div className="flex items-center gap-3">
              {icon}
              <h2 className="font-semibold text-foreground">{title}</h2>
            </div>
            <div className="flex items-center gap-1">
              <ExternalWindowButton size="default" />
              {/* Só mostra botão de sair do fullscreen se não for mobile */}
              {window.innerWidth >= 768 && (
                <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setIsExpanded(false)}>
                  <Minimize2 className="h-4 w-4" />
                </Button>
              )}
              <Button variant="ghost" size="icon" className="h-8 w-8" onClick={onToggleMinimize}>
                <Minus className="h-4 w-4" />
              </Button>
              <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:text-destructive" onClick={onClose}>
                <X className="h-4 w-4" />
              </Button>
            </div>
          </div>
          
          {/* Content */}
          <div className="flex-1 overflow-hidden">
            {children}
          </div>
        </div>
      </div>
    );
  }

  // Versão janela flutuante redimensionável (modal interno)
  return (
    <div
      ref={containerRef}
      className={cn(
        'fixed z-[9999] bg-background border border-border rounded-lg shadow-2xl flex flex-col',
        (isDragging || isResizing) && 'select-none',
        isDragging && 'cursor-grabbing'
      )}
      style={{ 
        top: position.y, 
        left: position.x,
        width: size.width,
        height: size.height,
        maxWidth: '95vw',
        maxHeight: '90vh',
      }}
    >
      {/* Header arrastável */}
      <div
        className="flex items-center justify-between px-4 py-3 border-b border-border bg-muted/30 rounded-t-lg cursor-grab shrink-0"
        onMouseDown={handleMouseDown}
      >
        <div className="flex items-center gap-3">
          <GripVertical className="h-4 w-4 text-muted-foreground" />
          {icon}
          <h2 className="font-semibold text-foreground text-sm">{title}</h2>
        </div>
        <div className="flex items-center gap-1">
          <ExternalWindowButton />
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setIsExpanded(true)} title="Tela cheia">
            <Maximize2 className="h-3.5 w-3.5" />
          </Button>
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onToggleMinimize} title="Minimizar">
            <Minus className="h-3.5 w-3.5" />
          </Button>
          <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:text-destructive" onClick={onClose} title="Fechar">
            <X className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>
      
      {/* Content */}
      <div className="flex-1 overflow-hidden min-h-0">
        {children}
      </div>

      {/* Resize handle */}
      <div
        className="absolute bottom-0 right-0 w-6 h-6 cursor-se-resize flex items-center justify-center"
        onMouseDown={handleResizeMouseDown}
      >
        <GripHorizontal className="h-4 w-4 text-muted-foreground/50 rotate-[-45deg]" />
      </div>
    </div>
  );
};
