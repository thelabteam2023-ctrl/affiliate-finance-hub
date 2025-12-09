import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import { 
  Plus, 
  Search, 
  Target,
  Calendar,
  TrendingUp,
  TrendingDown,
  LayoutGrid,
  List,
  ArrowLeftRight,
  ArrowUp,
  ArrowDown,
  Shield,
  Coins,
  Gift,
  Layers,
  ChevronDown,
  Clock
} from "lucide-react";
import { SurebetCard, SurebetData, SurebetPerna } from "./SurebetCard";
import { SurebetDialog } from "./SurebetDialog";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { ApostaDialog } from "@/components/projeto-detalhe/ApostaDialog";
import { ApostaMultiplaDialog } from "@/components/projeto-detalhe/ApostaMultiplaDialog";
import { ResultadoPill } from "@/components/projeto-detalhe/ResultadoPill";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

import { DateRange } from "react-day-picker";
import { startOfDay, endOfDay, subDays, startOfMonth, startOfYear } from "date-fns";

type PeriodFilter = "hoje" | "ontem" | "7dias" | "mes" | "ano" | "todo" | "custom";

interface ProjetoApostasTabProps {
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
  valor_retorno: number | null;
  lucro_prejuizo: number | null;
  observacoes: string | null;
  bookmaker_id: string;
  modo_entrada?: string;
  lay_exchange?: string | null;
  lay_odd?: number | null;
  lay_stake?: number | null;
  lay_liability?: number | null;
  lay_comissao?: number | null;
  back_comissao?: number | null;
  back_em_exchange?: boolean;
  gerou_freebet?: boolean;
  valor_freebet_gerada?: number | null;
  tipo_freebet?: string | null;
  bookmaker?: {
    nome: string;
    parceiro_id: string;
    bookmaker_catalogo_id?: string | null;
    parceiro?: {
      nome: string;
    };
    bookmakers_catalogo?: {
      logo_url: string | null;
    } | null;
  };
  // Informações da casa Lay para coberturas
  lay_bookmaker?: {
    nome: string;
    parceiro_id: string;
    bookmaker_catalogo_id?: string | null;
    parceiro?: {
      nome: string;
    };
    bookmakers_catalogo?: {
      logo_url: string | null;
    } | null;
  } | null;
}

interface ApostaMultipla {
  id: string;
  tipo_multipla: string;
  stake: number;
  odd_final: number;
  retorno_potencial: number | null;
  lucro_prejuizo: number | null;
  valor_retorno: number | null;
  selecoes: { descricao: string; odd: string; resultado?: string }[];
  status: string;
  resultado: string | null;
  bookmaker_id: string;
  tipo_freebet: string | null;
  gerou_freebet: boolean;
  valor_freebet_gerada: number | null;
  data_aposta: string;
  observacoes: string | null;
  bookmaker?: {
    nome: string;
    parceiro_id: string;
    bookmaker_catalogo_id?: string | null;
    parceiro?: {
      nome: string;
    };
    bookmakers_catalogo?: {
      logo_url: string | null;
    } | null;
  };
}

interface Surebet {
  id: string;
  evento: string;
  esporte: string;
  modelo: string;
  stake_total: number;
  spread_calculado: number | null;
  roi_esperado: number | null;
  roi_real: number | null;
  lucro_esperado: number | null;
  lucro_real: number | null;
  status: string;
  resultado: string | null;
  data_operacao: string;
  observacoes: string | null;
  created_at: string;
  // Pernas vinculadas
  pernas?: {
    id: string;
    bookmaker_id: string;
    selecao: string;
    odd: number;
    stake: number;
    resultado: string | null;
    bookmaker?: {
      nome: string;
      parceiro?: { nome: string };
    };
  }[];
}

// Tipo unificado para exibição
type ApostaUnificada = {
  tipo: "simples" | "multipla" | "surebet";
  data: Aposta | ApostaMultipla | Surebet;
  data_aposta: string;
};

