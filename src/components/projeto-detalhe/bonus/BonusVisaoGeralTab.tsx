import { useState, useEffect, useMemo, useCallback, Fragment } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { KpiSummaryBar } from "@/components/ui/kpi-summary-bar";
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
  actionsSlot?: React.ReactNode;
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

export function BonusVisaoGeralTab({ projetoId, dateRange, isSingleDayPeriod = false, periodFilter, actionsSlot }: BonusVisaoGeralTabProps) {
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
  // expiring15Days removed - now using KPI with countdown

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

  // Fetch perdas por cancelamento de bônus (cash_ledger com ajuste_motivo = BONUS_CANCELAMENTO)
  const { data: perdasCancelamento = [] } = useQuery({
    queryKey: ["bonus-perdas-cancelamento", projetoId],
    queryFn: async () => {
      const { data: bookmakers } = await supabase
        .from("bookmakers")
        .select("id, moeda")
        .eq("projeto_id", projetoId);

      if (!bookmakers || bookmakers.length === 0) return [];

      const bookmakerIds = bookmakers.map(b => b.id);
      const moedaMap = new Map(bookmakers.map(b => [b.id, b.moeda || "BRL"]));

      const { data, error } = await supabase
        .from("cash_ledger")
        .select("id, valor, moeda, origem_bookmaker_id, data_transacao, auditoria_metadata")
        .eq("ajuste_motivo", "BONUS_CANCELAMENTO")
        .eq("ajuste_direcao", "NEGATIVO")
        .in("origem_bookmaker_id", bookmakerIds);

      if (error) throw error;

      return (data || []).map(entry => ({
        valor: -(Number(entry.valor) || 0), // Negativo pois é perda
        moeda: entry.moeda || moedaMap.get(entry.origem_bookmaker_id || "") || "BRL",
        bookmaker_id: entry.origem_bookmaker_id || "",
        data_operacional: entry.data_transacao,
      }));
    },
    enabled: !!projetoId,
    staleTime: PERIOD_STALE_TIME,
    gcTime: PERIOD_GC_TIME,
  });

  // Performance de Bônus = Total de bônus creditados + Juice das operações + Ajustes Pós-Limitação - Perdas Cancelamento
  // CRÍTICO: Converter TODOS os valores para moeda de consolidação do projeto
  const bonusPerformance = useMemo(() => {
    // Filtrar bônus por período (usar credited_at como data de competência)
    let eligibleBonuses = bonuses.filter(b => b.status === "credited" || b.status === "finalized");
    
    if (dateRange?.start || dateRange?.end) {
      eligibleBonuses = eligibleBonuses.filter(b => {
        const creditDate = b.credited_at ? new Date(b.credited_at) : null;
        if (!creditDate) return true; // Sem data, incluir por segurança
        if (dateRange.start && creditDate < startOfDay(dateRange.start)) return false;
        if (dateRange.end && creditDate > dateRange.end) return false;
        return true;
      });
    }
    
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

    // Somar ajustes pós-limitação ao juice - FILTRAR POR PERÍODO
    let filteredAjustes = ajustesPostLimitacao;
    if (dateRange?.start || dateRange?.end) {
      filteredAjustes = ajustesPostLimitacao.filter(a => {
        const ajusteDate = new Date(a.data_operacional);
        if (dateRange.start && ajusteDate < startOfDay(dateRange.start)) return false;
        if (dateRange.end && ajusteDate > dateRange.end) return false;
        return true;
      });
    }
    
    const juiceAjustes = filteredAjustes.reduce((acc, a) => {
      return acc + convertToConsolidationOficial(a.valor, a.moeda);
    }, 0);

    const totalJuice = juiceBets + juiceAjustes;

    // Somar perdas por cancelamento de bônus - FILTRAR POR PERÍODO
    let filteredPerdas = perdasCancelamento;
    if (dateRange?.start || dateRange?.end) {
      filteredPerdas = perdasCancelamento.filter(p => {
        const perdaDate = new Date(p.data_operacional);
        if (dateRange.start && perdaDate < startOfDay(dateRange.start)) return false;
        if (dateRange.end && perdaDate > dateRange.end) return false;
        return true;
      });
    }
    const totalPerdasCancelamento = filteredPerdas.reduce((acc, p) => {
      return acc + convertToConsolidationOficial(p.valor, p.moeda);
    }, 0);
    
    const total = totalBonusCreditado + totalJuice + totalPerdasCancelamento;
    
    const performancePercent = totalBonusCreditado > 0 
      ? ((total / totalBonusCreditado) * 100) 
      : 0;
    
    return { totalBonusCreditado, totalJuice, totalPerdasCancelamento, total, performancePercent, bonusPorMoeda };
  }, [bonuses, bonusBetsData, ajustesPostLimitacao, perdasCancelamento, convertToConsolidationOficial, dateRange]);

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

      {/* KPIs - Faixa compacta */}
      <TooltipProvider>
      <KpiSummaryBar
        actions={actionsSlot}
        leading={<SaldoOperavelCard projetoId={projetoId} variant="compact" />}
        items={[
          {
            label: "Histórico de Casas",
            value: (
              <div className="flex flex-col items-center w-full">
                <span>{analyticsSummary.total_bookmakers}</span>
              </div>
            ),
            tooltip: (
              <div className="space-y-1.5">
                <p className="font-semibold text-foreground">Histórico de Casas</p>
                <p className="text-muted-foreground text-xs">Bookmakers com bônus operados neste projeto.</p>
                <div className="space-y-0.5">
                  <div className="flex justify-between gap-4">
                    <span className="flex items-center gap-1.5"><span className="inline-block w-1.5 h-1.5 rounded-full bg-emerald-500" /> Ativas</span>
                    <span className="font-semibold text-foreground">{analyticsSummary.status_breakdown.ativas}</span>
                  </div>
                  <div className="flex justify-between gap-4">
                    <span className="flex items-center gap-1.5"><span className="inline-block w-1.5 h-1.5 rounded-full bg-blue-500" /> Concluídas</span>
                    <span className="font-semibold text-foreground">{analyticsSummary.status_breakdown.concluidas}</span>
                  </div>
                  <div className="flex justify-between gap-4">
                    <span className="flex items-center gap-1.5"><span className="inline-block w-1.5 h-1.5 rounded-full bg-amber-500" /> Limitadas</span>
                    <span className="font-semibold text-foreground">{analyticsSummary.status_breakdown.limitadas}</span>
                  </div>
                  <div className="flex justify-between gap-4">
                    <span className="flex items-center gap-1.5"><span className="inline-block w-1.5 h-1.5 rounded-full bg-red-500" /> Bloqueadas</span>
                    <span className="font-semibold text-foreground">{analyticsSummary.status_breakdown.bloqueadas}</span>
                  </div>
                  <div className="flex justify-between gap-4">
                    <span className="flex items-center gap-1.5"><span className="inline-block w-1.5 h-1.5 rounded-full bg-muted-foreground" /> Encerradas</span>
                    <span className="font-semibold text-foreground">{analyticsSummary.status_breakdown.encerradas}</span>
                  </div>
                </div>
                <div className="border-t border-border/50 pt-1 space-y-0.5">
                  <p className="font-semibold text-foreground text-xs">Bônus</p>
                  <div className="flex justify-between gap-4">
                    <span>Total recebidos</span>
                    <span className="font-semibold text-foreground">{analyticsSummary.total_bonus_count}</span>
                  </div>
                  <div className="flex justify-between gap-4">
                    <span>Em andamento</span>
                    <span className="font-semibold text-foreground">{summary.count_credited}</span>
                  </div>
                  <div className="flex justify-between gap-4">
                    <span>Finalizados</span>
                    <span className="font-semibold text-foreground">{summary.count_finalized}</span>
                  </div>
                  <div className="flex justify-between gap-4">
                    <span>Pendentes</span>
                    <span className="font-semibold text-foreground">{summary.count_pending}</span>
                  </div>
                </div>
              </div>
            ),
            subtitle: <span className="text-muted-foreground">{analyticsSummary.total_bookmakers === 1 ? "casa já operada" : "casas já operadas"}</span>,
          },
          {
            label: "Volume Operado",
            value: (
              <CurrencyBreakdownTooltip
                breakdown={analyticsSummary.volume_breakdown}
                moedaConsolidacao={analyticsSummary.moeda_consolidacao}
              >
                <span className="truncate">
                  {formatCurrency(analyticsSummary.volume_breakdown.reduce((acc, item) => 
                    acc + convertToConsolidationOficial(item.valor, item.moeda), 0
                  ))}
                </span>
              </CurrencyBreakdownTooltip>
            ),
            minWidth: "min-w-[80px]",
          },
          {
            label: "Performance de Bônus",
            tooltip: (
              <div className="space-y-1.5">
                <p className="font-semibold text-foreground">Performance de Bônus</p>
                <p className="text-muted-foreground text-xs">Bônus creditado + juice + ajustes - perdas por cancelamento.</p>
                <div className="space-y-0.5">
                  <div className="flex justify-between gap-4">
                    <span className="flex items-center gap-1.5"><span className="inline-block w-1.5 h-1.5 rounded-full bg-emerald-500" /> Bônus Creditado</span>
                    <span className="font-semibold text-foreground">{formatCurrency(bonusPerformance.totalBonusCreditado)}</span>
                  </div>
                  <div className="flex justify-between gap-4">
                    <span className="flex items-center gap-1.5"><span className="inline-block w-1.5 h-1.5 rounded-full bg-red-500" /> Juice</span>
                    <span className="font-semibold text-foreground">{formatCurrency(bonusPerformance.totalJuice)}</span>
                  </div>
                  {bonusPerformance.totalPerdasCancelamento !== 0 && (
                    <div className="flex justify-between gap-4">
                      <span className="flex items-center gap-1.5"><span className="inline-block w-1.5 h-1.5 rounded-full bg-orange-500" /> Perdas (Cancelamento)</span>
                      <span className="font-semibold text-red-500">{formatCurrency(bonusPerformance.totalPerdasCancelamento)}</span>
                    </div>
                  )}
                </div>
                <div className="border-t border-border/50 pt-1 flex justify-between gap-4">
                  <span className="font-semibold">Extração</span>
                  <span className="font-semibold text-foreground">{bonusPerformance.performancePercent.toFixed(1)}%</span>
                </div>
              </div>
            ),
            value: (
              <div className="flex items-baseline gap-2">
                <span className={bonusPerformance.total >= 0 ? "text-emerald-500" : "text-red-500"}>
                  {formatCurrency(bonusPerformance.total)}
                </span>
                <Badge 
                  variant="outline"
                  className={`text-[10px] font-semibold ${
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
            ),
            minWidth: "min-w-[120px]",
          },
          (() => {
            const totalBonuses = bonuses.length;
            const rolloverCompleted = bonuses.filter(b => b.status === 'finalized' && b.finalize_reason === 'rollover_completed').length;
            const cycleCompleted = bonuses.filter(b => b.status === 'finalized' && (['cycle_completed', 'early_withdrawal', 'extracted_early'] as string[]).includes(b.finalize_reason || '')).length;
            const expired = bonuses.filter(b => b.status === 'expired' || (b.status === 'finalized' && b.finalize_reason === 'expired')).length;
            const cancelledReversed = bonuses.filter(b => b.status === 'reversed' || b.status === 'failed' || (b.status === 'finalized' && (['cancelled_reversed', 'bonus_consumed'] as string[]).includes(b.finalize_reason || ''))).length;
            const rolloverRate = totalBonuses > 0 ? (rolloverCompleted / totalBonuses) * 100 : 0;
            return {
              label: "Rollover Concluído",
              value: (
                <span className={rolloverRate >= 30 ? "text-emerald-500" : rolloverRate >= 15 ? "text-amber-500" : "text-muted-foreground"}>
                  {rolloverRate.toFixed(0)}%
                </span>
              ),
              tooltip: (
                <div className="space-y-1.5">
                  <p className="font-semibold text-foreground">Taxa de Rollover Concluído</p>
                  <p className="text-muted-foreground text-xs">De {totalBonuses} bônus, {rolloverCompleted} cumpriram o rollover completo.</p>
                  <div className="space-y-0.5">
                    <div className="flex justify-between gap-4">
                      <span className="flex items-center gap-1.5"><span className="inline-block w-1.5 h-1.5 rounded-full bg-emerald-500" /> Rollover concluído (saque liberado)</span>
                      <span className="font-semibold text-foreground">{rolloverCompleted}</span>
                    </div>
                    <div className="flex justify-between gap-4">
                      <span className="flex items-center gap-1.5"><span className="inline-block w-1.5 h-1.5 rounded-full bg-blue-500" /> Encerrado antes do rollover</span>
                      <span className="font-semibold text-foreground">{cycleCompleted}</span>
                    </div>
                    <div className="flex justify-between gap-4">
                      <span className="flex items-center gap-1.5"><span className="inline-block w-1.5 h-1.5 rounded-full bg-amber-500" /> Expirou sem concluir</span>
                      <span className="font-semibold text-foreground">{expired}</span>
                    </div>
                    <div className="flex justify-between gap-4">
                      <span className="flex items-center gap-1.5"><span className="inline-block w-1.5 h-1.5 rounded-full bg-red-500" /> Cancelado / Revertido</span>
                      <span className="font-semibold text-foreground">{cancelledReversed}</span>
                    </div>
                  </div>
                  <div className="border-t border-border/50 pt-1 space-y-0.5">
                    <div className="flex justify-between gap-4">
                      <span>Em andamento</span>
                      <span className="font-semibold text-foreground">{summary.count_credited}</span>
                    </div>
                    <div className="flex justify-between gap-4">
                      <span>Pendentes</span>
                      <span className="font-semibold text-foreground">{summary.count_pending}</span>
                    </div>
                  </div>
                  <div className="border-t border-border/50 pt-1 flex justify-between gap-4">
                    <span className="font-semibold">Total de bônus</span>
                    <span className="font-semibold text-foreground">{totalBonuses}</span>
                  </div>
                </div>
              ),
              subtitle: <span className="text-muted-foreground">{rolloverCompleted} de {totalBonuses}</span>,
              minWidth: "min-w-[110px]",
            };
          })(),
          ...(expiring7Days.length > 0 ? [{
            label: "Expirando",
            value: (
              <div className="flex flex-col items-center w-full">
                <span className="text-amber-500">{expiring7Days.length}</span>
              </div>
            ),
            tooltip: (
              <div className="space-y-1.5">
                <p className="font-semibold text-foreground">Bônus Expirando em 7 dias</p>
                <p className="text-muted-foreground text-xs">Contagem regressiva dos bônus próximos do vencimento.</p>
                <div className="space-y-1">
                  {expiring7Days
                    .sort((a, b) => {
                      const dA = a.expires_at ? differenceInDays(parseISO(a.expires_at), new Date()) : 999;
                      const dB = b.expires_at ? differenceInDays(parseISO(b.expires_at), new Date()) : 999;
                      return dA - dB;
                    })
                    .map(bonus => {
                      const daysLeft = bonus.expires_at ? differenceInDays(parseISO(bonus.expires_at), new Date()) : 0;
                      // Show only first and last name
                      const shortName = bonus.parceiro_nome ? (() => {
                        const parts = bonus.parceiro_nome.trim().split(/\s+/);
                        return parts.length > 1 ? `${parts[0]} ${parts[parts.length - 1]}` : parts[0];
                      })() : null;
                      return (
                        <div key={bonus.id} className="flex justify-between gap-4 items-center">
                          <span className="flex items-center gap-1.5 truncate text-xs">
                            <span className={`inline-block w-1.5 h-1.5 rounded-full ${daysLeft <= 1 ? 'bg-red-500' : daysLeft <= 3 ? 'bg-amber-500' : 'bg-yellow-500'}`} />
                            {bonus.bookmaker_nome}
                            {shortName && <span className="text-[10px] text-muted-foreground font-normal">({shortName})</span>}
                          </span>
                          <span className={`font-semibold whitespace-nowrap ${daysLeft <= 1 ? 'text-red-500' : 'text-amber-500'}`}>
                            {daysLeft === 0 ? 'HOJE' : daysLeft === 1 ? '1 dia' : `${daysLeft} dias`}
                          </span>
                        </div>
                      );
                    })
                  }
                </div>
              </div>
            ),
            subtitle: <span className="text-muted-foreground">bônus em risco</span>,
            minWidth: "min-w-[80px]",
            valueClassName: "text-amber-500",
          }] : []),
        ]}
      />
      </TooltipProvider>

      {/* Filtro de período - abaixo dos KPIs */}
      {periodFilter}

      {/* Gráfico de Resultado Líquido de Bônus (substituindo "Evolução do Lucro") */}
      <BonusResultadoLiquidoChart
        bonuses={bonuses}
        bonusBets={bonusBetsData}
        ajustesPostLimitacao={[...ajustesPostLimitacao, ...perdasCancelamento]}
        formatCurrency={formatCurrency}
        convertToConsolidation={convertToConsolidationOficial}
        isSingleDayPeriod={isSingleDayPeriod}
        dateRange={dateRange}
      />

      {/* Central de Análise de Bônus - Card Analítico Unificado */}
      <BonusAnalyticsCard bonuses={bonuses} dateRange={dateRange} />
    </div>
  );
}
