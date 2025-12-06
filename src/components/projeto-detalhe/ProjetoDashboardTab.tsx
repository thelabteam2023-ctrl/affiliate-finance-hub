import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { 
  TrendingUp, 
  TrendingDown, 
  Target, 
  DollarSign,
  PieChart,
  BarChart3
} from "lucide-react";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart as RechartsPieChart,
  Pie,
  Cell,
  BarChart,
  Bar,
  Legend
} from "recharts";
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
  estrategia: string | null;
  esporte: string;
}

interface DailyData {
  data: string;
  dataCompleta: string;
  lucro_dia: number;
  saldo: number;
}

export function ProjetoDashboardTab({ projetoId, periodFilter = "todo", dateRange }: ProjetoDashboardTabProps) {
  const [apostas, setApostas] = useState<Aposta[]>([]);
  const [loading, setLoading] = useState(true);

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
        .select("id, data_aposta, lucro_prejuizo, resultado, estrategia, esporte")
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
      setApostas(data || []);
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
    // Group apostas by day
    const dailyMap = apostas.reduce((acc: Record<string, number>, aposta) => {
      const dateKey = aposta.data_aposta.split('T')[0]; // Extract YYYY-MM-DD
      acc[dateKey] = (acc[dateKey] || 0) + (aposta.lucro_prejuizo || 0);
      return acc;
    }, {});

    // Sort dates and calculate cumulative balance
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

  // Prepare results pie chart data
  const resultadosData = [
    { name: "GREEN", value: apostas.filter(a => a.resultado === "GREEN").length, color: "#10b981" },
    { name: "RED", value: apostas.filter(a => a.resultado === "RED").length, color: "#ef4444" },
    { name: "VOID", value: apostas.filter(a => a.resultado === "VOID").length, color: "#6b7280" },
    { name: "HALF", value: apostas.filter(a => a.resultado === "HALF").length, color: "#f59e0b" },
    { name: "Pendente", value: apostas.filter(a => !a.resultado).length, color: "#3b82f6" },
  ].filter(d => d.value > 0);

  // Prepare sports bar chart data
  const esportesMap = apostas.reduce((acc: Record<string, { greens: number; reds: number }>, aposta) => {
    if (!acc[aposta.esporte]) {
      acc[aposta.esporte] = { greens: 0, reds: 0 };
    }
    if (aposta.resultado === "GREEN") acc[aposta.esporte].greens++;
    if (aposta.resultado === "RED") acc[aposta.esporte].reds++;
    return acc;
  }, {});

  const esportesData = Object.entries(esportesMap).map(([esporte, data]) => ({
    esporte,
    greens: data.greens,
    reds: data.reds
  }));

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
                // Calculate min/max for gradient positioning
                const values = evolutionData.map(d => d.saldo);
                const minValue = Math.min(...values, 0);
                const maxValue = Math.max(...values, 0);
                const range = maxValue - minValue;
                
                // Calculate zero position as percentage from top (0 = top, 1 = bottom)
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
            <ResponsiveContainer width="100%" height="100%">
              <RechartsPieChart>
                <Pie
                  data={resultadosData}
                  cx="50%"
                  cy="50%"
                  innerRadius={60}
                  outerRadius={80}
                  paddingAngle={5}
                  dataKey="value"
                  label={({ name, value }) => `${name}: ${value}`}
                >
                  {resultadosData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip 
                  contentStyle={{ 
                    backgroundColor: "rgba(0, 0, 0, 0.4)",
                    border: "1px solid rgba(255, 255, 255, 0.1)",
                    backdropFilter: "blur(12px)",
                    borderRadius: "12px",
                    padding: "12px 16px"
                  }}
                />
              </RechartsPieChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>

      {/* Performance por Esporte */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <BarChart3 className="h-5 w-5" />
            Performance por Esporte
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-[250px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={esportesData}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis 
                  dataKey="esporte" 
                  stroke="hsl(var(--muted-foreground))"
                  fontSize={12}
                />
                <YAxis 
                  stroke="hsl(var(--muted-foreground))"
                  fontSize={12}
                />
                <Tooltip 
                  contentStyle={{ 
                    backgroundColor: "rgba(0, 0, 0, 0.4)",
                    border: "1px solid rgba(255, 255, 255, 0.1)",
                    backdropFilter: "blur(12px)",
                    borderRadius: "12px",
                    padding: "12px 16px"
                  }}
                  cursor={{ fill: "rgba(255, 255, 255, 0.05)" }}
                />
                <Legend />
                <Bar dataKey="greens" fill="#10b981" name="Greens" />
                <Bar dataKey="reds" fill="#ef4444" name="Reds" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}