export function ProjetoApostasTab({ projetoId, onDataChange, periodFilter = "todo", dateRange }: ProjetoApostasTabProps) {
  const [apostas, setApostas] = useState<Aposta[]>([]);
  const [apostasMultiplas, setApostasMultiplas] = useState<ApostaMultipla[]>([]);
  const [surebets, setSurebets] = useState<Surebet[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [resultadoFilter, setResultadoFilter] = useState<string>("all");
  const [tipoFilter, setTipoFilter] = useState<"todas" | "simples" | "multiplas" | "surebets">("todas");
  const [viewMode, setViewMode] = useState<"cards" | "list">("cards");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [dialogMultiplaOpen, setDialogMultiplaOpen] = useState(false);
  const [dialogSurebetOpen, setDialogSurebetOpen] = useState(false);
  const [selectedAposta, setSelectedAposta] = useState<Aposta | null>(null);
  const [selectedApostaMultipla, setSelectedApostaMultipla] = useState<ApostaMultipla | null>(null);
  const [selectedSurebet, setSelectedSurebet] = useState<SurebetData | null>(null);
  const [bookmakers, setBookmakers] = useState<any[]>([]);

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
      await Promise.all([fetchApostas(), fetchApostasMultiplas(), fetchSurebets(), fetchBookmakers()]);
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

  const fetchApostas = async () => {
    try {
      const { start, end } = getDateRangeFromFilter();
      
      let query = supabase
        .from("apostas")
        .select(`
          *,
          bookmaker:bookmakers (
            nome,
            parceiro_id,
            bookmaker_catalogo_id,
            parceiro:parceiros (nome),
            bookmakers_catalogo (logo_url)
          )
        `)
        .eq("projeto_id", projetoId)
        .is("surebet_id", null)  // Excluir pernas de Surebet
        .order("data_aposta", { ascending: false });
      
      if (start) {
        query = query.gte("data_aposta", start.toISOString());
      }
      if (end) {
        query = query.lte("data_aposta", end.toISOString());
      }

      const { data, error } = await query;

      if (error) throw error;
      
      // Para apostas de cobertura, buscar informações da lay_exchange separadamente
      const apostasComLayInfo = await Promise.all((data || []).map(async (aposta) => {
        if (aposta.lay_exchange && aposta.estrategia === "COBERTURA_LAY") {
          const { data: layBookmakerData } = await supabase
            .from("bookmakers")
            .select(`
              nome,
              parceiro_id,
              bookmaker_catalogo_id,
              parceiro:parceiros (nome),
              bookmakers_catalogo (logo_url)
            `)
            .eq("id", aposta.lay_exchange)
            .single();
          
          return {
            ...aposta,
            lay_bookmaker: layBookmakerData
          };
        }
        return aposta;
      }));
      
      setApostas(apostasComLayInfo || []);
    } catch (error: any) {
      toast.error("Erro ao carregar apostas simples: " + error.message);
    }
  };

  const fetchApostasMultiplas = async () => {
    try {
      const { start, end } = getDateRangeFromFilter();
      
      let query = supabase
        .from("apostas_multiplas")
        .select(`
          *,
          bookmaker:bookmakers (
            nome,
            parceiro_id,
            bookmaker_catalogo_id,
            parceiro:parceiros (nome),
            bookmakers_catalogo (logo_url)
          )
        `)
        .eq("projeto_id", projetoId)
        .order("data_aposta", { ascending: false });
      
      if (start) {
        query = query.gte("data_aposta", start.toISOString());
      }
      if (end) {
        query = query.lte("data_aposta", end.toISOString());
      }

      const { data, error } = await query;

      if (error) {
        console.error("Erro ao carregar apostas múltiplas:", error);
        throw error;
      }
      
      console.log("Apostas múltiplas carregadas:", data?.length || 0);
      
      setApostasMultiplas((data || []).map((am: any) => ({
        ...am,
        selecoes: Array.isArray(am.selecoes) ? am.selecoes : []
      })));
    } catch (error: any) {
      console.error("Erro ao carregar apostas múltiplas:", error.message);
      toast.error("Erro ao carregar apostas múltiplas: " + error.message);
    }
  };

  const fetchSurebets = async () => {
    try {
      const { start, end } = getDateRangeFromFilter();
      
      let query = supabase
        .from("surebets")
        .select("*")
        .eq("projeto_id", projetoId)
        .order("data_operacao", { ascending: false });
      
      if (start) {
        query = query.gte("data_operacao", start.toISOString());
      }
      if (end) {
        query = query.lte("data_operacao", end.toISOString());
      }

      const { data, error } = await query;

      if (error) throw error;
      
      // Buscar pernas de cada surebet
      const surebetsComPernas = await Promise.all((data || []).map(async (surebet) => {
        const { data: pernasData } = await supabase
          .from("apostas")
          .select(`
            id,
            bookmaker_id,
            selecao,
            odd,
            stake,
            resultado,
            bookmaker:bookmakers (
              nome,
              parceiro:parceiros (nome)
            )
          `)
          .eq("surebet_id", surebet.id);
        
        return {
          ...surebet,
          pernas: pernasData || []
        };
      }));
      
      setSurebets(surebetsComPernas);
    } catch (error: any) {
      console.error("Erro ao carregar surebets:", error.message);
    }
  };

  const handleApostaUpdated = () => {
    fetchAllApostas();
    onDataChange?.();
  };

  // Filtrar apostas simples
  const filteredApostas = apostas.filter((aposta) => {
    const matchesSearch = 
      aposta.evento.toLowerCase().includes(searchTerm.toLowerCase()) ||
      aposta.esporte.toLowerCase().includes(searchTerm.toLowerCase()) ||
      aposta.selecao.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesStatus = statusFilter === "all" || aposta.status === statusFilter;
    const matchesResultado = resultadoFilter === "all" || aposta.resultado === resultadoFilter;
    const matchesTipo = tipoFilter === "todas" || tipoFilter === "simples";
    return matchesSearch && matchesStatus && matchesResultado && matchesTipo;
  });

  // Filtrar apostas múltiplas
  const filteredMultiplas = apostasMultiplas.filter((am) => {
    const matchesSearch = am.selecoes.some(s => 
      s.descricao.toLowerCase().includes(searchTerm.toLowerCase())
    );
    const matchesStatus = statusFilter === "all" || am.status === statusFilter;
    const matchesResultado = resultadoFilter === "all" || am.resultado === resultadoFilter;
    const matchesTipo = tipoFilter === "todas" || tipoFilter === "multiplas";
    return (searchTerm === "" || matchesSearch) && matchesStatus && matchesResultado && matchesTipo;
  });

  // Filtrar surebets
  const filteredSurebets = surebets.filter((sb) => {
    const matchesSearch = 
      sb.evento.toLowerCase().includes(searchTerm.toLowerCase()) ||
      sb.esporte.toLowerCase().includes(searchTerm.toLowerCase()) ||
      sb.modelo.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesStatus = statusFilter === "all" || sb.status === statusFilter;
    const matchesResultado = resultadoFilter === "all" || sb.resultado === resultadoFilter;
    const matchesTipo = tipoFilter === "todas" || tipoFilter === "surebets";
    return matchesSearch && matchesStatus && matchesResultado && matchesTipo;
  });

  // Unificar e ordenar por data
  const apostasUnificadas: ApostaUnificada[] = [
    ...filteredApostas.map(a => ({ tipo: "simples" as const, data: a, data_aposta: a.data_aposta })),
    ...filteredMultiplas.map(am => ({ tipo: "multipla" as const, data: am, data_aposta: am.data_aposta })),
    ...filteredSurebets.map(sb => ({ tipo: "surebet" as const, data: sb, data_aposta: sb.data_operacao })),
  ].sort((a, b) => new Date(b.data_aposta).getTime() - new Date(a.data_aposta).getTime());

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat("pt-BR", {
      style: "currency",
      currency: "BRL",
    }).format(value);
  };

  const getResultadoColor = (resultado: string | null) => {
    switch (resultado) {
      case "GREEN": return "bg-emerald-500/20 text-emerald-400 border-emerald-500/30";
      case "RED": return "bg-red-500/20 text-red-400 border-red-500/30";
      case "MEIO_GREEN": return "bg-teal-500/20 text-teal-400 border-teal-500/30";
      case "MEIO_RED": return "bg-orange-500/20 text-orange-400 border-orange-500/30";
      case "VOID": return "bg-gray-500/20 text-gray-400 border-gray-500/30";
      case "HALF": return "bg-yellow-500/20 text-yellow-400 border-yellow-500/30";
      default: return "bg-blue-500/20 text-blue-400 border-blue-500/30";
    }
  };

  const getResultadoLabel = (resultado: string | null) => {
    switch (resultado) {
      case "MEIO_GREEN": return "Meio Green";
      case "MEIO_RED": return "Meio Red";
      default: return resultado;
    }
  };

  const parseLocalDateTime = (dateString: string): Date => {
    if (!dateString) return new Date();
    // Remove timezone info e trata como horário local
    const cleanDate = dateString.replace(/\+00:00$/, '').replace(/Z$/, '').replace(/\+\d{2}:\d{2}$/, '');
    const [datePart, timePart] = cleanDate.split('T');
    const [year, month, day] = datePart.split('-').map(Number);
    const [hours, minutes] = (timePart || '00:00').split(':').map(Number);
    return new Date(year, month - 1, day, hours || 0, minutes || 0);
  };

  const getFirstLastName = (fullName: string): string => {
    if (!fullName) return "";
    const parts = fullName.trim().split(/\s+/);
    if (parts.length === 1) return parts[0];
    return `${parts[0]} ${parts[parts.length - 1]}`;
  };

  // Determina o tipo de operação da aposta para exibição
  const getOperationType = (aposta: Aposta): { type: "bookmaker" | "back" | "lay" | "cobertura"; label: string; color: string } => {
    if (aposta.modo_entrada === "EXCHANGE" || aposta.estrategia?.includes("EXCHANGE") || aposta.estrategia === "COBERTURA_LAY") {
      if (aposta.estrategia === "COBERTURA_LAY") {
        return { type: "cobertura", label: "COB", color: "bg-purple-500/20 text-purple-400 border-purple-500/30" };
      }
      if (aposta.estrategia === "EXCHANGE_LAY" || aposta.lay_odd) {
        return { type: "lay", label: "LAY", color: "bg-rose-500/20 text-rose-400 border-rose-500/30" };
      }
      return { type: "back", label: "BACK", color: "bg-sky-500/20 text-sky-400 border-sky-500/30" };
    }
    return { type: "bookmaker", label: "", color: "" };
  };

  // Calcula o lucro/prejuízo correto baseado no tipo de operação
  const getCalculatedProfit = (aposta: Aposta): number | null => {
    if (aposta.lucro_prejuizo === null || aposta.lucro_prejuizo === undefined) {
      return null;
    }
    return aposta.lucro_prejuizo;
  };

  // Calcula dados específicos para Exchange (Back/Lay)
  const getExchangeDisplayData = (aposta: Aposta) => {
    const opType = getOperationType(aposta);
    const comissao = opType.type === "lay" 
      ? (aposta.lay_comissao ?? 5) 
      : (aposta.back_comissao ?? 2.8);
    
    if (opType.type === "back") {
      // Exchange Back: lucro líquido = stake * (odd - 1) * (1 - comissao/100)
      const lucroBruto = aposta.stake * (aposta.odd - 1);
      const lucroLiquido = lucroBruto * (1 - comissao / 100);
      const retornoTotal = aposta.stake + lucroLiquido;
      return {
        lucroPotencial: lucroLiquido,
        retornoTotal: retornoTotal,
        comissao: comissao,
        isExchange: true
      };
    }
    
    if (opType.type === "lay") {
      // Exchange Lay: lucro líquido = stake * (1 - comissao/100)
      const lucroLiquido = aposta.stake * (1 - comissao / 100);
      const liability = aposta.lay_liability || aposta.stake * (aposta.odd - 1);
      return {
        lucroPotencial: lucroLiquido,
        retornoTotal: aposta.stake + lucroLiquido,
        liability: liability,
        comissao: comissao,
        isExchange: true
      };
    }
    
    return { isExchange: false };
  };

  // Formata informação de exibição da aposta baseado no tipo
  // SEMPRE inclui o nome do vínculo/parceiro para padronizar o rodapé
  const getApostaDisplayInfo = (aposta: Aposta) => {
    const opType = getOperationType(aposta);
    const parceiroNome = aposta.bookmaker?.parceiro?.nome ? getFirstLastName(aposta.bookmaker.parceiro.nome) : null;
    
    // Todos os tipos exibem o mesmo formato: Casa + Nome do Parceiro
    return {
      primaryLine: aposta.bookmaker?.nome || (opType.type === "bookmaker" ? "" : "Exchange"),
      secondaryLine: parceiroNome,
      badgeType: opType
    };
  };

  const handleOpenDialog = (aposta: Aposta | null) => {
    setSelectedAposta(aposta);
    setDialogOpen(true);
  };

  const handleOpenMultiplaDialog = (aposta: ApostaMultipla | null) => {
    setSelectedApostaMultipla(aposta);
    setDialogMultiplaOpen(true);
  };

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-20" />
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-48" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Filtros e Ações */}
      <Card>
        <CardContent className="pt-4">
          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="outline"
              size="icon"
              className="h-9 w-9"
              onClick={() => setViewMode(viewMode === "cards" ? "list" : "cards")}
            >
              {viewMode === "cards" ? <List className="h-4 w-4" /> : <LayoutGrid className="h-4 w-4" />}
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button size="sm" className="h-9">
                  <Plus className="mr-1 h-4 w-4" />
                  Nova Aposta
                  <ChevronDown className="ml-1 h-3 w-3" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent>
                <DropdownMenuItem onClick={() => handleOpenDialog(null)}>
                  <Target className="mr-2 h-4 w-4" />
                  Aposta Simples
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => handleOpenMultiplaDialog(null)}>
                  <Layers className="mr-2 h-4 w-4" />
                  Aposta Múltipla
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => setDialogSurebetOpen(true)}>
                  <ArrowLeftRight className="mr-2 h-4 w-4" />
                  Surebet
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Buscar..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10 h-9"
              />
            </div>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-[130px] h-9">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos Status</SelectItem>
                <SelectItem value="PENDENTE">Pendente</SelectItem>
                <SelectItem value="REALIZADA">Realizada</SelectItem>
                <SelectItem value="CONCLUIDA">Concluída</SelectItem>
              </SelectContent>
            </Select>
            <Select value={resultadoFilter} onValueChange={setResultadoFilter}>
              <SelectTrigger className="w-[140px] h-9">
                <SelectValue placeholder="Resultado" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos</SelectItem>
                <SelectItem value="GREEN">Green</SelectItem>
                <SelectItem value="RED">Red</SelectItem>
                <SelectItem value="MEIO_GREEN">Meio Green</SelectItem>
                <SelectItem value="MEIO_RED">Meio Red</SelectItem>
                <SelectItem value="VOID">Void</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Lista de Apostas */}
      {apostasUnificadas.length === 0 ? (
        <Card>
          <CardContent className="pt-6">
            <div className="text-center py-10">
              <Target className="mx-auto h-12 w-12 text-muted-foreground/50" />
              <h3 className="mt-4 text-lg font-semibold">Nenhuma aposta encontrada</h3>
              <p className="text-muted-foreground">
                {searchTerm || statusFilter !== "all" || resultadoFilter !== "all"
                  ? "Tente ajustar os filtros"
                  : "Registre sua primeira aposta"}
              </p>
            </div>
          </CardContent>
        </Card>
      ) : viewMode === "cards" ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {apostasUnificadas.map((item) => {
            // Card de Surebet - usando componente unificado
            if (item.tipo === "surebet") {
              const sb = item.data as Surebet;
              
              // Converter para formato SurebetData compatível com SurebetCard
              const surebetData: SurebetData = {
                ...sb,
                pernas: sb.pernas?.map(p => ({
                  id: p.id,
                  selecao: p.selecao,
                  odd: p.odd,
                  stake: p.stake,
                  resultado: p.resultado,
                  bookmaker_nome: p.bookmaker?.nome || "—"
                }))
              };
              
              return (
                <SurebetCard
                  key={sb.id}
                  surebet={surebetData}
                  onEdit={(surebet) => {
                    setSelectedSurebet(surebet);
                    setDialogSurebetOpen(true);
                  }}
                />
              );
            }
            
            if (item.tipo === "simples") {
              const aposta = item.data as Aposta;
              const displayInfo = getApostaDisplayInfo(aposta);
              const opType = displayInfo.badgeType;
            
            return (
              <Card 
                key={aposta.id} 
                className="hover:border-primary/50 transition-colors cursor-default"
              >
                <CardHeader className="pb-1 pt-3 px-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <CardTitle className="text-sm truncate">{aposta.evento}</CardTitle>
                      <p className="text-xs text-muted-foreground truncate">{aposta.esporte}</p>
                    </div>
                    <div className="flex gap-1 flex-shrink-0 items-center">
                      {opType.label && (
                        <Badge className={`${opType.color} text-[10px] px-1.5 py-0`}>
                          {opType.type === "cobertura" && <Shield className="h-2.5 w-2.5 mr-0.5" />}
                          {opType.type === "back" && <ArrowUp className="h-2.5 w-2.5 mr-0.5" />}
                          {opType.type === "lay" && <ArrowDown className="h-2.5 w-2.5 mr-0.5" />}
                          {opType.label}
                        </Badge>
                      )}
                      <ResultadoPill
                        apostaId={aposta.id}
                        bookmarkerId={aposta.bookmaker_id}
                        layExchangeBookmakerId={opType.type === "cobertura" ? aposta.lay_exchange : undefined}
                        resultado={aposta.resultado}
                        status={aposta.status}
                        stake={aposta.stake}
                        odd={aposta.odd}
                        operationType={opType.type}
                        layLiability={aposta.lay_liability || undefined}
                        layOdd={aposta.lay_odd || undefined}
                        layStake={aposta.lay_stake || undefined}
                        layComissao={aposta.lay_comissao || undefined}
                        isFreebetExtraction={aposta.estrategia === "COBERTURA_LAY" && aposta.back_em_exchange === true}
                        gerouFreebet={aposta.gerou_freebet || false}
                        onResultadoUpdated={handleApostaUpdated}
                        onEditClick={() => handleOpenDialog(aposta)}
                      />
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="pt-1 pb-3 px-3">
                  <div className="space-y-1">
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-muted-foreground truncate flex-1">{aposta.selecao}</span>
                      <span className="font-medium ml-2">@{aposta.odd.toFixed(2)}</span>
                    </div>
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-muted-foreground">Stake:</span>
                      <span className="font-medium">{formatCurrency(aposta.stake)}</span>
                    </div>
                    
                    {/* Informações específicas para Cobertura */}
                    {opType.type === "cobertura" && aposta.lay_odd && (
                      <div className="flex items-center justify-between text-xs text-purple-400">
                        <span className="flex items-center gap-1">
                          <ArrowDown className="h-3 w-3" />
                          Lay @{aposta.lay_odd.toFixed(2)}
                        </span>
                        <span>Resp: {formatCurrency(aposta.lay_liability || 0)}</span>
                      </div>
                    )}
                    
                    {/* Informações específicas para Exchange Back */}
                    {opType.type === "back" && (() => {
                      const exchangeData = getExchangeDisplayData(aposta);
                      if (!exchangeData.isExchange) return null;
                      const isPending = aposta.resultado === null || aposta.resultado === "PENDENTE";
                      const profit = getCalculatedProfit(aposta);
                      
                      // Se tem resultado definido, mostrar P/L real
                      if (!isPending && profit !== null) {
                        const roi = (profit / aposta.stake) * 100;
                        return (
                          <div className="space-y-0.5 pt-1 border-t border-border/50">
                            <div className="flex items-center justify-between text-xs">
                              <span className="text-muted-foreground flex items-center gap-1">
                                <Coins className="h-3 w-3" />
                                P/L da Operação:
                              </span>
                              <div className="flex items-center gap-2">
                                <span className={`font-medium flex items-center gap-0.5 ${profit >= 0 ? 'text-emerald-500' : 'text-red-500'}`}>
                                  {profit >= 0 ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
                                  {formatCurrency(profit)}
                                </span>
                                <span className={`text-[10px] px-1 py-0.5 rounded ${profit >= 0 ? 'bg-emerald-500/20 text-emerald-400' : 'bg-red-500/20 text-red-400'}`}>
                                  {roi.toFixed(1)}%
                                </span>
                              </div>
                            </div>
                            <div className="flex items-center justify-between text-[10px] text-muted-foreground/70">
                              <span>Comissão:</span>
                              <span>{exchangeData.comissao?.toFixed(1)}%</span>
                            </div>
                          </div>
                        );
                      }
                      
                      // Se ainda pendente, mostrar lucro potencial
                      return (
                        <div className="space-y-0.5 pt-1 border-t border-border/50">
                          <div className="flex items-center justify-between text-xs text-sky-400">
                            <span className="flex items-center gap-1">
                              <Coins className="h-3 w-3" />
                              Lucro Potencial:
                            </span>
                            <span className="font-medium">{formatCurrency(exchangeData.lucroPotencial || 0)}</span>
                          </div>
                          <div className="flex items-center justify-between text-xs text-muted-foreground">
                            <span>Retorno (se ganhar):</span>
                            <span>{formatCurrency(exchangeData.retornoTotal || 0)}</span>
                          </div>
                          <div className="flex items-center justify-between text-[10px] text-muted-foreground/70">
                            <span>Comissão:</span>
                            <span>{exchangeData.comissao?.toFixed(1)}%</span>
                          </div>
                        </div>
                      );
                    })()}
                    
                    {/* Informações específicas para Exchange Lay */}
                    {opType.type === "lay" && (() => {
                      const exchangeData = getExchangeDisplayData(aposta);
                      if (!exchangeData.isExchange) return null;
                      const isPending = aposta.resultado === null || aposta.resultado === "PENDENTE";
                      const profit = getCalculatedProfit(aposta);
                      
                      // Se tem resultado definido, mostrar P/L real
                      if (!isPending && profit !== null) {
                        const roi = (profit / aposta.stake) * 100;
                        return (
                          <div className="space-y-0.5 pt-1 border-t border-border/50">
                            <div className="flex items-center justify-between text-xs text-rose-400">
                              <span>Responsabilidade:</span>
                              <span className="font-medium">{formatCurrency(exchangeData.liability || 0)}</span>
                            </div>
                            <div className="flex items-center justify-between text-xs">
                              <span className="text-muted-foreground flex items-center gap-1">
                                <Coins className="h-3 w-3" />
                                P/L da Operação:
                              </span>
                              <div className="flex items-center gap-2">
                                <span className={`font-medium flex items-center gap-0.5 ${profit >= 0 ? 'text-emerald-500' : 'text-red-500'}`}>
                                  {profit >= 0 ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
                                  {formatCurrency(profit)}
                                </span>
                                <span className={`text-[10px] px-1 py-0.5 rounded ${profit >= 0 ? 'bg-emerald-500/20 text-emerald-400' : 'bg-red-500/20 text-red-400'}`}>
                                  {roi.toFixed(1)}%
                                </span>
                              </div>
                            </div>
                          </div>
                        );
                      }
                      
                      // Se ainda pendente, mostrar lucro potencial
                      return (
                        <div className="space-y-0.5 pt-1 border-t border-border/50">
                          <div className="flex items-center justify-between text-xs text-rose-400">
                            <span>Responsabilidade:</span>
                            <span className="font-medium">{formatCurrency(exchangeData.liability || 0)}</span>
                          </div>
                          <div className="flex items-center justify-between text-xs text-emerald-400">
                            <span className="flex items-center gap-1">
                              <Coins className="h-3 w-3" />
                              Lucro Potencial:
                            </span>
                            <span className="font-medium">{formatCurrency(exchangeData.lucroPotencial || 0)}</span>
                          </div>
                          <div className="flex items-center justify-between text-[10px] text-muted-foreground/70">
                            <span>Comissão:</span>
                            <span>{exchangeData.comissao?.toFixed(1)}%</span>
                          </div>
                        </div>
                      );
                    })()}
                    
                    {/* P/L para Bookmaker */}
                    {opType.type === "bookmaker" && (() => {
                      const isPending = aposta.resultado === null || aposta.resultado === "PENDENTE";
                      const profit = getCalculatedProfit(aposta);
                      
                      // Se pendente, mostrar lucro potencial
                      if (isPending) {
                        const lucroPotencial = aposta.stake * (aposta.odd - 1);
                        return (
                          <div className="space-y-0.5 pt-1 border-t border-border/50">
                            <div className="flex items-center justify-between text-xs text-emerald-400">
                              <span className="flex items-center gap-1">
                                <Coins className="h-3 w-3" />
                                Lucro Potencial:
                              </span>
                              <span className="font-medium">{formatCurrency(lucroPotencial)}</span>
                            </div>
                            <div className="flex items-center justify-between text-xs text-muted-foreground">
                              <span>Retorno (se ganhar):</span>
                              <span>{formatCurrency(aposta.stake * aposta.odd)}</span>
                            </div>
                          </div>
                        );
                      }
                      
                      // Se tem resultado, mostrar P/L real
                      if (profit === null) return null;
                      return (
                        <div className="flex items-center justify-between text-xs pt-1 border-t border-border/50">
                          <span className="text-muted-foreground">P/L da Operação:</span>
                          <div className="flex items-center gap-2">
                            <span className={`font-medium flex items-center gap-0.5 ${profit >= 0 ? 'text-emerald-500' : 'text-red-500'}`}>
                              {profit >= 0 ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
                              {formatCurrency(profit)}
                            </span>
                            <span className={`text-[10px] px-1 py-0.5 rounded ${profit >= 0 ? 'bg-emerald-500/20 text-emerald-400' : 'bg-red-500/20 text-red-400'}`}>
                              {((profit / aposta.stake) * 100).toFixed(1)}%
                            </span>
                          </div>
                        </div>
                      );
                    })()}
                    
                    {/* P/L para Cobertura */}
                    {opType.type === "cobertura" && (() => {
                      const isPending = aposta.resultado === null || aposta.resultado === "PENDENTE";
                      const profit = getCalculatedProfit(aposta);
                      
                      // Se pendente, mostrar lucro esperado da cobertura
                      if (isPending) {
                        // Calcular lucro garantido esperado
                        const backOdd = aposta.odd;
                        const backStake = aposta.stake;
                        const layOdd = aposta.lay_odd || 2;
                        const comissao = (aposta.lay_comissao || 5) / 100;
                        const oddLayAjustada = layOdd - comissao;
                        const stakeLay = (backStake * backOdd) / oddLayAjustada;
                        const responsabilidade = stakeLay * (layOdd - 1);
                        const lucroSeBackGanhar = (backStake * (backOdd - 1)) - responsabilidade;
                        const lucroSeLayGanhar = (stakeLay * (1 - comissao)) - backStake;
                        const lucroGarantido = Math.min(lucroSeBackGanhar, lucroSeLayGanhar);
                        
                        return (
                          <div className="flex items-center justify-between text-xs pt-1 border-t border-border/50">
                            <span className="text-muted-foreground">Lucro Esperado:</span>
                            <span className={`font-medium flex items-center gap-0.5 ${lucroGarantido >= 0 ? 'text-emerald-500' : 'text-red-500'}`}>
                              {lucroGarantido >= 0 ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
                              {formatCurrency(lucroGarantido)}
                            </span>
                          </div>
                        );
                      }
                      
                      // Se tem resultado, mostrar P/L real
                      if (profit === null) return null;
                      const roi = (profit / aposta.stake) * 100;
                      return (
                        <div className="flex items-center justify-between text-xs pt-1 border-t border-border/50">
                          <span className="text-muted-foreground">P/L da Operação:</span>
                          <div className="flex items-center gap-2">
                            <span className={`font-medium flex items-center gap-0.5 ${profit >= 0 ? 'text-emerald-500' : 'text-red-500'}`}>
                              {profit >= 0 ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
                              {formatCurrency(profit)}
                            </span>
                            <span className={`text-[10px] px-1 py-0.5 rounded ${profit >= 0 ? 'bg-emerald-500/20 text-emerald-400' : 'bg-red-500/20 text-red-400'}`}>
                              {roi.toFixed(1)}%
                            </span>
                          </div>
                        </div>
                      );
                    })()}
                    
                    {/* Tag de Freebet Usada (para qualquer tipo de aposta) */}
                    {aposta.tipo_freebet && aposta.tipo_freebet !== "normal" && (
                      <div className={`flex items-center gap-1 text-[10px] rounded px-1.5 py-0.5 mt-1 ${
                        aposta.tipo_freebet === "freebet_snr" 
                          ? "text-amber-400 bg-amber-500/10 border border-amber-500/20" 
                          : "text-cyan-400 bg-cyan-500/10 border border-cyan-500/20"
                      }`}>
                        <Gift className="h-3 w-3 flex-shrink-0" />
                        <span>{aposta.tipo_freebet === "freebet_snr" ? "Freebet SNR" : "Freebet SR"}</span>
                      </div>
                    )}
                    
                    {/* Tag de Freebet Gerada - contextual baseado no resultado */}
                    {aposta.gerou_freebet && aposta.valor_freebet_gerada && (
                      (aposta.resultado === "PENDENTE" || aposta.resultado === null) ? (
                        <div className="flex items-center gap-1 text-[10px] text-yellow-400 bg-yellow-500/10 border border-yellow-500/20 rounded px-1.5 py-0.5 mt-1">
                          <Clock className="h-3 w-3 flex-shrink-0" />
                          <span>Freebet aguardando: {formatCurrency(aposta.valor_freebet_gerada)}</span>
                        </div>
                      ) : aposta.resultado === "VOID" ? null : (
                        <div className="flex items-center gap-1 text-[10px] text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 rounded px-1.5 py-0.5 mt-1">
                          <Gift className="h-3 w-3 flex-shrink-0" />
                          <span>Freebet liberada: {formatCurrency(aposta.valor_freebet_gerada)}</span>
                        </div>
                      )
                    )}
                    
                    {/* Rodapé: Data + Casas */}
                    <div className="pt-1 space-y-1">
                      {/* Data */}
                      <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
                        <Calendar className="h-2.5 w-2.5" />
                        {format(parseLocalDateTime(aposta.data_aposta), "dd/MM HH:mm", { locale: ptBR })}
                      </div>
                      
                      {/* Para Cobertura: mostrar ambas as casas */}
                      {opType.type === "cobertura" && aposta.bookmaker && (
                        <div className="space-y-0.5">
                          {/* Casa Back */}
                          <div className="flex items-center gap-1.5 text-[10px]">
                            {aposta.bookmaker.bookmakers_catalogo?.logo_url ? (
                              <img 
                                src={aposta.bookmaker.bookmakers_catalogo.logo_url} 
                                alt={aposta.bookmaker.nome}
                                className="h-3.5 w-3.5 rounded-sm object-contain flex-shrink-0"
                              />
                            ) : (
                              <div className="h-3.5 w-3.5 rounded-sm bg-muted flex items-center justify-center flex-shrink-0">
                                <ArrowUp className="h-2 w-2 text-emerald-500" />
                              </div>
                            )}
                            <span className="text-muted-foreground truncate">
                              <span className="font-medium text-foreground">{aposta.bookmaker.nome}</span>
                              {aposta.bookmaker.parceiro?.nome && (
                                <span className="text-[9px] ml-1">- {getFirstLastName(aposta.bookmaker.parceiro.nome)}</span>
                              )}
                            </span>
                          </div>
                          
                          {/* Casa Lay */}
                          {aposta.lay_bookmaker && (
                            <div className="flex items-center gap-1.5 text-[10px]">
                              {aposta.lay_bookmaker.bookmakers_catalogo?.logo_url ? (
                                <img 
                                  src={aposta.lay_bookmaker.bookmakers_catalogo.logo_url} 
                                  alt={aposta.lay_bookmaker.nome}
                                  className="h-3.5 w-3.5 rounded-sm object-contain flex-shrink-0"
                                />
                              ) : (
                                <div className="h-3.5 w-3.5 rounded-sm bg-muted flex items-center justify-center flex-shrink-0">
                                  <ArrowDown className="h-2 w-2 text-rose-500" />
                                </div>
                              )}
                              <span className="text-muted-foreground truncate">
                                <span className="font-medium text-foreground">{aposta.lay_bookmaker.nome}</span>
                                {aposta.lay_bookmaker.parceiro?.nome && (
                                  <span className="text-[9px] ml-1">- {getFirstLastName(aposta.lay_bookmaker.parceiro.nome)}</span>
                                )}
                              </span>
                            </div>
                          )}
                        </div>
                      )}
                      
                      {/* Para outros tipos: mostrar apenas uma casa */}
                      {opType.type !== "cobertura" && aposta.bookmaker && (
                        <div className="flex items-center gap-1.5 text-[10px]">
                          {aposta.bookmaker.bookmakers_catalogo?.logo_url ? (
                            <img 
                              src={aposta.bookmaker.bookmakers_catalogo.logo_url} 
                              alt={aposta.bookmaker.nome}
                              className="h-4 w-4 rounded-sm object-contain flex-shrink-0"
                            />
                          ) : (
                            <div className="h-4 w-4 rounded-sm bg-muted flex items-center justify-center flex-shrink-0">
                              <Target className="h-2.5 w-2.5 text-muted-foreground" />
                            </div>
                          )}
                          <span className="truncate text-muted-foreground">
                            <span className="font-medium text-foreground">{displayInfo.primaryLine}</span>
                            {displayInfo.secondaryLine && (
                              <span className="text-[9px] ml-1">- {displayInfo.secondaryLine}</span>
                            )}
                          </span>
                        </div>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
              );
            }
            
            // Card de Aposta Múltipla
            const am = item.data as ApostaMultipla;
            const parceiroNome = am.bookmaker?.parceiro?.nome ? getFirstLastName(am.bookmaker.parceiro.nome) : null;
            
            return (
              <Card 
                key={am.id} 
                className="hover:border-primary/50 transition-colors cursor-pointer border-l-2 border-l-purple-500"
                onClick={() => handleOpenMultiplaDialog(am)}
              >
                <CardHeader className="pb-1 pt-3 px-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <CardTitle className="text-sm truncate">Aposta Múltipla</CardTitle>
                      <p className="text-xs text-muted-foreground truncate">
                        {am.selecoes.length} seleções
                      </p>
                    </div>
                    <div className="flex gap-1 flex-shrink-0 items-center">
                      <Badge className="bg-purple-500/20 text-purple-400 border-purple-500/30 text-[10px] px-1.5 py-0">
                        <Layers className="h-2.5 w-2.5 mr-0.5" />
                        {am.tipo_multipla}
                      </Badge>
                      <Badge className={getResultadoColor(am.resultado)}>
                        {getResultadoLabel(am.resultado) || "Pendente"}
                      </Badge>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="pt-1 pb-3 px-3">
                  <div className="space-y-1">
                    {/* Seleções */}
                    <div className="space-y-1 mb-2">
                      {am.selecoes.map((sel, idx) => (
                        <div key={idx} className={`flex items-center justify-between text-xs p-1.5 rounded ${
                          sel.resultado === "GREEN" ? "bg-emerald-500/10" :
                          sel.resultado === "MEIO_GREEN" ? "bg-teal-500/10" :
                          sel.resultado === "RED" ? "bg-red-500/10" :
                          sel.resultado === "MEIO_RED" ? "bg-orange-500/10" :
                          sel.resultado === "VOID" ? "bg-gray-500/10" :
                          "bg-muted/30"
                        }`}>
                          <span className="text-muted-foreground truncate flex-1 text-[11px]">
                            {sel.descricao || `Seleção ${idx + 1}`}
                          </span>
                          <div className="flex items-center gap-1.5 ml-2">
                            <span className="font-medium">@{parseFloat(sel.odd).toFixed(2)}</span>
                            {sel.resultado && sel.resultado !== "PENDENTE" && (
                              <span className={`text-[9px] px-1 rounded ${
                                sel.resultado === "GREEN" ? "bg-emerald-500/20 text-emerald-400" :
                                sel.resultado === "MEIO_GREEN" ? "bg-teal-500/20 text-teal-400" :
                                sel.resultado === "RED" ? "bg-red-500/20 text-red-400" :
                                sel.resultado === "MEIO_RED" ? "bg-orange-500/20 text-orange-400" :
                                "bg-gray-500/20 text-gray-400"
                              }`}>
                                {sel.resultado === "MEIO_GREEN" ? "½G" : 
                                 sel.resultado === "MEIO_RED" ? "½R" : 
                                 sel.resultado}
                              </span>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                    
                    {/* Stake e Odd */}
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-muted-foreground">Stake:</span>
                      <span className="font-medium">{formatCurrency(am.stake)}</span>
                    </div>
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-muted-foreground">Odd Final:</span>
                      <span className="font-medium">@{am.odd_final.toFixed(3)}</span>
                    </div>
                    
                    {/* Retorno / Lucro */}
                    {am.resultado === "PENDENTE" || !am.resultado ? (
                      <div className="flex items-center justify-between text-xs pt-1 border-t border-border/50">
                        <span className="text-muted-foreground">Retorno Potencial:</span>
                        <span className="font-medium text-emerald-400">
                          {formatCurrency(am.retorno_potencial || am.stake * am.odd_final)}
                        </span>
                      </div>
                    ) : (
                      <div className="flex items-center justify-between text-xs pt-1 border-t border-border/50">
                        <span className="text-muted-foreground">P/L:</span>
                        <div className="flex items-center gap-2">
                          <span className={`font-medium flex items-center gap-0.5 ${(am.lucro_prejuizo || 0) >= 0 ? 'text-emerald-500' : 'text-red-500'}`}>
                            {(am.lucro_prejuizo || 0) >= 0 ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
                            {formatCurrency(am.lucro_prejuizo || 0)}
                          </span>
                          <span className={`text-[10px] px-1 py-0.5 rounded ${(am.lucro_prejuizo || 0) >= 0 ? 'bg-emerald-500/20 text-emerald-400' : 'bg-red-500/20 text-red-400'}`}>
                            {(((am.lucro_prejuizo || 0) / am.stake) * 100).toFixed(1)}%
                          </span>
                        </div>
                      </div>
                    )}
                    
                    {/* Freebet Usada */}
                    {am.tipo_freebet && am.tipo_freebet !== "normal" && (
                      <div className="flex items-center gap-1 text-[10px] text-amber-400 bg-amber-500/10 border border-amber-500/20 rounded px-1.5 py-0.5 mt-1">
                        <Gift className="h-3 w-3 flex-shrink-0" />
                        <span>Freebet SNR</span>
                      </div>
                    )}
                    
                    {/* Tag de Freebet Gerada - contextual baseado no resultado */}
                    {am.gerou_freebet && am.valor_freebet_gerada && (
                      (am.resultado === "PENDENTE" || am.resultado === null) ? (
                        <div className="flex items-center gap-1 text-[10px] text-yellow-400 bg-yellow-500/10 border border-yellow-500/20 rounded px-1.5 py-0.5 mt-1">
                          <Clock className="h-3 w-3 flex-shrink-0" />
                          <span>Freebet aguardando: {formatCurrency(am.valor_freebet_gerada)}</span>
                        </div>
                      ) : am.resultado === "VOID" ? null : (
                        <div className="flex items-center gap-1 text-[10px] text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 rounded px-1.5 py-0.5 mt-1">
                          <Gift className="h-3 w-3 flex-shrink-0" />
                          <span>Freebet liberada: {formatCurrency(am.valor_freebet_gerada)}</span>
                        </div>
                      )
                    )}
                    
                    {/* Rodapé: Data + Casa */}
                    <div className="pt-1 space-y-1">
                      <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
                        <Calendar className="h-2.5 w-2.5" />
                        {format(parseLocalDateTime(am.data_aposta), "dd/MM HH:mm", { locale: ptBR })}
                      </div>
                      
                      {am.bookmaker && (
                        <div className="flex items-center gap-1.5 text-[10px]">
                          {am.bookmaker.bookmakers_catalogo?.logo_url ? (
                            <img 
                              src={am.bookmaker.bookmakers_catalogo.logo_url} 
                              alt={am.bookmaker.nome}
                              className="h-4 w-4 rounded-sm object-contain flex-shrink-0"
                            />
                          ) : (
                            <div className="h-4 w-4 rounded-sm bg-muted flex items-center justify-center flex-shrink-0">
                              <Layers className="h-2.5 w-2.5 text-purple-400" />
                            </div>
                          )}
                          <span className="truncate text-muted-foreground">
                            <span className="font-medium text-foreground">{am.bookmaker.nome}</span>
                            {parceiroNome && (
                              <span className="text-[9px] ml-1">- {parceiroNome}</span>
                            )}
                          </span>
                        </div>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      ) : (
        <Card>
          <ScrollArea className="h-[600px]">
            <div className="divide-y">
              {apostasUnificadas.map((item) => {
                // Row para Surebet - clicável para editar
                if (item.tipo === "surebet") {
                  const sb = item.data as Surebet;
                  const isLiquidada = sb.status === "LIQUIDADA";
                  const lucro = isLiquidada ? (sb.lucro_real || 0) : (sb.lucro_esperado || 0);
                  const roi = isLiquidada ? (sb.roi_real || 0) : (sb.roi_esperado || 0);
                  
                  return (
                    <div
                      key={sb.id}
                      className="flex items-center justify-between p-4 hover:bg-muted/50 cursor-pointer border-l-2 border-l-amber-500"
                      onClick={() => {
                        const surebetData: SurebetData = {
                          ...sb,
                          pernas: sb.pernas?.map(p => ({
                            id: p.id,
                            selecao: p.selecao,
                            odd: p.odd,
                            stake: p.stake,
                            resultado: p.resultado,
                            bookmaker_nome: p.bookmaker?.nome || "—"
                          }))
                        };
                        setSelectedSurebet(surebetData);
                        setDialogSurebetOpen(true);
                      }}
                    >
                      <div className="flex items-center gap-4 flex-1 min-w-0">
                        <div className="h-8 w-8 rounded-lg bg-amber-500/10 flex items-center justify-center flex-shrink-0">
                          <ArrowLeftRight className="h-4 w-4 text-amber-400" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <p className="font-medium truncate">{sb.evento}</p>
                            <Badge className="bg-amber-500/20 text-amber-400 border-amber-500/30 text-[10px] px-1.5 py-0">
                              SUREBET
                            </Badge>
                          </div>
                          <p className="text-sm text-muted-foreground truncate">
                            {sb.esporte} • {sb.modelo} • {sb.pernas?.length || 0} pernas
                          </p>
                          <div className="flex items-center gap-1 text-xs mt-1">
                            <Calendar className="h-2.5 w-2.5 text-muted-foreground" />
                            <span className="text-muted-foreground">
                              {format(parseLocalDateTime(sb.data_operacao), "dd/MM HH:mm", { locale: ptBR })}
                            </span>
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-4 flex-shrink-0">
                        <div className="text-right space-y-0.5">
                          <div className="flex items-center justify-end gap-2">
                            <span className="text-xs text-muted-foreground">Stake:</span>
                            <p className="text-sm font-medium">{formatCurrency(sb.stake_total)}</p>
                          </div>
                          <div className="flex items-center justify-end gap-2">
                            <span className="text-xs text-muted-foreground">{isLiquidada ? "Lucro:" : "Lucro Esp.:"}</span>
                            <p className={`text-sm ${lucro >= 0 ? 'text-emerald-500' : 'text-red-500'}`}>
                              {formatCurrency(lucro)}
                            </p>
                            <span className={`text-[10px] px-1 py-0.5 rounded ${roi >= 0 ? 'bg-emerald-500/20 text-emerald-400' : 'bg-red-500/20 text-red-400'}`}>
                              {roi.toFixed(2)}%
                            </span>
                          </div>
                        </div>
                        <Badge className={isLiquidada 
                          ? "bg-emerald-500/20 text-emerald-400 border-emerald-500/30" 
                          : "bg-blue-500/20 text-blue-400 border-blue-500/30"
                        }>
                          {isLiquidada ? "Liquidada" : "Pendente"}
                        </Badge>
                      </div>
                    </div>
                  );
                }
                
                if (item.tipo === "multipla") {
                  // Row para Aposta Múltipla
                  const am = item.data as ApostaMultipla;
                  const parceiroNome = am.bookmaker?.parceiro?.nome ? getFirstLastName(am.bookmaker.parceiro.nome) : null;
                  
                  return (
                    <div
                      key={am.id}
                      className="flex items-center justify-between p-4 hover:bg-muted/50 cursor-pointer border-l-2 border-l-purple-500"
                      onClick={() => handleOpenMultiplaDialog(am)}
                    >
                      <div className="flex items-center gap-4 flex-1 min-w-0">
                        {/* Logo da casa */}
                        {am.bookmaker?.bookmakers_catalogo?.logo_url ? (
                          <img 
                            src={am.bookmaker.bookmakers_catalogo.logo_url} 
                            alt={am.bookmaker.nome}
                            className="h-8 w-8 rounded-lg object-contain bg-muted/50 p-0.5 flex-shrink-0"
                          />
                        ) : (
                          <div className="h-8 w-8 rounded-lg bg-purple-500/10 flex items-center justify-center flex-shrink-0">
                            <Layers className="h-4 w-4 text-purple-400" />
                          </div>
                        )}
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <p className="font-medium truncate">Aposta Múltipla</p>
                            <Badge className="bg-purple-500/20 text-purple-400 border-purple-500/30 text-[10px] px-1.5 py-0">
                              {am.tipo_multipla}
                            </Badge>
                          </div>
                          <p className="text-sm text-muted-foreground truncate">
                            {am.selecoes.map(s => s.descricao).join(" • ")} @ {am.odd_final.toFixed(3)}
                          </p>
                          {am.bookmaker && (
                            <div className="flex items-center gap-1 text-xs mt-1">
                              <span className="font-medium text-foreground">{am.bookmaker.nome}</span>
                              {parceiroNome && <span className="text-[10px] text-muted-foreground">- {parceiroNome}</span>}
                            </div>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-4 flex-shrink-0">
                        <div className="text-right space-y-0.5">
                          <div className="flex items-center justify-end gap-2">
                            <span className="text-xs text-muted-foreground">Stake:</span>
                            <p className="text-sm font-medium">{formatCurrency(am.stake)}</p>
                          </div>
                          <div className="flex items-center justify-end gap-2">
                            <span className="text-xs text-muted-foreground">P/L:</span>
                            <p className={`text-sm ${(am.lucro_prejuizo || 0) >= 0 ? 'text-emerald-500' : 'text-red-500'}`}>
                              {formatCurrency(am.lucro_prejuizo || 0)}
                            </p>
                            <span className={`text-[10px] px-1 py-0.5 rounded ${(am.lucro_prejuizo || 0) >= 0 ? 'bg-emerald-500/20 text-emerald-400' : 'bg-red-500/20 text-red-400'}`}>
                              {(((am.lucro_prejuizo || 0) / am.stake) * 100).toFixed(1)}%
                            </span>
                          </div>
                        </div>
                        <Badge className={getResultadoColor(am.resultado)}>
                          {getResultadoLabel(am.resultado) || "Pendente"}
                        </Badge>
                      </div>
                    </div>
                  );
                }
                
                // Row para Aposta Simples
                const aposta = item.data as Aposta;
                const opType = getOperationType(aposta);
                const isPending = aposta.resultado === null || aposta.resultado === "PENDENTE";
                const profit = getCalculatedProfit(aposta);
                const isFreebetExtraction = aposta.estrategia === "COBERTURA_LAY" && aposta.back_em_exchange === true;
                
                const tipoFreebet = (aposta as any).tipo_freebet;
                const freebetLabel = tipoFreebet === "freebet_snr" ? "SNR" : tipoFreebet === "freebet_sr" ? "SR" : null;
                
                let coberturaData: { responsabilidade: number; lucroGarantido: number } | null = null;
                if (opType.type === "cobertura") {
                  const backOdd = aposta.odd;
                  const backStake = aposta.stake;
                  const layOdd = aposta.lay_odd || 2;
                  const comissao = (aposta.lay_comissao || 5) / 100;
                  const oddLayAjustada = layOdd - comissao;
                  const multiplicador = tipoFreebet === "freebet_snr" ? (backOdd - 1) : backOdd;
                  const stakeLay = (backStake * multiplicador) / oddLayAjustada;
                  const responsabilidade = stakeLay * (layOdd - 1);
                  let lucroSeBackGanhar: number;
                  let lucroSeLayGanhar: number;
                  if (tipoFreebet === "freebet_snr") {
                    lucroSeBackGanhar = (backStake * (backOdd - 1)) - responsabilidade;
                    lucroSeLayGanhar = stakeLay * (1 - comissao);
                  } else if (tipoFreebet === "freebet_sr") {
                    lucroSeBackGanhar = (backStake * backOdd) - backStake - responsabilidade;
                    lucroSeLayGanhar = (stakeLay * (1 - comissao)) - backStake;
                  } else {
                    lucroSeBackGanhar = (backStake * (backOdd - 1)) - responsabilidade;
                    lucroSeLayGanhar = (stakeLay * (1 - comissao)) - backStake;
                  }
                  const lucroGarantido = Math.min(lucroSeBackGanhar, lucroSeLayGanhar);
                  coberturaData = { responsabilidade, lucroGarantido };
                }
                
                return (
                  <div
                    key={aposta.id}
                    className="flex items-center justify-between p-4 hover:bg-muted/50"
                  >
                    <div className="flex items-center gap-4 flex-1 min-w-0">
                      {/* Coluna de casas/logos */}
                      <div className="flex flex-col gap-1 flex-shrink-0">
                        {/* Casa Back */}
                        {aposta.bookmaker?.bookmakers_catalogo?.logo_url ? (
                          <img 
                            src={aposta.bookmaker.bookmakers_catalogo.logo_url} 
                            alt={aposta.bookmaker.nome}
                            className="h-8 w-8 rounded-lg object-contain bg-muted/50 p-0.5"
                          />
                        ) : (
                          <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center">
                            {opType.type === "cobertura" ? (
                              <ArrowUp className="h-4 w-4 text-emerald-500" />
                            ) : (
                              <Target className="h-4 w-4 text-primary" />
                            )}
                          </div>
                        )}
                        
                        {/* Casa Lay (apenas para cobertura) */}
                        {opType.type === "cobertura" && (
                          aposta.lay_bookmaker?.bookmakers_catalogo?.logo_url ? (
                            <img 
                              src={aposta.lay_bookmaker.bookmakers_catalogo.logo_url} 
                              alt={aposta.lay_bookmaker.nome}
                              className="h-8 w-8 rounded-lg object-contain bg-muted/50 p-0.5"
                            />
                          ) : (
                            <div className="h-8 w-8 rounded-lg bg-rose-500/10 flex items-center justify-center">
                              <ArrowDown className="h-4 w-4 text-rose-500" />
                            </div>
                          )
                        )}
                      </div>
                      
                      {/* Informações do evento e casas */}
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="font-medium truncate">{aposta.evento}</p>
                          
                          {/* Badges de tipo */}
                          {opType.label && (
                            <Badge className={`${opType.color} text-[10px] px-1.5 py-0 flex-shrink-0`}>
                              {opType.type === "cobertura" && <Shield className="h-2.5 w-2.5 mr-0.5" />}
                              {opType.type === "back" && <ArrowUp className="h-2.5 w-2.5 mr-0.5" />}
                              {opType.type === "lay" && <ArrowDown className="h-2.5 w-2.5 mr-0.5" />}
                              {opType.label}
                            </Badge>
                          )}
                          
                          {/* Badge resultado cobertura */}
                          {opType.type === "cobertura" && aposta.resultado && aposta.resultado !== "PENDENTE" && (
                            <Badge className={`text-[10px] px-1.5 py-0 flex-shrink-0 ${
                              aposta.resultado === "GREEN_BOOKMAKER" 
                                ? "bg-emerald-500/20 text-emerald-400 border-emerald-500/30" 
                                : aposta.resultado === "RED_BOOKMAKER"
                                  ? "bg-sky-500/20 text-sky-400 border-sky-500/30"
                                  : "bg-gray-500/20 text-gray-400 border-gray-500/30"
                            }`}>
                              {aposta.resultado === "GREEN_BOOKMAKER" ? "Green Book" : aposta.resultado === "RED_BOOKMAKER" ? "Green Lay" : "Void"}
                            </Badge>
                          )}
                          
                          {/* Badge tipo freebet */}
                          {freebetLabel && (
                            <Badge className="bg-amber-500/20 text-amber-400 border-amber-500/30 text-[10px] px-1.5 py-0 flex-shrink-0">
                              <Gift className="h-2.5 w-2.5 mr-0.5" />
                              Freebet {freebetLabel}
                            </Badge>
                          )}
                          
                          {/* Badge freebet gerada */}
                          {aposta.gerou_freebet && aposta.valor_freebet_gerada && (
                            <Badge className="bg-amber-500/10 text-amber-400 border-amber-500/20 text-[10px] px-1.5 py-0 flex-shrink-0">
                              <Gift className="h-2.5 w-2.5 mr-0.5" />
                              +{formatCurrency(aposta.valor_freebet_gerada)}
                            </Badge>
                          )}
                        </div>
                        
                        {/* Linha de detalhes */}
                        <p className="text-sm text-muted-foreground truncate">
                          {aposta.esporte} • {aposta.selecao} @ {aposta.odd.toFixed(2)} • {format(parseLocalDateTime(aposta.data_aposta), "dd/MM HH:mm", { locale: ptBR })}
                        </p>
                        
                        {/* Casas e vínculos */}
                        <div className="mt-1 space-y-0.5">
                          {/* Casa Back + Vínculo */}
                          {aposta.bookmaker && (
                            <div className="flex items-center gap-1 text-xs">
                              <span className="font-medium text-foreground">{aposta.bookmaker.nome}</span>
                              {aposta.bookmaker.parceiro?.nome && (
                                <span className="text-[10px] text-muted-foreground">- {getFirstLastName(aposta.bookmaker.parceiro.nome)}</span>
                              )}
                            </div>
                          )}
                          
                          {/* Casa Lay + Vínculo (apenas para cobertura) */}
                          {opType.type === "cobertura" && aposta.lay_bookmaker && (
                            <div className="flex items-center gap-1 text-xs text-muted-foreground/80">
                              <span className="font-medium text-foreground/80">{aposta.lay_bookmaker.nome}</span>
                              {aposta.lay_bookmaker.parceiro?.nome && (
                                <span className="text-[10px]">- {getFirstLastName(aposta.lay_bookmaker.parceiro.nome)}</span>
                              )}
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                    
                    {/* Coluna de valores */}
                    <div className="flex items-center gap-4 flex-shrink-0">
                      <div className="text-right space-y-0.5">
                        {/* Stake */}
                        <div className="flex items-center justify-end gap-2">
                          <span className="text-xs text-muted-foreground">Stake:</span>
                          <p className="text-sm font-medium">{formatCurrency(aposta.stake)}</p>
                        </div>
                        
                        {/* Responsabilidade (para cobertura/lay) */}
                        {(opType.type === "cobertura" || opType.type === "lay") && coberturaData && (
                          <div className="flex items-center justify-end gap-2">
                            <span className="text-xs text-muted-foreground">Resp.:</span>
                            <p className="text-sm text-rose-400">{formatCurrency(coberturaData.responsabilidade)}</p>
                          </div>
                        )}
                        
                        {/* P/L ou Lucro Garantido */}
                        {(() => {
                          // Para Exchange Back/Lay, mostrar dados específicos
                          if (opType.type === "back" || opType.type === "lay") {
                            const exchangeData = getExchangeDisplayData(aposta);
                            if (exchangeData.isExchange) {
                              return (
                                <div className="flex items-center justify-end gap-2">
                                  <span className="text-xs text-muted-foreground">Lucro Pot.:</span>
                                  <p className="text-sm text-sky-400">
                                    {formatCurrency(exchangeData.lucroPotencial || 0)}
                                  </p>
                                  <span className="text-[10px] px-1 py-0.5 rounded bg-muted text-muted-foreground">
                                    {exchangeData.comissao?.toFixed(1)}%
                                  </span>
                                </div>
                              );
                            }
                          }
                          
                          // Para Cobertura
                          if (opType.type === "cobertura" && coberturaData) {
                            if (isPending) {
                              // Mostrar lucro garantido esperado
                              return (
                                <div className="flex items-center justify-end gap-2">
                                  <span className="text-xs text-muted-foreground">Lucro Gar.:</span>
                                  <p className={`text-sm font-medium flex items-center gap-0.5 ${coberturaData.lucroGarantido >= 0 ? 'text-emerald-500' : 'text-red-500'}`}>
                                    {coberturaData.lucroGarantido >= 0 ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
                                    {formatCurrency(coberturaData.lucroGarantido)}
                                  </p>
                                </div>
                              );
                            } else if (profit !== null) {
                              // Mostrar P/L real
                              return (
                                <div className="flex items-center justify-end gap-2">
                                  <span className="text-xs text-muted-foreground">P/L:</span>
                                  <p className={`text-sm font-medium ${profit >= 0 ? 'text-emerald-500' : 'text-red-500'}`}>
                                    {formatCurrency(profit)}
                                  </p>
                                  <span className={`text-[10px] px-1 py-0.5 rounded ${profit >= 0 ? 'bg-emerald-500/20 text-emerald-400' : 'bg-red-500/20 text-red-400'}`}>
                                    {((profit / aposta.stake) * 100).toFixed(1)}%
                                  </span>
                                </div>
                              );
                            }
                            return null;
                          }
                          
                          // Para Bookmaker normal, mostrar P/L
                          if (profit === null) return null;
                          return (
                            <div className="flex items-center justify-end gap-2">
                              <span className="text-xs text-muted-foreground">P/L:</span>
                              <p className={`text-sm ${profit >= 0 ? 'text-emerald-500' : 'text-red-500'}`}>
                                {formatCurrency(profit)}
                              </p>
                              <span className={`text-[10px] px-1 py-0.5 rounded ${profit >= 0 ? 'bg-emerald-500/20 text-emerald-400' : 'bg-red-500/20 text-red-400'}`}>
                                {((profit / aposta.stake) * 100).toFixed(1)}%
                              </span>
                            </div>
                          );
                        })()}
                      </div>
                      
                      <ResultadoPill
                        apostaId={aposta.id}
                        bookmarkerId={aposta.bookmaker_id}
                        layExchangeBookmakerId={opType.type === "cobertura" ? aposta.lay_exchange : undefined}
                        resultado={aposta.resultado}
                        status={aposta.status}
                        stake={aposta.stake}
                        odd={aposta.odd}
                        operationType={opType.type}
                        layLiability={aposta.lay_liability || undefined}
                        layOdd={aposta.lay_odd || undefined}
                        layStake={aposta.lay_stake || undefined}
                        layComissao={aposta.lay_comissao || undefined}
                        isFreebetExtraction={isFreebetExtraction}
                        gerouFreebet={aposta.gerou_freebet || false}
                        onResultadoUpdated={handleApostaUpdated}
                        onEditClick={() => handleOpenDialog(aposta)}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </ScrollArea>
        </Card>
      )}

      {/* Dialog Aposta Simples */}
      <ApostaDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        aposta={selectedAposta}
        projetoId={projetoId}
        onSuccess={() => {
          fetchAllApostas();
          onDataChange?.();
        }}
      />

      {/* Dialog Aposta Múltipla */}
      <ApostaMultiplaDialog
        open={dialogMultiplaOpen}
        onOpenChange={setDialogMultiplaOpen}
        aposta={selectedApostaMultipla}
        projetoId={projetoId}
        onSuccess={() => {
          fetchAllApostas();
          onDataChange?.();
        }}
      />

      {/* Dialog Surebet */}
      <SurebetDialog
        open={dialogSurebetOpen}
        onOpenChange={setDialogSurebetOpen}
        projetoId={projetoId}
        bookmakers={bookmakers}
        surebet={selectedSurebet}
        onSuccess={() => {
          fetchAllApostas();
          onDataChange?.();
        }}
      />
    </div>
  );
}