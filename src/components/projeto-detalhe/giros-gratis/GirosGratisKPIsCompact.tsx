import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { TrendingUp, FileText } from "lucide-react";
import { GirosGratisMetrics } from "@/types/girosGratis";
import { cn } from "@/lib/utils";

interface GirosGratisKPIsCompactProps {
  metrics: GirosGratisMetrics;
  formatCurrency: (value: number) => string;
  moedaConsolidacao?: string;
}

export function GirosGratisKPIsCompact({ 
  metrics, 
  formatCurrency,
  moedaConsolidacao 
}: GirosGratisKPIsCompactProps) {
  const kpis = [
    {
      label: "Total Retornado",
      value: formatCurrency(metrics.totalRetorno),
      icon: TrendingUp,
      valueColor: metrics.totalRetorno >= 0 ? "text-emerald-500" : "text-red-500",
      iconColor: metrics.totalRetorno >= 0 ? "text-emerald-500" : "text-red-500",
      iconBg: metrics.totalRetorno >= 0 ? "bg-emerald-500/10" : "bg-red-500/10",
      showCurrency: true,
    },
    {
      label: "Registros",
      value: metrics.totalRegistros.toString(),
      icon: FileText,
      valueColor: "text-foreground",
      iconColor: "text-amber-500",
      iconBg: "bg-amber-500/10",
      showCurrency: false,
    },
  ];

  return (
    <div className="grid grid-cols-2 gap-3">
      {kpis.map((kpi, index) => (
        <Card key={index} className="border-border/50">
          <CardContent className="p-3">
            <div className="flex items-center gap-3">
              <div className={cn("p-2 rounded-lg shrink-0", kpi.iconBg)}>
                <kpi.icon className={cn("h-4 w-4", kpi.iconColor)} />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5">
                  <p className="text-[11px] text-muted-foreground truncate">{kpi.label}</p>
                  {kpi.showCurrency && moedaConsolidacao && (
                    <Badge variant="outline" className="text-[9px] px-1 py-0 h-4">
                      {moedaConsolidacao}
                    </Badge>
                  )}
                </div>
                <p className={cn("text-base font-bold truncate", kpi.valueColor)}>{kpi.value}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
