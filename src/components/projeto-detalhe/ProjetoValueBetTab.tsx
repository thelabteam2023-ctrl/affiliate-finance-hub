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
import { ApostaMultiplaDialog } from "./ApostaMultiplaDialog";
import { DateRange } from "react-day-picker";
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

type PeriodFilter = "hoje" | "ontem" | "7dias" | "mes" | "ano" | "todo" | "custom";

interface ProjetoValueBetTabProps {
  projetoId: string;
  onDataChange?: () => void;
  periodFilter?: PeriodFilter;
  dateRange?: DateRange;
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
  bookmaker?: {
    nome: string;
    parceiro?: { nome: string };
    bookmakers_catalogo?: { logo_url: string | null } | null;
  };
}

interface ApostaMultipla {
  id: string;
  data_aposta: string;
  stake: number;
  odd_final: number;
  resultado: string | null;
  lucro_prejuizo: number | null;
  valor_retorno: number | null;
  retorno_potencial: number | null;
  estrategia: string | null;
  bookmaker_id: string;
  tipo_multipla: string;
  status: string;
  tipo_freebet: string | null;
  gerou_freebet: boolean;
  valor_freebet_gerada: number | null;
  observacoes: string | null;
  selecoes: { descricao: string; odd: string; resultado?: string }[];
  bookmaker?: {
    nome: string;
    parceiro?: { nome: string };
    bookmakers_catalogo?: { logo_url: string | null } | null;
  };
}

// Badge simples para resultado
function ResultadoBadge({ resultado }: { resultado: string | null }) {
  const getColor = (r: string | null) => {
    switch (r) {
      case "GREEN": return "bg-emerald-500/20 text-emerald-400 border-emerald-500/30";
      case "RED": return "bg-red-500/20 text-red-400 border-red-500/30";
      case "MEIO_GREEN": return "bg-teal-500/20 text-teal-400 border-teal-500/30";
      case "MEIO_RED": return "bg-orange-500/20 text-orange-400 border-orange-500/30";
      case "VOID": return "bg-gray-500/20 text-gray-400 border-gray-500/30";
      default: return "bg-blue-500/20 text-blue-400 border-blue-500/30";
    }
  };
  
  const getLabel = (r: string | null) => {
    switch (r) {
      case "GREEN": return "Green";
      case "RED": return "Red";
      case "MEIO_GREEN": return "½ Green";
      case "MEIO_RED": return "½ Red";
      case "VOID": return "Void";
      default: return "Pendente";
    }
  };

  return <Badge className={getColor(resultado)}>{getLabel(resultado)}</Badge>;
}

