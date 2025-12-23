import { useState, useEffect, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import { 
  Search, 
  Target,
  LayoutGrid,
  List,
  ArrowUp,
  ArrowDown,
  Shield,
  Coins,
  Gift,
  Filter,
  Zap,
  TrendingUp,
  CheckCircle2,
  BarChart3
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
import { useProjectBonuses } from "@/hooks/useProjectBonuses";
import { DateRange } from "react-day-picker";
import { startOfDay, endOfDay, subDays, startOfMonth, startOfYear } from "date-fns";
import { ESTRATEGIAS_LIST, inferEstrategiaLegado, type ApostaEstrategia } from "@/lib/apostaConstants";
import { StandardTimeFilter, StandardPeriodFilter, getDateRangeFromPeriod, DateRange as FilterDateRange } from "./StandardTimeFilter";

// Contextos de aposta para filtro unificado
type ApostaContexto = "NORMAL" | "FREEBET" | "BONUS" | "SUREBET";

interface ProjetoApostasTabProps {
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
  is_bonus_bet?: boolean;
  surebet_id?: string | null;
  contexto_operacional?: string | null;
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
  is_bonus_bet?: boolean;
  contexto_operacional?: string | null;
  estrategia?: string | null;
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
  pernas?: {
    id: string;
    bookmaker_id: string;
    selecao: string;
    odd: number;
    stake: number;
    resultado: string | null;
    tipo_freebet?: string | null;
    gerou_freebet?: boolean;
    is_bonus_bet?: boolean;
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
  contexto: ApostaContexto;
};

// Função para determinar o contexto de uma aposta
function getApostaContexto(
  aposta: Aposta | ApostaMultipla,
  bookmakersComBonusAtivo: string[]
): ApostaContexto {
  // PRIORIDADE 1: Se tem contexto_operacional explícito salvo no BD, usar diretamente
  if ('contexto_operacional' in aposta && aposta.contexto_operacional) {
    const ctx = aposta.contexto_operacional as ApostaContexto;
    if (["NORMAL", "FREEBET", "BONUS", "SUREBET"].includes(ctx)) {
      return ctx;
    }
  }
  
  // FALLBACK para registros legados sem contexto_operacional:
  
  // Verifica se é parte de uma surebet (apostas simples only)
  if ('surebet_id' in aposta && aposta.surebet_id) {
    return "SUREBET";
  }
  
  // Verifica se usou/gerou freebet
  if (aposta.tipo_freebet || aposta.gerou_freebet) {
    return "FREEBET";
  }
  
  // Verifica se é aposta de bônus ou se o bookmaker tem bônus ativo
  if (aposta.is_bonus_bet || bookmakersComBonusAtivo.includes(aposta.bookmaker_id)) {
    return "BONUS";
  }
  
  return "NORMAL";
}

function getSurebetContexto(
  surebet: Surebet,
  bookmakersComBonusAtivo: string[]
): ApostaContexto {
  // Verifica se alguma perna usa freebet
  const hasFreebetPerna = surebet.pernas?.some(p => p.tipo_freebet || p.gerou_freebet);
  if (hasFreebetPerna) return "FREEBET";
  
  // Verifica se alguma perna tem bônus ativo
  const hasBonusPerna = surebet.pernas?.some(p => 
    p.is_bonus_bet || bookmakersComBonusAtivo.includes(p.bookmaker_id)
  );
  if (hasBonusPerna) return "BONUS";
  
  return "NORMAL";
}

export function ProjetoApostasTab({ projetoId, onDataChange, refreshTrigger }: ProjetoApostasTabProps) {
  const [apostas, setApostas] = useState<Aposta[]>([]);
  const [apostasMultiplas, setApostasMultiplas] = useState<ApostaMultipla[]>([]);
  const [surebets, setSurebets] = useState<Surebet[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [resultadoFilter, setResultadoFilter] = useState<string>("all");
  const [contextoFilter, setContextoFilter] = useState<ApostaContexto | "all">("all");
  const [estrategiaFilter, setEstrategiaFilter] = useState<string>("all");
  const [tipoFilter, setTipoFilter] = useState<"todas" | "simples" | "multiplas" | "surebets">("todas");
  const [viewMode, setViewMode] = useState<"cards" | "list">("cards");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [dialogMultiplaOpen, setDialogMultiplaOpen] = useState(false);
  const [dialogSurebetOpen, setDialogSurebetOpen] = useState(false);
  const [selectedAposta, setSelectedAposta] = useState<Aposta | null>(null);
  const [selectedApostaMultipla, setSelectedApostaMultipla] = useState<ApostaMultipla | null>(null);
  const [selectedSurebet, setSelectedSurebet] = useState<SurebetData | null>(null);
  const [bookmakers, setBookmakers] = useState<any[]>([]);

  // Filtro de tempo interno
  const [internalPeriod, setInternalPeriod] = useState<StandardPeriodFilter>("30dias");
  const [internalDateRange, setInternalDateRange] = useState<FilterDateRange | undefined>(undefined);

  // Hook para pegar bookmakers com bônus ativo
  const { getBookmakersWithActiveBonus, bonuses } = useProjectBonuses({ projectId: projetoId });
  const bookmakersComBonusAtivo = useMemo(() => getBookmakersWithActiveBonus(), [bonuses]);

  const dateRange = useMemo(() => getDateRangeFromPeriod(internalPeriod, internalDateRange), [internalPeriod, internalDateRange]);

  useEffect(() => {
    fetchAllApostas();
  }, [projetoId, internalPeriod, internalDateRange, refreshTrigger]);

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
        .is("surebet_id", null) // CRÍTICO: Excluir pernas de surebet - elas são estrutura interna da operação
        .order("data_aposta", { ascending: false });
      
      if (dateRange) {
        query = query.gte("data_aposta", dateRange.start.toISOString());
        query = query.lte("data_aposta", dateRange.end.toISOString());
      }

      const { data, error } = await query;

      if (error) throw error;
      
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
      
      if (dateRange) {
        query = query.gte("data_aposta", dateRange.start.toISOString());
        query = query.lte("data_aposta", dateRange.end.toISOString());
      }

      const { data, error } = await query;

      if (error) throw error;
      
      setApostasMultiplas((data || []).map((am: any) => ({
        ...am,
        selecoes: Array.isArray(am.selecoes) ? am.selecoes : []
      })));
    } catch (error: any) {
      console.error("Erro ao carregar apostas múltiplas:", error.message);
    }
  };

  const fetchSurebets = async () => {
    try {
      let query = supabase
        .from("surebets")
        .select("*")
        .eq("projeto_id", projetoId)
        .order("data_operacao", { ascending: false });
      
      if (dateRange) {
        query = query.gte("data_operacao", dateRange.start.toISOString());
        query = query.lte("data_operacao", dateRange.end.toISOString());
      }

      const { data, error } = await query;

      if (error) throw error;
      
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
            tipo_freebet,
            gerou_freebet,
            is_bonus_bet,
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

  // Filtrar e unificar apostas com contexto
  const apostasUnificadas: ApostaUnificada[] = useMemo(() => {
    const result: ApostaUnificada[] = [];
    
    // Apostas simples
    apostas.forEach(aposta => {
      const contexto = getApostaContexto(aposta, bookmakersComBonusAtivo);
      const estrategia = inferEstrategiaLegado(aposta);
      
      // Filtros de busca
      const matchesSearch = 
        aposta.evento.toLowerCase().includes(searchTerm.toLowerCase()) ||
        aposta.esporte.toLowerCase().includes(searchTerm.toLowerCase()) ||
        aposta.selecao.toLowerCase().includes(searchTerm.toLowerCase());
      const matchesStatus = statusFilter === "all" || aposta.status === statusFilter;
      const matchesResultado = resultadoFilter === "all" || aposta.resultado === resultadoFilter;
      const matchesContexto = contextoFilter === "all" || contexto === contextoFilter;
      const matchesEstrategia = estrategiaFilter === "all" || estrategia === estrategiaFilter;
      const matchesTipo = tipoFilter === "todas" || tipoFilter === "simples";
      
      if (matchesSearch && matchesStatus && matchesResultado && matchesContexto && matchesEstrategia && matchesTipo) {
        result.push({
          tipo: "simples",
          data: aposta,
          data_aposta: aposta.data_aposta,
          contexto
        });
      }
    });
    
    // Apostas múltiplas
    apostasMultiplas.forEach(am => {
      const contexto = getApostaContexto(am, bookmakersComBonusAtivo);
      
      const matchesSearch = am.selecoes.some(s => 
        s.descricao.toLowerCase().includes(searchTerm.toLowerCase())
      );
      const matchesStatus = statusFilter === "all" || am.status === statusFilter;
      const matchesResultado = resultadoFilter === "all" || am.resultado === resultadoFilter;
      const matchesContexto = contextoFilter === "all" || contexto === contextoFilter;
      const matchesTipo = tipoFilter === "todas" || tipoFilter === "multiplas";
      
      if ((searchTerm === "" || matchesSearch) && matchesStatus && matchesResultado && matchesContexto && matchesTipo) {
        result.push({
          tipo: "multipla",
          data: am,
          data_aposta: am.data_aposta,
          contexto
        });
      }
    });
    
    // Surebets
    surebets.forEach(sb => {
      const contexto = getSurebetContexto(sb, bookmakersComBonusAtivo);
      
      const matchesSearch = 
        sb.evento.toLowerCase().includes(searchTerm.toLowerCase()) ||
        sb.esporte.toLowerCase().includes(searchTerm.toLowerCase()) ||
        sb.modelo.toLowerCase().includes(searchTerm.toLowerCase());
      const matchesStatus = statusFilter === "all" || sb.status === statusFilter;
      const matchesResultado = resultadoFilter === "all" || sb.resultado === resultadoFilter;
      const matchesContexto = contextoFilter === "all" || contexto === contextoFilter;
      const matchesTipo = tipoFilter === "todas" || tipoFilter === "surebets";
      
      if (matchesSearch && matchesStatus && matchesResultado && matchesContexto && matchesTipo) {
        result.push({
          tipo: "surebet",
          data: sb,
          data_aposta: sb.data_operacao,
          contexto
        });
      }
    });
    
    // Ordenar por data
    return result.sort((a, b) => new Date(b.data_aposta).getTime() - new Date(a.data_aposta).getTime());
  }, [apostas, apostasMultiplas, surebets, bookmakersComBonusAtivo, searchTerm, statusFilter, resultadoFilter, contextoFilter, estrategiaFilter, tipoFilter]);

  // Contadores por contexto
  const contadores = useMemo(() => {
    const all: ApostaUnificada[] = [];
    
    apostas.forEach(a => all.push({ 
      tipo: "simples", 
      data: a, 
      data_aposta: a.data_aposta, 
      contexto: getApostaContexto(a, bookmakersComBonusAtivo) 
    }));
    apostasMultiplas.forEach(am => all.push({ 
      tipo: "multipla", 
      data: am, 
      data_aposta: am.data_aposta, 
      contexto: getApostaContexto(am, bookmakersComBonusAtivo) 
    }));
    surebets.forEach(sb => all.push({ 
      tipo: "surebet", 
      data: sb, 
      data_aposta: sb.data_operacao, 
      contexto: getSurebetContexto(sb, bookmakersComBonusAtivo) 
    }));
    
    return {
      total: all.length,
      normal: all.filter(a => a.contexto === "NORMAL").length,
      freebet: all.filter(a => a.contexto === "FREEBET").length,
      bonus: all.filter(a => a.contexto === "BONUS").length,
      surebet: all.filter(a => a.contexto === "SUREBET").length
    };
  }, [apostas, apostasMultiplas, surebets, bookmakersComBonusAtivo]);

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat("pt-BR", {
      style: "currency",
      currency: "BRL",
    }).format(value);
  };

  const parseLocalDateTime = (dateString: string): Date => {
    if (!dateString) return new Date();
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

  const getOperationType = (aposta: Aposta): { type: "bookmaker" | "back" | "lay" | "cobertura"; label: string; color: string } => {
    // Detectar Cobertura primeiro: modo EXCHANGE + tem lay_exchange + tem lay_odd
    // Isso indica que é uma operação de cobertura (Back + Lay simultâneos)
    const isCobertura = aposta.modo_entrada === "EXCHANGE" && 
                        aposta.lay_exchange && 
                        aposta.lay_odd !== null && 
                        aposta.lay_odd !== undefined;
    
    if (isCobertura) {
      return { type: "cobertura", label: "BACK/LAY", color: "bg-purple-500/20 text-purple-400 border-purple-500/30" };
    }
    
    if (aposta.modo_entrada === "EXCHANGE" || aposta.estrategia?.includes("EXCHANGE") || aposta.estrategia === "COBERTURA_LAY") {
      if (aposta.estrategia === "COBERTURA_LAY") {
        return { type: "cobertura", label: "BACK/LAY", color: "bg-purple-500/20 text-purple-400 border-purple-500/30" };
      }
      if (aposta.estrategia === "EXCHANGE_LAY" || (aposta.lay_odd && !aposta.lay_exchange)) {
        // Lay simples: tem lay_odd mas NÃO tem lay_exchange
        return { type: "lay", label: "LAY", color: "bg-rose-500/20 text-rose-400 border-rose-500/30" };
      }
      return { type: "back", label: "BACK", color: "bg-sky-500/20 text-sky-400 border-sky-500/30" };
    }
    return { type: "bookmaker", label: "", color: "" };
  };

  const getApostaDisplayInfo = (aposta: Aposta) => {
    const opType = getOperationType(aposta);
    const parceiroNome = aposta.bookmaker?.parceiro?.nome ? getFirstLastName(aposta.bookmaker.parceiro.nome) : null;
    
    return {
      primaryLine: aposta.bookmaker?.nome || (opType.type === "bookmaker" ? "" : "Exchange"),
      secondaryLine: parceiroNome,
      badgeType: opType
    };
  };

  // Badge de estratégia (prioridade máxima quando gera freebet = Qualificadora)
  const getEstrategiaBadge = (aposta: Aposta | ApostaMultipla) => {
    // PRIORIDADE 1: Se gerou freebet, é uma Qualificadora
    if (aposta.gerou_freebet) {
      return (
        <Badge className="bg-violet-500/20 text-violet-400 border-violet-500/30 text-[10px] px-1.5 py-0">
          <TrendingUp className="h-2.5 w-2.5 mr-0.5" />
          QB
        </Badge>
      );
    }
    
    // PRIORIDADE 2: Outras estratégias (se definidas)
    const estrategia = aposta.estrategia;
    if (estrategia === "SUREBET") {
      return (
        <Badge className="bg-cyan-500/20 text-cyan-400 border-cyan-500/30 text-[10px] px-1.5 py-0">
          <Shield className="h-2.5 w-2.5 mr-0.5" />
          SB
        </Badge>
      );
    }
    if (estrategia === "DUPLO_GREEN") {
      return (
        <Badge className="bg-teal-500/20 text-teal-400 border-teal-500/30 text-[10px] px-1.5 py-0">
          <CheckCircle2 className="h-2.5 w-2.5 mr-0.5" />
          DG
        </Badge>
      );
    }
    if (estrategia === "VALUEBET") {
      return (
        <Badge className="bg-blue-500/20 text-blue-400 border-blue-500/30 text-[10px] px-1.5 py-0">
          <BarChart3 className="h-2.5 w-2.5 mr-0.5" />
          VB
        </Badge>
      );
    }
    
    // Nenhuma estratégia definida, retorna null
    return null;
  };

  // Badge de contexto (origem do saldo - exibido apenas quando não há estratégia)
  const getContextoBadge = (contexto: ApostaContexto, aposta?: Aposta | ApostaMultipla) => {
    // Se a aposta gerou freebet, não mostrar badge de contexto (a estratégia Qualificadora já é mostrada)
    if (aposta?.gerou_freebet) {
      return null;
    }
    
    switch (contexto) {
      case "SUREBET":
        return (
          <Badge className="bg-cyan-500/20 text-cyan-400 border-cyan-500/30 text-[10px] px-1.5 py-0">
            <Shield className="h-2.5 w-2.5 mr-0.5" />
            SB
          </Badge>
        );
      case "FREEBET":
        return (
          <Badge className="bg-amber-500/20 text-amber-400 border-amber-500/30 text-[10px] px-1.5 py-0">
            <Gift className="h-2.5 w-2.5 mr-0.5" />
            FB
          </Badge>
        );
      case "BONUS":
        return (
          <Badge className="bg-yellow-500/20 text-yellow-400 border-yellow-500/30 text-[10px] px-1.5 py-0">
            <Coins className="h-2.5 w-2.5 mr-0.5" />
            BN
          </Badge>
        );
      case "NORMAL":
        // Contexto normal não precisa de badge - é o padrão
        return null;
      default:
        return null;
    }
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
      {/* Filtro de Tempo - Alinhado à direita */}
      <div className="flex justify-end">
        <StandardTimeFilter
          period={internalPeriod}
          onPeriodChange={setInternalPeriod}
          customDateRange={internalDateRange}
          onCustomDateRangeChange={setInternalDateRange}
        />
      </div>

      {/* Info Banner - Livro Razão */}
      <div className="bg-muted/30 border rounded-lg p-3 text-sm text-muted-foreground flex items-center gap-2">
        <Target className="h-4 w-4 text-primary" />
        <span><strong>Apostas Livres</strong> — Registro completo de todas as apostas do projeto. Use os filtros de contexto para visualizar apostas normais, com freebet ou bônus.</span>
      </div>

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
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Buscar..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10 h-9"
              />
            </div>
            
            {/* Filtro de Contexto */}
            <Select value={contextoFilter} onValueChange={(v) => setContextoFilter(v as ApostaContexto | "all")}>
              <SelectTrigger className="w-[150px] h-9">
                <Filter className="h-4 w-4 mr-2" />
                <SelectValue placeholder="Contexto" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">
                  Todos ({contadores.total})
                </SelectItem>
                <SelectItem value="NORMAL">
                  <span className="flex items-center gap-2">
                    🟢 Normal ({contadores.normal})
                  </span>
                </SelectItem>
                <SelectItem value="FREEBET">
                  <span className="flex items-center gap-2">
                    🟣 Freebet ({contadores.freebet})
                  </span>
                </SelectItem>
                <SelectItem value="BONUS">
                  <span className="flex items-center gap-2">
                    🟡 Bônus ({contadores.bonus})
                  </span>
                </SelectItem>
                <SelectItem value="SUREBET">
                  <span className="flex items-center gap-2">
                    🔵 Surebet ({contadores.surebet})
                  </span>
                </SelectItem>
              </SelectContent>
            </Select>

            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-[130px] h-9">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos Status</SelectItem>
                <SelectItem value="PENDENTE">Pendente</SelectItem>
                <SelectItem value="LIQUIDADA">Liquidada</SelectItem>
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
            
            {/* Filtro de Estratégia */}
            <Select value={estrategiaFilter} onValueChange={setEstrategiaFilter}>
              <SelectTrigger className="w-[150px] h-9">
                <Zap className="h-4 w-4 mr-2" />
                <SelectValue placeholder="Estratégia" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas Estratégias</SelectItem>
                {ESTRATEGIAS_LIST.map(e => (
                  <SelectItem key={e.value} value={e.value}>{e.label}</SelectItem>
                ))}
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
                {searchTerm || statusFilter !== "all" || resultadoFilter !== "all" || contextoFilter !== "all"
                  ? "Tente ajustar os filtros"
                  : "Registre sua primeira aposta"}
              </p>
            </div>
          </CardContent>
        </Card>
      ) : viewMode === "cards" ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {apostasUnificadas.map((item) => {
            // Card de Surebet
            if (item.tipo === "surebet") {
              const sb = item.data as Surebet;
              
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
                    {/* Badges à esquerda - padrão unificado */}
                    <div className="flex items-center gap-1 mb-1 flex-wrap">
                      {getEstrategiaBadge(aposta) || getContextoBadge(item.contexto, aposta)}
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
                        valorFreebetGerada={aposta.valor_freebet_gerada || undefined}
                        onResultadoUpdated={handleApostaUpdated}
                        onEditClick={() => handleOpenDialog(aposta)}
                      />
                    </div>
                    <div className="flex items-start justify-between gap-2">
                      <CardTitle 
                        className="text-sm truncate cursor-pointer hover:text-primary"
                        onClick={() => handleOpenDialog(aposta)}
                      >
                        {aposta.evento}
                      </CardTitle>
                    </div>
                    <p className="text-xs text-muted-foreground truncate">{aposta.esporte}</p>
                  </CardHeader>
                  <CardContent className="pt-1 pb-3 px-3">
                    <div className="space-y-1">
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-muted-foreground truncate flex-1">{aposta.selecao}</span>
                        <span className="font-medium ml-2">@{aposta.odd.toFixed(2)}</span>
                      </div>
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-muted-foreground">Stake</span>
                        <span className="font-medium">{formatCurrency(aposta.stake)}</span>
                      </div>
                      {aposta.lucro_prejuizo !== null && aposta.status === "LIQUIDADA" && (
                        <div className="flex items-center justify-between text-xs">
                          <span className="text-muted-foreground">P/L</span>
                          <span className={`font-medium ${aposta.lucro_prejuizo >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                            {formatCurrency(aposta.lucro_prejuizo)}
                          </span>
                        </div>
                      )}
                      <div className="flex items-center justify-between text-xs pt-1 border-t border-border/50">
                        <span className="text-muted-foreground">
                          {format(parseLocalDateTime(aposta.data_aposta), "dd/MM HH:mm", { locale: ptBR })}
                        </span>
                        <span className="text-muted-foreground truncate ml-2 max-w-[100px]">
                          {displayInfo.primaryLine}
                        </span>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            }

            // Card de Múltipla
            const multipla = item.data as ApostaMultipla;
            return (
              <Card 
                key={multipla.id}
                className="hover:border-primary/50 transition-colors cursor-pointer"
                onClick={() => handleOpenMultiplaDialog(multipla)}
              >
                <CardHeader className="pb-1 pt-3 px-3">
                  {/* Badges à esquerda - padrão unificado */}
                  <div className="flex items-center gap-1 mb-1 flex-wrap">
                    {getEstrategiaBadge(multipla) || getContextoBadge(item.contexto, multipla)}
                    <Badge className="bg-indigo-500/20 text-indigo-400 border-indigo-500/30 text-[10px] px-1.5 py-0">
                      MULT
                    </Badge>
                    <ResultadoPill
                      apostaId={multipla.id}
                      bookmarkerId={multipla.bookmaker_id}
                      resultado={multipla.resultado}
                      status={multipla.status}
                      stake={multipla.stake}
                      odd={multipla.odd_final}
                      onResultadoUpdated={handleApostaUpdated}
                      onEditClick={() => handleOpenMultiplaDialog(multipla)}
                    />
                  </div>
                  <div className="flex items-start justify-between gap-2">
                    <CardTitle className="text-sm truncate">
                      Múltipla {multipla.tipo_multipla}
                    </CardTitle>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {multipla.selecoes.length} seleções
                  </p>
                </CardHeader>
                <CardContent className="pt-1 pb-3 px-3">
                  <div className="space-y-1">
                    <div className="text-xs text-muted-foreground line-clamp-2">
                      {multipla.selecoes.map(s => s.descricao).join(" + ")}
                    </div>
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-muted-foreground">Odd Final</span>
                      <span className="font-medium">@{multipla.odd_final.toFixed(2)}</span>
                    </div>
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-muted-foreground">Stake</span>
                      <span className="font-medium">{formatCurrency(multipla.stake)}</span>
                    </div>
                    {multipla.lucro_prejuizo !== null && multipla.status === "LIQUIDADA" && (
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-muted-foreground">P/L</span>
                        <span className={`font-medium ${multipla.lucro_prejuizo >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                          {formatCurrency(multipla.lucro_prejuizo)}
                        </span>
                      </div>
                    )}
                    <div className="flex items-center justify-between text-xs pt-1 border-t border-border/50">
                      <span className="text-muted-foreground">
                        {format(parseLocalDateTime(multipla.data_aposta), "dd/MM HH:mm", { locale: ptBR })}
                      </span>
                      <span className="text-muted-foreground truncate ml-2 max-w-[100px]">
                        {multipla.bookmaker?.nome}
                      </span>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      ) : (
        // List view
        <Card>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/50">
                    <th className="text-left p-3 font-medium">Contexto</th>
                    <th className="text-left p-3 font-medium">Tipo</th>
                    <th className="text-left p-3 font-medium">Evento</th>
                    <th className="text-left p-3 font-medium">Seleção</th>
                    <th className="text-right p-3 font-medium">Odd</th>
                    <th className="text-right p-3 font-medium">Stake</th>
                    <th className="text-right p-3 font-medium">P/L</th>
                    <th className="text-center p-3 font-medium">Status</th>
                    <th className="text-left p-3 font-medium">Data</th>
                  </tr>
                </thead>
                <tbody>
                  {apostasUnificadas.map((item) => {
                    const isSimples = item.tipo === "simples";
                    const isMultipla = item.tipo === "multipla";
                    const data = item.data as any;
                    
                    return (
                      <tr 
                        key={data.id} 
                        className="border-b hover:bg-muted/30 cursor-pointer"
                        onClick={() => {
                          if (isSimples) handleOpenDialog(data);
                          else if (isMultipla) handleOpenMultiplaDialog(data);
                        }}
                      >
                        <td className="p-3">{(isSimples || isMultipla) ? (getEstrategiaBadge(data) || getContextoBadge(item.contexto, data)) : getContextoBadge(item.contexto) || <span className="text-muted-foreground">—</span>}</td>
                        <td className="p-3">
                          {(() => {
                            if (isSimples) {
                              const opInfo = getOperationType(data);
                              if (opInfo.label) {
                                return <Badge className={`text-xs ${opInfo.color}`}>{opInfo.label}</Badge>;
                              }
                              return <Badge variant="outline" className="text-xs">BACK</Badge>;
                            } else if (isMultipla) {
                              return <Badge variant="outline" className="text-xs">Múltipla</Badge>;
                            } else {
                              // Surebet
                              return <Badge className="bg-cyan-500/20 text-cyan-400 border-cyan-500/30 text-xs">Surebet</Badge>;
                            }
                          })()}
                        </td>
                        <td className="p-3 max-w-[200px] truncate">
                          {isSimples ? data.evento : isMultipla ? `Múltipla ${data.tipo_multipla}` : data.evento}
                        </td>
                        <td className="p-3 max-w-[150px] truncate text-muted-foreground">
                          {isSimples ? data.selecao : isMultipla ? `${data.selecoes.length} seleções` : data.modelo}
                        </td>
                        <td className="p-3 text-right font-mono">
                          @{(isSimples ? data.odd : isMultipla ? data.odd_final : data.roi_esperado || 0).toFixed(2)}
                        </td>
                        <td className="p-3 text-right">
                          {formatCurrency(isSimples || isMultipla ? data.stake : data.stake_total)}
                        </td>
                        <td className="p-3 text-right">
                          {data.lucro_prejuizo !== null ? (
                            <span className={data.lucro_prejuizo >= 0 ? 'text-emerald-400' : 'text-red-400'}>
                              {formatCurrency(data.lucro_prejuizo)}
                            </span>
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </td>
                        <td className="p-3 text-center">
                          <Badge className={data.status === "LIQUIDADA" ? "bg-emerald-500/20 text-emerald-400" : "bg-blue-500/20 text-blue-400"}>
                            {data.status === "LIQUIDADA" ? "Liquidada" : "Pendente"}
                          </Badge>
                        </td>
                        <td className="p-3 text-muted-foreground">
                          {format(parseLocalDateTime(item.data_aposta), "dd/MM HH:mm", { locale: ptBR })}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Dialogs */}
      <ApostaDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        projetoId={projetoId}
        aposta={selectedAposta ? {
          id: selectedAposta.id,
          bookmaker_id: selectedAposta.bookmaker_id,
          esporte: selectedAposta.esporte,
          evento: selectedAposta.evento,
          mercado: selectedAposta.mercado || "",
          selecao: selectedAposta.selecao,
          odd: selectedAposta.odd,
          stake: selectedAposta.stake,
          estrategia: selectedAposta.estrategia || "VALOR",
          status: selectedAposta.status,
          resultado: selectedAposta.resultado,
          valor_retorno: selectedAposta.valor_retorno,
          lucro_prejuizo: selectedAposta.lucro_prejuizo,
          observacoes: selectedAposta.observacoes,
          data_aposta: selectedAposta.data_aposta,
          modo_entrada: selectedAposta.modo_entrada || "PADRAO",
          lay_exchange: selectedAposta.lay_exchange,
          lay_odd: selectedAposta.lay_odd,
          lay_stake: selectedAposta.lay_stake,
          lay_liability: selectedAposta.lay_liability,
          lay_comissao: selectedAposta.lay_comissao,
          back_em_exchange: selectedAposta.back_em_exchange,
          back_comissao: selectedAposta.back_comissao,
          gerou_freebet: selectedAposta.gerou_freebet,
          valor_freebet_gerada: selectedAposta.valor_freebet_gerada,
          tipo_freebet: selectedAposta.tipo_freebet,
        } : null}
        onSuccess={handleApostaUpdated}
      />

      <ApostaMultiplaDialog
        open={dialogMultiplaOpen}
        onOpenChange={setDialogMultiplaOpen}
        projetoId={projetoId}
        aposta={selectedApostaMultipla ? {
          id: selectedApostaMultipla.id,
          bookmaker_id: selectedApostaMultipla.bookmaker_id,
          tipo_multipla: selectedApostaMultipla.tipo_multipla,
          stake: selectedApostaMultipla.stake,
          odd_final: selectedApostaMultipla.odd_final,
          retorno_potencial: selectedApostaMultipla.retorno_potencial,
          selecoes: selectedApostaMultipla.selecoes,
          status: selectedApostaMultipla.status,
          resultado: selectedApostaMultipla.resultado,
          lucro_prejuizo: selectedApostaMultipla.lucro_prejuizo,
          valor_retorno: selectedApostaMultipla.valor_retorno,
          observacoes: selectedApostaMultipla.observacoes,
          data_aposta: selectedApostaMultipla.data_aposta,
          tipo_freebet: selectedApostaMultipla.tipo_freebet,
          gerou_freebet: selectedApostaMultipla.gerou_freebet,
          valor_freebet_gerada: selectedApostaMultipla.valor_freebet_gerada,
        } : null}
        onSuccess={handleApostaUpdated}
      />

      <SurebetDialog
        open={dialogSurebetOpen}
        onOpenChange={setDialogSurebetOpen}
        projetoId={projetoId}
        bookmakers={bookmakers}
        surebet={selectedSurebet || null}
        onSuccess={handleApostaUpdated}
      />
    </div>
  );
}
