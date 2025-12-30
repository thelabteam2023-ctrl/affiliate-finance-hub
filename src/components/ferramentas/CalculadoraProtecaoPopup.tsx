import React, { useCallback, useRef, useState, useEffect } from 'react';
import { X, Minus, Maximize2, Minimize2, GripVertical, Calculator, GripHorizontal, ExternalLink, SquareArrowOutUpRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useCalculadora } from '@/contexts/CalculadoraContext';
import { Button } from '@/components/ui/button';
import { CalculadoraProtecaoContent } from './CalculadoraProtecaoContent';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

const MIN_WIDTH = 400;
const MIN_HEIGHT = 400;
const DEFAULT_WIDTH = 720;
const DEFAULT_HEIGHT = 600;
const EXTERNAL_URL = '/ferramentas/protecao-progressiva';

export const CalculadoraProtecaoPopup: React.FC = () => {
  const { isOpen, isMinimized, position, closeCalculadora, toggleMinimize, setPosition } = useCalculadora();
  const [isDragging, setIsDragging] = useState(false);
  const [isResizing, setIsResizing] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);
  const [size, setSize] = useState({ width: DEFAULT_WIDTH, height: DEFAULT_HEIGHT });
  const dragOffset = useRef({ x: 0, y: 0 });
  const resizeStart = useRef({ x: 0, y: 0, width: 0, height: 0 });
  const containerRef = useRef<HTMLDivElement>(null);

  // Abrir em nova aba
  const handleOpenInNewTab = () => {
    window.open(EXTERNAL_URL, '_blank');
    closeCalculadora();
  };

  // Abrir em nova janela externa (popup)
  const handleOpenInNewWindow = () => {
    const width = 800;
    const height = 700;
    const left = (window.screen.width - width) / 2;
    const top = (window.screen.height - height) / 2;
    
    window.open(
      EXTERNAL_URL,
      'ProtecaoProgressiva',
      `width=${width},height=${height},left=${left},top=${top},resizable=yes,scrollbars=yes,status=no,menubar=no,toolbar=no,location=no`
    );
    closeCalculadora();
  };

  // Carregar tamanho salvo do localStorage
  useEffect(() => {
    const savedSize = localStorage.getItem('calculadora-protecao-size');
    if (savedSize) {
      try {
        const parsed = JSON.parse(savedSize);
        setSize({
          width: Math.max(MIN_WIDTH, Math.min(parsed.width, window.innerWidth * 0.95)),
          height: Math.max(MIN_HEIGHT, Math.min(parsed.height, window.innerHeight * 0.9)),
        });
      } catch {
        // Ignora erro de parse
      }
    }
  }, []);

  // Salvar tamanho no localStorage
  useEffect(() => {
    if (!isResizing && size.width !== DEFAULT_WIDTH) {
      localStorage.setItem('calculadora-protecao-size', JSON.stringify(size));
    }
  }, [size, isResizing]);

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
      setPosition({ x: newX, y: newY });
    }
    
    if (isResizing) {
      const deltaX = e.clientX - resizeStart.current.x;
      const deltaY = e.clientY - resizeStart.current.y;
      
      const maxWidth = window.innerWidth * 0.95;
      const maxHeight = window.innerHeight * 0.9;
      
      setSize({
        width: Math.max(MIN_WIDTH, Math.min(maxWidth, resizeStart.current.width + deltaX)),
        height: Math.max(MIN_HEIGHT, Math.min(maxHeight, resizeStart.current.height + deltaY)),
      });
    }
  }, [isDragging, isResizing, size.width, setPosition]);

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
        setPosition({
          x: Math.min(position.x, Math.max(20, maxX)),
          y: Math.min(position.y, Math.max(20, maxY)),
        });
      }
    }
  }, [isOpen, isMinimized, isExpanded, position, size, setPosition]);

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
          onClick={toggleMinimize}
          className="h-14 w-14 rounded-full shadow-lg bg-primary hover:bg-primary/90"
        >
          <Calculator className="h-6 w-6" />
        </Button>
      </div>
    );
  }

  // Botões de ação externa (compartilhados entre versões)
  const ExternalActionsButtons = () => (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="h-7 w-7" title="Abrir externamente">
          <ExternalLink className="h-3.5 w-3.5" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="z-[10000]">
        <DropdownMenuItem onClick={handleOpenInNewTab} className="gap-2 cursor-pointer">
          <ExternalLink className="h-4 w-4" />
          Abrir em nova aba
        </DropdownMenuItem>
        <DropdownMenuItem onClick={handleOpenInNewWindow} className="gap-2 cursor-pointer">
          <SquareArrowOutUpRight className="h-4 w-4" />
          Abrir em janela externa
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );

  // Versão expandida (tela cheia interna)
  if (isExpanded) {
    return (
      <div className="fixed inset-0 z-[9999] bg-background">
        <div className="flex flex-col h-full">
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-muted/30">
            <div className="flex items-center gap-3">
              <Calculator className="h-5 w-5 text-primary" />
              <h2 className="font-semibold text-foreground">Proteção Progressiva</h2>
            </div>
            <div className="flex items-center gap-1">
              <ExternalActionsButtons />
              {/* Só mostra botão de sair do fullscreen se não for mobile */}
              {window.innerWidth >= 768 && (
                <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setIsExpanded(false)}>
                  <Minimize2 className="h-4 w-4" />
                </Button>
              )}
              <Button variant="ghost" size="icon" className="h-8 w-8" onClick={toggleMinimize}>
                <Minus className="h-4 w-4" />
              </Button>
              <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:text-destructive" onClick={closeCalculadora}>
                <X className="h-4 w-4" />
              </Button>
            </div>
          </div>
          
          {/* Content */}
          <div className="flex-1 overflow-hidden">
            <CalculadoraProtecaoContent />
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
          <Calculator className="h-5 w-5 text-primary" />
          <h2 className="font-semibold text-foreground text-sm">Proteção Progressiva</h2>
        </div>
        <div className="flex items-center gap-1">
          <ExternalActionsButtons />
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setIsExpanded(true)} title="Tela cheia">
            <Maximize2 className="h-3.5 w-3.5" />
          </Button>
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={toggleMinimize} title="Minimizar">
            <Minus className="h-3.5 w-3.5" />
          </Button>
          <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:text-destructive" onClick={closeCalculadora} title="Fechar">
            <X className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>
      
      {/* Content */}
      <div className="flex-1 overflow-hidden min-h-0">
        <CalculadoraProtecaoContent />
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
