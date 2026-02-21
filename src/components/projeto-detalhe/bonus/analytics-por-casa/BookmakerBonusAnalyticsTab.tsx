import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { 
  Search, 
  Building2, 
  Trophy, 
  TrendingUp, 
  TrendingDown,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Percent,
  DollarSign,
  BarChart3,
  Info
} from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useWorkspaceBonusAnalytics, BookmakerBonusStats } from "@/hooks/useWorkspaceBonusAnalytics";
import { BookmakerBonusAnalyticsSummary } from "./BookmakerBonusAnalyticsSummary";
import { BookmakerBonusDetailDialog } from "./BookmakerBonusDetailDialog";

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

function formatCurrency(value: number): string {
  return new Intl.NumberFormat('pt-BR', { 
    style: 'currency', 
    currency: 'BRL',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value);
}

export function BookmakerBonusAnalyticsTab() {
  const { stats, summary, loading, error } = useWorkspaceBonusAnalytics();
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedBookmaker, setSelectedBookmaker] = useState<BookmakerBonusStats | null>(null);

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
          <h3 className="font-medium text-lg mb-2">Nenhum dado de bônus encontrado</h3>
          <p className="text-sm text-muted-foreground max-w-md">
            Registre bônus em seus projetos para visualizar a análise histórica por casa de apostas.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* Summary Cards */}
      <BookmakerBonusAnalyticsSummary summary={summary} />

      {/* Ranking Section */}
      <Card>
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Trophy className="h-4 w-4 text-primary" />
              <CardTitle className="text-sm font-medium">Ranking de Casas por Bônus</CardTitle>
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
            Visão consolidada de todo o histórico de bônus, independente de projeto
          </p>
        </CardHeader>
        <CardContent>
          <ScrollArea className="h-[500px]">
            <div className="space-y-2">
              {filteredStats.map((bk, index) => {
                const badge = getClassificationBadge(bk.classification);
                const isPositiveROI = bk.roi >= 0;
                const isPositiveProfit = bk.total_profit >= 0;

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
                        <Badge variant="outline" className={`text-[10px] px-1.5 py-0 h-4 ${badge.className}`}>
                          {badge.label}
                        </Badge>
                        {bk.data_confidence < 50 && (
                          <Tooltip>
                            <TooltipTrigger>
                              <Info className="h-3 w-3 text-muted-foreground" />
                            </TooltipTrigger>
                            <TooltipContent>
                              <p className="text-xs">Confiança dos dados: {bk.data_confidence.toFixed(0)}%</p>
                              <p className="text-xs text-muted-foreground">Algumas apostas não estão vinculadas</p>
                            </TooltipContent>
                          </Tooltip>
                        )}
                      </div>
                      <div className="flex items-center gap-3 text-xs text-muted-foreground mt-0.5">
                        <span className="flex items-center gap-1">
                          <DollarSign className="h-3 w-3" />
                          {bk.total_bonus_count} bônus
                        </span>
                        <span className="flex items-center gap-1">
                          <BarChart3 className="h-3 w-3" />
                          {bk.total_bets} apostas
                        </span>
                        <span className="flex items-center gap-1">
                          <CheckCircle2 className="h-3 w-3 text-emerald-500" />
                          {bk.bonus_converted_count}
                        </span>
                        <span className="flex items-center gap-1">
                          <XCircle className="h-3 w-3 text-red-500" />
                          {bk.bonus_problem_count}
                        </span>
                      </div>
                    </div>

                    {/* Metrics */}
                    <div className="flex items-center gap-4 shrink-0">
                      {/* Valor Total Bônus */}
                      <div className="text-right">
                        <p className="text-sm font-semibold">{formatCurrency(bk.total_bonus_value)}</p>
                        <p className="text-[10px] text-muted-foreground">Total Bônus</p>
                      </div>

                      {/* Lucro */}
                      <div className="text-right">
                        <p className={`text-sm font-semibold flex items-center gap-1 ${isPositiveProfit ? 'text-emerald-500' : 'text-red-500'}`}>
                          {isPositiveProfit ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
                          {formatCurrency(bk.total_profit)}
                        </p>
                        <p className="text-[10px] text-muted-foreground">Lucro</p>
                      </div>

                      {/* Conversão */}
                      <div className="text-right min-w-[50px]">
                        <p className={`text-sm font-semibold ${bk.conversion_rate >= 50 ? 'text-emerald-500' : bk.conversion_rate >= 25 ? 'text-yellow-500' : 'text-red-500'}`}>
                          {bk.conversion_rate.toFixed(0)}%
                        </p>
                        <p className="text-[10px] text-muted-foreground">Conversão</p>
                      </div>

                      {/* ROI */}
                      <div className="text-right min-w-[60px]">
                        <div className={`flex items-center justify-end gap-1 text-sm font-bold ${isPositiveROI ? 'text-emerald-500' : 'text-red-500'}`}>
                          <Percent className="h-3 w-3" />
                          {bk.roi.toFixed(0)}%
                        </div>
                        <p className="text-[10px] text-muted-foreground">ROI</p>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </ScrollArea>
        </CardContent>
      </Card>

      {/* Detail Dialog */}
      <BookmakerBonusDetailDialog
        bookmaker={selectedBookmaker}
        open={!!selectedBookmaker}
        onOpenChange={(open) => !open && setSelectedBookmaker(null)}
      />
    </div>
  );
}