export function ProjetoValueBetTab({ 
  projetoId, 
  onDataChange, 
  periodFilter = "todo", 
  dateRange 
}: ProjetoValueBetTabProps) {
  const [apostas, setApostas] = useState<Aposta[]>([]);
  const [apostasMultiplas, setApostasMultiplas] = useState<ApostaMultipla[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [resultadoFilter, setResultadoFilter] = useState<string>("all");
  const [viewMode, setViewMode] = useState<"cards" | "list">("cards");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [dialogMultiplaOpen, setDialogMultiplaOpen] = useState(false);
  const [selectedAposta, setSelectedAposta] = useState<Aposta | null>(null);
  const [selectedApostaMultipla, setSelectedApostaMultipla] = useState<ApostaMultipla | null>(null);

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
    fetchData();
  }, [projetoId, periodFilter, dateRange]);

  const fetchData = async () => {
    try {
      setLoading(true);
      await Promise.all([fetchApostas(), fetchApostasMultiplas()]);
    } finally {
      setLoading(false);
    }
  };

  const fetchApostas = async () => {
    try {
      const { start, end } = getDateRangeFromFilter();
      
      let query = supabase
        .from("apostas")
        .select(`
          id,
          data_aposta,
          esporte,
          evento,
          mercado,
          selecao,
          odd,
          stake,
          estrategia,
          status,
          resultado,
          lucro_prejuizo,
          bookmaker_id,
          bookmaker:bookmakers (
            nome,
            parceiro:parceiros (nome),
            bookmakers_catalogo (logo_url)
          )
        `)
        .eq("projeto_id", projetoId)
        .eq("estrategia", APOSTA_ESTRATEGIA.VALUEBET)
        .order("data_aposta", { ascending: false });
      
      if (start) query = query.gte("data_aposta", start.toISOString());
      if (end) query = query.lte("data_aposta", end.toISOString());

      const { data, error } = await query;
      if (error) throw error;
      setApostas((data || []) as Aposta[]);
    } catch (error: any) {
      console.error("Erro ao carregar apostas ValueBet:", error.message);
    }
  };

  const fetchApostasMultiplas = async () => {
    try {
      const { start, end } = getDateRangeFromFilter();
      
      const { data, error } = await supabase
        .from("apostas_multiplas")
        .select("*")
        .eq("projeto_id", projetoId)
        .eq("estrategia", APOSTA_ESTRATEGIA.VALUEBET)
        .order("data_aposta", { ascending: false });
      if (error) throw error;
      setApostasMultiplas((data || []).map((am: any) => ({
        ...am,
        selecoes: Array.isArray(am.selecoes) ? am.selecoes : []
      })) as ApostaMultipla[]);
    } catch (error: any) {
      console.error("Erro ao carregar múltiplas ValueBet:", error.message);
    }
  };

  // Métricas consolidadas
  const metricas = useMemo(() => {
    const todasApostas = [
      ...apostas.map(a => ({ stake: a.stake, lucro: a.lucro_prejuizo, resultado: a.resultado, bookmaker: a.bookmaker?.nome })),
      ...apostasMultiplas.map(am => ({ stake: am.stake, lucro: am.lucro_prejuizo, resultado: am.resultado, bookmaker: am.bookmaker?.nome }))
    ];

    const total = todasApostas.length;
    const totalStake = todasApostas.reduce((acc, a) => acc + a.stake, 0);
    const lucroTotal = todasApostas.reduce((acc, a) => acc + (a.lucro || 0), 0);
    const greens = todasApostas.filter(a => a.resultado === "GREEN" || a.resultado === "MEIO_GREEN").length;
    const reds = todasApostas.filter(a => a.resultado === "RED" || a.resultado === "MEIO_RED").length;
    const liquidadas = todasApostas.filter(a => a.resultado && a.resultado !== "PENDENTE").length;
    const taxaAcerto = liquidadas > 0 ? (greens / liquidadas) * 100 : 0;
    const roi = totalStake > 0 ? (lucroTotal / totalStake) * 100 : 0;

    // Por casa
    const porCasa: Record<string, { stake: number; lucro: number; count: number }> = {};
    todasApostas.forEach(a => {
      const casa = a.bookmaker || "Desconhecida";
      if (!porCasa[casa]) porCasa[casa] = { stake: 0, lucro: 0, count: 0 };
      porCasa[casa].stake += a.stake;
      porCasa[casa].lucro += a.lucro || 0;
      porCasa[casa].count++;
    });

    return { total, totalStake, lucroTotal, greens, reds, taxaAcerto, roi, porCasa };
  }, [apostas, apostasMultiplas]);

  // Dados para gráfico de evolução
  const evolutionData = useMemo(() => {
    const todas = [
      ...apostas.map(a => ({ data: a.data_aposta, lucro: a.lucro_prejuizo || 0 })),
      ...apostasMultiplas.map(am => ({ data: am.data_aposta, lucro: am.lucro_prejuizo || 0 }))
    ].sort((a, b) => new Date(a.data).getTime() - new Date(b.data).getTime());

    let acumulado = 0;
    return todas.map(a => {
      acumulado += a.lucro;
      return {
        data: format(new Date(a.data), "dd/MM", { locale: ptBR }),
        lucro: a.lucro,
        acumulado
      };
    });
  }, [apostas, apostasMultiplas]);

  // Dados para gráfico por casa
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

  // Filtrar apostas para listagem
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

  const multiplasFiltradas = useMemo(() => {
    return apostasMultiplas.filter(am => {
      const matchesSearch = am.selecoes.some(s => 
        s.descricao.toLowerCase().includes(searchTerm.toLowerCase())
      );
      const matchesResultado = resultadoFilter === "all" || am.resultado === resultadoFilter;
      return (searchTerm === "" || matchesSearch) && matchesResultado;
    });
  }, [apostasMultiplas, searchTerm, resultadoFilter]);

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
          {/* Evolução do Lucro */}
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

          {/* Eficiência por Casa */}
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
                      formatter={(value: number, name: string) => [formatCurrency(value), "Lucro"]}
                      contentStyle={{ 
                        backgroundColor: 'hsl(var(--card))', 
                        border: '1px solid hsl(var(--border))',
                        borderRadius: '8px'
                      }}
                    />
                    <Bar dataKey="lucro" radius={[0, 4, 4, 0]}>
                      {casaData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.lucro >= 0 ? 'hsl(var(--chart-2))' : 'hsl(var(--destructive))'} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Filtros */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Buscar evento, esporte..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-10"
          />
        </div>
        <Select value={resultadoFilter} onValueChange={setResultadoFilter}>
          <SelectTrigger className="w-[150px]">
            <SelectValue placeholder="Resultado" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos</SelectItem>
            <SelectItem value="PENDENTE">Pendente</SelectItem>
            <SelectItem value="GREEN">Green</SelectItem>
            <SelectItem value="RED">Red</SelectItem>
            <SelectItem value="MEIO_GREEN">Meio Green</SelectItem>
            <SelectItem value="MEIO_RED">Meio Red</SelectItem>
            <SelectItem value="VOID">Void</SelectItem>
          </SelectContent>
        </Select>
        <div className="flex gap-1">
          <Button
            variant={viewMode === "cards" ? "default" : "outline"}
            size="icon"
            onClick={() => setViewMode("cards")}
          >
            <LayoutGrid className="h-4 w-4" />
          </Button>
          <Button
            variant={viewMode === "list" ? "default" : "outline"}
            size="icon"
            onClick={() => setViewMode("list")}
          >
            <List className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Lista de Apostas */}
      {metricas.total === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <Target className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
            <p className="text-muted-foreground">
              Nenhuma aposta ValueBet encontrada no período.
            </p>
            <p className="text-sm text-muted-foreground mt-2">
              Crie apostas com estratégia "ValueBet" para visualizá-las aqui.
            </p>
          </CardContent>
        </Card>
      ) : viewMode === "cards" ? (
        <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
          {apostasFiltradas.map(aposta => (
            <Card 
              key={aposta.id} 
              className="cursor-pointer hover:border-primary/50 transition-colors"
              onClick={() => {
                setSelectedAposta(aposta as any);
                setDialogOpen(true);
              }}
            >
              <CardContent className="p-4">
                <div className="flex items-start justify-between mb-2">
                  <Badge variant="outline" className="text-purple-400 border-purple-400/30">
                    ValueBet
                  </Badge>
                  <ResultadoBadge resultado={aposta.resultado} />
                </div>
                <p className="font-medium truncate">{aposta.evento}</p>
                <p className="text-sm text-muted-foreground truncate">{aposta.selecao}</p>
                <div className="flex items-center justify-between mt-2 text-sm">
                  <span>Odd: {aposta.odd.toFixed(2)}</span>
                  <span className={aposta.lucro_prejuizo && aposta.lucro_prejuizo >= 0 ? 'text-emerald-400' : 'text-red-400'}>
                    {formatCurrency(aposta.lucro_prejuizo || 0)}
                  </span>
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  {format(new Date(aposta.data_aposta), "dd/MM/yyyy HH:mm", { locale: ptBR })}
                </p>
              </CardContent>
            </Card>
          ))}
          {multiplasFiltradas.map(am => (
            <Card 
              key={am.id} 
              className="cursor-pointer hover:border-primary/50 transition-colors"
              onClick={() => {
                setSelectedApostaMultipla(am as any);
                setDialogMultiplaOpen(true);
              }}
            >
              <CardContent className="p-4">
                <div className="flex items-start justify-between mb-2">
                  <div className="flex gap-1">
                    <Badge variant="outline" className="text-purple-400 border-purple-400/30">
                      ValueBet
                    </Badge>
                    <Badge variant="secondary">Múltipla</Badge>
                  </div>
                  <ResultadoBadge resultado={am.resultado} />
                </div>
                <p className="font-medium truncate">{am.selecoes[0]?.descricao || "Múltipla"}</p>
                {am.selecoes.length > 1 && (
                  <p className="text-sm text-muted-foreground">+{am.selecoes.length - 1} seleções</p>
                )}
                <div className="flex items-center justify-between mt-2 text-sm">
                  <span>Odd: {am.odd_final.toFixed(2)}</span>
                  <span className={am.lucro_prejuizo && am.lucro_prejuizo >= 0 ? 'text-emerald-400' : 'text-red-400'}>
                    {formatCurrency(am.lucro_prejuizo || 0)}
                  </span>
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  {format(new Date(am.data_aposta), "dd/MM/yyyy HH:mm", { locale: ptBR })}
                </p>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        <Card>
          <CardContent className="p-0">
            <div className="divide-y divide-border">
              {apostasFiltradas.map(aposta => (
                <div 
                  key={aposta.id}
                  className="flex items-center gap-4 p-4 hover:bg-muted/50 cursor-pointer transition-colors"
                  onClick={() => {
                    setSelectedAposta(aposta as any);
                    setDialogOpen(true);
                  }}
                >
                  <ResultadoBadge resultado={aposta.resultado} />
                  <div className="flex-1 min-w-0">
                    <p className="font-medium truncate">{aposta.evento}</p>
                    <p className="text-sm text-muted-foreground">{aposta.selecao}</p>
                  </div>
                  <div className="text-right">
                    <p className={`font-medium ${aposta.lucro_prejuizo && aposta.lucro_prejuizo >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                      {formatCurrency(aposta.lucro_prejuizo || 0)}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {format(new Date(aposta.data_aposta), "dd/MM", { locale: ptBR })}
                    </p>
                  </div>
                </div>
              ))}
              {multiplasFiltradas.map(am => (
                <div 
                  key={am.id}
                  className="flex items-center gap-4 p-4 hover:bg-muted/50 cursor-pointer transition-colors"
                  onClick={() => {
                    setSelectedApostaMultipla(am as any);
                    setDialogMultiplaOpen(true);
                  }}
                >
                  <ResultadoBadge resultado={am.resultado} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="font-medium truncate">{am.selecoes[0]?.descricao || "Múltipla"}</p>
                      <Badge variant="secondary" className="text-xs">Múltipla</Badge>
                    </div>
                    <p className="text-sm text-muted-foreground">{am.selecoes.length} seleções</p>
                  </div>
                  <div className="text-right">
                    <p className={`font-medium ${am.lucro_prejuizo && am.lucro_prejuizo >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                      {formatCurrency(am.lucro_prejuizo || 0)}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {format(new Date(am.data_aposta), "dd/MM", { locale: ptBR })}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Dialogs */}
      <ApostaDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        aposta={selectedAposta}
        projetoId={projetoId}
        onSuccess={handleApostaUpdated}
      />

      <ApostaMultiplaDialog
        open={dialogMultiplaOpen}
        onOpenChange={setDialogMultiplaOpen}
        aposta={selectedApostaMultipla}
        projetoId={projetoId}
        onSuccess={handleApostaUpdated}
      />
    </div>
  );
}