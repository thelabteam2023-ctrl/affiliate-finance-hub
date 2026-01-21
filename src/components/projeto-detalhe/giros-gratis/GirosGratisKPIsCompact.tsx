import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { TrendingUp, FileText, Info } from "lucide-react";
import { GirosGratisMetrics } from "@/types/girosGratis";
import { cn } from "@/lib/utils";

interface GirosGratisKPIsCompactProps {
  metrics: GirosGratisMetrics;
  formatCurrency: (value: number) => string;
  moedaConsolidacao?: string;
}

// Helper para formatar valor com símbolo da moeda
const formatarPorMoeda = (valor: number, moeda: string): string => {
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

export function GirosGratisKPIsCompact({ 
  metrics, 
  formatCurrency,
  moedaConsolidacao 
}: GirosGratisKPIsCompactProps) {
  const hasMultipleCurrencies = metrics.retornoPorMoeda.length > 1;
  const hasDifferentCurrency = metrics.retornoPorMoeda.some(r => r.moeda !== moedaConsolidacao);

  return (
    <div className="grid grid-cols-2 gap-3">
      {/* Total Retornado */}
      <Card className="border-border/50">
        <CardContent className="p-3">
          <div className="flex items-center gap-3">
            <div className={cn(
              "p-2 rounded-lg shrink-0",
              metrics.totalRetorno >= 0 ? "bg-emerald-500/10" : "bg-red-500/10"
            )}>
              <TrendingUp className={cn(
                "h-4 w-4",
                metrics.totalRetorno >= 0 ? "text-emerald-500" : "text-red-500"
              )} />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5">
                <p className="text-[11px] text-muted-foreground truncate">Total Retornado</p>
                {moedaConsolidacao && (
                  <Badge variant="outline" className="text-[9px] px-1 py-0 h-4">
                    {moedaConsolidacao}
                  </Badge>
                )}
                {(hasMultipleCurrencies || hasDifferentCurrency) && (
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Info className="h-3 w-3 text-muted-foreground cursor-help" />
                      </TooltipTrigger>
                      <TooltipContent side="bottom" className="max-w-xs">
                        <div className="space-y-1.5">
                          <p className="text-xs font-medium mb-2">Valores por moeda original:</p>
                          {metrics.retornoPorMoeda.map((item) => (
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
                )}
              </div>
              <p className={cn(
                "text-base font-bold truncate",
                metrics.totalRetorno >= 0 ? "text-emerald-500" : "text-red-500"
              )}>
                {formatCurrency(metrics.totalRetorno)}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Registros */}
      <Card className="border-border/50">
        <CardContent className="p-3">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg shrink-0 bg-amber-500/10">
              <FileText className="h-4 w-4 text-amber-500" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-[11px] text-muted-foreground truncate">Registros</p>
              <p className="text-base font-bold truncate text-foreground">
                {metrics.totalRegistros}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}