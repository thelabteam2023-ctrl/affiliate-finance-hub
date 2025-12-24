import { useState, useEffect, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Skeleton } from "@/components/ui/skeleton";
import { 
  Calculator, 
  Target, 
  TrendingUp, 
  TrendingDown,
  LayoutGrid,
  List,
  Plus,
  Building2,
  BarChart3,
  Info,
  LayoutDashboard,
  PanelLeft,
  LayoutList
} from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { SurebetDialog } from "./SurebetDialog";
import { SurebetCard, SurebetData, SurebetPerna } from "./SurebetCard";
import { 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip as RechartsTooltip, 
  ResponsiveContainer,
  LineChart,
  Line,
  Cell
} from "recharts";
import { StandardTimeFilter, StandardPeriodFilter, getDateRangeFromPeriod, DateRange as FilterDateRange } from "./StandardTimeFilter";
import { parsePernaFromJson, PernaArbitragem } from "@/types/apostasUnificada";
import { cn } from "@/lib/utils";

interface ProjetoSurebetTabProps {
  projetoId: string;
  onDataChange?: () => void;
  refreshTrigger?: number;
}

interface Surebet {
  id: string;
  data_operacao: string;
  evento: string;
  esporte: string;
  modelo: string;
  mercado?: string | null;
  stake_total: number;
  spread_calculado: number | null;
  roi_esperado: number | null;
  lucro_esperado: number | null;
  lucro_real: number | null;
  roi_real: number | null;
  status: string;
  resultado: string | null;
  observacoes: string | null;
  pernas?: SurebetPerna[];
}

interface Bookmaker {
  id: string;
  nome: string;
  saldo_atual: number;
  saldo_freebet?: number;
  parceiro?: {
    nome: string;
  };
  bookmakers_catalogo?: {
    logo_url: string | null;
  } | null;
}

type NavigationMode = "tabs" | "sidebar";
type NavTabValue = "visao-geral" | "operacoes" | "por-casa";

const NAV_STORAGE_KEY = "surebet-nav-mode";

const NAV_ITEMS = [
  { value: "visao-geral" as NavTabValue, label: "Visão Geral", icon: LayoutDashboard },
  { value: "operacoes" as NavTabValue, label: "Operações", icon: Target },
  { value: "por-casa" as NavTabValue, label: "Por Casa", icon: Building2 },
];

