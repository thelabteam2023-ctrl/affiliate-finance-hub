import { ReactNode } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Clock, History } from "lucide-react";
import { cn } from "@/lib/utils";
import { TabFiltersBar } from "../TabFiltersBar";
import type { TabFiltersReturn } from "@/hooks/useTabFilters";
import { OperationsSubTabHeader, type HistorySubTab } from "./OperationsSubTabHeader";

export interface OperationsHistoryConfig {
  /** ID do projeto */
  projetoId: string;
  
  /** Título exibido no header (ex: "Histórico de Operações", "Apostas Bônus") */
  title: string;
  
  /** Filtros da aba (retornados pelo useTabFilters) - ISOLADOS por aba */
  tabFilters: TabFiltersReturn;
  
  /** Mostrar filtro de estratégia na barra de filtros */
  showEstrategiaFilter?: boolean;
  
  /** Mostrar barra de filtros (default: true no histórico) */
  showFiltersBar?: boolean;
  
  /** Número de operações abertas (para badge) */
  openCount: number;
  
  /** Total de operações abertas sem filtros dimensionais */
  totalOpenCount?: number;
  
  /** Número de operações no histórico */
  historyCount: number;
  
  /** Total de operações no histórico sem filtros dimensionais */
  totalHistoryCount?: number;
  
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
 * IMPORTANTE: Este componente usa filtros LOCAIS via props.
 * Os filtros NÃO vazam para outras abas - cada aba mantém
 * seu próprio estado de filtros.
 * 
 * Responsabilidades:
 * - Toggle Abertas/Histórico com badges de contagem
 * - Header padronizado com título e ações
 * - Integração com TabFiltersBar (filtros LOCAIS, apenas no histórico)
 * - Toggle de visualização cards/list
 * - ScrollArea com altura configurável
 * - Empty states padronizados
 */
export function OperationsHistoryModule({
  projetoId,
  title,
  tabFilters,
  showEstrategiaFilter = false,
  showFiltersBar = true,
  openCount,
  totalOpenCount,
  historyCount,
  totalHistoryCount,
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
  // Determinar se está no modo histórico (mostra filtros)
  const isHistoryMode = subTab === "historico";

  // Verificar se há conteúdo
  const hasOpenContent = openCount > 0;
  const hasHistoryContent = historyCount > 0;

  // Verificar se há filtros ativos (para mensagem de empty state)
  const hasActiveFilters = tabFilters.activeFiltersCount > 0;

  return (
    <Card className={cn("border-border/50", className)}>
      {/* Sub-tabs Abertas/Histórico - SEMPRE acima do header */}
      <div className="px-4 pt-4 pb-2">
        <OperationsSubTabHeader
          subTab={subTab}
          onSubTabChange={onSubTabChange}
          openCount={openCount}
          totalOpenCount={totalOpenCount}
          historyCount={historyCount}
          totalHistoryCount={totalHistoryCount}
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

        {/* Filtros LOCAIS - apenas no modo histórico */}
        {isHistoryMode && showFiltersBar && (
          <div className="mt-3">
            <TabFiltersBar
              projetoId={projetoId}
              filters={tabFilters}
              showEstrategiaFilter={showEstrategiaFilter}
              showPeriodFilter={true}
              showBookmakerFilter={true}
              showParceiroFilter={true}
              showResultadoFilter={true}
            />
          </div>
        )}
      </CardHeader>

      <CardContent className="pt-0 min-h-[200px]">
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
