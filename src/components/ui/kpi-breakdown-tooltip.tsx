import { ReactNode } from "react";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { ModuleContribution, KpiBreakdown } from "@/types/moduleBreakdown";
import { 
  TrendingUp, 
  TrendingDown, 
  Gift, 
  Coins, 
  ArrowLeftRight, 
  Sparkles, 
  Zap, 
  Target,
  Dices,
  Minus
} from "lucide-react";

// Mapa de ícones disponíveis por módulo
const MODULE_ICONS: Record<string, React.ElementType> = {
  apostas: Target,
  giros_gratis: Dices,
  freebets: Gift,
  bonus: Coins,
  surebet: ArrowLeftRight,
  valuebet: Sparkles,
  duplogreen: Zap,
  perdas: TrendingDown,
  ajustes: Minus,
};

interface KpiBreakdownTooltipProps {
  children: ReactNode;
  breakdown: KpiBreakdown | null;
  formatValue: (value: number) => string;
  title?: string;
  showZeroValues?: boolean;
  side?: "top" | "bottom" | "left" | "right";
}

/**
 * Tooltip dinâmico que mostra a composição de um KPI por módulos.
 * 
 * Características:
 * - Agnóstico a módulos específicos
 * - Adiciona novos módulos automaticamente
 * - Valores positivos/negativos diferenciados
 * - Compacto e escaneável
 */
export function KpiBreakdownTooltip({
  children,
  breakdown,
  formatValue,
  title = "Composição",
  showZeroValues = false,
  side = "bottom",
}: KpiBreakdownTooltipProps) {
  // Se não há breakdown, renderiza só o children
  if (!breakdown || breakdown.contributions.length === 0) {
    return <>{children}</>;
  }

  // Filtra contribuições (oculta zeros se configurado)
  const visibleContributions = showZeroValues
    ? breakdown.contributions
    : breakdown.contributions.filter((c) => c.value !== 0);

  // Se não há contribuições visíveis, renderiza só o children
  if (visibleContributions.length === 0) {
    return <>{children}</>;
  }

  return (
    <TooltipProvider>
      <Tooltip delayDuration={200}>
        <TooltipTrigger asChild>{children}</TooltipTrigger>
        <TooltipContent 
          side={side} 
          className="max-w-[280px] p-3"
          sideOffset={8}
        >
          <div className="space-y-2">
            {/* Header */}
            <p className="text-xs font-semibold text-foreground border-b border-border pb-1.5">
              {title}
            </p>

            {/* Contribuições por módulo */}
            <div className="space-y-1.5">
              {visibleContributions.map((contribution) => (
                <ModuleContributionRow
                  key={contribution.moduleId}
                  contribution={contribution}
                  formatValue={formatValue}
                />
              ))}
            </div>

            {/* Total */}
            <div className="border-t border-border pt-1.5 mt-2">
              <div className="flex justify-between items-center">
                <span className="text-xs font-semibold">Total Consolidado</span>
                <span
                  className={cn(
                    "text-sm font-bold",
                    breakdown.total >= 0 ? "text-emerald-500" : "text-red-500"
                  )}
                >
                  {formatValue(breakdown.total)}
                </span>
              </div>
            </div>
          </div>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

interface ModuleContributionRowProps {
  contribution: ModuleContribution;
  formatValue: (value: number) => string;
}

function ModuleContributionRow({
  contribution,
  formatValue,
}: ModuleContributionRowProps) {
  const { moduleId, moduleName, value, color, details } = contribution;
  
  // Seleciona ícone do módulo
  const IconComponent = MODULE_ICONS[moduleId] || Target;

  // Determina cor do valor
  const valueColorClass = cn({
    "text-emerald-500": color === "positive" || (color === "default" && value > 0),
    "text-red-500": color === "negative" || (color === "default" && value < 0),
    "text-amber-500": color === "warning",
    "text-muted-foreground": color === "muted" || value === 0,
  });

  // Formata valor com sinal
  const formattedValue = value >= 0 
    ? `+${formatValue(value)}` 
    : formatValue(value);

  return (
    <div className="flex items-center justify-between gap-3 text-xs">
      <div className="flex items-center gap-1.5 min-w-0">
        <IconComponent className="h-3 w-3 text-muted-foreground flex-shrink-0" />
        <span className="text-muted-foreground truncate">{moduleName}</span>
        {details && (
          <span className="text-muted-foreground/60 text-[10px]">({details})</span>
        )}
      </div>
      <span className={cn("font-medium flex-shrink-0", valueColorClass)}>
        {formattedValue}
      </span>
    </div>
  );
}

/**
 * Versão simplificada para KPIs de contagem (Apostas)
 */
interface CountBreakdownTooltipProps {
  children: ReactNode;
  breakdown: KpiBreakdown | null;
  title?: string;
  side?: "top" | "bottom" | "left" | "right";
}

export function CountBreakdownTooltip({
  children,
  breakdown,
  title = "Composição",
  side = "bottom",
}: CountBreakdownTooltipProps) {
  if (!breakdown || breakdown.contributions.length === 0) {
    return <>{children}</>;
  }

  const visibleContributions = breakdown.contributions.filter((c) => c.value > 0);

  if (visibleContributions.length === 0) {
    return <>{children}</>;
  }

  return (
    <TooltipProvider>
      <Tooltip delayDuration={200}>
        <TooltipTrigger asChild>{children}</TooltipTrigger>
        <TooltipContent 
          side={side} 
          className="max-w-[260px] p-3"
          sideOffset={8}
        >
          <div className="space-y-2">
            <p className="text-xs font-semibold text-foreground border-b border-border pb-1.5">
              {title}
            </p>

            <div className="space-y-1.5">
              {visibleContributions.map((contribution) => {
                const IconComponent = MODULE_ICONS[contribution.moduleId] || Target;
                return (
                  <div
                    key={contribution.moduleId}
                    className="flex items-center justify-between gap-3 text-xs"
                  >
                    <div className="flex items-center gap-1.5">
                      <IconComponent className="h-3 w-3 text-muted-foreground" />
                      <span className="text-muted-foreground">
                        {contribution.moduleName}
                      </span>
                    </div>
                    <span className="font-medium">
                      {contribution.value.toLocaleString()}
                      {contribution.details && (
                        <span className="text-muted-foreground/60 ml-1">
                          {contribution.details}
                        </span>
                      )}
                    </span>
                  </div>
                );
              })}
            </div>

            <div className="border-t border-border pt-1.5">
              <div className="flex justify-between items-center">
                <span className="text-xs font-semibold">Total</span>
                <span className="text-sm font-bold">
                  {breakdown.total.toLocaleString()}
                </span>
              </div>
            </div>
          </div>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