export function ProjetoSurebetTab({ projetoId, onDataChange, refreshTrigger }: ProjetoSurebetTabProps) {
  const [surebets, setSurebets] = useState<Surebet[]>([]);
  const [bookmakers, setBookmakers] = useState<Bookmaker[]>([]);
  const [loading, setLoading] = useState(true);
  const [viewMode, setViewMode] = useState<"cards" | "list">("cards");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [selectedSurebet, setSelectedSurebet] = useState<Surebet | null>(null);

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
      await Promise.all([fetchSurebets(), fetchBookmakers()]);
    } finally {
      setLoading(false);
    }
  };

  const fetchSurebets = async () => {
    try {
      // CORREÇÃO: Filtrar por ESTRATÉGIA, não por forma_registro
      // A estratégia define onde a aposta é contabilizada
      // O forma_registro define apenas COMO foi estruturada
      let query = supabase
        .from("apostas_unificada")
        .select("*")
        .eq("projeto_id", projetoId)
        .eq("estrategia", "SUREBET")
        .is("cancelled_at", null)
        .order("data_aposta", { ascending: false });
      
      if (dateRange) {
        query = query.gte("data_aposta", dateRange.start.toISOString());
        query = query.lte("data_aposta", dateRange.end.toISOString());
      }

      const { data: arbitragensData, error } = await query;

      if (error) throw error;
      
      if (arbitragensData && arbitragensData.length > 0) {
        const surebetsFormatadas: Surebet[] = arbitragensData.map(arb => {
          const pernas = parsePernaFromJson(arb.pernas);
          
          const pernasOrdenadas = [...pernas].sort((a, b) => {
            const order: Record<string, number> = { 
              "Casa": 1, "1": 1,
              "Empate": 2, "X": 2,
              "Fora": 3, "2": 3
            };
            return (order[a.selecao] || 99) - (order[b.selecao] || 99);
          });

          const pernasSurebetCard: SurebetPerna[] = pernasOrdenadas.map((p, idx) => ({
            id: `perna-${idx}`,
            selecao: p.selecao,
            odd: p.odd,
            stake: p.stake,
            resultado: p.resultado,
            bookmaker_nome: p.bookmaker_nome || "—"
          }));

          return {
            id: arb.id,
            data_operacao: arb.data_aposta,
            evento: arb.evento || "",
            esporte: arb.esporte || "",
            modelo: arb.modelo || "1-2",
            mercado: arb.mercado,
            stake_total: arb.stake_total || 0,
            spread_calculado: arb.spread_calculado,
            roi_esperado: arb.roi_esperado,
            lucro_esperado: arb.lucro_esperado,
            lucro_real: arb.lucro_prejuizo,
            roi_real: arb.roi_real,
            status: arb.status,
            resultado: arb.resultado,
            observacoes: arb.observacoes,
            pernas: pernasSurebetCard
          };
        });
        
        setSurebets(surebetsFormatadas);
      } else {
        setSurebets([]);
      }
    } catch (error: any) {
      console.error("Erro ao carregar arbitragens:", error.message);
    }
  };

  const fetchBookmakers = async () => {
    try {
      const { data, error } = await supabase
        .from("bookmakers")
        .select(`
          id,
          nome,
          saldo_atual,
          saldo_freebet,
          parceiro:parceiros (nome),
          bookmakers_catalogo (logo_url)
        `)
        .eq("projeto_id", projetoId)
        .in("status", ["ativo", "ATIVO", "LIMITADA", "limitada"]);

      if (error) throw error;
      setBookmakers(data || []);
    } catch (error: any) {
      console.error("Erro ao carregar bookmakers:", error.message);
    }
  };

  const handleDataChange = () => {
    fetchSurebets();
    onDataChange?.();
  };

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat("pt-BR", {
      style: "currency",
      currency: "BRL",
    }).format(value);
  };

  const formatPercent = (value: number | null) => {
    if (value === null) return "-";
    return `${value >= 0 ? "+" : ""}${value.toFixed(2)}%`;
  };

  // KPIs calculados
  const kpis = useMemo(() => {
    const total = surebets.length;
    const pendentes = surebets.filter(s => s.status === "PENDENTE").length;
    const liquidadas = surebets.filter(s => s.status === "LIQUIDADA").length;
    const greens = surebets.filter(s => s.resultado === "GREEN").length;
    const reds = surebets.filter(s => s.resultado === "RED").length;
    const lucroTotal = surebets.reduce((acc, s) => acc + (s.lucro_real || 0), 0);
    const stakeTotal = surebets.reduce((acc, s) => acc + s.stake_total, 0);
    const roi = stakeTotal > 0 ? (lucroTotal / stakeTotal) * 100 : 0;
    
    return { total, pendentes, liquidadas, greens, reds, lucroTotal, stakeTotal, roi };
  }, [surebets]);

  // Dados para gráfico de eficiência por casa
  const eficienciaPorCasa = useMemo(() => {
    const casaMap = new Map<string, { lucro: number; volume: number; operacoes: number }>();
    
    surebets.forEach(surebet => {
      surebet.pernas?.forEach(perna => {
        const casa = perna.bookmaker_nome;
        const existing = casaMap.get(casa) || { lucro: 0, volume: 0, operacoes: 0 };
        const lucroPerna = (surebet.lucro_real || 0) / (surebet.pernas?.length || 1);
        casaMap.set(casa, {
          lucro: existing.lucro + lucroPerna,
          volume: existing.volume + perna.stake,
          operacoes: existing.operacoes + 1
        });
      });
    });

    return Array.from(casaMap.entries())
      .map(([casa, data]) => ({
        casa,
        lucro: data.lucro,
        volume: data.volume,
        operacoes: data.operacoes,
        roi: data.volume > 0 ? (data.lucro / data.volume) * 100 : 0
      }))
      .sort((a, b) => b.lucro - a.lucro)
      .slice(0, 10);
  }, [surebets]);

  // Dados para gráfico de evolução de lucro
  const evolucaoLucro = useMemo(() => {
    const surebetsOrdenadas = [...surebets]
      .filter(s => s.status === "LIQUIDADA")
      .sort((a, b) => new Date(a.data_operacao).getTime() - new Date(b.data_operacao).getTime());

    let lucroAcumulado = 0;
    const dataMap = new Map<string, { lucro: number; operacoes: number }>();

    surebetsOrdenadas.forEach(s => {
      const dateKey = format(new Date(s.data_operacao), "dd/MM", { locale: ptBR });
      lucroAcumulado += s.lucro_real || 0;
      
      const existing = dataMap.get(dateKey) || { lucro: 0, operacoes: 0 };
      dataMap.set(dateKey, {
        lucro: lucroAcumulado,
        operacoes: existing.operacoes + 1
      });
    });

    return Array.from(dataMap.entries()).map(([data, valores]) => ({
      data,
      lucro: valores.lucro,
      operacoes: valores.operacoes
    }));
  }, [surebets]);

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
      {/* KPIs */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Surebets</CardTitle>
            <Target className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{kpis.total}</div>
            <div className="flex flex-wrap gap-x-2 gap-y-1 text-xs">
              <span className="text-blue-400">{kpis.pendentes} Pendentes</span>
              <span className="text-emerald-500">{kpis.greens} G</span>
              <span className="text-red-500">{kpis.reds} R</span>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Volume</CardTitle>
            <Calculator className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatCurrency(kpis.stakeTotal)}</div>
            <p className="text-xs text-muted-foreground">Total investido</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">
              {kpis.lucroTotal >= 0 ? "Lucro" : "Prejuízo"}
            </CardTitle>
            {kpis.lucroTotal >= 0 ? (
              <TrendingUp className="h-4 w-4 text-emerald-500" />
            ) : (
              <TrendingDown className="h-4 w-4 text-red-500" />
            )}
          </CardHeader>
          <CardContent>
            <div className={`text-2xl font-bold ${kpis.lucroTotal >= 0 ? 'text-emerald-500' : 'text-red-500'}`}>
              {formatCurrency(Math.abs(kpis.lucroTotal))}
            </div>
            <p className="text-xs text-muted-foreground">Resultado liquidado</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">ROI</CardTitle>
            <Target className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className={`text-2xl font-bold ${kpis.roi >= 0 ? 'text-emerald-500' : 'text-red-500'}`}>
              {formatPercent(kpis.roi)}
            </div>
            <p className="text-xs text-muted-foreground">Retorno sobre investimento</p>
          </CardContent>
        </Card>
      </div>

      {/* Gráficos */}
      {surebets.length > 0 && (
        <div className="grid gap-4 md:grid-cols-2">
          <Card>
            <CardHeader className="pb-2">
              <div className="flex items-center gap-2">
                <BarChart3 className="h-4 w-4 text-muted-foreground" />
                <CardTitle className="text-sm font-medium">Evolução do Lucro</CardTitle>
              </div>
            </CardHeader>
            <CardContent>
              {evolucaoLucro.length > 0 ? (
                <ResponsiveContainer width="100%" height={200}>
                  <LineChart data={evolucaoLucro}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                    <XAxis dataKey="data" tick={{ fontSize: 10 }} className="text-muted-foreground" />
                    <YAxis tick={{ fontSize: 10 }} tickFormatter={(value) => `R$${value}`} className="text-muted-foreground" />
                    <RechartsTooltip
                      contentStyle={{ backgroundColor: 'hsl(var(--popover))', borderColor: 'hsl(var(--border))', borderRadius: '6px' }}
                      formatter={(value: number) => [formatCurrency(value), 'Lucro Acumulado']}
                    />
                    <Line type="monotone" dataKey="lucro" stroke="hsl(var(--primary))" strokeWidth={2} dot={{ fill: 'hsl(var(--primary))', strokeWidth: 0, r: 3 }} />
                  </LineChart>
                </ResponsiveContainer>
              ) : (
                <div className="flex items-center justify-center h-[200px] text-sm text-muted-foreground">
                  Nenhuma surebet liquidada no período
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <div className="flex items-center gap-2">
                <Building2 className="h-4 w-4 text-muted-foreground" />
                <CardTitle className="text-sm font-medium">Eficiência por Casa</CardTitle>
              </div>
            </CardHeader>
            <CardContent>
              {eficienciaPorCasa.length > 0 ? (
                <ResponsiveContainer width="100%" height={200}>
                  <BarChart data={eficienciaPorCasa} layout="vertical">
                    <CartesianGrid strokeDasharray="3 3" className="stroke-border" horizontal={false} />
                    <XAxis type="number" tick={{ fontSize: 10 }} tickFormatter={(value) => `R$${value}`} className="text-muted-foreground" />
                    <YAxis type="category" dataKey="casa" tick={{ fontSize: 10 }} width={80} className="text-muted-foreground" />
                    <RechartsTooltip
                      contentStyle={{ backgroundColor: 'hsl(var(--popover))', borderColor: 'hsl(var(--border))', borderRadius: '6px' }}
                      formatter={(value: number, name: string) => {
                        if (name === 'lucro') return [formatCurrency(value), 'Lucro'];
                        return [value, name];
                      }}
                    />
                    <Bar dataKey="lucro" radius={[0, 4, 4, 0]}>
                      {eficienciaPorCasa.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.lucro >= 0 ? 'hsl(142, 76%, 36%)' : 'hsl(0, 84%, 60%)'} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <div className="flex items-center justify-center h-[200px] text-sm text-muted-foreground">
                  Nenhuma surebet com pernas registradas
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {/* Banner Info */}
      <Card className="border-blue-500/30 bg-blue-500/5">
        <CardContent className="py-3">
          <div className="flex items-start gap-2">
            <Info className="h-4 w-4 text-blue-400 mt-0.5 shrink-0" />
            <p className="text-xs text-muted-foreground">
              <span className="font-medium text-blue-400">Visão Especializada:</span> Esta aba exibe apenas operações de Surebet. 
              As apostas individuais de cada surebet também aparecem na aba "Apostas Livres".
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );

  // Render Operações
  const renderOperacoes = () => (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold flex items-center gap-2">
          <Target className="h-5 w-5 text-primary" />
          Operações de Surebet
          <Badge variant="secondary">{surebets.length}</Badge>
        </h3>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="icon"
            className="h-9 w-9"
            onClick={() => setViewMode(viewMode === "cards" ? "list" : "cards")}
          >
            {viewMode === "cards" ? <List className="h-4 w-4" /> : <LayoutGrid className="h-4 w-4" />}
          </Button>
          <Button 
            size="sm" 
            className="h-9"
            onClick={() => {
              setSelectedSurebet(null);
              setDialogOpen(true);
            }}
          >
            <Plus className="mr-1 h-4 w-4" />
            Nova Arbitragem
          </Button>
        </div>
      </div>

      {surebets.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12 text-center">
            <Calculator className="h-12 w-12 text-muted-foreground mb-4" />
            <h3 className="text-lg font-semibold">Nenhuma Surebet registrada</h3>
            <p className="text-sm text-muted-foreground mt-1">
              Clique em "Nova Arbitragem" para criar uma operação de arbitragem ou extração de bônus.
            </p>
          </CardContent>
        </Card>
      ) : (
        <ScrollArea className="h-[calc(100vh-400px)]">
          <div className={viewMode === "cards" ? "grid gap-4 md:grid-cols-2 lg:grid-cols-3" : "space-y-2"}>
            {surebets.map((surebet) => (
              <SurebetCard
                key={surebet.id}
                surebet={surebet}
                onEdit={(sb) => {
                  setSelectedSurebet(sb as Surebet);
                  setDialogOpen(true);
                }}
              />
            ))}
          </div>
        </ScrollArea>
      )}
    </div>
  );

  // Render Por Casa
  const renderPorCasa = () => (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Building2 className="h-5 w-5 text-primary" />
        <h3 className="text-lg font-semibold">Análise por Casa</h3>
        <Badge variant="secondary">{eficienciaPorCasa.length} casas</Badge>
      </div>

      {eficienciaPorCasa.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12 text-center">
            <Building2 className="h-12 w-12 text-muted-foreground mb-4" />
            <h3 className="text-lg font-semibold">Nenhuma casa registrada</h3>
            <p className="text-sm text-muted-foreground mt-1">
              Registre operações para ver a análise por casa.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {eficienciaPorCasa.map((casa) => (
            <Card key={casa.casa} className={casa.lucro >= 0 ? "border-emerald-500/20" : "border-red-500/20"}>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">{casa.casa}</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Operações</span>
                    <span className="font-medium">{casa.operacoes}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Volume</span>
                    <span className="font-medium">{formatCurrency(casa.volume)}</span>
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
        {activeNavTab === "operacoes" && renderOperacoes()}
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
        <Skeleton className="h-96" />
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

        <SurebetDialog
          open={dialogOpen}
          onOpenChange={(open) => {
            setDialogOpen(open);
            if (!open) setSelectedSurebet(null);
          }}
          projetoId={projetoId}
          bookmakers={bookmakers}
          surebet={selectedSurebet}
          onSuccess={handleDataChange}
        />
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

      <SurebetDialog
        open={dialogOpen}
        onOpenChange={(open) => {
          setDialogOpen(open);
          if (!open) setSelectedSurebet(null);
        }}
        projetoId={projetoId}
        bookmakers={bookmakers}
        surebet={selectedSurebet}
        onSuccess={handleDataChange}
      />
    </div>
  );
}
