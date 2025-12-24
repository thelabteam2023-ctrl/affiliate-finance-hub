import { useState, useEffect, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
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
  List,
  LayoutDashboard,
  PanelLeft,
  LayoutList
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
  Tooltip as RechartsTooltip,
  BarChart,
  Bar,
  Cell,
} from "recharts";
import { StandardTimeFilter, StandardPeriodFilter, getDateRangeFromPeriod, DateRange as FilterDateRange } from "./StandardTimeFilter";
import { cn } from "@/lib/utils";

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

type NavigationMode = "tabs" | "sidebar";
type NavTabValue = "visao-geral" | "apostas" | "por-casa";

const NAV_STORAGE_KEY = "valuebet-nav-mode";

const NAV_ITEMS = [
  { value: "visao-geral" as NavTabValue, label: "Visão Geral", icon: LayoutDashboard },
  { value: "apostas" as NavTabValue, label: "Apostas", icon: Target },
  { value: "por-casa" as NavTabValue, label: "Por Casa", icon: Building2 },
];

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

  // Navigation mode
  const [navMode, setNavMode] = useState<NavigationMode>(() => {
    const saved = localStorage.getItem(NAV_STORAGE_KEY);
    return (saved === "tabs" ? "tabs" : "sidebar") as NavigationMode;
  });
  const [activeNavTab, setActiveNavTab] = useState<NavTabValue>("visao-geral");
  const [isTransitioning, setIsTransitioning] = useState(false);

  // Filtro de tempo interno
  const [internalPeriod, setInternalPeriod] = useState<StandardPeriodFilter>("30dias");
  const [internalDateRange, setInternalDateRange] = useState<FilterDateRange | undefined>(undefined);

  const dateRange = useMemo(() => getDateRangeFromPeriod(internalPeriod, internalDateRange), [internalPeriod, internalDateRange]);

  // Save nav mode preference
  useEffect(() => {
    localStorage.setItem(NAV_STORAGE_KEY, navMode);
  }, [navMode]);

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
        stake: data.stake,
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

  const formatPercent = (value: number) => {
    return `${value >= 0 ? "+" : ""}${value.toFixed(2)}%`;
  };

  const handleApostaUpdated = () => {
    fetchData();
    onDataChange?.();
  };

  // Navigation handlers
  const handleModeToggle = () => {
    setIsTransitioning(true);
    setTimeout(() => {
      setNavMode(prev => prev === "tabs" ? "sidebar" : "tabs");
      setTimeout(() => setIsTransitioning(false), 50);
    }, 150);
  };

  const handleNavTabChange = (value: string) => {
    if (value !== activeNavTab) {
      setIsTransitioning(true);
      setActiveNavTab(value as NavTabValue);
      setTimeout(() => setIsTransitioning(false), 180);
    }
  };

  // Mode toggle button
  const modeToggle = (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          onClick={handleModeToggle}
          className="h-8 w-8 p-0 text-muted-foreground/60 hover:text-foreground hover:bg-muted/50 transition-colors"
        >
          {navMode === "tabs" ? (
            <PanelLeft className="h-4 w-4" />
          ) : (
            <LayoutList className="h-4 w-4" />
          )}
        </Button>
      </TooltipTrigger>
      <TooltipContent side="bottom" className="text-xs">
        {navMode === "tabs" ? "Modo Gestão" : "Modo Compacto"}
      </TooltipContent>
    </Tooltip>
  );

  // Period filter component
  const periodFilterComponent = (
    <StandardTimeFilter
      period={internalPeriod}
      onPeriodChange={setInternalPeriod}
      customDateRange={internalDateRange}
      onCustomDateRangeChange={setInternalDateRange}
    />
  );

  // Render Visão Geral
  const renderVisaoGeral = () => (
    <div className="space-y-6">
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
              {formatPercent(metricas.roi)}
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
                    <RechartsTooltip 
                      formatter={(value: number) => [formatCurrency(value), "Acumulado"]}
                      contentStyle={{ backgroundColor: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: '8px' }}
                    />
                    <Line type="monotone" dataKey="acumulado" stroke="hsl(var(--primary))" strokeWidth={2} dot={false} />
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
                    <RechartsTooltip 
                      formatter={(value: number) => [formatCurrency(value), "Lucro"]}
                      contentStyle={{ backgroundColor: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: '8px' }}
                    />
                    <Bar dataKey="lucro" radius={[0, 4, 4, 0]}>
                      {casaData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.lucro >= 0 ? "hsl(var(--chart-2))" : "hsl(var(--destructive))"} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );

  // Render Apostas
  const renderApostas = () => (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
        <h3 className="text-lg font-semibold flex items-center gap-2">
          <Target className="h-5 w-5 text-purple-400" />
          Apostas ValueBet
          <Badge variant="secondary">{apostasFiltradas.length}</Badge>
        </h3>
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
              <SelectItem value="GREEN" className="hover:bg-emerald-500/20 hover:text-emerald-500 focus:bg-emerald-500/20 focus:text-emerald-500">Green</SelectItem>
              <SelectItem value="RED" className="hover:bg-red-500/20 hover:text-red-500 focus:bg-red-500/20 focus:text-red-500">Red</SelectItem>
              <SelectItem value="MEIO_GREEN" className="hover:bg-teal-500/20 hover:text-teal-500 focus:bg-teal-500/20 focus:text-teal-500">½ Green</SelectItem>
              <SelectItem value="MEIO_RED" className="hover:bg-orange-500/20 hover:text-orange-500 focus:bg-orange-500/20 focus:text-orange-500">½ Red</SelectItem>
              <SelectItem value="VOID" className="hover:bg-slate-500/20 hover:text-slate-400 focus:bg-slate-500/20 focus:text-slate-400">Void</SelectItem>
              <SelectItem value="PENDENTE" className="hover:bg-muted hover:text-foreground focus:bg-muted focus:text-foreground">Pendente</SelectItem>
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

      {apostasFiltradas.length === 0 ? (
        <Card>
          <CardContent className="text-center py-8 text-muted-foreground">
            <Target className="h-12 w-12 mx-auto mb-4 opacity-50" />
            <p>Nenhuma aposta ValueBet encontrada</p>
            <p className="text-sm mt-1">Crie apostas com estratégia ValueBet para visualizá-las aqui</p>
          </CardContent>
        </Card>
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
    </div>
  );

  // Render Por Casa
  const renderPorCasa = () => (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Building2 className="h-5 w-5 text-purple-400" />
        <h3 className="text-lg font-semibold">Análise por Casa</h3>
        <Badge variant="secondary">{casaData.length} casas</Badge>
      </div>

      {casaData.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12 text-center">
            <Building2 className="h-12 w-12 text-muted-foreground mb-4" />
            <h3 className="text-lg font-semibold">Nenhuma casa registrada</h3>
            <p className="text-sm text-muted-foreground mt-1">
              Registre apostas para ver a análise por casa.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {casaData.map((casa) => (
            <Card key={casa.casa} className={casa.lucro >= 0 ? "border-emerald-500/20" : "border-red-500/20"}>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">{casa.casa}</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Apostas</span>
                    <span className="font-medium">{casa.count}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Volume</span>
                    <span className="font-medium">{formatCurrency(casa.stake)}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Lucro</span>
                    <span className={`font-medium ${casa.lucro >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                      {formatCurrency(casa.lucro)}
                    </span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">ROI</span>
                    <span className={`font-medium ${casa.roi >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                      {formatPercent(casa.roi)}
                    </span>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );

  // Main content renderer
  const renderMainContent = () => {
    const contentClass = cn(
      "transition-all duration-200 ease-out",
      isTransitioning ? "opacity-0 translate-y-2" : "opacity-100 translate-y-0"
    );

    return (
      <div className={cn("min-h-[400px]", contentClass)}>
        {activeNavTab === "visao-geral" && renderVisaoGeral()}
        {activeNavTab === "apostas" && renderApostas()}
        {activeNavTab === "por-casa" && renderPorCasa()}
      </div>
    );
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

  // Mode: Tabs
  if (navMode === "tabs") {
    return (
      <div className="space-y-6">
        <Tabs value={activeNavTab} onValueChange={handleNavTabChange} className="space-y-6">
          <div className="flex items-center justify-between border-b border-border/50">
            <TabsList className="bg-transparent border-0 rounded-none p-0 h-auto gap-6">
              {NAV_ITEMS.map((item) => (
                <TabsTrigger
                  key={item.value}
                  value={item.value}
                  className="bg-transparent border-0 rounded-none px-1 pb-3 pt-1 h-auto shadow-none data-[state=active]:bg-transparent data-[state=active]:shadow-none text-muted-foreground/70 data-[state=active]:text-foreground transition-colors"
                >
                  <item.icon className="h-4 w-4 mr-2 opacity-60" />
                  {item.label}
                </TabsTrigger>
              ))}
            </TabsList>
            <div className="flex items-center gap-4">
              {periodFilterComponent}
              {modeToggle}
            </div>
          </div>

          <TabsContent value={activeNavTab} className="mt-0">
            {renderMainContent()}
          </TabsContent>
        </Tabs>

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

  // Mode: Sidebar
  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        {periodFilterComponent}
      </div>
      
      <div className="flex gap-6">
        <div className="w-52 shrink-0 space-y-6">
          <div>
            <div className="flex items-center justify-between mb-4">
              <span className="text-xs font-medium text-muted-foreground/60 uppercase tracking-wider">
                Navegação
              </span>
              {modeToggle}
            </div>
            <nav className="space-y-1">
              {NAV_ITEMS.map((item) => {
                const isActive = activeNavTab === item.value;
                return (
                  <button
                    key={item.value}
                    onClick={() => handleNavTabChange(item.value)}
                    className={cn(
                      "w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-200",
                      isActive
                        ? "bg-accent/10 text-foreground shadow-sm"
                        : "text-muted-foreground/70 hover:text-foreground hover:bg-muted/50"
                    )}
                  >
                    <item.icon className={cn("h-4 w-4 transition-colors", isActive ? "text-accent" : "opacity-60")} />
                    <span className="flex-1 text-left">{item.label}</span>
                  </button>
                );
              })}
            </nav>
          </div>
        </div>

        <div className="flex-1 min-w-0">
          {renderMainContent()}
        </div>
      </div>

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
