import { useState, useEffect, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { 
  Search, 
  TrendingUp, 
  Target, 
  Percent, 
  Building2,
  DollarSign,
  BarChart3,
  Info,
  LayoutGrid,
  List
} from "lucide-react";
import { format, startOfDay, endOfDay, subDays, startOfMonth, startOfYear } from "date-fns";
import { ptBR } from "date-fns/locale";
import { ApostaDialog } from "./ApostaDialog";
import { ResultadoPill } from "./ResultadoPill";
import { APOSTA_ESTRATEGIA } from "@/lib/apostaConstants";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  BarChart,
  Bar,
  Cell,
} from "recharts";
import { StandardTimeFilter, StandardPeriodFilter, getDateRangeFromPeriod, DateRange as FilterDateRange } from "./StandardTimeFilter";

interface ProjetoValueBetTabProps {
  projetoId: string;
  onDataChange?: () => void;
  refreshTrigger?: number;
}

interface Aposta {
  id: string;
  data_aposta: string;
  esporte: string;
  evento: string;
  mercado: string | null;
  selecao: string;
  odd: number;
  stake: number;
  estrategia: string | null;
  status: string;
  resultado: string | null;
  lucro_prejuizo: number | null;
  valor_retorno: number | null;
  observacoes: string | null;
  bookmaker_id: string;
  bookmaker_nome?: string;
  // Campos adicionais para edição correta
  modo_entrada?: string;
  gerou_freebet?: boolean;
  valor_freebet_gerada?: number | null;
  tipo_freebet?: string | null;
  forma_registro?: string | null;
  contexto_operacional?: string | null;
  lay_exchange?: string | null;
  lay_odd?: number | null;
  lay_stake?: number | null;
  lay_liability?: number | null;
  lay_comissao?: number | null;
  back_em_exchange?: boolean;
  back_comissao?: number | null;
}

// Componente ResultadoBadge removido - agora usamos ResultadoPill para permitir edição inline

