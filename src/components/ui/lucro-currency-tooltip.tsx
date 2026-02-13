import { ReactNode } from "react";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

export interface LucroCurrencyBreakdownItem {
  moeda: string;
  valor: number;
}

interface LucroCurrencyTooltipProps {
  children: ReactNode;
  lucroPorMoeda: LucroCurrencyBreakdownItem[];
  totalConsolidado: number;
  moedaConsolidacao: string;
  formatValue: (value: number) => string;
  side?: "top" | "bottom" | "left" | "right";
}

const formatarPorMoeda = (valor: number, moeda: string): string => {
  const simbolos: Record<string, string> = {
    BRL: "R$", USD: "$", EUR: "€", GBP: "£",
    MXN: "MX$", MYR: "RM", ARS: "AR$", COP: "CO$",
    USDT: "₮", USDC: "USDC",
  };
  const simbolo = simbolos[moeda] || moeda + " ";
  const prefix = valor >= 0 ? "+" : "";
  return `${prefix}${simbolo} ${Math.abs(valor).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
};

/**
 * Tooltip que mostra breakdown de lucro por moeda original,
 * similar ao KpiBreakdownTooltip da aba "Todas as Apostas".
 */
export function LucroCurrencyTooltip({
  children,
  lucroPorMoeda,
  totalConsolidado,
  moedaConsolidacao,
  formatValue,
  side = "bottom",
}: LucroCurrencyTooltipProps) {
  const hasMultipleCurrencies = lucroPorMoeda.length > 1;
  const hasDifferentCurrency = lucroPorMoeda.some(c => c.moeda !== moedaConsolidacao);

  // Only show tooltip if there's useful multi-currency info
  if (!hasMultipleCurrencies && !hasDifferentCurrency) {
    return <>{children}</>;
  }

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
            <p className="text-xs font-semibold text-foreground border-b border-border pb-1.5">
              Lucro por Módulo
            </p>

            {/* Linha única do módulo (Apostas) */}
            <div className="flex items-center justify-between gap-3 text-xs">
              <div className="flex items-center gap-1.5 min-w-0">
                <span className="text-muted-foreground">Apostas</span>
              </div>
              <span className={cn(
                "font-medium flex-shrink-0",
                totalConsolidado >= 0 ? "text-emerald-500" : "text-red-500"
              )}>
                {totalConsolidado >= 0 ? "+" : ""}{formatValue(totalConsolidado)}
              </span>
            </div>

            {/* Breakdown por moeda */}
            <div className="border-t border-border pt-2 mt-2">
              <p className="text-[10px] text-muted-foreground mb-1.5">Por moeda original:</p>
              <div className="space-y-1">
                {lucroPorMoeda.map((item) => (
                  <div key={item.moeda} className="flex items-center justify-between gap-3 text-xs">
                    <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                      {item.moeda}
                    </Badge>
                    <span className={cn(
                      "font-medium",
                      item.valor >= 0 ? "text-emerald-500" : "text-red-500"
                    )}>
                      {formatarPorMoeda(item.valor, item.moeda)}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            {/* Total consolidado */}
            <div className="border-t border-border pt-1.5 mt-2">
              <div className="flex justify-between items-center">
                <span className="text-xs font-semibold">Total Consolidado</span>
                <span className={cn(
                  "text-sm font-bold",
                  totalConsolidado >= 0 ? "text-emerald-500" : "text-red-500"
                )}>
                  {formatValue(totalConsolidado)}
                </span>
              </div>
              <p className="text-[9px] text-muted-foreground mt-1">
                Consolidado em {moedaConsolidacao} usando cotação do projeto
              </p>
            </div>
          </div>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
