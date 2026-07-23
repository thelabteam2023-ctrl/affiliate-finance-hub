import { useState } from "react";
import { Loader2 } from "lucide-react";
import { FluxoColuna } from "./FluxoColuna";
import { FluxoResumoBar } from "./FluxoResumoBar";
import { useNotesData } from "@/hooks/useNotesData";

/**
 * Aba Fluxo - Kanban pessoal minimalista
 * 
 * Cada usuário possui suas próprias colunas e cards.
 * Drag & drop entre colunas, autosave, histórico de versões.
 */
export function FluxoTab() {
  const { 
    colunas, 
    cards, 
    loading, 
    handleCreateCard, 
    handleUpdateCard, 
    handleMoveCard, 
    handleDeleteCard,
    canOperate 
  } = useNotesData();
  
  const [draggingCardId, setDraggingCardId] = useState<string | null>(null);
  const [focusedColumnId, setFocusedColumnId] = useState<string | null>(null);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!canOperate) {
    return (
      <div className="flex items-center justify-center h-full text-muted-foreground">
        Selecione um workspace para continuar.
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col min-h-0">
      <FluxoResumoBar
        colunas={colunas}
        cards={cards}
        activeColumnId={focusedColumnId}
        onSelectColumn={(id) => {
          setFocusedColumnId(id);
          const el = document.getElementById(`fluxo-coluna-${id}`);
          el?.scrollIntoView({ behavior: "smooth", inline: "center", block: "nearest" });
        }}
      />
      <div className="flex-1 min-h-0 overflow-x-auto no-scrollbar px-6 pb-6">
        <div className="flex gap-4 h-full w-full">
          {colunas.map(coluna => (
            <div key={coluna.id} id={`fluxo-coluna-${coluna.id}`} className="flex flex-1 min-w-[260px] min-w-0">
              <FluxoColuna
                coluna={coluna}
                cards={cards.filter(c => c.coluna_id === coluna.id)}
                onCreateCard={() => handleCreateCard(coluna.id, "")}
                onUpdateCard={handleUpdateCard}
                onMoveCard={handleMoveCard}
                onDeleteCard={handleDeleteCard}
                draggingCardId={draggingCardId}
                setDraggingCardId={setDraggingCardId}
              />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
