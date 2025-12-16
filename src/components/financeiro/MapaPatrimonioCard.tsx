import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PieChart, HelpCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import { ModernDonutChart } from "@/components/ui/modern-donut-chart";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

interface MapaPatrimonioCardProps {
  caixaOperacional: number;
  saldoBookmakers: number;
  contasParceiros: number;
  walletsCrypto: number;
  formatCurrency: (value: number) => string;
}

export function MapaPatrimonioCard({
  caixaOperacional,
  saldoBookmakers,
  contasParceiros,
  walletsCrypto,
  formatCurrency,
}: MapaPatrimonioCardProps) {
  const total = caixaOperacional + saldoBookmakers + contasParceiros + walletsCrypto;

  // Colors matching the reference pattern
  const colors = [
    "#3B82F6", // Blue - Caixa
    "#22C55E", // Green - Bookmakers
    "#F59E0B", // Amber - Contas Parceiros
    "#8B5CF6", // Violet - Wallets Crypto
  ];

  const rawData = [
    { name: "Caixa Operacional", value: caixaOperacional },
    { name: "Bookmakers", value: saldoBookmakers },
    { name: "Contas Parceiros", value: contasParceiros },
    { name: "Wallets Crypto", value: walletsCrypto },
  ];

  // Filter out zero values and sort by value descending
  const data = rawData
    .filter(d => d.value > 0)
    .sort((a, b) => b.value - a.value)
    .map((d, i) => ({ ...d, color: colors[rawData.findIndex(r => r.name === d.name)] }));

  const donutData = data.map(d => ({
    name: d.name,
    value: d.value,
    color: d.color,
  }));

  return (
    <Card className="overflow-hidden">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base flex items-center gap-2">
            <PieChart className="h-4 w-4 text-primary" />
            Mapa de Patrimônio
            <TooltipProvider>
              <Tooltip delayDuration={300}>
                <TooltipTrigger asChild>
                  <button className="text-muted-foreground hover:text-foreground transition-colors">
                    <HelpCircle className="h-3.5 w-3.5" />
                  </button>
                </TooltipTrigger>
                <TooltipContent side="top" className="max-w-[280px] text-xs">
                  <p className="font-medium mb-1">Mapa de Patrimônio</p>
                  <p>Distribuição do capital total:</p>
                  <p><strong>Caixa:</strong> BRL + USD + Crypto disponível</p>
                  <p><strong>Bookmakers:</strong> Capital em operação</p>
                  <p><strong>Contas Parceiros:</strong> Saldos em contas bancárias</p>
                  <p><strong>Wallets:</strong> Holdings em carteiras crypto</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </CardTitle>
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
            centerValue={formatCurrency(total)}
            centerLabel="Total"
            formatValue={formatCurrency}
          />
        </div>

        {/* Legend with values - matching ComposicaoCustosCard exactly */}
        <div className="space-y-2">
          {data.map((item) => {
            const percent = total > 0 ? (item.value / total) * 100 : 0;
            
            return (
              <div key={item.name} className="flex items-center gap-3">
                <div 
                  className="w-3 h-3 rounded-full flex-shrink-0"
                  style={{ backgroundColor: item.color }}
                />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between">
                    <span className="text-sm truncate">{item.name}</span>
                    <span className="text-sm font-bold ml-2">{formatCurrency(item.value)}</span>
                  </div>
                  <div className="flex items-center gap-2 mt-0.5">
                    <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden">
                      <div 
                        className="h-full rounded-full transition-all duration-500"
                        style={{ width: `${percent}%`, backgroundColor: item.color }}
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

        {/* Total footer */}
        <div className="pt-3 border-t border-border/50 text-center">
          <p className="text-[10px] text-muted-foreground uppercase">Patrimônio Total</p>
          <p className="text-lg font-bold">{formatCurrency(total)}</p>
        </div>
      </CardContent>
    </Card>
  );
}
