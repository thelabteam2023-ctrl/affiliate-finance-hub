import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { CalendarIcon, LayoutDashboard, LayoutList } from "lucide-react";
import { format, startOfDay, endOfDay, subDays, startOfMonth, endOfMonth, subMonths } from "date-fns";
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
 * - custom: período personalizado
 */
export type StandardPeriodFilter = "1dia" | "7dias" | "mes_atual" | "mes_anterior" | "custom";
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

  const handlePeriodChange = (value: string) => {
    if (value) {
      onPeriodChange(value as StandardPeriodFilter);
    }
  };

  const handleDateRangeSelect = (range: DateRange | undefined) => {
    onCustomDateRangeChange?.(range);
    if (range?.from && range?.to) {
      onPeriodChange("custom");
      setCalendarOpen(false);
    }
  };

  const formatDateRange = () => {
    if (customDateRange?.from) {
      if (customDateRange.to) {
        return `${format(customDateRange.from, "dd/MM/yy", { locale: ptBR })} - ${format(customDateRange.to, "dd/MM/yy", { locale: ptBR })}`;
      }
      return format(customDateRange.from, "dd/MM/yyyy", { locale: ptBR });
    }
    return "Período";
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
              "text-xs px-3 h-7 data-[state=on]:bg-background data-[state=on]:shadow-sm",
              period === option.value && "bg-background shadow-sm"
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
            selected={customDateRange}
            onSelect={handleDateRangeSelect}
            numberOfMonths={2}
            locale={ptBR}
            className="pointer-events-auto"
            disabled={(date) => date > new Date()}
          />
          {customDateRange?.from && (
            <div className="p-3 border-t">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs text-muted-foreground">
                  {customDateRange.from && customDateRange.to
                    ? `${format(customDateRange.from, "dd/MM/yyyy", { locale: ptBR })} até ${format(customDateRange.to, "dd/MM/yyyy", { locale: ptBR })}`
                    : "Selecione a data final"}
                </span>
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-7 text-xs"
                  onClick={() => {
                    onCustomDateRangeChange?.(undefined);
                    onPeriodChange("mes_atual");
                  }}
                >
                  Limpar
                </Button>
              </div>
            </div>
          )}
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
            className="text-xs px-3 h-7 gap-1.5 data-[state=on]:bg-background data-[state=on]:shadow-sm"
          >
            <LayoutList className="h-3.5 w-3.5" />
            Compacto
          </ToggleGroupItem>
          <ToggleGroupItem
            value="gestao"
            size="sm"
            className="text-xs px-3 h-7 gap-1.5 data-[state=on]:bg-background data-[state=on]:shadow-sm"
          >
            <LayoutDashboard className="h-3.5 w-3.5" />
            Gestão
          </ToggleGroupItem>
        </ToggleGroup>
      )}
    </div>
  );
}
