import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { CURRENCY_SYMBOLS, SupportedCurrency } from "@/types/currency";

/**
 * Componente unificado para exibição de valores monetários
 * Garante padronização visual independente da moeda
 */

export interface MoneyDisplayProps {
  value: number;
  currency?: string;
  showCurrency?: boolean;
  size?: "xs" | "sm" | "md" | "lg" | "xl";
  variant?: "default" | "positive" | "negative" | "auto" | "muted";
  masked?: boolean;
  compact?: boolean;
  showBadge?: boolean | "always";
  className?: string;
  valueClassName?: string;
  decimals?: number;
  /** Se true, mostra "-" quando o valor for 0 */
  showDashOnZero?: boolean;
}

const sizeClasses = {
  xs: "text-[10px]",
  sm: "text-xs",
  md: "text-sm",
  lg: "text-base",
  xl: "text-lg",
};

const fontWeightClasses = {
  xs: "font-medium",
  sm: "font-medium",
  md: "font-semibold",
  lg: "font-semibold",
  xl: "font-bold",
};

export function formatMoneyValue(
  value: number,
  currency: string = "BRL",
  options?: { decimals?: number; compact?: boolean }
): string {
  const { decimals = 2, compact = false } = options || {};
  
  const symbol = CURRENCY_SYMBOLS[currency as SupportedCurrency] || currency;
  
  let formatted: string;
  
  if (compact && Math.abs(value) >= 1000) {
    if (Math.abs(value) >= 1000000) {
      formatted = (value / 1000000).toLocaleString("pt-BR", {
        minimumFractionDigits: 1,
        maximumFractionDigits: 1,
      }) + "M";
    } else {
      formatted = (value / 1000).toLocaleString("pt-BR", {
        minimumFractionDigits: 1,
        maximumFractionDigits: 1,
      }) + "K";
    }
  } else {
    formatted = value.toLocaleString("pt-BR", {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    });
  }
  
  return `${symbol} ${formatted}`;
}

export function getCurrencyColor(currency: string): string {
  const isUSD = currency === "USD" || currency === "USDT";
  return isUSD ? "text-cyan-400" : "";
}

export function MoneyDisplay({
  value,
  currency = "BRL",
  showCurrency = true,
  size = "sm",
  variant = "default",
  masked = false,
  compact = false,
  showBadge = false,
  className,
  valueClassName,
  decimals = 2,
  showDashOnZero = false,
}: MoneyDisplayProps) {
  // Se showDashOnZero e valor for 0, retorna "-"
  if (showDashOnZero && value === 0) {
    return (
      <span
        className={cn(
          sizeClasses[size],
          fontWeightClasses[size],
          "text-muted-foreground tabular-nums",
          className
        )}
      >
        -
      </span>
    );
  }
  const isUSD = currency === "USD" || currency === "USDT";
  const symbol = CURRENCY_SYMBOLS[currency as SupportedCurrency] || currency;
  
  // Determinar cor baseado no variant
  let colorClass = "";
  switch (variant) {
    case "positive":
      colorClass = isUSD ? "text-cyan-400" : "text-success";
      break;
    case "negative":
      colorClass = "text-destructive";
      break;
    case "auto":
      if (value > 0) {
        colorClass = isUSD ? "text-cyan-400" : "text-success";
      } else if (value < 0) {
        colorClass = "text-destructive";
      } else {
        colorClass = "text-muted-foreground";
      }
      break;
    case "muted":
      colorClass = "text-muted-foreground";
      break;
    default:
      colorClass = isUSD ? "text-cyan-400" : "";
  }
  
  // Formatar valor
  let displayValue: string;
  if (masked) {
    displayValue = `${symbol} ••••`;
  } else {
    displayValue = formatMoneyValue(value, currency, { decimals, compact });
  }
  
  if (!showCurrency) {
    // Remover símbolo do valor formatado
    displayValue = displayValue.replace(/^[^\d-]+\s*/, "");
  }
  
  // Determinar se deve mostrar badge
  const shouldShowBadge = showBadge === "always" || (showBadge && isUSD);
  const badgeLabel = currency.toUpperCase();
  const badgeColorClass = isUSD 
    ? "border-cyan-500/50 text-cyan-400" 
    : currency === "EUR" 
      ? "border-yellow-500/50 text-yellow-400"
      : currency === "GBP"
        ? "border-purple-500/50 text-purple-400"
        : "border-emerald-500/50 text-emerald-400"; // BRL e outros
  
  return (
    <span
      className={cn(
        sizeClasses[size],
        fontWeightClasses[size],
        colorClass,
        "tabular-nums",
        className
      )}
    >
      <span className={valueClassName}>{displayValue}</span>
      {shouldShowBadge && (
        <Badge
          variant="outline"
          className={cn("ml-1 text-[9px] px-1 py-0 h-4", badgeColorClass)}
        >
          {badgeLabel}
        </Badge>
      )}
    </span>
  );
}

/**
 * Componente para exibir valores em múltiplas moedas empilhados
 */
export interface MultiCurrencyDisplayProps {
  valueBRL?: number;
  valueUSD?: number;
  size?: "xs" | "sm" | "md" | "lg";
  variant?: "default" | "auto";
  masked?: boolean;
  className?: string;
  showZero?: boolean;
  stacked?: boolean;
  /** Se true, mostra "-" quando ambos os valores forem 0 */
  showDashOnZero?: boolean;
}

export function MultiCurrencyDisplay({
  valueBRL = 0,
  valueUSD = 0,
  size = "sm",
  variant = "default",
  masked = false,
  className,
  showZero = false,
  stacked = true,
  showDashOnZero = false,
}: MultiCurrencyDisplayProps) {
  const hasBRL = valueBRL !== 0 || showZero;
  const hasUSD = valueUSD !== 0;
  
  // Se showDashOnZero e ambos são zero, retorna "-"
  if (showDashOnZero && valueBRL === 0 && valueUSD === 0) {
    const sizeClasses = {
      xs: "text-[10px]",
      sm: "text-xs",
      md: "text-sm",
      lg: "text-base",
    };
    return (
      <span className={cn(sizeClasses[size], "font-medium text-muted-foreground tabular-nums", className)}>
        -
      </span>
    );
  }
  
  if (!hasBRL && !hasUSD) {
    return (
      <MoneyDisplay
        value={0}
        currency="BRL"
        size={size}
        variant="muted"
        masked={masked}
      />
    );
  }
  
  const containerClass = stacked ? "space-y-0.5" : "flex items-center gap-2";
  
  return (
    <div className={cn(containerClass, className)}>
      {(hasBRL || !hasUSD) && (
        <MoneyDisplay
          value={valueBRL}
          currency="BRL"
          size={size}
          variant={variant === "auto" ? "auto" : "default"}
          masked={masked}
        />
      )}
      {hasUSD && (
        <MoneyDisplay
          value={valueUSD}
          currency="USD"
          size={size}
          variant={variant === "auto" ? "auto" : "default"}
          masked={masked}
        />
      )}
    </div>
  );
}

export default MoneyDisplay;
