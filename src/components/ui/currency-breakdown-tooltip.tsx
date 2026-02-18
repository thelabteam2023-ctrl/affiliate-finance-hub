import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Info } from "lucide-react";

export interface CurrencyBreakdownItem {
  moeda: string;
  valor: number;
}

interface CurrencyBreakdownTooltipProps {
  breakdown: CurrencyBreakdownItem[];
  moedaConsolidacao: string;
  className?: string;
  /** If provided, wraps children as the trigger instead of showing the Info icon */
  children?: React.ReactNode;
}

// Helper para formatar valor com símbolo da moeda
export const formatarPorMoeda = (valor: number, moeda: string): string => {
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

/**
 * Componente reutilizável para exibir tooltip com breakdown de valores por moeda original.
 * Usado em KPIs que consolidam valores de múltiplas moedas.
 * 
 * Só exibe o ícone de info se houver múltiplas moedas ou moeda diferente da consolidação.
 */
export function CurrencyBreakdownTooltip({ 
  breakdown, 
  moedaConsolidacao,
  className,
  children
}: CurrencyBreakdownTooltipProps) {
  // Não mostrar se não há dados ou apenas uma moeda igual à consolidação
  const hasMultipleCurrencies = breakdown.length > 1;
  const hasDifferentCurrency = breakdown.some(r => r.moeda !== moedaConsolidacao);
  
  if (!hasMultipleCurrencies && !hasDifferentCurrency) {
    return null;
  }

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          {children ? (
            <div className={`cursor-help ${className || ""}`}>{children}</div>
          ) : (
            <Info className={`h-3 w-3 text-muted-foreground cursor-help ${className || ""}`} />
          )}
        </TooltipTrigger>
        <TooltipContent side="bottom" className="max-w-xs">
          <div className="space-y-1.5">
            <p className="text-xs font-medium mb-2">Valores por moeda original:</p>
            {breakdown.map((item) => (
              <div key={item.moeda} className="flex items-center justify-between gap-4 text-xs">
                <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                  {item.moeda}
                </Badge>
                <span className="font-medium">{formatarPorMoeda(item.valor, item.moeda)}</span>
              </div>
            ))}
            {hasDifferentCurrency && (
              <p className="text-[10px] text-muted-foreground mt-2 pt-2 border-t">
                Consolidado em {moedaConsolidacao} usando cotação do projeto
              </p>
            )}
          </div>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

/**
 * Hook helper para calcular breakdown por moeda a partir de uma lista de itens
 */
export function calcularBreakdownPorMoeda<T>(
  items: T[],
  getMoeda: (item: T) => string,
  getValor: (item: T) => number
): CurrencyBreakdownItem[] {
  const porMoeda: Record<string, number> = {};
  
  items.forEach(item => {
    const moeda = getMoeda(item);
    const valor = getValor(item);
    porMoeda[moeda] = (porMoeda[moeda] || 0) + valor;
  });
  
  return Object.entries(porMoeda).map(([moeda, valor]) => ({ moeda, valor }));
}