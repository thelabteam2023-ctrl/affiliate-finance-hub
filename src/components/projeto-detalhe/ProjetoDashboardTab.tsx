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
import { ScrollArea } from "@/components/ui/scroll-area";
import { 
  TrendingUp, 
  Target, 
  Building2,
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
} from "recharts";
import { ModernBarChart } from "@/components/ui/modern-bar-chart";
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
  esporte: string;
  bookmaker_id: string;
  bookmaker_nome: string;
  parceiro_nome: string | null;
  logo_url: string | null;
}

interface ApostaMultipla {
  id: string;
  data_aposta: string;
  lucro_prejuizo: number | null;
  resultado: string | null;
  stake: number;
  selecoes: { descricao: string; odd: string; resultado?: string }[];
  bookmaker_id: string;
  bookmaker_nome: string;
  parceiro_nome: string | null;
  logo_url: string | null;
}

// Tipo unificado para agregação
interface ApostaUnificada {
  id: string;
  data_aposta: string;
  lucro_prejuizo: number | null;
  resultado: string | null;
  stake: number;
  esporte: string;
  bookmaker_id: string;
  bookmaker_nome: string;
  parceiro_nome: string | null;
  logo_url: string | null;
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
  logo_url: string | null;
  totalApostas: number;
  totalStake: number;
  lucro: number;
  greens: number;
  reds: number;
  roi: number;
}

type BookmakerFilter = "all" | "bookmaker" | "parceiro";

