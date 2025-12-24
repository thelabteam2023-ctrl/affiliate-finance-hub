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
  Zap,
  LayoutDashboard,
  PanelLeft,
  LayoutList
} from "lucide-react";
import { format, startOfDay, endOfDay, subDays, startOfMonth, startOfYear } from "date-fns";
import { ptBR } from "date-fns/locale";
import { ApostaDialog } from "./ApostaDialog";
import { SurebetDialog } from "./SurebetDialog";
import { ApostaPernasResumo, ApostaPernasInline, getModeloOperacao, Perna } from "./ApostaPernasResumo";
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

interface ProjetoDuploGreenTabProps {
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
  pernas?: any[];
  stake_total?: number;
  spread_calculado?: number;
  roi_esperado?: number;
  roi_real?: number;
  lucro_esperado?: number;
  modelo?: string;
}

interface Bookmaker {
  id: string;
  nome: string;
  saldo_atual: number;
  saldo_freebet?: number;
  parceiro_id?: string;
  bookmaker_catalogo_id?: string;
  parceiro?: { nome: string } | null;
  bookmakers_catalogo?: { logo_url: string | null } | null;
}

type NavigationMode = "tabs" | "sidebar";
type NavTabValue = "visao-geral" | "apostas" | "por-casa";

const NAV_STORAGE_KEY = "duplogreen-nav-mode";

const NAV_ITEMS = [
  { value: "visao-geral" as NavTabValue, label: "Visão Geral", icon: LayoutDashboard },
  { value: "apostas" as NavTabValue, label: "Apostas", icon: Target },
  { value: "por-casa" as NavTabValue, label: "Por Casa", icon: Building2 },
];

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

