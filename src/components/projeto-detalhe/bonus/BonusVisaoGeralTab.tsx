import { useState, useEffect, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { useProjectBonuses, ProjectBonus } from "@/hooks/useProjectBonuses";
import { useBonusContamination } from "@/hooks/useBonusContamination";
import { useProjetoCurrency } from "@/hooks/useProjetoCurrency";
import { Building2, Coins, Wallet, TrendingUp, AlertTriangle, Timer } from "lucide-react";
import { differenceInDays, parseISO, format, startOfDay, startOfWeek, eachDayOfInterval, eachWeekOfInterval, subDays } from "date-fns";
import { ptBR } from "date-fns/locale";
import {
  ChartContainer,
} from "@/components/ui/chart";
import { BarChart, Bar, AreaChart, Area, XAxis, YAxis, ResponsiveContainer, ReferenceLine, CartesianGrid, Tooltip } from "recharts";
import { BonusAnalyticsCard } from "./BonusAnalyticsCard";
import { BonusContaminationAlert } from "./BonusContaminationAlert";
import { Tooltip as TooltipUI, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
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

interface DailyData {
  date: string;
  dateLabel: string;
  xLabel: string;
  deposits: number;
  bonusCredits: number;
  juice: number;
  adjustedBalance: number;
}

interface WeeklyData {
  weekStart: string;
  weekLabel: string;
  deposits: number;
  bonusCredits: number;
  count: number;
}

export function BonusVisaoGeralTab({ projetoId, dateRange, isSingleDayPeriod = false }: BonusVisaoGeralTabProps) {
  const { bonuses, getSummary, getBookmakersWithActiveBonus } = useProjectBonuses({ projectId: projetoId });
  const { formatCurrency, getSymbol, convertToConsolidation, moedaConsolidacao } = useProjetoCurrency(projetoId);
  const [bookmakersWithBonus, setBookmakersWithBonus] = useState<BookmakerWithBonus[]>([]);
  const [loading, setLoading] = useState(true);
  const [betsData, setBetsData] = useState<any[]>([]);
  const [betsLoading, setBetsLoading] = useState(true);
  // Note: deposit_amount from bonus records is now used as source of truth (not cash_ledger)

  const summary = getSummary();
  
  // Memoize to prevent infinite loops
  const bookmakersInBonusMode = useMemo(() => getBookmakersWithActiveBonus(), [bonuses]);

  // Check for cross-strategy contamination
  const { isContaminated, contaminatedBookmakers, totalNonBonusBets, loading: contaminationLoading } = 
    useBonusContamination({ projetoId, bookmakersInBonusMode });
  
  const currencySymbol = getSymbol();

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

  // Fetch bets data for juice calculation
  useEffect(() => {
    const fetchBetsData = async () => {
      if (!projetoId || bookmakersInBonusMode.length === 0) {
        setBetsData([]);
        setBetsLoading(false);
        return;
      }

      try {
        setBetsLoading(true);
        const startDate = dateRange?.start?.toISOString() || subDays(new Date(), 30).toISOString();
        
        // Fetch bets from bookmakers in bonus mode - using .in() filter properly
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
        // Include all bets from bonus-mode bookmakers (settled or pending)
        setBetsData(data || []);
      } catch (error) {
        console.error("Error fetching bets:", error);
        setBetsData([]);
      } finally {
        setBetsLoading(false);
      }
    };

    fetchBetsData();
  }, [projetoId, bookmakersInBonusMode, dateRange]);

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

  // Calculate daily data for charts using deposit_amount from bonus records (not cash_ledger)
  // This shows capital evolution specific to bonus campaigns
  const dailyData = useMemo((): DailyData[] => {
    const endDate = dateRange?.end ? startOfDay(dateRange.end) : startOfDay(new Date());
    const startDate = dateRange?.start ? startOfDay(dateRange.start) : subDays(endDate, 30);
    const days = eachDayOfInterval({ start: startDate, end: endDate });

    // Group reference deposits by date (from bonus deposit_amount, using credited_at as date)
    const depositsByDate: Record<string, number> = {};
    bonuses.forEach(b => {
      if (b.status === 'credited' && b.credited_at && b.deposit_amount) {
        const dateKey = format(parseISO(b.credited_at), 'yyyy-MM-dd');
        if (!depositsByDate[dateKey]) {
          depositsByDate[dateKey] = 0;
        }
        depositsByDate[dateKey] += convertToConsolidation(b.deposit_amount, b.currency);
      }
    });

    // Group bonus credits by date (bonus_amount from credited bonuses)
    const bonusByDate: Record<string, number> = {};
    bonuses.forEach(b => {
      if (b.status === 'credited' && b.credited_at) {
        const dateKey = format(parseISO(b.credited_at), 'yyyy-MM-dd');
        if (!bonusByDate[dateKey]) {
          bonusByDate[dateKey] = 0;
        }
        bonusByDate[dateKey] += convertToConsolidation(b.bonus_amount, b.currency);
      }
    });

    // Group juice (P&L) by date from bets in bonus context
    const juiceByDate: Record<string, number> = {};
    betsData.forEach(bet => {
      // Normalize date format - data_aposta may be full timestamp or date string
      const betDate = bet.data_aposta ? bet.data_aposta.split('T')[0].split(' ')[0] : null;
      if (!betDate) return;
      
      if (!juiceByDate[betDate]) {
        juiceByDate[betDate] = 0;
      }
      juiceByDate[betDate] += (bet.pl_consolidado ?? bet.lucro_prejuizo ?? 0);
    });

    // Calculate cumulative adjusted balance
    let cumulativeBalance = 0;
    let lastDateLabel = "";
    
    return days.map(day => {
      const dateKey = format(day, 'yyyy-MM-dd');
      const dateLabel = format(day, 'dd/MM', { locale: ptBR });
      const horaLabel = format(day, 'HH:mm', { locale: ptBR });
      
      const deposits = depositsByDate[dateKey] || 0;
      const bonusCredits = bonusByDate[dateKey] || 0;
      const juice = juiceByDate[dateKey] || 0;
      
      // Adjusted balance = previous + reference deposit + bonus credits + juice
      cumulativeBalance += deposits + bonusCredits + juice;
      
      // Eixo X: hora para 1 dia, data para períodos maiores (evita repetir)
      let xLabel: string;
      if (isSingleDayPeriod) {
        xLabel = horaLabel;
      } else {
        if (dateLabel !== lastDateLabel) {
          xLabel = dateLabel;
          lastDateLabel = dateLabel;
        } else {
          xLabel = "";
        }
      }
      
      return {
        date: dateKey,
        dateLabel,
        xLabel,
        deposits,
        bonusCredits,
        juice,
        adjustedBalance: cumulativeBalance,
      };
    });
  }, [bonuses, betsData, dateRange, isSingleDayPeriod]);

  // Calculate weekly data using deposit_amount from bonus records (not cash_ledger)
  const weeklyData = useMemo((): WeeklyData[] => {
    const endDate = dateRange?.end || new Date();
    const startDate = dateRange?.start || subDays(endDate, 30);
    const weeks = eachWeekOfInterval({ start: startDate, end: endDate }, { weekStartsOn: 1 });

    return weeks.map(weekStart => {
      const weekEnd = subDays(startOfWeek(subDays(weekStart, -7), { weekStartsOn: 1 }), 1);
      const weekLabel = format(weekStart, 'dd/MM', { locale: ptBR });

      // Sum reference deposits from bonuses for this week
      let deposits = 0;
      let bonusCredits = 0;
      let count = 0;
      
      bonuses.forEach(b => {
        if (b.status === 'credited' && b.credited_at) {
          const creditedDate = parseISO(b.credited_at);
          if (creditedDate >= weekStart && creditedDate <= weekEnd) {
            deposits += b.deposit_amount || 0;
            bonusCredits += b.bonus_amount;
            count++;
          }
        }
      });

      return {
        weekStart: format(weekStart, 'yyyy-MM-dd'),
        weekLabel,
        deposits,
        bonusCredits,
        count,
      };
    });
  }, [bonuses, dateRange]);

  // Totais (sempre na moeda de consolidação do projeto)
  const activeBonusTotalConsolidated = useMemo(() => {
    return bonuses
      .filter((b) => b.status === "credited" && (b.saldo_atual || 0) > 0)
      .reduce((acc, b) => acc + convertToConsolidation(b.saldo_atual || 0, b.currency), 0);
  }, [bonuses, convertToConsolidation]);

  const totalSaldoRealConsolidated = useMemo(() => {
    return bookmakersWithBonus.reduce(
      (acc, bk) => acc + convertToConsolidation(bk.saldo_real || 0, bk.moeda),
      0
    );
  }, [bookmakersWithBonus, convertToConsolidation]);

  const totalSaldoOperavel = totalSaldoRealConsolidated + activeBonusTotalConsolidated;

  const chartConfig = {
    deposits: { label: "Depósitos", color: "hsl(var(--chart-2))" },
    bonusCredits: { label: "Bônus", color: "hsl(var(--warning))" },
    juice: { label: "Juice", color: "hsl(var(--primary))" },
    adjustedBalance: { label: "Saldo Ajustado", color: "hsl(var(--primary))" },
  };

  const hasData = dailyData.some(d => d.deposits > 0 || d.bonusCredits > 0 || d.juice !== 0);

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
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
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

          <Card className={isContaminated ? 'ring-1 ring-amber-500/30' : ''}>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium flex items-center gap-1.5">
                Saldo Real (Casas)
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
              <Wallet className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{formatCurrency(totalSaldoRealConsolidated)}</div>
              <p className="text-xs text-muted-foreground">Apenas casas em modo bônus</p>
            </CardContent>
          </Card>
        </TooltipProvider>
      </div>

      {/* Dashboard Charts */}
      {hasData ? (
        <div className="grid gap-4 lg:grid-cols-2">
          {/* Chart C - Adjusted Balance (Most Important) */}
          <Card className={`lg:col-span-2 ${isContaminated ? 'ring-1 ring-amber-500/30' : ''}`}>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <TrendingUp className="h-4 w-4 text-primary" />
                Saldo Ajustado Acumulado
                {isContaminated && (
                  <Badge variant="outline" className="border-amber-500/50 text-amber-500 text-[10px] ml-2">
                    Inclui outras estratégias
                  </Badge>
                )}
              </CardTitle>
              <p className="text-xs text-muted-foreground">
                Depósito Referência + Bônus Creditado + Resultado das Apostas em Modo Bônus
              </p>
            </CardHeader>
            <CardContent>
              <ChartContainer config={chartConfig} className="h-[250px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={dailyData} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
                    <defs>
                      <linearGradient id="colorAdjustedBalance" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.4}/>
                        <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0}/>
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-muted/30" />
                    <XAxis 
                      dataKey="dateLabel" 
                      tick={{ fontSize: 10 }} 
                      tickLine={false}
                      axisLine={false}
                    />
                    <YAxis 
                      tick={{ fontSize: 10 }} 
                      tickLine={false}
                      axisLine={false}
                      tickFormatter={(v) => `${currencySymbol}${v}`}
                    />
                    <Tooltip 
                      content={({ active, payload, label }) => {
                        if (!active || !payload?.length) return null;
                        const data = payload[0]?.payload as DailyData;
                        return (
                          <div className="bg-card border rounded-lg p-3 shadow-lg">
                            <p className="font-medium mb-2">{label}</p>
                            <div className="space-y-1 text-xs">
                              <p className="text-blue-400">Depósito: {formatCurrency(data.deposits)}</p>
                              <p className="text-warning">Bônus: {formatCurrency(data.bonusCredits)}</p>
                              <p className={data.juice >= 0 ? "text-green-400" : "text-red-400"}>
                                Juice: {formatCurrency(data.juice)}
                              </p>
                              <p className="font-medium text-primary pt-1 border-t border-border">
                                Saldo: {formatCurrency(data.adjustedBalance)}
                              </p>
                            </div>
                          </div>
                        );
                      }}
                    />
                    <ReferenceLine y={0} stroke="hsl(var(--muted-foreground))" strokeDasharray="3 3" />
                    <Area 
                      type="monotone" 
                      dataKey="adjustedBalance" 
                      stroke="hsl(var(--primary))" 
                      strokeWidth={2}
                      fill="url(#colorAdjustedBalance)"
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </ChartContainer>
            </CardContent>
          </Card>

          {/* Chart A - Weekly Deposits */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <Coins className="h-4 w-4 text-blue-400" />
                Depósitos Semanais
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ChartContainer config={chartConfig} className="h-[200px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={weeklyData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-muted/30" />
                    <XAxis 
                      dataKey="weekLabel" 
                      tick={{ fontSize: 10 }} 
                      tickLine={false}
                      axisLine={false}
                    />
                    <YAxis 
                      tick={{ fontSize: 10 }} 
                      tickLine={false}
                      axisLine={false}
                      tickFormatter={(v) => `${currencySymbol}${v}`}
                    />
                    <Tooltip
                      content={({ active, payload, label }) => {
                        if (!active || !payload?.length) return null;
                        const data = payload[0]?.payload as WeeklyData;
                        return (
                          <div className="bg-card border rounded-lg p-3 shadow-lg text-xs">
                            <p className="font-medium mb-2">Semana de {label}</p>
                            <p className="text-blue-400">Depósitos: {formatCurrency(data.deposits)}</p>
                            <p className="text-warning">Bônus: {formatCurrency(data.bonusCredits)}</p>
                            <p className="text-muted-foreground">{data.count} créditos</p>
                          </div>
                        );
                      }}
                    />
                    <Bar dataKey="deposits" fill="hsl(var(--chart-2))" radius={[4, 4, 0, 0]} name="Depósitos" />
                    <Bar dataKey="bonusCredits" fill="hsl(var(--warning))" radius={[4, 4, 0, 0]} name="Bônus" />
                  </BarChart>
                </ResponsiveContainer>
              </ChartContainer>
            </CardContent>
          </Card>

          {/* Chart B - Daily Juice */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <TrendingUp className="h-4 w-4 text-primary" />
                Juice Diário (P&L)
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ChartContainer config={chartConfig} className="h-[200px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={dailyData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-muted/30" />
                    <XAxis 
                      dataKey="xLabel" 
                      tick={{ fontSize: 10 }} 
                      tickLine={false}
                      axisLine={false}
                      interval={isSingleDayPeriod ? 0 : "preserveEnd"}
                    />
                    <YAxis 
                      tick={{ fontSize: 10 }} 
                      tickLine={false}
                      axisLine={false}
                      tickFormatter={(v) => `${currencySymbol}${v}`}
                    />
                    <Tooltip
                      content={({ active, payload, label }) => {
                        if (!active || !payload?.length) return null;
                        const data = payload[0]?.payload as DailyData;
                        return (
                          <div className="bg-card border rounded-lg p-3 shadow-lg text-xs">
                            <p className="font-medium mb-2">{label}</p>
                            <p className={data.juice >= 0 ? "text-green-400" : "text-red-400"}>
                              Juice: {formatCurrency(data.juice)}
                            </p>
                          </div>
                        );
                      }}
                    />
                    <ReferenceLine y={0} stroke="hsl(var(--muted-foreground))" strokeDasharray="3 3" />
                    <Bar 
                      dataKey="juice" 
                      fill="hsl(var(--primary))"
                      radius={[4, 4, 0, 0]}
                    />
                  </BarChart>
                </ResponsiveContainer>
              </ChartContainer>
            </CardContent>
          </Card>
        </div>
      ) : (
        <Card className="border-dashed">
          <CardContent className="py-12 text-center">
            <TrendingUp className="mx-auto h-12 w-12 text-muted-foreground/40 mb-4" />
            <h3 className="font-medium mb-2">Nenhum dado para exibir</h3>
            <p className="text-sm text-muted-foreground">
              Registre bônus e apostas para visualizar o dashboard
            </p>
          </CardContent>
        </Card>
      )}

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
