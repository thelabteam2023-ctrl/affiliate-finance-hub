import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Wallet, TrendingUp, TrendingDown, Info } from "lucide-react";
import { getFinancialDisplay } from "@/lib/financial-display";
import { cn } from "@/lib/utils";
import type { MoedaConsolidacao } from "@/types/projeto";

interface ProjectFinancialDisplayProps {
  type: "saldo" | "lucro";
  /** Breakdown por moeda nativa - aceita qualquer moeda */
  breakdown: Record<string, number>;
  /** Valor total consolidado na moeda de consolidação do projeto */
  totalConsolidado: number;
  /** Moeda de consolidação do projeto (determina a exibição) */
  moedaConsolidacao: MoedaConsolidacao;
  /** Cotação USD/BRL para exibição */
  cotacaoPTAX: number;
}

/**
 * Cores do badge por moeda - seguindo padrão do SaldoOperavelCard
 */
function getCurrencyBadgeColors(moeda: string): string {
  switch (moeda) {
    case "BRL":
      return "bg-emerald-500/10 border-emerald-500/30 text-emerald-400";
    case "USD":
    case "USDT":
    case "USDC":
      return "bg-blue-500/10 border-blue-500/30 text-blue-400";
    case "EUR":
      return "bg-purple-500/10 border-purple-500/30 text-purple-400";
    case "GBP":
      return "bg-amber-500/10 border-amber-500/30 text-amber-400";
    case "MXN":
      return "bg-rose-500/10 border-rose-500/30 text-rose-400";
    case "MYR":
      return "bg-cyan-500/10 border-cyan-500/30 text-cyan-400";
    case "COP":
      return "bg-orange-500/10 border-orange-500/30 text-orange-400";
    case "ARS":
      return "bg-sky-500/10 border-sky-500/30 text-sky-400";
    default:
      return "bg-muted border-border text-muted-foreground";
  }
}

/**
 * Símbolo de moeda
 */
function getCurrencySymbol(moeda: string): string {
  const symbols: Record<string, string> = {
    BRL: "R$",
    USD: "$",
    USDT: "$",
    USDC: "$",
    EUR: "€",
    GBP: "£",
    MXN: "$",
    MYR: "RM",
    COP: "$",
    ARS: "$",
  };
  return symbols[moeda] || moeda;
}

/**
 * Formata valor por moeda
 */
function formatCurrencyValue(value: number, moeda: string, showSign: boolean = false): string {
  const symbol = getCurrencySymbol(moeda);
  const absValue = Math.abs(value);
  const formatted = absValue.toLocaleString('pt-BR', { 
    minimumFractionDigits: 2, 
    maximumFractionDigits: 2 
  });
  const prefix = showSign && value > 0 ? '+' : (value < 0 ? '-' : '');
  return `${prefix}${symbol} ${formatted}`;
}

/**
 * Componente de exibição financeira com badges por moeda.
 * Exibe todas as moedas presentes no breakdown com badges coloridos,
 * seguindo o padrão visual do Saldo Operável.
 */
export function ProjectFinancialDisplay({
  type,
  breakdown,
  totalConsolidado,
  moedaConsolidacao,
  cotacaoPTAX,
}: ProjectFinancialDisplayProps) {
  const isSaldo = type === "saldo";
  
  const lucroDisplay = !isSaldo ? getFinancialDisplay(totalConsolidado) : null;
  const isPositive = isSaldo ? true : (lucroDisplay?.isPositive || lucroDisplay?.isZero);
  
  const label = isSaldo 
    ? "Saldo Bookmakers" 
    : (lucroDisplay?.isNegative ? "Prejuízo" : "Lucro");
  
  // Filtrar moedas com valores não-zero e ordenar (moeda de consolidação primeiro)
  const activeCurrencies = Object.entries(breakdown)
    .filter(([_, value]) => value !== 0)
    .sort(([moedaA], [moedaB]) => {
      // Moeda de consolidação sempre primeiro
      if (moedaA === moedaConsolidacao) return -1;
      if (moedaB === moedaConsolidacao) return 1;
      return moedaA.localeCompare(moedaB);
    });
  
  const hasMultipleCurrencies = activeCurrencies.length > 1;
  const hasDifferentCurrency = activeCurrencies.some(([moeda]) => moeda !== moedaConsolidacao);
  const showBreakdown = hasMultipleCurrencies || hasDifferentCurrency;

  const Icon = isSaldo 
    ? Wallet 
    : (isPositive ? TrendingUp : TrendingDown);
  
  const iconColor = isSaldo 
    ? "text-muted-foreground" 
    : (isPositive ? "text-emerald-500" : "text-red-500");

  // Badge styling baseado no tipo e valor
  const getBadgeClass = (value: number, moeda: string): string => {
    const baseColors = getCurrencyBadgeColors(moeda);
    
    if (!isSaldo) {
      // Para lucro/prejuízo, usar cores semânticas
      if (value < 0) {
        return "bg-red-500/10 border-red-500/30 text-red-400";
      } else if (value > 0) {
        return "bg-emerald-500/10 border-emerald-500/30 text-emerald-400";
      }
    }
    
    return baseColors;
  };

  return (
    <div className="flex flex-col items-center gap-1.5 py-2">
      {/* Header */}
      <div className="flex items-center gap-2 text-muted-foreground text-sm">
        <Icon className={`h-4 w-4 ${iconColor}`} />
        <span>{label}</span>
      </div>
      
      {/* Badges por moeda */}
      <div className="flex flex-wrap items-center justify-center gap-1.5">
        {activeCurrencies.length === 0 ? (
          // Nenhum valor - mostrar zero na moeda de consolidação
          <Badge 
            variant="outline" 
            className="text-sm px-2.5 py-0.5 font-medium border-border"
          >
            {formatCurrencyValue(0, moedaConsolidacao)}
          </Badge>
        ) : (
          activeCurrencies.map(([moeda, value]) => (
            <Badge 
              key={moeda}
              variant="outline" 
              className={cn(
                "text-sm px-2.5 py-0.5 font-medium",
                getBadgeClass(value, moeda)
              )}
            >
              <span className="text-[10px] opacity-70 mr-1">{moeda}</span>
              {formatCurrencyValue(value, moeda, !isSaldo)}
            </Badge>
          ))
        )}
        
        {/* Ícone de info com tooltip quando há conversão */}
        {showBreakdown && (
          <Tooltip>
            <TooltipTrigger asChild>
              <Info className="h-3.5 w-3.5 text-muted-foreground opacity-50 cursor-help" />
            </TooltipTrigger>
            <TooltipContent side="top" align="center" sideOffset={8} className="max-w-[280px] z-[100]">
              <div className="space-y-2 text-xs">
                <div className="font-medium">Consolidação em {moedaConsolidacao}</div>
                <div className="flex justify-between gap-4">
                  <span className="text-muted-foreground">Total:</span>
                  <span className="font-mono font-medium">
                    ≈ {formatCurrencyValue(totalConsolidado, moedaConsolidacao, !isSaldo)}
                  </span>
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
        )}
      </div>
    </div>
  );
}
