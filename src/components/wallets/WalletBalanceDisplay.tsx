/**
 * Componente para exibir os 3 saldos de uma wallet crypto:
 * - Saldo Total
 * - Em Trânsito (locked)
 * - Disponível
 */

import { cn } from "@/lib/utils";
import { Loader2, Lock, Wallet, ArrowRightLeft } from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Badge } from "@/components/ui/badge";

export interface WalletBalanceDisplayProps {
  balanceTotal: number;
  balanceLocked: number;
  balanceAvailable: number;
  coin?: string | null;
  loading?: boolean;
  variant?: "full" | "compact" | "inline";
  showLabels?: boolean;
  className?: string;
}

export function WalletBalanceDisplay({
  balanceTotal,
  balanceLocked,
  balanceAvailable,
  coin,
  loading = false,
  variant = "full",
  showLabels = true,
  className,
}: WalletBalanceDisplayProps) {
  const formatValue = (value: number) => {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(value);
  };

  if (loading) {
    return (
      <div className={cn("flex items-center justify-center py-2", className)}>
        <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const hasLockedFunds = balanceLocked > 0;

  // Variant: inline - apenas o disponível com tooltip
  if (variant === "inline") {
    return (
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <span className={cn(
              "font-mono text-sm cursor-help",
              hasLockedFunds ? "text-warning" : "text-primary",
              className
            )}>
              {formatValue(balanceAvailable)}
              {hasLockedFunds && <Lock className="inline-block h-3 w-3 ml-1 opacity-70" />}
            </span>
          </TooltipTrigger>
          <TooltipContent side="top" className="p-3">
            <div className="space-y-1.5 text-xs">
              <div className="flex justify-between gap-4">
                <span className="text-muted-foreground">Total:</span>
                <span className="font-mono">{formatValue(balanceTotal)}</span>
              </div>
              {hasLockedFunds && (
                <div className="flex justify-between gap-4 text-warning">
                  <span>Em trânsito:</span>
                  <span className="font-mono">-{formatValue(balanceLocked)}</span>
                </div>
              )}
              <div className="flex justify-between gap-4 font-medium border-t pt-1.5">
                <span>Disponível:</span>
                <span className="font-mono text-primary">{formatValue(balanceAvailable)}</span>
              </div>
            </div>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  }

  // Variant: compact - uma linha com badges
  if (variant === "compact") {
    return (
      <div className={cn("flex items-center gap-2 flex-wrap", className)}>
        <Badge variant="outline" className="gap-1 text-xs">
          <Wallet className="h-3 w-3" />
          {formatValue(balanceTotal)}
        </Badge>
        {hasLockedFunds && (
          <Badge variant="secondary" className="gap-1 text-xs text-warning bg-warning/10">
            <ArrowRightLeft className="h-3 w-3" />
            {formatValue(balanceLocked)}
          </Badge>
        )}
        <Badge className="gap-1 text-xs bg-primary/20 text-primary border-primary/30">
          <span>Disp:</span>
          {formatValue(balanceAvailable)}
        </Badge>
      </div>
    );
  }

  // Variant: full - três linhas completas
  return (
    <div className={cn("space-y-2 text-sm", className)}>
      {/* Saldo Total */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-muted-foreground">
          <Wallet className="h-4 w-4" />
          {showLabels && <span>Saldo Total</span>}
        </div>
        <span className="font-mono">
          {formatValue(balanceTotal)}
          {coin && <span className="text-xs text-muted-foreground ml-1">USD</span>}
        </span>
      </div>

      {/* Em Trânsito (apenas se > 0) */}
      {hasLockedFunds && (
        <div className="flex items-center justify-between text-warning">
          <div className="flex items-center gap-2">
            <ArrowRightLeft className="h-4 w-4" />
            {showLabels && <span>Em Trânsito</span>}
          </div>
          <span className="font-mono">
            -{formatValue(balanceLocked)}
          </span>
        </div>
      )}

      {/* Saldo Disponível */}
      <div className="flex items-center justify-between border-t pt-2">
        <div className="flex items-center gap-2 font-medium">
          <Lock className={cn("h-4 w-4", hasLockedFunds ? "text-warning" : "text-primary")} />
          {showLabels && <span>Disponível</span>}
        </div>
        <span className={cn(
          "font-mono font-semibold",
          hasLockedFunds ? "text-warning" : "text-primary"
        )}>
          {formatValue(balanceAvailable)}
        </span>
      </div>
    </div>
  );
}

/**
 * Componente simplificado para exibir apenas o saldo disponível
 * com indicador visual de fundos em trânsito
 */
export function WalletAvailableBalance({
  available,
  locked = 0,
  className,
}: {
  available: number;
  locked?: number;
  className?: string;
}) {
  const hasLocked = locked > 0;
  
  const formatValue = (value: number) => {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      minimumFractionDigits: 2,
    }).format(value);
  };

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <span className={cn(
            "inline-flex items-center gap-1",
            hasLocked && "text-warning",
            className
          )}>
            {formatValue(available)}
            {hasLocked && <Lock className="h-3 w-3" />}
          </span>
        </TooltipTrigger>
        {hasLocked && (
          <TooltipContent>
            <p className="text-xs">
              {formatValue(locked)} em trânsito
            </p>
          </TooltipContent>
        )}
      </Tooltip>
    </TooltipProvider>
  );
}
