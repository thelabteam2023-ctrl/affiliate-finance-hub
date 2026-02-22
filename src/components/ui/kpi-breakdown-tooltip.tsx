import { ReactNode } from "react";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { ModuleContribution, KpiBreakdown, CurrencyBreakdownItem } from "@/types/moduleBreakdown";
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
  Minus,
  Percent
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
  cashback: Percent,
};

// Helper para formatar valor com símbolo da moeda
const formatarPorMoeda = (valor: number, moeda: string): string => {
  const simbolos: Record<string, string> = {
    BRL: "R$",
    USD: "$",
    EUR: "€",
    GBP: "£",
    USDT: "$",
    USDC: "$",
  };
  const simbolo = simbolos[moeda] || moeda + " ";
  return `${simbolo} ${valor.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
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
 * Também exibe breakdown por moeda quando disponível.
 */
export function KpiBreakdownTooltip({
  children,
  breakdown,
  formatValue,
  title = "Composição",
  showZeroValues = false,
  side = "bottom",
}: KpiBreakdownTooltipProps) {
  if (!breakdown || breakdown.contributions.length === 0) {
    return <>{children}</>;
  }

  const visibleContributions = showZeroValues
    ? breakdown.contributions
    : breakdown.contributions.filter((c) => c.value !== 0);

  if (visibleContributions.length === 0) {
    return <>{children}</>;
  }

  // Verifica se há breakdown por moeda para exibir
  const hasCurrencyBreakdown = breakdown.currencyBreakdown && breakdown.currencyBreakdown.length > 0;
  const hasMultipleCurrencies = hasCurrencyBreakdown && breakdown.currencyBreakdown!.length > 1;
  const hasDifferentCurrency = hasCurrencyBreakdown && 
    breakdown.currencyBreakdown!.some(c => c.moeda !== breakdown.currency);

  return (
    <TooltipProvider>
      <Tooltip delayDuration={200}>
        <TooltipTrigger asChild>{children}</TooltipTrigger>
        <TooltipContent 
          side={side} 
          className="max-w-[300px] p-3"
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

            {/* Breakdown por moeda (se disponível) */}
            {(hasMultipleCurrencies || hasDifferentCurrency) && (
              <div className="border-t border-border pt-2 mt-2">
                <p className="text-[10px] text-muted-foreground mb-1.5">Por moeda original:</p>
                <div className="space-y-1">
                  {breakdown.currencyBreakdown!.map((item) => (
                    <div key={item.moeda} className="flex items-center justify-between gap-3 text-xs">
                      <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                        {item.moeda}
                      </Badge>
                      <span className="font-medium">{formatarPorMoeda(item.valor, item.moeda)}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

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
              {(hasMultipleCurrencies || hasDifferentCurrency) && (
                <p className="text-[9px] text-muted-foreground mt-1">
                  Consolidado em {breakdown.currency} usando cotação do projeto
                </p>
              )}
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

            <div className="space-y-2">
              {visibleContributions.map((contribution) => {
                const IconComponent = MODULE_ICONS[contribution.moduleId] || Target;
                return (
                  <div
                    key={contribution.moduleId}
                    className="space-y-1"
                  >
                    <div className="flex items-center justify-between gap-3 text-xs">
                      <div className="flex items-center gap-1.5">
                        <IconComponent className="h-3.5 w-3.5 text-muted-foreground" />
                        <span className="text-muted-foreground">
                          {contribution.moduleName}
                        </span>
                      </div>
                      <span className="font-bold text-sm">
                        {contribution.value.toLocaleString()}
                      </span>
                    </div>
                    {contribution.details && (
                      <div className="ml-5 flex flex-col gap-0.5 text-xs">
                        {contribution.details.split(/\s+/).filter(Boolean).map((part, i) => {
                          const isGreen = part.includes('G');
                          const isRed = part.includes('R');
                          const isVoid = part.includes('V');
                          const num = part.replace(/[GRV]/g, '');
                          if (isGreen) return (
                            <div key={i} className="flex items-center justify-between gap-3">
                              <span className="flex items-center gap-1 text-emerald-500">
                                <span className="inline-block w-1.5 h-1.5 rounded-full bg-emerald-500" />
                                Greens
                              </span>
                              <span className="font-semibold text-emerald-500">{num}</span>
                            </div>
                          );
                          if (isRed) return (
                            <div key={i} className="flex items-center justify-between gap-3">
                              <span className="flex items-center gap-1 text-red-500">
                                <span className="inline-block w-1.5 h-1.5 rounded-full bg-red-500" />
                                Reds
                              </span>
                              <span className="font-semibold text-red-500">{num}</span>
                            </div>
                          );
                          if (isVoid) return (
                            <div key={i} className="flex items-center justify-between gap-3">
                              <span className="flex items-center gap-1 text-muted-foreground">
                                <span className="inline-block w-1.5 h-1.5 rounded-full bg-muted-foreground/60" />
                                Voids
                              </span>
                              <span className="font-semibold text-muted-foreground">{num}</span>
                            </div>
                          );
                          return null;
                        })}
                      </div>
                    )}
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
