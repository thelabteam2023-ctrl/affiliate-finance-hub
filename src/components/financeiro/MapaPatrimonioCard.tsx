import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PieChart, Wallet, Landmark, Bitcoin, HelpCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  Tooltip as UITooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { ResponsiveContainer, PieChart as RechartsPie, Pie, Cell, Legend, Tooltip } from "recharts";

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

  const data = [
    { name: "Caixa Operacional", value: caixaOperacional, color: "hsl(var(--primary))", icon: Wallet },
    { name: "Bookmakers", value: saldoBookmakers, color: "hsl(var(--success))", icon: PieChart },
    { name: "Contas Parceiros", value: contasParceiros, color: "hsl(var(--chart-3))", icon: Landmark },
    { name: "Wallets Crypto", value: walletsCrypto, color: "hsl(var(--chart-4))", icon: Bitcoin },
  ].filter(d => d.value > 0);

  return (
    <Card className="overflow-hidden">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base flex items-center gap-2">
            <PieChart className="h-4 w-4 text-primary" />
            Mapa de Patrimônio
            <TooltipProvider>
              <UITooltip delayDuration={300}>
                <TooltipTrigger asChild>
                  <button className="text-muted-foreground hover:text-foreground transition-colors">
                    <HelpCircle className="h-3.5 w-3.5" />
                  </button>
                </TooltipTrigger>
                <TooltipContent side="top" className="max-w-[320px] text-xs">
                  <p className="font-medium mb-1">Mapa de Patrimônio</p>
                  <p className="mb-2">Distribuição do capital total da empresa.</p>
                  <p><strong>Caixa Operacional:</strong> BRL + USD + Crypto (disponível)</p>
                  <p><strong>Bookmakers:</strong> Capital em operação nas casas</p>
                  <p><strong>Contas Parceiros:</strong> Saldos em contas de parceiros</p>
                  <p><strong>Wallets Crypto:</strong> Holdings em carteiras crypto</p>
                </TooltipContent>
              </UITooltip>
            </TooltipProvider>
          </CardTitle>
          <div className="text-sm font-semibold text-primary">
            {formatCurrency(total)}
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Pie Chart */}
        <div className="h-[180px]">
          <ResponsiveContainer width="100%" height="100%">
            <RechartsPie>
              <Pie
                data={data}
                cx="50%"
                cy="50%"
                innerRadius={50}
                outerRadius={75}
                paddingAngle={2}
                dataKey="value"
              >
                {data.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={entry.color} />
                ))}
              </Pie>
              <Tooltip
                contentStyle={{
                  backgroundColor: "rgba(0, 0, 0, 0.8)",
                  border: "1px solid rgba(255, 255, 255, 0.1)",
                  backdropFilter: "blur(12px)",
                  borderRadius: "12px",
                  padding: "12px 16px",
                }}
                formatter={(value: number) => [formatCurrency(value), ""]}
              />
            </RechartsPie>
          </ResponsiveContainer>
        </div>

        {/* Legend/Breakdown */}
        <div className="space-y-2">
          {data.map((item) => {
            const percent = total > 0 ? (item.value / total) * 100 : 0;
            const Icon = item.icon;
            return (
              <div key={item.name} className="flex items-center gap-3">
                <div 
                  className="p-2 rounded-lg"
                  style={{ backgroundColor: `${item.color}20` }}
                >
                  <Icon className="h-4 w-4" style={{ color: item.color }} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-muted-foreground truncate">{item.name}</span>
                    <span className="text-sm font-semibold" style={{ color: item.color }}>
                      {formatCurrency(item.value)}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 mt-1">
                    <div className="h-1.5 flex-1 bg-muted rounded-full overflow-hidden">
                      <div 
                        className="h-full rounded-full transition-all"
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

        {/* Total */}
        <div className="pt-3 border-t flex items-center justify-between">
          <span className="text-sm font-medium text-muted-foreground">Patrimônio Total</span>
          <span className="text-lg font-bold text-primary">{formatCurrency(total)}</span>
        </div>
      </CardContent>
    </Card>
  );
}
