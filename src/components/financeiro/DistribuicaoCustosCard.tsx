import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PieChart, TrendingUp, TrendingDown, Minus, HelpCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import { ModernDonutChart } from "@/components/ui/modern-donut-chart";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

interface CustoCategoria {
  name: string;
  value: number;
  color?: string;
}

interface DistribuicaoCustosCardProps {
  categorias: CustoCategoria[];
  totalAtual: number;
  totalAnterior: number;
  formatCurrency: (value: number) => string;
}

export function DistribuicaoCustosCard({
  categorias,
  totalAtual,
  totalAnterior,
  formatCurrency,
}: DistribuicaoCustosCardProps) {
  const variacaoTotal = totalAnterior > 0 
    ? ((totalAtual - totalAnterior) / totalAnterior) * 100
    : 0;

  // Sort by value descending
  const sortedCategorias = [...categorias].sort((a, b) => b.value - a.value);

  // Colors for donut
  const colors = [
    "#22C55E", // Green
    "#3B82F6", // Blue  
    "#F59E0B", // Amber
    "#8B5CF6", // Violet
    "#EF4444", // Red
    "#06B6D4", // Cyan
  ];

  const donutData = sortedCategorias.map((cat, i) => ({
    name: cat.name,
    value: cat.value,
    color: cat.color || colors[i % colors.length],
  }));

  return (
    <Card className="overflow-hidden">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base flex items-center gap-2">
            <PieChart className="h-4 w-4 text-primary" />
            Distribuição de Custos
            <TooltipProvider>
              <Tooltip delayDuration={300}>
                <TooltipTrigger asChild>
                  <button className="text-muted-foreground hover:text-foreground transition-colors">
                    <HelpCircle className="h-3.5 w-3.5" />
                  </button>
                </TooltipTrigger>
                <TooltipContent side="top" className="max-w-[280px] text-xs">
                  <p className="font-medium mb-1">Distribuição de Custos</p>
                  <p>Distribuição orçamentária por tipo:</p>
                  <p><strong>Indicadores:</strong> Valores destinados a indicadores</p>
                  <p><strong>Parceiros:</strong> Valores destinados a parceiros</p>
                  <p><strong>Fornecedores:</strong> Valores destinados a fornecedores</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </CardTitle>
          <div className={cn(
            "flex items-center gap-1 text-xs font-medium px-2 py-1 rounded-full",
            variacaoTotal > 5 ? "bg-destructive/10 text-destructive" :
            variacaoTotal < -5 ? "bg-success/10 text-success" :
            "bg-muted text-muted-foreground"
          )}>
            {variacaoTotal > 0 ? <TrendingUp className="h-3 w-3" /> : 
             variacaoTotal < 0 ? <TrendingDown className="h-3 w-3" /> : 
             <Minus className="h-3 w-3" />}
            {variacaoTotal > 0 ? "+" : ""}{variacaoTotal.toFixed(1)}% vs anterior
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Donut Chart */}
        {sortedCategorias.length > 0 ? (
          <>
            <div className="h-[180px]">
              <ModernDonutChart
                data={donutData}
                height={180}
                innerRadius={55}
                outerRadius={75}
                showLabels={false}
                centerValue={formatCurrency(totalAtual)}
                centerLabel="Total"
                formatValue={formatCurrency}
              />
            </div>

            {/* Legend with values */}
            <div className="space-y-2">
              {sortedCategorias.map((cat, index) => {
                const percent = totalAtual > 0 ? (cat.value / totalAtual) * 100 : 0;
                const color = cat.color || colors[index % colors.length];
                
                return (
                  <div key={cat.name} className="flex items-center gap-3">
                    <div 
                      className="w-3 h-3 rounded-full flex-shrink-0"
                      style={{ backgroundColor: color }}
                    />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between">
                        <span className="text-sm truncate">{cat.name}</span>
                        <span className="text-sm font-bold ml-2">{formatCurrency(cat.value)}</span>
                      </div>
                      <div className="flex items-center gap-2 mt-0.5">
                        <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden">
                          <div 
                            className="h-full rounded-full transition-all duration-500"
                            style={{ width: `${percent}%`, backgroundColor: color }}
                          />
                        </div>
                        <span className="text-[10px] text-muted-foreground w-10 text-right">
                          {percent.toFixed(0)}%
                        </span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Comparativo */}
            <div className="grid grid-cols-2 gap-3 pt-2 border-t border-border/50">
              <div className="text-center">
                <p className="text-[10px] text-muted-foreground uppercase">Período Atual</p>
                <p className="text-lg font-bold">{formatCurrency(totalAtual)}</p>
              </div>
              <div className="text-center">
                <p className="text-[10px] text-muted-foreground uppercase">Período Anterior</p>
                <p className="text-lg font-bold text-muted-foreground">{formatCurrency(totalAnterior)}</p>
              </div>
            </div>
          </>
        ) : (
          <div className="flex items-center justify-center h-[180px] text-muted-foreground">
            Sem dados de custos
          </div>
        )}
      </CardContent>
    </Card>
  );
}
