import { ReactNode } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Clock, History } from "lucide-react";
import { cn } from "@/lib/utils";
import { OperationalFiltersBar } from "../OperationalFiltersBar";
import { useOperationalFilters } from "@/contexts/OperationalFiltersContext";
import type { EstrategiaFilter } from "@/contexts/OperationalFiltersContext";
import { OperationsSubTabHeader, type HistorySubTab } from "./OperationsSubTabHeader";

export interface OperationsHistoryConfig {
  /** ID do projeto */
  projetoId: string;
  
  /** Título exibido no header (ex: "Histórico de Operações", "Apostas Bônus") */
  title: string;
  
  /** Estratégia pré-selecionada (para tabs específicas como Surebet, ValueBet) */
  preselectedEstrategia?: EstrategiaFilter;
  
  /** Mostrar filtro de estratégia na barra de filtros */
  showEstrategiaFilter?: boolean;
  
  /** Número de operações abertas (para badge) */
  openCount: number;
  
  /** Número de operações no histórico */
  historyCount: number;
  
  /** Modo de visualização cards/list */
  viewMode: "cards" | "list";
  
  /** Callback para mudar modo de visualização */
  onViewModeChange: (mode: "cards" | "list") => void;
  
  /** Sub-tab atual */
  subTab: HistorySubTab;
  
  /** Callback para mudar sub-tab */
  onSubTabChange: (tab: HistorySubTab) => void;
  
  /** Conteúdo de operações abertas */
  openContent: ReactNode;
  
  /** Conteúdo de histórico */
  historyContent: ReactNode;
  
  /** Mensagem quando não há operações abertas */
  emptyOpenMessage?: string;
  
  /** Mensagem quando não há histórico */
  emptyHistoryMessage?: string;
  
  /** Classe CSS adicional para o container */
  className?: string;
  
  /** Altura máxima do ScrollArea (default: "calc(100vh - 400px)") */
  maxHeight?: string;
  
  /** Actions extras no header (botões de ação) */
  headerActions?: ReactNode;
}

/**
 * Módulo unificado para padrão Abertas/Histórico
 * 
 * Este componente centraliza toda a lógica visual e funcional do padrão
 * de navegação entre operações abertas e histórico, garantindo consistência
 * em todas as abas do sistema.
 * 
 * Responsabilidades:
 * - Toggle Abertas/Histórico com badges de contagem
 * - Header padronizado com título e ações
 * - Integração com OperationalFiltersBar (apenas no histórico)
 * - Toggle de visualização cards/list
 * - ScrollArea com altura configurável
 * - Empty states padronizados
 */
export function OperationsHistoryModule({
  projetoId,
  title,
  preselectedEstrategia,
  showEstrategiaFilter = false,
  openCount,
  historyCount,
  viewMode,
  onViewModeChange,
  subTab,
  onSubTabChange,
  openContent,
  historyContent,
  emptyOpenMessage = "Nenhuma operação aberta",
  emptyHistoryMessage = "Nenhuma operação no histórico",
  className,
  maxHeight = "calc(100vh - 400px)",
  headerActions,
}: OperationsHistoryConfig) {
  const globalFilters = useOperationalFilters();

  // Determinar se está no modo histórico (mostra filtros)
  const isHistoryMode = subTab === "historico";

  // Verificar se há conteúdo
  const hasOpenContent = openCount > 0;
  const hasHistoryContent = historyCount > 0;

  // Verificar se há filtros ativos (para mensagem de empty state)
  const hasActiveFilters = globalFilters.activeFiltersCount > 0;

  return (
    <Card className={cn("border-border/50", className)}>
      {/* Sub-tabs Abertas/Histórico - SEMPRE acima do header */}
      <div className="px-4 pt-4 pb-2">
        <OperationsSubTabHeader
          subTab={subTab}
          onSubTabChange={onSubTabChange}
          openCount={openCount}
          historyCount={historyCount}
          viewMode={viewMode}
          onViewModeChange={onViewModeChange}
          showViewToggle={(subTab === "abertas" && hasOpenContent) || (subTab === "historico" && hasHistoryContent)}
        />
      </div>

      <CardHeader className="pb-3 pt-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base font-medium flex items-center gap-2">
            {subTab === "abertas" ? (
              <Clock className="h-4 w-4 text-muted-foreground" />
            ) : (
              <History className="h-4 w-4 text-muted-foreground" />
            )}
            {subTab === "abertas" ? "Operações Abertas" : title}
          </CardTitle>
          
          {headerActions}
        </div>

        {/* Filtros - apenas no modo histórico */}
        {isHistoryMode && (
          <div className="mt-3">
            <OperationalFiltersBar
              projetoId={projetoId}
              showEstrategiaFilter={showEstrategiaFilter}
              preselectedEstrategia={preselectedEstrategia}
            />
          </div>
        )}
      </CardHeader>

      <CardContent className="pt-0">
        {subTab === "abertas" ? (
          hasOpenContent ? (
            <ScrollArea className="pr-4" style={{ maxHeight }}>
              {openContent}
            </ScrollArea>
          ) : (
            <EmptyState 
              icon={<Clock className="h-12 w-12 text-muted-foreground/50" />}
              message={emptyOpenMessage}
              subMessage="Todas as operações foram liquidadas"
            />
          )
        ) : (
          hasHistoryContent || hasActiveFilters ? (
            hasHistoryContent ? (
              <ScrollArea className="pr-4" style={{ maxHeight }}>
                {historyContent}
              </ScrollArea>
            ) : (
              <EmptyState 
                icon={<History className="h-12 w-12 text-muted-foreground/50" />}
                message="Nenhum resultado encontrado"
                subMessage="Tente ajustar os filtros"
              />
            )
          ) : (
            <EmptyState 
              icon={<History className="h-12 w-12 text-muted-foreground/50" />}
              message={emptyHistoryMessage}
              subMessage="Registre operações para visualizar o histórico"
            />
          )
        )}
      </CardContent>
    </Card>
  );
}

// Empty state padronizado
function EmptyState({ 
  icon, 
  message, 
  subMessage 
}: { 
  icon: ReactNode; 
  message: string; 
  subMessage?: string;
}) {
  return (
    <div className="flex flex-col items-center justify-center py-12 text-center">
      {icon}
      <p className="mt-4 text-sm font-medium text-foreground">{message}</p>
      {subMessage && (
        <p className="mt-1 text-xs text-muted-foreground">{subMessage}</p>
      )}
    </div>
  );
}
