import { useState, useEffect, useCallback, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { CalendarIcon, LayoutDashboard, LayoutList, Check, X, RotateCcw } from "lucide-react";
import { format, startOfDay, endOfDay, subDays, startOfMonth, endOfMonth, subMonths, startOfYear } from "date-fns";
import { ptBR } from "date-fns/locale";
import { cn } from "@/lib/utils";
import { DateRange } from "react-day-picker";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type { DateRange };

/**
 * PADRÃO OFICIAL DE FILTROS DE DATA (CONTÁBIL)
 * 
 * - 1dia: data_operacional = hoje
 * - 7dias: hoje - 6 dias até hoje (7 dias incluindo hoje)
 * - mes_atual: primeiro dia do mês atual até hoje
 * - mes_anterior: primeiro ao último dia do mês anterior
 * - ano: primeiro dia do ano atual até hoje
 * - custom: período personalizado
 * 
 * REGRA-MÃE: Seleção de período ≠ seleção de data única
 * O calendário só aplica filtro quando o período estiver COMPLETO.
 */
export type StandardPeriodFilter = "1dia" | "7dias" | "mes_atual" | "mes_anterior" | "ano" | "custom";
export type NavigationMode = "compact" | "gestao";

interface DateRangeResult {
  start: Date;
  end: Date;
}

interface StandardTimeFilterProps {
  period: StandardPeriodFilter;
  onPeriodChange: (period: StandardPeriodFilter) => void;
  customDateRange?: DateRange;
  onCustomDateRangeChange?: (range: DateRange | undefined) => void;
  navMode?: NavigationMode;
  onNavModeChange?: (mode: NavigationMode) => void;
  showNavMode?: boolean;
  className?: string;
  /** When provided, enables cycle selector for the project */
  projetoId?: string;
  /** Controlled cycle selection - if not provided, internal state is used */
  selectedCycleId?: string;
  onCycleChange?: (cycleId: string) => void;
}

const PERIOD_OPTIONS: { value: StandardPeriodFilter; label: string }[] = [
  { value: "1dia", label: "1 dia" },
  { value: "7dias", label: "7 dias" },
  { value: "mes_atual", label: "Mês atual" },
  { value: "mes_anterior", label: "Mês anterior" },
  { value: "ano", label: "Ano" },
];

export function getDateRangeFromPeriod(
  period: StandardPeriodFilter,
  customRange?: DateRange
): DateRangeResult | null {
  const now = new Date();
  const today = startOfDay(now);

  switch (period) {
    case "1dia":
      return { start: today, end: endOfDay(now) };
    
    case "7dias":
      // 7 dias incluindo hoje
      return { start: subDays(today, 6), end: endOfDay(now) };
    
    case "mes_atual":
      return { start: startOfMonth(now), end: endOfDay(now) };
    
    case "mes_anterior":
      const prevMonth = subMonths(now, 1);
      return { 
        start: startOfMonth(prevMonth), 
        end: endOfDay(endOfMonth(prevMonth)) 
      };
    
    case "ano":
      return { start: startOfYear(now), end: endOfDay(now) };
    
    case "custom":
      if (customRange?.from) {
        return {
          start: startOfDay(customRange.from),
          end: endOfDay(customRange.to || customRange.from),
        };
      }
      return null;
    
    default:
      return null;
  }
}

export function StandardTimeFilter({
  period,
  onPeriodChange,
  customDateRange,
  onCustomDateRangeChange,
  navMode,
  onNavModeChange,
  showNavMode = false,
  className,
  projetoId,
  selectedCycleId: controlledCycleId,
  onCycleChange,
}: StandardTimeFilterProps) {
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [tempDateRange, setTempDateRange] = useState<DateRange | undefined>(undefined);
  const [internalCycleId, setInternalCycleId] = useState("none");

  const activeCycleId = controlledCycleId ?? internalCycleId;
  const setActiveCycleId = onCycleChange ?? setInternalCycleId;

  // Fetch cycles when projetoId is provided
  const { data: allCycles = [] } = useQuery({
    queryKey: ["projeto-ciclos-filter", projetoId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("projeto_ciclos")
        .select("id, numero_ciclo, data_inicio, data_fim_prevista, data_fim_real, status")
        .eq("projeto_id", projetoId!)
        .order("numero_ciclo", { ascending: false });
      if (error) throw error;
      return data || [];
    },
    enabled: !!projetoId,
    staleTime: 5 * 60 * 1000,
  });

  // Filter: only show cycles that are active or past (not future/planned)
  // Only show cycles whose start date has arrived (strictly date-based, ignoring status)
  const projectCycles = useMemo(() => {
    const today = startOfDay(new Date());
    return allCycles.filter(cycle => {
      const cycleStart = new Date(cycle.data_inicio + "T00:00:00");
      return cycleStart <= today;
    });
  }, [allCycles]);

  // When cycle is selected, auto-set custom date range
  const handleCycleSelect = useCallback((value: string) => {
    setActiveCycleId(value);
    if (value !== "none") {
      const cycle = projectCycles.find(c => c.id === value);
      if (cycle) {
        const from = new Date(cycle.data_inicio + "T00:00:00");
        // CRITICAL: Usar data_fim_prevista como limite operacional do ciclo
        // data_fim_real é quando o ciclo foi administrativamente fechado, não o fim do período de apostas
        const to = new Date((cycle.data_fim_prevista || cycle.data_fim_real) + "T00:00:00");
        onCustomDateRangeChange?.({ from, to });
        onPeriodChange("custom");
      }
    }
  }, [projectCycles, onCustomDateRangeChange, onPeriodChange, setActiveCycleId]);

  // Clear cycle when user manually changes period
  const handlePeriodChange = (value: string) => {
    if (value) {
      if (activeCycleId !== "none") {
        setActiveCycleId("none");
      }
      onPeriodChange(value as StandardPeriodFilter);
    }
  };

  // Sync state when calendar opens
  useEffect(() => {
    if (calendarOpen) {
      setTempDateRange(customDateRange);
    }
  }, [calendarOpen]);

  const handleTempDateRangeSelect = useCallback((range: DateRange | undefined) => {
    setTempDateRange(range);
  }, []);

  const handleApplyPeriod = useCallback(() => {
    if (tempDateRange?.from && tempDateRange?.to) {
      if (activeCycleId !== "none") {
        setActiveCycleId("none");
      }
      onCustomDateRangeChange?.(tempDateRange);
      onPeriodChange("custom");
      setCalendarOpen(false);
    }
  }, [tempDateRange, onCustomDateRangeChange, onPeriodChange, activeCycleId, setActiveCycleId]);

  const handleClearTemp = useCallback(() => {
    setTempDateRange(undefined);
  }, []);

  const handleCancel = useCallback(() => {
    setTempDateRange(customDateRange);
    setCalendarOpen(false);
  }, [customDateRange]);

  const isPeriodComplete = tempDateRange?.from && tempDateRange?.to;
  const isPeriodStarted = tempDateRange?.from && !tempDateRange?.to;

  const formatDateRange = () => {
    if (customDateRange?.from) {
      if (customDateRange.to) {
        return `${format(customDateRange.from, "dd/MM/yy", { locale: ptBR })} - ${format(customDateRange.to, "dd/MM/yy", { locale: ptBR })}`;
      }
      return format(customDateRange.from, "dd/MM/yyyy", { locale: ptBR });
    }
    return "Período";
  };

  const formatTempDateRange = () => {
    if (tempDateRange?.from) {
      if (tempDateRange.to) {
        return `${format(tempDateRange.from, "dd/MM/yyyy", { locale: ptBR })} até ${format(tempDateRange.to, "dd/MM/yyyy", { locale: ptBR })}`;
      }
      return `${format(tempDateRange.from, "dd/MM/yyyy", { locale: ptBR })} → selecione a data final`;
    }
    return "Selecione a data inicial";
  };

  const showCycleSelector = !!projetoId && projectCycles.length > 0;
  const selectedCycle = projectCycles.find(c => c.id === activeCycleId);

  return (
    <div className={cn("flex flex-wrap items-center gap-2", className)}>
      {/* Period Toggle */}
      <ToggleGroup
        type="single"
        value={period === "custom" || activeCycleId !== "none" ? undefined : period}
        onValueChange={handlePeriodChange}
        className="bg-muted/50 p-0.5 rounded-lg"
      >
        {PERIOD_OPTIONS.map((option) => (
          <ToggleGroupItem
            key={option.value}
            value={option.value}
            size="sm"
            className={cn(
              "text-xs px-3 h-7 data-[state=on]:bg-card data-[state=on]:text-foreground data-[state=on]:shadow-sm data-[state=on]:border data-[state=on]:border-border",
              period === option.value && activeCycleId === "none" && "bg-card text-foreground shadow-sm border border-border"
            )}
          >
            {option.label}
          </ToggleGroupItem>
        ))}
      </ToggleGroup>

      {/* Calendar Date Range Picker */}
      <Popover open={calendarOpen} onOpenChange={setCalendarOpen}>
        <PopoverTrigger asChild>
          <Button
            variant={period === "custom" && activeCycleId === "none" ? "default" : "outline"}
            size="sm"
            className={cn(
              "h-7 text-xs gap-1.5",
              period === "custom" && activeCycleId === "none" && "bg-primary text-primary-foreground"
            )}
          >
            <CalendarIcon className="h-3.5 w-3.5" />
            {period === "custom" && activeCycleId === "none" ? formatDateRange() : "Período"}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0" align="start">
          <Calendar
            mode="range"
            selected={tempDateRange}
            onSelect={handleTempDateRangeSelect}
            numberOfMonths={2}
            locale={ptBR}
            className="p-3 pointer-events-auto"
            disabled={(date) => date > new Date()}
          />
          
          {/* Barra de Status e Ações */}
          <div className="p-3 border-t bg-muted/30">
            <div className="flex items-center justify-between mb-3">
              <span className={cn(
                "text-xs",
                isPeriodComplete ? "text-primary font-medium" : "text-muted-foreground"
              )}>
                {formatTempDateRange()}
              </span>
            </div>
            
            <div className="flex items-center justify-between gap-2">
              <div className="flex gap-2">
                {tempDateRange?.from && (
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-7 text-xs"
                    onClick={handleClearTemp}
                  >
                    Limpar
                  </Button>
                )}
              </div>
              
              <div className="flex gap-2">
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-7 text-xs"
                  onClick={handleCancel}
                >
                  <X className="h-3 w-3 mr-1" />
                  Cancelar
                </Button>
                
                <Button
                  size="sm"
                  className="h-7 text-xs"
                  onClick={handleApplyPeriod}
                  disabled={!isPeriodComplete}
                >
                  <Check className="h-3 w-3 mr-1" />
                  Aplicar
                </Button>
              </div>
            </div>
            
            {isPeriodStarted && (
              <p className="text-[10px] text-muted-foreground mt-2 text-center">
                Clique em outra data para definir o período
              </p>
            )}
          </div>
        </PopoverContent>
      </Popover>

      {/* Cycle Selector - only shown when project has cycles */}
      {showCycleSelector && (
        <>
          <Select value={activeCycleId} onValueChange={handleCycleSelect}>
            <SelectTrigger className="w-[170px] h-7 text-xs">
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
          {activeCycleId !== "none" && (
            <>
              <Button
                variant="ghost"
                size="sm"
                className="h-7 w-7 p-0 text-muted-foreground hover:text-foreground"
                onClick={() => handleCycleSelect("none")}
              >
                <RotateCcw className="h-3.5 w-3.5" />
              </Button>
              <Badge variant="outline" className="text-xs text-amber-400 border-amber-500/30 bg-amber-500/10">
                Ciclo {selectedCycle?.numero_ciclo}
              </Badge>
            </>
          )}
        </>
      )}

      {/* Navigation Mode Toggle */}
      {showNavMode && onNavModeChange && (
        <ToggleGroup
          type="single"
          value={navMode}
          onValueChange={(value) => value && onNavModeChange(value as NavigationMode)}
          className="bg-muted/50 p-0.5 rounded-lg ml-auto"
        >
          <ToggleGroupItem
            value="compact"
            size="sm"
            className="text-xs px-3 h-7 gap-1.5 data-[state=on]:bg-card data-[state=on]:text-foreground data-[state=on]:shadow-sm data-[state=on]:border data-[state=on]:border-border"
          >
            <LayoutList className="h-3.5 w-3.5" />
            Compacto
          </ToggleGroupItem>
          <ToggleGroupItem
            value="gestao"
            size="sm"
            className="text-xs px-3 h-7 gap-1.5 data-[state=on]:bg-card data-[state=on]:text-foreground data-[state=on]:shadow-sm data-[state=on]:border data-[state=on]:border-border"
          >
            <LayoutDashboard className="h-3.5 w-3.5" />
            Gestão
          </ToggleGroupItem>
        </ToggleGroup>
      )}
    </div>
  );
}
