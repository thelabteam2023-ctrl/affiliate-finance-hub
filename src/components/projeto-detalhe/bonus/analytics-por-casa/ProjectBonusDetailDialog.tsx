import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { 
  Building2, 
  Gift, 
  Target,
  CheckCircle2,
  XCircle,
  Clock,
  TrendingUp,
  TrendingDown,
  MinusCircle,
  DollarSign,
  AlertTriangle,
  Percent,
  ArrowUpRight,
  ArrowDownRight,
  Shield
} from "lucide-react";
import { BookmakerBonusStats } from "@/hooks/useProjectBonusAnalytics";
import { getFinancialDisplay } from "@/lib/financial-display";

interface ProjectBonusDetailDialogProps {
  bookmaker: BookmakerBonusStats | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

function formatCurrency(value: number, currency: string): string {
  const symbols: Record<string, string> = { BRL: 'R$', USD: '$', EUR: '€', GBP: '£', USDT: 'USDT' };
  return `${symbols[currency] || currency} ${value.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`;
}

function getRiskLevel(problemIndex: number): { label: string; color: string; bg: string } {
  if (problemIndex === 0) return { label: 'Confiável', color: 'text-emerald-500', bg: 'bg-emerald-500/10' };
  if (problemIndex <= 10) return { label: 'Atenção', color: 'text-amber-500', bg: 'bg-amber-500/10' };
  return { label: 'Alto Risco', color: 'text-red-500', bg: 'bg-red-500/10' };
}

export function ProjectBonusDetailDialog({ bookmaker, open, onOpenChange }: ProjectBonusDetailDialogProps) {
  if (!bookmaker) return null;

  const bk = bookmaker;
  const winRate = (bk.bets_won + bk.bets_lost) > 0 
    ? ((bk.bets_won / (bk.bets_won + bk.bets_lost)) * 100) 
    : 0;
  
  const profitDisplay = getFinancialDisplay(bk.net_profit);
  const riskLevel = getRiskLevel(bk.problem_index);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-center gap-3">
            {bk.logo_url ? (
              <img 
                src={bk.logo_url} 
                alt={bk.nome} 
                className="h-12 w-12 rounded-lg object-contain logo-blend p-0.5" 
              />
            ) : (
              <div className="h-12 w-12 rounded-lg bg-primary/10 flex items-center justify-center">
                <Building2 className="h-6 w-6 text-primary" />
              </div>
            )}
            <div>
              <DialogTitle className="text-lg">{bk.nome}</DialogTitle>
              <div className="flex gap-2 mt-1">
                <Badge variant="outline">{bk.currency}</Badge>
                <Badge className={`${riskLevel.bg} ${riskLevel.color} border-0`}>
                  <Shield className="h-3 w-3 mr-1" />
                  {riskLevel.label}
                </Badge>
              </div>
            </div>
          </div>
        </DialogHeader>

        <div className="space-y-5 mt-4">
          {/* MÉTRICA PRINCIPAL - RENTABILIDADE */}
          <div className="p-4 rounded-xl border-2 border-primary/20 bg-gradient-to-br from-primary/5 to-transparent">
            <h4 className="text-xs font-medium text-muted-foreground mb-3 flex items-center gap-2">
              <DollarSign className="h-4 w-4" />
              RENTABILIDADE DA CASA
            </h4>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-xs text-muted-foreground">ROI</p>
                <p className={`text-2xl font-bold flex items-center gap-1 ${
                  bk.roi > 0 ? 'text-emerald-500' : bk.roi < 0 ? 'text-red-500' : 'text-muted-foreground'
                }`}>
                  {bk.roi > 0 ? <ArrowUpRight className="h-5 w-5" /> : bk.roi < 0 ? <ArrowDownRight className="h-5 w-5" /> : null}
                  {bk.roi.toFixed(2)}%
                </p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Lucro Líquido</p>
                <p className={`text-xl font-bold ${profitDisplay.colorClass}`}>
                  {profitDisplay.isNegative && '-'}{formatCurrency(profitDisplay.absoluteValue, bk.currency)}
                </p>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4 mt-3 pt-3 border-t border-border/50">
              <div>
                <p className="text-xs text-muted-foreground">Depositado</p>
                <p className="text-sm font-medium">{formatCurrency(bk.total_deposits, bk.currency)}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Sacado</p>
                <p className="text-sm font-medium text-emerald-500">{formatCurrency(bk.total_withdrawals, bk.currency)}</p>
              </div>
            </div>
          </div>

          {/* Estatísticas de Bônus */}
          <div>
            <h4 className="text-sm font-medium mb-3 flex items-center gap-2">
              <Gift className="h-4 w-4 text-amber-500" />
              Estatísticas de Bônus
            </h4>
            <div className="grid grid-cols-2 gap-3">
              <div className="p-3 rounded-lg bg-muted/50">
                <p className="text-2xl font-bold">{bk.total_bonus_count}</p>
                <p className="text-xs text-muted-foreground">Total de Bônus</p>
              </div>
              <div className="p-3 rounded-lg bg-muted/50">
                <p className="text-lg font-bold">{formatCurrency(bk.total_bonus_value, bk.currency)}</p>
                <p className="text-xs text-muted-foreground">Valor Total</p>
              </div>
              <div className="p-3 rounded-lg bg-emerald-500/10">
                <p className="text-xl font-bold text-emerald-500 flex items-center gap-1">
                  <CheckCircle2 className="h-4 w-4" />
                  {bk.bonus_converted_count}
                </p>
                <p className="text-xs text-muted-foreground">Rollover Completo</p>
              </div>
              <div className="p-3 rounded-lg bg-red-500/10">
                <p className="text-xl font-bold text-red-500 flex items-center gap-1">
                  <XCircle className="h-4 w-4" />
                  {bk.bonus_problem_count}
                </p>
                <p className="text-xs text-muted-foreground">Problemas</p>
              </div>
            </div>
          </div>

          {/* Métricas de Risco e Eficiência */}
          <div>
            <h4 className="text-sm font-medium mb-3 flex items-center gap-2">
              <Percent className="h-4 w-4 text-blue-500" />
              Indicadores de Eficiência
            </h4>
            <div className="grid grid-cols-3 gap-3">
              <div className="p-3 rounded-lg bg-muted/50 text-center">
                <p className="text-lg font-bold">{bk.bonus_conversion_rate.toFixed(0)}%</p>
                <p className="text-xs text-muted-foreground">Taxa Conversão</p>
              </div>
              <div className={`p-3 rounded-lg text-center ${riskLevel.bg}`}>
                <p className={`text-lg font-bold ${riskLevel.color} flex items-center justify-center gap-1`}>
                  {bk.problem_index > 0 && <AlertTriangle className="h-4 w-4" />}
                  {bk.problem_index.toFixed(0)}%
                </p>
                <p className="text-xs text-muted-foreground">Índice Problema</p>
              </div>
              <div className="p-3 rounded-lg bg-muted/50 text-center">
                <p className={`text-lg font-bold ${bk.rollover_efficiency > 0 ? 'text-emerald-500' : bk.rollover_efficiency < 0 ? 'text-red-500' : ''}`}>
                  {bk.rollover_efficiency.toFixed(1)}%
                </p>
                <p className="text-xs text-muted-foreground">Efic. Rollover</p>
              </div>
            </div>
          </div>

          {/* Taxa de Conclusão */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium">Taxa de Conclusão</span>
              <span className="text-sm font-bold">{bk.completion_rate.toFixed(0)}%</span>
            </div>
            <Progress value={bk.completion_rate} className="h-2" />
            <p className="text-xs text-muted-foreground mt-1">
              {bk.bonus_finalized_count} finalizados de {bk.bonus_credited_count} creditados
            </p>
          </div>

          {/* Estatísticas de Apostas */}
          <div>
            <h4 className="text-sm font-medium mb-3 flex items-center gap-2">
              <Target className="h-4 w-4 text-blue-500" />
              Apostas de Bônus
            </h4>
            <div className="grid grid-cols-4 gap-3">
              <div className="p-3 rounded-lg bg-muted/50 text-center">
                <p className="text-xl font-bold">{bk.total_bets}</p>
                <p className="text-xs text-muted-foreground">Total</p>
              </div>
              <div className="p-3 rounded-lg bg-emerald-500/10 text-center">
                <p className="text-xl font-bold text-emerald-500 flex items-center justify-center gap-1">
                  <TrendingUp className="h-4 w-4" />
                  {bk.bets_won}
                </p>
                <p className="text-xs text-muted-foreground">Ganhas</p>
              </div>
              <div className="p-3 rounded-lg bg-red-500/10 text-center">
                <p className="text-xl font-bold text-red-500 flex items-center justify-center gap-1">
                  <TrendingDown className="h-4 w-4" />
                  {bk.bets_lost}
                </p>
                <p className="text-xs text-muted-foreground">Perdidas</p>
              </div>
              <div className="p-3 rounded-lg bg-gray-500/10 text-center">
                <p className="text-xl font-bold text-gray-400 flex items-center justify-center gap-1">
                  <MinusCircle className="h-4 w-4" />
                  {bk.bets_void}
                </p>
                <p className="text-xs text-muted-foreground">Void</p>
              </div>
            </div>
            
            {bk.bets_pending > 0 && (
              <div className="mt-2 p-2 rounded bg-amber-500/10 flex items-center gap-2 text-sm">
                <Clock className="h-4 w-4 text-amber-500" />
                <span className="text-amber-500">{bk.bets_pending} aposta(s) pendente(s)</span>
              </div>
            )}
          </div>

          {/* Volume e Win Rate */}
          <div className="grid grid-cols-2 gap-4">
            <div className="p-4 rounded-lg bg-blue-500/10">
              <p className="text-lg font-bold text-blue-500">{formatCurrency(bk.total_stake, bk.currency)}</p>
              <p className="text-xs text-muted-foreground">Volume Apostado</p>
            </div>
            <div className="p-4 rounded-lg bg-muted/50">
              <p className="text-lg font-bold">{winRate.toFixed(0)}%</p>
              <p className="text-xs text-muted-foreground">Taxa de Acerto</p>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}