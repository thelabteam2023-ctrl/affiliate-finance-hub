import { useMemo, Fragment } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Building2, Coins, TrendingUp, TrendingDown, Receipt, BarChart3 } from "lucide-react";
import { useProjectBonuses } from "@/hooks/useProjectBonuses";
import { useProjetoCurrency } from "@/hooks/useProjetoCurrency";
import { useProjectBonusAnalytics } from "@/hooks/useProjectBonusAnalytics";
import { Tooltip as TooltipUI, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { useQuery } from "@tanstack/react-query";
import { PERIOD_STALE_TIME, PERIOD_GC_TIME } from "@/lib/query-cache-config";
import { supabase } from "@/integrations/supabase/client";
import { subDays } from "date-fns";
import { Skeleton } from "@/components/ui/skeleton";
import { CurrencyBreakdownTooltip } from "@/components/ui/currency-breakdown-tooltip";

interface BonusSummaryCardsProps {
  projetoId: string;
  /** Se true, mostra versão compacta (2 cards) ao invés de 4 */
  compact?: boolean;
}

export function BonusSummaryCards({ projetoId, compact = false }: BonusSummaryCardsProps) {
  const { bonuses, getSummary, loading: bonusesLoading } = useProjectBonuses({ projectId: projetoId });
  const { formatCurrency, convertToConsolidation, convertToConsolidationOficial } = useProjetoCurrency(projetoId);
  const { summary: analyticsSummary } = useProjectBonusAnalytics(projetoId, convertToConsolidationOficial);

  const summary = getSummary();

  // Total de bônus ativo consolidado
  const activeBonusTotalConsolidated = useMemo(() => {
    return bonuses
      .filter((b) => b.status === "credited" && (b.saldo_atual || 0) > 0)
      .reduce((acc, b) => acc + convertToConsolidationOficial(b.saldo_atual || 0, b.currency), 0);
  }, [bonuses, convertToConsolidationOficial]);

  // Fetch apostas com bônus para calcular juice
  // INCLUI: apostas com bonus_id OU estratégia EXTRACAO_BONUS (mesmo sem bonus_id)
  const { data: bonusBetsData = [], isLoading: betsLoading } = useQuery({
    queryKey: ["bonus-bets-summary", projetoId],
    queryFn: async () => {
      const startDate = subDays(new Date(), 365).toISOString();
      const startDateStr = startDate.split('T')[0];
      
      // Query 1: apostas vinculadas via bonus_id
      const queryBonusId = supabase
        .from("apostas_unificada")
        .select("id, pl_consolidado, lucro_prejuizo, moeda_operacao")
        .eq("projeto_id", projetoId)
        .gte("data_aposta", startDateStr)
        .not("bonus_id", "is", null);

      // Query 2: apostas com estratégia EXTRACAO_BONUS (mesmo sem bonus_id)
      const queryEstrategia = supabase
        .from("apostas_unificada")
        .select("id, pl_consolidado, lucro_prejuizo, moeda_operacao")
        .eq("projeto_id", projetoId)
        .gte("data_aposta", startDateStr)
        .eq("estrategia", "EXTRACAO_BONUS");

      const [resBonusId, resEstrategia] = await Promise.all([queryBonusId, queryEstrategia]);
      
      if (resBonusId.error) throw resBonusId.error;
      if (resEstrategia.error) throw resEstrategia.error;

      // Combinar removendo duplicados por id
      const allBets = [...(resBonusId.data || []), ...(resEstrategia.data || [])];
      return Array.from(new Map(allBets.map(b => [b.id, b])).values());
    },
    staleTime: PERIOD_STALE_TIME,
    gcTime: PERIOD_GC_TIME,
  });

  // Fetch ajustes pós-limitação (financial_events com AJUSTE_POS_LIMITACAO)
  const { data: ajustesPostLimitacao = [], isLoading: ajustesLoading } = useQuery({
    queryKey: ["bonus-ajustes-pos-limitacao", projetoId],
    queryFn: async () => {
      // Buscar bookmakers do projeto para filtrar os ajustes
      const { data: bookmakers } = await supabase
        .from("bookmakers")
        .select("id, moeda")
        .eq("projeto_id", projetoId);

      if (!bookmakers || bookmakers.length === 0) return [];

      const bookmakerIds = bookmakers.map(b => b.id);
      const moedaMap = new Map(bookmakers.map(b => [b.id, b.moeda || "BRL"]));

      const { data, error } = await supabase
        .from("financial_events")
        .select("id, valor, bookmaker_id, moeda, metadata")
        .in("bookmaker_id", bookmakerIds)
        .eq("tipo_evento", "AJUSTE")
        .not("metadata", "is", null);

      if (error) throw error;

      // Filtrar apenas AJUSTE_POS_LIMITACAO
      return (data || []).filter(evt => {
        try {
          const meta = typeof evt.metadata === "string" ? JSON.parse(evt.metadata) : evt.metadata;
          return meta?.tipo_ajuste === "AJUSTE_POS_LIMITACAO";
        } catch { return false; }
      }).map(evt => ({
        valor: Number(evt.valor) || 0,
        moeda: evt.moeda || moedaMap.get(evt.bookmaker_id) || "BRL",
      }));
    },
    enabled: !!projetoId,
    staleTime: PERIOD_STALE_TIME,
    gcTime: PERIOD_GC_TIME,
  });

  // Performance de Bônus = Total de bônus creditados + Juice das operações + Ajustes Pós-Limitação
  const bonusPerformance = useMemo(() => {
    const eligibleBonuses = bonuses.filter(b => b.status === "credited" || b.status === "finalized");
    
    const totalBonusCreditado = eligibleBonuses
      .reduce((acc, b) => acc + convertToConsolidationOficial(b.bonus_amount || 0, b.currency), 0);
    
    // Breakdown de bônus por moeda original
    const bonusPorMoedaMap: Record<string, number> = {};
    eligibleBonuses.forEach(b => {
      const moeda = b.currency || "BRL";
      bonusPorMoedaMap[moeda] = (bonusPorMoedaMap[moeda] || 0) + (b.bonus_amount || 0);
    });
    const bonusPorMoeda = Object.entries(bonusPorMoedaMap).map(([moeda, valor]) => ({ moeda, valor }));
    
    const juiceBets = bonusBetsData.reduce((acc, bet) => {
      if (bet.pl_consolidado != null) {
        return acc + bet.pl_consolidado;
      }
      const moedaOperacao = bet.moeda_operacao || "BRL";
      return acc + convertToConsolidationOficial(bet.lucro_prejuizo ?? 0, moedaOperacao);
    }, 0);

    // Somar ajustes pós-limitação ao juice
    const juiceAjustes = ajustesPostLimitacao.reduce((acc, a) => {
      return acc + convertToConsolidationOficial(a.valor, a.moeda);
    }, 0);

    const totalJuice = juiceBets + juiceAjustes;
    
    const total = totalBonusCreditado + totalJuice;
    const performancePercent = totalBonusCreditado > 0 
      ? (total / totalBonusCreditado) * 100 
      : 0;
    
    return { totalBonusCreditado, totalJuice, total, performancePercent, bonusPorMoeda };
  }, [bonuses, bonusBetsData, ajustesPostLimitacao, convertToConsolidationOficial]);

  const isLoading = bonusesLoading || betsLoading || ajustesLoading;

  if (isLoading) {
    return (
      <>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <Skeleton className="h-4 w-24" />
          </CardHeader>
          <CardContent>
            <Skeleton className="h-8 w-16" />
            <Skeleton className="h-3 w-28 mt-2" />
          </CardContent>
        </Card>
        {!compact && (
          <>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <Skeleton className="h-4 w-24" />
              </CardHeader>
              <CardContent>
                <Skeleton className="h-8 w-20" />
                <Skeleton className="h-3 w-28 mt-2" />
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <Skeleton className="h-4 w-28" />
              </CardHeader>
              <CardContent>
                <Skeleton className="h-8 w-24" />
                <Skeleton className="h-3 w-32 mt-2" />
              </CardContent>
            </Card>
          </>
        )}
      </>
    );
  }

  // Se não há bônus, não renderizar
  const totalBonuses = summary.count_credited + summary.count_pending + summary.count_finalized;
  if (totalBonuses === 0) {
    return null;
  }

  if (compact) {
    // Versão compacta: apenas 1 card combinado
    return (
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Bônus Ativo</CardTitle>
          <Coins className="h-4 w-4 text-warning" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">{formatCurrency(activeBonusTotalConsolidated)}</div>
          <p className="text-xs text-muted-foreground">
            {summary.bookmakers_with_active_bonus} casa{summary.bookmakers_with_active_bonus !== 1 ? 's' : ''} • {summary.count_credited} bônus
          </p>
        </CardContent>
      </Card>
    );
  }

  // Versão completa: 3 cards
  return (
    <TooltipProvider>
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Histórico de Casas</CardTitle>
          <Building2 className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <TooltipUI>
            <TooltipTrigger asChild>
              <div className="cursor-help">
                <div className="text-2xl font-bold">{analyticsSummary.total_bookmakers}</div>
                <p className="text-xs text-muted-foreground">
                  {analyticsSummary.total_bookmakers === 1 ? "casa já operada" : "casas já operadas"}
                </p>
              </div>
            </TooltipTrigger>
            <TooltipContent side="bottom" className="p-3">
              {(() => {
                const statuses = Object.entries(analyticsSummary.status_breakdown).filter(([, v]) => v > 0);
                const labels: Record<string, string> = { ativas: "Ativas", concluidas: "Concluídas", encerradas: "Encerradas", pausadas: "Pausadas", limitadas: "Limitadas", bloqueadas: "Bloqueadas" };
                return statuses.length > 0 ? (
                  <div className="grid grid-cols-[1fr_auto] gap-x-3 gap-y-1 text-xs">
                    {statuses.map(([k, v]) => (
                      <Fragment key={k}>
                        <span className={`text-muted-foreground text-right ${k === "limitadas" ? "text-amber-500" : ""}`}>{labels[k] || k}</span>
                        <span className={`font-semibold tabular-nums text-right min-w-[2ch] ${k === "limitadas" ? "text-amber-500" : "text-foreground"}`}>{v}</span>
                      </Fragment>
                    ))}
                  </div>
                ) : (
                  <span className="text-xs text-muted-foreground">Sem detalhes</span>
                );
              })()}
            </TooltipContent>
          </TooltipUI>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Volume Operado</CardTitle>
          <BarChart3 className="h-4 w-4 text-blue-500" />
        </CardHeader>
        <CardContent>
          <CurrencyBreakdownTooltip
            breakdown={analyticsSummary.volume_breakdown}
            moedaConsolidacao={analyticsSummary.moeda_consolidacao}
          >
            <div className="text-2xl font-bold truncate">
              {formatCurrency(analyticsSummary.total_volume_consolidated)}
            </div>
          </CurrencyBreakdownTooltip>
          <p className="text-xs text-muted-foreground">Volume apostado em bônus</p>
        </CardContent>
      </Card>

      <Card className={bonusPerformance.total >= 0 ? "border-primary/30 bg-primary/5" : "border-destructive/30 bg-destructive/5"}>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium flex items-center gap-1.5">
            Performance de Bônus
            <TooltipUI>
              <TooltipTrigger asChild>
                <Receipt className="h-3.5 w-3.5 text-muted-foreground cursor-help" />
              </TooltipTrigger>
              <TooltipContent className="max-w-[280px]">
                <div className="text-xs space-y-1">
                  <p><strong>Resultado:</strong> Bônus creditados + Juice</p>
                  <p><strong>Eficiência:</strong> % do bônus convertido</p>
                  <p className="text-muted-foreground">100% = conversão total | &gt;100% = lucro adicional</p>
                </div>
              </TooltipContent>
            </TooltipUI>
          </CardTitle>
          {bonusPerformance.total >= 0 ? (
            <TrendingUp className="h-4 w-4 text-primary" />
          ) : (
            <TrendingDown className="h-4 w-4 text-destructive" />
          )}
        </CardHeader>
        <CardContent>
          <div className="flex items-baseline gap-2">
            <span className={`text-2xl font-bold ${bonusPerformance.total >= 0 ? "text-primary" : "text-destructive"}`}>
              {formatCurrency(bonusPerformance.total)}
            </span>
            <Badge 
              variant="outline"
              className={`text-xs font-semibold ${
                bonusPerformance.performancePercent >= 70 
                  ? "border-emerald-500/50 text-emerald-500 bg-emerald-500/10" 
                  : bonusPerformance.performancePercent >= 60
                    ? "border-warning/50 text-warning bg-warning/10"
                    : "border-destructive/50 text-destructive bg-destructive/10"
              }`}
            >
              {bonusPerformance.performancePercent.toFixed(1)}%
            </Badge>
          </div>
          <div className="flex items-center gap-1 text-xs text-muted-foreground mt-1">
            <span>Bônus: {formatCurrency(bonusPerformance.totalBonusCreditado)}</span>
            <CurrencyBreakdownTooltip
              breakdown={bonusPerformance.bonusPorMoeda}
              moedaConsolidacao={analyticsSummary.moeda_consolidacao}
            />
            <span>| Juice: {formatCurrency(bonusPerformance.totalJuice)}</span>
          </div>
        </CardContent>
      </Card>
    </TooltipProvider>
  );
}
