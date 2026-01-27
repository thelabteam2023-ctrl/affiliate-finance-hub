import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Wallet, TrendingUp, TrendingDown, Info } from "lucide-react";
import { getFinancialDisplay } from "@/lib/financial-display";

interface CurrencyBreakdown {
  BRL: number;
  USD: number;
}

interface ProjectFinancialDisplayProps {
  type: "saldo" | "lucro";
  breakdown: CurrencyBreakdown;
  totalConsolidado: number;
  cotacaoPTAX: number;
  isMultiCurrency?: boolean;
}

/**
 * Componente de exibição financeira simplificado.
 * Exibe valor consolidado em BRL com breakdown por moeda no tooltip.
 */
export function ProjectFinancialDisplay({
  type,
  breakdown,
  totalConsolidado,
  cotacaoPTAX,
  isMultiCurrency = false,
}: ProjectFinancialDisplayProps) {
  const isSaldo = type === "saldo";
  
  const lucroDisplay = !isSaldo ? getFinancialDisplay(totalConsolidado) : null;
  const isPositive = isSaldo ? true : (lucroDisplay?.isPositive || lucroDisplay?.isZero);
  
  const label = isSaldo 
    ? "Saldo Bookmakers" 
    : (lucroDisplay?.isNegative ? "Prejuízo" : "Lucro");
  
  const hasBRL = breakdown.BRL !== 0;
  const hasUSD = breakdown.USD !== 0;
  const showMultiCurrency = isMultiCurrency || (hasBRL && hasUSD) || hasUSD;
  
  const formatBRL = (value: number) => {
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(value);
  };
  
  const formatUSD = (value: number) => {
    return `$ ${Math.abs(value).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  };

  const Icon = isSaldo 
    ? Wallet 
    : (isPositive ? TrendingUp : TrendingDown);
  
  const iconColor = isSaldo 
    ? "text-muted-foreground" 
    : (isPositive ? "text-emerald-500" : "text-red-500");

  // Valor principal formatado
  const mainValue = isSaldo 
    ? formatBRL(totalConsolidado)
    : `${lucroDisplay?.isPositive ? '+' : ''}${formatBRL(totalConsolidado)}`;

  return (
    <div className="flex flex-col items-center gap-1.5 py-2">
      {/* Header */}
      <div className="flex items-center gap-2 text-muted-foreground text-sm">
        <Icon className={`h-4 w-4 ${iconColor}`} />
        <span>{label}</span>
      </div>
      
      {/* Valor consolidado */}
      {showMultiCurrency ? (
        <Tooltip>
          <TooltipTrigger asChild>
            <div className={`flex items-center gap-1.5 cursor-help ${
              !isSaldo ? lucroDisplay?.colorClass : ''
            }`}>
              <Badge 
                variant="outline" 
                className={`text-base px-3 py-1 font-semibold ${
                  !isSaldo && totalConsolidado < 0 
                    ? 'border-red-500/40 text-red-400 bg-red-500/10' 
                    : !isSaldo && totalConsolidado > 0
                      ? 'border-emerald-500/40 text-emerald-400 bg-emerald-500/10'
                      : 'border-border'
                }`}
              >
                <span className="opacity-70 mr-1">≈</span>
                {mainValue}
              </Badge>
              <Info className="h-3.5 w-3.5 text-muted-foreground opacity-50" />
            </div>
          </TooltipTrigger>
          <TooltipContent side="top" align="center" sideOffset={8} className="max-w-[280px] z-[100]">
            <div className="space-y-2 text-xs">
              <div className="font-medium">Breakdown por Moeda Nativa</div>
              <div className="space-y-1">
                {hasBRL && (
                  <div className="flex justify-between gap-4">
                    <span className="text-muted-foreground">BRL:</span>
                    <span className="font-mono">
                      {!isSaldo && breakdown.BRL > 0 ? '+' : ''}{formatBRL(breakdown.BRL)}
                    </span>
                  </div>
                )}
                {hasUSD && (
                  <div className="flex justify-between gap-4">
                    <span className="text-muted-foreground">USD:</span>
                    <span className="font-mono">
                      {!isSaldo && breakdown.USD > 0 ? '+' : ''}{formatUSD(breakdown.USD)}
                    </span>
                  </div>
                )}
              </div>
              <div className="pt-1.5 border-t border-border/50 text-muted-foreground/70">
                <div className="flex justify-between gap-4">
                  <span>Cotação USD/BRL:</span>
                  <span className="font-mono">R$ {cotacaoPTAX.toFixed(4)}</span>
                </div>
              </div>
            </div>
          </TooltipContent>
        </Tooltip>
      ) : (
        <Badge 
          variant="outline" 
          className={`text-base px-3 py-1 font-semibold ${
            !isSaldo && totalConsolidado < 0 
              ? 'border-red-500/40 text-red-400 bg-red-500/10' 
              : !isSaldo && totalConsolidado > 0
                ? 'border-emerald-500/40 text-emerald-400 bg-emerald-500/10'
                : 'border-border'
          }`}
        >
          {mainValue}
        </Badge>
      )}
    </div>
  );
}
