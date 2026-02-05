import { useState, useEffect, useMemo, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { calcularImpactoResultado } from "@/lib/bookmakerBalanceHelper";
import { reliquidarAposta, deletarAposta } from "@/services/aposta/ApostaService";
import { useInvalidateBookmakerSaldos } from "@/hooks/useBookmakerSaldosQuery";
import { useCrossWindowSync } from "@/hooks/useCrossWindowSync";
// useBookmakerLogoMap movido para ProjetoDashboardTab
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
// VisaoGeralCharts removido - agora está em ProjetoDashboardTab
import { TabFiltersBar } from "./TabFiltersBar";
import { useTabFilters } from "@/hooks/useTabFilters";
import { cn, getFirstLastName } from "@/lib/utils";
import { parsePernaFromJson } from "@/types/apostasUnificada";
import { OperationsSubTabHeader, type HistorySubTab } from "./operations";
import { parseLocalDateTime } from "@/utils/dateUtils";
import { ExportMenu, transformApostaToExport, transformSurebetToExport } from "./ExportMenu";
import { SaldoOperavelCard } from "./SaldoOperavelCard";
import { DeleteBetConfirmDialog, type DeleteBetInfo } from "@/components/apostas/DeleteBetConfirmDialog";
import type { SurebetQuickResult } from "@/components/apostas/SurebetRowActionsMenu";

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
  pernas?: unknown | null;
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
  
  // Verifica se é aposta de bônus via estrategia ou bookmaker com bônus ativo
  // is_bonus_bet deprecado - usar estrategia="EXTRACAO_BONUS"
  if (aposta.estrategia === "EXTRACAO_BONUS" || bookmakersComBonusAtivo.includes(aposta.bookmaker_id)) {
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
  
  // Verifica se alguma perna tem bônus ativo via bookmaker
  // Para surebets, usamos apenas o bookmaker já que pernas não têm estrategia individual
  const hasBonusPerna = surebet.pernas?.some(p => 
    bookmakersComBonusAtivo.includes(p.bookmaker_id)
  );
  if (hasBonusPerna) return "BONUS";
  
  return "NORMAL";
}

function getCasaLabelFromAposta(aposta: { bookmaker?: any; pernas?: unknown | null }): string {
  const nome = (aposta.bookmaker?.nome as string | undefined)?.trim();
  const parceiro = (aposta.bookmaker?.parceiro?.nome as string | undefined)?.trim();

  if (nome && parceiro) return `${nome} • ${parceiro}`;
  if (nome) return nome;
  if (parceiro) return parceiro;

  // Fallback: algumas apostas (ex.: registros com SUREBET) podem ter a casa apenas em JSON (pernas)
  const pernas = parsePernaFromJson((aposta as any).pernas);
  const pernaNome = (pernas[0]?.bookmaker_nome as string | undefined)?.trim();
  return pernaNome || "—";
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
  const [viewMode, setViewMode] = useState<"cards" | "list">("list");
  const [apostasSubTab, setApostasSubTab] = useState<HistorySubTab>("abertas");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [dialogMultiplaOpen, setDialogMultiplaOpen] = useState(false);
  const [dialogSurebetOpen, setDialogSurebetOpen] = useState(false);
  const [selectedAposta, setSelectedAposta] = useState<Aposta | null>(null);
  const [selectedApostaMultipla, setSelectedApostaMultipla] = useState<ApostaMultipla | null>(null);
  const [selectedSurebet, setSelectedSurebet] = useState<SurebetData | null>(null);
  const [bookmakers, setBookmakers] = useState<any[]>([]);
  
  // Estados para modal de exclusão
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [betToDelete, setBetToDelete] = useState<DeleteBetInfo | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  // Hook para invalidar cache de saldos
  const invalidateSaldos = useInvalidateBookmakerSaldos();

  // Hook global de logos de bookmakers não mais necessário aqui - movido para ProjetoDashboardTab

  /**
   * FILTROS INDEPENDENTES DA ABA APOSTAS
   * Esta aba possui seus próprios filtros, isolados das demais abas.
   * Filtros aplicados aqui NÃO afetam Visão Geral nem outras abas.
   */
  const tabFilters = useTabFilters({
    tabId: "apostas",
    projetoId,
    defaultPeriod: "mes_atual",
    persist: true,
  });

  // Hook para pegar bookmakers com bônus ativo
  const { getBookmakersWithActiveBonus, bonuses } = useProjectBonuses({ projectId: projetoId });
  const bookmakersComBonusAtivo = useMemo(() => getBookmakersWithActiveBonus(), [bonuses]);

  // Usar dateRange do filtro local da aba
  const dateRange = tabFilters.dateRange;

  useEffect(() => {
    fetchAllApostas();
  }, [projetoId, tabFilters.period, tabFilters.customDateRange, refreshTrigger]);

  // Hook centralizado para sincronização cross-window
  useCrossWindowSync({
    projetoId,
    onSync: useCallback(() => {
      fetchAllApostas();
      onDataChange?.();
    }, [onDataChange]),
  });

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
      // Usa tabela unificada para apostas simples
      // NOTA: Apostas com estrategia=SUREBET e forma_registro=SIMPLES são pernas individuais
      // de operações de surebet e DEVEM aparecer aqui para visualização completa
      let query = supabase
        .from("apostas_unificada")
        .select(`
          id, data_aposta, esporte, evento, mercado, selecao, odd, stake, estrategia,
          status, resultado, valor_retorno, lucro_prejuizo, observacoes, bookmaker_id,
          modo_entrada, lay_exchange, lay_odd, lay_stake, lay_liability, lay_comissao,
          back_comissao, back_em_exchange, gerou_freebet, valor_freebet_gerada,
          tipo_freebet, is_bonus_bet, contexto_operacional, forma_registro, pernas
        `)
        .eq("projeto_id", projetoId)
        .eq("forma_registro", "SIMPLES")
        // Todas as apostas SIMPLES aparecem aqui, incluindo SUREBET
        // A separação visual é feita via badges, não via filtro excludente
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

  // Resolução rápida de apostas simples (sem pernas multi) - USA RPC ATÔMICA
  const handleQuickResolve = useCallback(async (apostaId: string, resultado: string) => {
    try {
     console.log('[ProjetoApostasTab] handleQuickResolve iniciado:', { apostaId, resultado });
     
      const aposta = apostas.find(a => a.id === apostaId);
     if (!aposta) {
       console.error('[ProjetoApostasTab] Aposta não encontrada no estado local:', apostaId);
       toast.error("Aposta não encontrada. Tente recarregar a página.");
       return;
     }

      const stake = typeof aposta.stake === "number" ? aposta.stake : 0;
      const odd = aposta.odd || 1;
      
      // Calcular lucro usando função canônica
      const lucro = calcularImpactoResultado(stake, odd, resultado);
     
     console.log('[ProjetoApostasTab] Chamando reliquidarAposta:', { 
       apostaId, 
       resultado, 
       lucro,
       stake,
       odd 
     });

      // 1. Liquidar via RPC atômica (atualiza aposta + registra no ledger + trigger atualiza saldo)
      const result = await reliquidarAposta(apostaId, resultado, lucro);
      
      if (!result.success) {
       console.error('[ProjetoApostasTab] reliquidarAposta falhou:', result.error);
        toast.error(result.error?.message || "Erro ao liquidar aposta");
        return;
      }

     console.log('[ProjetoApostasTab] reliquidarAposta sucesso, atualizando estado local');
     
      // 2. Atualizar estado local
      setApostas(prev => prev.map(a => 
        a.id === apostaId 
          ? { ...a, resultado, lucro_prejuizo: lucro, status: "LIQUIDADA" }
          : a
      ));

      // 3. Invalidar cache de saldos
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
     toast.error(`Erro ao atualizar resultado: ${error.message || 'Erro desconhecido'}`);
    }
  }, [apostas, onDataChange, projetoId, invalidateSaldos]);

  // Handler para excluir aposta
  const handleDeleteBet = useCallback(async () => {
    if (!betToDelete) return;
    
    setIsDeleting(true);
    try {
      const result = await deletarAposta(betToDelete.id);
      
      if (!result.success) {
        toast.error(result.error?.message || "Erro ao excluir aposta");
        return;
      }

      // Atualizar listas locais
      if (betToDelete.tipo === "simples") {
        setApostas(prev => prev.filter(a => a.id !== betToDelete.id));
      } else if (betToDelete.tipo === "multipla") {
        setApostasMultiplas(prev => prev.filter(am => am.id !== betToDelete.id));
      } else {
        setSurebets(prev => prev.filter(sb => sb.id !== betToDelete.id));
      }

      // Invalidar cache de saldos
      invalidateSaldos(projetoId);

      toast.success("Aposta excluída com sucesso");
      setDeleteDialogOpen(false);
      setBetToDelete(null);
      onDataChange?.();
    } catch (error: any) {
      console.error("Erro ao excluir aposta:", error);
      toast.error("Erro ao excluir aposta");
    } finally {
      setIsDeleting(false);
    }
  }, [betToDelete, onDataChange, projetoId, invalidateSaldos]);

  // Preparar info para exclusão de aposta simples
  const prepareDeleteSimples = useCallback((apostaId: string) => {
    const aposta = apostas.find(a => a.id === apostaId);
    if (!aposta) return;
    
    setBetToDelete({
      id: aposta.id,
      evento: aposta.evento,
      stake: aposta.stake,
      bookmaker: aposta.bookmaker?.nome || "—",
      tipo: "simples",
    });
    setDeleteDialogOpen(true);
  }, [apostas]);

  // Preparar info para exclusão de aposta múltipla
  const prepareDeleteMultipla = useCallback((apostaId: string) => {
    const multipla = apostasMultiplas.find(am => am.id === apostaId);
    if (!multipla) return;
    
    setBetToDelete({
      id: multipla.id,
      evento: `Múltipla ${multipla.tipo_multipla}`,
      stake: multipla.stake,
      bookmaker: multipla.bookmaker?.nome || "—",
      tipo: "multipla",
    });
    setDeleteDialogOpen(true);
  }, [apostasMultiplas]);

  // Preparar info para exclusão de surebet
  const prepareDeleteSurebet = useCallback((surebetId: string) => {
    const surebet = surebets.find(sb => sb.id === surebetId);
    if (!surebet) return;
    
    const casas = surebet.pernas?.map(p => p.bookmaker?.nome).filter(Boolean).join(", ") || "—";
    
    setBetToDelete({
      id: surebet.id,
      evento: surebet.evento,
      stake: surebet.stake_total,
      bookmaker: casas,
      tipo: "surebet",
    });
    setDeleteDialogOpen(true);
  }, [surebets]);

  // Handler para quick resolve de surebet - agora com suporte a pernas específicas
  const handleQuickResolveSurebet = useCallback(async (surebetId: string, quickResult: SurebetQuickResult) => {
    try {
      const surebet = surebets.find(sb => sb.id === surebetId);
      if (!surebet || !surebet.pernas) return;

      const stakeTotal = surebet.stake_total || 0;
      const pernas = surebet.pernas.filter(p => p.bookmaker_id && p.odd && p.odd > 0);
      
      let lucroTotal = 0;
      let resultadoFinal: string;
      
      if (quickResult.type === "all_void") {
        // Todas as pernas são VOID - retorno do stake
        lucroTotal = 0;
        resultadoFinal = "VOID";
      } else if (quickResult.type === "single_win") {
        // Uma perna ganha, outras perdem
        const winnerIdx = quickResult.winners[0];
        const pernaVencedora = pernas[winnerIdx];
        if (!pernaVencedora) return;
        
        // Usar campos padrão (stake e odd) - campos agregados são opcionais
        const stakeVencedor = (pernaVencedora as any).stake_total ?? pernaVencedora.stake ?? 0;
        const oddVencedor = (pernaVencedora as any).odd_media ?? pernaVencedora.odd ?? 1;
        const retorno = stakeVencedor * oddVencedor;
        lucroTotal = retorno - stakeTotal;
        resultadoFinal = "GREEN"; // Surebets em teoria sempre dão lucro no single win
      } else if (quickResult.type === "double_green") {
        // Duplo green - duas pernas ganham
        const [idx1, idx2] = quickResult.winners;
        const perna1 = pernas[idx1] as any;
        const perna2 = pernas[idx2] as any;
        if (!perna1 || !perna2) return;
        
        const stake1 = perna1.stake_total ?? perna1.stake ?? 0;
        const stake2 = perna2.stake_total ?? perna2.stake ?? 0;
        const odd1 = perna1.odd_media ?? perna1.odd ?? 1;
        const odd2 = perna2.odd_media ?? perna2.odd ?? 1;
        
        const retorno = (stake1 * odd1) + (stake2 * odd2);
        lucroTotal = retorno - stakeTotal;
        resultadoFinal = lucroTotal >= 0 ? "GREEN" : "RED";
      } else {
        return;
      }

      const result = await reliquidarAposta(surebetId, resultadoFinal, lucroTotal);
      
      if (!result.success) {
        toast.error(result.error?.message || "Erro ao liquidar surebet");
        return;
      }

      // Atualizar estado local
      setSurebets(prev => prev.map(sb => 
        sb.id === surebetId 
          ? { ...sb, resultado: resultadoFinal, lucro_real: lucroTotal, status: "LIQUIDADA" }
          : sb
      ));

      // Invalidar cache de saldos
      invalidateSaldos(projetoId);

      toast.success(`Surebet liquidada: ${quickResult.label} → ${resultadoFinal}`);
      onDataChange?.();
    } catch (error: any) {
      console.error("Erro ao atualizar surebet:", error);
      toast.error("Erro ao atualizar resultado");
    }
  }, [surebets, onDataChange, projetoId, invalidateSaldos]);

  // Filtrar e unificar apostas com contexto - usando filtros LOCAIS da aba
  const apostasUnificadasBase: ApostaUnificada[] = useMemo(() => {
    const result: ApostaUnificada[] = [];
    
    // Filtros da aba (isolados de outras abas)
    const selectedBookmakerIds = tabFilters.bookmakerIds;
    const selectedParceiroIds = tabFilters.parceiroIds;
    const selectedEstrategias = tabFilters.estrategias;
    
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
    return result.sort((a, b) => parseLocalDateTime(b.data_aposta).getTime() - parseLocalDateTime(a.data_aposta).getTime());
  }, [apostas, apostasMultiplas, surebets, bookmakersComBonusAtivo, tabFilters.bookmakerIds, tabFilters.parceiroIds, tabFilters.estrategias, statusFilter, resultadoFilter, contextoFilter, tipoFilter]);

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

  // Auto-switch to history tab when no open operations
  useEffect(() => {
    if (!loading && apostasAbertasList.length === 0 && apostasHistoricoList.length > 0 && apostasSubTab === 'abertas') {
      setApostasSubTab('historico');
    }
  }, [loading, apostasAbertasList.length, apostasHistoricoList.length]);
  
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

  // Mapa de bookmaker_id -> nome completo com parceiro para enriquecer nomes no SurebetCard
  const bookmakerNomeMap = useMemo(() => {
    const map = new Map<string, string>();
    bookmakers.forEach(bk => {
      const parceiroNome = bk.parceiro?.nome?.split(" ");
      const shortName = parceiroNome 
        ? `${parceiroNome[0]} ${parceiroNome[parceiroNome.length - 1] || ""}`.trim()
        : "";
      const nomeCompleto = shortName ? `${bk.nome} - ${shortName}` : bk.nome;
      map.set(bk.id, nomeCompleto);
    });
    return map;
  }, [bookmakers]);

  // formatCurrency definido no escopo do componente



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

  // Abrir aposta simples em janela externa (mesmo comportamento do Surebet)
  const handleOpenDialog = (aposta: Aposta | null) => {
    const apostaId = aposta?.id || 'novo';
    const url = `/janela/aposta/${apostaId}?projetoId=${encodeURIComponent(projetoId)}&tab=apostas&estrategia=PUNTER`;
    window.open(url, '_blank', 'width=780,height=900,menubar=no,toolbar=no,location=no,status=no,resizable=yes,scrollbars=yes');
  };

  // Abrir aposta múltipla em janela externa (mesmo comportamento do Surebet)
  const handleOpenMultiplaDialog = (aposta: ApostaMultipla | null) => {
    const apostaId = aposta?.id || 'novo';
    const url = `/janela/multipla/${apostaId}?projetoId=${encodeURIComponent(projetoId)}&tab=apostas&estrategia=PUNTER`;
    window.open(url, '_blank', 'width=780,height=900,menubar=no,toolbar=no,location=no,status=no,resizable=yes,scrollbars=yes');
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
      {/* Card de Saldo Operável */}
      <div className="grid gap-4 md:grid-cols-4">
        <SaldoOperavelCard projetoId={projetoId} />
      </div>

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
                    periodo: tabFilters.period,
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
          {/* Filtros LOCAIS da aba Apostas (isolados de outras abas) */}
          <TabFiltersBar
            projetoId={projetoId}
            filters={tabFilters}
            showEstrategiaFilter={true}
          />
        </CardContent>
      </Card>

      {/* Lista de Apostas - Layout padronizado igual Surebet/Bônus */}
      {apostasUnificadas.length === 0 ? (
        <Card>
          <CardContent className="pt-6">
            <div className="text-center py-10">
              <Target className="mx-auto h-12 w-12 text-muted-foreground/50" />
              <h3 className="mt-4 text-lg font-semibold">
                {apostasSubTab === "abertas" ? "Nenhuma aposta aberta" : "Nenhuma aposta no histórico"}
              </h3>
              <p className="text-muted-foreground">
                {tabFilters.activeFiltersCount > 0 || resultadoFilter !== "all" || contextoFilter !== "all"
                  ? "Tente ajustar os filtros"
                  : apostasSubTab === "abertas" 
                    ? "Registre uma nova aposta" 
                    : "Apostas finalizadas aparecerão aqui"}
              </p>
            </div>
          </CardContent>
        </Card>
      ) : (
        <div className={cn(
          viewMode === "cards" 
            ? "grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4" 
            : "space-y-2"
        )}>
          {apostasUnificadas.map((item) => {
            // ===== SUREBET =====
            if (item.tipo === "surebet") {
              const sb = item.data as Surebet;
              
              const surebetData: SurebetData = {
                ...sb,
                lucro_real: sb.lucro_prejuizo,
                pernas: sb.pernas?.map((p: any) => ({
                  id: p.id,
                  selecao: p.selecao,
                  selecao_livre: p.selecao_livre,
                  odd: p.odd,
                  stake: p.stake,
                  resultado: p.resultado,
                  bookmaker_nome: p.bookmaker?.nome || p.bookmaker_nome || "—",
                  bookmaker_id: p.bookmaker_id,
                  entries: p.entries,
                  odd_media: p.odd_media,
                  stake_total: p.stake_total,
                }))
              };
              
              return (
                <SurebetCard
                  key={sb.id}
                  surebet={surebetData}
                  onEdit={(surebet) => {
                    // Abrir em janela externa
                    const url = `/janela/surebet/${surebet.id}?projetoId=${encodeURIComponent(projetoId)}&tab=apostas`;
                    window.open(url, '_blank', 'width=780,height=900,menubar=no,toolbar=no,location=no,status=no,resizable=yes,scrollbars=yes');
                  }}
                  onQuickResolve={handleQuickResolveSurebet}
                  onDelete={prepareDeleteSurebet}
                  formatCurrency={formatCurrency}
                  bookmakerNomeMap={bookmakerNomeMap}
                />
              );
            }
            
            // ===== APOSTA SIMPLES - Usando ApostaCard padronizado =====
            if (item.tipo === "simples") {
              const aposta = item.data as Aposta;
              const displayInfo = getApostaDisplayInfo(aposta);
              const bookmakerBase = aposta.bookmaker?.nome?.split(" - ")[0] || aposta.bookmaker?.nome;
              const parceiroNome = aposta.bookmaker?.parceiro?.nome;
              const logoUrl = aposta.bookmaker?.bookmakers_catalogo?.logo_url;
              
              // Determinar estratégia para o card
              let estrategia: string = "NORMAL";
              if (aposta.gerou_freebet) estrategia = "FREEBET";
              else if (aposta.estrategia === "SUREBET") estrategia = "SUREBET";
              else if (aposta.estrategia === "DUPLO_GREEN") estrategia = "DUPLO_GREEN";
              else if (aposta.estrategia === "VALUEBET") estrategia = "VALUEBET";
              else if (item.contexto === "FREEBET") estrategia = "FREEBET";
              else if (item.contexto === "BONUS") estrategia = "BONUS";
              
              // Preparar dados para ApostaCard
              const apostaCardData = {
                id: aposta.id,
                evento: aposta.evento,
                esporte: aposta.esporte,
                selecao: aposta.selecao,
                odd: aposta.odd,
                stake: aposta.stake,
                data_aposta: aposta.data_aposta,
                resultado: aposta.resultado,
                status: aposta.status,
                lucro_prejuizo: aposta.lucro_prejuizo,
                estrategia: aposta.estrategia,
                bookmaker_nome: bookmakerBase,
                parceiro_nome: parceiroNome,
                logo_url: logoUrl,
              };
              
              return (
                <ApostaCard
                  key={aposta.id}
                  aposta={apostaCardData}
                  estrategia={estrategia}
                  variant={viewMode === "cards" ? "card" : "list"}
                  onEdit={(apostaId) => {
                    const a = apostas.find(ap => ap.id === apostaId);
                    if (a) handleOpenDialog(a);
                  }}
                  onQuickResolve={handleQuickResolve}
                  onDelete={prepareDeleteSimples}
                  formatCurrency={formatCurrency}
                />
              );
            }

            // ===== APOSTA MÚLTIPLA - Usando ApostaCard padronizado =====
            const multipla = item.data as ApostaMultipla;
            const bookmakerBaseMultipla = multipla.bookmaker?.nome?.split(" - ")[0] || multipla.bookmaker?.nome;
            const parceiroNomeMultipla = multipla.bookmaker?.parceiro?.nome;
            const logoUrlMultipla = multipla.bookmaker?.bookmakers_catalogo?.logo_url;
            
            // Determinar estratégia
            let estrategiaMultipla: string = "NORMAL";
            if (multipla.gerou_freebet) estrategiaMultipla = "FREEBET";
            else if (multipla.estrategia === "SUREBET") estrategiaMultipla = "SUREBET";
            else if (multipla.estrategia === "DUPLO_GREEN") estrategiaMultipla = "DUPLO_GREEN";
            else if (item.contexto === "FREEBET") estrategiaMultipla = "FREEBET";
            else if (item.contexto === "BONUS") estrategiaMultipla = "BONUS";
            
            // Preparar dados para ApostaCard (múltipla)
            const multiplaCardData = {
              id: multipla.id,
              evento: `Múltipla ${multipla.tipo_multipla}`,
              esporte: `${multipla.selecoes.length} seleções`,
              odd_final: multipla.odd_final,
              stake: multipla.stake,
              data_aposta: multipla.data_aposta,
              resultado: multipla.resultado,
              status: multipla.status,
              lucro_prejuizo: multipla.lucro_prejuizo,
              estrategia: multipla.estrategia,
              tipo_multipla: multipla.tipo_multipla,
              selecoes: multipla.selecoes.map(s => ({
                descricao: s.descricao,
                odd: parseFloat(s.odd),
                resultado: s.resultado,
              })),
              bookmaker_nome: bookmakerBaseMultipla,
              parceiro_nome: parceiroNomeMultipla,
              logo_url: logoUrlMultipla,
            };
            
            return (
              <ApostaCard
                key={multipla.id}
                aposta={multiplaCardData}
                estrategia={estrategiaMultipla}
                variant={viewMode === "cards" ? "card" : "list"}
                onEdit={() => handleOpenMultiplaDialog(multipla)}
                onQuickResolve={handleQuickResolve}
                onDelete={prepareDeleteMultipla}
                formatCurrency={formatCurrency}
              />
            );
          })}
        </div>
      )}

      {/* Modal de Confirmação de Exclusão */}
      <DeleteBetConfirmDialog
        open={deleteDialogOpen}
        onOpenChange={setDeleteDialogOpen}
        betInfo={betToDelete}
        onConfirm={handleDeleteBet}
        isDeleting={isDeleting}
        formatCurrency={formatCurrency}
      />

      {/* Dialogs removidos - todos os formulários abrem em janela externa */}
    </div>
  );
}
