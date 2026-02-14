import { Card, CardContent } from "@/components/ui/card";
import { 
  Building2, 
  BarChart3
} from "lucide-react";
import { ProjectBonusAnalyticsSummary as SummaryType } from "@/hooks/useProjectBonusAnalytics";
import { CurrencyBreakdownTooltip } from "@/components/ui/currency-breakdown-tooltip";
import { formatCurrencyForDisplay } from "@/utils/consolidateCurrency";

interface ProjectBonusAnalyticsSummaryProps {
  summary: SummaryType;
}

const STATUS_LABELS: Record<string, string> = {
  ativas: "Ativas",
  concluidas: "Concluídas",
  encerradas: "Encerradas",
  pausadas: "Pausadas",
  limitadas: "Limitadas",
  bloqueadas: "Bloqueadas",
};

export function ProjectBonusAnalyticsSummary({ summary }: ProjectBonusAnalyticsSummaryProps) {
  // Filtrar apenas status com valor > 0
  const activeStatuses = Object.entries(summary.status_breakdown)
    .filter(([, count]) => count > 0);

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      {/* Card 1 — Histórico de Casas com Bônus */}
      <Card>
        <CardContent className="p-4">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
              <Building2 className="h-5 w-5 text-primary" />
            </div>
            <div className="min-w-0">
              <p className="text-2xl font-bold">{summary.total_bookmakers}</p>
              <p className="text-xs text-muted-foreground">
                {summary.total_bookmakers === 1 ? "casa já operada" : "casas já operadas"}
              </p>
              {activeStatuses.length > 0 && (
                <div className="flex flex-wrap gap-x-3 gap-y-0.5 mt-1">
                  {activeStatuses.map(([key, count]) => (
                    <span key={key} className="text-[11px] text-muted-foreground">
                      {STATUS_LABELS[key] || key}: <span className="font-medium text-foreground">{count}</span>
                    </span>
                  ))}
                </div>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Card 2 — Volume Total Operado em Bônus */}
      <Card>
        <CardContent className="p-4">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-lg bg-blue-500/10 flex items-center justify-center shrink-0">
              <BarChart3 className="h-5 w-5 text-blue-500" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-1.5">
                <p className="text-lg font-bold truncate">{summary.total_stake_display}</p>
                <CurrencyBreakdownTooltip
                  breakdown={summary.volume_breakdown}
                  moedaConsolidacao={summary.moeda_consolidacao}
                />
              </div>
              <p className="text-xs text-muted-foreground">Volume Operado em Bônus</p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
