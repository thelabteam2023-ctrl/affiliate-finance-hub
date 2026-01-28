import { useState, useEffect, useMemo, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { useProjectBonuses, ProjectBonus, bonusQueryKeys } from "@/hooks/useProjectBonuses";
import { useBonusContamination } from "@/hooks/useBonusContamination";
import { useProjetoCurrency } from "@/hooks/useProjetoCurrency";
import { Building2, Coins, TrendingUp, TrendingDown, AlertTriangle, Timer, Receipt } from "lucide-react";
import { SaldoOperavelCard } from "../SaldoOperavelCard";
import { differenceInDays, parseISO, format, subDays, isWithinInterval, startOfDay } from "date-fns";
import { useCrossWindowSync } from "@/hooks/useCrossWindowSync";
import { BonusAnalyticsCard } from "./BonusAnalyticsCard";
import { BonusContaminationAlert } from "./BonusContaminationAlert";
import { Tooltip as TooltipUI, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { BonusResultadoLiquidoChart } from "./BonusResultadoLiquidoChart";

interface DateRangeResult {
  start: Date;
  end: Date;
}

interface BonusVisaoGeralTabProps {
  projetoId: string;
  dateRange?: DateRangeResult | null;
  isSingleDayPeriod?: boolean;
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

export function BonusVisaoGeralTab({ projetoId, dateRange, isSingleDayPeriod = false }: BonusVisaoGeralTabProps) {
  const queryClient = useQueryClient();
  const { bonuses, getSummary, getBookmakersWithActiveBonus } = useProjectBonuses({ projectId: projetoId });
  const { formatCurrency, convertToConsolidation } = useProjetoCurrency(projetoId);
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
    staleTime: 1000 * 30,
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
      .reduce((acc, b) => acc + convertToConsolidation(b.saldo_atual || 0, b.currency), 0);
  }, [bonuses, convertToConsolidation]);

  // Performance de Bônus = Total de bônus creditados + Juice das operações
  // CRÍTICO: Converter TODOS os valores para moeda de consolidação do projeto
  const bonusPerformance = useMemo(() => {
    // Total de bônus creditados (histórico) - já convertidos
    const totalBonusCreditado = bonuses
      .filter(b => b.status === "credited" || b.status === "finalized")
      .reduce((acc, b) => acc + convertToConsolidation(b.bonus_amount || 0, b.currency), 0);
    
    // Total de juice (P&L das apostas com bônus)
    // CORREÇÃO: Aplicar conversão de moeda para cada aposta individual
    const totalJuice = bonusBetsData.reduce((acc, bet) => {
      const isBonusBet = bet.bonus_id || bet.estrategia === "EXTRACAO_BONUS";
      if (!isBonusBet) return acc;
      
      // Priorizar pl_consolidado se disponível (já está na moeda do projeto)
      if (bet.pl_consolidado != null) {
        return acc + bet.pl_consolidado;
      }
      
      // Se não tiver pl_consolidado, converter lucro_prejuizo da moeda de operação
      const moedaOperacao = bet.moeda_operacao || "BRL";
      const lucroPrejuizo = bet.lucro_prejuizo ?? 0;
      const valorConvertido = convertToConsolidation(lucroPrejuizo, moedaOperacao);
      
      return acc + valorConvertido;
    }, 0);
    
    const total = totalBonusCreditado + totalJuice;
    
    // Performance % = (Resultado Líquido / Total Bônus) * 100
    // 100% = bônus totalmente convertido sem perda
    // >100% = bônus convertido com ganho adicional
    // <100% = parte do bônus foi consumida pelo juice
    const performancePercent = totalBonusCreditado > 0 
      ? ((total / totalBonusCreditado) * 100) 
      : 0;
    
    return { totalBonusCreditado, totalJuice, total, performancePercent };
  }, [bonuses, bonusBetsData, convertToConsolidation]);

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
            <CardTitle className="text-sm font-medium">Casas com Bônus</CardTitle>
            <Building2 className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{summary.bookmakers_with_active_bonus}</div>
            <p className="text-xs text-muted-foreground">Em modo bônus ativo</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Bônus Ativo</CardTitle>
            <Coins className="h-4 w-4 text-warning" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatCurrency(activeBonusTotalConsolidated)}</div>
            <p className="text-xs text-muted-foreground">{summary.count_credited} bônus creditados</p>
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
              <p className="text-xs text-muted-foreground mt-1">
                Bônus: {formatCurrency(bonusPerformance.totalBonusCreditado)} | Juice: {formatCurrency(bonusPerformance.totalJuice)}
              </p>
            </CardContent>
          </Card>
        </TooltipProvider>
      </div>

      {/* Gráfico de Resultado Líquido de Bônus (substituindo "Evolução do Lucro") */}
      <BonusResultadoLiquidoChart
        bonuses={bonuses}
        bonusBets={bonusBetsData}
        formatCurrency={formatCurrency}
        convertToConsolidation={convertToConsolidation}
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
