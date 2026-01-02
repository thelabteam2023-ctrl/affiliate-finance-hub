import { useState, useEffect, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { useProjectBonuses, ProjectBonus } from "@/hooks/useProjectBonuses";
import { useBonusContamination } from "@/hooks/useBonusContamination";
import { useProjetoCurrency } from "@/hooks/useProjetoCurrency";
import { Building2, Coins, TrendingUp, AlertTriangle, Timer, Activity, Info } from "lucide-react";
import { differenceInDays, parseISO, format, startOfDay, eachDayOfInterval, subDays } from "date-fns";
import { ptBR } from "date-fns/locale";
import { XAxis, YAxis, ResponsiveContainer, ReferenceLine, CartesianGrid, Tooltip, ComposedChart, Line, Legend, Area } from "recharts";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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


type Granularidade = "dia" | "semana" | "mes";

export function BonusVisaoGeralTab({ projetoId, dateRange, isSingleDayPeriod = false }: BonusVisaoGeralTabProps) {
  const { bonuses, getSummary, getBookmakersWithActiveBonus } = useProjectBonuses({ projectId: projetoId });
  const { formatCurrency, getSymbol, convertToConsolidation, moedaConsolidacao } = useProjetoCurrency(projetoId);
  const [bookmakersWithBonus, setBookmakersWithBonus] = useState<BookmakerWithBonus[]>([]);
  const [loading, setLoading] = useState(true);
  const [betsData, setBetsData] = useState<any[]>([]);
  const [betsLoading, setBetsLoading] = useState(true);
  const [granularidade, setGranularidade] = useState<Granularidade>("dia");
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


  // Totais (sempre na moeda de consolidação do projeto)
  const activeBonusTotalConsolidated = useMemo(() => {
    return bonuses
      .filter((b) => b.status === "credited" && (b.saldo_atual || 0) > 0)
      .reduce((acc, b) => acc + convertToConsolidation(b.saldo_atual || 0, b.currency), 0);
  }, [bonuses, convertToConsolidation]);


  const totalSaldoOperavel = activeBonusTotalConsolidated;


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
      <div className="grid gap-4 md:grid-cols-3">
        <TooltipProvider>
          <Card className={`border-primary/30 bg-primary/5 ${isContaminated ? 'ring-1 ring-amber-500/30' : ''}`}>
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
              <p className="text-xs text-muted-foreground">Total ativo em modo bônus</p>
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

      {/* Dashboard Chart - Curva de Evolução */}
      {hasData ? (
        <Card className={isContaminated ? 'ring-1 ring-amber-500/30' : ''}>
          <CardHeader className="pb-3">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div className="flex items-center gap-2">
                <Activity className="h-4 w-4 text-primary" />
                <CardTitle className="text-base">Evolução do Saldo em Bônus</CardTitle>
                <TooltipProvider>
                  <TooltipUI>
                    <TooltipTrigger>
                      <Info className="h-3.5 w-3.5 text-muted-foreground" />
                    </TooltipTrigger>
                    <TooltipContent className="max-w-xs">
                      <p className="text-xs">
                        Compara o total de Bônus creditados com o resultado líquido ao longo do tempo.
                        A área sombreada representa o potencial acumulado.
                      </p>
                    </TooltipContent>
                  </TooltipUI>
                </TooltipProvider>
                {isContaminated && (
                  <Badge variant="outline" className="border-amber-500/50 text-amber-500 text-[10px] ml-2">
                    Inclui outras estratégias
                  </Badge>
                )}
              </div>

              {/* Filtro de Granularidade */}
              <Select value={granularidade} onValueChange={(v) => setGranularidade(v as Granularidade)}>
                <SelectTrigger className="w-[110px] h-8 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="dia">Por Dia</SelectItem>
                  <SelectItem value="semana">Por Semana</SelectItem>
                  <SelectItem value="mes">Por Mês</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </CardHeader>

          <CardContent>
            <div className="h-[320px]">
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={dailyData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                  <defs>
                    <linearGradient id="gradientBonus" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#f59e0b" stopOpacity={0.3}/>
                      <stop offset="95%" stopColor="#f59e0b" stopOpacity={0.05}/>
                    </linearGradient>
                    <linearGradient id="gradientSaldo" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#22c55e" stopOpacity={0.4}/>
                      <stop offset="95%" stopColor="#22c55e" stopOpacity={0.1}/>
                    </linearGradient>
                  </defs>
                  
                  <CartesianGrid strokeDasharray="3 3" className="stroke-border/50" />
                  <XAxis 
                    dataKey="dateLabel" 
                    tick={{ fontSize: 10 }} 
                    className="text-muted-foreground"
                    tickLine={false}
                  />
                  <YAxis 
                    tick={{ fontSize: 10 }} 
                    className="text-muted-foreground"
                    tickLine={false}
                    axisLine={false}
                    tickFormatter={(value) => {
                      if (Math.abs(value) >= 1000) return `${(value / 1000).toFixed(0)}k`;
                      return value.toString();
                    }}
                  />
                  <Tooltip 
                    content={({ active, payload, label }) => {
                      if (!active || !payload?.length) return null;
                      const data = payload[0]?.payload as DailyData;
                      if (!data) return null;

                      return (
                        <div className="bg-popover/95 backdrop-blur-sm border rounded-lg shadow-xl p-4 min-w-[240px]">
                          <p className="text-sm font-semibold border-b pb-2 mb-2">{label}</p>
                          
                          <div className="space-y-2">
                            <div className="flex justify-between items-center">
                              <span className="text-xs text-blue-400 flex items-center gap-1">
                                <span className="w-2 h-2 rounded-full bg-blue-400"></span>
                                Depósito
                              </span>
                              <span className="text-sm font-medium">{formatCurrency(data.deposits)}</span>
                            </div>
                            
                            <div className="flex justify-between items-center">
                              <span className="text-xs text-amber-400 flex items-center gap-1">
                                <span className="w-2 h-2 rounded-full bg-amber-400"></span>
                                Bônus
                              </span>
                              <span className="text-sm font-medium">{formatCurrency(data.bonusCredits)}</span>
                            </div>

                            <div className="flex justify-between items-center">
                              <span className="text-xs text-violet-400 flex items-center gap-1">
                                <span className="w-2 h-2 rounded-full bg-violet-400"></span>
                                Juice
                              </span>
                              <span className={`text-sm font-medium ${data.juice >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                                {formatCurrency(data.juice)}
                              </span>
                            </div>

                            <div className="flex justify-between items-center border-t pt-2">
                              <span className="text-xs text-emerald-400 flex items-center gap-1">
                                <span className="w-2 h-2 rounded-full bg-emerald-400"></span>
                                Saldo Acumulado
                              </span>
                              <span className={`text-sm font-bold ${data.adjustedBalance >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                                {formatCurrency(data.adjustedBalance)}
                              </span>
                            </div>
                          </div>
                        </div>
                      );
                    }}
                  />
                  <Legend 
                    wrapperStyle={{ fontSize: '11px' }}
                    iconType="circle"
                  />
                  
                  {/* Área sombreada para Bônus Acumulado */}
                  <Area
                    type="monotone"
                    dataKey="bonusCredits"
                    name="Bônus Creditado"
                    stroke="#f59e0b"
                    strokeWidth={2}
                    fill="url(#gradientBonus)"
                  />

                  {/* Linha para Juice */}
                  <Line
                    type="monotone"
                    dataKey="juice"
                    name="Juice"
                    stroke="#8b5cf6"
                    strokeWidth={2}
                    dot={false}
                    strokeDasharray="4 2"
                  />

                  {/* Linha para Saldo Acumulado */}
                  <Line
                    type="monotone"
                    dataKey="adjustedBalance"
                    name="Saldo Acumulado"
                    stroke="#22c55e"
                    strokeWidth={2.5}
                    dot={false}
                  />

                  <ReferenceLine y={0} stroke="hsl(var(--muted-foreground))" strokeDasharray="3 3" />
                </ComposedChart>
              </ResponsiveContainer>
            </div>

            {/* Legenda explicativa */}
            <div className="mt-4 p-3 rounded-lg bg-muted/30 border">
              <p className="text-xs text-muted-foreground">
                <strong className="text-foreground">Como interpretar:</strong> A área 
                <span className="text-amber-400 font-medium"> laranja </span>
                representa bônus creditados. A linha
                <span className="text-violet-400 font-medium"> roxa </span>
                mostra o juice (P&L das apostas). A linha
                <span className="text-emerald-400 font-medium"> verde </span>
                é o saldo acumulado total.
              </p>
            </div>
          </CardContent>
        </Card>
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