export function ProjetoDuploGreenTab({ projetoId, onDataChange, refreshTrigger }: ProjetoDuploGreenTabProps) {
  const [apostas, setApostas] = useState<Aposta[]>([]);
  const [bookmakers, setBookmakers] = useState<Bookmaker[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [resultadoFilter, setResultadoFilter] = useState<string>("all");
  const [viewMode, setViewMode] = useState<"cards" | "list">("cards");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [surebetDialogOpen, setSurebetDialogOpen] = useState(false);
  const [selectedAposta, setSelectedAposta] = useState<Aposta | null>(null);
  const [selectedSurebet, setSelectedSurebet] = useState<any>(null);

  const [navMode, setNavMode] = useState<NavigationMode>(() => {
    const saved = localStorage.getItem(NAV_STORAGE_KEY);
    return (saved === "tabs" ? "tabs" : "sidebar") as NavigationMode;
  });
  const [activeNavTab, setActiveNavTab] = useState<NavTabValue>("visao-geral");
  const [isTransitioning, setIsTransitioning] = useState(false);

  const [internalPeriod, setInternalPeriod] = useState<StandardPeriodFilter>("30dias");
  const [internalDateRange, setInternalDateRange] = useState<FilterDateRange | undefined>(undefined);

  const dateRange = useMemo(() => getDateRangeFromPeriod(internalPeriod, internalDateRange), [internalPeriod, internalDateRange]);

  useEffect(() => { localStorage.setItem(NAV_STORAGE_KEY, navMode); }, [navMode]);

  useEffect(() => { fetchData(); }, [projetoId, internalPeriod, internalDateRange, refreshTrigger]);

  const fetchData = async () => {
    try {
      setLoading(true);
      await Promise.all([fetchApostas(), fetchBookmakers()]);
    } finally {
      setLoading(false);
    }
  };

  const fetchBookmakers = async () => {
    try {
      const { data, error } = await supabase
        .from("bookmakers")
        .select(`id, nome, saldo_atual, saldo_freebet, parceiro_id, bookmaker_catalogo_id, parceiro:parceiros (nome), bookmakers_catalogo (logo_url)`)
        .eq("projeto_id", projetoId);
      if (error) throw error;
      setBookmakers(data || []);
    } catch (error) {
      console.error("Erro ao carregar bookmakers:", error);
    }
  };

  const fetchApostas = async () => {
    try {
      let query = supabase
        .from("apostas_unificada")
        .select(`id, data_aposta, esporte, evento, mercado, selecao, odd, stake, estrategia, status, resultado, lucro_prejuizo, valor_retorno, observacoes, bookmaker_id, modo_entrada, gerou_freebet, valor_freebet_gerada, tipo_freebet, forma_registro, contexto_operacional, lay_exchange, lay_odd, lay_stake, lay_liability, lay_comissao, back_em_exchange, back_comissao, pernas, stake_total, spread_calculado, roi_esperado, roi_real, lucro_esperado, modelo`)
        .eq("projeto_id", projetoId)
        .eq("estrategia", APOSTA_ESTRATEGIA.DUPLO_GREEN)
        .is("cancelled_at", null)
        .order("data_aposta", { ascending: false });
      
      if (dateRange) {
        query = query.gte("data_aposta", dateRange.start.toISOString());
        query = query.lte("data_aposta", dateRange.end.toISOString());
      }

      const { data, error } = await query;
      if (error) throw error;
      
      const bookmakerIds = [...new Set((data || []).map((a: any) => a.bookmaker_id).filter(Boolean))];
      let bookmakerMap = new Map<string, string>();
      if (bookmakerIds.length > 0) {
        const { data: bks } = await supabase.from("bookmakers").select("id, nome").in("id", bookmakerIds);
        bookmakerMap = new Map((bks || []).map((b: any) => [b.id, b.nome]));
      }
      
      setApostas((data || []).map((a: any) => ({ ...a, bookmaker_nome: a.bookmaker_id ? (bookmakerMap.get(a.bookmaker_id) || "Desconhecida") : "Desconhecida" })));
    } catch (error) {
      console.error("Erro ao carregar apostas Duplo Green:", error);
    }
  };

  const metricas = useMemo(() => {
    const total = apostas.length;

    // CORREÇÃO: para apostas multi-pernas (ARBITRAGEM), o volume fica em stake_total.
    // A estratégia define a contabilização; a forma_registro define apenas a estrutura.
    const getStakeVolume = (a: Aposta) => {
      const value =
        typeof a.stake_total === "number" ? a.stake_total : typeof a.stake === "number" ? a.stake : 0;
      return Number.isFinite(value) ? value : 0;
    };

    const totalStake = apostas.reduce((acc, a) => acc + getStakeVolume(a), 0);
    const lucroTotal = apostas.reduce((acc, a) => acc + (a.lucro_prejuizo || 0), 0);
    const greens = apostas.filter((a) => a.resultado === "GREEN" || a.resultado === "MEIO_GREEN").length;
    const reds = apostas.filter((a) => a.resultado === "RED" || a.resultado === "MEIO_RED").length;
    const liquidadas = apostas.filter((a) => a.resultado && a.resultado !== "PENDENTE").length;
    const taxaAcerto = liquidadas > 0 ? (greens / liquidadas) * 100 : 0;
    const roi = totalStake > 0 ? (lucroTotal / totalStake) * 100 : 0;

    const porCasa: Record<string, { stake: number; lucro: number; count: number }> = {};
    apostas.forEach((a) => {
      const casa = a.bookmaker_nome || "Desconhecida";
      if (!porCasa[casa]) porCasa[casa] = { stake: 0, lucro: 0, count: 0 };
      porCasa[casa].stake += getStakeVolume(a);
      porCasa[casa].lucro += a.lucro_prejuizo || 0;
      porCasa[casa].count++;
    });

    return { total, totalStake, lucroTotal, greens, reds, taxaAcerto, roi, porCasa };
  }, [apostas]);

  const evolutionData = useMemo(() => {
    const sorted = [...apostas].sort((a, b) => new Date(a.data_aposta).getTime() - new Date(b.data_aposta).getTime());
    let acumulado = 0;
    return sorted.map(a => {
      acumulado += a.lucro_prejuizo || 0;
      return { data: format(new Date(a.data_aposta), "dd/MM", { locale: ptBR }), acumulado };
    });
  }, [apostas]);

  const casaData = useMemo(() => {
    return Object.entries(metricas.porCasa).map(([casa, data]) => ({
      casa, lucro: data.lucro, count: data.count, stake: data.stake,
      roi: data.stake > 0 ? (data.lucro / data.stake) * 100 : 0
    })).sort((a, b) => b.lucro - a.lucro);
  }, [metricas]);

  const apostasFiltradas = useMemo(() => apostas.filter(a => {
    const matchesSearch = a.evento.toLowerCase().includes(searchTerm.toLowerCase()) || a.esporte.toLowerCase().includes(searchTerm.toLowerCase()) || a.selecao.toLowerCase().includes(searchTerm.toLowerCase());
    return matchesSearch && (resultadoFilter === "all" || a.resultado === resultadoFilter);
  }), [apostas, searchTerm, resultadoFilter]);

  const formatCurrency = (v: number) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v);
  const formatPercent = (v: number) => `${v >= 0 ? "+" : ""}${v.toFixed(2)}%`;
  const handleApostaUpdated = () => { fetchData(); onDataChange?.(); };
  const handleOpenAposta = (aposta: Aposta) => {
    if (aposta.forma_registro === "ARBITRAGEM") {
      setSelectedSurebet({ id: aposta.id, evento: aposta.evento, esporte: aposta.esporte, modelo: aposta.modelo || "SUREBET", stake_total: aposta.stake_total || aposta.stake || 0, spread_calculado: aposta.spread_calculado || 0, roi_esperado: aposta.roi_esperado || 0, roi_real: aposta.roi_real || 0, lucro_esperado: aposta.lucro_esperado || 0, lucro_real: aposta.lucro_prejuizo || 0, status: aposta.status, resultado: aposta.resultado, data_operacao: aposta.data_aposta, observacoes: aposta.observacoes, pernas: aposta.pernas || [] });
      setSurebetDialogOpen(true);
    } else {
      setSelectedAposta(aposta);
      setDialogOpen(true);
    }
  };
  const handleModeToggle = () => { setIsTransitioning(true); setTimeout(() => { setNavMode(p => p === "tabs" ? "sidebar" : "tabs"); setTimeout(() => setIsTransitioning(false), 50); }, 150); };
  const handleNavTabChange = (v: string) => { if (v !== activeNavTab) { setIsTransitioning(true); setActiveNavTab(v as NavTabValue); setTimeout(() => setIsTransitioning(false), 180); } };

  const modeToggle = (
    <Tooltip><TooltipTrigger asChild><Button variant="ghost" size="sm" onClick={handleModeToggle} className="h-8 w-8 p-0 text-muted-foreground/60 hover:text-foreground hover:bg-muted/50 transition-colors">{navMode === "tabs" ? <PanelLeft className="h-4 w-4" /> : <LayoutList className="h-4 w-4" />}</Button></TooltipTrigger><TooltipContent side="bottom" className="text-xs">{navMode === "tabs" ? "Modo Gestão" : "Modo Compacto"}</TooltipContent></Tooltip>
  );
  const periodFilterComponent = <StandardTimeFilter period={internalPeriod} onPeriodChange={setInternalPeriod} customDateRange={internalDateRange} onCustomDateRangeChange={setInternalDateRange} />;

  const renderVisaoGeral = () => (
    <div className="space-y-6">
      <Card className="border-lime-500/20 bg-lime-500/5"><CardContent className="p-4"><div className="flex items-start gap-3"><Info className="h-5 w-5 text-lime-400 mt-0.5 shrink-0" /><p className="text-sm text-lime-200"><strong>Visão especializada Duplo Green:</strong> Estratégia coordenada para obter múltiplos greens. As mesmas apostas também aparecem em <strong>Apostas Livres</strong>.</p></div></CardContent></Card>
      <div className="grid gap-4 md:grid-cols-4">
        <Card><CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2"><CardTitle className="text-sm font-medium">Apostas DG</CardTitle><Zap className="h-4 w-4 text-lime-400" /></CardHeader><CardContent><div className="text-2xl font-bold">{metricas.total}</div><p className="text-xs text-muted-foreground">{metricas.greens} G · {metricas.reds} R</p></CardContent></Card>
        <Card><CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2"><CardTitle className="text-sm font-medium">Volume</CardTitle><DollarSign className="h-4 w-4 text-muted-foreground" /></CardHeader><CardContent><div className="text-2xl font-bold">{formatCurrency(metricas.totalStake)}</div><p className="text-xs text-muted-foreground">Total apostado</p></CardContent></Card>
        <Card className={metricas.lucroTotal >= 0 ? "border-emerald-500/20" : "border-red-500/20"}><CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2"><CardTitle className="text-sm font-medium">Lucro/Prejuízo</CardTitle><TrendingUp className={`h-4 w-4 ${metricas.lucroTotal >= 0 ? 'text-emerald-400' : 'text-red-400'}`} /></CardHeader><CardContent><div className={`text-2xl font-bold ${metricas.lucroTotal >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>{formatCurrency(metricas.lucroTotal)}</div><p className="text-xs text-muted-foreground">Taxa: {metricas.taxaAcerto.toFixed(1)}%</p></CardContent></Card>
        <Card className={metricas.roi >= 0 ? "border-emerald-500/20" : "border-red-500/20"}><CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2"><CardTitle className="text-sm font-medium">ROI</CardTitle><Percent className={`h-4 w-4 ${metricas.roi >= 0 ? 'text-emerald-400' : 'text-red-400'}`} /></CardHeader><CardContent><div className={`text-2xl font-bold ${metricas.roi >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>{formatPercent(metricas.roi)}</div><p className="text-xs text-muted-foreground">Retorno sobre investimento</p></CardContent></Card>
      </div>
      {metricas.total > 0 && (
        <div className="grid gap-4 md:grid-cols-2">
          <Card><CardHeader><CardTitle className="text-base flex items-center gap-2"><BarChart3 className="h-4 w-4 text-lime-400" />Evolução do Lucro</CardTitle></CardHeader><CardContent><div className="h-[200px]"><ResponsiveContainer width="100%" height="100%"><LineChart data={evolutionData}><CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" /><XAxis dataKey="data" stroke="hsl(var(--muted-foreground))" fontSize={12} /><YAxis stroke="hsl(var(--muted-foreground))" fontSize={12} tickFormatter={(v) => `R$${v}`} /><RechartsTooltip formatter={(v: number) => [formatCurrency(v), "Acumulado"]} contentStyle={{ backgroundColor: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: '8px' }} /><Line type="monotone" dataKey="acumulado" stroke="#84cc16" strokeWidth={2} dot={false} /></LineChart></ResponsiveContainer></div></CardContent></Card>
          <Card><CardHeader><CardTitle className="text-base flex items-center gap-2"><Building2 className="h-4 w-4 text-lime-400" />Eficiência por Casa</CardTitle></CardHeader><CardContent><div className="h-[200px]"><ResponsiveContainer width="100%" height="100%"><BarChart data={casaData} layout="vertical"><CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" /><XAxis type="number" stroke="hsl(var(--muted-foreground))" fontSize={12} tickFormatter={(v) => `R$${v}`} /><YAxis dataKey="casa" type="category" stroke="hsl(var(--muted-foreground))" fontSize={10} width={80} /><RechartsTooltip formatter={(v: number) => [formatCurrency(v), "Lucro"]} contentStyle={{ backgroundColor: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: '8px' }} /><Bar dataKey="lucro" radius={[0, 4, 4, 0]}>{casaData.map((e, i) => <Cell key={`cell-${i}`} fill={e.lucro >= 0 ? "#84cc16" : "hsl(var(--destructive))"} />)}</Bar></BarChart></ResponsiveContainer></div></CardContent></Card>
        </div>
      )}
    </div>
  );

  const renderApostas = () => (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
        <h3 className="text-lg font-semibold flex items-center gap-2"><Zap className="h-5 w-5 text-lime-400" />Apostas Duplo Green<Badge variant="secondary">{apostasFiltradas.length}</Badge></h3>
        <div className="flex flex-wrap gap-2 items-center">
          <div className="relative"><Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" /><Input placeholder="Buscar..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="pl-9 w-[180px]" /></div>
          <Select value={resultadoFilter} onValueChange={setResultadoFilter}><SelectTrigger className="w-[130px]"><SelectValue placeholder="Resultado" /></SelectTrigger><SelectContent><SelectItem value="all">Todos</SelectItem><SelectItem value="GREEN" className="hover:bg-emerald-500/20 hover:text-emerald-500 focus:bg-emerald-500/20 focus:text-emerald-500">Green</SelectItem><SelectItem value="RED" className="hover:bg-red-500/20 hover:text-red-500 focus:bg-red-500/20 focus:text-red-500">Red</SelectItem><SelectItem value="MEIO_GREEN" className="hover:bg-teal-500/20 hover:text-teal-500 focus:bg-teal-500/20 focus:text-teal-500">½ Green</SelectItem><SelectItem value="MEIO_RED" className="hover:bg-orange-500/20 hover:text-orange-500 focus:bg-orange-500/20 focus:text-orange-500">½ Red</SelectItem><SelectItem value="VOID" className="hover:bg-slate-500/20 hover:text-slate-400 focus:bg-slate-500/20 focus:text-slate-400">Void</SelectItem><SelectItem value="PENDENTE" className="hover:bg-muted hover:text-foreground focus:bg-muted focus:text-foreground">Pendente</SelectItem></SelectContent></Select>
          <div className="flex border rounded-md"><Button variant={viewMode === "cards" ? "secondary" : "ghost"} size="icon" onClick={() => setViewMode("cards")} className="rounded-r-none"><LayoutGrid className="h-4 w-4" /></Button><Button variant={viewMode === "list" ? "secondary" : "ghost"} size="icon" onClick={() => setViewMode("list")} className="rounded-l-none"><List className="h-4 w-4" /></Button></div>
        </div>
      </div>
      {apostasFiltradas.length === 0 ? (
        <Card><CardContent className="text-center py-8 text-muted-foreground"><Zap className="h-12 w-12 mx-auto mb-4 opacity-50" /><p>Nenhuma aposta Duplo Green encontrada</p></CardContent></Card>
      ) : viewMode === "cards" ? (
        <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
          {apostasFiltradas.map((aposta) => (
            <Card key={aposta.id} className="cursor-pointer hover:border-lime-500/30 transition-colors" onClick={() => handleOpenAposta(aposta)}>
              <CardContent className="p-4">
                <div className="flex items-center gap-1 mb-2"><Badge variant="outline" className="text-[10px] px-1.5 py-0 border-lime-500/30 text-lime-400 flex items-center gap-0.5"><Zap className="h-2.5 w-2.5" />DG</Badge>{aposta.pernas && aposta.pernas.length > 1 && <Badge variant="outline" className="text-[10px] px-1.5 py-0 border-amber-500/30 text-amber-400">{getModeloOperacao(aposta.pernas as Perna[])}</Badge>}<ResultadoBadge resultado={aposta.resultado} /></div>
                <div className="mb-2"><p className="font-medium text-sm truncate uppercase">{aposta.evento}</p><p className="text-xs text-muted-foreground">{aposta.esporte}</p></div>
                {aposta.pernas && aposta.pernas.length > 1 ? <ApostaPernasResumo pernas={aposta.pernas as Perna[]} variant="card" showStake showResultado className="mb-2" /> : <div className="flex justify-between items-center text-sm mb-2"><span className="text-muted-foreground">{aposta.selecao}</span><span className="font-medium">@{(aposta.odd ?? 0).toFixed(2)}</span></div>}
                <div className="flex justify-between items-center pt-2 border-t"><span className="text-xs text-muted-foreground">{format(new Date(aposta.data_aposta), "dd/MM/yy", { locale: ptBR })}</span><div className="text-right"><p className="text-xs text-muted-foreground">Stake: {formatCurrency(aposta.pernas && aposta.pernas.length > 1 ? (aposta.stake_total ?? aposta.stake) : aposta.stake)}</p>{aposta.lucro_prejuizo !== null && <p className={`text-sm font-medium ${aposta.lucro_prejuizo >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>{formatCurrency(aposta.lucro_prejuizo)}</p>}</div></div>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        <div className="space-y-2">
          {apostasFiltradas.map((aposta) => (
            <div key={aposta.id} className="flex items-center justify-between p-3 rounded-lg border hover:border-lime-500/30 cursor-pointer transition-colors" onClick={() => handleOpenAposta(aposta)}>
              <div className="flex items-center gap-4 flex-1 min-w-0">
                <div className="flex items-center gap-1"><Badge variant="outline" className="text-[10px] px-1.5 py-0 border-lime-500/30 text-lime-400 flex items-center gap-0.5"><Zap className="h-2.5 w-2.5" />DG</Badge>{aposta.pernas && aposta.pernas.length > 1 && <Badge variant="outline" className="text-[10px] px-1.5 py-0 border-amber-500/30 text-amber-400">{getModeloOperacao(aposta.pernas as Perna[])}</Badge>}<ResultadoBadge resultado={aposta.resultado} /></div>
                <div className="text-xs text-muted-foreground w-16">{format(new Date(aposta.data_aposta), "dd/MM/yy", { locale: ptBR })}</div>
                <div className="flex-1 min-w-0"><p className="text-sm font-medium truncate uppercase">{aposta.evento}</p>{aposta.pernas && aposta.pernas.length > 1 ? <ApostaPernasInline pernas={aposta.pernas as Perna[]} className="truncate" /> : <p className="text-xs text-muted-foreground">{aposta.selecao}</p>}</div>
                <div className="text-right">{aposta.pernas && aposta.pernas.length > 1 ? <p className="text-xs text-muted-foreground">{formatCurrency(aposta.stake_total ?? aposta.stake)}</p> : <><p className="text-sm">@{(aposta.odd ?? 0).toFixed(2)}</p><p className="text-xs text-muted-foreground">{formatCurrency(aposta.stake)}</p></>}</div>
              </div>
              <div className="flex items-center gap-3 ml-4">{aposta.lucro_prejuizo !== null && <span className={`text-sm font-medium ${aposta.lucro_prejuizo >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>{formatCurrency(aposta.lucro_prejuizo)}</span>}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );

  const renderPorCasa = () => (
    <div className="space-y-4">
      <div className="flex items-center gap-2"><Building2 className="h-5 w-5 text-lime-400" /><h3 className="text-lg font-semibold">Análise por Casa</h3><Badge variant="secondary">{casaData.length} casas</Badge></div>
      {casaData.length === 0 ? <Card><CardContent className="flex flex-col items-center justify-center py-12 text-center"><Building2 className="h-12 w-12 text-muted-foreground mb-4" /><h3 className="text-lg font-semibold">Nenhuma casa registrada</h3></CardContent></Card> : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {casaData.map((casa) => (
            <Card key={casa.casa} className={casa.lucro >= 0 ? "border-emerald-500/20" : "border-red-500/20"}><CardHeader className="pb-2"><CardTitle className="text-sm font-medium">{casa.casa}</CardTitle></CardHeader><CardContent><div className="space-y-2"><div className="flex justify-between text-sm"><span className="text-muted-foreground">Apostas</span><span className="font-medium">{casa.count}</span></div><div className="flex justify-between text-sm"><span className="text-muted-foreground">Volume</span><span className="font-medium">{formatCurrency(casa.stake)}</span></div><div className="flex justify-between text-sm"><span className="text-muted-foreground">Lucro</span><span className={`font-medium ${casa.lucro >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>{formatCurrency(casa.lucro)}</span></div><div className="flex justify-between text-sm"><span className="text-muted-foreground">ROI</span><span className={`font-medium ${casa.roi >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>{formatPercent(casa.roi)}</span></div></div></CardContent></Card>
          ))}
        </div>
      )}
    </div>
  );

  const renderMainContent = () => {
    const contentClass = cn("transition-all duration-200 ease-out", isTransitioning ? "opacity-0 translate-y-2" : "opacity-100 translate-y-0");
    return <div className={cn("min-h-[400px]", contentClass)}>{activeNavTab === "visao-geral" && renderVisaoGeral()}{activeNavTab === "apostas" && renderApostas()}{activeNavTab === "por-casa" && renderPorCasa()}</div>;
  };

  if (loading) return <div className="space-y-4"><div className="grid gap-4 md:grid-cols-4">{[1, 2, 3, 4].map(i => <Skeleton key={i} className="h-24" />)}</div><Skeleton className="h-64" /></div>;

  if (navMode === "tabs") {
    return (
      <div className="space-y-6">
        <Tabs value={activeNavTab} onValueChange={handleNavTabChange} className="space-y-6">
          <div className="flex items-center justify-between border-b border-border/50">
            <TabsList className="bg-transparent border-0 rounded-none p-0 h-auto gap-6">{NAV_ITEMS.map((item) => <TabsTrigger key={item.value} value={item.value} className="bg-transparent border-0 rounded-none px-1 pb-3 pt-1 h-auto shadow-none data-[state=active]:bg-transparent data-[state=active]:shadow-none text-muted-foreground/70 data-[state=active]:text-foreground transition-colors"><item.icon className="h-4 w-4 mr-2 opacity-60" />{item.label}</TabsTrigger>)}</TabsList>
            <div className="flex items-center gap-4">{periodFilterComponent}{modeToggle}</div>
          </div>
          <TabsContent value={activeNavTab} className="mt-0">{renderMainContent()}</TabsContent>
        </Tabs>
        {selectedAposta && <ApostaDialog open={dialogOpen} onOpenChange={(o) => { setDialogOpen(o); if (!o) setSelectedAposta(null); }} projetoId={projetoId} aposta={selectedAposta as any} onSuccess={handleApostaUpdated} defaultEstrategia={APOSTA_ESTRATEGIA.DUPLO_GREEN} activeTab="duplogreen" />}
        <SurebetDialog open={surebetDialogOpen} onOpenChange={(o) => { setSurebetDialogOpen(o); if (!o) setSelectedSurebet(null); }} projetoId={projetoId} bookmakers={bookmakers} surebet={selectedSurebet} onSuccess={handleApostaUpdated} activeTab="duplogreen" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-end">{periodFilterComponent}</div>
      <div className="flex gap-6">
        <div className="w-52 shrink-0 space-y-6"><div><div className="flex items-center justify-between mb-4"><span className="text-xs font-medium text-muted-foreground/60 uppercase tracking-wider">Navegação</span>{modeToggle}</div><nav className="space-y-1">{NAV_ITEMS.map((item) => { const isActive = activeNavTab === item.value; return <button key={item.value} onClick={() => handleNavTabChange(item.value)} className={cn("w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-200", isActive ? "bg-accent/10 text-foreground shadow-sm" : "text-muted-foreground/70 hover:text-foreground hover:bg-muted/50")}><item.icon className={cn("h-4 w-4 transition-colors", isActive ? "text-accent" : "opacity-60")} /><span className="flex-1 text-left">{item.label}</span></button>; })}</nav></div></div>
        <div className="flex-1 min-w-0">{renderMainContent()}</div>
      </div>
      {selectedAposta && <ApostaDialog open={dialogOpen} onOpenChange={(o) => { setDialogOpen(o); if (!o) setSelectedAposta(null); }} projetoId={projetoId} aposta={selectedAposta as any} onSuccess={handleApostaUpdated} defaultEstrategia={APOSTA_ESTRATEGIA.DUPLO_GREEN} activeTab="duplogreen" />}
      <SurebetDialog open={surebetDialogOpen} onOpenChange={(o) => { setSurebetDialogOpen(o); if (!o) setSelectedSurebet(null); }} projetoId={projetoId} bookmakers={bookmakers} surebet={selectedSurebet} onSuccess={handleApostaUpdated} activeTab="duplogreen" />
    </div>
  );
}
