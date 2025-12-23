import { useState, useEffect, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { 
  Gift, Search, Building2, Target, CheckCircle2, Clock, 
  TrendingUp, Percent, LayoutGrid, List, Minimize2, BarChart3,
  LayoutDashboard, History, PanelLeft, LayoutList
} from "lucide-react";
import { startOfDay, endOfDay, subDays, startOfMonth, startOfYear } from "date-fns";
import { useFreebetViewPreferences, FreebetSubTab } from "@/hooks/useFreebetViewPreferences";
import { cn } from "@/lib/utils";
import { 
  FreebetApostaCard, 
  FreebetApostasList, 
  FreebetResumoPorCasa,
  FreebetGraficos,
  ApostaOperacionalFreebet,
  FreebetRecebida,
  BookmakerComFreebet,
  BookmakerFreebetStats
} from "./freebets";
import { ApostaDialog } from "@/components/projeto-detalhe/ApostaDialog";
import { ApostaMultiplaDialog } from "@/components/projeto-detalhe/ApostaMultiplaDialog";

interface ProjetoFreebetsTabProps {
  projetoId: string;
  periodFilter?: string;
  customDateRange?: { start: Date; end: Date } | null;
  onDataChange?: () => void;
  refreshTrigger?: number;
}

type NavigationMode = "tabs" | "sidebar";
type NavTabValue = "visao-geral" | "apostas" | "por-casa";
type InternalPeriodFilter = "7dias" | "30dias" | "90dias" | "ano" | "tudo";

const NAV_STORAGE_KEY = "freebets-nav-mode";

const NAV_ITEMS = [
  { value: "visao-geral" as NavTabValue, label: "Visão Geral", icon: LayoutDashboard },
  { value: "apostas" as NavTabValue, label: "Apostas", icon: Target },
  { value: "por-casa" as NavTabValue, label: "Por Casa", icon: Building2 },
];

const PERIOD_OPTIONS: { value: InternalPeriodFilter; label: string }[] = [
  { value: "7dias", label: "7 dias" },
  { value: "30dias", label: "30 dias" },
  { value: "90dias", label: "90 dias" },
  { value: "ano", label: "Ano" },
  { value: "tudo", label: "Todo Tempo" },
];

export function ProjetoFreebetsTab({ projetoId, periodFilter = "tudo", customDateRange, onDataChange, refreshTrigger }: ProjetoFreebetsTabProps) {
  const [loading, setLoading] = useState(true);
  const [freebets, setFreebets] = useState<FreebetRecebida[]>([]);
  const [bookmakersComFreebet, setBookmakersComFreebet] = useState<BookmakerComFreebet[]>([]);
  const [apostasOperacionais, setApostasOperacionais] = useState<ApostaOperacionalFreebet[]>([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [casaFilter, setCasaFilter] = useState<string>("todas");
  
  // Internal period filter (local to this tab)
  const [internalPeriod, setInternalPeriod] = useState<InternalPeriodFilter>("30dias");
  
  // Navigation mode (sidebar vs tabs)
  const [navMode, setNavMode] = useState<NavigationMode>(() => {
    const saved = localStorage.getItem(NAV_STORAGE_KEY);
    return (saved === "tabs" ? "tabs" : "sidebar") as NavigationMode;
  });
  const [activeNavTab, setActiveNavTab] = useState<NavTabValue>("visao-geral");
  const [isTransitioning, setIsTransitioning] = useState(false);
  
  // Dialog states
  const [dialogOpen, setDialogOpen] = useState(false);
  const [dialogMultiplaOpen, setDialogMultiplaOpen] = useState(false);
  const [selectedAposta, setSelectedAposta] = useState<any>(null);
  const [selectedApostaMultipla, setSelectedApostaMultipla] = useState<any>(null);
  const [bookmakers, setBookmakers] = useState<any[]>([]);

  // Preferências de visualização (persistidas)
  const { 
    viewMode, setViewMode, 
    compactMode, toggleCompactMode,
    subTab, setSubTab 
  } = useFreebetViewPreferences();

  // Save nav mode preference
  useEffect(() => {
    localStorage.setItem(NAV_STORAGE_KEY, navMode);
  }, [navMode]);

  // Calcular range de datas baseado no filtro interno
  const dateRange = useMemo(() => {
    const now = new Date();
    const today = startOfDay(now);
    
    switch (internalPeriod) {
      case "7dias":
        return { start: subDays(today, 7), end: endOfDay(now) };
      case "30dias":
        return { start: subDays(today, 30), end: endOfDay(now) };
      case "90dias":
        return { start: subDays(today, 90), end: endOfDay(now) };
      case "ano":
        return { start: startOfYear(now), end: endOfDay(now) };
      case "tudo":
      default:
        return null;
    }
  }, [internalPeriod]);

  useEffect(() => {
    fetchData();
  }, [projetoId, refreshTrigger]);

  const fetchData = async () => {
    try {
      setLoading(true);
      await Promise.all([
        fetchFreebets(), 
        fetchBookmakersComFreebet(), 
        fetchApostasOperacionais(),
        fetchBookmakers()
      ]);
    } finally {
      setLoading(false);
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

  const fetchFreebets = async () => {
    try {
      const { data, error } = await supabase
        .from("freebets_recebidas")
        .select(`
          id, bookmaker_id, valor, motivo, data_recebida, utilizada, 
          data_utilizacao, aposta_id, status,
          bookmakers!freebets_recebidas_bookmaker_id_fkey (
            nome, parceiro_id,
            parceiros!bookmakers_parceiro_id_fkey (nome),
            bookmakers_catalogo!bookmakers_bookmaker_catalogo_id_fkey (logo_url)
          )
        `)
        .eq("projeto_id", projetoId)
        .order("data_recebida", { ascending: false });

      if (error) throw error;

      const formatted: FreebetRecebida[] = (data || []).map((fb: any) => ({
        id: fb.id,
        bookmaker_id: fb.bookmaker_id,
        bookmaker_nome: fb.bookmakers?.nome || "Desconhecida",
        parceiro_nome: fb.bookmakers?.parceiros?.nome || null,
        logo_url: fb.bookmakers?.bookmakers_catalogo?.logo_url || null,
        valor: fb.valor,
        motivo: fb.motivo,
        data_recebida: fb.data_recebida,
        utilizada: fb.utilizada || false,
        data_utilizacao: fb.data_utilizacao,
        aposta_id: fb.aposta_id,
        status: fb.status || "LIBERADA",
      }));

      setFreebets(formatted);
    } catch (error: any) {
      console.error("Erro ao buscar freebets:", error);
    }
  };

  const fetchBookmakersComFreebet = async () => {
    try {
      const { data, error } = await supabase
        .from("bookmakers")
        .select(`
          id, nome, saldo_freebet,
          parceiros!bookmakers_parceiro_id_fkey (nome),
          bookmakers_catalogo!bookmakers_bookmaker_catalogo_id_fkey (logo_url)
        `)
        .eq("projeto_id", projetoId)
        .gt("saldo_freebet", 0);

      if (error) throw error;

      const formatted: BookmakerComFreebet[] = (data || []).map((bk: any) => ({
        id: bk.id,
        nome: bk.nome,
        parceiro_nome: bk.parceiros?.nome || null,
        logo_url: bk.bookmakers_catalogo?.logo_url || null,
        saldo_freebet: bk.saldo_freebet || 0,
      }));

      setBookmakersComFreebet(formatted);
    } catch (error: any) {
      console.error("Erro ao buscar bookmakers com freebet:", error);
    }
  };

  const fetchApostasOperacionais = async () => {
    try {
      const { data: apostasSimples, error: errorSimples } = await supabase
        .from("apostas")
        .select(`
          id, evento, mercado, selecao, odd, stake, lucro_prejuizo, valor_retorno,
          data_aposta, status, resultado, tipo_freebet, contexto_operacional,
          gerou_freebet, valor_freebet_gerada, bookmaker_id,
          bookmakers!apostas_bookmaker_id_fkey (
            nome, parceiros!bookmakers_parceiro_id_fkey (nome),
            bookmakers_catalogo!bookmakers_bookmaker_catalogo_id_fkey (logo_url)
          )
        `)
        .eq("projeto_id", projetoId)
        .or("contexto_operacional.eq.FREEBET,gerou_freebet.eq.true")
        .is("cancelled_at", null)
        .order("data_aposta", { ascending: false });

      if (errorSimples) throw errorSimples;

      const { data: apostasMultiplas, error: errorMultiplas } = await supabase
        .from("apostas_multiplas")
        .select(`
          id, selecoes, odd_final, stake, lucro_prejuizo, valor_retorno,
          data_aposta, status, resultado, tipo_freebet, contexto_operacional,
          gerou_freebet, valor_freebet_gerada, bookmaker_id,
          bookmakers!apostas_multiplas_bookmaker_id_fkey (
            nome, parceiros!bookmakers_parceiro_id_fkey (nome),
            bookmakers_catalogo!bookmakers_bookmaker_catalogo_id_fkey (logo_url)
          )
        `)
        .eq("projeto_id", projetoId)
        .or("contexto_operacional.eq.FREEBET,gerou_freebet.eq.true")
        .is("cancelled_at", null)
        .order("data_aposta", { ascending: false });

      if (errorMultiplas) throw errorMultiplas;

      const simplesFormatted: ApostaOperacionalFreebet[] = (apostasSimples || []).map((ap: any) => ({
        id: ap.id,
        tipo: "simples" as const,
        evento: ap.evento,
        mercado: ap.mercado,
        selecao: ap.selecao,
        odd: ap.odd,
        stake: ap.stake,
        lucro_prejuizo: ap.lucro_prejuizo,
        valor_retorno: ap.valor_retorno,
        data_aposta: ap.data_aposta,
        status: ap.status,
        resultado: ap.resultado,
        tipo_freebet: ap.tipo_freebet,
        bookmaker_id: ap.bookmaker_id,
        bookmaker_nome: ap.bookmakers?.nome || "Desconhecida",
        logo_url: ap.bookmakers?.bookmakers_catalogo?.logo_url || null,
        parceiro_nome: ap.bookmakers?.parceiros?.nome || null,
        gerou_freebet: ap.gerou_freebet || false,
        valor_freebet_gerada: ap.valor_freebet_gerada || null,
      }));

      const multiplasFormatted: ApostaOperacionalFreebet[] = (apostasMultiplas || []).map((ap: any) => {
        const selecoes = Array.isArray(ap.selecoes) ? ap.selecoes : [];
        const primeiraSelecao = selecoes[0] || {};
        return {
          id: ap.id,
          tipo: "multipla" as const,
          evento: primeiraSelecao.evento || `Múltipla (${selecoes.length} seleções)`,
          mercado: primeiraSelecao.mercado || null,
          selecao: selecoes.map((s: any) => s.selecao).join(" + ") || "Múltipla",
          odd: ap.odd_final,
          stake: ap.stake,
          lucro_prejuizo: ap.lucro_prejuizo,
          valor_retorno: ap.valor_retorno,
          data_aposta: ap.data_aposta,
          status: ap.status,
          resultado: ap.resultado,
          tipo_freebet: ap.tipo_freebet,
          bookmaker_id: ap.bookmaker_id,
          bookmaker_nome: ap.bookmakers?.nome || "Desconhecida",
          logo_url: ap.bookmakers?.bookmakers_catalogo?.logo_url || null,
          parceiro_nome: ap.bookmakers?.parceiros?.nome || null,
          gerou_freebet: ap.gerou_freebet || false,
          valor_freebet_gerada: ap.valor_freebet_gerada || null,
        };
      });

      const todasApostas = [...simplesFormatted, ...multiplasFormatted].sort(
        (a, b) => new Date(b.data_aposta).getTime() - new Date(a.data_aposta).getTime()
      );

      setApostasOperacionais(todasApostas);
    } catch (error: any) {
      console.error("Erro ao buscar apostas operacionais:", error);
    }
  };

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat("pt-BR", {
      style: "currency",
      currency: "BRL",
    }).format(value);
  };

  // Handlers para atualização de resultado e edição
  const handleApostaUpdated = () => {
    fetchData();
    onDataChange?.();
  };

  const handleEditClick = (aposta: ApostaOperacionalFreebet) => {
    if (aposta.tipo === "multipla") {
      setSelectedApostaMultipla({
        id: aposta.id,
        bookmaker_id: aposta.bookmaker_id,
        stake: aposta.stake,
        odd_final: aposta.odd,
        resultado: aposta.resultado,
        status: aposta.status,
        lucro_prejuizo: aposta.lucro_prejuizo,
        valor_retorno: aposta.valor_retorno,
        data_aposta: aposta.data_aposta,
        tipo_freebet: aposta.tipo_freebet,
        gerou_freebet: aposta.gerou_freebet,
        valor_freebet_gerada: aposta.valor_freebet_gerada,
        selecoes: aposta.selecao.split(" + ").map(s => ({ descricao: s, selecao: s, odd: "1.00" })),
        bookmaker: {
          nome: aposta.bookmaker_nome,
          bookmakers_catalogo: { logo_url: aposta.logo_url }
        }
      });
      setDialogMultiplaOpen(true);
    } else {
      setSelectedAposta({
        id: aposta.id,
        bookmaker_id: aposta.bookmaker_id,
        evento: aposta.evento,
        mercado: aposta.mercado,
        selecao: aposta.selecao,
        odd: aposta.odd,
        stake: aposta.stake,
        resultado: aposta.resultado,
        status: aposta.status,
        lucro_prejuizo: aposta.lucro_prejuizo,
        valor_retorno: aposta.valor_retorno,
        data_aposta: aposta.data_aposta,
        tipo_freebet: aposta.tipo_freebet,
        gerou_freebet: aposta.gerou_freebet,
        valor_freebet_gerada: aposta.valor_freebet_gerada,
        bookmaker: {
          nome: aposta.bookmaker_nome,
          bookmakers_catalogo: { logo_url: aposta.logo_url }
        }
      });
      setDialogOpen(true);
    }
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

  // Filtrar por período
  const freebetsNoPeriodo = useMemo(() => {
    if (!dateRange) return freebets;
    return freebets.filter(fb => {
      const dataRecebida = new Date(fb.data_recebida);
      return dataRecebida >= dateRange.start && dataRecebida <= dateRange.end;
    });
  }, [freebets, dateRange]);

  const apostasNoPeriodo = useMemo(() => {
    if (!dateRange) return apostasOperacionais;
    return apostasOperacionais.filter(ap => {
      const dataAposta = new Date(ap.data_aposta);
      return dataAposta >= dateRange.start && dataAposta <= dateRange.end;
    });
  }, [apostasOperacionais, dateRange]);

  // Casas disponíveis para filtro
  const casasDisponiveis = [...new Set(apostasNoPeriodo.map(ap => ap.bookmaker_nome))];

  // Filtrar apostas
  const apostasFiltradas = useMemo(() => {
    return apostasNoPeriodo.filter(ap => {
      if (casaFilter !== "todas" && ap.bookmaker_nome !== casaFilter) return false;
      
      if (searchTerm) {
        const search = searchTerm.toLowerCase();
        return (
          ap.evento.toLowerCase().includes(search) ||
          ap.selecao.toLowerCase().includes(search) ||
          ap.mercado?.toLowerCase().includes(search) ||
          ap.bookmaker_nome.toLowerCase().includes(search) ||
          ap.parceiro_nome?.toLowerCase().includes(search)
        );
      }
      
      return true;
    });
  }, [apostasNoPeriodo, casaFilter, searchTerm]);

  // Apostas por status
  const apostasAtivas = apostasFiltradas.filter(ap => ap.status === "PENDENTE" || ap.resultado === "PENDENTE");
  const apostasHistorico = apostasFiltradas.filter(ap => ap.status === "LIQUIDADA" && ap.resultado !== "PENDENTE");

  // Métricas globais
  const metricas = useMemo(() => {
    const freebetsLiberadas = freebetsNoPeriodo.filter(fb => fb.status === "LIBERADA");
    const totalRecebido = freebetsLiberadas.reduce((acc, fb) => acc + fb.valor, 0);
    
    const apostasFinalizadas = apostasNoPeriodo.filter(ap => 
      ap.status === "LIQUIDADA" && ap.resultado && ap.resultado !== "PENDENTE"
    );
    
    const totalExtraido = apostasFinalizadas.reduce((acc, ap) => {
      const lucro = ap.lucro_prejuizo || 0;
      return acc + Math.max(0, lucro);
    }, 0);
    
    const taxaExtracao = totalRecebido > 0 ? (totalExtraido / totalRecebido) * 100 : 0;
    const totalApostas = apostasNoPeriodo.length;
    const apostasGanhas = apostasNoPeriodo.filter(ap => 
      ap.resultado === "GREEN" || ap.resultado === "MEIO_GREEN"
    ).length;
    const apostasPerdidas = apostasNoPeriodo.filter(ap => 
      ap.resultado === "RED" || ap.resultado === "MEIO_RED"
    ).length;
    const apostasPendentes = apostasNoPeriodo.filter(ap => 
      ap.status === "PENDENTE" || ap.resultado === "PENDENTE"
    ).length;
    const taxaAcerto = totalApostas > 0 ? (apostasGanhas / totalApostas) * 100 : 0;

    return {
      totalRecebido,
      totalExtraido,
      taxaExtracao,
      totalApostas,
      apostasGanhas,
      apostasPerdidas,
      apostasPendentes,
      taxaAcerto
    };
  }, [freebetsNoPeriodo, apostasNoPeriodo]);

  // Estatísticas por casa
  const statsPorCasa = useMemo((): BookmakerFreebetStats[] => {
    const casasMap = new Map<string, BookmakerFreebetStats>();
    
    // Agregar freebets recebidas
    freebetsNoPeriodo.forEach(fb => {
      if (fb.status !== "LIBERADA") return;
      
      const existing = casasMap.get(fb.bookmaker_id) || {
        bookmaker_id: fb.bookmaker_id,
        bookmaker_nome: fb.bookmaker_nome,
        logo_url: fb.logo_url,
        parceiro_nome: fb.parceiro_nome,
        total_freebets_recebidas: 0,
        valor_total_recebido: 0,
        apostas_realizadas: 0,
        apostas_ganhas: 0,
        apostas_perdidas: 0,
        apostas_pendentes: 0,
        valor_total_extraido: 0,
        taxa_extracao: 0,
        taxa_conversao: 0,
        saldo_atual: 0,
      };
      
      existing.total_freebets_recebidas += 1;
      existing.valor_total_recebido += fb.valor;
      
      casasMap.set(fb.bookmaker_id, existing);
    });
    
    // Agregar apostas
    apostasNoPeriodo.forEach(ap => {
      const existing = casasMap.get(ap.bookmaker_id);
      if (!existing) return;
      
      existing.apostas_realizadas += 1;
      
      if (ap.resultado === "GREEN" || ap.resultado === "MEIO_GREEN") {
        existing.apostas_ganhas += 1;
        existing.valor_total_extraido += Math.max(0, ap.lucro_prejuizo || 0);
      } else if (ap.resultado === "RED" || ap.resultado === "MEIO_RED") {
        existing.apostas_perdidas += 1;
      } else {
        existing.apostas_pendentes += 1;
      }
    });
    
    // Adicionar saldo atual de bookmakers
    bookmakersComFreebet.forEach(bk => {
      const existing = casasMap.get(bk.id);
      if (existing) {
        existing.saldo_atual = bk.saldo_freebet;
      }
    });
    
    // Calcular taxas
    return Array.from(casasMap.values())
      .map(stat => ({
        ...stat,
        taxa_extracao: stat.valor_total_recebido > 0 
          ? (stat.valor_total_extraido / stat.valor_total_recebido) * 100 
          : 0,
        taxa_conversao: stat.apostas_realizadas > 0 
          ? (stat.apostas_ganhas / stat.apostas_realizadas) * 100 
          : 0
      }))
      .sort((a, b) => b.valor_total_recebido - a.valor_total_recebido);
  }, [freebetsNoPeriodo, apostasNoPeriodo, bookmakersComFreebet]);

  // Estoque atual
  const totalFreebetDisponivel = bookmakersComFreebet.reduce((acc, bk) => acc + bk.saldo_freebet, 0);
  const casasComFreebet = bookmakersComFreebet.length;
  const freebetsUtilizadas = freebetsNoPeriodo.filter(f => f.utilizada).length;
  const freebetsDisponiveis = freebetsNoPeriodo.filter(f => !f.utilizada).length;

  // Mode toggle button component
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
  const periodFilterButtons = (
    <div className="flex gap-1">
      {PERIOD_OPTIONS.map((option) => (
        <Button
          key={option.value}
          variant={internalPeriod === option.value ? "default" : "outline"}
          size="sm"
          onClick={() => setInternalPeriod(option.value)}
          className="text-xs h-7 px-2"
        >
          {option.label}
        </Button>
      ))}
    </div>
  );

  // Freebets disponíveis sidebar component
  const freebetsDisponiveisSidebar = (
    <div className="space-y-2">
      <h4 className="text-xs font-medium text-muted-foreground/60 uppercase tracking-wider mb-3">
        Freebets Disponíveis
      </h4>
      {bookmakersComFreebet.length === 0 ? (
        <p className="text-xs text-muted-foreground py-2">Nenhuma freebet disponível</p>
      ) : (
        <div className="space-y-1">
          {bookmakersComFreebet.map(bk => (
            <div 
              key={bk.id} 
              className="flex items-center gap-2 px-3 py-2 rounded-lg border border-amber-500/30 bg-amber-500/5 hover:bg-amber-500/10 transition-colors"
            >
              {bk.logo_url ? (
                <img src={bk.logo_url} alt={bk.nome} className="h-5 w-5 rounded object-contain bg-white p-0.5" />
              ) : (
                <Gift className="h-4 w-4 text-amber-400" />
              )}
              <span className="text-sm font-medium truncate flex-1">{bk.nome}</span>
              <Badge className="bg-amber-500/20 text-amber-400 border-amber-500/30 text-xs shrink-0">
                {formatCurrency(bk.saldo_freebet)}
              </Badge>
            </div>
          ))}
        </div>
      )}
    </div>
  );

  // Main content renderer based on active tab
  const renderMainContent = () => {
    const contentClass = cn(
      "transition-all duration-200 ease-out",
      isTransitioning ? "opacity-0 translate-y-2" : "opacity-100 translate-y-0"
    );

    return (
      <div className={cn("min-h-[400px]", contentClass)}>
        {activeNavTab === "visao-geral" && renderVisaoGeral()}
        {activeNavTab === "apostas" && renderApostas()}
        {activeNavTab === "por-casa" && (
          <FreebetResumoPorCasa 
            stats={statsPorCasa} 
            formatCurrency={formatCurrency}
            viewMode={viewMode}
          />
        )}
      </div>
    );
  };

  // Visão Geral content
  const renderVisaoGeral = () => (
    <div className="space-y-6">
      {/* KPIs - Métricas de Período */}
      <div className="grid gap-4 md:grid-cols-3 lg:grid-cols-6">
        <Card className="border-amber-500/20 bg-amber-500/5">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Recebido</CardTitle>
            <Gift className="h-4 w-4 text-amber-400" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-amber-400">{formatCurrency(metricas.totalRecebido)}</div>
            <p className="text-xs text-muted-foreground">{freebetsNoPeriodo.length} freebets</p>
          </CardContent>
        </Card>

        <Card className="border-emerald-500/20 bg-emerald-500/5">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Extraído</CardTitle>
            <TrendingUp className="h-4 w-4 text-emerald-400" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-emerald-400">{formatCurrency(metricas.totalExtraido)}</div>
            <p className="text-xs text-muted-foreground">{metricas.apostasGanhas} ganhas</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Taxa Extração</CardTitle>
            <Percent className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className={`text-2xl font-bold ${metricas.taxaExtracao >= 70 ? 'text-emerald-400' : metricas.taxaExtracao >= 50 ? 'text-amber-400' : 'text-red-400'}`}>
              {metricas.taxaExtracao.toFixed(1)}%
            </div>
            <p className="text-xs text-muted-foreground">Acerto: {metricas.taxaAcerto.toFixed(0)}%</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Apostas</CardTitle>
            <Target className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{metricas.totalApostas}</div>
            <p className="text-xs text-muted-foreground">
              <span className="text-yellow-400">{metricas.apostasPendentes}</span> pendentes
            </p>
          </CardContent>
        </Card>

        <Card className="border-amber-500/20">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Saldo Atual</CardTitle>
            <Gift className="h-4 w-4 text-amber-400" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-amber-400">{formatCurrency(totalFreebetDisponivel)}</div>
            <p className="text-xs text-muted-foreground">{casasComFreebet} casas</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Freebets</CardTitle>
            <Clock className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{freebetsNoPeriodo.length}</div>
            <p className="text-xs text-muted-foreground">
              <span className="text-emerald-400">{freebetsDisponiveis}</span> / <span className="text-muted-foreground">{freebetsUtilizadas}</span>
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Gráfico Curva de Extração + Freebets Disponíveis (lado a lado) */}
      <div className="grid gap-6 lg:grid-cols-[1fr_280px]">
        {/* Gráfico Principal */}
        <FreebetGraficos 
          apostas={apostasNoPeriodo} 
          formatCurrency={formatCurrency}
          dateRange={dateRange}
          freebets={freebetsNoPeriodo}
        />

        {/* Freebets Disponíveis - Container Lateral */}
        <div className="hidden lg:block">
          <Card className="sticky top-4 border-amber-500/20">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm flex items-center gap-2">
                <Gift className="h-4 w-4 text-amber-400" />
                Freebets Disponíveis
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {bookmakersComFreebet.length === 0 ? (
                <p className="text-xs text-muted-foreground py-4 text-center">Nenhuma freebet disponível</p>
              ) : (
                <>
                  {bookmakersComFreebet.map(bk => (
                    <div 
                      key={bk.id} 
                      className="flex items-center gap-2 px-3 py-2 rounded-lg border border-amber-500/30 bg-amber-500/5 hover:bg-amber-500/10 transition-colors"
                    >
                      {bk.logo_url ? (
                        <img src={bk.logo_url} alt={bk.nome} className="h-5 w-5 rounded object-contain bg-white p-0.5" />
                      ) : (
                        <Gift className="h-4 w-4 text-amber-400" />
                      )}
                      <span className="text-sm font-medium truncate flex-1">{bk.nome}</span>
                      <Badge className="bg-amber-500/20 text-amber-400 border-amber-500/30 text-xs shrink-0">
                        {formatCurrency(bk.saldo_freebet)}
                      </Badge>
                    </div>
                  ))}
                  {/* Total */}
                  <div className="pt-2 mt-2 border-t border-amber-500/20">
                    <div className="flex justify-between items-center text-sm">
                      <span className="text-muted-foreground">Total</span>
                      <span className="font-bold text-amber-400">{formatCurrency(totalFreebetDisponivel)}</span>
                    </div>
                  </div>
                </>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Cards Resumo por Casa - Densidade Estratégica */}
      {statsPorCasa.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Building2 className="h-4 w-4 text-primary" />
              Eficiência por Casa
              <Badge variant="secondary" className="ml-2">{statsPorCasa.length} casas</Badge>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {statsPorCasa.slice(0, 8).map(stat => (
                <div 
                  key={stat.bookmaker_id} 
                  className="p-3 rounded-lg border bg-card hover:bg-muted/30 transition-colors"
                >
                  {/* Header com logo e nome */}
                  <div className="flex items-center gap-2 mb-3">
                    {stat.logo_url ? (
                      <img src={stat.logo_url} alt={stat.bookmaker_nome} className="h-8 w-8 rounded-lg object-contain bg-white p-0.5" />
                    ) : (
                      <div className="h-8 w-8 rounded-lg bg-muted flex items-center justify-center">
                        <Building2 className="h-4 w-4" />
                      </div>
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="font-medium text-sm truncate">{stat.bookmaker_nome}</p>
                      {stat.parceiro_nome && (
                        <p className="text-[10px] text-muted-foreground truncate">{stat.parceiro_nome}</p>
                      )}
                    </div>
                  </div>
                  
                  {/* Métricas principais - 3 valores estratégicos */}
                  <div className="grid grid-cols-3 gap-2 text-center">
                    <div className="p-1.5 rounded bg-amber-500/10">
                      <p className="text-xs font-bold text-amber-400">{stat.total_freebets_recebidas}</p>
                      <p className="text-[9px] text-muted-foreground">Recebidas</p>
                    </div>
                    <div className="p-1.5 rounded bg-emerald-500/10">
                      <p className="text-xs font-bold text-emerald-400">{formatCurrency(stat.valor_total_extraido)}</p>
                      <p className="text-[9px] text-muted-foreground">Extraído</p>
                    </div>
                    <div className={`p-1.5 rounded ${
                      stat.taxa_extracao >= 70 ? 'bg-emerald-500/10' : 
                      stat.taxa_extracao >= 50 ? 'bg-amber-500/10' : 'bg-red-500/10'
                    }`}>
                      <p className={`text-xs font-bold ${
                        stat.taxa_extracao >= 70 ? 'text-emerald-400' : 
                        stat.taxa_extracao >= 50 ? 'text-amber-400' : 'text-red-400'
                      }`}>{stat.taxa_extracao.toFixed(0)}%</p>
                      <p className="text-[9px] text-muted-foreground">Extração</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
            {statsPorCasa.length > 8 && (
              <div className="mt-3 text-center">
                <Button variant="ghost" size="sm" onClick={() => setActiveNavTab("por-casa")}>
                  Ver todas as {statsPorCasa.length} casas
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Recent Apostas Preview */}
      {apostasAtivas.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Clock className="h-4 w-4 text-primary" />
              Apostas Pendentes
              <Badge variant="secondary" className="ml-2">{apostasAtivas.length}</Badge>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
              {apostasAtivas.slice(0, 6).map(aposta => (
                <FreebetApostaCard 
                  key={aposta.id} 
                  aposta={aposta} 
                  compact={true}
                  formatCurrency={formatCurrency}
                  onResultadoUpdated={handleApostaUpdated}
                  onEditClick={handleEditClick}
                />
              ))}
            </div>
            {apostasAtivas.length > 6 && (
              <div className="mt-4 text-center">
                <Button variant="ghost" size="sm" onClick={() => setActiveNavTab("apostas")}>
                  Ver todas as {apostasAtivas.length} apostas
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );

  // Apostas content with sub-tabs
  const renderApostas = () => (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <CardTitle className="text-base flex items-center gap-2">
            <Target className="h-4 w-4 text-primary" />
            Centro de Inteligência Freebet
          </CardTitle>
          
          {/* Controles de Visualização */}
          <div className="flex items-center gap-4">
            <ToggleGroup type="single" value={viewMode} onValueChange={(v) => v && setViewMode(v as any)}>
              <ToggleGroupItem value="card" aria-label="Cards" size="sm">
                <LayoutGrid className="h-4 w-4" />
              </ToggleGroupItem>
              <ToggleGroupItem value="list" aria-label="Lista" size="sm">
                <List className="h-4 w-4" />
              </ToggleGroupItem>
            </ToggleGroup>
            
            <div className="flex items-center gap-2">
              <Switch id="compact" checked={compactMode} onCheckedChange={toggleCompactMode} />
              <Label htmlFor="compact" className="text-xs text-muted-foreground cursor-pointer flex items-center gap-1">
                <Minimize2 className="h-3 w-3" />
                Compacto
              </Label>
            </div>
          </div>
        </div>
      </CardHeader>
      
      <CardContent>
        <Tabs value={subTab} onValueChange={(v) => setSubTab(v as FreebetSubTab)} className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <TabsList>
              <TabsTrigger value="ativas" className="gap-1.5">
                <Clock className="h-3.5 w-3.5" />
                Ativas
                {apostasAtivas.length > 0 && (
                  <Badge variant="secondary" className="ml-1 h-5 px-1.5">{apostasAtivas.length}</Badge>
                )}
              </TabsTrigger>
              <TabsTrigger value="historico" className="gap-1.5">
                <CheckCircle2 className="h-3.5 w-3.5" />
                Histórico
              </TabsTrigger>
            </TabsList>
            
            {/* Filtros */}
            <div className="flex items-center gap-2">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Buscar..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-9 w-[200px] h-9"
                />
              </div>
              <Select value={casaFilter} onValueChange={setCasaFilter}>
                <SelectTrigger className="w-[150px] h-9">
                  <SelectValue placeholder="Casa" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="todas">Todas as Casas</SelectItem>
                  {casasDisponiveis.map(casa => (
                    <SelectItem key={casa} value={casa}>{casa}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Conteúdo: Apostas Ativas */}
          <TabsContent value="ativas" className="mt-4">
            {apostasAtivas.length === 0 ? (
              <div className="text-center py-12 border rounded-lg bg-muted/5">
                <Clock className="mx-auto h-10 w-10 text-muted-foreground/30" />
                <p className="mt-3 text-sm text-muted-foreground">Nenhuma aposta pendente</p>
              </div>
            ) : viewMode === "list" ? (
              <FreebetApostasList 
                apostas={apostasAtivas} 
                formatCurrency={formatCurrency}
                onResultadoUpdated={handleApostaUpdated}
                onEditClick={handleEditClick}
              />
            ) : (
              <div className={`grid gap-3 ${compactMode ? 'space-y-0' : 'md:grid-cols-2 lg:grid-cols-3'}`}>
                {apostasAtivas.map(aposta => (
                  <FreebetApostaCard 
                    key={aposta.id} 
                    aposta={aposta} 
                    compact={compactMode}
                    formatCurrency={formatCurrency}
                    onResultadoUpdated={handleApostaUpdated}
                    onEditClick={handleEditClick}
                  />
                ))}
              </div>
            )}
          </TabsContent>

          {/* Conteúdo: Histórico */}
          <TabsContent value="historico" className="mt-4">
            {apostasHistorico.length === 0 ? (
              <div className="text-center py-12 border rounded-lg bg-muted/5">
                <CheckCircle2 className="mx-auto h-10 w-10 text-muted-foreground/30" />
                <p className="mt-3 text-sm text-muted-foreground">Nenhuma aposta finalizada</p>
              </div>
            ) : viewMode === "list" ? (
              <FreebetApostasList 
                apostas={apostasHistorico} 
                formatCurrency={formatCurrency}
                onResultadoUpdated={handleApostaUpdated}
                onEditClick={handleEditClick}
              />
            ) : (
              <div className={`grid gap-3 ${compactMode ? 'space-y-0' : 'md:grid-cols-2 lg:grid-cols-3'}`}>
                {apostasHistorico.map(aposta => (
                  <FreebetApostaCard 
                    key={aposta.id} 
                    aposta={aposta} 
                    compact={compactMode}
                    formatCurrency={formatCurrency}
                    onResultadoUpdated={handleApostaUpdated}
                    onEditClick={handleEditClick}
                  />
                ))}
              </div>
            )}
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="grid gap-4 md:grid-cols-3 lg:grid-cols-6">
          {[1, 2, 3, 4, 5, 6].map(i => <Skeleton key={i} className="h-24" />)}
        </div>
        <Skeleton className="h-96" />
      </div>
    );
  }

  // Mode: Slim Tabs
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
              {periodFilterButtons}
              {modeToggle}
            </div>
          </div>

          <TabsContent value={activeNavTab} className="mt-0">
            {renderMainContent()}
          </TabsContent>
        </Tabs>

        {/* Dialogs */}
        <ApostaDialog
          open={dialogOpen}
          onOpenChange={setDialogOpen}
          projetoId={projetoId}
          aposta={selectedAposta}
          onSuccess={handleApostaUpdated}
        />

        <ApostaMultiplaDialog
          open={dialogMultiplaOpen}
          onOpenChange={setDialogMultiplaOpen}
          projetoId={projetoId}
          aposta={selectedApostaMultipla}
          onSuccess={handleApostaUpdated}
        />
      </div>
    );
  }

  // Mode: Sidebar
  return (
    <div className="space-y-4">
      {/* Period Filter at top right */}
      <div className="flex justify-end">
        {periodFilterButtons}
      </div>
      
      <div className="flex gap-6">
        {/* Sidebar Navigation */}
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
                    <item.icon className={cn(
                      "h-4 w-4 transition-colors",
                      isActive ? "text-accent" : "opacity-60"
                    )} />
                    <span className="flex-1 text-left">{item.label}</span>
                  </button>
                );
              })}
            </nav>
          </div>

          {/* Freebets Disponíveis */}
          {freebetsDisponiveisSidebar}
        </div>

        {/* Content Area */}
        <div className="flex-1 min-w-0">
          {renderMainContent()}
        </div>
      </div>

      {/* Dialogs */}
      <ApostaDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        projetoId={projetoId}
        aposta={selectedAposta}
        onSuccess={handleApostaUpdated}
      />

      <ApostaMultiplaDialog
        open={dialogMultiplaOpen}
        onOpenChange={setDialogMultiplaOpen}
        projetoId={projetoId}
        aposta={selectedApostaMultipla}
        onSuccess={handleApostaUpdated}
      />
    </div>
  );
}
