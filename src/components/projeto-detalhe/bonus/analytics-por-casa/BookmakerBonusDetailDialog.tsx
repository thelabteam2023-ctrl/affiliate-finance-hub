import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";
import { 
  Building2, 
  TrendingUp, 
  TrendingDown,
  CheckCircle2,
  XCircle,
  Clock,
  Percent,
  DollarSign,
  BarChart3,
  AlertTriangle,
  Target
} from "lucide-react";
import { BookmakerBonusStats } from "@/hooks/useWorkspaceBonusAnalytics";

interface BookmakerBonusDetailDialogProps {
  bookmaker: BookmakerBonusStats | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

function formatCurrency(value: number): string {
  return new Intl.NumberFormat('pt-BR', { 
    style: 'currency', 
    currency: 'BRL',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

function getClassificationBadge(classification: BookmakerBonusStats['classification']) {
  switch (classification) {
    case 'excellent':
      return { label: 'Excelente', className: 'bg-emerald-500/20 text-emerald-500 border-emerald-500/30' };
    case 'good':
      return { label: 'Boa', className: 'bg-blue-500/20 text-blue-500 border-blue-500/30' };
    case 'average':
      return { label: 'Média', className: 'bg-yellow-500/20 text-yellow-500 border-yellow-500/30' };
    case 'poor':
      return { label: 'Fraca', className: 'bg-orange-500/20 text-orange-500 border-orange-500/30' };
    case 'toxic':
      return { label: 'Tóxica', className: 'bg-red-500/20 text-red-500 border-red-500/30' };
  }
}

export function BookmakerBonusDetailDialog({ 
  bookmaker, 
  open, 
  onOpenChange 
}: BookmakerBonusDetailDialogProps) {
  if (!bookmaker) return null;

  const badge = getClassificationBadge(bookmaker.classification);
  const isPositiveROI = bookmaker.roi >= 0;
  const isPositiveProfit = bookmaker.total_profit >= 0;
  const isPositiveEfficiency = bookmaker.efficiency_rate >= 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <div className="flex items-center gap-3">
            {bookmaker.logo_url ? (
              <img 
                src={bookmaker.logo_url} 
                alt={bookmaker.nome}
                className="h-12 w-12 rounded-lg object-contain logo-blend p-1"
              />
            ) : (
              <div className="h-12 w-12 rounded-lg bg-primary/10 flex items-center justify-center">
                <Building2 className="h-6 w-6 text-primary" />
              </div>
            )}
            <div>
              <DialogTitle className="flex items-center gap-2">
                {bookmaker.nome}
                <Badge variant="outline" className={`text-xs ${badge.className}`}>
                  {badge.label}
                </Badge>
              </DialogTitle>
              <p className="text-sm text-muted-foreground">
                Análise histórica de bônus
              </p>
            </div>
          </div>
        </DialogHeader>

        <div className="space-y-6 mt-4">
          {/* Main Metrics */}
          <div className="grid grid-cols-3 gap-4">
            <div className="text-center p-3 rounded-lg bg-muted/50">
              <p className={`text-2xl font-bold ${isPositiveROI ? 'text-emerald-500' : 'text-red-500'}`}>
                {bookmaker.roi.toFixed(1)}%
              </p>
              <p className="text-xs text-muted-foreground">ROI de Bônus</p>
            </div>
            <div className="text-center p-3 rounded-lg bg-muted/50">
              <p className={`text-2xl font-bold ${isPositiveProfit ? 'text-emerald-500' : 'text-red-500'}`}>
                {formatCurrency(bookmaker.total_profit)}
              </p>
              <p className="text-xs text-muted-foreground">Lucro Total</p>
            </div>
            <div className="text-center p-3 rounded-lg bg-muted/50">
              <p className={`text-2xl font-bold ${bookmaker.conversion_rate >= 50 ? 'text-emerald-500' : bookmaker.conversion_rate >= 25 ? 'text-yellow-500' : 'text-red-500'}`}>
                {bookmaker.conversion_rate.toFixed(0)}%
              </p>
              <p className="text-xs text-muted-foreground">Conversão</p>
            </div>
          </div>

          <Separator />

          {/* Bonus Stats */}
          <div>
            <h4 className="text-sm font-medium mb-3 flex items-center gap-2">
              <DollarSign className="h-4 w-4 text-primary" />
              Estatísticas de Bônus
            </h4>
            <div className="grid grid-cols-2 gap-3">
              <div className="flex items-center justify-between p-2 rounded bg-muted/30">
                <span className="text-sm text-muted-foreground">Total Recebido</span>
                <span className="font-medium">{bookmaker.total_bonus_count}</span>
              </div>
              <div className="flex items-center justify-between p-2 rounded bg-muted/30">
                <span className="text-sm text-muted-foreground">Valor Total</span>
                <span className="font-medium">{formatCurrency(bookmaker.total_bonus_value)}</span>
              </div>
              <div className="flex items-center justify-between p-2 rounded bg-muted/30">
                <span className="text-sm text-muted-foreground flex items-center gap-1">
                  <CheckCircle2 className="h-3 w-3 text-emerald-500" />
                  Convertidos
                </span>
                <span className="font-medium text-emerald-500">{bookmaker.bonus_converted_count}</span>
              </div>
              <div className="flex items-center justify-between p-2 rounded bg-muted/30">
                <span className="text-sm text-muted-foreground flex items-center gap-1">
                  <XCircle className="h-3 w-3 text-red-500" />
                  Problemas
                </span>
                <span className="font-medium text-red-500">{bookmaker.bonus_problem_count}</span>
              </div>
            </div>
          </div>

          {/* Bet Stats */}
          <div>
            <h4 className="text-sm font-medium mb-3 flex items-center gap-2">
              <BarChart3 className="h-4 w-4 text-primary" />
              Apostas de Bônus
            </h4>
            <div className="grid grid-cols-2 gap-3">
              <div className="flex items-center justify-between p-2 rounded bg-muted/30">
                <span className="text-sm text-muted-foreground">Total Apostas</span>
                <span className="font-medium">{bookmaker.total_bets}</span>
              </div>
              <div className="flex items-center justify-between p-2 rounded bg-muted/30">
                <span className="text-sm text-muted-foreground">Stake Total</span>
                <span className="font-medium">{formatCurrency(bookmaker.total_stake)}</span>
              </div>
              <div className="flex items-center justify-between p-2 rounded bg-muted/30">
                <span className="text-sm text-muted-foreground flex items-center gap-1">
                  <TrendingUp className="h-3 w-3 text-emerald-500" />
                  Ganhas
                </span>
                <span className="font-medium text-emerald-500">{bookmaker.bets_won}</span>
              </div>
              <div className="flex items-center justify-between p-2 rounded bg-muted/30">
                <span className="text-sm text-muted-foreground flex items-center gap-1">
                  <TrendingDown className="h-3 w-3 text-red-500" />
                  Perdidas
                </span>
                <span className="font-medium text-red-500">{bookmaker.bets_lost}</span>
              </div>
              {bookmaker.bets_pending > 0 && (
                <div className="flex items-center justify-between p-2 rounded bg-muted/30 col-span-2">
                  <span className="text-sm text-muted-foreground flex items-center gap-1">
                    <Clock className="h-3 w-3 text-yellow-500" />
                    Pendentes
                  </span>
                  <span className="font-medium text-yellow-500">{bookmaker.bets_pending}</span>
                </div>
              )}
            </div>
          </div>

          {/* Efficiency Metrics */}
          <div>
            <h4 className="text-sm font-medium mb-3 flex items-center gap-2">
              <Target className="h-4 w-4 text-primary" />
              Eficiência
            </h4>
            <div className="space-y-3">
              <div>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-sm text-muted-foreground">Taxa de Conversão</span>
                  <span className="text-sm font-medium">{bookmaker.conversion_rate.toFixed(1)}%</span>
                </div>
                <Progress value={Math.min(bookmaker.conversion_rate, 100)} className="h-2" />
              </div>
              <div>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-sm text-muted-foreground">Eficiência (Lucro/Bônus)</span>
                  <span className={`text-sm font-medium ${isPositiveEfficiency ? 'text-emerald-500' : 'text-red-500'}`}>
                    {bookmaker.efficiency_rate.toFixed(1)}%
                  </span>
                </div>
                <Progress 
                  value={Math.max(0, Math.min(bookmaker.efficiency_rate + 50, 100))} 
                  className="h-2" 
                />
              </div>
            </div>
          </div>

          {/* Data Confidence Warning */}
          {bookmaker.data_confidence < 80 && (
            <div className="flex items-start gap-2 p-3 rounded-lg bg-yellow-500/10 border border-yellow-500/20">
              <AlertTriangle className="h-4 w-4 text-yellow-500 mt-0.5 shrink-0" />
              <div>
                <p className="text-sm font-medium text-yellow-500">Dados Parciais</p>
                <p className="text-xs text-muted-foreground">
                  {bookmaker.data_confidence.toFixed(0)}% das apostas estão vinculadas diretamente aos bônus. 
                  O ROI pode variar conforme mais apostas forem registradas corretamente.
                </p>
              </div>
            </div>
          )}

          {/* Investment Info */}
          {bookmaker.total_deposits > 0 && (
            <div className="p-3 rounded-lg bg-muted/30">
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Total Investido (Depósitos)</span>
                <span className="font-medium">{formatCurrency(bookmaker.total_deposits)}</span>
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
