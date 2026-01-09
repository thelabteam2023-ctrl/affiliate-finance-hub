import { Card, CardContent } from "@/components/ui/card";
import { TrendingUp, Hash, Calculator, FileText } from "lucide-react";
import { GirosGratisMetrics } from "@/types/girosGratis";
import { cn } from "@/lib/utils";

interface GirosGratisKPIsCompactProps {
  metrics: GirosGratisMetrics;
  formatCurrency: (value: number) => string;
}

export function GirosGratisKPIsCompact({ metrics, formatCurrency }: GirosGratisKPIsCompactProps) {
  const kpis = [
    {
      label: "Total Retornado",
      value: formatCurrency(metrics.totalRetorno),
      icon: TrendingUp,
      valueColor: metrics.totalRetorno >= 0 ? "text-emerald-500" : "text-red-500",
      iconColor: metrics.totalRetorno >= 0 ? "text-emerald-500" : "text-red-500",
      iconBg: metrics.totalRetorno >= 0 ? "bg-emerald-500/10" : "bg-red-500/10",
    },
    {
      label: "Total de Giros",
      value: metrics.totalGiros.toLocaleString("pt-BR"),
      icon: Hash,
      valueColor: "text-foreground",
      iconColor: "text-blue-500",
      iconBg: "bg-blue-500/10",
    },
    {
      label: "Média por Giro",
      value: formatCurrency(metrics.mediaRetornoPorGiro),
      icon: Calculator,
      valueColor: "text-foreground",
      iconColor: "text-violet-500",
      iconBg: "bg-violet-500/10",
    },
    {
      label: "Registros",
      value: metrics.totalRegistros.toString(),
      icon: FileText,
      valueColor: "text-foreground",
      iconColor: "text-amber-500",
      iconBg: "bg-amber-500/10",
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
