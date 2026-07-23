import { useState, useRef } from "react";
import { Plus, ChevronDown, ChevronRight } from "lucide-react";
import { FluxoCardComponent } from "./FluxoCardComponent";
import { FluxoCard } from "./types";
import { cn } from "@/lib/utils";
import { getColumnMeta, daysSince } from "./fluxoColumnMeta";

interface FluxoColunaProps {
  coluna: { id: string; nome: string; ordem: number };
  cards: FluxoCard[];
  onCreateCard: (colunaId: string) => Promise<string | null>;
  onUpdateCard: (cardId: string, conteudo: string) => Promise<void>;
  onMoveCard: (cardId: string, novaColunaId: string, novaOrdem: number) => Promise<void>;
  onDeleteCard: (cardId: string) => Promise<void>;
  draggingCardId: string | null;
  setDraggingCardId: (id: string | null) => void;
}

export function FluxoColuna({
  coluna,
  cards,
  onCreateCard,
  onUpdateCard,
  onMoveCard,
  onDeleteCard,
  draggingCardId,
  setDraggingCardId,
}: FluxoColunaProps) {
  const [isDragOver, setIsDragOver] = useState(false);
  const [newCardId, setNewCardId] = useState<string | null>(null);
  const [showArchived, setShowArchived] = useState(false);
  const dropRef = useRef<HTMLDivElement>(null);

  const meta = getColumnMeta(coluna.nome);
  const Icon = meta.icon;
  const isMuted = meta.variant === "muted";

  // Para coluna "Finalizado" (muted): itens com >30 dias vão para arquivo colapsado
  const ARCHIVE_THRESHOLD = 30;
  const activeCards = isMuted
    ? cards.filter((c) => daysSince(c.updated_at || c.created_at) < ARCHIVE_THRESHOLD)
    : cards;
  const archivedCards = isMuted
    ? cards.filter((c) => daysSince(c.updated_at || c.created_at) >= ARCHIVE_THRESHOLD)
    : [];

  // Ordenar cards por ordem
  const sortedCards = [...activeCards].sort((a, b) => a.ordem - b.ordem);
  const sortedArchived = [...archivedCards].sort((a, b) => b.ordem - a.ordem);

  const handleAddCard = async () => {
    const cardId = await onCreateCard(coluna.id);
    if (cardId) {
      setNewCardId(cardId);
      // Foco automático será feito pelo componente do card
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    if (draggingCardId) {
      setIsDragOver(true);
    }
  };

  const handleDragLeave = (e: React.DragEvent) => {
    // Verificar se realmente saiu da área
    if (dropRef.current && !dropRef.current.contains(e.relatedTarget as Node)) {
      setIsDragOver(false);
    }
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);

    if (!draggingCardId) return;

    // Calcular nova ordem (no final da coluna)
    const maxOrdem = cards.reduce((max, c) => Math.max(max, c.ordem), -1);
    await onMoveCard(draggingCardId, coluna.id, maxOrdem + 1);
    setDraggingCardId(null);
  };

  return (
    <div
      ref={dropRef}
      className={cn(
        "flex flex-col flex-1 min-w-0 rounded-xl transition-all duration-200",
        "bg-muted/20 border border-border/30",
        isDragOver && "ring-2 ring-primary/30 bg-muted/40",
        isMuted && "opacity-90"
      )}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {/* Header da coluna com ícone, contador e botão adicionar */}
      <div className="shrink-0 px-3 py-3 border-b border-border/20">
        <div className="flex items-center justify-center gap-2">
          <Icon
            className={cn(
              "h-3.5 w-3.5",
              meta.variant === "primary" && "text-primary",
              meta.variant === "accent" && "text-amber-500",
              meta.variant === "muted" && "text-muted-foreground",
              meta.variant === "neutral" && "text-foreground/60"
            )}
          />
          <h3
            className={cn(
            "text-xs font-medium tracking-tight uppercase truncate",
              meta.titleClass
            )}
          >
            {coluna.nome}
          </h3>
          <span
            className={cn(
              "inline-flex items-center justify-center min-w-[20px] h-5 px-1.5 rounded-full",
              "text-[10px] font-semibold border",
              meta.badgeClass,
              activeCards.length === 0 && "opacity-40"
            )}
          >
            {activeCards.length}
          </span>
        </div>

        {/* Botão adicionar - no topo, discreto */}
        <button
          onClick={handleAddCard}
          className={cn(
            "w-full flex items-center justify-center gap-1.5 py-1.5 mt-2 rounded-lg",
            "text-xs text-muted-foreground/60 hover:text-muted-foreground",
            "hover:bg-muted/30 transition-colors",
            "opacity-60 hover:opacity-100"
          )}
        >
          <Plus className="h-3 w-3" />
          <span>adicionar</span>
        </button>
      </div>

      {/* Lista de cards */}
      <div className="flex-1 overflow-y-auto p-3 space-y-3 min-h-[200px]">
        {sortedCards.length === 0 && (
          <div className="text-center text-xs text-muted-foreground/50 py-8 px-2">
            {meta.variant === "primary" && "Nenhuma ideia ainda. Capture pensamentos aqui."}
            {meta.variant === "accent" && "Nada em execução no momento."}
            {meta.variant === "muted" && "Nada concluído ainda."}
            {meta.variant === "neutral" && "Vazio."}
          </div>
        )}
        {sortedCards.map(card => (
          <FluxoCardComponent
            key={card.id}
            card={card}
            onUpdate={onUpdateCard}
            onDelete={onDeleteCard}
            onDragStart={() => setDraggingCardId(card.id)}
            onDragEnd={() => setDraggingCardId(null)}
            isDragging={draggingCardId === card.id}
            autoFocus={newCardId === card.id}
            onFocused={() => setNewCardId(null)}
          />
        ))}

        {/* Drop zone visual quando arrastando */}
        {isDragOver && draggingCardId && !cards.some(c => c.id === draggingCardId) && (
          <div className="h-24 rounded-lg border-2 border-dashed border-primary/30 bg-primary/5" />
        )}

        {/* Arquivo silencioso para Finalizado */}
        {sortedArchived.length > 0 && (
          <div className="pt-2 border-t border-border/20">
            <button
              type="button"
              onClick={() => setShowArchived((v) => !v)}
              className="w-full flex items-center gap-1.5 py-1.5 text-[11px] text-muted-foreground/60 hover:text-muted-foreground transition-colors"
            >
              {showArchived ? (
                <ChevronDown className="h-3 w-3" />
              ) : (
                <ChevronRight className="h-3 w-3" />
              )}
              <span>Ver arquivados ({sortedArchived.length})</span>
            </button>
            {showArchived && (
              <div className="space-y-3 mt-2 opacity-70">
                {sortedArchived.map((card) => (
                  <FluxoCardComponent
                    key={card.id}
                    card={card}
                    onUpdate={onUpdateCard}
                    onDelete={onDeleteCard}
                    onDragStart={() => setDraggingCardId(card.id)}
                    onDragEnd={() => setDraggingCardId(null)}
                    isDragging={draggingCardId === card.id}
                  />
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
