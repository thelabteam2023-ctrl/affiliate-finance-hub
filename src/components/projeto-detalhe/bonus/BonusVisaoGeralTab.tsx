import { useState, useEffect, useMemo, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { useProjectBonuses, ProjectBonus, bonusQueryKeys } from "@/hooks/useProjectBonuses";
import { useBonusContamination } from "@/hooks/useBonusContamination";
import { useProjetoCurrency } from "@/hooks/useProjetoCurrency";
import { useProjectBonusAnalytics } from "@/hooks/useProjectBonusAnalytics";
import { Building2, Coins, TrendingUp, TrendingDown, AlertTriangle, Timer, Receipt, BarChart3, Gift } from "lucide-react";
import { SaldoOperavelCard } from "../SaldoOperavelCard";
import { differenceInDays, parseISO, format, subDays, isWithinInterval, startOfDay } from "date-fns";
import { useCrossWindowSync } from "@/hooks/useCrossWindowSync";
import { BonusAnalyticsCard } from "./BonusAnalyticsCard";
import { BonusContaminationAlert } from "./BonusContaminationAlert";
import { Tooltip as TooltipUI, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { PERIOD_STALE_TIME, PERIOD_GC_TIME } from "@/lib/query-cache-config";
import { BonusResultadoLiquidoChart } from "./BonusResultadoLiquidoChart";
import { CurrencyBreakdownTooltip } from "@/components/ui/currency-breakdown-tooltip";

interface DateRangeResult {
  start: Date;
  end: Date;
}

interface BonusVisaoGeralTabProps {
  projetoId: string;
  dateRange?: DateRangeResult | null;
  isSingleDayPeriod?: boolean;
  periodFilter?: React.ReactNode;
}

interface BookmakerWithBonus {
  id: string;
  nome: string;
  login_username: string;
  logo_url: string | null;
  parceiro_nome: string | null;
  saldo_real: number;
  bonus_ativo: number;
  moeda: string;
}

// Estrutura para dados do gráfico de Resultado Líquido de Bônus
interface BonusResultEntry {
  data: string;
  bonus_creditado: number;
  juice: number; // custo operacional (P&L das apostas com bônus)
}

export function BonusVisaoGeralTab({ projetoId, dateRange, isSingleDayPeriod = false, periodFilter }: BonusVisaoGeralTabProps) {
  const queryClient = useQueryClient();
  const { bonuses, getSummary, getBookmakersWithActiveBonus } = useProjectBonuses({ projectId: projetoId });
  const { formatCurrency, convertToConsolidation, convertToConsolidationOficial } = useProjetoCurrency(projetoId);
  const { summary: analyticsSummary, stats: analyticsStats } = useProjectBonusAnalytics(projetoId);
  const [bookmakersWithBonus, setBookmakersWithBonus] = useState<BookmakerWithBonus[]>([]);
  const [loading, setLoading] = useState(true);

  const summary = getSummary();
  
  // Memoize to prevent infinite loops
  const bookmakersInBonusMode = useMemo(() => getBookmakersWithActiveBonus(), [bonuses]);

  // O hook useSaldoOperavel já calcula tudo corretamente via RPC canônica

  // CRÍTICO: Listener para BroadcastChannel - invalida queries quando apostas são salvas/excluídas
  const handleBetUpdate = useCallback(() => {
    console.log("[BonusVisaoGeralTab] Aposta atualizada via BroadcastChannel, invalidando queries...");
    // Invalidar query de apostas de bônus (gráfico de juice)
    queryClient.invalidateQueries({ queryKey: ["bonus-bets-juice", projetoId] });
    // Invalidar queries de bônus gerais
    queryClient.invalidateQueries({ queryKey: ["bonus", "project", projetoId] });
    // Invalidar KPIs financeiros
    queryClient.invalidateQueries({ queryKey: ["projeto-resultado", projetoId] });
    queryClient.invalidateQueries({ queryKey: ["bookmaker-saldos"] });
  }, [queryClient, projetoId]);

  // Hook centralizado para sincronização cross-window
  useCrossWindowSync({
    projetoId,
    onSync: handleBetUpdate,
  });

  // Check for cross-strategy contamination
  const { isContaminated, contaminatedBookmakers, totalNonBonusBets, loading: contaminationLoading } = 
    useBonusContamination({ projetoId, bookmakersInBonusMode });

  // Get bonuses expiring soon
  const getExpiringSoon = (days: number): ProjectBonus[] => {
    const now = new Date();
    return bonuses.filter(b => {
      if (b.status !== 'credited' || !b.expires_at) return false;
      const expiresAt = parseISO(b.expires_at);
      const daysUntilExpiry = differenceInDays(expiresAt, now);
      return daysUntilExpiry >= 0 && daysUntilExpiry <= days;
    });
  };

  const expiring7Days = getExpiringSoon(7);
  const expiring15Days = getExpiringSoon(15);

  // Fetch apostas com bônus (juice/custo operacional) - inclui apostas com bonus_id OU estratégia EXTRACAO_BONUS
  // IMPORTANTE: Buscar moeda_operacao para converter corretamente para moeda de consolidação
  const { data: bonusBetsData = [], isLoading: betsLoading } = useQuery({
    queryKey: ["bonus-bets-juice", projetoId, dateRange?.start?.toISOString(), dateRange?.end?.toISOString()],
    queryFn: async () => {
      const startDate = dateRange?.start?.toISOString() || subDays(new Date(), 365).toISOString();
      
      // Query para apostas vinculadas a bônus (via bonus_id)
      // CRÍTICO: Incluir moeda_operacao para conversão multi-moeda
      let queryBonusId = supabase
        .from("apostas_unificada")
        .select("id, data_aposta, lucro_prejuizo, pl_consolidado, moeda_operacao, bookmaker_id, bonus_id, stake_bonus, estrategia")
        .eq("projeto_id", projetoId)
        .gte("data_aposta", startDate.split('T')[0])
        .not("bonus_id", "is", null);

      // Query para apostas de estratégia EXTRACAO_BONUS (mesmo sem bonus_id)
      let queryEstrategia = supabase
        .from("apostas_unificada")
        .select("id, data_aposta, lucro_prejuizo, pl_consolidado, moeda_operacao, bookmaker_id, bonus_id, stake_bonus, estrategia")
        .eq("projeto_id", projetoId)
        .gte("data_aposta", startDate.split('T')[0])
        .eq("estrategia", "EXTRACAO_BONUS");

      if (dateRange?.end) {
        queryBonusId = queryBonusId.lte("data_aposta", dateRange.end.toISOString());
        queryEstrategia = queryEstrategia.lte("data_aposta", dateRange.end.toISOString());
      }

      const [resBonusId, resEstrategia] = await Promise.all([queryBonusId, queryEstrategia]);
      
      if (resBonusId.error) throw resBonusId.error;
      if (resEstrategia.error) throw resEstrategia.error;

      // Combina resultados removendo duplicados por id
      const allBets = [...(resBonusId.data || []), ...(resEstrategia.data || [])];
      const uniqueBets = Array.from(new Map(allBets.map(b => [b.id, b])).values());
      
      return uniqueBets;
    },
    enabled: !!projetoId,
    staleTime: PERIOD_STALE_TIME,
    gcTime: PERIOD_GC_TIME,
  });

  // Note: Removed cash_ledger fetch - now using deposit_amount from bonus records
  // This ensures the chart shows only capital tied to bonus campaigns, not global bookmaker deposits

  useEffect(() => {
    fetchBookmakersWithBonus();
  }, [projetoId, bonuses]);

  const fetchBookmakersWithBonus = async () => {
    if (bookmakersInBonusMode.length === 0) {
      setBookmakersWithBonus([]);
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      const { data, error } = await supabase
        .from("bookmakers")
        .select(`
          id,
          nome,
          login_username,
          saldo_atual,
          saldo_usd,
          moeda,
          bookmakers_catalogo!bookmakers_bookmaker_catalogo_id_fkey (logo_url),
          parceiros!bookmakers_parceiro_id_fkey (nome)
        `)
        .in("id", bookmakersInBonusMode);

      if (error) throw error;

      // Calculate active bonus total per bookmaker (saldo_atual, não o valor inicial)
      const bonusByBookmaker: Record<string, number> = {};
      bonuses.forEach((b) => {
        if (b.status === "credited" && (b.saldo_atual || 0) > 0) {
          bonusByBookmaker[b.bookmaker_id] = (bonusByBookmaker[b.bookmaker_id] || 0) + (b.saldo_atual || 0);
        }
      });

      const mapped: BookmakerWithBonus[] = (data || []).map((bk: any) => {
        const moeda = bk.moeda || "BRL";
        const isUsdCurrency = moeda === "USD" || moeda === "USDT";
        const saldoReal = isUsdCurrency
          ? Number(bk.saldo_usd ?? bk.saldo_atual ?? 0)
          : Number(bk.saldo_atual ?? 0);

        return {
          id: bk.id,
          nome: bk.nome,
          login_username: bk.login_username,
          logo_url: bk.bookmakers_catalogo?.logo_url || null,
          parceiro_nome: bk.parceiros?.nome || null,
          saldo_real: saldoReal,
          bonus_ativo: bonusByBookmaker[bk.id] || 0,
          moeda,
        };
      });

      // Sort by bonus amount descending
      mapped.sort((a, b) => b.bonus_ativo - a.bonus_ativo);
      
      setBookmakersWithBonus(mapped);
    } catch (error) {
      console.error("Error fetching bookmakers:", error);
    } finally {
      setLoading(false);
    }
  };

  // Helper to format bonus in its original currency (for expiring alerts)
  const formatBonusOriginalCurrency = (value: number, moeda: string = 'BRL') => {
    const symbols: Record<string, string> = { BRL: 'R$', USD: '$', EUR: '€', GBP: '£' };
    return `${symbols[moeda] || moeda} ${value.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  };

  // Totais (sempre na moeda de consolidação do projeto)
  const activeBonusTotalConsolidated = useMemo(() => {
    return bonuses
      .filter((b) => b.status === "credited" && (b.saldo_atual || 0) > 0)
      .reduce((acc, b) => acc + convertToConsolidationOficial(b.saldo_atual || 0, b.currency), 0);
  }, [bonuses, convertToConsolidationOficial]);

  // Fetch ajustes pós-limitação (financial_events com AJUSTE_POS_LIMITACAO)
  const { data: ajustesPostLimitacao = [] } = useQuery({
    queryKey: ["bonus-ajustes-pos-limitacao", projetoId],
    queryFn: async () => {
      const { data: bookmakers } = await supabase
        .from("bookmakers")
        .select("id, moeda")
        .eq("projeto_id", projetoId);

      if (!bookmakers || bookmakers.length === 0) return [];

      const bookmakerIds = bookmakers.map(b => b.id);
      const moedaMap = new Map(bookmakers.map(b => [b.id, b.moeda || "BRL"]));

      const { data, error } = await supabase
        .from("financial_events")
        .select("id, valor, bookmaker_id, moeda, metadata, created_at")
        .in("bookmaker_id", bookmakerIds)
        .eq("tipo_evento", "AJUSTE")
        .not("metadata", "is", null);

      if (error) throw error;

      return (data || []).filter(evt => {
        try {
          const meta = typeof evt.metadata === "string" ? JSON.parse(evt.metadata) : evt.metadata;
          return meta?.tipo_ajuste === "AJUSTE_POS_LIMITACAO";
        } catch { return false; }
      }).map(evt => {
        const meta = typeof evt.metadata === "string" ? JSON.parse(evt.metadata) : evt.metadata;
        // Usar data_encerramento (data operacional real) em vez de created_at (data de registro)
        const dataOperacional = meta?.data_encerramento || evt.created_at;
        return {
          valor: Number(evt.valor) || 0,
          moeda: evt.moeda || moedaMap.get(evt.bookmaker_id) || "BRL",
          bookmaker_id: evt.bookmaker_id,
          data_operacional: dataOperacional,
        };
      });
    },
    enabled: !!projetoId,
    staleTime: PERIOD_STALE_TIME,
    gcTime: PERIOD_GC_TIME,
  });

  // Performance de Bônus = Total de bônus creditados + Juice das operações + Ajustes Pós-Limitação
  // CRÍTICO: Converter TODOS os valores para moeda de consolidação do projeto
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
      const isBonusBet = bet.bonus_id || bet.estrategia === "EXTRACAO_BONUS";
      if (!isBonusBet) return acc;
      
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
      ? ((total / totalBonusCreditado) * 100) 
      : 0;
    
    return { totalBonusCreditado, totalJuice, total, performancePercent, bonusPorMoeda };
  }, [bonuses, bonusBetsData, ajustesPostLimitacao, convertToConsolidationOficial]);

  // NOTA: totalSaldoOperavel agora vem do hook useSaldoOperavel (já declarado no início)

  return (
    <div className="space-y-6">

      {/* Contamination Alert */}
      {!contaminationLoading && isContaminated && (
        <BonusContaminationAlert 
          contaminatedBookmakers={contaminatedBookmakers} 
          totalNonBonusBets={totalNonBonusBets} 
        />
      )}

      {/* KPIs with hierarchy - Saldo Operável is primary */}
      <div className="grid gap-4 md:grid-cols-4">
        <SaldoOperavelCard projetoId={projetoId} />

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Histórico de Casas</CardTitle>
            <Building2 className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{analyticsSummary.total_bookmakers}</div>
            <p className="text-xs text-muted-foreground">
              {analyticsSummary.total_bookmakers === 1 ? "casa já operada" : "casas já operadas"}
            </p>
            {(() => {
              const totalReceived = analyticsStats.reduce((sum, s) => sum + s.total_bonus_count, 0);
              const pending = analyticsStats.reduce((sum, s) => sum + s.bonus_pending_count, 0);
              const inProgress = Math.max(0, analyticsStats.reduce((sum, s) => sum + s.bonus_credited_count - s.bonus_finalized_count, 0));
              const finalized = analyticsStats.reduce((sum, s) => sum + s.bonus_finalized_count, 0);
              const limited = analyticsSummary.status_breakdown.limitadas;
              return (
                <div className="grid grid-cols-3 gap-x-3 gap-y-1 mt-2">
                  <span className="text-xs text-muted-foreground">
                    <Gift className="inline h-3 w-3 mr-0.5" />
                    Recebidos: <span className="font-semibold text-foreground">{totalReceived}</span>
                  </span>
                  <span className="text-xs text-muted-foreground">
                    <Timer className="inline h-3 w-3 mr-0.5" />
                    Pendentes: <span className="font-semibold text-foreground">{pending}</span>
                  </span>
                  {limited > 0 ? (
                    <span className="text-xs text-amber-500">
                      <AlertTriangle className="inline h-3 w-3 mr-0.5" />
                      Limitadas: <span className="font-semibold">{limited}</span>
                    </span>
                  ) : <span />}
                  <span className="text-xs text-muted-foreground">
                    Em andamento: <span className="font-semibold text-foreground">{inProgress}</span>
                  </span>
                  <span className="text-xs text-muted-foreground">
                    Finalizados: <span className="font-semibold text-foreground">{finalized}</span>
                  </span>
                </div>
              );
            })()}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Volume Operado</CardTitle>
            <BarChart3 className="h-4 w-4 text-blue-500" />
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-1.5">
              <div className="text-2xl font-bold truncate">
                {formatCurrency(analyticsSummary.volume_breakdown.reduce((acc, item) => 
                  acc + convertToConsolidationOficial(item.valor, item.moeda), 0
                ))}
              </div>
              <CurrencyBreakdownTooltip
                breakdown={analyticsSummary.volume_breakdown}
                moedaConsolidacao={analyticsSummary.moeda_consolidacao}
              />
            </div>
            <p className="text-xs text-muted-foreground">Volume apostado em bônus</p>
          </CardContent>
        </Card>

        {/* Nova KPI: Performance de Bônus com % */}
        <TooltipProvider>
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
      </div>

      {/* Filtro de período - abaixo dos KPIs */}
      {periodFilter}

      {/* Gráfico de Resultado Líquido de Bônus (substituindo "Evolução do Lucro") */}
      <BonusResultadoLiquidoChart
        bonuses={bonuses}
        bonusBets={bonusBetsData}
        ajustesPostLimitacao={ajustesPostLimitacao}
        formatCurrency={formatCurrency}
        convertToConsolidation={convertToConsolidationOficial}
        isSingleDayPeriod={isSingleDayPeriod}
        dateRange={dateRange}
      />

      {/* Expiring Soon */}
      {expiring7Days.length > 0 && (
        <Card className="border-destructive/30 bg-destructive/5">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2 text-destructive">
              <AlertTriangle className="h-4 w-4" />
              Expirando em 7 dias ({expiring7Days.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-2">
              {expiring7Days.map(bonus => (
                <Badge key={bonus.id} variant="outline" className="border-destructive/30 text-destructive">
                  {bonus.bookmaker_nome} - {formatBonusOriginalCurrency(bonus.bonus_amount, bonus.currency)}
                  {bonus.expires_at && (
                    <span className="ml-1 text-xs">({format(parseISO(bonus.expires_at), 'dd/MM')})</span>
                  )}
                </Badge>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {expiring15Days.length > expiring7Days.length && (
        <Card className="border-warning/30 bg-warning/5">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2 text-warning">
              <Timer className="h-4 w-4" />
              Expirando em 15 dias ({expiring15Days.length - expiring7Days.length} adicionais)
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-2">
              {expiring15Days.filter(b => !expiring7Days.some(e => e.id === b.id)).map(bonus => (
                <Badge key={bonus.id} variant="outline" className="border-warning/30 text-warning">
                  {bonus.bookmaker_nome} - {formatBonusOriginalCurrency(bonus.bonus_amount, bonus.currency)}
                  {bonus.expires_at && (
                    <span className="ml-1 text-xs">({format(parseISO(bonus.expires_at), 'dd/MM')})</span>
                  )}
                </Badge>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Central de Análise de Bônus - Card Analítico Unificado */}
      <BonusAnalyticsCard bonuses={bonuses} dateRange={dateRange} />
    </div>
  );
}
