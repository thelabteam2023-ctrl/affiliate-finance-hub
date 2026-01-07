import { useState, useEffect, useMemo, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { updateBookmakerBalance, calcularImpactoResultado } from "@/lib/bookmakerBalanceHelper";
import { useInvalidateBookmakerSaldos } from "@/hooks/useBookmakerSaldosQuery";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import { 
  Target,
  LayoutGrid,
  List,
  ArrowUp,
  ArrowDown,
  Shield,
  Coins,
  Gift,
  Zap,
  TrendingUp,
  CheckCircle2,
  BarChart3,
  Clock,
  History
} from "lucide-react";
import { SurebetCard, SurebetData, SurebetPerna } from "./SurebetCard";
import { SurebetDialog } from "./SurebetDialog";
import { ApostaPernasResumo, ApostaPernasInline, Perna } from "./ApostaPernasResumo";
import { ApostaCard } from "./ApostaCard";
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
import { ESTRATEGIAS_LIST, inferEstrategiaLegado, type ApostaEstrategia } from "@/lib/apostaConstants";
import { VisaoGeralCharts } from "./VisaoGeralCharts";
import { OperationalFiltersBar } from "./OperationalFiltersBar";
import { useOperationalFilters } from "@/contexts/OperationalFiltersContext";
import { cn, getFirstLastName } from "@/lib/utils";
import { OperationsSubTabHeader, type HistorySubTab } from "./operations";
import { ExportMenu, transformApostaToExport, transformSurebetToExport } from "./ExportMenu";

// Contextos de aposta para filtro unificado
type ApostaContexto = "NORMAL" | "FREEBET" | "BONUS" | "SUREBET";

interface ProjetoApostasTabProps {
  projetoId: string;
  onDataChange?: () => void;
  refreshTrigger?: number;
  formatCurrency?: (value: number) => string;
}

// Fallback para formatação de moeda
const defaultFormatCurrency = (value: number): string => {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(value);
};

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
  forma_registro?: string | null;
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
  forma_registro?: string | null;
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
  estrategia: string | null;
  stake_total: number;
  spread_calculado: number | null;
  roi_esperado: number | null;
  roi_real: number | null;
  lucro_esperado: number | null;
  lucro_prejuizo: number | null;
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

export function ProjetoApostasTab({ projetoId, onDataChange, refreshTrigger, formatCurrency: formatCurrencyProp }: ProjetoApostasTabProps) {
  const formatCurrency = formatCurrencyProp || defaultFormatCurrency;
  const [apostas, setApostas] = useState<Aposta[]>([]);
  const [apostasMultiplas, setApostasMultiplas] = useState<ApostaMultipla[]>([]);
  const [surebets, setSurebets] = useState<Surebet[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [resultadoFilter, setResultadoFilter] = useState<string>("all");
  const [contextoFilter, setContextoFilter] = useState<ApostaContexto | "all">("all");
  const [tipoFilter, setTipoFilter] = useState<"todas" | "simples" | "multiplas" | "surebets">("todas");
  const [viewMode, setViewMode] = useState<"cards" | "list">("cards");
  const [apostasSubTab, setApostasSubTab] = useState<HistorySubTab>("abertas");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [dialogMultiplaOpen, setDialogMultiplaOpen] = useState(false);
  const [dialogSurebetOpen, setDialogSurebetOpen] = useState(false);
  const [selectedAposta, setSelectedAposta] = useState<Aposta | null>(null);
  const [selectedApostaMultipla, setSelectedApostaMultipla] = useState<ApostaMultipla | null>(null);
  const [selectedSurebet, setSelectedSurebet] = useState<SurebetData | null>(null);
  const [bookmakers, setBookmakers] = useState<any[]>([]);

  // Hook para invalidar cache de saldos
  const invalidateSaldos = useInvalidateBookmakerSaldos();

  // Consumir filtros do contexto global
  const globalFilters = useOperationalFilters();

  // Hook para pegar bookmakers com bônus ativo
  const { getBookmakersWithActiveBonus, bonuses } = useProjectBonuses({ projectId: projetoId });
  const bookmakersComBonusAtivo = useMemo(() => getBookmakersWithActiveBonus(), [bonuses]);

  // Usar dateRange do contexto global
  const dateRange = globalFilters.dateRange;

  useEffect(() => {
    fetchAllApostas();
  }, [projetoId, globalFilters.period, globalFilters.customDateRange, refreshTrigger]);

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
      // Usa tabela unificada para apostas simples (excluindo surebets/arbitragem)
      let query = supabase
        .from("apostas_unificada")
        .select(`
          id, data_aposta, esporte, evento, mercado, selecao, odd, stake, estrategia,
          status, resultado, valor_retorno, lucro_prejuizo, observacoes, bookmaker_id,
          modo_entrada, lay_exchange, lay_odd, lay_stake, lay_liability, lay_comissao,
          back_comissao, back_em_exchange, gerou_freebet, valor_freebet_gerada,
          tipo_freebet, is_bonus_bet, contexto_operacional, forma_registro
        `)
        .eq("projeto_id", projetoId)
        .eq("forma_registro", "SIMPLES")
        .neq("estrategia", "SUREBET") // Excluir surebets que são exibidas separadamente
        .is("cancelled_at", null)
        .order("data_aposta", { ascending: false });
      
      if (dateRange) {
        query = query.gte("data_aposta", dateRange.start.toISOString());
        query = query.lte("data_aposta", dateRange.end.toISOString());
      }

      const { data, error } = await query;

      if (error) throw error;
      
      // Buscar bookmakers para montar informações
      const bookmakerIds = [...new Set((data || []).map((a: any) => a.bookmaker_id).filter(Boolean))];
      let bookmakerMap = new Map<string, any>();
      
      if (bookmakerIds.length > 0) {
        const { data: bookmakers } = await supabase
          .from("bookmakers")
          .select(`
            id, nome, parceiro_id, bookmaker_catalogo_id,
            parceiro:parceiros (nome),
            bookmakers_catalogo (logo_url)
          `)
          .in("id", bookmakerIds);
        
        bookmakerMap = new Map((bookmakers || []).map((b: any) => [b.id, b]));
      }

      // Buscar lay_bookmaker para apostas com cobertura
      const apostasComLayInfo = await Promise.all((data || []).map(async (aposta: any) => {
        const bookmaker = aposta.bookmaker_id ? bookmakerMap.get(aposta.bookmaker_id) : null;
        let lay_bookmaker = null;
        
        if (aposta.lay_exchange && aposta.estrategia === "COBERTURA_LAY") {
          const { data: layBookmakerData } = await supabase
            .from("bookmakers")
            .select(`
              nome, parceiro_id, bookmaker_catalogo_id,
              parceiro:parceiros (nome),
              bookmakers_catalogo (logo_url)
            `)
            .eq("id", aposta.lay_exchange)
            .single();
          
          lay_bookmaker = layBookmakerData;
        }
        
        return {
          ...aposta,
          odd: aposta.odd ?? 0,
          stake: aposta.stake ?? 0,
          bookmaker,
          lay_bookmaker
        };
      }));
      
      setApostas(apostasComLayInfo || []);
    } catch (error: any) {
      toast.error("Erro ao carregar apostas simples: " + error.message);
    }
  };

  const fetchApostasMultiplas = async () => {
    try {
      // Usa tabela unificada para apostas múltiplas
      let query = supabase
        .from("apostas_unificada")
        .select(`
          id, data_aposta, stake, odd_final, lucro_prejuizo, valor_retorno,
          status, resultado, observacoes, bookmaker_id, estrategia,
          tipo_freebet, gerou_freebet, valor_freebet_gerada, is_bonus_bet,
          contexto_operacional, forma_registro, selecoes, tipo_multipla, retorno_potencial
        `)
        .eq("projeto_id", projetoId)
        .eq("forma_registro", "MULTIPLA")
        .is("cancelled_at", null)
        .order("data_aposta", { ascending: false });
      
      if (dateRange) {
        query = query.gte("data_aposta", dateRange.start.toISOString());
        query = query.lte("data_aposta", dateRange.end.toISOString());
      }

      const { data, error } = await query;

      if (error) throw error;
      
      // Buscar bookmakers
      const bookmakerIds = [...new Set((data || []).map((a: any) => a.bookmaker_id).filter(Boolean))];
      let bookmakerMap = new Map<string, any>();
      
      if (bookmakerIds.length > 0) {
        const { data: bookmakers } = await supabase
          .from("bookmakers")
          .select(`
            id, nome, parceiro_id, bookmaker_catalogo_id,
            parceiro:parceiros (nome),
            bookmakers_catalogo (logo_url)
          `)
          .in("id", bookmakerIds);
        
        bookmakerMap = new Map((bookmakers || []).map((b: any) => [b.id, b]));
      }
      
      setApostasMultiplas((data || []).map((am: any) => ({
        ...am,
        odd_final: am.odd_final ?? 0,
        stake: am.stake ?? 0,
        selecoes: Array.isArray(am.selecoes) ? am.selecoes : [],
        bookmaker: am.bookmaker_id ? bookmakerMap.get(am.bookmaker_id) : null
      })));
    } catch (error: any) {
      console.error("Erro ao carregar apostas múltiplas:", error.message);
    }
  };

  const fetchSurebets = async () => {
    try {
      // Usa tabela unificada para surebets/arbitragem
      let query = supabase
        .from("apostas_unificada")
        .select(`
          id, evento, esporte, modelo, stake_total, spread_calculado,
          roi_esperado, roi_real, lucro_esperado, lucro_prejuizo,
          status, resultado, data_aposta, observacoes, created_at, pernas, estrategia
        `)
        .eq("projeto_id", projetoId)
        .eq("forma_registro", "ARBITRAGEM")
        .is("cancelled_at", null)
        .order("data_aposta", { ascending: false });
      
      if (dateRange) {
        query = query.gte("data_aposta", dateRange.start.toISOString());
        query = query.lte("data_aposta", dateRange.end.toISOString());
      }

      const { data, error } = await query;

      if (error) throw error;
      
      // Buscar nomes de bookmakers para as pernas
      const allBookmakerIds = new Set<string>();
      (data || []).forEach((sb: any) => {
        const pernas = Array.isArray(sb.pernas) ? sb.pernas : [];
        pernas.forEach((p: any) => {
          if (p.bookmaker_id) allBookmakerIds.add(p.bookmaker_id);
        });
      });
      
      let bookmakerMap = new Map<string, { nome: string; parceiro?: { nome: string } }>();
      if (allBookmakerIds.size > 0) {
        const { data: bookmakers } = await supabase
          .from("bookmakers")
          .select("id, nome, parceiro:parceiros (nome)")
          .in("id", Array.from(allBookmakerIds));
        
        bookmakerMap = new Map((bookmakers || []).map((b: any) => [b.id, { nome: b.nome, parceiro: b.parceiro }]));
      }
      
      const surebetsFormatadas = (data || []).map((sb: any) => {
        const pernas = Array.isArray(sb.pernas) ? sb.pernas : [];
        return {
          ...sb,
          data_operacao: sb.data_aposta,
          stake_total: sb.stake_total ?? 0,
          pernas: pernas.map((p: any) => ({
            ...p,
            bookmaker: bookmakerMap.get(p.bookmaker_id) || { nome: "Desconhecida" }
          }))
        };
      });
      
      setSurebets(surebetsFormatadas);
    } catch (error: any) {
      console.error("Erro ao carregar surebets:", error.message);
    }
  };

  const handleApostaUpdated = () => {
    fetchAllApostas();
    onDataChange?.();
  };

  // Resolução rápida de apostas simples (sem pernas multi) - USA HELPER FINANCEIRO
  const handleQuickResolve = useCallback(async (apostaId: string, resultado: string) => {
    try {
      const aposta = apostas.find(a => a.id === apostaId);
      if (!aposta) return;

      const stake = typeof aposta.stake === "number" ? aposta.stake : 0;
      const odd = aposta.odd || 1;
      
      // Calcular lucro usando função canônica
      const lucro = calcularImpactoResultado(stake, odd, resultado);

      // 1. Calcular delta financeiro (PENDENTE → novo resultado)
      const delta = calcularImpactoResultado(stake, odd, resultado);

      // 2. Atualizar saldo da bookmaker via helper canônico
      if (aposta.bookmaker_id && delta !== 0) {
        const balanceUpdated = await updateBookmakerBalance(aposta.bookmaker_id, delta);
        if (!balanceUpdated) {
          toast.error("Erro ao atualizar saldo da bookmaker. Liquidação cancelada.");
          return;
        }
      }

      // 3. Atualizar aposta no banco
      const { error } = await supabase
        .from("apostas_unificada")
        .update({
          resultado,
          lucro_prejuizo: lucro,
          status: "LIQUIDADA",
        })
        .eq("id", apostaId);

      if (error) throw error;

      // 4. Atualizar estado local
      setApostas(prev => prev.map(a => 
        a.id === apostaId 
          ? { ...a, resultado, lucro_prejuizo: lucro, status: "LIQUIDADA" }
          : a
      ));

      // 5. Invalidar cache de saldos
      invalidateSaldos(projetoId);

      const resultLabel = {
        GREEN: "Green",
        RED: "Red",
        MEIO_GREEN: "½ Green",
        MEIO_RED: "½ Red",
        VOID: "Void"
      }[resultado] || resultado;

      toast.success(`Aposta marcada como ${resultLabel}`);
      onDataChange?.();
    } catch (error: any) {
      console.error("Erro ao atualizar aposta:", error);
      toast.error("Erro ao atualizar resultado");
    }
  }, [apostas, onDataChange, projetoId, invalidateSaldos]);

  // Filtrar e unificar apostas com contexto - usando filtros do contexto global
  const apostasUnificadasBase: ApostaUnificada[] = useMemo(() => {
    const result: ApostaUnificada[] = [];
    
    // Filtros do contexto global
    const selectedBookmakerIds = globalFilters.bookmakerIds;
    const selectedParceiroIds = globalFilters.parceiroIds;
    const selectedEstrategias = globalFilters.estrategias;
    
    // Apostas simples
    apostas.forEach(aposta => {
      const contexto = getApostaContexto(aposta, bookmakersComBonusAtivo);
      const estrategia = inferEstrategiaLegado(aposta);
      
      // Filtro de casa (bookmaker)
      const matchesBookmaker = selectedBookmakerIds.length === 0 || 
        selectedBookmakerIds.includes(aposta.bookmaker_id);
      
      // Filtro de parceiro
      const matchesParceiro = selectedParceiroIds.length === 0 || 
        (aposta.bookmaker?.parceiro_id && selectedParceiroIds.includes(aposta.bookmaker.parceiro_id));
      
      // Filtro de estratégia do contexto global
      const matchesEstrategia = selectedEstrategias.includes("all") || 
        selectedEstrategias.includes(estrategia as any);
      
      // Filtros internos restantes
      const matchesStatus = statusFilter === "all" || aposta.status === statusFilter;
      const matchesResultado = resultadoFilter === "all" || aposta.resultado === resultadoFilter;
      const matchesContexto = contextoFilter === "all" || contexto === contextoFilter;
      const matchesTipo = tipoFilter === "todas" || tipoFilter === "simples";
      
      if (matchesBookmaker && matchesParceiro && matchesEstrategia && matchesStatus && matchesResultado && matchesContexto && matchesTipo) {
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
      
      // Filtro de casa (bookmaker)
      const matchesBookmaker = selectedBookmakerIds.length === 0 || 
        selectedBookmakerIds.includes(am.bookmaker_id);
      
      // Filtro de parceiro
      const matchesParceiro = selectedParceiroIds.length === 0 || 
        (am.bookmaker?.parceiro_id && selectedParceiroIds.includes(am.bookmaker.parceiro_id));
      
      const matchesStatus = statusFilter === "all" || am.status === statusFilter;
      const matchesResultado = resultadoFilter === "all" || am.resultado === resultadoFilter;
      const matchesContexto = contextoFilter === "all" || contexto === contextoFilter;
      const matchesTipo = tipoFilter === "todas" || tipoFilter === "multiplas";
      
      if (matchesBookmaker && matchesParceiro && matchesStatus && matchesResultado && matchesContexto && matchesTipo) {
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
      
      // Filtro de casa: verificar se alguma perna tem o bookmaker selecionado
      const matchesBookmaker = selectedBookmakerIds.length === 0 || 
        sb.pernas?.some(p => selectedBookmakerIds.includes(p.bookmaker_id));
      
      // Filtro de parceiro: verificar se alguma perna tem o parceiro selecionado
      const matchesParceiro = selectedParceiroIds.length === 0 || 
        sb.pernas?.some(p => p.bookmaker?.parceiro && selectedParceiroIds.includes((p.bookmaker.parceiro as any).id));
      
      // Filtro de estratégia
      const matchesEstrategia = selectedEstrategias.includes("all") || 
        selectedEstrategias.includes("SUREBET");
      
      const matchesStatus = statusFilter === "all" || sb.status === statusFilter;
      const matchesResultado = resultadoFilter === "all" || sb.resultado === resultadoFilter;
      const matchesContexto = contextoFilter === "all" || contexto === contextoFilter;
      const matchesTipo = tipoFilter === "todas" || tipoFilter === "surebets";
      
      if (matchesBookmaker && matchesParceiro && matchesEstrategia && matchesStatus && matchesResultado && matchesContexto && matchesTipo) {
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
  }, [apostas, apostasMultiplas, surebets, bookmakersComBonusAtivo, globalFilters.bookmakerIds, globalFilters.parceiroIds, globalFilters.estrategias, statusFilter, resultadoFilter, contextoFilter, tipoFilter]);

  // Helper para verificar se um item está pendente
  const isItemPendente = (item: ApostaUnificada): boolean => {
    if (item.tipo === "simples") {
      const aposta = item.data as Aposta;
      return !aposta.resultado || aposta.resultado === "PENDENTE" || aposta.status === "PENDENTE";
    } else if (item.tipo === "multipla") {
      const multipla = item.data as ApostaMultipla;
      return !multipla.resultado || multipla.resultado === "PENDENTE" || multipla.status === "PENDENTE";
    } else {
      const surebet = item.data as Surebet;
      return !surebet.resultado || surebet.resultado === "PENDENTE" || surebet.status === "PENDENTE";
    }
  };

  // Separar apostas em abertas e histórico
  const apostasAbertasList = useMemo(() => apostasUnificadasBase.filter(isItemPendente), [apostasUnificadasBase]);
  const apostasHistoricoList = useMemo(() => apostasUnificadasBase.filter(item => !isItemPendente(item)), [apostasUnificadasBase]);
  
  // Lista final baseada na sub-aba selecionada
  const apostasUnificadas = apostasSubTab === "abertas" ? apostasAbertasList : apostasHistoricoList;

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

  // formatCurrency definido no escopo do componente

  const parseLocalDateTime = (dateString: string): Date => {
    if (!dateString) return new Date();
    const cleanDate = dateString.replace(/\+00:00$/, '').replace(/Z$/, '').replace(/\+\d{2}:\d{2}$/, '');
    const [datePart, timePart] = cleanDate.split('T');
    const [year, month, day] = datePart.split('-').map(Number);
    const [hours, minutes] = (timePart || '00:00').split(':').map(Number);
    return new Date(year, month - 1, day, hours || 0, minutes || 0);
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

      {/* Gráficos com calendário integrado */}
      {(apostas.length > 0 || apostasMultiplas.length > 0) && (
        <VisaoGeralCharts 
          apostas={[
            ...apostas.map(a => ({
              data_aposta: a.data_aposta,
              lucro_prejuizo: a.lucro_prejuizo,
              stake: a.stake,
              bookmaker_nome: a.bookmaker?.nome || "—"
            })),
            ...apostasMultiplas.map(a => ({
              data_aposta: a.data_aposta,
              lucro_prejuizo: a.lucro_prejuizo,
              stake: a.stake,
              bookmaker_nome: a.bookmaker?.nome || "Múltipla"
            }))
          ]} 
          accentColor="hsl(var(--primary))"
          isSingleDayPeriod={globalFilters.period === "1dia"}
          formatCurrency={formatCurrency}
        />
      )}


      {/* Card de Histórico com Filtros */}
      <Card>
        <CardHeader className="pb-3">
          {/* Sub-abas Abertas / Histórico - usando componente padronizado */}
          <div className="mb-3">
            <OperationsSubTabHeader
              subTab={apostasSubTab}
              onSubTabChange={setApostasSubTab}
              openCount={apostasAbertasList.length}
              historyCount={apostasHistoricoList.length}
              viewMode={viewMode}
              onViewModeChange={(mode) => setViewMode(mode)}
              showViewToggle={true}
              extraActions={
                <ExportMenu
                  getData={() => apostasUnificadas.map(u => {
                    if (u.tipo === "surebet") {
                      const s = u.data as Surebet;
                      return transformSurebetToExport({
                        id: s.id,
                        data_operacao: s.data_operacao,
                        evento: s.evento,
                        mercado: undefined,
                        modelo: s.modelo,
                        stake_total: s.stake_total,
                        spread_calculado: s.spread_calculado,
                        resultado: s.resultado,
                        status: s.status,
                        lucro_real: s.lucro_prejuizo,
                        observacoes: s.observacoes,
                        pernas: s.pernas?.map(p => ({
                          bookmaker_nome: p.bookmaker?.nome,
                          selecao: p.selecao,
                          odd: p.odd,
                          stake: p.stake,
                        })),
                      }, s.estrategia || "SUREBET");
                    }
                    const a = u.data as Aposta | ApostaMultipla;
                    return transformApostaToExport({
                      id: a.id,
                      data_aposta: a.data_aposta,
                      evento: 'evento' in a ? a.evento : '',
                      mercado: 'mercado' in a ? a.mercado : null,
                      selecao: 'selecao' in a ? a.selecao : '',
                      odd: 'odd' in a ? a.odd : ('odd_final' in a ? a.odd_final : 0),
                      stake: a.stake,
                      resultado: a.resultado,
                      status: a.status,
                      lucro_prejuizo: a.lucro_prejuizo,
                      observacoes: a.observacoes,
                      bookmaker_nome: a.bookmaker?.nome,
                      estrategia: 'estrategia' in a ? a.estrategia : null,
                    }, "Apostas");
                  })}
                  abaOrigem="Apostas"
                  filename={`apostas-${projetoId}-${format(new Date(), 'yyyy-MM-dd')}`}
                  filtrosAplicados={{
                    periodo: globalFilters.period,
                    dataInicio: dateRange?.start.toISOString(),
                    dataFim: dateRange?.end.toISOString(),
                  }}
                />
              }
            />
          </div>
          
          {/* Título do Card */}
          <CardTitle className="text-base font-medium flex items-center gap-2">
            <History className="h-4 w-4" />
            {apostasSubTab === "abertas" ? "Operações Abertas" : "Histórico de Operações"}
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-0 space-y-3">
          {/* Filtros Transversais (Período, Casa, Parceiro, Estratégia) */}
          <OperationalFiltersBar
            projetoId={projetoId}
            showEstrategiaFilter={true}
          />
        </CardContent>
      </Card>

      {/* Lista de Apostas */}
      {apostasUnificadas.length === 0 ? (
        <Card>
          <CardContent className="pt-6">
            <div className="text-center py-10">
              <Target className="mx-auto h-12 w-12 text-muted-foreground/50" />
              <h3 className="mt-4 text-lg font-semibold">
                {apostasSubTab === "abertas" ? "Nenhuma aposta aberta" : "Nenhuma aposta no histórico"}
              </h3>
              <p className="text-muted-foreground">
                {globalFilters.activeFiltersCount > 0 || resultadoFilter !== "all" || contextoFilter !== "all"
                  ? "Tente ajustar os filtros"
                  : apostasSubTab === "abertas" 
                    ? "Registre uma nova aposta" 
                    : "Apostas finalizadas aparecerão aqui"}
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
                lucro_real: sb.lucro_prejuizo,
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
              const roi = aposta.stake > 0 && aposta.lucro_prejuizo !== null ? (aposta.lucro_prejuizo / aposta.stake) * 100 : null;
            
              return (
                <Card key={aposta.id} className="cursor-pointer hover:border-primary/50 transition-colors" onClick={() => handleOpenDialog(aposta)}>
                  <CardContent className="p-4">
                    <div className="flex items-center gap-1 mb-2 flex-wrap">
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
                        projetoId={projetoId}
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
                        contextoOperacional={aposta.contexto_operacional}
                        estrategia={aposta.estrategia}
                        onResultadoUpdated={handleApostaUpdated}
                        onEditClick={() => handleOpenDialog(aposta)}
                      />
                    </div>
                    <div className="mb-2">
                      <p className="font-medium text-sm truncate uppercase">{aposta.evento}</p>
                      <p className="text-xs text-muted-foreground">{aposta.esporte}</p>
                    </div>
                    <div className="flex justify-between items-center text-sm mb-2">
                      <span className="text-muted-foreground truncate">{aposta.selecao}</span>
                      <span className="font-medium">@{aposta.odd.toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between items-center pt-2 border-t">
                      <span className="text-xs text-muted-foreground">{format(parseLocalDateTime(aposta.data_aposta), "dd/MM/yy", { locale: ptBR })}</span>
                      <div className="text-right">
                        <p className="text-xs text-muted-foreground">Stake: {formatCurrency(aposta.stake)}</p>
                        {aposta.lucro_prejuizo !== null && aposta.status === "LIQUIDADA" && (
                          <div className="flex items-center gap-2 justify-end">
                            <span className={`text-sm font-medium ${aposta.lucro_prejuizo >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                              {formatCurrency(aposta.lucro_prejuizo)}
                            </span>
                            {roi !== null && (
                              <span className={`text-xs ${roi >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                                ({roi >= 0 ? '+' : ''}{roi.toFixed(1)}%)
                              </span>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            }

            // Card de Múltipla
            const multipla = item.data as ApostaMultipla;
            const multiplaRoi = multipla.stake > 0 && multipla.lucro_prejuizo !== null ? (multipla.lucro_prejuizo / multipla.stake) * 100 : null;
            return (
              <Card 
                key={multipla.id}
                className="hover:border-primary/50 transition-colors cursor-pointer"
                onClick={() => handleOpenMultiplaDialog(multipla)}
              >
                <CardContent className="p-4">
                  {/* Badges */}
                  <div className="flex items-center gap-1 mb-2 flex-wrap">
                    {getEstrategiaBadge(multipla) || getContextoBadge(item.contexto, multipla)}
                    <Badge className="bg-indigo-500/20 text-indigo-400 border-indigo-500/30 text-[10px] px-1.5 py-0">
                      MULT
                    </Badge>
                    <ResultadoPill
                      apostaId={multipla.id}
                      bookmarkerId={multipla.bookmaker_id}
                      projetoId={projetoId}
                      resultado={multipla.resultado}
                      status={multipla.status}
                      stake={multipla.stake}
                      odd={multipla.odd_final}
                      contextoOperacional={multipla.contexto_operacional}
                      estrategia={multipla.estrategia}
                      onResultadoUpdated={handleApostaUpdated}
                      onEditClick={() => handleOpenMultiplaDialog(multipla)}
                    />
                  </div>
                  {/* Identificação */}
                  <div className="mb-2">
                    <p className="font-medium text-sm truncate uppercase">
                      Múltipla {multipla.tipo_multipla}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {multipla.selecoes.length} seleções
                    </p>
                  </div>
                  {/* Seleções */}
                  <div className="text-xs text-muted-foreground line-clamp-2 mb-2">
                    {multipla.selecoes.map(s => s.descricao).join(" + ")}
                  </div>
                  {/* Rodapé */}
                  <div className="flex justify-between items-center pt-2 border-t">
                    <span className="text-xs text-muted-foreground">
                      {format(parseLocalDateTime(multipla.data_aposta), "dd/MM/yy", { locale: ptBR })}
                    </span>
                    <div className="text-right">
                      <p className="text-xs text-muted-foreground">@{multipla.odd_final.toFixed(2)} · {formatCurrency(multipla.stake)}</p>
                      {multipla.lucro_prejuizo !== null && multipla.status === "LIQUIDADA" && (
                        <div className="flex items-center gap-2 justify-end">
                          <span className={`text-sm font-medium ${multipla.lucro_prejuizo >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                            {formatCurrency(multipla.lucro_prejuizo)}
                          </span>
                          {multiplaRoi !== null && (
                            <span className={`text-xs ${multiplaRoi >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                              ({multiplaRoi >= 0 ? '+' : ''}{multiplaRoi.toFixed(1)}%)
                            </span>
                          )}
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
                    <th className="text-left p-3 font-medium">Seleção / Pernas</th>
                    <th className="text-right p-3 font-medium">Odds</th>
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
                          if (isSimples) {
                            handleOpenDialog(data);
                            return;
                          }
                          if (isMultipla) {
                            handleOpenMultiplaDialog(data);
                            return;
                          }

                          // Surebet
                          const sb = data as Surebet;
                          const surebetData: SurebetData = {
                            ...(sb as any),
                            lucro_real: sb.lucro_prejuizo,
                            pernas: sb.pernas?.map((p) => ({
                              id: p.id,
                              selecao: p.selecao,
                              odd: p.odd,
                              stake: p.stake,
                              resultado: p.resultado,
                              bookmaker_nome: p.bookmaker?.nome || "—",
                            })),
                          };
                          setSelectedSurebet(surebetData);
                          setDialogSurebetOpen(true);
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
                        <td className="p-3 max-w-[200px]">
                          {isSimples ? (
                            <span className="truncate">{data.selecao}</span>
                          ) : isMultipla ? (
                            <span className="truncate">{data.selecoes.length} seleções</span>
                          ) : (
                            // Surebet: mostrar pernas resumidas
                            <ApostaPernasResumo 
                              pernas={(data as Surebet).pernas?.map(p => ({
                                bookmaker_nome: p.bookmaker?.nome || 'Casa',
                                selecao: p.selecao,
                                odd: p.odd,
                                stake: p.stake,
                                resultado: p.resultado
                              })) || []}
                              variant="compact"
                              showResultado={false}
                            />
                          )}
                        </td>
                        <td className="p-3 text-right font-mono">
                          {isSimples ? (
                            <span>@{data.odd.toFixed(2)}</span>
                          ) : isMultipla ? (
                            <span>@{data.odd_final.toFixed(2)}</span>
                          ) : (
                            // Surebet: mostrar odds de cada perna
                            <div className="flex flex-col gap-0.5 text-xs">
                              {(data as Surebet).pernas?.map((perna, idx) => (
                                <span key={perna.id}>@{perna.odd.toFixed(2)}</span>
                              )) || <span className="text-muted-foreground">—</span>}
                            </div>
                          )}
                        </td>
                        <td className="p-3 text-right">
                          {formatCurrency(isSimples || isMultipla ? data.stake : data.stake_total)}
                        </td>
                        <td className="p-3 text-right">
                          {(() => {
                            const isSurebetItem = item.tipo === "surebet";
                            let lucro: number | null | undefined;
                            
                            if (isSurebetItem) {
                              const sb = data as Surebet;
                              lucro = sb.status === "LIQUIDADA" ? sb.lucro_prejuizo : sb.lucro_esperado;
                            } else {
                              lucro = data.lucro_prejuizo;
                            }
                            
                            return lucro !== null && lucro !== undefined ? (
                              <span className={lucro >= 0 ? 'text-emerald-400' : 'text-red-400'}>
                                {formatCurrency(lucro)}
                              </span>
                            ) : (
                              <span className="text-muted-foreground">—</span>
                            );
                          })()}
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
          forma_registro: selectedAposta.forma_registro || "SIMPLES",
          contexto_operacional: selectedAposta.contexto_operacional || "NORMAL",
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
          estrategia: selectedApostaMultipla.estrategia || null,
          forma_registro: selectedApostaMultipla.forma_registro || "MULTIPLA",
          contexto_operacional: selectedApostaMultipla.contexto_operacional || "NORMAL",
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
