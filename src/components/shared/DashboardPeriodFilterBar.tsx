/**
 * Componente de Filtro Temporal Unificado para Dashboards
 * 
 * Padrão oficial: Mês atual | Anterior | Tudo + Calendário
 */

import { useState, useCallback, useEffect } from "react";
import { DashboardPeriodFilter, DASHBOARD_PERIOD_OPTIONS } from "@/types/dashboardFilters";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { CalendarIcon, Check, X } from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { DateRange } from "react-day-picker";

interface DashboardPeriodFilterProps {
  value: DashboardPeriodFilter;
  onChange: (value: DashboardPeriodFilter) => void;
  customRange?: { start: Date; end: Date };
  onCustomRangeChange?: (range: { start: Date; end: Date }) => void;
  className?: string;
  size?: "sm" | "default";
}

export function DashboardPeriodFilterBar({
  value,
  onChange,
  customRange,
  onCustomRangeChange,
  className,
  size = "default",
}: DashboardPeriodFilterProps) {
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [tempDateRange, setTempDateRange] = useState<DateRange | undefined>(undefined);

  // Sincronizar estado temporário quando o calendário abre
  useEffect(() => {
    if (calendarOpen && customRange) {
      setTempDateRange({
        from: customRange.start,
        to: customRange.end,
      });
    } else if (calendarOpen) {
      setTempDateRange(undefined);
    }
  }, [calendarOpen, customRange]);

  const handleTempDateRangeSelect = useCallback((range: DateRange | undefined) => {
    setTempDateRange(range);
  }, []);

  const handleApplyPeriod = useCallback(() => {
    if (tempDateRange?.from && tempDateRange?.to) {
      onCustomRangeChange?.({
        start: tempDateRange.from,
        end: tempDateRange.to,
      });
      onChange("custom");
      setCalendarOpen(false);
    }
  }, [tempDateRange, onCustomRangeChange, onChange]);

  const handleClearTemp = useCallback(() => {
    setTempDateRange(undefined);
  }, []);

  const handleCancel = useCallback(() => {
    if (customRange) {
      setTempDateRange({
        from: customRange.start,
        to: customRange.end,
      });
    } else {
      setTempDateRange(undefined);
    }
    setCalendarOpen(false);
  }, [customRange]);

  const isPeriodComplete = tempDateRange?.from && tempDateRange?.to;
  const isPeriodStarted = tempDateRange?.from && !tempDateRange?.to;

  const formatDateRange = () => {
    if (customRange) {
      return `${format(customRange.start, "dd/MM/yy", { locale: ptBR })} - ${format(customRange.end, "dd/MM/yy", { locale: ptBR })}`;
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
    <div 
      className={cn(
        "inline-flex items-center gap-2",
        className
      )}
    >
      {/* Botões de filtros rápidos */}
      <div className="inline-flex items-center rounded-lg border border-border/50 bg-muted/30 p-0.5">
        {DASHBOARD_PERIOD_OPTIONS.map((option) => (
          <button
            key={option.value}
            onClick={() => onChange(option.value)}
            className={cn(
              "font-medium rounded-md transition-all",
              size === "sm" ? "px-2.5 py-1 text-xs" : "px-3 py-1.5 text-xs",
              value === option.value
                ? "bg-primary text-primary-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
            )}
          >
            {option.label}
          </button>
        ))}
      </div>

      {/* Calendário para período customizado */}
      <Popover open={calendarOpen} onOpenChange={setCalendarOpen}>
        <PopoverTrigger asChild>
          <Button
            variant={value === "custom" ? "default" : "outline"}
            size="sm"
            className={cn(
              "h-7 text-xs gap-1.5",
              value === "custom" && "bg-primary text-primary-foreground"
            )}
          >
            <CalendarIcon className="h-3.5 w-3.5" />
            {value === "custom" ? formatDateRange() : "Período"}
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
    </div>
  );
}
