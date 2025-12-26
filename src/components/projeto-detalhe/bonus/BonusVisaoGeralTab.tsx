import { useState, useEffect, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { supabase } from "@/integrations/supabase/client";
import { useProjectBonuses, ProjectBonus } from "@/hooks/useProjectBonuses";
import { Building2, Coins, Wallet, TrendingUp, AlertTriangle, Timer, Trophy } from "lucide-react";
import { differenceInDays, parseISO, format, startOfDay, startOfWeek, eachDayOfInterval, eachWeekOfInterval, subDays, eachHourOfInterval, startOfHour } from "date-fns";
import { ptBR } from "date-fns/locale";
import {
  ChartContainer,
} from "@/components/ui/chart";
import { BarChart, Bar, AreaChart, Area, XAxis, YAxis, ResponsiveContainer, ReferenceLine, CartesianGrid, Tooltip } from "recharts";

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

interface ExtractedBonusRanking {
  bookmaker_id: string;
  bookmaker_nome: string;
  bookmaker_login: string;
  logo_url: string | null;
  count: number;
  total_extracted: number;
  currency: string;
}

export function BonusVisaoGeralTab({ projetoId, dateRange, isSingleDayPeriod = false }: BonusVisaoGeralTabProps) {
  const { bonuses, getSummary, getBookmakersWithActiveBonus } = useProjectBonuses({ projectId: projetoId });
  const [bookmakersWithBonus, setBookmakersWithBonus] = useState<BookmakerWithBonus[]>([]);
  const [loading, setLoading] = useState(true);
  const [betsData, setBetsData] = useState<any[]>([]);
  const [betsLoading, setBetsLoading] = useState(true);
  const [realDeposits, setRealDeposits] = useState<{ data_transacao: string; valor: number }[]>([]);

  const summary = getSummary();
  
  // Memoize to prevent infinite loops
  const bookmakersInBonusMode = useMemo(() => getBookmakersWithActiveBonus(), [bonuses]);

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
        
        // Fetch bets from bookmakers in bonus mode or marked as bonus bets
        let query = supabase
          .from("apostas_unificada")
          .select("id, data_aposta, stake, lucro_prejuizo, bookmaker_id, is_bonus_bet")
          .eq("projeto_id", projetoId)
          .gte("data_aposta", startDate.split('T')[0])
          .or(`is_bonus_bet.eq.true,bookmaker_id.in.(${bookmakersInBonusMode.join(',')})`)
          .not("lucro_prejuizo", "is", null);

        if (dateRange?.end) {
          query = query.lte("data_aposta", dateRange.end.toISOString());
        }

        const { data, error } = await query;

        if (error) throw error;
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

  // Fetch REAL deposits from cash_ledger (actual financial transactions)
  useEffect(() => {
    const fetchRealDeposits = async () => {
      if (!projetoId || bookmakersInBonusMode.length === 0) {
        setRealDeposits([]);
        return;
      }

      try {
        const startDate = dateRange?.start?.toISOString().split('T')[0] || subDays(new Date(), 30).toISOString().split('T')[0];
        
        // Fetch real deposits to bookmakers in bonus mode from cash_ledger
        let query = supabase
          .from("cash_ledger")
          .select("data_transacao, valor, destino_bookmaker_id")
          .eq("tipo_transacao", "DEPOSITO")
          .eq("status", "confirmado")
          .in("destino_bookmaker_id", bookmakersInBonusMode)
          .gte("data_transacao", startDate);

        if (dateRange?.end) {
          query = query.lte("data_transacao", dateRange.end.toISOString());
        }

        const { data, error } = await query;

        if (error) throw error;
        setRealDeposits(data || []);
      } catch (error) {
        console.error("Error fetching real deposits:", error);
        setRealDeposits([]);
      }
    };

    fetchRealDeposits();
  }, [projetoId, bookmakersInBonusMode, dateRange]);

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
          moeda,
          bookmakers_catalogo!bookmakers_bookmaker_catalogo_id_fkey (logo_url),
          parceiros!bookmakers_parceiro_id_fkey (nome)
        `)
        .in("id", bookmakersInBonusMode);

      if (error) throw error;

      // Calculate bonus total per bookmaker
      const bonusByBookmaker: Record<string, number> = {};
      bonuses.forEach(b => {
        if (b.status === 'credited') {
          bonusByBookmaker[b.bookmaker_id] = (bonusByBookmaker[b.bookmaker_id] || 0) + b.bonus_amount;
        }
      });

      const mapped: BookmakerWithBonus[] = (data || []).map((bk: any) => ({
        id: bk.id,
        nome: bk.nome,
        login_username: bk.login_username,
        logo_url: bk.bookmakers_catalogo?.logo_url || null,
        parceiro_nome: bk.parceiros?.nome || null,
        saldo_real: bk.saldo_atual,
        bonus_ativo: bonusByBookmaker[bk.id] || 0,
        moeda: bk.moeda || 'BRL',
      }));

      // Sort by bonus amount descending
      mapped.sort((a, b) => b.bonus_ativo - a.bonus_ativo);
      
      setBookmakersWithBonus(mapped);
    } catch (error) {
      console.error("Error fetching bookmakers:", error);
    } finally {
      setLoading(false);
    }
  };

  const formatCurrency = (value: number, moeda: string = 'BRL') => {
    const symbols: Record<string, string> = { BRL: 'R$', USD: '$', EUR: '€', GBP: '£' };
    return `${symbols[moeda] || moeda} ${value.toFixed(2)}`;
  };

  // Calculate daily data for charts using REAL deposits from cash_ledger
  const dailyData = useMemo((): DailyData[] => {
    const endDate = dateRange?.end ? startOfDay(dateRange.end) : startOfDay(new Date());
    const startDate = dateRange?.start ? startOfDay(dateRange.start) : subDays(endDate, 30);
    const days = eachDayOfInterval({ start: startDate, end: endDate });

    // Group REAL deposits from cash_ledger by date (not from bonus informative field)
    const depositsByDate: Record<string, number> = {};
    realDeposits.forEach(deposit => {
      const dateKey = deposit.data_transacao.split('T')[0];
      if (!depositsByDate[dateKey]) {
        depositsByDate[dateKey] = 0;
      }
      depositsByDate[dateKey] += deposit.valor || 0;
    });

    // Group bonus credits by date (only bonus_amount, NOT deposit_amount)
    const bonusByDate: Record<string, number> = {};
    bonuses.forEach(b => {
      if (b.status === 'credited' && b.credited_at) {
        const dateKey = format(parseISO(b.credited_at), 'yyyy-MM-dd');
        if (!bonusByDate[dateKey]) {
          bonusByDate[dateKey] = 0;
        }
        // Only add bonus_amount - deposit is tracked separately in cash_ledger
        bonusByDate[dateKey] += b.bonus_amount;
      }
    });

    // Group juice by date
    const juiceByDate: Record<string, number> = {};
    betsData.forEach(bet => {
      const dateKey = bet.data_aposta;
      if (!juiceByDate[dateKey]) {
        juiceByDate[dateKey] = 0;
      }
      juiceByDate[dateKey] += bet.lucro_prejuizo || 0;
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
      
      // Adjusted balance = previous + REAL deposits + bonus credits + juice
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
  }, [bonuses, betsData, realDeposits, dateRange, isSingleDayPeriod]);

  // Calculate weekly data using REAL deposits from cash_ledger
  const weeklyData = useMemo((): WeeklyData[] => {
    const endDate = dateRange?.end || new Date();
    const startDate = dateRange?.start || subDays(endDate, 30);
    const weeks = eachWeekOfInterval({ start: startDate, end: endDate }, { weekStartsOn: 1 });

    return weeks.map(weekStart => {
      const weekEnd = subDays(startOfWeek(subDays(weekStart, -7), { weekStartsOn: 1 }), 1);
      const weekLabel = format(weekStart, 'dd/MM', { locale: ptBR });

      // Sum REAL deposits from cash_ledger for this week
      let deposits = 0;
      realDeposits.forEach(deposit => {
        const depositDate = parseISO(deposit.data_transacao);
        if (depositDate >= weekStart && depositDate <= weekEnd) {
          deposits += deposit.valor || 0;
        }
      });

      // Sum bonus credits for this week (only bonus_amount, not deposit reference)
      let bonusCredits = 0;
      let count = 0;
      bonuses.forEach(b => {
        if (b.status === 'credited' && b.credited_at) {
          const creditedDate = parseISO(b.credited_at);
          if (creditedDate >= weekStart && creditedDate <= weekEnd) {
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
  }, [bonuses, realDeposits, dateRange]);

  // Calculate extracted bonus ranking (finalized bonuses with rollover_completed)
  const extractedBonusRanking = useMemo((): ExtractedBonusRanking[] => {
    const startDate = dateRange?.start || subDays(new Date(), 30);
    const endDate = dateRange?.end || new Date();
    
    // Filter bonuses that are finalized with rollover_completed within the period
    const extractedBonuses = bonuses.filter(b => {
      if (b.status !== 'finalized' || b.finalize_reason !== 'rollover_completed') return false;
      if (!b.finalized_at) return false;
      const finalizedDate = parseISO(b.finalized_at);
      return finalizedDate >= startDate && finalizedDate <= endDate;
    });

    // Group by bookmaker
    const byBookmaker: Record<string, { count: number; total: number; bonus: ProjectBonus }> = {};
    
    extractedBonuses.forEach(b => {
      if (!byBookmaker[b.bookmaker_id]) {
        byBookmaker[b.bookmaker_id] = { count: 0, total: 0, bonus: b };
      }
      byBookmaker[b.bookmaker_id].count++;
      byBookmaker[b.bookmaker_id].total += b.bonus_amount;
    });

    // Convert to array and sort
    const ranking: ExtractedBonusRanking[] = Object.entries(byBookmaker).map(([id, data]) => ({
      bookmaker_id: id,
      bookmaker_nome: data.bonus.bookmaker_nome || 'Casa',
      bookmaker_login: data.bonus.bookmaker_login || '',
      logo_url: data.bonus.bookmaker_logo_url || null,
      count: data.count,
      total_extracted: data.total,
      currency: data.bonus.currency || 'BRL',
    }));

    // Sort by total extracted (desc), then by count (desc)
    ranking.sort((a, b) => {
      if (b.total_extracted !== a.total_extracted) {
        return b.total_extracted - a.total_extracted;
      }
      return b.count - a.count;
    });

    return ranking;
  }, [bonuses, dateRange]);

  // Calculate totals
  const totalSaldoReal = bookmakersWithBonus.reduce((acc, bk) => acc + bk.saldo_real, 0);
  const totalSaldoOperavel = totalSaldoReal + summary.active_bonus_total;

  const chartConfig = {
    deposits: { label: "Depósitos", color: "hsl(var(--chart-2))" },
    bonusCredits: { label: "Bônus", color: "hsl(var(--warning))" },
    juice: { label: "Juice", color: "hsl(var(--primary))" },
    adjustedBalance: { label: "Saldo Ajustado", color: "hsl(var(--primary))" },
  };

  const hasData = dailyData.some(d => d.deposits > 0 || d.bonusCredits > 0 || d.juice !== 0);

  return (
    <div className="space-y-6">

      {/* KPIs with hierarchy - Saldo Operável is primary */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card className="border-primary/30 bg-primary/5 lg:col-span-1">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Saldo Operável</CardTitle>
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
            <div className="text-2xl font-bold">{formatCurrency(summary.active_bonus_total)}</div>
            <p className="text-xs text-muted-foreground">{summary.count_credited} bônus creditados</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Saldo Real (Casas)</CardTitle>
            <Wallet className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatCurrency(totalSaldoReal)}</div>
            <p className="text-xs text-muted-foreground">Apenas casas em modo bônus</p>
          </CardContent>
        </Card>
      </div>

      {/* Dashboard Charts */}
      {hasData ? (
        <div className="grid gap-4 lg:grid-cols-2">
          {/* Chart C - Adjusted Balance (Most Important) */}
          <Card className="lg:col-span-2">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <TrendingUp className="h-4 w-4 text-primary" />
                Saldo Ajustado Acumulado
              </CardTitle>
              <p className="text-xs text-muted-foreground">
                Depósitos Reais (Caixa) + Bônus Creditados + Resultado das Apostas
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
                      tickFormatter={(v) => `R$${v}`}
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
                      tickFormatter={(v) => `R$${v}`}
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
                      tickFormatter={(v) => `R$${v}`}
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
                  {bonus.bookmaker_nome} - {formatCurrency(bonus.bonus_amount, bonus.currency)}
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
                  {bonus.bookmaker_nome} - {formatCurrency(bonus.bonus_amount, bonus.currency)}
                  {bonus.expires_at && (
                    <span className="ml-1 text-xs">({format(parseISO(bonus.expires_at), 'dd/MM')})</span>
                  )}
                </Badge>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Ranking: Extracted Bonuses */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <Trophy className="h-4 w-4 text-primary" />
            Ranking: Casas por Bônus Extraído
          </CardTitle>
          <p className="text-xs text-muted-foreground">
            Bônus finalizados com rollover cumprido no período selecionado
          </p>
        </CardHeader>
        <CardContent>
          {extractedBonusRanking.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <Trophy className="mx-auto h-12 w-12 mb-4 opacity-30" />
              <p>Nenhum bônus extraído no período selecionado</p>
            </div>
          ) : (
            <ScrollArea className="h-[300px]">
              <div className="space-y-3">
                {extractedBonusRanking.map((bk, index) => (
                  <div key={bk.bookmaker_id} className="flex items-center gap-3 p-3 rounded-lg bg-muted/50 border">
                    <div className="flex-shrink-0 w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center text-primary font-bold text-sm">
                      {index + 1}
                    </div>
                    {bk.logo_url ? (
                      <img src={bk.logo_url} alt={bk.bookmaker_nome} className="h-10 w-10 rounded-lg object-contain bg-white p-1" />
                    ) : (
                      <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
                        <Building2 className="h-5 w-5 text-primary" />
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="font-medium truncate">{bk.bookmaker_nome}</p>
                      <p className="text-xs text-muted-foreground truncate">{bk.bookmaker_login}</p>
                    </div>
                    <div className="flex items-center gap-3">
                      <Badge variant="secondary" className="text-xs">
                        QTD: {bk.count}
                      </Badge>
                      <div className="text-right">
                        <p className="font-bold text-primary">{formatCurrency(bk.total_extracted, bk.currency)}</p>
                        <p className="text-xs text-muted-foreground">extraído</p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </ScrollArea>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
