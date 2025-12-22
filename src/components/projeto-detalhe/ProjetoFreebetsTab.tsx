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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { 
  Gift, Search, Building2, Target, CheckCircle2, Clock, 
  TrendingUp, Percent, LayoutGrid, List, Minimize2, BarChart3 
} from "lucide-react";
import { startOfDay, endOfDay, subDays, startOfMonth, startOfYear } from "date-fns";
import { useFreebetViewPreferences, FreebetSubTab } from "@/hooks/useFreebetViewPreferences";
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

export function ProjetoFreebetsTab({ projetoId, periodFilter = "tudo", customDateRange, onDataChange, refreshTrigger }: ProjetoFreebetsTabProps) {
  const [loading, setLoading] = useState(true);
  const [freebets, setFreebets] = useState<FreebetRecebida[]>([]);
  const [bookmakersComFreebet, setBookmakersComFreebet] = useState<BookmakerComFreebet[]>([]);
  const [apostasOperacionais, setApostasOperacionais] = useState<ApostaOperacionalFreebet[]>([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [casaFilter, setCasaFilter] = useState<string>("todas");
  
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

  // Calcular range de datas baseado no filtro
  const dateRange = useMemo(() => {
    const now = new Date();
    const today = startOfDay(now);
    
    switch (periodFilter) {
      case "hoje":
        return { start: today, end: endOfDay(now) };
      case "ontem":
        const yesterday = subDays(today, 1);
        return { start: yesterday, end: endOfDay(yesterday) };
      case "7dias":
        return { start: subDays(today, 7), end: endOfDay(now) };
      case "mes":
        return { start: startOfMonth(now), end: endOfDay(now) };
      case "ano":
        return { start: startOfYear(now), end: endOfDay(now) };
      case "periodo":
        if (customDateRange) {
          return { start: customDateRange.start, end: endOfDay(customDateRange.end) };
        }
        return null;
      default:
        return null;
    }
  }, [periodFilter, customDateRange]);

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
      // Buscar dados completos da aposta múltipla
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
      // Buscar dados completos da aposta simples
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

  return (
    <div className="space-y-4">
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

      {/* Saldo por Casa (compacto) */}
      {bookmakersComFreebet.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {bookmakersComFreebet.slice(0, 6).map(bk => (
            <div key={bk.id} className="flex items-center gap-2 px-3 py-1.5 rounded-full border bg-card">
              {bk.logo_url ? (
                <img src={bk.logo_url} alt={bk.nome} className="h-5 w-5 rounded object-contain bg-white p-0.5" />
              ) : (
                <Building2 className="h-4 w-4 text-muted-foreground" />
              )}
              <span className="text-sm font-medium">{bk.nome}</span>
              <Badge className="bg-amber-500/20 text-amber-400 border-amber-500/30 text-xs">
                {formatCurrency(bk.saldo_freebet)}
              </Badge>
            </div>
          ))}
          {bookmakersComFreebet.length > 6 && (
            <div className="flex items-center px-3 py-1.5 rounded-full border bg-muted/50">
              <span className="text-xs text-muted-foreground">+{bookmakersComFreebet.length - 6} casas</span>
            </div>
          )}
        </div>
      )}

      {/* Área Principal com Sub-abas */}
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
                <TabsTrigger value="por-casa" className="gap-1.5">
                  <Building2 className="h-3.5 w-3.5" />
                  Por Casa
                </TabsTrigger>
                <TabsTrigger value="graficos" className="gap-1.5">
                  <BarChart3 className="h-3.5 w-3.5" />
                  Gráficos
                </TabsTrigger>
              </TabsList>
              
              {/* Filtros (apenas para abas de apostas) */}
              {(subTab === "ativas" || subTab === "historico") && (
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
              )}
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

            {/* Conteúdo: Por Casa */}
            <TabsContent value="por-casa" className="mt-4">
              <FreebetResumoPorCasa 
                stats={statsPorCasa} 
                formatCurrency={formatCurrency}
                viewMode={viewMode}
              />
            </TabsContent>

            {/* Conteúdo: Gráficos */}
            <TabsContent value="graficos" className="mt-4">
              <FreebetGraficos 
                apostas={apostasNoPeriodo} 
                statsPorCasa={statsPorCasa}
                formatCurrency={formatCurrency}
                dateRange={dateRange}
              />
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>

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