export function ProjetoDashboardTab({ projetoId, periodFilter = "todo", dateRange }: ProjetoDashboardTabProps) {
  const [apostasUnificadas, setApostasUnificadas] = useState<ApostaUnificada[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedEsporte, setSelectedEsporte] = useState<string>("");
  
  // Filtros para Performance por Casa
  const [bookmakerFilterType, setBookmakerFilterType] = useState<BookmakerFilter>("all");
  const [selectedBookmakerId, setSelectedBookmakerId] = useState<string>("");
  const [selectedParceiro, setSelectedParceiro] = useState<string>("");

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
    fetchAllApostas();
  }, [projetoId, periodFilter, dateRange]);

  const fetchAllApostas = async () => {
    try {
      setLoading(true);
      const { start, end } = getDateRangeFromFilter();
      
      // Usar apostas_unificada como fonte única
      let query = supabase
        .from("apostas_unificada")
        .select(`
          id, 
          data_aposta, 
          lucro_prejuizo, 
          resultado, 
          stake,
          stake_total,
          esporte,
          bookmaker_id,
          forma_registro,
          estrategia
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
      
      // Buscar bookmaker names
      const bookmakerIds = [...new Set((data || []).map(a => a.bookmaker_id).filter(Boolean))];
      let bookmakerMap: Record<string, { nome: string; parceiro_nome: string | null; logo_url: string | null }> = {};
      
      if (bookmakerIds.length > 0) {
        const { data: bookmakers } = await supabase
          .from("bookmakers")
          .select("id, nome, parceiros(nome), bookmakers_catalogo(logo_url)")
          .in("id", bookmakerIds);
        
        bookmakerMap = (bookmakers || []).reduce((acc: any, bk: any) => {
          acc[bk.id] = {
            nome: bk.nome,
            parceiro_nome: bk.parceiros?.nome || null,
            logo_url: bk.bookmakers_catalogo?.logo_url || null
          };
          return acc;
        }, {});
      }
      
      // Transform para formato unificado
      const apostasTransformadas: ApostaUnificada[] = (data || []).map((item: any) => {
        const bkInfo = bookmakerMap[item.bookmaker_id] || { nome: 'Desconhecida', parceiro_nome: null, logo_url: null };
        const stake = item.forma_registro === 'ARBITRAGEM' ? item.stake_total : item.stake;
        
        return {
          id: item.id,
          data_aposta: item.data_aposta,
          lucro_prejuizo: item.lucro_prejuizo,
          resultado: item.resultado,
          stake: stake || 0,
          esporte: item.esporte || item.estrategia || 'N/A',
          bookmaker_id: item.bookmaker_id || 'unknown',
          bookmaker_nome: item.forma_registro === 'ARBITRAGEM' ? 'Arbitragem' : bkInfo.nome,
          parceiro_nome: bkInfo.parceiro_nome,
          logo_url: bkInfo.logo_url,
        };
      });
      
      setApostasUnificadas(apostasTransformadas);
    } catch (error) {
      console.error("Erro ao carregar apostas:", error);
    } finally {
      setLoading(false);
    }
  };

  const parseLocalDateTime = (dateString: string): Date => {
    if (!dateString) return new Date();
    const cleanDate = dateString.replace(/\+00:00$/, '').replace(/Z$/, '').replace(/\+\d{2}:\d{2}$/, '');
    const [datePart, timePart] = cleanDate.split('T');
    const [year, month, day] = datePart.split('-').map(Number);
    const [hours, minutes] = (timePart || '00:00').split(':').map(Number);
    return new Date(year, month - 1, day, hours || 0, minutes || 0);
  };

  // Determina se é período de 1 dia (hoje/ontem) para usar hora no eixo X
  const isSingleDayPeriod = periodFilter === "hoje" || periodFilter === "ontem" || 
    (periodFilter === "custom" && dateRange?.from && dateRange?.to && 
      startOfDay(dateRange.from).getTime() === startOfDay(dateRange.to).getTime());

  // Dados de evolução com eixo X baseado no período
  const evolutionData: DailyData[] = useMemo(() => {
    // Ordena apostas cronologicamente
    const sortedApostas = [...apostasUnificadas].sort((a, b) => 
      new Date(a.data_aposta).getTime() - new Date(b.data_aposta).getTime()
    );
    
    let cumulativeBalance = 0;
    return sortedApostas.map((aposta, index) => {
      cumulativeBalance += aposta.lucro_prejuizo || 0;
      const date = parseLocalDateTime(aposta.data_aposta);
      
      // Eixo X: hora para período de 1 dia, data para períodos maiores
      const xLabel = isSingleDayPeriod 
        ? format(date, "HH:mm", { locale: ptBR })
        : format(date, "dd/MM", { locale: ptBR });
      
      return {
        data: xLabel,
        dataCompleta: `Entrada #${index + 1} - ${format(date, "dd/MM/yyyy HH:mm", { locale: ptBR })}`,
        lucro_dia: aposta.lucro_prejuizo || 0,
        saldo: cumulativeBalance
      };
    });
  }, [apostasUnificadas, isSingleDayPeriod]);

  // Aggregate by bookmaker
  const bookmakerMetrics = useMemo(() => {
    const metricsMap = apostasUnificadas.reduce((acc: Record<string, BookmakerMetrics>, aposta) => {
      const key = aposta.bookmaker_id;
      if (!acc[key]) {
        acc[key] = {
          bookmaker_id: aposta.bookmaker_id,
          bookmaker_nome: aposta.bookmaker_nome,
          parceiro_nome: aposta.parceiro_nome,
          logo_url: aposta.logo_url,
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

    return Object.values(metricsMap)
      .map((m: BookmakerMetrics) => ({
        ...m,
        roi: m.totalStake > 0 ? (m.lucro / m.totalStake) * 100 : 0
      }))
      .sort((a, b) => b.totalApostas - a.totalApostas);
  }, [apostasUnificadas]);

  // Listas únicas para filtros
  const uniqueBookmakers = useMemo(() => {
    const map = new Map<string, { id: string; nome: string }>();
    apostasUnificadas.forEach(a => {
      if (!map.has(a.bookmaker_id)) {
        map.set(a.bookmaker_id, { id: a.bookmaker_id, nome: a.bookmaker_nome });
      }
    });
    return Array.from(map.values()).sort((a, b) => a.nome.localeCompare(b.nome));
  }, [apostasUnificadas]);

  const uniqueParceiros = useMemo(() => {
    const set = new Set<string>();
    apostasUnificadas.forEach(a => {
      if (a.parceiro_nome) set.add(a.parceiro_nome);
    });
    return Array.from(set).sort();
  }, [apostasUnificadas]);

  // Filtrar métricas por bookmaker
  const filteredBookmakerMetrics = useMemo(() => {
    if (bookmakerFilterType === "all") return bookmakerMetrics;
    
    if (bookmakerFilterType === "bookmaker" && selectedBookmakerId) {
      return bookmakerMetrics.filter(bm => bm.bookmaker_id === selectedBookmakerId);
    }
    
    if (bookmakerFilterType === "parceiro" && selectedParceiro) {
      return bookmakerMetrics.filter(bm => bm.parceiro_nome === selectedParceiro);
    }
    
    return bookmakerMetrics;
  }, [bookmakerMetrics, bookmakerFilterType, selectedBookmakerId, selectedParceiro]);

  // Reset seleção quando muda o tipo de filtro
  useEffect(() => {
    if (bookmakerFilterType === "all") {
      setSelectedBookmakerId("");
      setSelectedParceiro("");
    }
  }, [bookmakerFilterType]);

  // Aggregate by sport
  const esportesData = useMemo(() => {
    const esportesMap = apostasUnificadas.reduce((acc: Record<string, { 
      greens: number; 
      reds: number; 
      meioGreens: number;
      meioReds: number;
      lucro: number;
    }>, aposta) => {
      if (!acc[aposta.esporte]) {
        acc[aposta.esporte] = { greens: 0, reds: 0, meioGreens: 0, meioReds: 0, lucro: 0 };
      }
      if (aposta.resultado === "GREEN") acc[aposta.esporte].greens++;
      if (aposta.resultado === "RED") acc[aposta.esporte].reds++;
      if (aposta.resultado === "MEIO_GREEN") acc[aposta.esporte].meioGreens++;
      if (aposta.resultado === "MEIO_RED") acc[aposta.esporte].meioReds++;
      acc[aposta.esporte].lucro += aposta.lucro_prejuizo || 0;
      return acc;
    }, {});

    const data = Object.entries(esportesMap).map(([esporte, sportData]) => {
      const totalApostas = sportData.greens + sportData.reds + sportData.meioGreens + sportData.meioReds;
      return {
        esporte,
        greens: sportData.greens,
        reds: sportData.reds,
        meioGreens: sportData.meioGreens,
        meioReds: sportData.meioReds,
        lucro: sportData.lucro,
        totalApostas,
      };
    });
    return data.sort((a, b) => b.totalApostas - a.totalApostas);
  }, [apostasUnificadas]);

  useEffect(() => {
    if (esportesData.length > 0 && !selectedEsporte) {
      setSelectedEsporte(esportesData[0].esporte);
    }
  }, [esportesData, selectedEsporte]);

  useEffect(() => {
    if (selectedEsporte && esportesData.length > 0) {
      const stillExists = esportesData.some(e => e.esporte === selectedEsporte);
      if (!stillExists) {
        setSelectedEsporte(esportesData[0].esporte);
      }
    }
  }, [esportesData, selectedEsporte]);

  const filteredEsportesData = useMemo(() => {
    return esportesData.filter(e => e.esporte === selectedEsporte);
  }, [esportesData, selectedEsporte]);

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

  if (apostasUnificadas.length === 0) {
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
            {isSingleDayPeriod ? "Evolução por horário" : "Evolução por data"} ({evolutionData.length} apostas)
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
                      interval={evolutionData.length > 50 ? Math.floor(evolutionData.length / 10) : evolutionData.length > 20 ? 5 : 0}
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
                          const lucroDiaPositive = data.lucro_dia >= 0;
                          return (
                            <div className="bg-background/90 backdrop-blur-xl border border-border/50 rounded-lg px-3 py-2 shadow-xl">
                              <p className="text-sm font-medium">{data.dataCompleta}</p>
                              <p className="text-sm text-muted-foreground">
                                <span className={`inline-block w-2 h-2 rounded-sm mr-2 ${lucroDiaPositive ? 'bg-teal-400' : 'bg-red-400'}`} />
                                Impacto: {formatCurrency(data.lucro_dia)}
                              </p>
                              <p className="text-sm text-muted-foreground">
                                <span className={`inline-block w-2 h-2 rounded-sm mr-2 ${isPositive ? 'bg-teal-400' : 'bg-red-400'}`} />
                                Acumulado: {formatCurrency(data.saldo)}
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

      {/* Performance por Casa - Lista */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2">
              <Building2 className="h-5 w-5" />
              Performance por Casa
            </CardTitle>
            <div className="flex items-center gap-2">
              <Select value={bookmakerFilterType} onValueChange={(v) => setBookmakerFilterType(v as BookmakerFilter)}>
                <SelectTrigger className="w-[130px] h-8 text-xs">
                  <SelectValue placeholder="Filtrar por" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos</SelectItem>
                  <SelectItem value="bookmaker">Por Casa</SelectItem>
                  <SelectItem value="parceiro">Por Usuário</SelectItem>
                </SelectContent>
              </Select>
              
              {bookmakerFilterType === "bookmaker" && uniqueBookmakers.length > 0 && (
                <Select value={selectedBookmakerId} onValueChange={setSelectedBookmakerId}>
                  <SelectTrigger className="w-[150px] h-8 text-xs">
                    <SelectValue placeholder="Selecione a casa" />
                  </SelectTrigger>
                  <SelectContent>
                    {uniqueBookmakers.map(bm => (
                      <SelectItem key={bm.id} value={bm.id}>
                        {bm.nome}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
              
              {bookmakerFilterType === "parceiro" && uniqueParceiros.length > 0 && (
                <Select value={selectedParceiro} onValueChange={setSelectedParceiro}>
                  <SelectTrigger className="w-[150px] h-8 text-xs">
                    <SelectValue placeholder="Selecione o usuário" />
                  </SelectTrigger>
                  <SelectContent>
                    {uniqueParceiros.map(nome => (
                      <SelectItem key={nome} value={nome}>
                        {nome}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>
          </div>
        </CardHeader>
        <CardContent className="px-0">
          <ScrollArea className="h-[260px]">
            {/* Header */}
            <div className="grid grid-cols-5 gap-2 px-6 pb-2 text-xs text-muted-foreground font-medium border-b border-border/50">
              <div className="col-span-1">Casa</div>
              <div className="text-right">Apostas</div>
              <div className="text-right">Volume</div>
              <div className="text-right">Lucro</div>
              <div className="text-right">ROI</div>
            </div>
            
            {/* Rows */}
            <div className="divide-y divide-border/30">
              {filteredBookmakerMetrics.length === 0 ? (
                <div className="px-6 py-8 text-center text-sm text-muted-foreground">
                  {bookmakerFilterType !== "all" && !(selectedBookmakerId || selectedParceiro) 
                    ? "Selecione um filtro" 
                    : "Nenhum resultado encontrado"}
                </div>
              ) : (
                filteredBookmakerMetrics.map((bm) => (
                  <div 
                    key={bm.bookmaker_id} 
                    className="grid grid-cols-5 gap-2 px-6 py-3 hover:bg-muted/30 transition-colors"
                  >
                    <div className="col-span-1 flex items-center gap-2">
                      {bm.logo_url ? (
                        <img 
                          src={bm.logo_url} 
                          alt={bm.bookmaker_nome}
                          className="w-6 h-6 rounded object-contain bg-muted/50 p-0.5 flex-shrink-0"
                        />
                      ) : (
                        <div className="w-6 h-6 rounded bg-muted/50 flex items-center justify-center flex-shrink-0">
                          <Building2 className="h-3 w-3 text-muted-foreground" />
                        </div>
                      )}
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium truncate">{bm.bookmaker_nome}</p>
                        {bm.parceiro_nome && (
                          <p className="text-[10px] text-muted-foreground truncate">{bm.parceiro_nome}</p>
                        )}
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-mono">{bm.totalApostas}</p>
                      <p className="text-xs text-muted-foreground">
                        {bm.greens}G / {bm.reds}R
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-mono">{formatCurrency(bm.totalStake)}</p>
                    </div>
                    <div className="text-right">
                      <p className={`text-sm font-mono font-medium ${bm.lucro >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                        {formatCurrency(bm.lucro)}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className={`text-sm font-mono font-medium ${bm.roi >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                        {bm.roi.toFixed(1)}%
                      </p>
                    </div>
                  </div>
                ))
              )}
            </div>
          </ScrollArea>
        </CardContent>
      </Card>

      {/* Performance por Esporte */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="flex items-center gap-2">
            <BarChart3 className="h-5 w-5" />
            Performance por Esporte
          </CardTitle>
          {esportesData.length > 0 && (
            <Select value={selectedEsporte} onValueChange={setSelectedEsporte}>
              <SelectTrigger className="w-[180px] h-8 text-sm">
                <SelectValue placeholder="Selecione" />
              </SelectTrigger>
              <SelectContent>
                {esportesData.map(esporte => (
                  <SelectItem key={esporte.esporte} value={esporte.esporte}>
                    {esporte.esporte} ({esporte.totalApostas})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </CardHeader>
        <CardContent>
          <ModernBarChart
            data={filteredEsportesData}
            categoryKey="esporte"
            bars={[
              { 
                dataKey: "greens", 
                label: "Greens", 
                gradientStart: "#22C55E", 
                gradientEnd: "#16A34A" 
              },
              { 
                dataKey: "meioGreens", 
                label: "Meio Green", 
                gradientStart: "#4ADE80", 
                gradientEnd: "#22C55E" 
              },
              { 
                dataKey: "reds", 
                label: "Reds", 
                gradientStart: "#EF4444", 
                gradientEnd: "#DC2626" 
              },
              { 
                dataKey: "meioReds", 
                label: "Meio Red", 
                gradientStart: "#F87171", 
                gradientEnd: "#EF4444" 
              },
            ]}
            height={250}
            barSize={16}
            showLabels={false}
            showLegend={true}
            customTooltipContent={(payload, label) => {
              const data = payload[0]?.payload;
              if (!data) return null;
              const totalApostas = data.greens + data.reds + data.meioGreens + data.meioReds;
              const totalWins = data.greens + (data.meioGreens * 0.5);
              const winRate = totalApostas > 0 ? ((totalWins / totalApostas) * 100).toFixed(1) : "0";
              return (
                <>
                  <p className="font-medium text-sm mb-3 text-foreground">{label}</p>
                  <div className="space-y-2">
                    <div className="flex items-center justify-between gap-4">
                      <div className="flex items-center gap-2">
                        <div className="w-2.5 h-2.5 rounded-full bg-gradient-to-b from-[#22C55E] to-[#16A34A]" />
                        <span className="text-xs text-muted-foreground">Greens</span>
                      </div>
                      <span className="text-sm font-semibold font-mono">{data.greens}</span>
                    </div>
                    {data.meioGreens > 0 && (
                      <div className="flex items-center justify-between gap-4">
                        <div className="flex items-center gap-2">
                          <div className="w-2.5 h-2.5 rounded-full bg-gradient-to-b from-[#4ADE80] to-[#22C55E]" />
                          <span className="text-xs text-muted-foreground">Meio Green</span>
                        </div>
                        <span className="text-sm font-semibold font-mono">{data.meioGreens}</span>
                      </div>
                    )}
                    <div className="flex items-center justify-between gap-4">
                      <div className="flex items-center gap-2">
                        <div className="w-2.5 h-2.5 rounded-full bg-gradient-to-b from-[#EF4444] to-[#DC2626]" />
                        <span className="text-xs text-muted-foreground">Reds</span>
                      </div>
                      <span className="text-sm font-semibold font-mono">{data.reds}</span>
                    </div>
                    {data.meioReds > 0 && (
                      <div className="flex items-center justify-between gap-4">
                        <div className="flex items-center gap-2">
                          <div className="w-2.5 h-2.5 rounded-full bg-gradient-to-b from-[#F87171] to-[#EF4444]" />
                          <span className="text-xs text-muted-foreground">Meio Red</span>
                        </div>
                        <span className="text-sm font-semibold font-mono">{data.meioReds}</span>
                      </div>
                    )}
                    <div className="border-t border-border/50 pt-2 mt-2 space-y-1.5">
                      <div className="flex items-center justify-between">
                        <span className="text-xs text-muted-foreground">Total Apostas</span>
                        <span className="text-sm font-mono">{totalApostas}</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-xs text-muted-foreground">Lucro/Prejuízo</span>
                        <span className={`text-sm font-mono font-semibold ${data.lucro >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                          {formatCurrency(data.lucro)}
                        </span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-xs text-muted-foreground">Win Rate</span>
                        <span className="text-sm font-mono">{winRate}%</span>
                      </div>
                    </div>
                  </div>
                </>
              );
            }}
          />
        </CardContent>
      </Card>
    </div>
  );
}
