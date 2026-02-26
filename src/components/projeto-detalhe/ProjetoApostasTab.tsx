import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { calcularImpactoResultado } from "@/lib/bookmakerBalanceHelper";
import { reliquidarAposta, deletarAposta, liquidarPernaSurebet } from "@/services/aposta/ApostaService";
import { useInvalidateBookmakerSaldos } from "@/hooks/useBookmakerSaldosQuery";
import { getConsolidatedStake, getConsolidatedLucro } from "@/utils/consolidatedValues";
import { useProjetoCurrency } from "@/hooks/useProjetoCurrency";
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
import { groupPernasBySelecao } from "@/utils/groupPernasBySelecao";
import { SurebetDialog } from "./SurebetDialog";
import { ApostaPernasResumo, ApostaPernasInline, Perna } from "./ApostaPernasResumo";
import { ApostaCard, type ApostaCardData } from "./ApostaCard";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { getOperationalDateRangeForQuery } from "@/utils/dateUtils";
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
import { DeleteBetConfirmDialog, type DeleteBetInfo } from "@/components/apostas/DeleteBetConfirmDialog";
import type { SurebetQuickResult } from "@/components/apostas/SurebetRowActionsMenu";

// Contextos de aposta para filtro unificado
type ApostaContexto = "NORMAL" | "FREEBET" | "BONUS" | "SUREBET";

