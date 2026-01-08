import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { TrendingUp, Hash, Calculator, FileText, Zap, ListChecks } from "lucide-react";
import { GirosGratisMetrics } from "@/types/girosGratis";

interface GirosGratisKPIsProps {
  metrics: GirosGratisMetrics;
  formatCurrency: (value: number) => string;
}

export function GirosGratisKPIs({ metrics, formatCurrency }: GirosGratisKPIsProps) {
  const kpis = [
    {
      label: "Total Retornado",
      value: formatCurrency(metrics.totalRetorno),
      icon: TrendingUp,
      color: metrics.totalRetorno >= 0 ? "text-green-500" : "text-red-500",
      bgColor: metrics.totalRetorno >= 0 ? "bg-green-500/10" : "bg-red-500/10",
    },
    {
      label: "Total de Giros",
      value: metrics.totalGiros.toLocaleString("pt-BR"),
      icon: Hash,
      color: "text-blue-500",
      bgColor: "bg-blue-500/10",
      subtitle: "Modo detalhado",
    },
    {
      label: "Média por Giro",
      value: formatCurrency(metrics.mediaRetornoPorGiro),
      icon: Calculator,
      color: "text-purple-500",
      bgColor: "bg-purple-500/10",
      subtitle: metrics.totalGiros > 0 ? `${metrics.totalGiros} giros` : "Sem dados",
    },
    {
      label: "Registros",
      value: metrics.totalRegistros.toString(),
      icon: FileText,
      color: "text-orange-500",
      bgColor: "bg-orange-500/10",
    },
  ];

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {kpis.map((kpi, index) => (
          <Card key={index}>
            <CardContent className="p-4">
              <div className="flex items-start justify-between">
                <div className="space-y-1">
                  <p className="text-xs text-muted-foreground">{kpi.label}</p>
                  <p className={`text-xl font-bold ${kpi.color}`}>{kpi.value}</p>
                  {kpi.subtitle && (
                    <p className="text-xs text-muted-foreground">{kpi.subtitle}</p>
                  )}
                </div>
                <div className={`p-2 rounded-lg ${kpi.bgColor}`}>
                  <kpi.icon className={`h-4 w-4 ${kpi.color}`} />
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Breakdown por modo */}
      <div className="flex items-center gap-4 text-sm text-muted-foreground">
        <div className="flex items-center gap-2">
          <Zap className="h-4 w-4" />
          <span>Simples: {metrics.registrosSimples}</span>
        </div>
        <div className="flex items-center gap-2">
          <ListChecks className="h-4 w-4" />
          <span>Detalhado: {metrics.registrosDetalhados}</span>
        </div>
      </div>
    </div>
  );
}
