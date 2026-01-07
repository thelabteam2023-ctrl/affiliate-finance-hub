import { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Clock, History, LayoutGrid, List } from "lucide-react";
import { cn } from "@/lib/utils";

export type HistorySubTab = "abertas" | "historico";

export interface OperationsSubTabHeaderProps {
  /** Sub-tab atual */
  subTab: HistorySubTab;
  
  /** Callback para mudar sub-tab */
  onSubTabChange: (tab: HistorySubTab) => void;
  
  /** Número de operações abertas (para badge) */
  openCount: number;
  
  /** Número de operações no histórico (opcional, mostra badge se > 0) */
  historyCount?: number;
  
  /** Modo de visualização cards/list (opcional) */
  viewMode?: "cards" | "list";
  
  /** Callback para mudar modo de visualização (opcional) */
  onViewModeChange?: (mode: "cards" | "list") => void;
  
  /** Mostrar toggle de visualização */
  showViewToggle?: boolean;
  
  /** Ações extras (ex: ExportMenu) - renderizadas à direita */
  extraActions?: ReactNode;
  
  /** Classe CSS adicional */
  className?: string;
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
  historyCount,
  viewMode = "cards",
  onViewModeChange,
  showViewToggle = true,
  extraActions,
  className,
}: OperationsSubTabHeaderProps) {
  return (
    <div className={cn("flex items-center justify-between gap-4", className)}>
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
              {openCount}
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
              {historyCount}
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
  );
}
