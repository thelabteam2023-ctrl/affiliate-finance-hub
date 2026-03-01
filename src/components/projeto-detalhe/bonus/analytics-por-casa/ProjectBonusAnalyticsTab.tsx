import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { 
  Search, 
  Building2, 
  AlertTriangle,
  CheckCircle2,
  XCircle,
  BarChart3,
  Gift,
  Target,
  Clock
} from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useProjectBonusAnalytics, BookmakerBonusStats } from "@/hooks/useProjectBonusAnalytics";
import { useProjetoCurrency } from "@/hooks/useProjetoCurrency";
import { useWithdrawalLeadTime, formatLeadTimeDays } from "@/hooks/useWithdrawalLeadTime";
import { ProjectBonusAnalyticsSummary } from "./ProjectBonusAnalyticsSummary";
import { ProjectBonusDetailDialog } from "./ProjectBonusDetailDialog";

function formatCurrency(value: number, currency: string): string {
  const symbols: Record<string, string> = { BRL: 'R$', USD: '$', EUR: '€', GBP: '£', USDT: 'USDT' };
  return `${symbols[currency] || currency} ${value.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`;
}

interface ProjectBonusAnalyticsTabProps {
  projectId: string;
}

export function ProjectBonusAnalyticsTab({ projectId }: ProjectBonusAnalyticsTabProps) {
  const { convertToConsolidation } = useProjetoCurrency(projectId);
  const { stats, summary, loading, error } = useProjectBonusAnalytics(projectId, convertToConsolidation);
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedBookmaker, setSelectedBookmaker] = useState<BookmakerBonusStats | null>(null);

  const catalogoIds = stats.map(s => s.bookmaker_catalogo_id);
  const { leadTimes } = useWithdrawalLeadTime(catalogoIds);

  const filteredStats = stats.filter(s => 
    s.nome.toLowerCase().includes(searchTerm.toLowerCase())
  );

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="grid grid-cols-4 gap-4">
          {[...Array(4)].map((_, i) => (
            <Skeleton key={i} className="h-24" />
          ))}
        </div>
        <Skeleton className="h-96" />
      </div>
    );
  }

  if (error) {
    return (
      <Card className="border-destructive/50">
        <CardContent className="flex items-center gap-3 py-6">
          <AlertTriangle className="h-5 w-5 text-destructive" />
          <p className="text-destructive">{error}</p>
        </CardContent>
      </Card>
    );
  }

  if (stats.length === 0) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center justify-center py-12 text-center">
          <Building2 className="h-12 w-12 text-muted-foreground/30 mb-4" />
          <h3 className="font-medium text-lg mb-2">Nenhum dado de bônus neste projeto</h3>
          <p className="text-sm text-muted-foreground max-w-md">
            Registre bônus neste projeto para visualizar a análise histórica por casa de apostas.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* Summary Cards */}
      <ProjectBonusAnalyticsSummary summary={summary} stats={stats} projetoId={projectId} />

      {/* Ranking Section */}
      <Card>
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <BarChart3 className="h-4 w-4 text-primary" />
              <CardTitle className="text-sm font-medium">Análise por Casa</CardTitle>
            </div>
            <div className="relative w-64">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Buscar casa..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-8 h-8 text-sm"
              />
            </div>
          </div>
          <p className="text-xs text-muted-foreground">
            Histórico de bônus deste projeto, com valores na moeda nativa de cada casa
          </p>
        </CardHeader>
        <CardContent>
          <ScrollArea className="h-[500px]">
            <div className="space-y-2">
              {filteredStats.map((bk, index) => {
                const hasProblems = bk.bonus_problem_count > 0;
                const completionColor = bk.completion_rate >= 70 
                  ? 'text-emerald-500' 
                  : bk.completion_rate >= 40 
                    ? 'text-yellow-500' 
                    : 'text-muted-foreground';

                return (
                  <div 
                    key={bk.bookmaker_catalogo_id}
                    className="flex items-center gap-3 p-3 rounded-lg bg-muted/50 border hover:bg-muted/80 transition-colors cursor-pointer"
                    onClick={() => setSelectedBookmaker(bk)}
                  >
                    {/* Rank */}
                    <div className="flex items-center justify-center w-6 h-6 rounded-full bg-primary/10 text-xs font-bold text-primary shrink-0">
                      {index + 1}
                    </div>

                    {/* Logo */}
                    {bk.logo_url ? (
                      <img 
                        src={bk.logo_url} 
                        alt={bk.nome} 
                        className="h-10 w-10 rounded-lg object-contain logo-blend p-0.5 shrink-0" 
                      />
                    ) : (
                      <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                        <Building2 className="h-5 w-5 text-primary" />
                      </div>
                    )}

                    {/* Info */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="font-medium text-sm truncate">{bk.nome}</p>
                        <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-4">
                          {bk.currency}
                        </Badge>
                      </div>
                      <div className="flex items-center gap-3 text-xs text-muted-foreground mt-0.5 flex-wrap">
                        <span className="flex items-center gap-1">
                          <Gift className="h-3 w-3" />
                          {bk.total_bonus_count} bônus
                        </span>
                        <span className="flex items-center gap-1">
                          <Target className="h-3 w-3" />
                          {bk.total_bets} apostas
                        </span>
                        {bk.bonus_converted_count > 0 && (
                          <span className="flex items-center gap-1 text-emerald-500">
                            <CheckCircle2 className="h-3 w-3" />
                            {bk.bonus_converted_count} convertidos
                          </span>
                        )}
                        {hasProblems && (
                          <span className="flex items-center gap-1 text-red-500">
                            <XCircle className="h-3 w-3" />
                            {bk.bonus_problem_count} problema{bk.bonus_problem_count > 1 ? 's' : ''}
                          </span>
                        )}
                        {leadTimes[bk.bookmaker_catalogo_id] && (
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <span className="flex items-center gap-1 text-blue-400">
                                <Clock className="h-3 w-3" />
                                Saque: {formatLeadTimeDays(leadTimes[bk.bookmaker_catalogo_id].avg_days)}
                              </span>
                            </TooltipTrigger>
                            <TooltipContent>
                              <div className="text-xs space-y-0.5">
                                <p>Tempo médio de saque: {formatLeadTimeDays(leadTimes[bk.bookmaker_catalogo_id].avg_days)}</p>
                                <p>Min: {formatLeadTimeDays(leadTimes[bk.bookmaker_catalogo_id].min_days)} · Max: {formatLeadTimeDays(leadTimes[bk.bookmaker_catalogo_id].max_days)}</p>
                                <p>{leadTimes[bk.bookmaker_catalogo_id].total_saques} saque(s) analisado(s)</p>
                              </div>
                            </TooltipContent>
                          </Tooltip>
                        )}
                      </div>
                    </div>

                    {/* Metrics */}
                    <div className="flex items-center gap-4 shrink-0">
                      {/* Valor Total Bônus */}
                      <div className="text-right">
                        <p className="text-sm font-semibold">{formatCurrency(bk.total_bonus_value, bk.currency)}</p>
                        <p className="text-[10px] text-muted-foreground">Total Bônus</p>
                      </div>

                      {/* Volume de Apostas */}
                      <div className="text-right">
                        <p className="text-sm font-semibold">{formatCurrency(bk.total_stake, bk.currency)}</p>
                        <p className="text-[10px] text-muted-foreground">Volume</p>
                      </div>

                      {/* Taxa de Conclusão */}
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <div className="text-right min-w-[60px]">
                            <p className={`text-sm font-semibold ${completionColor}`}>
                              {bk.completion_rate.toFixed(0)}%
                            </p>
                            <p className="text-[10px] text-muted-foreground">Conclusão</p>
                          </div>
                        </TooltipTrigger>
                        <TooltipContent>
                          <p className="text-xs">
                            {bk.bonus_finalized_count} finalizados de {bk.bonus_credited_count} creditados
                          </p>
                        </TooltipContent>
                      </Tooltip>

                      {/* Pending indicator */}
                      {bk.bets_pending > 0 && (
                        <Tooltip>
                          <TooltipTrigger>
                            <Badge variant="outline" className="bg-amber-500/10 text-amber-500 border-amber-500/30">
                              <Clock className="h-3 w-3 mr-1" />
                              {bk.bets_pending}
                            </Badge>
                          </TooltipTrigger>
                          <TooltipContent>
                            <p className="text-xs">{bk.bets_pending} aposta(s) pendente(s)</p>
                          </TooltipContent>
                        </Tooltip>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </ScrollArea>
        </CardContent>
      </Card>

      {/* Detail Dialog */}
      <ProjectBonusDetailDialog
        bookmaker={selectedBookmaker}
        open={!!selectedBookmaker}
        onOpenChange={(open) => !open && setSelectedBookmaker(null)}
      />
    </div>
  );
}
