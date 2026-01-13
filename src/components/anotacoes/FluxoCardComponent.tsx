import { useState, useRef, useEffect, useCallback } from "react";
import { Trash2 } from "lucide-react";
import { FluxoCard } from "./types";
import { cn } from "@/lib/utils";
import { FluxoCardDetailDialog } from "./FluxoCardDetailDialog";

// Cores suaves estilo post-it para dark mode
const CARD_COLORS = [
  "bg-amber-900/20 border-amber-700/30",
  "bg-sky-900/20 border-sky-700/30",
  "bg-emerald-900/20 border-emerald-700/30",
  "bg-violet-900/20 border-violet-700/30",
  "bg-rose-900/20 border-rose-700/30",
];

function getCardColor(id: string): string {
  // Usar hash do ID para cor consistente
  let hash = 0;
  for (let i = 0; i < id.length; i++) {
    hash = id.charCodeAt(i) + ((hash << 5) - hash);
  }
  return CARD_COLORS[Math.abs(hash) % CARD_COLORS.length];
}

interface FluxoCardComponentProps {
  card: FluxoCard;
  onUpdate: (cardId: string, conteudo: string) => Promise<void>;
  onDelete: (cardId: string) => Promise<void>;
  onDragStart: () => void;
  onDragEnd: () => void;
  isDragging: boolean;
  autoFocus?: boolean;
  onFocused?: () => void;
}

export function FluxoCardComponent({
  card,
  onUpdate,
  onDelete,
  onDragStart,
  onDragEnd,
  isDragging,
  autoFocus,
  onFocused,
}: FluxoCardComponentProps) {
  const [localContent, setLocalContent] = useState(card.conteudo);
  const [isEditing, setIsEditing] = useState(false);
  const [showDetail, setShowDetail] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const cardColor = getCardColor(card.id);

  // Sincronizar conteúdo externo
  useEffect(() => {
    if (!isEditing) {
      setLocalContent(card.conteudo);
    }
  }, [card.conteudo, isEditing]);

  // Auto focus para novos cards
  useEffect(() => {
    if (autoFocus && textareaRef.current) {
      textareaRef.current.focus();
      setIsEditing(true);
      onFocused?.();
    }
  }, [autoFocus, onFocused]);

  // Debounced save
  const debouncedSave = useCallback((content: string) => {
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
    }
    saveTimeoutRef.current = setTimeout(() => {
      if (content !== card.conteudo) {
        onUpdate(card.id, content);
      }
    }, 500);
  }, [card.id, card.conteudo, onUpdate]);

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }
    };
  }, []);

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const value = e.target.value;
    setLocalContent(value);
    debouncedSave(value);
  };

  const handleBlur = () => {
    setIsEditing(false);
    // Salvar imediatamente ao sair
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
    }
    if (localContent !== card.conteudo) {
      onUpdate(card.id, localContent);
    }
  };

  const handleFocus = () => {
    setIsEditing(true);
  };

  const handleDragStart = (e: React.DragEvent) => {
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", card.id);
    onDragStart();
  };

  const handleCardClick = (e: React.MouseEvent) => {
    // Se clicar fora do textarea, abrir detalhes
    if (!(e.target as HTMLElement).closest("textarea")) {
      setShowDetail(true);
    }
  };

  // Renderizar #tags e @projeto com destaque
  const renderContent = () => {
    if (isEditing) return null; // Durante edição, mostrar textarea
    
    if (!localContent.trim()) {
      return (
        <span className="text-muted-foreground/50 text-xs italic">
          clique para escrever...
        </span>
      );
    }

    // Highlight #tags e @projeto
    const parts = localContent.split(/(#\w+|@\w+)/g);
    return parts.map((part, i) => {
      if (part.startsWith("#")) {
        return (
          <span key={i} className="text-sky-400/80 font-medium">
            {part}
          </span>
        );
      }
      if (part.startsWith("@")) {
        return (
          <span key={i} className="text-violet-400/80 font-medium">
            {part}
          </span>
        );
      }
      return <span key={i}>{part}</span>;
    });
  };

  return (
    <>
      <div
        draggable
        onDragStart={handleDragStart}
        onDragEnd={onDragEnd}
        onClick={handleCardClick}
        className={cn(
          "group relative rounded-lg border p-3 cursor-grab active:cursor-grabbing",
          "transition-all duration-200",
          "shadow-sm hover:shadow-md",
          cardColor,
          isDragging && "opacity-50 scale-95"
        )}
      >
        {/* Botão deletar - aparece no hover */}
        <button
          onClick={(e) => {
            e.stopPropagation();
            onDelete(card.id);
          }}
          className={cn(
            "absolute -top-1.5 -right-1.5 p-1 rounded-full",
            "bg-background/80 border border-border/50 shadow-sm",
            "opacity-0 group-hover:opacity-100 transition-opacity",
            "hover:bg-destructive/10 hover:text-destructive hover:border-destructive/30"
          )}
        >
          <Trash2 className="h-3 w-3" />
        </button>

        {/* Área de conteúdo */}
        <div className="min-h-[60px]">
          {isEditing || autoFocus ? (
            <textarea
              ref={textareaRef}
              value={localContent}
              onChange={handleChange}
              onBlur={handleBlur}
              onFocus={handleFocus}
              placeholder="Escreva sua ideia..."
              className={cn(
                "w-full bg-transparent border-none resize-none outline-none",
                "text-sm text-foreground/90 leading-relaxed",
                "placeholder:text-muted-foreground/40"
              )}
              rows={3}
              autoFocus={autoFocus}
            />
          ) : (
            <div 
              className="text-sm text-foreground/90 leading-relaxed whitespace-pre-wrap break-words"
              onClick={() => textareaRef.current?.focus()}
            >
              {renderContent()}
            </div>
          )}
        </div>
      </div>

      {/* Dialog de detalhes */}
      <FluxoCardDetailDialog
        card={card}
        open={showDetail}
        onOpenChange={setShowDetail}
        onUpdate={onUpdate}
      />
    </>
  );
}