interface ProjetoApostasTabProps {
  projetoId: string;
  onDataChange?: () => void;
  refreshTrigger?: number;
  formatCurrency?: (value: number) => string;
  actionsSlot?: React.ReactNode;
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
  // Campos de consolidação multi-moeda
  moeda_operacao?: string | null;
  stake_consolidado?: number | null;
  pl_consolidado?: number | null;
  valor_brl_referencia?: number | null;
  lucro_prejuizo_brl_referencia?: number | null;
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
  evento?: string | null;
  esporte?: string | null;
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
  // Campos de consolidação multi-moeda
  moeda_operacao?: string | null;
  stake_consolidado?: number | null;
  pl_consolidado?: number | null;
  valor_brl_referencia?: number | null;
  lucro_prejuizo_brl_referencia?: number | null;
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
  workspace_id?: string;
  // Campos de consolidação multi-moeda
  pl_consolidado?: number | null;
  stake_consolidado?: number | null;
  pernas?: {
    id: string;
    bookmaker_id: string;
    selecao: string;
    odd: number;
    stake: number;
    resultado: string | null;
    moeda?: string;
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

export function ProjetoApostasTab({ projetoId, onDataChange, refreshTrigger, formatCurrency: formatCurrencyProp, actionsSlot }: ProjetoApostasTabProps) {
  const { convertToConsolidation, moedaConsolidacao } = useProjetoCurrency(projetoId);
  const formatCurrency = formatCurrencyProp || defaultFormatCurrency;
  const [apostas, setApostas] = useState<Aposta[]>([]);
  const [apostasMultiplas, setApostasMultiplas] = useState<ApostaMultipla[]>([]);
  const [surebets, setSurebets] = useState<Surebet[]>([]);
  const [loading, setLoading] = useState(true);
  const loadedOnceRef = useRef(false);
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [resultadoFilter, setResultadoFilter] = useState<string>("all");
  const [contextoFilter, setContextoFilter] = useState<ApostaContexto | "all">("all");
  const [tipoFilter, setTipoFilter] = useState<"todas" | "simples" | "multiplas" | "surebets">("todas");
  const [viewMode, setViewMode] = useState<"cards" | "list">("list");
  const [apostasSubTab, setApostasSubTab] = useState<HistorySubTab>("abertas");
  const [searchTerm, setSearchTerm] = useState("");
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
      if (!loadedOnceRef.current) setLoading(true);
      await Promise.all([fetchApostas(), fetchApostasMultiplas(), fetchSurebets(), fetchBookmakers()]);
    } finally {
      setLoading(false);
      loadedOnceRef.current = true;
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
          tipo_freebet, is_bonus_bet, contexto_operacional, forma_registro, pernas,
          moeda_operacao, stake_consolidado, pl_consolidado, valor_brl_referencia, lucro_prejuizo_brl_referencia
        `)
        .eq("projeto_id", projetoId)
        .eq("forma_registro", "SIMPLES")
        // Todas as apostas SIMPLES aparecem aqui, incluindo SUREBET
        // A separação visual é feita via badges, não via filtro excludente
        .is("cancelled_at", null)
        .order("data_aposta", { ascending: false });
      
      if (dateRange) {
        // CRÍTICO: Usar getOperationalDateRangeForQuery para garantir timezone operacional (São Paulo)
        const { startUTC, endUTC } = getOperationalDateRangeForQuery(dateRange.start, dateRange.end);
        query = query.gte("data_aposta", startUTC);
        query = query.lte("data_aposta", endUTC);
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

      // Carregar pernas multi-entry para apostas simples
      const apostaIds = apostasComLayInfo.map((a: any) => a.id);
      let pernasMap = new Map<string, any[]>();
      
      if (apostaIds.length > 0) {
        const { data: pernasData } = await supabase
          .from("apostas_pernas")
          .select(`
            aposta_id, bookmaker_id, odd, stake, moeda, selecao_livre, ordem,
            bookmaker:bookmakers (
              nome, parceiro_id,
              parceiro:parceiros (nome),
              bookmakers_catalogo (logo_url)
            )
          `)
          .in("aposta_id", apostaIds)
          .order("ordem", { ascending: true });
        
        if (pernasData) {
          for (const p of pernasData) {
            const arr = pernasMap.get(p.aposta_id) || [];
            arr.push(p);
            pernasMap.set(p.aposta_id, arr);
          }
        }
      }

      // Enriquecer apostas com sub_entries
      const apostasEnriquecidas = apostasComLayInfo.map((a: any) => {
        const pernas = pernasMap.get(a.id);
        if (pernas && pernas.length > 1) {
          a._sub_entries = pernas;
        }
        return a;
      });
      
      setApostas(apostasEnriquecidas || []);
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
          id, data_aposta, evento, esporte, stake, odd_final, lucro_prejuizo, valor_retorno,
          status, resultado, observacoes, bookmaker_id, estrategia,
          tipo_freebet, gerou_freebet, valor_freebet_gerada, is_bonus_bet,
          contexto_operacional, forma_registro, selecoes, tipo_multipla, retorno_potencial,
          moeda_operacao, stake_consolidado, pl_consolidado, valor_brl_referencia, lucro_prejuizo_brl_referencia
        `)
        .eq("projeto_id", projetoId)
        .eq("forma_registro", "MULTIPLA")
        .is("cancelled_at", null)
        .order("data_aposta", { ascending: false });
      
      if (dateRange) {
        const { startUTC, endUTC } = getOperationalDateRangeForQuery(dateRange.start, dateRange.end);
        query = query.gte("data_aposta", startUTC);
        query = query.lte("data_aposta", endUTC);
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
          status, resultado, data_aposta, observacoes, created_at, pernas, estrategia,
          workspace_id, moeda_operacao, stake_consolidado, pl_consolidado,
          valor_brl_referencia, lucro_prejuizo_brl_referencia,
          apostas_pernas (
            id, selecao, selecao_livre, odd, stake, resultado, lucro_prejuizo, bookmaker_id, moeda, ordem
          )
        `)
        .eq("projeto_id", projetoId)
        .eq("forma_registro", "ARBITRAGEM")
        .is("cancelled_at", null)
        .order("data_aposta", { ascending: false });
      
      if (dateRange) {
        const { startUTC, endUTC } = getOperationalDateRangeForQuery(dateRange.start, dateRange.end);
        query = query.gte("data_aposta", startUTC);
        query = query.lte("data_aposta", endUTC);
      }

      const { data, error } = await query;

      if (error) throw error;
      
      // Determinar pernas reais: usar apostas_pernas (tabela relacional) se existirem, senão fallback para JSON
      const allBookmakerIds = new Set<string>();
      (data || []).forEach((sb: any) => {
        const pernasRelacionais = Array.isArray(sb.apostas_pernas) ? sb.apostas_pernas : [];
        const pernasJson = Array.isArray(sb.pernas) ? sb.pernas : [];
        const pernasEfetivas = pernasRelacionais.length > 0 ? pernasRelacionais : pernasJson;
        pernasEfetivas.forEach((p: any) => {
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
        const pernasRelacionais = Array.isArray(sb.apostas_pernas) ? sb.apostas_pernas : [];
        const pernasJson = Array.isArray(sb.pernas) ? sb.pernas : [];
        // Priorizar pernas da tabela relacional (source of truth)
        const pernasEfetivas = pernasRelacionais.length > 0 
          ? pernasRelacionais.sort((a: any, b: any) => (a.ordem || 0) - (b.ordem || 0))
          : pernasJson;
        
        return {
          ...sb,
          data_operacao: sb.data_aposta,
          stake_total: sb.stake_total ?? 0,
          workspace_id: sb.workspace_id,
          pernas: pernasEfetivas.map((p: any) => ({
            ...p,
            bookmaker: bookmakerMap.get(p.bookmaker_id) || { nome: "Desconhecida" },
            bookmaker_nome: bookmakerMap.get(p.bookmaker_id)?.nome || p.bookmaker_nome || "Desconhecida",
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

  // Resolução rápida de apostas simples E múltiplas (sem pernas surebet) - USA RPC ATÔMICA
  const handleQuickResolve = useCallback(async (apostaId: string, resultado: string) => {
    try {
     console.log('[ProjetoApostasTab] handleQuickResolve iniciado:', { apostaId, resultado });
     
      // Buscar em apostas simples OU múltiplas
      const apostaSimples = apostas.find(a => a.id === apostaId);
      const apostaMultipla = !apostaSimples ? apostasMultiplas.find(am => am.id === apostaId) : null;
      const aposta = apostaSimples || apostaMultipla;
      
     if (!aposta) {
       console.error('[ProjetoApostasTab] Aposta não encontrada no estado local:', apostaId);
       toast.error("Aposta não encontrada. Tente recarregar a página.");
       return;
     }

      const stake = typeof aposta.stake === "number" ? aposta.stake : 0;
      // Para múltiplas, usar odd_final; para simples, usar odd
      const odd = apostaMultipla ? (apostaMultipla.odd_final || 1) : ((aposta as any).odd || 1);
      
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
     
      // 2. Atualizar estado local — no array correto
      if (apostaSimples) {
        setApostas(prev => prev.map(a => 
          a.id === apostaId 
            ? { ...a, resultado, lucro_prejuizo: lucro, status: "LIQUIDADA" }
            : a
        ));
      } else {
        setApostasMultiplas(prev => prev.map(am => 
          am.id === apostaId 
            ? { ...am, resultado, lucro_prejuizo: lucro, status: "LIQUIDADA" }
            : am
        ));
      }

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
  }, [apostas, apostasMultiplas, onDataChange, projetoId, invalidateSaldos]);

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

  // Liquidação de perna individual de Surebet via motor financeiro (UNIFICADO com ProjetoSurebetTab)
  const handleSurebetPernaResolve = useCallback(async (input: {
    pernaId: string;
    surebetId: string;
    bookmarkerId: string;
    resultado: string;
    stake: number;
    odd: number;
    moeda: string;
    resultadoAnterior: string | null;
    workspaceId: string;
    bookmakerNome?: string;
    silent?: boolean;
  }) => {
    try {
      const result = await liquidarPernaSurebet({
        surebet_id: input.surebetId,
        perna_id: input.pernaId,
        bookmaker_id: input.bookmarkerId,
        resultado: input.resultado as any,
        resultado_anterior: input.resultadoAnterior,
        stake: input.stake,
        odd: input.odd,
        moeda: input.moeda,
        workspace_id: input.workspaceId,
      });

      if (!result.success) {
        toast.error(result.error?.message || "Erro ao liquidar perna");
        return;
      }

      // Invalidar cache e recarregar
      invalidateSaldos(projetoId);
      fetchAllApostas();

      const resultLabel = {
        GREEN: "Green", RED: "Red", MEIO_GREEN: "½ Green",
        MEIO_RED: "½ Red", VOID: "Void",
      }[input.resultado] || input.resultado;

      if (!input.silent) {
        const nome = input.bookmakerNome || '';
        toast.success(nome ? `${resultLabel} na ${nome}` : `Resultado alterado com sucesso`);
      }
      onDataChange?.();
    } catch (error: any) {
      console.error("Erro ao liquidar perna:", error);
      toast.error("Erro ao atualizar resultado da perna");
    }
  }, [projetoId, invalidateSaldos, onDataChange]);

  // Handler para quick resolve de surebet - usa liquidação por perna (UNIFICADO com ProjetoSurebetTab)
  const handleQuickResolveSurebet = useCallback(async (surebetId: string, quickResult: SurebetQuickResult) => {
    try {
      const surebet = surebets.find(sb => sb.id === surebetId);
      if (!surebet || !surebet.pernas || !surebet.workspace_id) return;

      const pernas = surebet.pernas.filter(p => p.bookmaker_id && p.odd && p.odd > 0);
      
      for (let i = 0; i < pernas.length; i++) {
        const perna = pernas[i];
        const isWinner = quickResult.winners.includes(i);
        const resultado = quickResult.type === "all_void" ? "VOID" : (isWinner ? "GREEN" : "RED");

        await handleSurebetPernaResolve({
          pernaId: perna.id,
          surebetId,
          bookmarkerId: perna.bookmaker_id,
          resultado,
          stake: perna.stake,
          odd: perna.odd,
          moeda: perna.moeda || 'BRL',
          resultadoAnterior: perna.resultado,
          workspaceId: surebet.workspace_id!,
          silent: true,
        });
      }

      toast.success("Resultado da surebet alterado com sucesso");
    } catch (error: any) {
      console.error("Erro ao liquidar surebet:", error);
      toast.error("Erro ao liquidar surebet");
    }
  }, [surebets, handleSurebetPernaResolve]);

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
      const matchesResultado = tabFilters.resultados.length === 0 || tabFilters.resultados.includes(aposta.resultado as any);
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
      const estrategiaMultipla = am.estrategia || inferEstrategiaLegado(am);
      
      // Filtro de casa (bookmaker)
      const matchesBookmaker = selectedBookmakerIds.length === 0 || 
        selectedBookmakerIds.includes(am.bookmaker_id);
      
      // Filtro de parceiro
      const matchesParceiro = selectedParceiroIds.length === 0 || 
        (am.bookmaker?.parceiro_id && selectedParceiroIds.includes(am.bookmaker.parceiro_id));
      
      // Filtro de estratégia
      const matchesEstrategia = selectedEstrategias.includes("all") || 
        selectedEstrategias.includes(estrategiaMultipla as any);
      
      const matchesStatus = statusFilter === "all" || am.status === statusFilter;
      const matchesResultado = tabFilters.resultados.length === 0 || tabFilters.resultados.includes(am.resultado as any);
      const matchesContexto = contextoFilter === "all" || contexto === contextoFilter;
      const matchesTipo = tipoFilter === "todas" || tipoFilter === "multiplas";
      
      if (matchesBookmaker && matchesParceiro && matchesEstrategia && matchesStatus && matchesResultado && matchesContexto && matchesTipo) {
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
      
      // Filtro de estratégia - usar valor real do banco
      const surebetEstrategia = sb.estrategia || "SUREBET";
      const matchesEstrategia = selectedEstrategias.includes("all") || 
        selectedEstrategias.includes(surebetEstrategia as any);
      
      const matchesStatus = statusFilter === "all" || sb.status === statusFilter;
      const matchesResultado = tabFilters.resultados.length === 0 || tabFilters.resultados.includes(sb.resultado as any);
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
  }, [apostas, apostasMultiplas, surebets, bookmakersComBonusAtivo, tabFilters.bookmakerIds, tabFilters.parceiroIds, tabFilters.estrategias, tabFilters.resultados, statusFilter, contextoFilter, tipoFilter]);

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

  // Total counts without dimensional filters for badge comparison
  const totalAbertasRaw = useMemo(() => {
    let count = 0;
    count += apostas.filter(a => !a.resultado || a.resultado === "PENDENTE" || a.status === "PENDENTE").length;
    count += apostasMultiplas.filter(am => !am.resultado || am.resultado === "PENDENTE" || am.status === "PENDENTE").length;
    count += surebets.filter(s => !s.resultado || s.resultado === "PENDENTE" || s.status === "PENDENTE").length;
    return count;
  }, [apostas, apostasMultiplas, surebets]);
  const totalHistoricoRaw = useMemo(() => {
    let count = 0;
    count += apostas.filter(a => a.resultado && a.resultado !== "PENDENTE" && a.status !== "PENDENTE").length;
    count += apostasMultiplas.filter(am => am.resultado && am.resultado !== "PENDENTE" && am.status !== "PENDENTE").length;
    count += surebets.filter(s => s.resultado && s.resultado !== "PENDENTE" && s.status !== "PENDENTE").length;
    return count;
  }, [apostas, apostasMultiplas, surebets]);

  // Auto-switch to history tab when no open operations
  useEffect(() => {
    if (!loading && apostasAbertasList.length === 0 && apostasHistoricoList.length > 0 && apostasSubTab === 'abertas') {
      setApostasSubTab('historico');
    }
  }, [loading, apostasAbertasList.length, apostasHistoricoList.length]);
  
  // Lista final baseada na sub-aba selecionada + busca por texto
  const apostasUnificadas = useMemo(() => {
    const lista = apostasSubTab === "abertas" ? apostasAbertasList : apostasHistoricoList;
    if (!searchTerm.trim()) return lista;
    const term = searchTerm.toLowerCase();
    return lista.filter(u => {
      const d = u.data;
      const evento = ('evento' in d ? d.evento : '') || '';
      const esporte = ('esporte' in d ? d.esporte : '') || '';
      const selecao = ('selecao' in d ? d.selecao : '') || '';
      const bookmakerNome = ('bookmaker_nome' in d ? (d as any).bookmaker_nome : '') || '';
      const pernas = ('pernas' in d ? (d as any).pernas : null);
      const matchesPernas = Array.isArray(pernas) && pernas.some((p: any) => (p?.bookmaker_nome || '').toLowerCase().includes(term));
      return evento.toLowerCase().includes(term) || 
             esporte.toLowerCase().includes(term) || 
             selecao.toLowerCase().includes(term) ||
             bookmakerNome.toLowerCase().includes(term) ||
             matchesPernas;
    });
  }, [apostasSubTab, apostasAbertasList, apostasHistoricoList, searchTerm]);

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
      const shortName = getFirstLastName(bk.parceiro?.nome || "");
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
      {/* Actions Slot - botões de ação dentro da aba */}
      {actionsSlot && (
        <div className="flex items-center gap-2 pt-1 pb-2 border-b border-border/50 flex-shrink-0">
          {actionsSlot}
        </div>
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
              totalOpenCount={totalAbertasRaw}
              historyCount={apostasHistoricoList.length}
              totalHistoryCount={totalHistoricoRaw}
              viewMode={viewMode}
              onViewModeChange={(mode) => setViewMode(mode)}
              showViewToggle={true}
              searchQuery={searchTerm}
              onSearchChange={setSearchTerm}
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
            showResultadoFilter={true}
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
            ? "grid gap-5 md:grid-cols-2 xl:grid-cols-3" 
            : "space-y-2"
        )}>
          {apostasUnificadas.map((item) => {
            // ===== SUREBET =====
            if (item.tipo === "surebet") {
              const sb = item.data as Surebet;
              
              const surebetData: SurebetData = {
                ...sb,
                workspace_id: sb.workspace_id,
                lucro_real: sb.pl_consolidado ?? sb.lucro_prejuizo,
                pl_consolidado: sb.pl_consolidado,
                stake_consolidado: sb.stake_consolidado,
                pernas: groupPernasBySelecao(
                  (sb.pernas || []).map((p: any) => ({
                    id: p.id,
                    selecao: p.selecao,
                    selecao_livre: p.selecao_livre,
                    odd: p.odd,
                    stake: p.stake,
                    resultado: p.resultado,
                    lucro_prejuizo: p.lucro_prejuizo ?? null,
                    bookmaker_nome: p.bookmaker?.nome || p.bookmaker_nome || "—",
                    bookmaker_id: p.bookmaker_id,
                    moeda: p.moeda || 'BRL',
                  }))
                ),
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
                  onPernaResultChange={handleSurebetPernaResolve}
                  onDelete={prepareDeleteSurebet}
                  formatCurrency={formatCurrency}
                  convertToConsolidation={convertToConsolidation}
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
              
              // Determinar estratégia para o card - usar valor do banco diretamente
              let estrategia: string = aposta.estrategia || "NORMAL";
              if (aposta.gerou_freebet && estrategia === "NORMAL") estrategia = "FREEBET";
              else if (item.contexto === "FREEBET" && estrategia === "NORMAL") estrategia = "FREEBET";
              else if (item.contexto === "BONUS" && estrategia === "NORMAL") estrategia = "BONUS";
              
               // Preparar dados para ApostaCard - moeda ORIGINAL da aposta
               const apostaCardData: ApostaCardData = {
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
                 moeda: aposta.moeda_operacao || "BRL",
                 // Odd real da 1ª perna (pode diferir da média ponderada em aposta.odd)
                 primary_odd: (aposta as any)._sub_entries?.[0]?.odd ?? undefined,
                 // Multi-entry: sub-entradas de apostas_pernas (exclui a 1ª perna que é a principal)
                 sub_entries: (aposta as any)._sub_entries
                   ?.filter((_: any, i: number) => i > 0)
                   ?.map((p: any) => ({
                     bookmaker_nome: p.bookmaker?.nome?.split(" - ")[0] || p.bookmaker?.nome || '?',
                     parceiro_nome: p.bookmaker?.parceiro?.nome || null,
                     odd: p.odd,
                     stake: p.stake,
                     moeda: p.moeda,
                     logo_url: p.bookmaker?.bookmakers_catalogo?.logo_url || null,
                     selecao_livre: p.selecao_livre,
                    })) || undefined,
                 // Multi-currency consolidation
                 pl_consolidado: aposta.pl_consolidado ?? undefined,
                 stake_consolidado: aposta.stake_consolidado ?? undefined,
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
                   convertToConsolidation={convertToConsolidation}
                   moedaConsolidacao={moedaConsolidacao}
                 />
              );
            }

            // ===== APOSTA MÚLTIPLA - Usando ApostaCard padronizado =====
            const multipla = item.data as ApostaMultipla;
            const bookmakerBaseMultipla = multipla.bookmaker?.nome?.split(" - ")[0] || multipla.bookmaker?.nome;
            const parceiroNomeMultipla = multipla.bookmaker?.parceiro?.nome;
            const logoUrlMultipla = multipla.bookmaker?.bookmakers_catalogo?.logo_url;
            
            // Determinar estratégia - usar valor do banco diretamente
            let estrategiaMultipla: string = multipla.estrategia || "NORMAL";
            if (multipla.gerou_freebet && estrategiaMultipla === "NORMAL") estrategiaMultipla = "FREEBET";
            else if (item.contexto === "FREEBET" && estrategiaMultipla === "NORMAL") estrategiaMultipla = "FREEBET";
            else if (item.contexto === "BONUS" && estrategiaMultipla === "NORMAL") estrategiaMultipla = "BONUS";
            
            // Preparar dados para ApostaCard (múltipla) - moeda ORIGINAL
             const multiplaCardData = {
               id: multipla.id,
               evento: (multipla as any).evento || '',
               esporte: (multipla as any).esporte || '',
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
               moeda: multipla.moeda_operacao || "BRL",
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
                 convertToConsolidation={convertToConsolidation}
                 moedaConsolidacao={moedaConsolidacao}
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
