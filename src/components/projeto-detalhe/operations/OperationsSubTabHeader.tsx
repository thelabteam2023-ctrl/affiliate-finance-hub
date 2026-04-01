import { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { ArrowDownUp, ArrowDownWideNarrow, ArrowUpNarrowWide, Clock, History, LayoutGrid, List, Search, X } from "lucide-react";
import { cn } from "@/lib/utils";
import type { SortOrder } from "@/hooks/useTabFilters";

export type HistorySubTab = "abertas" | "historico";

export interface OperationsSubTabHeaderProps {
  subTab: HistorySubTab;
  onSubTabChange: (tab: HistorySubTab) => void;
  openCount: number;
  totalOpenCount?: number;
  historyCount?: number;
  totalHistoryCount?: number;
  viewMode?: "cards" | "list";
  onViewModeChange?: (mode: "cards" | "list") => void;
  showViewToggle?: boolean;
  searchQuery?: string;
  onSearchChange?: (query: string) => void;
  extraActions?: ReactNode;
  className?: string;
  /** Ordenação atual do histórico */
  sortOrder?: SortOrder;
  /** Callback para alternar ordenação */
  onSortOrderToggle?: () => void;
}

/**
 * Componente padronizado para toggle Abertas/Histórico
 * 
 * Renderiza os botões de navegação entre operações abertas e histórico
 * de forma consistente em todas as abas do sistema.
 */
export function OperationsSubTabHeader({
  subTab,
  onSubTabChange,
  openCount,
  totalOpenCount,
  historyCount,
  totalHistoryCount,
  viewMode = "cards",
  onViewModeChange,
  showViewToggle = true,
  searchQuery,
  onSearchChange,
  extraActions,
  className,
  sortOrder,
  onSortOrderToggle,
}: OperationsSubTabHeaderProps) {
  const isOpenFiltered = totalOpenCount !== undefined && totalOpenCount !== openCount;
  const isHistoryFiltered = totalHistoryCount !== undefined && totalHistoryCount !== historyCount;
  return (
    <div className={cn("flex flex-col gap-2", className)}>
      <div className="flex items-center justify-between gap-4">
        {/* Toggle Abertas/Histórico - alinhado à esquerda */}
        <div className="flex items-center gap-2 w-fit">
          <Button
            variant={subTab === "abertas" ? "outline" : "ghost"}
            size="sm"
            onClick={() => onSubTabChange("abertas")}
            className={cn(
              "h-8 gap-2 text-sm font-medium rounded-full px-4",
              subTab === "abertas" 
                ? "border-primary text-primary bg-primary/10" 
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            <Clock className="h-4 w-4" />
            Abertas
            {openCount > 0 && (
              <Badge 
                variant="secondary" 
                className="h-5 px-1.5 text-xs ml-1"
              >
                {isOpenFiltered ? `${openCount}/${totalOpenCount}` : openCount}
              </Badge>
            )}
          </Button>
          
          <Button
            variant={subTab === "historico" ? "outline" : "ghost"}
            size="sm"
            onClick={() => onSubTabChange("historico")}
            className={cn(
              "h-8 gap-2 text-sm font-medium rounded-full px-4",
              subTab === "historico" 
                ? "border-primary text-primary bg-primary/10" 
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            <History className="h-4 w-4" />
            Histórico
            {historyCount !== undefined && historyCount > 0 && (
              <Badge 
                variant="secondary" 
                className="h-5 px-1.5 text-xs ml-1"
              >
                {isHistoryFiltered ? `${historyCount}/${totalHistoryCount}` : historyCount}
              </Badge>
            )}
          </Button>
        </div>

        {/* Right side: extra actions + view toggle */}
        <div className="flex items-center gap-2">
          {/* Extra actions slot (e.g., ExportMenu) */}
          {extraActions}
          
          {/* Toggle View Mode - apenas se showViewToggle e onViewModeChange */}
          {showViewToggle && onViewModeChange && (
            <ToggleGroup
              type="single"
              value={viewMode}
              onValueChange={(v) => v && onViewModeChange(v as "cards" | "list")}
              className="bg-muted/50 p-0.5 rounded-md"
            >
              <ToggleGroupItem value="cards" size="sm" className="h-7 w-7 p-0">
                <LayoutGrid className="h-4 w-4" />
              </ToggleGroupItem>
              <ToggleGroupItem value="list" size="sm" className="h-7 w-7 p-0">
                <List className="h-4 w-4" />
              </ToggleGroupItem>
            </ToggleGroup>
          )}
        </div>
      </div>

      {/* Campo de busca por evento/jogo */}
      {onSearchChange && (
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
          <input
            type="text"
            value={searchQuery || ""}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder="Buscar por jogo, evento ou casa..."
            className="w-full h-9 rounded-lg border border-border bg-background/50 pl-9 pr-9 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 transition-colors"
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => onSearchChange("")}
              className="absolute right-2 top-1/2 -translate-y-1/2 h-5 w-5 rounded-sm text-muted-foreground hover:text-foreground flex items-center justify-center"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      )}
    </div>
  );
}
