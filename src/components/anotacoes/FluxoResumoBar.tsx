import { cn } from "@/lib/utils";
import { FluxoCard } from "./types";
import { getColumnMeta, isRecent } from "./fluxoColumnMeta";

interface FluxoResumoBarProps {
  colunas: { id: string; nome: string; ordem: number }[];
  cards: FluxoCard[];
  onSelectColumn?: (colunaId: string) => void;
  activeColumnId?: string | null;
}

/**
 * Barra de resumo horizontal que mostra, sem cliques, quantos itens há em cada
 * etapa do fluxo e quais têm atividade recente. Prioriza Ideias e Em Andamento;
 * Finalizado aparece atenuado.
 */
export function FluxoResumoBar({ colunas, cards, onSelectColumn, activeColumnId }: FluxoResumoBarProps) {
  // Ordena mantendo a ordem existente, mas colocando "Finalizado" por último
  const ordered = [...colunas].sort((a, b) => a.ordem - b.ordem);

  return (
    <div className="flex items-stretch gap-2 px-6 pt-1 pb-3 overflow-x-auto">
      {ordered.map((coluna) => {
        const meta = getColumnMeta(coluna.nome);
        const Icon = meta.icon;
        const colCards = cards.filter((c) => c.coluna_id === coluna.id);
        const count = colCards.length;
        const hasRecent = colCards.some(
          (c) => isRecent(c.updated_at) || isRecent(c.created_at)
        );
        const isMuted = meta.variant === "muted";
        const isActive = activeColumnId === coluna.id;

        return (
          <button
            key={coluna.id}
            type="button"
            onClick={() => onSelectColumn?.(coluna.id)}
            className={cn(
              "group flex items-center gap-2 px-3 py-2 rounded-lg border transition-all shrink-0",
              "hover:bg-muted/40",
              isActive ? "border-primary/40 bg-muted/30" : "border-border/40 bg-muted/10",
              isMuted && "opacity-70"
            )}
          >
            <Icon
              className={cn(
                "h-3.5 w-3.5",
                meta.variant === "primary" && "text-primary",
                meta.variant === "accent" && "text-amber-500",
                meta.variant === "muted" && "text-muted-foreground",
                meta.variant === "neutral" && "text-foreground/60"
              )}
            />
            <span className={cn("text-xs font-medium tracking-tight", meta.titleClass)}>
              {coluna.nome}
            </span>
            <span
              className={cn(
                "inline-flex items-center justify-center min-w-[20px] h-5 px-1.5 rounded-full",
                "text-[10px] font-semibold border",
                meta.badgeClass,
                count === 0 && "opacity-40"
              )}
            >
              {count}
            </span>
            {hasRecent && !isMuted && (
              <span
                aria-label="Atividade recente"
                className={cn(
                  "h-1.5 w-1.5 rounded-full animate-pulse",
                  meta.dotClass
                )}
              />
            )}
          </button>
        );
      })}
    </div>
  );
}