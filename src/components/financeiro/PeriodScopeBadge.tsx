import { Calendar, Clock } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import {
  DashboardPeriodFilter,
  getDashboardPeriodDescription,
} from "@/types/dashboardFilters";

interface Props {
  /** "periodo" = sensível ao filtro temporal; "atual" = snapshot em tempo real */
  scope: "periodo" | "atual";
  /** Filtro ativo (obrigatório quando scope = "periodo") */
  filter?: DashboardPeriodFilter;
  customRange?: { start: Date; end: Date };
  /** Texto auxiliar para o tooltip do scope "atual" */
  realtimeHint?: string;
  className?: string;
}

/**
 * Pílula compacta usada nos cards do Financeiro para deixar
 * explícita a janela temporal aplicada — ou indicar que a métrica
 * é um snapshot em tempo real.
 */
export function PeriodScopeBadge({
  scope,
  filter,
  customRange,
  realtimeHint,
  className,
}: Props) {
  if (scope === "atual") {
    return (
      <TooltipProvider>
        <Tooltip delayDuration={200}>
          <TooltipTrigger asChild>
            <Badge
              variant="outline"
              className={cn(
                "h-5 gap-1 px-1.5 text-[10px] font-normal text-muted-foreground bg-muted/40 border-border/60",
                className
              )}
            >
              <Clock className="h-3 w-3" />
              Posição atual
            </Badge>
          </TooltipTrigger>
          <TooltipContent side="top" className="max-w-[260px] text-xs">
            {realtimeHint ??
              "Saldo em tempo real — não é afetado pelo filtro de período do topo."}
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  }

  const desc = getDashboardPeriodDescription(filter ?? "mes", customRange);

  return (
    <TooltipProvider>
      <Tooltip delayDuration={200}>
        <TooltipTrigger asChild>
          <Badge
            variant="outline"
            className={cn(
              "h-5 gap-1 px-1.5 text-[10px] font-normal uppercase tracking-wide text-muted-foreground bg-muted/40 border-border/60",
              className
            )}
          >
            <Calendar className="h-3 w-3" />
            {desc.shortLabel}
          </Badge>
        </TooltipTrigger>
        <TooltipContent side="top" className="max-w-[280px] text-xs">
          <div className="font-medium">Janela aplicada</div>
          <div className="text-muted-foreground">{desc.rangeLabel}</div>
          <div className="text-muted-foreground mt-1">
            Controlada pelo filtro de período no topo da página.
          </div>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}