import React, { useCallback, useRef, useState, useEffect } from 'react';
import { X, Minus, Maximize2, Minimize2, GripVertical, Calculator } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useCalculadora } from '@/contexts/CalculadoraContext';
import { Button } from '@/components/ui/button';
import { CalculadoraProtecaoContent } from './CalculadoraProtecaoContent';

export const CalculadoraProtecaoPopup: React.FC = () => {
  const { isOpen, isMinimized, position, closeCalculadora, toggleMinimize, setPosition } = useCalculadora();
  const [isDragging, setIsDragging] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);
  const dragOffset = useRef({ x: 0, y: 0 });
  const containerRef = useRef<HTMLDivElement>(null);

  const handleMouseDown = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if ((e.target as HTMLElement).closest('button')) return;
    
    setIsDragging(true);
    dragOffset.current = {
      x: e.clientX - position.x,
      y: e.clientY - position.y,
    };
  }, [position]);

  const handleMouseMove = useCallback((e: MouseEvent) => {
    if (!isDragging) return;
    
    const newX = Math.max(0, Math.min(window.innerWidth - 500, e.clientX - dragOffset.current.x));
    const newY = Math.max(0, Math.min(window.innerHeight - 100, e.clientY - dragOffset.current.y));
    
    setPosition({ x: newX, y: newY });
  }, [isDragging, setPosition]);

  const handleMouseUp = useCallback(() => {
    setIsDragging(false);
  }, []);

  useEffect(() => {
    if (isDragging) {
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
      return () => {
        window.removeEventListener('mousemove', handleMouseMove);
        window.removeEventListener('mouseup', handleMouseUp);
      };
    }
  }, [isDragging, handleMouseMove, handleMouseUp]);

  // Ajustar posição inicial para não sair da tela
  useEffect(() => {
    if (isOpen && !isMinimized) {
      const maxX = window.innerWidth - 500;
      const maxY = window.innerHeight - 600;
      if (position.x > maxX || position.y > maxY) {
        setPosition({
          x: Math.min(position.x, Math.max(20, maxX)),
          y: Math.min(position.y, Math.max(20, maxY)),
        });
      }
    }
  }, [isOpen, isMinimized, position, setPosition]);

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

  // Versão expandida (tela cheia)
  if (isExpanded) {
    return (
      <div className="fixed inset-0 z-[9999] bg-background">
        <div className="flex flex-col h-full">
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-muted/30">
            <div className="flex items-center gap-3">
              <Calculator className="h-5 w-5 text-primary" />
              <h2 className="font-semibold text-foreground">Calculadora de Proteção Lay</h2>
            </div>
            <div className="flex items-center gap-1">
              <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setIsExpanded(false)}>
                <Minimize2 className="h-4 w-4" />
              </Button>
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

  // Versão janela flutuante
  return (
    <div
      ref={containerRef}
      className={cn(
        'fixed z-[9999] bg-background border border-border rounded-lg shadow-2xl flex flex-col',
        'w-[480px] h-[600px]',
        isDragging && 'cursor-grabbing select-none'
      )}
      style={{ top: position.y, left: position.x }}
    >
      {/* Header arrastável */}
      <div
        className="flex items-center justify-between px-4 py-3 border-b border-border bg-muted/30 rounded-t-lg cursor-grab"
        onMouseDown={handleMouseDown}
      >
        <div className="flex items-center gap-3">
          <GripVertical className="h-4 w-4 text-muted-foreground" />
          <Calculator className="h-5 w-5 text-primary" />
          <h2 className="font-semibold text-foreground text-sm">Calculadora de Proteção Lay</h2>
        </div>
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setIsExpanded(true)}>
            <Maximize2 className="h-3.5 w-3.5" />
          </Button>
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={toggleMinimize}>
            <Minus className="h-3.5 w-3.5" />
          </Button>
          <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:text-destructive" onClick={closeCalculadora}>
            <X className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>
      
      {/* Content */}
      <div className="flex-1 overflow-hidden">
        <CalculadoraProtecaoContent />
      </div>
    </div>
  );
};
