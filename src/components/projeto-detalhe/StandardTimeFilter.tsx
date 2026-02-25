import { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { CalendarIcon, LayoutDashboard, LayoutList, Check, X } from "lucide-react";
import { format, startOfDay, endOfDay, subDays, startOfMonth, endOfMonth, subMonths, startOfYear } from "date-fns";
import { ptBR } from "date-fns/locale";
import { cn } from "@/lib/utils";
import { DateRange } from "react-day-picker";

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
}: StandardTimeFilterProps) {
  const [calendarOpen, setCalendarOpen] = useState(false);
  
  // ============================================
  // ESTADO TEMPORÁRIO PARA SELEÇÃO DE PERÍODO
  // ============================================
  // O filtro real SÓ é atualizado quando o usuário
  // clica em "Aplicar" com período completo.
  // ============================================
  const [tempDateRange, setTempDateRange] = useState<DateRange | undefined>(undefined);

  // Sincronizar estado temporário quando o calendário abre
  useEffect(() => {
    if (calendarOpen) {
      // Ao abrir, inicializa com o período atual (se existir)
      setTempDateRange(customDateRange);
    }
  }, [calendarOpen]);

  const handlePeriodChange = (value: string) => {
    if (value) {
      onPeriodChange(value as StandardPeriodFilter);
    }
  };

  /**
   * SELEÇÃO TEMPORÁRIA - NÃO APLICA FILTRO
   * Apenas atualiza o estado visual do calendário.
   * O filtro real só é aplicado no handleApplyPeriod.
   */
  const handleTempDateRangeSelect = useCallback((range: DateRange | undefined) => {
    setTempDateRange(range);
    // NÃO fecha calendário
    // NÃO aplica filtro
    // NÃO dispara fetch
  }, []);

  /**
   * APLICAÇÃO EXPLÍCITA DO PERÍODO
   * Só executa quando o período está completo (from + to).
   */
  const handleApplyPeriod = useCallback(() => {
    if (tempDateRange?.from && tempDateRange?.to) {
      // Aplica o filtro REAL
      onCustomDateRangeChange?.(tempDateRange);
      onPeriodChange("custom");
      setCalendarOpen(false);
    }
  }, [tempDateRange, onCustomDateRangeChange, onPeriodChange]);

  /**
   * LIMPAR SELEÇÃO TEMPORÁRIA
   * Reseta apenas o estado temporário, não aplica nada.
   */
  const handleClearTemp = useCallback(() => {
    setTempDateRange(undefined);
    // Mantém calendário aberto para nova seleção
  }, []);

  /**
   * CANCELAR E FECHAR
   * Descarta seleção temporária e fecha o calendário.
   */
  const handleCancel = useCallback(() => {
    setTempDateRange(customDateRange); // Restaura estado original
    setCalendarOpen(false);
  }, [customDateRange]);

  // Verifica se o período temporário está completo
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

  return (
    <div className={cn("flex flex-wrap items-center gap-2", className)}>
      {/* Period Toggle */}
      <ToggleGroup
        type="single"
        value={period === "custom" ? undefined : period}
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
              period === option.value && "bg-card text-foreground shadow-sm border border-border"
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
            variant={period === "custom" ? "default" : "outline"}
            size="sm"
            className={cn(
              "h-7 text-xs gap-1.5",
              period === "custom" && "bg-primary text-primary-foreground"
            )}
          >
            <CalendarIcon className="h-3.5 w-3.5" />
            {period === "custom" ? formatDateRange() : "Período"}
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
            {/* Status da seleção */}
            <div className="flex items-center justify-between mb-3">
              <span className={cn(
                "text-xs",
                isPeriodComplete ? "text-primary font-medium" : "text-muted-foreground"
              )}>
                {formatTempDateRange()}
              </span>
            </div>
            
            {/* Botões de ação */}
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
            
            {/* Dica de uso */}
            {isPeriodStarted && (
              <p className="text-[10px] text-muted-foreground mt-2 text-center">
                Clique em outra data para definir o período
              </p>
            )}
          </div>
        </PopoverContent>
      </Popover>

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
