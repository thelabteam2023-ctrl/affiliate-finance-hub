import { useState, useRef, useEffect, useCallback } from "react";
import { Trash2, Loader2, Image as ImageIcon, Wand2 } from "lucide-react";
import { FluxoCard } from "./types";
import { cn } from "@/lib/utils";
import { FluxoCardDetailDialog } from "./FluxoCardDetailDialog";
import { ContentRenderer } from "./ContentRenderer";
import { useImageUpload } from "@/hooks/useImageUpload";
import { useAuth } from "@/hooks/useAuth";
import { InsertCopyableDialog } from "./InsertCopyableDialog";

// Cores suaves estilo post-it para dark mode
const CARD_COLORS = [
  "bg-amber-900/20 border-amber-700/30",
  "bg-sky-900/20 border-sky-700/30",
  "bg-emerald-900/20 border-emerald-700/30",
  "bg-violet-900/20 border-violet-700/30",
  "bg-rose-900/20 border-rose-700/30",
];

function getCardColor(id: string): string {
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
  const { user } = useAuth();
  const [localContent, setLocalContent] = useState(card.conteudo);
  const [isEditing, setIsEditing] = useState(false);
  const [showDetail, setShowDetail] = useState(false);
  const [copyDialogOpen, setCopyDialogOpen] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const cardColor = getCardColor(card.id);

  // Debounced save
  const debouncedSave = useCallback(
    (content: string) => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }
      saveTimeoutRef.current = setTimeout(() => {
        if (content !== card.conteudo) {
          onUpdate(card.id, content);
        }
      }, 500);
    },
    [card.id, card.conteudo, onUpdate]
  );

  // Hook de upload de imagem
  const { isUploading, handlePaste, handleDrop, handleDragOver } = useImageUpload({
    userId: user?.id || "",
    onImageUploaded: (imageUrl) => {
      const textarea = textareaRef.current;
      if (textarea) {
        const start = textarea.selectionStart;
        const end = textarea.selectionEnd;
        const newContent =
          localContent.slice(0, start) +
          `![imagem](${imageUrl})` +
          localContent.slice(end);
        setLocalContent(newContent);
        debouncedSave(newContent);
      } else {
        const newContent = localContent + `![imagem](${imageUrl})`;
        setLocalContent(newContent);
        debouncedSave(newContent);
      }
    },
  });

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
    if (!(e.target as HTMLElement).closest("textarea")) {
      setShowDetail(true);
    }
  };

  // Handler para drop de arquivos no card
  const handleCardDrop = async (e: React.DragEvent) => {
    if (e.dataTransfer?.types?.includes("Files")) {
      await handleDrop(e);
      e.stopPropagation();
    }
  };

  const handleCardDragOver = (e: React.DragEvent) => {
    if (e.dataTransfer?.types?.includes("Files")) {
      handleDragOver(e);
    }
  };

  // Inserir snippet copiável no cursor
  const insertAtCursor = (snippet: string) => {
    const textarea = textareaRef.current;
    const start = textarea?.selectionStart ?? localContent.length;
    const end = textarea?.selectionEnd ?? localContent.length;
    const before = localContent.slice(0, start);
    const after = localContent.slice(end);
    const next = before + snippet + after;
    setLocalContent(next);
    debouncedSave(next);
    requestAnimationFrame(() => {
      const t = textareaRef.current;
      if (!t) return;
      const pos = before.length + snippet.length;
      t.focus();
      t.setSelectionRange(pos, pos);
    });
  };

  return (
    <>
      <div
        draggable={!isEditing && !autoFocus}
        onDragStart={handleDragStart}
        onDragEnd={onDragEnd}
        onClick={handleCardClick}
        onDragOver={handleCardDragOver}
        onDrop={handleCardDrop}
        className={cn(
          "group relative rounded-lg border p-3 cursor-grab active:cursor-grabbing",
          "min-w-0 max-w-full overflow-hidden",
          "transition-all duration-200",
          "shadow-sm hover:shadow-md",
          cardColor,
          isDragging && "opacity-50 scale-95"
        )}
      >
        {/* Botão deletar */}
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
        <div className="min-h-[60px] min-w-0 max-w-full">
          {isEditing || autoFocus ? (
            <div className="relative">
              <textarea
                ref={textareaRef}
                value={localContent}
                onChange={handleChange}
                onBlur={handleBlur}
                onFocus={handleFocus}
                onPaste={handlePaste}
                onDrop={handleDrop}
                onDragOver={handleDragOver}
                placeholder="Escreva sua ideia... (cole ou arraste imagens)"
                className={cn(
                  "w-full bg-transparent border-none resize-none outline-none",
                  "[overflow-wrap:anywhere] break-words",
                  "text-sm text-foreground/90 leading-relaxed",
                  "placeholder:text-muted-foreground/40"
                )}
                rows={3}
                autoFocus={autoFocus}
              />
              {isUploading && (
                <div className="absolute inset-0 flex items-center justify-center bg-background/50 rounded">
                  <Loader2 className="h-4 w-4 animate-spin text-primary" />
                </div>
              )}
            </div>
          ) : (
            <div className="text-sm text-foreground/90 leading-relaxed min-w-0 max-w-full">
              <ContentRenderer content={localContent} compact />
            </div>
          )}
        </div>

        {/* Toolbar de inserção (modo edição) */}
        {(isEditing || autoFocus) && !isUploading && (
          <div
            className="flex items-center gap-1 mt-1 opacity-60 group-hover:opacity-100 transition-opacity"
            onMouseDown={(e) => e.preventDefault()}
          >
            <button
              type="button"
              onClick={() => setCopyDialogOpen(true)}
              className="inline-flex items-center gap-1 text-[10px] text-muted-foreground/80 hover:text-foreground hover:bg-muted/40 px-1.5 py-0.5 rounded border border-border/30"
              title="Adicionar valor copiável (token, proxy, URL, IP…)"
            >
              <Wand2 className="h-2.5 w-2.5" /> Dado copiável
            </button>
            <div className="flex items-center gap-1 ml-auto">
              <ImageIcon className="h-2.5 w-2.5 text-muted-foreground/60" />
              <span className="text-[9px] text-muted-foreground/60">Cole imagens</span>
            </div>
          </div>
        )}
      </div>

      {/* Dialog de detalhes */}
      <FluxoCardDetailDialog
        card={card}
        open={showDetail}
        onOpenChange={setShowDetail}
        onUpdate={onUpdate}
      />

      <InsertCopyableDialog
        open={copyDialogOpen}
        onOpenChange={setCopyDialogOpen}
        onInsert={insertAtCursor}
      />
    </>
  );
}
