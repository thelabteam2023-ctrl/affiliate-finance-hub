import { useState, useCallback, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { ProjetoKanbanCard } from "./ProjetoKanbanCard";
import { cn } from "@/lib/utils";

interface SaldoByMoeda {
  BRL: number;
  USD: number;
}

interface Projeto {
  id: string;
  nome: string;
  descricao?: string | null;
  status: string;
  data_inicio: string | null;
  data_fim_prevista: string | null;
  orcamento_inicial: number;
  operadores_ativos?: number;
  total_bookmakers?: number;
  saldo_bookmakers_by_moeda?: SaldoByMoeda;
  lucro_by_moeda?: SaldoByMoeda;
  perdas_confirmadas?: number;
  display_order?: number;
}

interface ProjetosKanbanViewProps {
  projetos: Projeto[];
  cotacaoUSD: number;
  isFavorite: (id: string) => boolean;
  toggleFavorite: (id: string) => void;
  onVisualizarOperadores: (projeto: Projeto) => void;
  onEdit: (projeto: Projeto) => void;
  onDelete: (projeto: Projeto) => void;
  canEdit: boolean;
  canDelete: boolean;
  onReorder: (projetos: Projeto[]) => void;
}

export function ProjetosKanbanView({
  projetos,
  cotacaoUSD,
  isFavorite,
  toggleFavorite,
  onVisualizarOperadores,
  onEdit,
  onDelete,
  canEdit,
  canDelete,
  onReorder,
}: ProjetosKanbanViewProps) {
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Ordenar por display_order
  const sortedProjetos = [...projetos].sort((a, b) => 
    (a.display_order || 0) - (b.display_order || 0)
  );

  const handleDragStart = useCallback((projetoId: string) => {
    setDraggingId(projetoId);
  }, []);

  const handleDragEnd = useCallback(() => {
    setDraggingId(null);
    setDragOverIndex(null);
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent, index: number) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    setDragOverIndex(index);
  }, []);

  const handleDragLeave = useCallback(() => {
    setDragOverIndex(null);
  }, []);

  const handleDrop = useCallback(async (e: React.DragEvent, dropIndex: number) => {
    e.preventDefault();
    const draggedId = e.dataTransfer.getData("projetoId");
    
    if (!draggedId) return;
    
    const draggedIndex = sortedProjetos.findIndex(p => p.id === draggedId);
    if (draggedIndex === -1 || draggedIndex === dropIndex) {
      handleDragEnd();
      return;
    }

    // Reordenar array
    const newOrder = [...sortedProjetos];
    const [removed] = newOrder.splice(draggedIndex, 1);
    newOrder.splice(dropIndex, 0, removed);

    // Atualizar display_order para cada item
    const updatedProjetos = newOrder.map((proj, index) => ({
      ...proj,
      display_order: index,
    }));

    // Atualizar estado local imediatamente
    onReorder(updatedProjetos);
    handleDragEnd();

    // Persistir no banco
    try {
      const updates = updatedProjetos.map(p => ({
        id: p.id,
        display_order: p.display_order,
      }));

      // Batch update usando Promise.all
      await Promise.all(
        updates.map(({ id, display_order }) =>
          supabase
            .from("projetos")
            .update({ display_order })
            .eq("id", id)
        )
      );
    } catch (error) {
      console.error("Erro ao salvar ordem:", error);
      toast.error("Erro ao salvar a nova ordem dos projetos");
    }
  }, [sortedProjetos, onReorder, handleDragEnd]);

  return (
    <div ref={containerRef} className="w-full">
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {sortedProjetos.map((projeto, index) => (
          <div
            key={projeto.id}
            className={cn(
              "relative transition-all duration-200",
              dragOverIndex === index && draggingId && draggingId !== projeto.id && "ring-2 ring-primary ring-offset-2 rounded-lg"
            )}
            onDragOver={(e) => handleDragOver(e, index)}
            onDragLeave={handleDragLeave}
            onDrop={(e) => handleDrop(e, index)}
          >
            <ProjetoKanbanCard
              projeto={projeto}
              cotacaoUSD={cotacaoUSD}
              isFavorite={isFavorite(projeto.id)}
              onToggleFavorite={() => toggleFavorite(projeto.id)}
              onVisualizarOperadores={() => onVisualizarOperadores(projeto)}
              onEdit={() => onEdit(projeto)}
              onDelete={() => onDelete(projeto)}
              canEdit={canEdit}
              canDelete={canDelete}
              isDragging={draggingId === projeto.id}
              onDragStart={() => handleDragStart(projeto.id)}
              onDragEnd={handleDragEnd}
            />
          </div>
        ))}
        
        {/* Drop zone at the end */}
        {sortedProjetos.length > 0 && draggingId && (
          <div
            className={cn(
              "min-h-[200px] rounded-lg border-2 border-dashed transition-all duration-200 flex items-center justify-center",
              dragOverIndex === sortedProjetos.length 
                ? "border-primary bg-primary/5" 
                : "border-muted-foreground/20"
            )}
            onDragOver={(e) => handleDragOver(e, sortedProjetos.length)}
            onDragLeave={handleDragLeave}
            onDrop={(e) => handleDrop(e, sortedProjetos.length)}
          >
            <span className="text-sm text-muted-foreground">Soltar aqui</span>
          </div>
        )}
      </div>
    </div>
  );
}
