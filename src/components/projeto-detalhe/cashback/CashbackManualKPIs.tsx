import { Card, CardContent } from "@/components/ui/card";
import { DollarSign, TrendingUp, BarChart3 } from "lucide-react";
import { CashbackManualMetrics } from "@/types/cashback-manual";

interface CashbackManualKPIsProps {
  metrics: CashbackManualMetrics;
  formatCurrency: (value: number) => string;
}

export function CashbackManualKPIs({ metrics, formatCurrency }: CashbackManualKPIsProps) {
  const kpis = [
    {
      label: "Total Recebido",
      value: formatCurrency(metrics.totalRecebido),
      icon: DollarSign,
      color: "text-emerald-500",
      bgColor: "bg-emerald-500/10",
    },
    {
      label: "Lançamentos",
      value: metrics.totalLancamentos.toString(),
      icon: BarChart3,
      color: "text-blue-500",
      bgColor: "bg-blue-500/10",
    },
    {
      label: "Média/Lançamento",
      value: formatCurrency(metrics.mediaPorLancamento),
      icon: TrendingUp,
      color: "text-amber-500",
      bgColor: "bg-amber-500/10",
    },
  ];

  return (
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
      {kpis.map((kpi) => (
        <Card key={kpi.label} className="overflow-hidden">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className={`p-2 rounded-lg ${kpi.bgColor}`}>
                <kpi.icon className={`h-4 w-4 ${kpi.color}`} />
              </div>
              <div className="min-w-0">
                <p className="text-xs text-muted-foreground truncate">{kpi.label}</p>
                <p className={`text-lg font-bold ${kpi.color}`}>{kpi.value}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
