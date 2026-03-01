import { useState, useEffect, useMemo, useCallback } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { LayoutDashboard, Building2, Target, PanelLeft, LayoutList, RotateCcw } from "lucide-react";
import { BonusVisaoGeralTab } from "./BonusVisaoGeralTab";
import { BonusBookmakersTab } from "./BonusBookmakersTab";
import { BonusApostasTab } from "./BonusApostasTab";
import { useProjectBonuses } from "@/hooks/useProjectBonuses";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { StandardTimeFilter, StandardPeriodFilter, getDateRangeFromPeriod, DateRange as FilterDateRange } from "../StandardTimeFilter";
import { useOpenOperationsCount } from "@/hooks/useOpenOperationsCount";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { startOfDay, endOfDay } from "date-fns";

interface ProjetoBonusAreaProps {
  projetoId: string;
  refreshTrigger?: number;
  actionsSlot?: React.ReactNode;
  onDataChange?: () => void;
}

type NavigationMode = "tabs" | "sidebar";
type TabValue = "visao-geral" | "bookmakers" | "apostas";

const STORAGE_KEY = "bonus-area-nav-mode";

export function ProjetoBonusArea({ projetoId, refreshTrigger, actionsSlot, onDataChange }: ProjetoBonusAreaProps) {
  const { getBookmakersWithActiveBonus, fetchBonuses } = useProjectBonuses({ projectId: projetoId });
  const bookmakersInBonusMode = getBookmakersWithActiveBonus();
  
  // Count of open operations (pending bets in bonus context) - uses canonical hook
  const { count: openOperationsCount } = useOpenOperationsCount({
    projetoId,
    estrategia: "BONUS",
    refreshTrigger,
  });
  
  // NAV_ITEMS with dynamic counts
  const NAV_ITEMS = useMemo(() => [
    { value: "visao-geral" as TabValue, label: "Visão Geral", icon: LayoutDashboard },
    { value: "apostas" as TabValue, label: "Operações", icon: Target, showBadge: true, count: openOperationsCount },
    { value: "bookmakers" as TabValue, label: "Por Casa", icon: Building2, showCount: true, count: bookmakersInBonusMode.length },
  ], [openOperationsCount, bookmakersInBonusMode.length]);
  
  // Refetch when refreshTrigger changes
  useEffect(() => {
    if (refreshTrigger !== undefined && refreshTrigger > 0) {
      fetchBonuses();
    }
  }, [refreshTrigger]);
  
  const [navMode, setNavMode] = useState<NavigationMode>(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    return (saved === "tabs" ? "tabs" : "sidebar") as NavigationMode;
  });
  
  const [activeTab, setActiveTab] = useState<TabValue>("visao-geral");
  const [isTransitioning, setIsTransitioning] = useState(false);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, navMode);
  }, [navMode]);

  const handleModeToggle = () => {
    setIsTransitioning(true);
    setTimeout(() => {
      setNavMode(prev => prev === "tabs" ? "sidebar" : "tabs");
      setTimeout(() => setIsTransitioning(false), 50);
    }, 150);
  };

  const handleTabChange = (value: string) => {
    if (value !== activeTab) {
      setIsTransitioning(true);
      setActiveTab(value as TabValue);
      setTimeout(() => setIsTransitioning(false), 180);
    }
  };
  
  // Standard time filter state
  const [internalPeriod, setInternalPeriod] = useState<StandardPeriodFilter>("mes_atual");
  const [internalDateRange, setInternalDateRange] = useState<FilterDateRange | undefined>(undefined);
  const [selectedCycleId, setSelectedCycleId] = useState<string>("none");

  // Fetch cycles for this project
  const { data: projectCycles = [] } = useQuery({
    queryKey: ["projeto-ciclos-bonus-filter", projetoId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("projeto_ciclos")
        .select("id, numero_ciclo, data_inicio, data_fim_prevista, data_fim_real, status")
        .eq("projeto_id", projetoId)
        .order("numero_ciclo", { ascending: false });
      if (error) throw error;
      return data || [];
    },
    enabled: !!projetoId,
    staleTime: 5 * 60 * 1000,
  });

  // When a cycle is selected, override the dateRange
  const dateRange = useMemo(() => {
    if (selectedCycleId !== "none") {
      const cycle = projectCycles.find(c => c.id === selectedCycleId);
      if (cycle) {
        const start = startOfDay(new Date(cycle.data_inicio + "T00:00:00"));
        const end = endOfDay(new Date((cycle.data_fim_real || cycle.data_fim_prevista) + "T00:00:00"));
        return { start, end };
      }
    }
    return getDateRangeFromPeriod(internalPeriod, internalDateRange);
  }, [internalPeriod, internalDateRange, selectedCycleId, projectCycles]);

  const isSingleDayPeriod = selectedCycleId === "none" && internalPeriod === "1dia";

  const handleCycleChange = useCallback((value: string) => {
    setSelectedCycleId(value);
  }, []);

  const handlePeriodChange = useCallback((period: StandardPeriodFilter) => {
    setSelectedCycleId("none");
    setInternalPeriod(period);
  }, []);

  const handleDateRangeChange = useCallback((range: FilterDateRange | undefined) => {
    setSelectedCycleId("none");
    setInternalDateRange(range);
  }, []);

  // Cycle selector component
  const cycleSelector = projectCycles.length > 0 ? (
    <div className="flex items-center gap-2">
      <Select value={selectedCycleId} onValueChange={handleCycleChange}>
        <SelectTrigger className="w-[180px] h-8 text-xs">
          <SelectValue placeholder="Filtrar por ciclo" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="none">Sem filtro de ciclo</SelectItem>
          {projectCycles.map(cycle => (
            <SelectItem key={cycle.id} value={cycle.id}>
              Ciclo {cycle.numero_ciclo} {cycle.status === "CONCLUIDO" ? "✓" : cycle.status === "EM_ANDAMENTO" ? "●" : ""}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {selectedCycleId !== "none" && (
        <Button
          variant="ghost"
          size="sm"
          className="h-8 w-8 p-0 text-muted-foreground hover:text-foreground"
          onClick={() => setSelectedCycleId("none")}
        >
          <RotateCcw className="h-3.5 w-3.5" />
        </Button>
      )}
    </div>
  ) : null;

  // Period filter component (with cycle selector)
  const periodFilterComponent = (
    <div className="flex flex-wrap items-center gap-3">
      <StandardTimeFilter
        period={internalPeriod}
        onPeriodChange={handlePeriodChange}
        customDateRange={internalDateRange}
        onCustomDateRangeChange={handleDateRangeChange}
      />
      {cycleSelector}
      {selectedCycleId !== "none" && (
        <Badge variant="outline" className="text-xs text-amber-400 border-amber-500/30 bg-amber-500/10">
          Ciclo {projectCycles.find(c => c.id === selectedCycleId)?.numero_ciclo}
        </Badge>
      )}
    </div>
  );

  const renderContent = () => {
    const contentClass = cn(
      "transition-all duration-200 ease-out",
      isTransitioning ? "opacity-0 translate-y-2" : "opacity-100 translate-y-0"
    );

    return (
      <div className={cn("min-h-[400px]", contentClass)}>
        {activeTab === "visao-geral" && <BonusVisaoGeralTab projetoId={projetoId} dateRange={dateRange} isSingleDayPeriod={isSingleDayPeriod} periodFilter={periodFilterComponent} actionsSlot={actionsSlot} />}
        {activeTab === "bookmakers" && <div className="mb-4">{periodFilterComponent}</div>}
        {activeTab === "bookmakers" && <BonusBookmakersTab projetoId={projetoId} />}
        {activeTab === "apostas" && <BonusApostasTab projetoId={projetoId} dateRange={dateRange} onDataChange={onDataChange} />}
      </div>
    );
  };

  const modeToggle = (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          onClick={handleModeToggle}
          className="h-8 w-8 p-0 text-muted-foreground/60 hover:text-foreground hover:bg-muted/50 transition-colors"
        >
          {navMode === "tabs" ? (
            <PanelLeft className="h-4 w-4" />
          ) : (
            <LayoutList className="h-4 w-4" />
          )}
        </Button>
      </TooltipTrigger>
      <TooltipContent side="bottom" className="text-xs">
        {navMode === "tabs" ? "Modo Gestão" : "Modo Compacto"}
      </TooltipContent>
    </Tooltip>
  );

  // Mode: Slim Tabs
  if (navMode === "tabs") {
    return (
      <div className="space-y-6">
        <Tabs value={activeTab} onValueChange={handleTabChange} className="space-y-6">
          <div className="relative flex items-center justify-center border-b border-border/50">
            <TabsList className="bg-transparent border-0 rounded-none p-0 h-auto gap-6">
              {NAV_ITEMS.map((item) => (
                <TabsTrigger
                  key={item.value}
                  value={item.value}
                  className="bg-transparent border-0 rounded-none px-1 pb-3 pt-1 h-auto shadow-none data-[state=active]:bg-transparent data-[state=active]:shadow-none text-muted-foreground/70 data-[state=active]:text-foreground transition-colors relative"
                >
                  <item.icon className="h-4 w-4 mr-2 opacity-60" />
                  {item.label}
                  {item.showBadge && item.count > 0 && (
                    <Badge 
                      variant="destructive" 
                      className="ml-1.5 h-5 min-w-5 px-1.5 text-[10px] font-bold"
                    >
                      {item.count > 99 ? "99+" : item.count}
                    </Badge>
                  )}
                  {item.showCount && item.count > 0 && !item.showBadge && (
                    <span className="ml-1.5 text-xs font-medium text-muted-foreground/60">
                      ({item.count})
                    </span>
                  )}
                </TabsTrigger>
              ))}
            </TabsList>
            <div className="absolute right-0 flex items-center gap-4">
              {modeToggle}
            </div>
          </div>

          <TabsContent value={activeTab} className="mt-0">
            {renderContent()}
          </TabsContent>
        </Tabs>
      </div>
    );
  }

  // Mode: Sidebar
  return (
    <div className="space-y-4">
      
      <div className="flex gap-6">
        {/* Sidebar Navigation */}
        <div className="w-48 shrink-0">
          <div className="flex items-center justify-between mb-4">
            <span className="text-xs font-medium text-muted-foreground/60 uppercase tracking-wider">
              Navegação
            </span>
            {modeToggle}
          </div>
          <nav className="space-y-1">
            {NAV_ITEMS.map((item) => {
              const isActive = activeTab === item.value;
              return (
                <button
                  key={item.value}
                  onClick={() => handleTabChange(item.value)}
                  className={cn(
                    "w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-200",
                    isActive
                      ? "bg-accent/10 text-foreground shadow-sm"
                      : "text-muted-foreground/70 hover:text-foreground hover:bg-muted/50"
                  )}
                >
                  <item.icon className={cn(
                    "h-4 w-4 transition-colors",
                    isActive ? "text-accent" : "opacity-60"
                  )} />
                  <span className="flex-1 text-left">{item.label}</span>
                  {item.showBadge && item.count > 0 && (
                    <Badge 
                      variant="destructive" 
                      className="h-5 min-w-5 px-1.5 text-[10px] font-bold"
                    >
                      {item.count > 99 ? "99+" : item.count}
                    </Badge>
                  )}
                  {item.showCount && item.count > 0 && !item.showBadge && (
                    <span className={cn(
                      "text-xs px-1.5 py-0.5 rounded-full transition-colors",
                      isActive 
                        ? "bg-accent/20 text-accent" 
                        : "bg-muted/50 text-muted-foreground/60"
                    )}>
                      {item.count}
                    </span>
                  )}
                </button>
              );
            })}
          </nav>
        </div>

        {/* Content Area */}
        <div className="flex-1 min-w-0">
          {renderContent()}
        </div>
      </div>
    </div>
  );
}
