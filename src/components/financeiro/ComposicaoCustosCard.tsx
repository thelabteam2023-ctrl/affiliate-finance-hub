import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PieChart, TrendingUp, TrendingDown, Minus } from "lucide-react";
import { cn } from "@/lib/utils";
import { ModernDonutChart } from "@/components/ui/modern-donut-chart";

interface CustoCategoria {
  name: string;
  value: number;
  color?: string;
  variacao?: number; // variação vs período anterior (%)
}

interface ComposicaoCustosCardProps {
  categorias: CustoCategoria[];
  totalAtual: number;
  totalAnterior: number;
  formatCurrency: (value: number) => string;
}

export function ComposicaoCustosCard({
  categorias,
  totalAtual,
  totalAnterior,
  formatCurrency,
}: ComposicaoCustosCardProps) {
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
            Composição de Custos
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
      </CardContent>
    </Card>
  );
}
