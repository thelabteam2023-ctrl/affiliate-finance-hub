import { Wallet, Gift, Coins, TrendingUp } from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

interface SaldoBreakdownProps {
  saldoReal: number;
  saldoFreebet?: number;
  saldoBonus?: number;
  moeda?: string;
  showTotal?: boolean;
  compact?: boolean;
  className?: string;
}

const CURRENCY_SYMBOLS: Record<string, string> = {
  BRL: "R$",
  USD: "$",
  EUR: "€",
  GBP: "£",
};

export function formatCurrencyWithSymbol(value: number, moeda: string = "BRL"): string {
  const symbol = CURRENCY_SYMBOLS[moeda] || moeda;
  return `${symbol} ${value.toFixed(2)}`;
}

export function SaldoBreakdown({
  saldoReal,
  saldoFreebet = 0,
  saldoBonus = 0,
  moeda = "BRL",
  showTotal = true,
  compact = false,
  className = "",
}: SaldoBreakdownProps) {
  const saldoTotal = saldoReal + saldoFreebet + saldoBonus;
  const hasExtras = saldoFreebet > 0 || saldoBonus > 0;

  const format = (value: number) => formatCurrencyWithSymbol(value, moeda);

  if (compact) {
    return (
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <div className={`flex items-center gap-1 cursor-help ${className}`}>
              <TrendingUp className="h-3.5 w-3.5 text-primary" />
              <span className="font-semibold">{format(saldoTotal)}</span>
              {hasExtras && (
                <span className="text-xs text-muted-foreground">
                  ({saldoFreebet > 0 && `+FB`}{saldoBonus > 0 && `+B`})
                </span>
              )}
            </div>
          </TooltipTrigger>
          <TooltipContent className="space-y-1">
            <div className="flex items-center justify-between gap-4">
              <span className="text-xs flex items-center gap-1">
                <Wallet className="h-3 w-3" /> Real
              </span>
              <span className="font-medium">{format(saldoReal)}</span>
            </div>
            {saldoFreebet > 0 && (
              <div className="flex items-center justify-between gap-4">
                <span className="text-xs flex items-center gap-1 text-amber-400">
                  <Gift className="h-3 w-3" /> Freebet
                </span>
                <span className="font-medium text-amber-400">{format(saldoFreebet)}</span>
              </div>
            )}
            {saldoBonus > 0 && (
              <div className="flex items-center justify-between gap-4">
                <span className="text-xs flex items-center gap-1 text-purple-400">
                  <Coins className="h-3 w-3" /> Bônus
                </span>
                <span className="font-medium text-purple-400">{format(saldoBonus)}</span>
              </div>
            )}
            <div className="border-t pt-1 flex items-center justify-between gap-4">
              <span className="text-xs font-medium">Total</span>
              <span className="font-bold text-primary">{format(saldoTotal)}</span>
            </div>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  }

  return (
    <div className={`space-y-1.5 ${className}`}>
      {/* Saldo Total - Destaque */}
      {showTotal && hasExtras && (
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <div className="flex items-center justify-between p-1.5 rounded bg-primary/10 border border-primary/20 cursor-help">
                <span className="text-xs font-medium text-primary flex items-center gap-1">
                  <TrendingUp className="h-3 w-3" />
                  Saldo Operável
                </span>
                <span className="text-sm font-bold text-primary">
                  {format(saldoTotal)}
                </span>
              </div>
            </TooltipTrigger>
            <TooltipContent>
              <p>Real + Freebet + Bônus Ativo</p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      )}

      {/* Saldo Real */}
      <div className="flex items-center justify-between">
        <span className="text-xs text-muted-foreground flex items-center gap-1">
          <Wallet className="h-3 w-3" />
          Saldo Real
        </span>
        <span className="text-sm font-semibold">{format(saldoReal)}</span>
      </div>

      {/* Saldo Freebet */}
      {saldoFreebet > 0 && (
        <div className="flex items-center justify-between">
          <span className="text-xs text-muted-foreground flex items-center gap-1">
            <Gift className="h-3 w-3 text-amber-400" />
            Freebet
          </span>
          <span className="text-sm font-medium text-amber-400">{format(saldoFreebet)}</span>
        </div>
      )}

      {/* Saldo Bônus */}
      {saldoBonus > 0 && (
        <div className="flex items-center justify-between">
          <span className="text-xs text-muted-foreground flex items-center gap-1">
            <Coins className="h-3 w-3 text-purple-400" />
            Bônus Ativo
          </span>
          <span className="text-sm font-medium text-purple-400">{format(saldoBonus)}</span>
        </div>
      )}

      {/* Saldo Total inline se não tem extras */}
      {showTotal && !hasExtras && (
        <div className="flex items-center justify-between pt-1 border-t">
          <span className="text-xs font-medium">Total</span>
          <span className="text-sm font-bold">{format(saldoTotal)}</span>
        </div>
      )}
    </div>
  );
}