export function ProjetoValueBetTab({ 
  projetoId, 
  onDataChange, 
  refreshTrigger
}: ProjetoValueBetTabProps) {
  const [apostas, setApostas] = useState<Aposta[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [resultadoFilter, setResultadoFilter] = useState<string>("all");
  const [viewMode, setViewMode] = useState<"cards" | "list">("cards");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [selectedAposta, setSelectedAposta] = useState<Aposta | null>(null);

  // Filtro de tempo interno
  const [internalPeriod, setInternalPeriod] = useState<StandardPeriodFilter>("30dias");
  const [internalDateRange, setInternalDateRange] = useState<FilterDateRange | undefined>(undefined);

  const dateRange = useMemo(() => getDateRangeFromPeriod(internalPeriod, internalDateRange), [internalPeriod, internalDateRange]);

  useEffect(() => {
    fetchData();
  }, [projetoId, internalPeriod, internalDateRange, refreshTrigger]);

  const fetchData = async () => {
    try {
      setLoading(true);
      await fetchApostas();
    } finally {
      setLoading(false);
    }
  };

  const fetchApostas = async () => {
    try {
      // Usa tabela unificada filtrando por estratégia VALUEBET
      let query = supabase
        .from("apostas_unificada")
        .select(`
          id, data_aposta, esporte, evento, mercado, selecao, odd, stake, estrategia, 
          status, resultado, lucro_prejuizo, valor_retorno, observacoes, bookmaker_id,
          modo_entrada, gerou_freebet, valor_freebet_gerada, tipo_freebet, forma_registro,
          contexto_operacional, lay_exchange, lay_odd, lay_stake, lay_liability, lay_comissao,
          back_em_exchange, back_comissao
        `)
        .eq("projeto_id", projetoId)
        .eq("estrategia", APOSTA_ESTRATEGIA.VALUEBET)
        .is("cancelled_at", null)
        .order("data_aposta", { ascending: false });
      
      if (dateRange) {
        query = query.gte("data_aposta", dateRange.start.toISOString());
        query = query.lte("data_aposta", dateRange.end.toISOString());
      }

      const { data, error } = await query;
      if (error) throw error;
      
      const bookmakerIds = [...new Set((data || []).map((a: { bookmaker_id: string | null }) => a.bookmaker_id).filter(Boolean))];
      
      let bookmakerMap = new Map<string, string>();
      if (bookmakerIds.length > 0) {
        const { data: bookmakers } = await supabase
          .from("bookmakers")
          .select("id, nome")
          .in("id", bookmakerIds);
        
        bookmakerMap = new Map((bookmakers || []).map((b: { id: string; nome: string }) => [b.id, b.nome]));
      }
      
      const mappedApostas: Aposta[] = (data || []).map((a: any) => ({
        ...a,
        odd: a.odd ?? 0,
        stake: a.stake ?? 0,
        bookmaker_nome: a.bookmaker_id ? (bookmakerMap.get(a.bookmaker_id) || "Desconhecida") : "Desconhecida"
      }));
      
      setApostas(mappedApostas);
    } catch (error: unknown) {
      console.error("Erro ao carregar apostas ValueBet:", error);
    }
  };

  const metricas = useMemo(() => {
    const todasApostas = apostas.map(a => ({ 
      stake: a.stake, 
      lucro: a.lucro_prejuizo, 
      resultado: a.resultado, 
      bookmaker: a.bookmaker_nome 
    }));

    const total = todasApostas.length;
    const totalStake = todasApostas.reduce((acc, a) => acc + a.stake, 0);
    const lucroTotal = todasApostas.reduce((acc, a) => acc + (a.lucro || 0), 0);
    const greens = todasApostas.filter(a => a.resultado === "GREEN" || a.resultado === "MEIO_GREEN").length;
    const reds = todasApostas.filter(a => a.resultado === "RED" || a.resultado === "MEIO_RED").length;
    const liquidadas = todasApostas.filter(a => a.resultado && a.resultado !== "PENDENTE").length;
    const taxaAcerto = liquidadas > 0 ? (greens / liquidadas) * 100 : 0;
    const roi = totalStake > 0 ? (lucroTotal / totalStake) * 100 : 0;

    const porCasa: Record<string, { stake: number; lucro: number; count: number }> = {};
    todasApostas.forEach(a => {
      const casa = a.bookmaker || "Desconhecida";
      if (!porCasa[casa]) porCasa[casa] = { stake: 0, lucro: 0, count: 0 };
      porCasa[casa].stake += a.stake;
      porCasa[casa].lucro += a.lucro || 0;
      porCasa[casa].count++;
    });

    return { total, totalStake, lucroTotal, greens, reds, taxaAcerto, roi, porCasa };
  }, [apostas]);

  const evolutionData = useMemo(() => {
    const todas = apostas
      .map(a => ({ data: a.data_aposta, lucro: a.lucro_prejuizo || 0 }))
      .sort((a, b) => new Date(a.data).getTime() - new Date(b.data).getTime());

    let acumulado = 0;
    return todas.map(a => {
      acumulado += a.lucro;
      return {
        data: format(new Date(a.data), "dd/MM", { locale: ptBR }),
        lucro: a.lucro,
        acumulado
      };
    });
  }, [apostas]);

  const casaData = useMemo(() => {
    return Object.entries(metricas.porCasa)
      .map(([casa, data]) => ({
        casa,
        lucro: data.lucro,
        count: data.count,
        roi: data.stake > 0 ? (data.lucro / data.stake) * 100 : 0
      }))
      .sort((a, b) => b.lucro - a.lucro);
  }, [metricas]);

  const apostasFiltradas = useMemo(() => {
    return apostas.filter(a => {
      const matchesSearch = 
        a.evento.toLowerCase().includes(searchTerm.toLowerCase()) ||
        a.esporte.toLowerCase().includes(searchTerm.toLowerCase()) ||
        a.selecao.toLowerCase().includes(searchTerm.toLowerCase());
      const matchesResultado = resultadoFilter === "all" || a.resultado === resultadoFilter;
      return matchesSearch && matchesResultado;
    });
  }, [apostas, searchTerm, resultadoFilter]);

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat("pt-BR", {
      style: "currency",
      currency: "BRL",
    }).format(value);
  };

  const handleApostaUpdated = () => {
    fetchData();
    onDataChange?.();
  };

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="grid gap-4 md:grid-cols-4">
          {[1, 2, 3, 4].map(i => <Skeleton key={i} className="h-24" />)}
        </div>
        <Skeleton className="h-64" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Filtro de Tempo - Alinhado à direita */}
      <div className="flex justify-end">
        <StandardTimeFilter
          period={internalPeriod}
          onPeriodChange={setInternalPeriod}
          customDateRange={internalDateRange}
          onCustomDateRangeChange={setInternalDateRange}
        />
      </div>

      {/* Banner informativo */}
      <Card className="border-purple-500/20 bg-purple-500/5">
        <CardContent className="p-4">
          <div className="flex items-start gap-3">
            <Info className="h-5 w-5 text-purple-400 mt-0.5 shrink-0" />
            <div>
              <p className="text-sm text-purple-200">
                <strong>Visão especializada ValueBet:</strong> Esta aba exibe apenas apostas com estratégia ValueBet.
                As mesmas apostas também aparecem em <strong>Apostas Livres</strong> para visão global.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* KPIs */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Apostas ValueBet</CardTitle>
            <Target className="h-4 w-4 text-purple-400" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{metricas.total}</div>
            <p className="text-xs text-muted-foreground">
              {metricas.greens} G · {metricas.reds} R
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Volume</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatCurrency(metricas.totalStake)}</div>
            <p className="text-xs text-muted-foreground">Total apostado</p>
          </CardContent>
        </Card>

        <Card className={metricas.lucroTotal >= 0 ? "border-emerald-500/20" : "border-red-500/20"}>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Lucro/Prejuízo</CardTitle>
            <TrendingUp className={`h-4 w-4 ${metricas.lucroTotal >= 0 ? 'text-emerald-400' : 'text-red-400'}`} />
          </CardHeader>
          <CardContent>
            <div className={`text-2xl font-bold ${metricas.lucroTotal >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
              {formatCurrency(metricas.lucroTotal)}
            </div>
            <p className="text-xs text-muted-foreground">
              Taxa de acerto: {metricas.taxaAcerto.toFixed(1)}%
            </p>
          </CardContent>
        </Card>

        <Card className={metricas.roi >= 0 ? "border-emerald-500/20" : "border-red-500/20"}>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">ROI</CardTitle>
            <Percent className={`h-4 w-4 ${metricas.roi >= 0 ? 'text-emerald-400' : 'text-red-400'}`} />
          </CardHeader>
          <CardContent>
            <div className={`text-2xl font-bold ${metricas.roi >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
              {metricas.roi.toFixed(2)}%
            </div>
            <p className="text-xs text-muted-foreground">Retorno sobre investimento</p>
          </CardContent>
        </Card>
      </div>

      {/* Gráficos */}
      {metricas.total > 0 && (
        <div className="grid gap-4 md:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <BarChart3 className="h-4 w-4 text-purple-400" />
                Evolução do Lucro
              </CardTitle>
              <CardDescription>Lucro acumulado ao longo do tempo</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="h-[200px]">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={evolutionData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis dataKey="data" stroke="hsl(var(--muted-foreground))" fontSize={12} />
                    <YAxis stroke="hsl(var(--muted-foreground))" fontSize={12} tickFormatter={(v) => `R$${v}`} />
                    <Tooltip 
                      formatter={(value: number) => [formatCurrency(value), "Acumulado"]}
                      contentStyle={{ 
                        backgroundColor: 'hsl(var(--card))', 
                        border: '1px solid hsl(var(--border))',
                        borderRadius: '8px'
                      }}
                    />
                    <Line 
                      type="monotone" 
                      dataKey="acumulado" 
                      stroke="hsl(var(--primary))" 
                      strokeWidth={2}
                      dot={false}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Building2 className="h-4 w-4 text-purple-400" />
                Eficiência por Casa
              </CardTitle>
              <CardDescription>Lucro por bookmaker</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="h-[200px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={casaData} layout="vertical">
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis type="number" stroke="hsl(var(--muted-foreground))" fontSize={12} tickFormatter={(v) => `R$${v}`} />
                    <YAxis dataKey="casa" type="category" stroke="hsl(var(--muted-foreground))" fontSize={10} width={80} />
                    <Tooltip 
                      formatter={(value: number) => [formatCurrency(value), "Lucro"]}
                      contentStyle={{ 
                        backgroundColor: 'hsl(var(--card))', 
                        border: '1px solid hsl(var(--border))',
                        borderRadius: '8px'
                      }}
                    />
                    <Bar dataKey="lucro" radius={[0, 4, 4, 0]}>
                      {casaData.map((entry, index) => (
                        <Cell 
                          key={`cell-${index}`} 
                          fill={entry.lucro >= 0 ? "hsl(var(--chart-2))" : "hsl(var(--destructive))"} 
                        />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Filtros e listagem */}
      <Card>
        <CardHeader>
          <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
            <CardTitle className="text-base">Apostas ValueBet</CardTitle>
            <div className="flex flex-wrap gap-2 items-center">
              <div className="relative">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Buscar..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-9 w-[180px]"
                />
              </div>
              <Select value={resultadoFilter} onValueChange={setResultadoFilter}>
                <SelectTrigger className="w-[130px]">
                  <SelectValue placeholder="Resultado" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos</SelectItem>
                  <SelectItem value="GREEN">Green</SelectItem>
                  <SelectItem value="RED">Red</SelectItem>
                  <SelectItem value="MEIO_GREEN">½ Green</SelectItem>
                  <SelectItem value="MEIO_RED">½ Red</SelectItem>
                  <SelectItem value="VOID">Void</SelectItem>
                  <SelectItem value="PENDENTE">Pendente</SelectItem>
                </SelectContent>
              </Select>
              <div className="flex border rounded-md">
                <Button
                  variant={viewMode === "cards" ? "secondary" : "ghost"}
                  size="icon"
                  onClick={() => setViewMode("cards")}
                  className="rounded-r-none"
                >
                  <LayoutGrid className="h-4 w-4" />
                </Button>
                <Button
                  variant={viewMode === "list" ? "secondary" : "ghost"}
                  size="icon"
                  onClick={() => setViewMode("list")}
                  className="rounded-l-none"
                >
                  <List className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {apostasFiltradas.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <Target className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>Nenhuma aposta ValueBet encontrada</p>
              <p className="text-sm mt-1">Crie apostas com estratégia ValueBet para visualizá-las aqui</p>
            </div>
          ) : viewMode === "cards" ? (
            <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
              {apostasFiltradas.map((aposta) => (
                <Card 
                  key={aposta.id} 
                  className="cursor-pointer hover:border-purple-500/30 transition-colors"
                  onClick={() => {
                    setSelectedAposta(aposta);
                    setDialogOpen(true);
                  }}
                >
                  <CardContent className="p-4">
                    {/* Badges na linha acima - padrão unificado */}
                    <div className="flex items-center gap-1 mb-2">
                      <Badge variant="outline" className="text-[10px] px-1.5 py-0 border-purple-500/30 text-purple-400 flex items-center gap-0.5">
                        <TrendingUp className="h-2.5 w-2.5" />
                        VB
                      </Badge>
                      <div onClick={(e) => e.stopPropagation()}>
                        <ResultadoPill
                          apostaId={aposta.id}
                          bookmarkerId={aposta.bookmaker_id}
                          resultado={aposta.resultado}
                          status={aposta.status}
                          stake={aposta.stake}
                          odd={aposta.odd}
                          operationType="bookmaker"
                          onResultadoUpdated={handleApostaUpdated}
                          onEditClick={() => {
                            setSelectedAposta(aposta);
                            setDialogOpen(true);
                          }}
                        />
                      </div>
                    </div>
                    {/* Evento e Esporte */}
                    <div className="mb-2">
                      <p className="font-medium text-sm truncate uppercase">{aposta.evento}</p>
                      <p className="text-xs text-muted-foreground">{aposta.esporte}</p>
                    </div>
                    <div className="flex justify-between items-center text-sm">
                      <span className="text-muted-foreground">{aposta.selecao}</span>
                      <span className="font-medium">@{aposta.odd.toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between items-center mt-2 pt-2 border-t">
                      <span className="text-xs text-muted-foreground">
                        {format(new Date(aposta.data_aposta), "dd/MM/yy", { locale: ptBR })}
                      </span>
                      <div className="text-right">
                        <p className="text-xs text-muted-foreground">Stake: {formatCurrency(aposta.stake)}</p>
                        {aposta.lucro_prejuizo !== null && (
                          <p className={`text-sm font-medium ${aposta.lucro_prejuizo >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                            {formatCurrency(aposta.lucro_prejuizo)}
                          </p>
                        )}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : (
            <div className="space-y-2">
              {apostasFiltradas.map((aposta) => (
                <div
                  key={aposta.id}
                  className="flex items-center justify-between p-3 rounded-lg border hover:border-purple-500/30 cursor-pointer transition-colors"
                  onClick={() => {
                    setSelectedAposta(aposta);
                    setDialogOpen(true);
                  }}
                >
                  <div className="flex items-center gap-4 flex-1 min-w-0">
                    {/* Badges à esquerda - padrão unificado */}
                    <div className="flex items-center gap-1">
                      <Badge variant="outline" className="text-[10px] px-1.5 py-0 border-purple-500/30 text-purple-400 flex items-center gap-0.5">
                        <TrendingUp className="h-2.5 w-2.5" />
                        VB
                      </Badge>
                    </div>
                    <div className="text-xs text-muted-foreground w-16">
                      {format(new Date(aposta.data_aposta), "dd/MM/yy", { locale: ptBR })}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate uppercase">{aposta.evento}</p>
                      <p className="text-xs text-muted-foreground">{aposta.selecao}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm">@{aposta.odd.toFixed(2)}</p>
                      <p className="text-xs text-muted-foreground">{formatCurrency(aposta.stake)}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 ml-4" onClick={(e) => e.stopPropagation()}>
                    {aposta.lucro_prejuizo !== null && (
                      <span className={`text-sm font-medium ${aposta.lucro_prejuizo >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                        {formatCurrency(aposta.lucro_prejuizo)}
                      </span>
                    )}
                    <ResultadoPill
                      apostaId={aposta.id}
                      bookmarkerId={aposta.bookmaker_id}
                      resultado={aposta.resultado}
                      status={aposta.status}
                      stake={aposta.stake}
                      odd={aposta.odd}
                      operationType="bookmaker"
                      onResultadoUpdated={handleApostaUpdated}
                      onEditClick={() => {
                        setSelectedAposta(aposta);
                        setDialogOpen(true);
                      }}
                    />
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Dialog de Aposta */}
      {selectedAposta && (
        <ApostaDialog
          open={dialogOpen}
          onOpenChange={setDialogOpen}
          projetoId={projetoId}
          aposta={selectedAposta as any}
          onSuccess={handleApostaUpdated}
        />
      )}
    </div>
  );
}
