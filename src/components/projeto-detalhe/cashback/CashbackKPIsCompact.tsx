import { Card, CardContent } from "@/components/ui/card";
import { TrendingUp, Clock, DollarSign, Percent } from "lucide-react";
import { CashbackMetrics } from "@/types/cashback";
import { cn } from "@/lib/utils";

interface CashbackKPIsCompactProps {
  metrics: CashbackMetrics;
  formatCurrency: (value: number) => string;
}

export function CashbackKPIsCompact({ metrics, formatCurrency }: CashbackKPIsCompactProps) {
  const kpis = [
    {
      label: "Cashback Recebido",
      value: formatCurrency(metrics.totalRecebido),
      icon: TrendingUp,
      valueColor: metrics.totalRecebido > 0 ? "text-emerald-500" : "text-foreground",
      iconColor: "text-emerald-500",
      iconBg: "bg-emerald-500/10",
    },
    {
      label: "Cashback Pendente",
      value: formatCurrency(metrics.totalPendente),
      icon: Clock,
      valueColor: metrics.totalPendente > 0 ? "text-amber-500" : "text-foreground",
      iconColor: "text-amber-500",
      iconBg: "bg-amber-500/10",
    },
    {
      label: "Volume Elegível",
      value: formatCurrency(metrics.volumeElegivel),
      icon: DollarSign,
      valueColor: "text-foreground",
      iconColor: "text-blue-500",
      iconBg: "bg-blue-500/10",
    },
    {
      label: "% Média Retorno",
      value: `${metrics.percentualMedioRetorno.toFixed(2)}%`,
      icon: Percent,
      valueColor: "text-foreground",
      iconColor: "text-violet-500",
      iconBg: "bg-violet-500/10",
    },
  ];

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
      {kpis.map((kpi, index) => (
        <Card key={index} className="border-border/50">
          <CardContent className="p-3">
            <div className="flex items-center gap-3">
              <div className={cn("p-2 rounded-lg shrink-0", kpi.iconBg)}>
                <kpi.icon className={cn("h-4 w-4", kpi.iconColor)} />
              </div>
              <div className="min-w-0">
                <p className="text-[11px] text-muted-foreground truncate">{kpi.label}</p>
                <p className={cn("text-base font-bold truncate", kpi.valueColor)}>{kpi.value}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
