import { Card, CardContent } from "@/components/ui/card";
import { 
  Building2, 
  Gift, 
  DollarSign, 
  TrendingUp, 
  TrendingDown,
  Crown,
  Skull
} from "lucide-react";
import { WorkspaceBonusAnalyticsSummary as SummaryType } from "@/hooks/useWorkspaceBonusAnalytics";

interface BookmakerBonusAnalyticsSummaryProps {
  summary: SummaryType;
}

function formatCurrency(value: number): string {
  return new Intl.NumberFormat('pt-BR', { 
    style: 'currency', 
    currency: 'BRL',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value);
}

export function BookmakerBonusAnalyticsSummary({ summary }: BookmakerBonusAnalyticsSummaryProps) {
  const isPositiveProfit = summary.total_profit >= 0;
  const isPositiveROI = summary.average_roi >= 0;

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
      {/* Casas Analisadas */}
      <Card>
        <CardContent className="p-4">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
              <Building2 className="h-5 w-5 text-primary" />
            </div>
            <div>
              <p className="text-2xl font-bold">{summary.total_bookmakers}</p>
              <p className="text-xs text-muted-foreground">Casas Analisadas</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Total Bônus */}
      <Card>
        <CardContent className="p-4">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-lg bg-amber-500/10 flex items-center justify-center">
              <Gift className="h-5 w-5 text-amber-500" />
            </div>
            <div>
              <p className="text-2xl font-bold">{summary.total_bonus_count}</p>
              <p className="text-xs text-muted-foreground">
                {formatCurrency(summary.total_bonus_value)} em bônus
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Lucro Total */}
      <Card>
        <CardContent className="p-4">
          <div className="flex items-center gap-3">
            <div className={`h-10 w-10 rounded-lg flex items-center justify-center ${isPositiveProfit ? 'bg-emerald-500/10' : 'bg-red-500/10'}`}>
              {isPositiveProfit ? (
                <TrendingUp className="h-5 w-5 text-emerald-500" />
              ) : (
                <TrendingDown className="h-5 w-5 text-red-500" />
              )}
            </div>
            <div>
              <p className={`text-2xl font-bold ${isPositiveProfit ? 'text-emerald-500' : 'text-red-500'}`}>
                {formatCurrency(summary.total_profit)}
              </p>
              <p className="text-xs text-muted-foreground">Lucro de Bônus</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* ROI Médio */}
      <Card>
        <CardContent className="p-4">
          <div className="flex items-center gap-3">
            <div className={`h-10 w-10 rounded-lg flex items-center justify-center ${isPositiveROI ? 'bg-blue-500/10' : 'bg-red-500/10'}`}>
              <DollarSign className={`h-5 w-5 ${isPositiveROI ? 'text-blue-500' : 'text-red-500'}`} />
            </div>
            <div>
              <p className={`text-2xl font-bold ${isPositiveROI ? 'text-blue-500' : 'text-red-500'}`}>
                {summary.average_roi.toFixed(1)}%
              </p>
              <p className="text-xs text-muted-foreground">ROI Médio</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Best Performer */}
      {summary.best_performer && (
        <Card className="col-span-2 border-emerald-500/30 bg-emerald-500/5">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-lg bg-emerald-500/20 flex items-center justify-center">
                <Crown className="h-5 w-5 text-emerald-500" />
              </div>
              {summary.best_performer.logo_url ? (
                <img 
                  src={summary.best_performer.logo_url} 
                  alt={summary.best_performer.nome}
                  className="h-8 w-8 rounded object-contain logo-blend p-0.5"
                />
              ) : (
                <div className="h-8 w-8 rounded bg-muted flex items-center justify-center">
                  <Building2 className="h-4 w-4 text-muted-foreground" />
                </div>
              )}
              <div className="flex-1">
                <p className="text-sm font-medium">{summary.best_performer.nome}</p>
                <p className="text-xs text-muted-foreground">Melhor Desempenho</p>
              </div>
              <div className="text-right">
                <p className="text-lg font-bold text-emerald-500">
                  {summary.best_performer.roi.toFixed(0)}% ROI
                </p>
                <p className="text-xs text-muted-foreground">
                  {formatCurrency(summary.best_performer.total_profit)} lucro
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Worst Performer */}
      {summary.worst_performer && summary.worst_performer.roi < 0 && (
        <Card className="col-span-2 border-red-500/30 bg-red-500/5">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-lg bg-red-500/20 flex items-center justify-center">
                <Skull className="h-5 w-5 text-red-500" />
              </div>
              {summary.worst_performer.logo_url ? (
                <img 
                  src={summary.worst_performer.logo_url} 
                  alt={summary.worst_performer.nome}
                  className="h-8 w-8 rounded object-contain logo-blend p-0.5"
                />
              ) : (
                <div className="h-8 w-8 rounded bg-muted flex items-center justify-center">
                  <Building2 className="h-4 w-4 text-muted-foreground" />
                </div>
              )}
              <div className="flex-1">
                <p className="text-sm font-medium">{summary.worst_performer.nome}</p>
                <p className="text-xs text-muted-foreground">Pior Desempenho</p>
              </div>
              <div className="text-right">
                <p className="text-lg font-bold text-red-500">
                  {summary.worst_performer.roi.toFixed(0)}% ROI
                </p>
                <p className="text-xs text-muted-foreground">
                  {formatCurrency(summary.worst_performer.total_profit)} prejuízo
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
