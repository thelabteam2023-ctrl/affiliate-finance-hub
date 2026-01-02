import { useState, useEffect, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { useProjectBonuses, ProjectBonus, bonusQueryKeys } from "@/hooks/useProjectBonuses";
import { useBonusContamination } from "@/hooks/useBonusContamination";
import { useProjetoCurrency } from "@/hooks/useProjetoCurrency";
import { Building2, Coins, TrendingUp, AlertTriangle, Timer } from "lucide-react";
import { VisaoGeralCharts } from "../VisaoGeralCharts";
import { differenceInDays, parseISO, format, subDays } from "date-fns";
import { BonusAnalyticsCard } from "./BonusAnalyticsCard";
import { BonusContaminationAlert } from "./BonusContaminationAlert";
import { Tooltip as TooltipUI, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { useQuery } from "@tanstack/react-query";
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


export function BonusVisaoGeralTab({ projetoId, dateRange, isSingleDayPeriod = false }: BonusVisaoGeralTabProps) {
  const { bonuses, getSummary, getBookmakersWithActiveBonus } = useProjectBonuses({ projectId: projetoId });
  const { formatCurrency, convertToConsolidation } = useProjetoCurrency(projetoId);
  const [bookmakersWithBonus, setBookmakersWithBonus] = useState<BookmakerWithBonus[]>([]);
  const [loading, setLoading] = useState(true);
  // Note: deposit_amount from bonus records is now used as source of truth (not cash_ledger)

  const summary = getSummary();
  
  // Memoize to prevent infinite loops
  const bookmakersInBonusMode = useMemo(() => getBookmakersWithActiveBonus(), [bonuses]);

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

  // Fetch bets data for chart - using React Query for consistency
  const { data: betsData = [], isLoading: betsLoading } = useQuery({
    queryKey: ["bonus-bets", projetoId, bookmakersInBonusMode, dateRange?.start?.toISOString(), dateRange?.end?.toISOString()],
    queryFn: async () => {
      if (bookmakersInBonusMode.length === 0) return [];

      const startDate = dateRange?.start?.toISOString() || subDays(new Date(), 30).toISOString();
      
      let query = supabase
        .from("apostas_unificada")
        .select("id, data_aposta, stake, lucro_prejuizo, pl_consolidado, bookmaker_id, is_bonus_bet, bonus_id")
        .eq("projeto_id", projetoId)
        .gte("data_aposta", startDate.split('T')[0])
        .in("bookmaker_id", bookmakersInBonusMode);

      if (dateRange?.end) {
        query = query.lte("data_aposta", dateRange.end.toISOString());
      }

      const { data, error } = await query;
      if (error) throw error;
      return data || [];
    },
    enabled: !!projetoId && bookmakersInBonusMode.length > 0,
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

  // Saldo Real total das bookmakers em modo bônus (consolidado)
  const totalSaldoRealConsolidated = useMemo(() => {
    return bookmakersWithBonus.reduce((acc, bk) => acc + convertToConsolidation(bk.saldo_real || 0, bk.moeda), 0);
  }, [bookmakersWithBonus, convertToConsolidation]);

  const totalSaldoOperavel = totalSaldoRealConsolidated + activeBonusTotalConsolidated;

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
      <div className="grid gap-4 md:grid-cols-3">
        <TooltipProvider>
          <Card className={`border-primary/30 bg-primary/5 lg:col-span-1 ${isContaminated ? 'ring-1 ring-amber-500/30' : ''}`}>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium flex items-center gap-1.5">
                Saldo Operável
                {isContaminated && (
                  <TooltipUI>
                    <TooltipTrigger asChild>
                      <AlertTriangle className="h-3.5 w-3.5 text-amber-500" />
                    </TooltipTrigger>
                    <TooltipContent className="max-w-[200px]">
                      <p className="text-xs">Este valor pode incluir resultados de outras estratégias além de bônus</p>
                    </TooltipContent>
                  </TooltipUI>
                )}
              </CardTitle>
              <TrendingUp className="h-4 w-4 text-primary" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-primary">{formatCurrency(totalSaldoOperavel)}</div>
              <p className="text-xs text-muted-foreground">Real + Bônus Ativo</p>
            </CardContent>
          </Card>

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

        </TooltipProvider>
      </div>

      {/* Gráfico de Evolução do Lucro - Padrão do Sistema */}
      <VisaoGeralCharts
        apostas={betsData.map(bet => ({
          data_aposta: bet.data_aposta,
          lucro_prejuizo: bet.pl_consolidado ?? bet.lucro_prejuizo ?? 0,
          stake: bet.stake ?? 0,
          stake_total: null,
          bookmaker_nome: undefined,
          bookmaker_id: bet.bookmaker_id,
        }))}
        formatCurrency={formatCurrency}
        accentColor="hsl(var(--warning))"
        title="Evolução do Lucro (Bônus)"
        showCalendar={false}
        showCasasCard={false}
        showEvolucaoChart={true}
        isSingleDayPeriod={isSingleDayPeriod}
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
