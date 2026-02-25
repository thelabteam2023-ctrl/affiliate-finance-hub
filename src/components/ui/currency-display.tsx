/**
 * Componente de Exibição Multi-Moeda
 * 
 * Exibe valores com moeda original e referência em BRL
 * Segue a regra: "O usuário deve sempre saber qual é a moeda real da operação"
 */

import { cn } from "@/lib/utils";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "./tooltip";
import { useCurrencySnapshot, type SupportedCurrency } from "@/hooks/useCurrencySnapshot";
import { ArrowRightLeft, Info } from "lucide-react";

interface CurrencyDisplayProps {
  valor: number;
  moeda: SupportedCurrency;
  // Snapshot existente (se já salvo no banco)
  snapshot?: {
    cotacao?: number | null;
    cotacao_at?: string | null;
    valor_brl_referencia?: number | null;
  };
  // Opções de exibição
  size?: "sm" | "md" | "lg";
  showReference?: boolean;
  showTooltip?: boolean;
  variant?: "default" | "positive" | "negative" | "muted";
  className?: string;
}

export function CurrencyDisplay({
  valor,
  moeda,
  snapshot,
  size = "md",
  showReference = true,
  showTooltip = true,
  variant = "default",
  className,
}: CurrencyDisplayProps) {
  const { prepareDisplay, formatWithReference } = useCurrencySnapshot();
  
  const display = prepareDisplay(valor, moeda, snapshot);
  const formatted = formatWithReference(display);
  
  const sizeClasses = {
    sm: "text-sm",
    md: "text-base",
    lg: "text-lg font-semibold",
  };
  
  const variantClasses = {
    default: "text-foreground",
    positive: "text-emerald-500",
    negative: "text-red-500",
    muted: "text-muted-foreground",
  };
  
  // Se é BRL ou não precisa mostrar referência, exibe simples
  if (!display.isForeignCurrency || !showReference) {
    return (
      <span className={cn(sizeClasses[size], variantClasses[variant], className)}>
        {formatted.primary}
      </span>
    );
  }
  
  // Exibição com referência BRL
  const content = (
    <span className={cn("inline-flex items-center gap-1.5", className)}>
      <span className={cn(sizeClasses[size], variantClasses[variant])}>
        {formatted.primary}
      </span>
      {formatted.reference && (
        <>
          <ArrowRightLeft className="w-3 h-3 text-muted-foreground/50" />
          <span className={cn(
            sizeClasses[size === "lg" ? "md" : "sm"],
            "text-muted-foreground"
          )}>
            {formatted.reference}
          </span>
        </>
      )}
    </span>
  );
  
  if (!showTooltip || !formatted.cotacaoInfo) {
    return content;
  }
  
  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <span className="inline-flex items-center gap-1 cursor-help">
            {content}
            <Info className="w-3 h-3 text-muted-foreground/40" />
          </span>
        </TooltipTrigger>
        <TooltipContent side="top" className="max-w-xs">
          <div className="text-xs space-y-1">
            <p className="font-medium">Conversão para referência</p>
            <p className="text-muted-foreground">{formatted.cotacaoInfo}</p>
            <p className="text-muted-foreground/70 text-[10px]">
              Valor de referência em BRL. O valor real é na moeda da operação.
            </p>
          </div>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

/**
 * Componente para exibir saldo jogável (real + bônus)
 */
interface PlayableBalanceDisplayProps {
  saldoReal: number;
  saldoBonus: number;
  moeda: SupportedCurrency;
  snapshot?: {
    cotacao?: number | null;
    cotacao_at?: string | null;
  };
  size?: "sm" | "md" | "lg";
  showBreakdown?: boolean;
  className?: string;
}

export function PlayableBalanceDisplay({
  saldoReal,
  saldoBonus,
  moeda,
  snapshot,
  size = "md",
  showBreakdown = true,
  className,
}: PlayableBalanceDisplayProps) {
  const { formatCurrency, prepareDisplay, formatWithReference, isForeignCurrency } = useCurrencySnapshot();
  
  const saldoJogavel = saldoReal + saldoBonus;
  const display = prepareDisplay(saldoJogavel, moeda, snapshot ? {
    cotacao: snapshot.cotacao,
    cotacao_at: snapshot.cotacao_at,
    valor_brl_referencia: snapshot.cotacao ? saldoJogavel * snapshot.cotacao : null,
  } : undefined);
  
  const formatted = formatWithReference(display);
  const isForeign = isForeignCurrency(moeda);
  
  const sizeClasses = {
    sm: "text-sm",
    md: "text-base",
    lg: "text-lg font-semibold",
  };
  
  return (
    <div className={cn("space-y-1", className)}>
      <div className="flex items-center gap-2">
        <span className={cn(sizeClasses[size], "text-foreground font-medium")}>
          {formatted.primary}
        </span>
        {isForeign && formatted.reference && (
          <>
            <ArrowRightLeft className="w-3 h-3 text-muted-foreground/50" />
            <span className="text-sm text-muted-foreground">
              {formatted.reference}
            </span>
          </>
        )}
      </div>
      
      {showBreakdown && (saldoReal > 0 || saldoBonus > 0) && (
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <span>Real: {formatCurrency(saldoReal, moeda)}</span>
          <span>•</span>
          <span>Bônus: {formatCurrency(saldoBonus, moeda)}</span>
        </div>
      )}
    </div>
  );
}

/**
 * Badge compacto para indicar moeda
 */
interface CurrencyBadgeProps {
  moeda: SupportedCurrency;
  size?: "xs" | "sm" | "md";
  className?: string;
}

export function CurrencyBadge({ moeda, size = "sm", className }: CurrencyBadgeProps) {
  const sizeClasses = {
    xs: "text-[10px] px-1 py-0.5",
    sm: "text-xs px-1.5 py-0.5",
    md: "text-sm px-2 py-1",
  };
  
  const colorClasses: Record<string, string> = {
    BRL: "bg-emerald-500/10 text-emerald-500 border-emerald-500/20",
    USD: "bg-blue-500/10 text-blue-500 border-blue-500/20",
    USDT: "bg-teal-500/10 text-teal-500 border-teal-500/20",
    USDC: "bg-teal-500/10 text-teal-500 border-teal-500/20",
    EUR: "bg-indigo-500/10 text-indigo-500 border-indigo-500/20",
    GBP: "bg-purple-500/10 text-purple-500 border-purple-500/20",
    BTC: "bg-orange-500/10 text-orange-500 border-orange-500/20",
    ETH: "bg-violet-500/10 text-violet-500 border-violet-500/20",
  };
  
  const colorClass = colorClasses[moeda] || "bg-muted text-muted-foreground border-border";
  
  return (
    <span className={cn(
      "inline-flex items-center rounded border font-medium",
      sizeClasses[size],
      colorClass,
      className
    )}>
      {moeda}
    </span>
  );
}
