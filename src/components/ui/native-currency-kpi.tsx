import { ReactNode, useMemo } from "react";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { Info } from "lucide-react";
import { CURRENCY_SYMBOLS, SupportedCurrency } from "@/types/currency";

/**
 * Entrada de valor por moeda nativa
 */
export interface CurrencyEntry {
  currency: string;
  value: number;
}

export interface NativeCurrencyKpiProps {
  /** Array de valores por moeda */
  entries: CurrencyEntry[];
  /** Tamanho do texto */
  size?: "xs" | "sm" | "md" | "lg";
  /** Variante de cor automática baseada no valor */
  variant?: "default" | "auto";
  /** Mascarar valores sensíveis */
  masked?: boolean;
  /** Classes adicionais */
  className?: string;
  /** Se true, mostra "-" quando todos os valores forem 0 */
  showDashOnZero?: boolean;
  /** Lado do tooltip */
  tooltipSide?: "top" | "bottom" | "left" | "right";
}

const sizeClasses = {
  xs: "text-[10px]",
  sm: "text-xs",
  md: "text-sm",
  lg: "text-base",
};

const fontWeightClasses = {
  xs: "font-medium",
  sm: "font-medium",
  md: "font-semibold",
  lg: "font-bold",
};

/**
 * Formata valor monetário com símbolo da moeda
 */
