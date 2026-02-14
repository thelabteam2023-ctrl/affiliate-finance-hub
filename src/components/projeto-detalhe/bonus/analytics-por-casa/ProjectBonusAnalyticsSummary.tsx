import { useMemo } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { 
  Building2, 
  BarChart3,
  Gift,
  AlertTriangle,
  Timer
} from "lucide-react";
import { ProjectBonusAnalyticsSummary as SummaryType, BookmakerBonusStats } from "@/hooks/useProjectBonusAnalytics";
import { CurrencyBreakdownTooltip } from "@/components/ui/currency-breakdown-tooltip";
import { useProjetoCurrency } from "@/hooks/useProjetoCurrency";

interface ProjectBonusAnalyticsSummaryProps {
  summary: SummaryType;
  stats: BookmakerBonusStats[];
  projetoId: string;
}

export function ProjectBonusAnalyticsSummary({ summary, stats, projetoId }: ProjectBonusAnalyticsSummaryProps) {
  const { formatCurrency, convertToConsolidationOficial } = useProjetoCurrency(projetoId);

  // Consolidar volume total na moeda do projeto
  const totalVolumeConsolidated = useMemo(() => {
    return summary.volume_breakdown.reduce((acc, item) => {
      return acc + convertToConsolidationOficial(item.valor, item.moeda);
    }, 0);
  }, [summary.volume_breakdown, convertToConsolidationOficial]);

  // Métricas de bônus agregadas
  const bonusMetrics = useMemo(() => {
    const totalReceived = stats.reduce((sum, s) => sum + s.total_bonus_count, 0);
    const pending = stats.reduce((sum, s) => sum + s.bonus_pending_count, 0);
    const inProgress = stats.reduce((sum, s) => sum + s.bonus_credited_count - s.bonus_finalized_count, 0);
    const finalized = stats.reduce((sum, s) => sum + s.bonus_finalized_count, 0);
    const limited = summary.status_breakdown.limitadas;
    return { totalReceived, pending, inProgress: Math.max(0, inProgress), finalized, limited };
  }, [stats, summary.status_breakdown]);

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      {/* Card 1 — Casas e Bônus */}
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
              <div className="grid grid-cols-2 gap-x-4 gap-y-0.5 mt-1.5">
                <span className="text-[11px] text-muted-foreground">
                  <Gift className="inline h-3 w-3 mr-0.5" />
                  Recebidos: <span className="font-medium text-foreground">{bonusMetrics.totalReceived}</span>
                </span>
                {bonusMetrics.pending > 0 ? (
                  <span className="text-[11px] text-muted-foreground">
                    <Timer className="inline h-3 w-3 mr-0.5" />
                    Pendentes: <span className="font-medium text-foreground">{bonusMetrics.pending}</span>
                  </span>
                ) : <span />}
                {bonusMetrics.inProgress > 0 ? (
                  <span className="text-[11px] text-muted-foreground">
                    Em andamento: <span className="font-medium text-foreground">{bonusMetrics.inProgress}</span>
                  </span>
                ) : <span />}
                {bonusMetrics.finalized > 0 ? (
                  <span className="text-[11px] text-muted-foreground">
                    Finalizados: <span className="font-medium text-foreground">{bonusMetrics.finalized}</span>
                  </span>
                ) : <span />}
                {bonusMetrics.limited > 0 && (
                  <span className="text-[11px] text-amber-500">
                    <AlertTriangle className="inline h-3 w-3 mr-0.5" />
                    Limitadas: <span className="font-medium">{bonusMetrics.limited}</span>
                  </span>
                )}
              </div>
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
                <p className="text-lg font-bold truncate">{formatCurrency(totalVolumeConsolidated)}</p>
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
