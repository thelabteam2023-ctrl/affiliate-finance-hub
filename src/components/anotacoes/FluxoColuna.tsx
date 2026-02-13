import { useState, useRef } from "react";
import { Plus } from "lucide-react";
import { FluxoCardComponent } from "./FluxoCardComponent";
import { FluxoCard } from "./types";
import { cn } from "@/lib/utils";

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
  const dropRef = useRef<HTMLDivElement>(null);

  // Ordenar cards por ordem
  const sortedCards = [...cards].sort((a, b) => a.ordem - b.ordem);

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
        "flex flex-col w-[420px] shrink-0 rounded-xl transition-all duration-200",
        "bg-muted/20 border border-border/30",
        isDragOver && "ring-2 ring-primary/30 bg-muted/40"
      )}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {/* Header da coluna com botão adicionar */}
      <div className="shrink-0 px-3 py-3 border-b border-border/20">
        <h3 className="text-sm font-medium text-foreground/80 tracking-tight uppercase text-center">
          {coluna.nome}
        </h3>
        
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
      </div>
    </div>
  );
}
