import { useState, useEffect, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { 
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { 
  TrendingUp, 
  Target, 
  PieChart,
  Building2
} from "lucide-react";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { ModernDonutChart } from "@/components/ui/modern-donut-chart";
import { format, startOfDay, endOfDay, subDays, startOfMonth, startOfYear } from "date-fns";
import { ptBR } from "date-fns/locale";
import { DateRange } from "react-day-picker";

type PeriodFilter = "hoje" | "ontem" | "7dias" | "mes" | "ano" | "todo" | "custom";

interface ProjetoDashboardTabProps {
  projetoId: string;
  periodFilter?: PeriodFilter;
  dateRange?: DateRange;
}

interface Aposta {
  id: string;
  data_aposta: string;
  lucro_prejuizo: number | null;
  resultado: string | null;
  stake: number;
  bookmaker_id: string;
  bookmaker_nome: string;
  parceiro_nome: string | null;
}

interface DailyData {
  data: string;
  dataCompleta: string;
  lucro_dia: number;
  saldo: number;
}

interface BookmakerMetrics {
  bookmaker_id: string;
  bookmaker_nome: string;
  parceiro_nome: string | null;
  totalApostas: number;
  totalStake: number;
  lucro: number;
  greens: number;
  reds: number;
  roi: number;
}

export function ProjetoDashboardTab({ projetoId, periodFilter = "todo", dateRange }: ProjetoDashboardTabProps) {
  const [apostas, setApostas] = useState<Aposta[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedBookmaker, setSelectedBookmaker] = useState<string>("");

  const getDateRangeFromFilter = (): { start: Date | null; end: Date | null } => {
    const today = new Date();
    
    switch (periodFilter) {
      case "hoje":
        return { start: startOfDay(today), end: endOfDay(today) };
      case "ontem":
        const yesterday = subDays(today, 1);
        return { start: startOfDay(yesterday), end: endOfDay(yesterday) };
      case "7dias":
        return { start: startOfDay(subDays(today, 7)), end: endOfDay(today) };
      case "mes":
        return { start: startOfMonth(today), end: endOfDay(today) };
      case "ano":
        return { start: startOfYear(today), end: endOfDay(today) };
      case "custom":
        return { 
          start: dateRange?.from || null, 
          end: dateRange?.to || dateRange?.from || null 
        };
      case "todo":
      default:
        return { start: null, end: null };
    }
  };

  useEffect(() => {
    fetchApostas();
  }, [projetoId, periodFilter, dateRange]);

  const fetchApostas = async () => {
    try {
      setLoading(true);
      const { start, end } = getDateRangeFromFilter();
      
      let query = supabase
        .from("apostas")
        .select(`
          id, 
          data_aposta, 
          lucro_prejuizo, 
          resultado, 
          stake,
          bookmaker_id,
          bookmakers!inner(nome, parceiro_id, parceiros(nome))
        `)
        .eq("projeto_id", projetoId)
        .order("data_aposta", { ascending: true });

      if (start) {
        query = query.gte("data_aposta", start.toISOString());
      }
      if (end) {
        query = query.lte("data_aposta", end.toISOString());
      }

      const { data, error } = await query;

      if (error) throw error;
      
      // Transform data to include bookmaker name
      const transformedData: Aposta[] = (data || []).map((item: any) => ({
        id: item.id,
        data_aposta: item.data_aposta,
        lucro_prejuizo: item.lucro_prejuizo,
        resultado: item.resultado,
        stake: item.stake,
        bookmaker_id: item.bookmaker_id,
        bookmaker_nome: item.bookmakers?.nome || 'Desconhecida',
        parceiro_nome: item.bookmakers?.parceiros?.nome || null,
      }));
      
      setApostas(transformedData);
    } catch (error) {
      console.error("Erro ao carregar apostas:", error);
    } finally {
      setLoading(false);
    }
  };

  // Parse date string as local time
  const parseLocalDateTime = (dateString: string): Date => {
    if (!dateString) return new Date();
    const cleanDate = dateString.replace(/\+00:00$/, '').replace(/Z$/, '').replace(/\+\d{2}:\d{2}$/, '');
    const [datePart] = cleanDate.split('T');
    const [year, month, day] = datePart.split('-').map(Number);
    return new Date(year, month - 1, day);
  };

  // Aggregate data by day
  const evolutionData: DailyData[] = (() => {
    const dailyMap = apostas.reduce((acc: Record<string, number>, aposta) => {
      const dateKey = aposta.data_aposta.split('T')[0];
      acc[dateKey] = (acc[dateKey] || 0) + (aposta.lucro_prejuizo || 0);
      return acc;
    }, {});

    const sortedDates = Object.keys(dailyMap).sort();
    let cumulativeBalance = 0;

    return sortedDates.map(dateKey => {
      const dailyProfit = dailyMap[dateKey];
      cumulativeBalance += dailyProfit;
      
      return {
        data: format(parseLocalDateTime(dateKey), "dd/MM", { locale: ptBR }),
        dataCompleta: format(parseLocalDateTime(dateKey), "dd/MM/yyyy", { locale: ptBR }),
        lucro_dia: dailyProfit,
        saldo: cumulativeBalance
      };
    });
  })();

  // Prepare results pie chart data with all outcome types
  const resultadosData = [
    { name: "GREEN", value: apostas.filter(a => a.resultado === "GREEN").length },
    { name: "RED", value: apostas.filter(a => a.resultado === "RED").length },
    { name: "MEIO_GREEN", value: apostas.filter(a => a.resultado === "MEIO_GREEN").length },
    { name: "MEIO_RED", value: apostas.filter(a => a.resultado === "MEIO_RED").length },
    { name: "VOID", value: apostas.filter(a => a.resultado === "VOID").length },
    { name: "Pendente", value: apostas.filter(a => !a.resultado || a.resultado === "PENDENTE").length },
  ].filter(d => d.value > 0);

  const resultadosColors = ["#22C55E", "#EF4444", "#4ADE80", "#F87171", "#6B7280", "#3B82F6"];

  // Aggregate data by bookmaker
  const bookmakerMetrics = useMemo(() => {
    const metricsMap = apostas.reduce((acc: Record<string, BookmakerMetrics>, aposta) => {
      const key = aposta.bookmaker_id;
      if (!acc[key]) {
        acc[key] = {
          bookmaker_id: aposta.bookmaker_id,
          bookmaker_nome: aposta.bookmaker_nome,
          parceiro_nome: aposta.parceiro_nome,
          totalApostas: 0,
          totalStake: 0,
          lucro: 0,
          greens: 0,
          reds: 0,
          roi: 0,
        };
      }
      
      acc[key].totalApostas++;
      acc[key].totalStake += aposta.stake || 0;
      acc[key].lucro += aposta.lucro_prejuizo || 0;
      
      if (aposta.resultado === "GREEN" || aposta.resultado === "MEIO_GREEN") {
        acc[key].greens++;
      }
      if (aposta.resultado === "RED" || aposta.resultado === "MEIO_RED") {
        acc[key].reds++;
      }
      
      return acc;
    }, {});

    // Calculate ROI and sort by total bets
    return Object.values(metricsMap)
      .map(m => ({
        ...m,
        roi: m.totalStake > 0 ? (m.lucro / m.totalStake) * 100 : 0
      }))
      .sort((a, b) => b.totalApostas - a.totalApostas);
  }, [apostas]);

  // Auto-select the bookmaker with most bets
  useEffect(() => {
    if (bookmakerMetrics.length > 0 && !selectedBookmaker) {
      setSelectedBookmaker(bookmakerMetrics[0].bookmaker_id);
    }
  }, [bookmakerMetrics, selectedBookmaker]);

  // Reset selection when period changes and current selection is no longer available
  useEffect(() => {
    if (selectedBookmaker && bookmakerMetrics.length > 0) {
      const stillExists = bookmakerMetrics.some(b => b.bookmaker_id === selectedBookmaker);
      if (!stillExists) {
        setSelectedBookmaker(bookmakerMetrics[0].bookmaker_id);
      }
    }
  }, [bookmakerMetrics, selectedBookmaker]);

  // Get selected bookmaker data
  const selectedBookmakerData = useMemo(() => {
    return bookmakerMetrics.find(b => b.bookmaker_id === selectedBookmaker);
  }, [bookmakerMetrics, selectedBookmaker]);

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat("pt-BR", {
      style: "currency",
      currency: "BRL",
    }).format(value);
  };

  if (loading) {
    return (
      <div className="grid gap-4 md:grid-cols-2">
        {[1, 2, 3, 4].map((i) => (
          <Skeleton key={i} className="h-64" />
        ))}
      </div>
    );
  }

  if (apostas.length === 0) {
    return (
      <Card>
        <CardContent className="pt-6">
          <div className="text-center py-10">
            <Target className="mx-auto h-12 w-12 text-muted-foreground/50" />
            <h3 className="mt-4 text-lg font-semibold">Nenhuma aposta registrada</h3>
            <p className="text-muted-foreground">
              Vá para a aba "Apostas" para registrar suas operações
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="grid gap-4 md:grid-cols-2">
      {/* Evolução do Saldo */}
      <Card className="md:col-span-2">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <TrendingUp className="h-5 w-5" />
            Evolução do Saldo
          </CardTitle>
          <CardDescription>
            Acompanhe a evolução do lucro/prejuízo ao longo do tempo
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="h-[300px]">
            <ResponsiveContainer width="100%" height="100%">
              {(() => {
                const values = evolutionData.map(d => d.saldo);
                const minValue = Math.min(...values, 0);
                const maxValue = Math.max(...values, 0);
                const range = maxValue - minValue;
                
                const zeroPosition = range > 0 ? maxValue / range : 0.5;
                const zeroPercent = Math.max(0, Math.min(100, zeroPosition * 100));
                
                const allPositive = minValue >= 0;
                const allNegative = maxValue <= 0;

                return (
                  <AreaChart data={evolutionData}>
                    <defs>
                      <linearGradient id="saldoBicolorGradient" x1="0" y1="0" x2="0" y2="1">
                        {allNegative ? (
                          <>
                            <stop offset="0%" stopColor="#ef4444" stopOpacity={0.1} />
                            <stop offset="100%" stopColor="#ef4444" stopOpacity={0.4} />
                          </>
                        ) : allPositive ? (
                          <>
                            <stop offset="0%" stopColor="#2dd4bf" stopOpacity={0.4} />
                            <stop offset="100%" stopColor="#2dd4bf" stopOpacity={0.05} />
                          </>
                        ) : (
                          <>
                            <stop offset="0%" stopColor="#2dd4bf" stopOpacity={0.4} />
                            <stop offset={`${zeroPercent}%`} stopColor="#2dd4bf" stopOpacity={0.1} />
                            <stop offset={`${zeroPercent}%`} stopColor="#ef4444" stopOpacity={0.1} />
                            <stop offset="100%" stopColor="#ef4444" stopOpacity={0.4} />
                          </>
                        )}
                      </linearGradient>
                      <linearGradient id="saldoStrokeGradient" x1="0" y1="0" x2="0" y2="1">
                        {allNegative ? (
                          <>
                            <stop offset="0%" stopColor="#ef4444" />
                            <stop offset="100%" stopColor="#ef4444" />
                          </>
                        ) : allPositive ? (
                          <>
                            <stop offset="0%" stopColor="#2dd4bf" />
                            <stop offset="100%" stopColor="#2dd4bf" />
                          </>
                        ) : (
                          <>
                            <stop offset="0%" stopColor="#2dd4bf" />
                            <stop offset={`${zeroPercent}%`} stopColor="#2dd4bf" />
                            <stop offset={`${zeroPercent}%`} stopColor="#ef4444" />
                            <stop offset="100%" stopColor="#ef4444" />
                          </>
                        )}
                      </linearGradient>
                    </defs>
                    <CartesianGrid 
                      strokeDasharray="0" 
                      stroke="hsl(var(--border)/0.3)" 
                      vertical={false}
                    />
                    <XAxis 
                      dataKey="data" 
                      stroke="hsl(var(--muted-foreground))"
                      fontSize={12}
                      axisLine={false}
                      tickLine={false}
                    />
                    <YAxis 
                      stroke="hsl(var(--muted-foreground))"
                      fontSize={12}
                      axisLine={false}
                      tickLine={false}
                      domain={[(dataMin: number) => Math.min(dataMin, 0), (dataMax: number) => Math.max(dataMax, 0)]}
                      tickFormatter={(value) => `${value.toLocaleString('pt-BR')} R$`}
                    />
                    <Tooltip 
                      content={({ active, payload }) => {
                        if (active && payload && payload.length) {
                          const data = payload[0].payload as DailyData;
                          const isPositive = data.saldo >= 0;
                          return (
                            <div className="bg-background/90 backdrop-blur-xl border border-border/50 rounded-lg px-3 py-2 shadow-xl">
                              <p className="text-sm font-medium">{data.dataCompleta}</p>
                              <p className="text-sm text-muted-foreground">
                                <span className={`inline-block w-2 h-2 rounded-sm mr-2 ${isPositive ? 'bg-teal-400' : 'bg-red-400'}`} />
                                Lucro: {formatCurrency(data.saldo)}
                              </p>
                            </div>
                          );
                        }
                        return null;
                      }}
                      cursor={{ stroke: 'rgba(255, 255, 255, 0.1)', strokeWidth: 1 }}
                    />
                    <Area
                      type="monotone"
                      dataKey="saldo"
                      stroke="url(#saldoStrokeGradient)"
                      strokeWidth={2}
                      fill="url(#saldoBicolorGradient)"
                      dot={false}
                      activeDot={{ r: 4, strokeWidth: 0 }}
                    />
                  </AreaChart>
                );
              })()}
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>

      {/* Distribuição de Resultados */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <PieChart className="h-5 w-5" />
            Distribuição de Resultados
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-[250px]">
            <ModernDonutChart
              data={resultadosData}
              height={250}
              innerRadius={55}
              outerRadius={85}
              showLabels={true}
              colors={resultadosColors}
              formatValue={(value) => `${value} apostas`}
            />
          </div>
        </CardContent>
      </Card>

      {/* Performance por Casa */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-4">
          <CardTitle className="flex items-center gap-2">
            <Building2 className="h-5 w-5" />
            Performance por Casa
          </CardTitle>
          {bookmakerMetrics.length > 0 && (
            <Select value={selectedBookmaker} onValueChange={setSelectedBookmaker}>
              <SelectTrigger className="w-[200px] h-8 text-sm">
                <SelectValue placeholder="Selecione" />
              </SelectTrigger>
              <SelectContent>
                {bookmakerMetrics.map(bm => (
                  <SelectItem key={bm.bookmaker_id} value={bm.bookmaker_id}>
                    {bm.bookmaker_nome} ({bm.totalApostas})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </CardHeader>
        <CardContent>
          {selectedBookmakerData ? (
            <div className="space-y-4">
              {/* Parceiro info */}
              {selectedBookmakerData.parceiro_nome && (
                <div className="text-sm text-muted-foreground">
                  Parceiro: <span className="text-foreground font-medium">{selectedBookmakerData.parceiro_nome}</span>
                </div>
              )}
              
              {/* Main metrics grid */}
              <div className="grid grid-cols-2 gap-4">
                <div className="bg-muted/30 rounded-lg p-4">
                  <p className="text-xs text-muted-foreground mb-1">Total Apostado</p>
                  <p className="text-lg font-bold font-mono">
                    {formatCurrency(selectedBookmakerData.totalStake)}
                  </p>
                </div>
                <div className="bg-muted/30 rounded-lg p-4">
                  <p className="text-xs text-muted-foreground mb-1">Lucro/Prejuízo</p>
                  <p className={`text-lg font-bold font-mono ${selectedBookmakerData.lucro >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                    {formatCurrency(selectedBookmakerData.lucro)}
                  </p>
                </div>
                <div className="bg-muted/30 rounded-lg p-4">
                  <p className="text-xs text-muted-foreground mb-1">Qtd. Apostas</p>
                  <p className="text-lg font-bold font-mono">
                    {selectedBookmakerData.totalApostas}
                  </p>
                </div>
                <div className="bg-muted/30 rounded-lg p-4">
                  <p className="text-xs text-muted-foreground mb-1">ROI</p>
                  <p className={`text-lg font-bold font-mono ${selectedBookmakerData.roi >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                    {selectedBookmakerData.roi.toFixed(2)}%
                  </p>
                </div>
              </div>

              {/* Win rate bar */}
              <div className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Taxa de Acerto</span>
                  <span className="font-mono font-medium">
                    {selectedBookmakerData.totalApostas > 0 
                      ? ((selectedBookmakerData.greens / selectedBookmakerData.totalApostas) * 100).toFixed(1) 
                      : 0}%
                  </span>
                </div>
                <div className="h-2 bg-muted/50 rounded-full overflow-hidden flex">
                  <div 
                    className="h-full bg-gradient-to-r from-emerald-500 to-emerald-400 transition-all duration-500"
                    style={{ 
                      width: `${selectedBookmakerData.totalApostas > 0 
                        ? (selectedBookmakerData.greens / selectedBookmakerData.totalApostas) * 100 
                        : 0}%` 
                    }}
                  />
                  <div 
                    className="h-full bg-gradient-to-r from-red-500 to-red-400 transition-all duration-500"
                    style={{ 
                      width: `${selectedBookmakerData.totalApostas > 0 
                        ? (selectedBookmakerData.reds / selectedBookmakerData.totalApostas) * 100 
                        : 0}%` 
                    }}
                  />
                </div>
                <div className="flex justify-between text-xs text-muted-foreground">
                  <span className="flex items-center gap-1">
                    <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
                    Greens: {selectedBookmakerData.greens}
                  </span>
                  <span className="flex items-center gap-1">
                    <span className="w-2 h-2 rounded-full bg-red-500"></span>
                    Reds: {selectedBookmakerData.reds}
                  </span>
                </div>
              </div>
            </div>
          ) : (
            <div className="flex items-center justify-center h-[200px] text-muted-foreground">
              Selecione uma casa para ver os detalhes
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
