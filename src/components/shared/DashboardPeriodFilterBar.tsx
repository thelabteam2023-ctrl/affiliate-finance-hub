/**
 * Componente de Filtro Temporal Unificado para Dashboards
 * 
 * Padrão oficial: Mês | 3M | 6M | Ano | Tudo
 * Sem seleção manual de datas - apenas filtros rápidos
 */

import { DashboardPeriodFilter, DASHBOARD_PERIOD_OPTIONS } from "@/types/dashboardFilters";
import { cn } from "@/lib/utils";

interface DashboardPeriodFilterProps {
  value: DashboardPeriodFilter;
  onChange: (value: DashboardPeriodFilter) => void;
  className?: string;
  size?: "sm" | "default";
}

export function DashboardPeriodFilterBar({
  value,
  onChange,
  className,
  size = "default",
}: DashboardPeriodFilterProps) {
  return (
    <div 
      className={cn(
        "inline-flex items-center rounded-lg border border-border/50 bg-muted/30 p-0.5",
        className
      )}
    >
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
  );
}
