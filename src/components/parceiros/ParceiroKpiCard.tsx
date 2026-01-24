import { ReactNode } from "react";
import { Info } from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { CurrencyEntry } from "@/components/ui/native-currency-kpi";

interface ParceiroKpiCardProps {
  icon: ReactNode;
  label: string;
  /** Entries em múltiplas moedas nativas */
  entries: CurrencyEntry[];
  /** Total consolidado em BRL (quando filtro = "todas") */
  consolidadoBRL?: number;
  /** Se deve mostrar o breakdown por moeda */
  showBreakdown?: boolean;
  /** Se o valor está mascarado */
  masked?: boolean;
  /** Variante de cor automática (positivo/negativo) */
  variant?: "default" | "auto";
  /** Classe CSS adicional para o card */
  cardClassName?: string;
  /** Classe CSS adicional para o ícone */
  iconClassName?: string;
  /** Classe CSS adicional para o label */
  labelClassName?: string;
}

// Formatar valor com símbolo da moeda
const formatCurrencyValue = (value: number, currency: string): string => {
  const symbols: Record<string, string> = {
    BRL: "R$",
    USD: "$",
    EUR: "€",
    GBP: "£",
    MYR: "RM",
    MXN: "MX$",
    ARS: "AR$",
    COP: "COP",
    USDT: "$",
    USDC: "$",
  };
  const symbol = symbols[currency] || currency + " ";
  return `${symbol} ${value.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
};

// Badge classes por moeda
const getCurrencyBadgeClass = (currency: string): string => {
  switch (currency) {
    case "USD":
    case "USDT":
    case "USDC":
      return "bg-emerald-500/10 text-emerald-600 border-emerald-500/30";
    case "EUR":
      return "bg-blue-500/10 text-blue-600 border-blue-500/30";
    case "GBP":
      return "bg-purple-500/10 text-purple-600 border-purple-500/30";
    case "MYR":
      return "bg-amber-500/10 text-amber-600 border-amber-500/30";
    case "MXN":
      return "bg-teal-500/10 text-teal-600 border-teal-500/30";
    case "ARS":
      return "bg-sky-500/10 text-sky-600 border-sky-500/30";
    case "COP":
      return "bg-orange-500/10 text-orange-600 border-orange-500/30";
    default:
      return "bg-muted text-muted-foreground";
  }
};

export function ParceiroKpiCard({
  icon,
  label,
  entries,
  consolidadoBRL,
  showBreakdown = false,
  masked = false,
  variant = "default",
  cardClassName,
  iconClassName,
  labelClassName,
}: ParceiroKpiCardProps) {
  // Filtrar entries com valor zero
  const nonZeroEntries = entries.filter(e => e.value !== 0);
  
  // Determinar se está mostrando valor consolidado em BRL
  const isConsolidado = consolidadoBRL !== undefined && showBreakdown;
  
  // Determinar o total para exibição
  // Quando consolidado, usa o valor em BRL; senão, soma os entries na moeda nativa
  const displayValue = isConsolidado ? consolidadoBRL : entries.reduce((sum, e) => sum + e.value, 0);
  
  // Moeda de exibição: BRL quando consolidado, senão a moeda do primeiro entry
  const displayCurrency = isConsolidado ? "BRL" : (entries[0]?.currency || "BRL");
  
  // Determinar cor baseada no variant
  const getValueColor = () => {
    if (variant !== "auto") return "";
    if (displayValue > 0) return "text-success";
    if (displayValue < 0) return "text-destructive";
    return "";
  };

  // Verificar se há múltiplas moedas ou moeda diferente de BRL (para mostrar breakdown)
  const hasMultipleCurrencies = entries.length > 1;
  const hasForeignCurrency = entries.some(e => e.currency !== "BRL");
  const shouldShowBreakdown = showBreakdown && (hasMultipleCurrencies || hasForeignCurrency);

  const formattedValue = masked 
    ? "••••••" 
    : formatCurrencyValue(displayValue, displayCurrency);

  return (
    <div className={cn("flex items-start gap-2 p-2.5 rounded-lg bg-muted/30 border border-border", cardClassName)}>
      <div className={cn("shrink-0 mt-0.5", iconClassName)}>
        {icon}
      </div>
      <div className="min-w-0 flex-1">
        <p className={cn("text-[10px] text-muted-foreground uppercase tracking-wide", labelClassName)}>{label}</p>
        <div className="flex items-center gap-1">
          <span className={cn("text-sm font-semibold", getValueColor())}>
            {formattedValue}
          </span>
          
          {/* Tooltip com breakdown por moeda */}
          {shouldShowBreakdown && !masked && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Info className="h-3 w-3 text-muted-foreground cursor-help hover:text-foreground transition-colors" />
              </TooltipTrigger>
              <TooltipContent side="bottom" className="max-w-xs">
                <div className="space-y-1.5">
                  <p className="text-xs font-medium mb-2">Valores por moeda original:</p>
                  {nonZeroEntries.map((entry) => (
                    <div key={entry.currency} className="flex items-center justify-between gap-4 text-xs">
                      <Badge 
                        variant="outline" 
                        className={cn("text-[10px] px-1.5 py-0", getCurrencyBadgeClass(entry.currency))}
                      >
                        {entry.currency}
                      </Badge>
                      <span className={cn(
                        "font-medium",
                        variant === "auto" && entry.value > 0 && "text-success",
                        variant === "auto" && entry.value < 0 && "text-destructive"
                      )}>
                        {formatCurrencyValue(entry.value, entry.currency)}
                      </span>
                    </div>
                  ))}
                  {hasForeignCurrency && (
                    <p className="text-[10px] text-muted-foreground mt-2 pt-2 border-t">
                      Consolidado em BRL usando cotação atual
                    </p>
                  )}
                </div>
              </TooltipContent>
            </Tooltip>
          )}
        </div>
      </div>
    </div>
  );
}