function formatCurrencyValue(value: number, currency: string): string {
  const symbol = CURRENCY_SYMBOLS[currency as SupportedCurrency] || currency;
  const formatted = value.toLocaleString("pt-BR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return `${symbol} ${formatted}`;
}

/**
 * Retorna cor baseada na moeda
 */
function getCurrencyBadgeClass(currency: string): string {
  switch (currency) {
    case "USD":
    case "USDT":
    case "USDC":
      return "bg-cyan-500/10 text-cyan-500 border-cyan-500/30";
    case "EUR":
      return "bg-blue-500/10 text-blue-500 border-blue-500/30";
    case "GBP":
      return "bg-purple-500/10 text-purple-500 border-purple-500/30";
    case "MXN":
      return "bg-green-500/10 text-green-500 border-green-500/30";
    case "MYR":
      return "bg-yellow-500/10 text-yellow-500 border-yellow-500/30";
    case "ARS":
      return "bg-sky-500/10 text-sky-500 border-sky-500/30";
    case "COP":
      return "bg-orange-500/10 text-orange-500 border-orange-500/30";
    default:
      return "bg-emerald-500/10 text-emerald-500 border-emerald-500/30"; // BRL
  }
}

/**
 * KPI compacto para exibição de valores multi-moeda em contextos transversais (sem projeto único).
 * Exibe o valor da moeda majoritária como principal, com tooltip mostrando breakdown por moeda nativa.
 * 
 * Diferente do MultiCurrencyDisplay que empilha verticalmente, este componente:
 * - Mostra apenas 1 valor principal (moeda com maior volume absoluto)
 * - Exibe ícone de info quando há múltiplas moedas
 * - Tooltip mostra breakdown completo por moeda nativa
 */
export function NativeCurrencyKpi({
  entries,
  size = "sm",
  variant = "default",
  masked = false,
  className,
  showDashOnZero = false,
  tooltipSide = "bottom",
}: NativeCurrencyKpiProps) {
  // Todos os hooks devem vir antes de qualquer return condicional
  const nonZeroEntries = useMemo(
    () => entries.filter((e) => e.value !== 0),
    [entries]
  );

  const sortedEntries = useMemo(
    () => [...nonZeroEntries].sort((a, b) => Math.abs(b.value) - Math.abs(a.value)),
    [nonZeroEntries]
  );

  const primaryEntry = sortedEntries[0];
  const hasMultipleCurrencies = nonZeroEntries.length > 1;

  // Se não há valores não-zero e showDashOnZero, mostrar "-"
  if (nonZeroEntries.length === 0) {
    if (showDashOnZero) {
      return (
        <span
          className={cn(
            sizeClasses[size],
            fontWeightClasses[size],
            "text-muted-foreground",
            className
          )}
        >
          -
        </span>
      );
    }
    // Mostrar zero na moeda padrão (BRL)
    const zeroEntry = entries.find((e) => e.currency === "BRL") || entries[0];
    if (!zeroEntry) return null;
    
    return (
      <span
        className={cn(
          sizeClasses[size],
          fontWeightClasses[size],
          "text-muted-foreground",
          className
        )}
      >
        {masked ? "••••••" : formatCurrencyValue(0, zeroEntry.currency)}
      </span>
    );
  }

  // Determinar cor do valor baseado na variante
  const getValueColor = (value: number): string => {
    if (variant === "auto") {
      if (value > 0) return "text-emerald-500";
      if (value < 0) return "text-red-500";
    }
    return "";
  };

  const primaryValueDisplay = masked
    ? "••••••"
    : formatCurrencyValue(primaryEntry.value, primaryEntry.currency);

  // Renderiza o valor principal
  const PrimaryValue = (
    <span
      className={cn(
        sizeClasses[size],
        fontWeightClasses[size],
        getValueColor(primaryEntry.value),
        className
      )}
    >
      {primaryValueDisplay}
    </span>
  );

  // Se apenas uma moeda, não precisa de tooltip
  if (!hasMultipleCurrencies) {
    return PrimaryValue;
  }

  // Múltiplas moedas: mostrar valor principal + ícone info + tooltip
  return (
    <TooltipProvider>
      <Tooltip delayDuration={200}>
        <TooltipTrigger asChild>
          <span className={cn("inline-flex items-center gap-1 cursor-help", className)}>
            {PrimaryValue}
            <Info className="h-3 w-3 text-muted-foreground/60 hover:text-muted-foreground transition-colors" />
          </span>
        </TooltipTrigger>
        <TooltipContent
          side={tooltipSide}
          className="max-w-[280px] p-3"
          sideOffset={8}
        >
          <div className="space-y-2">
            {/* Header */}
            <p className="text-xs font-semibold text-foreground border-b border-border pb-1.5">
              Breakdown por Moeda Nativa
            </p>

            {/* Lista de moedas */}
            <div className="space-y-1.5">
              {sortedEntries.map((entry) => (
                <div
                  key={entry.currency}
                  className="flex items-center justify-between gap-3 text-xs"
                >
                  <Badge
                    variant="outline"
                    className={cn(
                      "text-[10px] px-1.5 py-0 h-5 font-medium",
                      getCurrencyBadgeClass(entry.currency)
                    )}
                  >
                    {entry.currency}
                  </Badge>
                  <span
                    className={cn(
                      "font-medium tabular-nums",
                      variant === "auto" && entry.value > 0 && "text-emerald-500",
                      variant === "auto" && entry.value < 0 && "text-red-500"
                    )}
                  >
                    {masked ? "••••••" : formatCurrencyValue(entry.value, entry.currency)}
                  </span>
                </div>
              ))}
            </div>

            {/* Footer explicativo */}
            <p className="text-[10px] text-muted-foreground border-t border-border pt-1.5">
              Valores exibidos na moeda nativa de cada operação
            </p>
          </div>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

/**
 * Versão compacta que aceita props legadas (valueBRL, valueUSD) para compatibilidade
 */
export interface LegacyNativeCurrencyKpiProps
  extends Omit<NativeCurrencyKpiProps, "entries"> {
  valueBRL?: number;
  valueUSD?: number;
  /** Entradas adicionais além de BRL/USD */
  additionalEntries?: CurrencyEntry[];
}

export function NativeCurrencyKpiLegacy({
  valueBRL = 0,
  valueUSD = 0,
  additionalEntries = [],
  ...props
}: LegacyNativeCurrencyKpiProps) {
  const entries: CurrencyEntry[] = useMemo(
    () => [
      { currency: "BRL", value: valueBRL },
      { currency: "USD", value: valueUSD },
      ...additionalEntries,
    ],
    [valueBRL, valueUSD, additionalEntries]
  );

  return <NativeCurrencyKpi entries={entries} {...props} />;
}
