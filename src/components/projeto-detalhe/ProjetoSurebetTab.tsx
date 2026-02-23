import { useState, useEffect, useMemo, useCallback } from "react";
import { useQueryClient, useQuery, keepPreviousData } from "@tanstack/react-query";
import { PERIOD_STALE_TIME, PERIOD_GC_TIME } from "@/lib/query-cache-config";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { LucroCurrencyTooltip } from "@/components/ui/lucro-currency-tooltip";
import { Skeleton } from "@/components/ui/skeleton";
import { KpiSummaryBar } from "@/components/ui/kpi-summary-bar";
import { useCrossWindowSync } from "@/hooks/useCrossWindowSync";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { 
  Calculator, 
  Target, 
  TrendingUp, 
  TrendingDown,
  LayoutGrid,
  List,
  Plus,
  Building2,
  Info,
  LayoutDashboard,
  PanelLeft,
  LayoutList,
  Clock,
  History,
  ArrowUpDown,
  Users
} from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { getOperationalDateRangeForQuery } from "@/utils/dateUtils";
import { toast } from "sonner";
import { SurebetDialog } from "./SurebetDialog";
import { SurebetCard, SurebetData, SurebetPerna } from "./SurebetCard";
import type { SurebetQuickResult } from "@/components/apostas/SurebetRowActionsMenu";
import { ApostaDialog } from "./ApostaDialog";
import { ApostaCard, ApostaCardData } from "./ApostaCard";
import { VisaoGeralCharts } from "./VisaoGeralCharts";
import { SurebetStatisticsCard } from "./SurebetStatisticsCard";

import { parsePernaFromJson, PernaArbitragem } from "@/types/apostasUnificada";
import { cn, getFirstLastName } from "@/lib/utils";
import { useOpenOperationsCount } from "@/hooks/useOpenOperationsCount";
import { APOSTA_ESTRATEGIA } from "@/lib/apostaConstants";
import { useProjetoCurrency } from "@/hooks/useProjetoCurrency";
import { useCotacoes } from "@/hooks/useCotacoes";
import { VolumeKPI } from "@/components/kpis/VolumeKPI";
import { calcularImpactoResultado } from "@/lib/bookmakerBalanceHelper";
import { getConsolidatedStake, getConsolidatedLucro } from "@/utils/consolidatedValues";
import { reliquidarAposta, liquidarPernaSurebet, deletarAposta } from "@/services/aposta/ApostaService";
import { useBonusBalanceManager } from "@/hooks/useBonusBalanceManager";
import { useInvalidateBookmakerSaldos, useBookmakerSaldosQuery, BookmakerSaldo } from "@/hooks/useBookmakerSaldosQuery";
import { useBookmakerLogoMap } from "@/hooks/useBookmakerLogoMap";
import { useTabFilters, type EstrategiaFilter } from "@/hooks/useTabFilters";
import { TabFiltersBar } from "./TabFiltersBar";
import { StandardTimeFilter, StandardPeriodFilter, getDateRangeFromPeriod, DateRange as FilterDateRange } from "./StandardTimeFilter";
import { OperationsSubTabHeader, type HistorySubTab } from "./operations";
import { ExportMenu, transformSurebetToExport, transformApostaToExport } from "./ExportMenu";
import { SaldoOperavelCard } from "./SaldoOperavelCard";
import { useCalendarApostas, transformCalendarApostasForCharts } from "@/hooks/useCalendarApostas";
import { ChartEmptyState } from "@/components/ui/chart-empty-state";

interface ProjetoSurebetTabProps {
  projetoId: string;
  onDataChange?: () => void;
  refreshTrigger?: number;
  actionsSlot?: React.ReactNode;
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
  workspace_id?: string;
  pernas?: SurebetPerna[];
  // Campos adicionais para diferenciar tipo de registro
  forma_registro?: string;
  estrategia?: string;
  contexto_operacional?: string;
  stake?: number;
  odd?: number;
  selecao?: string;
  bookmaker_id?: string;
  bookmaker_nome?: string;
  parceiro_nome?: string;
  // Campos para bônus
  stake_bonus?: number | null;
  bonus_id?: string | null;
  // Campos de consolidação multi-moeda
  moeda_operacao?: string | null;
  stake_consolidado?: number | null;
  pl_consolidado?: number | null;
  valor_brl_referencia?: number | null;
  lucro_prejuizo_brl_referencia?: number | null;
  lucro_prejuizo?: number | null;
}

// REMOVIDO: Interface Bookmaker - agora usa BookmakerSaldo do hook centralizado

type NavigationMode = "tabs" | "sidebar";
type NavTabValue = "visao-geral" | "operacoes" | "por-casa";

const NAV_STORAGE_KEY = "surebet-nav-mode";

// Ordenação para Por Casa
type SortField = "volume" | "lucro" | "apostas" | "roi";

interface VinculoData {
  vinculo: string;
  apostas: number;
  volume: number;
  lucro: number;
  roi: number;
}

interface CasaAgregada {
  casa: string;
  apostas: number;
  volume: number;
  lucro: number;
  roi: number;
  vinculos: VinculoData[];
}

// Função utilitária para obter lucro de uma perna
// Prioriza o valor salvo no banco (lucro_prejuizo), calcula se não existir
const getLucroPerna = (perna: SurebetPerna & { lucro_prejuizo?: number | null }): number => {
  // Se já tem lucro calculado e salvo, usar direto
  if (typeof perna.lucro_prejuizo === "number") {
    return perna.lucro_prejuizo;
  }
  
  // Fallback: calcular baseado no resultado
  const stake = perna.stake || 0;
  const odd = perna.odd || 0;
  const resultado = perna.resultado;
  
  if (!resultado || resultado === "PENDENTE") {
    return 0;
  }
  
  switch (resultado) {
    case "GREEN":
      return (odd * stake) - stake;
    case "MEIO_GREEN":
      return ((odd * stake) - stake) / 2;
    case "RED":
      return -stake;
    case "MEIO_RED":
      return -stake / 2;
    case "VOID":
      return 0;
    default:
      return 0;
  }
};

export function ProjetoSurebetTab({ projetoId, onDataChange, refreshTrigger, actionsSlot }: ProjetoSurebetTabProps) {
  const queryClient = useQueryClient();
  
  
  // FONTE ÚNICA DE VERDADE: Usa o hook centralizado para saldos de bookmakers
  const { data: bookmakers = [], refetch: refetchBookmakers } = useBookmakerSaldosQuery({
    projetoId,
    includeZeroBalance: true, // Mostrar todas as casas para agregação por casa
  });
  const [viewMode, setViewMode] = useState<"cards" | "list">("list");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [selectedSurebet, setSelectedSurebet] = useState<Surebet | null>(null);
  
  // Estados para ApostaDialog (apostas simples no contexto Surebet)
  const [apostaDialogOpen, setApostaDialogOpen] = useState(false);
  const [selectedAposta, setSelectedAposta] = useState<any>(null);
  
  // Hook para invalidar cache de saldos
  const invalidateSaldos = useInvalidateBookmakerSaldos();
  
  // Hook para gerenciamento de rollover (bônus)
  // NOTA: processarLiquidacaoBonus e reverterLiquidacaoBonus removidos - modelo unificado
  const { 
    hasActiveRolloverBonus, 
    atualizarProgressoRollover
  } = useBonusBalanceManager();

  // Hook global de logos de bookmakers (busca do catálogo)
  const { logoMap: catalogLogoMap } = useBookmakerLogoMap();

  // Hook de formatação de moeda do projeto
  const { formatCurrency: projectFormatCurrency, moedaConsolidacao, getSymbol, convertToConsolidation: convertFn, convertToConsolidationOficial: convertFnOficial } = useProjetoCurrency(projetoId);
  const { getRate, lastUpdate: rateLastUpdate } = useCotacoes();
  const currencySymbol = getSymbol();
  
  // DESACOPLAMENTO CALENDÁRIO: Dados separados para o calendário (sem filtro de período)
  const { apostas: calendarApostas, refetch: refetchCalendar } = useCalendarApostas({
    projetoId,
    estrategia: "SUREBET",
  });
  
  // Sub-abas Abertas/Histórico - usa tipo padronizado
  const [operacoesSubTab, setOperacoesSubTab] = useState<HistorySubTab>("abertas");
  const [searchTerm, setSearchTerm] = useState("");
  
  // Ordenação Por Casa
  const [porCasaSort, setPorCasaSort] = useState<SortField>("volume");

  // Navigation mode
  const [navMode, setNavMode] = useState<NavigationMode>(() => {
    const saved = localStorage.getItem(NAV_STORAGE_KEY);
    return (saved === "tabs" ? "tabs" : "sidebar") as NavigationMode;
  });
  const [activeNavTab, setActiveNavTab] = useState<NavTabValue>("visao-geral");
  const [isTransitioning, setIsTransitioning] = useState(false);

  // === FILTROS LOCAIS DA ABA SUREBET ===
  // ARQUITETURA: Esta aba usa seu próprio estado de filtros, independente de outras abas
  const tabFilters = useTabFilters({
    tabId: "surebet",
    projetoId,
    defaultPeriod: "mes_atual",
    persist: true,
  });

  // dateRange derivado dos filtros locais
  const dateRange = tabFilters.dateRange;

  // React Query para surebets - com cache e transição suave
  const surebetsQueryKey = useMemo(() => [
    "surebets-tab", projetoId, dateRange?.start?.toISOString(), dateRange?.end?.toISOString(),
    refreshTrigger
  ], [projetoId, dateRange, refreshTrigger]);
  
  const { data: surebets = [], isLoading: loading, refetch: refetchSurebets } = useQuery({
    queryKey: surebetsQueryKey,
    queryFn: async (): Promise<Surebet[]> => {
      let query = supabase
        .from("apostas_unificada")
        .select(`
          id, workspace_id, data_aposta, evento, esporte, modelo, mercado, stake, stake_total, stake_bonus,
          spread_calculado, roi_esperado, lucro_esperado, lucro_prejuizo, roi_real,
          status, resultado, observacoes, forma_registro, estrategia, contexto_operacional,
          odd, selecao, bookmaker_id, bonus_id,
          moeda_operacao, stake_consolidado, pl_consolidado, valor_brl_referencia, lucro_prejuizo_brl_referencia,
          bookmaker:bookmakers(nome, parceiro:parceiros(nome))
        `)
        .eq("projeto_id", projetoId)
        .eq("estrategia", "SUREBET")
        .is("cancelled_at", null)
        .order("data_aposta", { ascending: false });
      
      if (dateRange) {
        const { startUTC, endUTC } = getOperationalDateRangeForQuery(dateRange.start, dateRange.end);
        query = query.gte("data_aposta", startUTC);
        query = query.lte("data_aposta", endUTC);
      }

      const { data: arbitragensData, error } = await query;
      if (error) throw error;

      // Query separada para PENDENTES sem filtro de data (garantir que abertas sempre apareçam)
      let allData = arbitragensData || [];
      if (dateRange) {
        const { data: pendentesData } = await supabase
          .from("apostas_unificada")
          .select(`
            id, workspace_id, data_aposta, evento, esporte, modelo, mercado, stake, stake_total, stake_bonus,
            spread_calculado, roi_esperado, lucro_esperado, lucro_prejuizo, roi_real,
            status, resultado, observacoes, forma_registro, estrategia, contexto_operacional,
            odd, selecao, bookmaker_id, bonus_id,
            moeda_operacao, stake_consolidado, pl_consolidado, valor_brl_referencia, lucro_prejuizo_brl_referencia,
            bookmaker:bookmakers(nome, parceiro:parceiros(nome))
          `)
          .eq("projeto_id", projetoId)
          .eq("estrategia", "SUREBET")
          .eq("status", "PENDENTE")
          .is("cancelled_at", null)
          .order("data_aposta", { ascending: false });

        if (pendentesData && pendentesData.length > 0) {
          const existingIds = new Set(allData.map((a: any) => a.id));
          const newPendentes = pendentesData.filter((p: any) => !existingIds.has(p.id));
          allData = [...allData, ...newPendentes];
        }
      }

      if (allData.length === 0) return [];

      const apostaIdsMultiLeg = allData
        .filter((arb: any) => 
          arb.forma_registro === 'ARBITRAGEM' || arb.forma_registro === 'SUREBET' ||
          (arb.modelo && arb.modelo !== 'SIMPLES')
        )
        .map((arb: any) => arb.id);
      
      let pernasMap: Record<string, any[]> = {};
      if (apostaIdsMultiLeg.length > 0) {
        const { data: pernasData } = await supabase
          .from("apostas_pernas")
          .select(`
            id, aposta_id, bookmaker_id, moeda, selecao, selecao_livre, odd, stake,
            resultado, lucro_prejuizo, gerou_freebet, valor_freebet_gerada,
            bookmakers (nome, parceiro:parceiros(nome))
          `)
          .in("aposta_id", apostaIdsMultiLeg)
          .order("ordem", { ascending: true });
        
        (pernasData || []).forEach((p: any) => {
          if (!pernasMap[p.aposta_id]) pernasMap[p.aposta_id] = [];
          const bookmaker = p.bookmakers as any;
          const parceiroNome = bookmaker?.parceiro?.nome;
          pernasMap[p.aposta_id].push({
            id: p.id,
            bookmaker_id: p.bookmaker_id,
            bookmaker_nome: parceiroNome ? `${bookmaker?.nome || "—"} - ${parceiroNome}` : (bookmaker?.nome || "—"),
            moeda: p.moeda || 'BRL',
            selecao: p.selecao, selecao_livre: p.selecao_livre, odd: p.odd, stake: p.stake,
            resultado: p.resultado, lucro_prejuizo: p.lucro_prejuizo,
            gerou_freebet: p.gerou_freebet, valor_freebet_gerada: p.valor_freebet_gerada,
          });
        });
      }

      return allData.map((arb: any) => {
        const pernasRaw = pernasMap[arb.id] || parsePernaFromJson(arb.pernas);
        const pernasOrdenadas = [...pernasRaw].sort((a, b) => {
          const order: Record<string, number> = { "Casa": 1, "1": 1, "Empate": 2, "X": 2, "Fora": 3, "2": 3 };
          return (order[a.selecao] || 99) - (order[b.selecao] || 99);
        });
        const pernasSurebetCard: SurebetPerna[] = pernasOrdenadas.map((p, idx) => ({
          id: p.id || `perna-${idx}`, selecao: p.selecao, selecao_livre: p.selecao_livre,
          odd: p.odd, stake: p.stake, resultado: p.resultado, lucro_prejuizo: p.lucro_prejuizo,
          bookmaker_nome: p.bookmaker_nome || "—", bookmaker_id: p.bookmaker_id,
          moeda: p.moeda || 'BRL',
        }));
        const hasValidPernas = pernasSurebetCard.length > 0;
        const isSimples = arb.forma_registro === "SIMPLES" && !hasValidPernas;
        return {
          id: arb.id, workspace_id: arb.workspace_id, data_operacao: arb.data_aposta, evento: arb.evento || "",
          esporte: arb.esporte || "", modelo: arb.modelo || "1-2", mercado: arb.mercado,
          stake_total: arb.stake_total || arb.stake || 0, spread_calculado: arb.spread_calculado,
          roi_esperado: arb.roi_esperado, lucro_esperado: arb.lucro_esperado,
          lucro_real: arb.pl_consolidado ?? arb.lucro_prejuizo, roi_real: arb.roi_real,
          status: arb.status, resultado: arb.resultado, observacoes: arb.observacoes,
          pernas: pernasSurebetCard, forma_registro: arb.forma_registro,
          estrategia: arb.estrategia, contexto_operacional: arb.contexto_operacional,
          stake: arb.stake, stake_bonus: arb.stake_bonus, bonus_id: arb.bonus_id,
          odd: arb.odd, selecao: arb.selecao, bookmaker_id: arb.bookmaker_id,
          bookmaker_nome: isSimples ? ((arb as any).bookmaker?.nome || "—") : (pernasRaw[0]?.bookmaker_nome || "—"),
          parceiro_nome: isSimples ? ((arb as any).bookmaker?.parceiro?.nome || undefined) : undefined,
          // Campos de consolidação multi-moeda
          moeda_operacao: arb.moeda_operacao,
          stake_consolidado: arb.stake_consolidado,
          pl_consolidado: arb.pl_consolidado,
          valor_brl_referencia: arb.valor_brl_referencia,
          lucro_prejuizo_brl_referencia: arb.lucro_prejuizo_brl_referencia,
          lucro_prejuizo: arb.lucro_prejuizo,
        };
      });
    },
    staleTime: PERIOD_STALE_TIME,
    gcTime: PERIOD_GC_TIME,
    placeholderData: keepPreviousData,
  });

  // Count of open operations for badge - uses the canonical hook
  const { count: openOperationsCount } = useOpenOperationsCount({
    projetoId,
    estrategia: APOSTA_ESTRATEGIA.SUREBET,
    refreshTrigger,
  });

  // NAV_ITEMS with dynamic count for badge
  const NAV_ITEMS = useMemo(() => [
    { value: "visao-geral" as NavTabValue, label: "Visão Geral", icon: LayoutDashboard },
    { value: "operacoes" as NavTabValue, label: "Operações", icon: Target, showBadge: true, count: openOperationsCount },
    { value: "por-casa" as NavTabValue, label: "Por Casa", icon: Building2 },
  ], [openOperationsCount]);

  // Save nav mode preference
  useEffect(() => {
    localStorage.setItem(NAV_STORAGE_KEY, navMode);
  }, [navMode]);

  // Hook centralizado para sincronização cross-window
  useCrossWindowSync({
    projetoId,
    onSync: useCallback(() => {
      refetchSurebets();
      queryClient.invalidateQueries({ queryKey: ["projeto-resultado", projetoId] });
      queryClient.invalidateQueries({ queryKey: ["bookmaker-saldos"] });
    }, [queryClient, projetoId, refetchSurebets]),
  });

  // REMOVIDO: fetchBookmakers - agora usa useBookmakerSaldosQuery centralizado

  const handleDataChange = () => {
    refetchSurebets();
    onDataChange?.();
  };

  // Resolução rápida de apostas simples - USA RPC ATÔMICA + ROLLOVER
  const handleQuickResolve = useCallback(async (apostaId: string, resultado: string) => {
    try {
      const operacao = surebets.find(s => s.id === apostaId);
      if (!operacao) return;

      // Só permitir para apostas simples (forma_registro = 'SIMPLES')
      if (operacao.forma_registro !== "SIMPLES") return;

      const stake = operacao.stake || operacao.stake_total || 0;
      const odd = operacao.odd || 1;
      const bookmakerId = operacao.bookmaker_id;
      
      // Calcular lucro usando função canônica
      const lucro = calcularImpactoResultado(stake, odd, resultado);

      // 1. Liquidar via RPC atômica (atualiza aposta + registra no ledger + trigger atualiza saldo)
      const rpcResult = await reliquidarAposta(apostaId, resultado, lucro);
      
      if (!rpcResult.success) {
        toast.error(rpcResult.error?.message || "Erro ao liquidar aposta");
        return;
      }

      // 2. Atualizar rollover se houver bônus ativo para a casa
      if (bookmakerId && resultado !== "VOID") {
        const temBonusAtivo = await hasActiveRolloverBonus(projetoId, bookmakerId);
        if (temBonusAtivo) {
          await atualizarProgressoRollover(projetoId, bookmakerId, stake, odd);
        }
      }

      // 3. Invalidar cache de surebets para refetch
      queryClient.invalidateQueries({ queryKey: ["surebets-tab", projetoId] });

      // 4. Invalidar cache de saldos
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
  }, [surebets, onDataChange, projetoId, invalidateSaldos, hasActiveRolloverBonus, atualizarProgressoRollover]);

  // Liquidação de perna individual de Surebet via motor financeiro
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

      queryClient.invalidateQueries({ queryKey: ["surebets-tab", projetoId] });
      invalidateSaldos(projetoId);

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
  }, [projetoId, invalidateSaldos, onDataChange, queryClient]);

  // Liquidação rápida de Surebet completa (via menu, baseado em winners)
  const handleSurebetQuickResolve = useCallback(async (surebetId: string, result: SurebetQuickResult) => {
    try {
      const operacao = surebets.find(s => s.id === surebetId);
      if (!operacao?.pernas || !operacao.workspace_id) return;

      const pernas = operacao.pernas.filter(p => p.bookmaker_id && p.odd > 0);
      
      for (let i = 0; i < pernas.length; i++) {
        const perna = pernas[i];
        const isWinner = result.winners.includes(i);
        const resultado = result.type === "all_void" ? "VOID" : (isWinner ? "GREEN" : "RED");

        await handleSurebetPernaResolve({
          pernaId: perna.id,
          surebetId,
          bookmarkerId: perna.bookmaker_id!,
          resultado,
          stake: perna.stake,
          odd: perna.odd,
          moeda: perna.moeda || 'BRL',
          resultadoAnterior: perna.resultado,
          workspaceId: operacao.workspace_id!,
          silent: true,
        });
      }

      toast.success("Resultado da surebet alterado com sucesso");
    } catch (error: any) {
      console.error("Erro ao liquidar surebet:", error);
      toast.error("Erro ao liquidar surebet");
    }
  }, [surebets, handleSurebetPernaResolve]);

  // Deletar surebet
  const handleSurebetDelete = useCallback(async (surebetId: string) => {
    try {
      const result = await deletarAposta(surebetId);
      if (!result.success) {
        toast.error(result.error?.message || "Erro ao excluir surebet");
        return;
      }
      queryClient.invalidateQueries({ queryKey: ["surebets-tab", projetoId] });
      invalidateSaldos(projetoId);
      toast.success("Surebet excluída");
      onDataChange?.();
    } catch (error: any) {
      console.error("Erro ao excluir surebet:", error);
      toast.error("Erro ao excluir surebet");
    }
  }, [projetoId, invalidateSaldos, onDataChange, queryClient]);

  // Usa a formatação do projeto (moeda de consolidação)
  const formatCurrency = projectFormatCurrency;

  const formatPercent = (value: number | null) => {
    if (value === null) return "-";
    return `${value >= 0 ? "+" : ""}${value.toFixed(2)}%`;
  };

  // === ISOLAMENTO TOTAL DE FILTROS POR SUB-ABA ===
  // ARQUITETURA: Filtros dimensionais (Casa/Parceiro) afetam APENAS a aba "Operações"
  // "Visão Geral" e "Por Casa" usam TODOS os dados (apenas filtro de data)
  
  // Mapa de bookmaker_id -> nome completo com parceiro para enriquecer dados legados no SurebetCard
  const bookmakerNomeMap = useMemo(() => {
    const map = new Map<string, string>();
    bookmakers.forEach(bk => {
      const shortName = getFirstLastName(bk.parceiro_nome || "");
      const nomeCompleto = shortName ? `${bk.nome} - ${shortName}` : bk.nome;
      map.set(bk.id, nomeCompleto);
    });
    return map;
  }, [bookmakers]);

  // FILTRO PARA OPERAÇÕES: Aplica filtros dimensionais (Casa/Parceiro)
  // Este filtro afeta APENAS a sub-aba "Operações"
  const filteredSurebetsForOperacoes = useMemo(() => {
    const { bookmakerIds, parceiroIds, resultados } = tabFilters;
    
    // Se nenhum filtro dimensional ativo, retorna tudo
    if (bookmakerIds.length === 0 && parceiroIds.length === 0 && resultados.length === 0) {
      return surebets;
    }
    
    return surebets.filter(surebet => {
      // Filtro por bookmaker
      if (bookmakerIds.length > 0) {
        const surebetBookmakerIds = (surebet.pernas || []).map(p => p.bookmaker_id).filter(Boolean);
        if (surebet.bookmaker_id) surebetBookmakerIds.push(surebet.bookmaker_id);
        
        const hasMatchingBookmaker = surebetBookmakerIds.some(id => bookmakerIds.includes(id!));
        if (!hasMatchingBookmaker) return false;
      }
      
      // Filtro por parceiro (verificar via bookmakers)
      if (parceiroIds.length > 0) {
        const surebetBookmakerIds = (surebet.pernas || []).map(p => p.bookmaker_id).filter(Boolean);
        if (surebet.bookmaker_id) surebetBookmakerIds.push(surebet.bookmaker_id);
        
        const matchingBookmakers = bookmakers.filter(bk => 
          surebetBookmakerIds.includes(bk.id) && 
          bk.parceiro_id && 
          parceiroIds.includes(bk.parceiro_id)
        );
        
        if (matchingBookmakers.length === 0) return false;
      }

      // Filtro por resultado
      if (resultados.length > 0) {
        if (!surebet.resultado || !resultados.includes(surebet.resultado as any)) return false;
      }
      
      return true;
    });
  }, [surebets, tabFilters.bookmakerIds, tabFilters.parceiroIds, tabFilters.resultados, bookmakers]);

  // KPIs GLOBAIS (para Visão Geral) - NUNCA filtrados por Casa/Parceiro
  // Usa `surebets` diretamente (já filtrado por data no fetch)
  const kpisGlobal = useMemo(() => {
    const total = surebets.length;
    const pendentes = surebets.filter(s => s.status === "PENDENTE").length;
    const liquidadas = surebets.filter(s => s.status === "LIQUIDADA").length;
    const greens = surebets.filter(s => s.resultado === "GREEN").length;
    const reds = surebets.filter(s => s.resultado === "RED").length;
    const lucroTotal = surebets.reduce((acc, s) => acc + getConsolidatedLucro(s, convertFnOficial, moedaConsolidacao), 0);
    const stakeTotal = surebets.reduce((acc, s) => acc + getConsolidatedStake(s, convertFnOficial, moedaConsolidacao), 0);
    const roi = stakeTotal > 0 ? (lucroTotal / stakeTotal) * 100 : 0;

    // Breakdown de volume por moeda original
    const volumePorMoeda = new Map<string, number>();
    surebets.forEach(s => {
      const moeda = s.moeda_operacao || "BRL";
      const rawStake = s.forma_registro === "ARBITRAGEM" ? (s.stake_total || 0) : (s.stake || s.stake_total || 0);
      volumePorMoeda.set(moeda, (volumePorMoeda.get(moeda) || 0) + rawStake);
    });
    const currencyBreakdown = Array.from(volumePorMoeda.entries())
      .map(([moeda, valor]) => ({ moeda, valor }))
      .filter(item => Math.abs(item.valor) > 0.01);

    // Breakdown de LUCRO por moeda original
    const lucroPorMoedaMap = new Map<string, number>();
    surebets.forEach(s => {
      const moeda = s.moeda_operacao || "BRL";
      const rawLucro = s.lucro_real || 0;
      lucroPorMoedaMap.set(moeda, (lucroPorMoedaMap.get(moeda) || 0) + rawLucro);
    });
    const lucroPorMoeda = Array.from(lucroPorMoedaMap.entries())
      .map(([moeda, valor]) => ({ moeda, valor }))
      .filter(item => Math.abs(item.valor) > 0.01);
    
    return { total, pendentes, liquidadas, greens, reds, lucroTotal, stakeTotal, roi, currencyBreakdown, lucroPorMoeda };
  }, [surebets, convertFnOficial, moedaConsolidacao]);

  // KPIs FILTRADOS (para Operações) - Aplicam filtros dimensionais
  const kpisOperacoes = useMemo(() => {
    const total = filteredSurebetsForOperacoes.length;
    const pendentes = filteredSurebetsForOperacoes.filter(s => s.status === "PENDENTE").length;
    const liquidadas = filteredSurebetsForOperacoes.filter(s => s.status === "LIQUIDADA").length;
    const greens = filteredSurebetsForOperacoes.filter(s => s.resultado === "GREEN").length;
    const reds = filteredSurebetsForOperacoes.filter(s => s.resultado === "RED").length;
    const lucroTotal = filteredSurebetsForOperacoes.reduce((acc, s) => acc + getConsolidatedLucro(s, convertFnOficial, moedaConsolidacao), 0);
    const stakeTotal = filteredSurebetsForOperacoes.reduce((acc, s) => acc + getConsolidatedStake(s, convertFnOficial, moedaConsolidacao), 0);
    const roi = stakeTotal > 0 ? (lucroTotal / stakeTotal) * 100 : 0;
    
    return { total, pendentes, liquidadas, greens, reds, lucroTotal, stakeTotal, roi };
  }, [filteredSurebetsForOperacoes, convertFnOficial, moedaConsolidacao]);

  // Alias para compatibilidade - o KPI de referência depende da sub-aba ativa
  // Mas para a Visão Geral sempre usamos kpisGlobal
  const kpis = kpisGlobal;

  // casaData agregado por CASA (não por vínculo) - Padrão unificado
  const casaData = useMemo((): CasaAgregada[] => {
    const casaMap = new Map<string, {
      apostas: number;
      volume: number;
      lucro: number;
      vinculos: Map<string, { apostas: number; volume: number; lucro: number }>;
    }>();

    const extractCasaVinculo = (nomeCompleto: string) => {
      const separatorIdx = nomeCompleto.indexOf(" - ");
      if (separatorIdx > 0) {
        const vinculoRaw = nomeCompleto.substring(separatorIdx + 3).trim();
        return {
          casa: nomeCompleto.substring(0, separatorIdx).trim(),
          vinculo: getFirstLastName(vinculoRaw)
        };
      }
      return { casa: nomeCompleto, vinculo: "Principal" };
    };

    const processEntry = (nomeCompleto: string, stake: number, lucro: number) => {
      const { casa, vinculo } = extractCasaVinculo(nomeCompleto);

      if (!casaMap.has(casa)) {
        casaMap.set(casa, { apostas: 0, volume: 0, lucro: 0, vinculos: new Map() });
      }
      const casaEntry = casaMap.get(casa)!;
      casaEntry.apostas += 1;
      casaEntry.volume += stake;
      casaEntry.lucro += lucro;

      if (!casaEntry.vinculos.has(vinculo)) {
        casaEntry.vinculos.set(vinculo, { apostas: 0, volume: 0, lucro: 0 });
      }
      const vinculoEntry = casaEntry.vinculos.get(vinculo)!;
      vinculoEntry.apostas += 1;
      vinculoEntry.volume += stake;
      vinculoEntry.lucro += lucro;
    };

    // ISOLAMENTO: casaData usa dados GLOBAIS (surebets), sem filtro dimensional
    // Isso garante que "Por Casa" sempre mostre TODAS as casas
    surebets.forEach((surebet) => {
      // Apostas simples (sem pernas) - usar bookmaker_nome direto
      if (surebet.forma_registro === "SIMPLES" || !surebet.pernas?.length) {
        const nomeCompleto = surebet.bookmaker_nome || "Desconhecida";
        const stake = surebet.stake || surebet.stake_total || 0;
        const lucro = surebet.lucro_real || 0;
        processEntry(nomeCompleto, stake, lucro);
      } else {
        // Surebets com múltiplas pernas
        surebet.pernas.forEach(perna => {
          const nomeCompleto = perna.bookmaker_nome || "Desconhecida";
          const lucroPerna = getLucroPerna(perna);
          processEntry(nomeCompleto, perna.stake, lucroPerna);
        });
      }
    });

    return Array.from(casaMap.entries())
      .map(([casa, data]) => {
        const roi = data.volume > 0 ? (data.lucro / data.volume) * 100 : 0;
        return {
          casa,
          apostas: data.apostas,
          volume: data.volume,
          lucro: data.lucro,
          roi,
          vinculos: Array.from(data.vinculos.entries())
            .map(([vinculo, v]) => ({
              vinculo,
              apostas: v.apostas,
              volume: v.volume,
              lucro: v.lucro,
              roi: v.volume > 0 ? (v.lucro / v.volume) * 100 : 0,
            }))
            .sort((a, b) => b.volume - a.volume),
        };
      })
      .sort((a, b) => b.volume - a.volume)
      .slice(0, 8);
  }, [surebets]);

  // Mapa de logos combinando catálogo global + bookmakers do projeto
  // Prioridade: catálogo global (mais completo e confiável)
  const logoMap = useMemo(() => {
    const map = new Map<string, string | null>();
    
    // 1. Primeiro, adiciona logos do catálogo global
    if (catalogLogoMap) {
      for (const [key, value] of catalogLogoMap.entries()) {
        map.set(key, value);
      }
    }
    
    // 2. Adiciona logos dos bookmakers do projeto (fallback)
    bookmakers.forEach(bk => {
      const nomeParts = bk.nome.split(" - ");
      const baseName = nomeParts[0].trim().toUpperCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "");
      const logoUrl = bk.logo_url || null;
      if (logoUrl && !map.has(baseName)) {
        map.set(baseName, logoUrl);
      }
    });
    
    return map;
  }, [bookmakers, catalogLogoMap]);

  // Função helper para buscar logo por nome da casa
  const getLogoUrl = useCallback((casaName: string): string | null => {
    if (!casaName || logoMap.size === 0) return null;
    
    const normalizedInput = casaName
      .toUpperCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .trim();
    
    // Match exato
    if (logoMap.has(normalizedInput)) {
      return logoMap.get(normalizedInput) ?? null;
    }
    
    // Match parcial
    for (const [key, value] of logoMap.entries()) {
      if (normalizedInput.includes(key) || key.includes(normalizedInput)) {
        return value ?? null;
      }
    }
    
    return null;
  }, [logoMap]);
  const casaDataSorted = useMemo(() => {
    return [...casaData].sort((a, b) => {
      switch (porCasaSort) {
        case "lucro": return b.lucro - a.lucro;
        case "apostas": return b.apostas - a.apostas;
        case "roi": return b.roi - a.roi;
        case "volume":
        default: return b.volume - a.volume;
      }
    });
  }, [casaData, porCasaSort]);

  // Separar surebets em abertas e histórico (usando dados FILTRADOS para Operações)
  // ISOLAMENTO: Filtros dimensionais (Casa/Parceiro) afetam APENAS esta lista
  const surebetsAbertas = useMemo(() => filteredSurebetsForOperacoes.filter(s => !s.resultado || s.resultado === "PENDENTE" || s.status === "PENDENTE"), [filteredSurebetsForOperacoes]);
  const surebetsHistorico = useMemo(() => filteredSurebetsForOperacoes.filter(s => s.resultado && s.resultado !== "PENDENTE" && s.status !== "PENDENTE"), [filteredSurebetsForOperacoes]);

  // Contagens totais (sem filtros dimensionais) para indicar no badge
  const totalSurebetsAbertas = useMemo(() => surebets.filter(s => !s.resultado || s.resultado === "PENDENTE" || s.status === "PENDENTE").length, [surebets]);
  const totalSurebetsHistorico = useMemo(() => surebets.filter(s => s.resultado && s.resultado !== "PENDENTE" && s.status !== "PENDENTE").length, [surebets]);

  // Auto-switch to history tab when no open operations
  useEffect(() => {
    if (!loading && surebetsAbertas.length === 0 && surebetsHistorico.length > 0 && operacoesSubTab === 'abertas') {
      setOperacoesSubTab('historico');
    }
  }, [loading, surebetsAbertas.length, surebetsHistorico.length]);
  
  // Lista baseada na sub-aba selecionada + busca por texto
  const surebetsListaAtual = useMemo(() => {
    const lista = operacoesSubTab === "abertas" ? surebetsAbertas : surebetsHistorico;
    if (!searchTerm.trim()) return lista;
    const term = searchTerm.toLowerCase();
    return lista.filter(s => {
      const matchesBasic = (s.evento || '').toLowerCase().includes(term) ||
        (s.esporte || '').toLowerCase().includes(term) ||
        (s.modelo || '').toLowerCase().includes(term);
      if (matchesBasic) return true;
      // Busca por nome de casa (bookmaker) - simples ou pernas
      if ((s.bookmaker_nome || '').toLowerCase().includes(term)) return true;
      if (s.pernas?.some(p => (p.bookmaker_nome || '').toLowerCase().includes(term))) return true;
      return false;
    });
  }, [operacoesSubTab, surebetsAbertas, surebetsHistorico, searchTerm]);

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

  // Period filter component - usa filtros locais da aba
  const periodFilterComponent = (
    <StandardTimeFilter
      period={tabFilters.period}
      onPeriodChange={tabFilters.setPeriod}
      customDateRange={tabFilters.customDateRange}
      onCustomDateRangeChange={tabFilters.setCustomDateRange}
    />
  );

  // Render Visão Geral
  const renderVisaoGeral = () => (
    <div className="space-y-6">
      {/* KPIs - Faixa compacta horizontal */}
      <KpiSummaryBar
        actions={actionsSlot}
        leading={<SaldoOperavelCard projetoId={projetoId} variant="compact" />}
        items={[
          {
            label: "Surebets",
            value: kpis.total,
            tooltip: (
              <div className="space-y-1.5">
                <p className="font-semibold text-foreground">Detalhamento de Surebets</p>
                <div className="space-y-0.5">
                  <div className="flex justify-between gap-4">
                    <span className="flex items-center gap-1.5"><span className="inline-block w-1.5 h-1.5 rounded-full bg-emerald-500" /> Greens</span>
                    <span className="font-semibold text-foreground">{kpis.greens}</span>
                  </div>
                  <div className="flex justify-between gap-4">
                    <span className="flex items-center gap-1.5"><span className="inline-block w-1.5 h-1.5 rounded-full bg-red-500" /> Reds</span>
                    <span className="font-semibold text-foreground">{kpis.reds}</span>
                  </div>
                  {kpis.pendentes > 0 && (
                    <div className="flex justify-between gap-4">
                      <span className="flex items-center gap-1.5"><span className="inline-block w-1.5 h-1.5 rounded-full bg-blue-400" /> Pendentes</span>
                      <span className="font-semibold text-foreground">{kpis.pendentes}</span>
                    </div>
                  )}
                </div>
                <div className="border-t border-border/50 pt-1 flex justify-between gap-4">
                  <span className="font-semibold">Total</span>
                  <span className="font-semibold text-foreground">{kpis.total}</span>
                </div>
              </div>
            ),
            subtitle: (
              <div className="flex items-center gap-2">
                {kpis.pendentes > 0 && <span className="text-blue-400">{kpis.pendentes} Pend.</span>}
                <span className="inline-flex items-center gap-0.5 text-emerald-500 font-semibold">
                  <span className="inline-block w-1.5 h-1.5 rounded-full bg-emerald-500" />
                  {kpis.greens}
                </span>
                <span className="inline-flex items-center gap-0.5 text-red-500 font-semibold">
                  <span className="inline-block w-1.5 h-1.5 rounded-full bg-red-500" />
                  {kpis.reds}
                </span>
              </div>
            ),
          },
          {
            label: "Volume",
            value: formatCurrency(kpis.stakeTotal),
            tooltip: (
              <div className="space-y-1">
                <p className="font-semibold text-foreground">Volume Apostado</p>
                <p className="text-muted-foreground">Soma total das stakes apostadas em surebets no período selecionado.</p>
              </div>
            ),
            minWidth: "min-w-[80px]",
          },
          {
            label: kpis.lucroTotal >= 0 ? "Lucro" : "Prejuízo",
            value: formatCurrency(kpis.lucroTotal),
            valueClassName: kpis.lucroTotal >= 0 ? "text-emerald-500" : "text-red-500",
            minWidth: "min-w-[80px]",
            wrapper: (children) => (
              <LucroCurrencyTooltip
                lucroPorMoeda={kpis.lucroPorMoeda || []}
                totalConsolidado={kpis.lucroTotal}
                moedaConsolidacao={moedaConsolidacao || 'BRL'}
                formatValue={formatCurrency}
              >
                {children}
              </LucroCurrencyTooltip>
            ),
            cursorHelp: true,
          },
          {
            label: "ROI",
            value: formatPercent(kpis.roi),
            tooltip: (
              <div className="space-y-1">
                <p className="font-semibold text-foreground">Retorno sobre Investimento</p>
                <p className="text-muted-foreground">Lucro dividido pelo volume total apostado no período.</p>
              </div>
            ),
            valueClassName: kpis.roi >= 0 ? "text-emerald-500" : "text-red-500",
            minWidth: "min-w-[50px]",
          },
        ]}
      />

      {/* Filtro de período - abaixo dos KPIs */}
      {periodFilterComponent}

      {/* Gráficos - layout igual ao ValueBet */}
      {/* ISOLAMENTO: Visão Geral SEMPRE usa dados globais (surebets), sem filtros dimensionais */}
      {surebets.length > 0 ? (
        <div className="grid gap-4 lg:grid-cols-3">
          {/* Coluna esquerda: Gráfico + Estatísticas */}
          <div className="lg:col-span-2 space-y-4">
            <VisaoGeralCharts 
              apostas={surebets.map(s => {
                const isSimples = s.forma_registro === "SIMPLES" || !s.pernas?.length;
                return {
                  data_aposta: s.data_operacao,
                  lucro_prejuizo: s.lucro_real,
                  stake: isSimples ? (s.stake || s.stake_total) : s.stake_total,
                  bookmaker_nome: isSimples ? (s.bookmaker_nome || "—") : (s.pernas?.[0]?.bookmaker_nome || "—"),
                  parceiro_nome: isSimples ? s.parceiro_nome : undefined,
                  pernas: isSimples 
                    ? [{
                        bookmaker_nome: s.bookmaker_nome || "—",
                        parceiro_nome: s.parceiro_nome,
                        stake: s.stake || s.stake_total,
                        odd: s.odd,
                        resultado: s.resultado || undefined,
                        lucro_prejuizo: s.lucro_real || 0
                      }]
                    : s.pernas?.map(p => ({
                        bookmaker_nome: p.bookmaker_nome,
                        stake: p.stake,
                        odd: p.odd,
                        resultado: p.resultado || undefined,
                        lucro_prejuizo: getLucroPerna(p)
                      }))
                };
              })}
              apostasCalendario={transformCalendarApostasForCharts(calendarApostas)}
              accentColor="hsl(var(--primary))"
              logoMap={logoMap}
              showCasasCard={false}
              isSingleDayPeriod={tabFilters.period === "1dia"}
              periodStart={dateRange?.start}
              periodEnd={dateRange?.end}
              formatCurrency={formatCurrency}
              convertToConsolidation={convertFnOficial}
              moedaConsolidacao={moedaConsolidacao}
            />
            <SurebetStatisticsCard surebets={surebets} formatCurrency={formatCurrency} currencySymbol={currencySymbol} />
          </div>
          {/* Coluna direita: Casas Mais Utilizadas */}
          <div className="lg:col-span-1">
            <VisaoGeralCharts 
              apostas={surebets.map(s => {
                const isSimples = s.forma_registro === "SIMPLES" || !s.pernas?.length;
                return {
                  data_aposta: s.data_operacao,
                  lucro_prejuizo: s.lucro_real,
                  stake: isSimples ? (s.stake || s.stake_total) : s.stake_total,
                  bookmaker_nome: isSimples ? (s.bookmaker_nome || "—") : (s.pernas?.[0]?.bookmaker_nome || "—"),
                  parceiro_nome: isSimples ? s.parceiro_nome : undefined,
                  pernas: isSimples 
                    ? [{
                        bookmaker_nome: s.bookmaker_nome || "—",
                        parceiro_nome: s.parceiro_nome,
                        stake: s.stake || s.stake_total,
                        odd: s.odd,
                        resultado: s.resultado || undefined,
                        lucro_prejuizo: s.lucro_real || 0
                      }]
                    : s.pernas?.map(p => ({
                        bookmaker_nome: p.bookmaker_nome,
                        stake: p.stake,
                        odd: p.odd,
                        resultado: p.resultado || undefined,
                        lucro_prejuizo: getLucroPerna(p)
                      }))
                };
              })}
              accentColor="hsl(var(--primary))"
              logoMap={logoMap}
              showEvolucaoChart={false}
              isSingleDayPeriod={tabFilters.period === "1dia"}
              periodStart={dateRange?.start}
              periodEnd={dateRange?.end}
              formatCurrency={formatCurrency}
              convertToConsolidation={convertFnOficial}
              moedaConsolidacao={moedaConsolidacao}
            />
          </div>
        </div>
      ) : (
        <Card>
          <CardContent className="py-16">
            <ChartEmptyState 
              isSingleDayPeriod={tabFilters.period === "1dia"}
              genericMessage="Sem operações no período selecionado"
            />
          </CardContent>
        </Card>
      )}

      {/* Banner Info */}
      <Card className="border-blue-500/30 bg-blue-500/5">
        <CardContent className="py-3">
          <div className="flex items-start gap-2">
            <Info className="h-4 w-4 text-blue-400 mt-0.5 shrink-0" />
            <p className="text-xs text-muted-foreground">
              <span className="font-medium text-blue-400">Visão Especializada:</span> Esta aba exibe apenas operações de Surebet. 
              As apostas individuais de cada surebet também aparecem na aba "Todas Apostas".
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );

  // Render Operações
  const renderOperacoes = () => (
    <div className="space-y-4">
      {/* Card de Histórico com Filtros Internos */}
      <Card>
        <CardHeader className="pb-3">
          {/* Sub-abas Abertas / Histórico - usando componente padronizado */}
          <div className="mb-3">
            <OperationsSubTabHeader
              subTab={operacoesSubTab}
              onSubTabChange={setOperacoesSubTab}
              openCount={surebetsAbertas.length}
              totalOpenCount={totalSurebetsAbertas}
              historyCount={surebetsHistorico.length}
              totalHistoryCount={totalSurebetsHistorico}
              viewMode={viewMode}
              onViewModeChange={(mode) => setViewMode(mode)}
              showViewToggle={true}
              searchQuery={searchTerm}
              onSearchChange={setSearchTerm}
              extraActions={
                <ExportMenu
                  getData={() => surebetsListaAtual.map(s => 
                    s.forma_registro === "SIMPLES" 
                      ? transformApostaToExport({
                          id: s.id,
                          data_aposta: s.data_operacao,
                          evento: s.evento,
                          mercado: s.mercado,
                          selecao: s.selecao,
                          odd: s.odd,
                          stake: s.stake,
                          resultado: s.resultado,
                          status: s.status,
                          lucro_prejuizo: s.lucro_real,
                          observacoes: s.observacoes,
                          bookmaker_nome: s.bookmaker_nome,
                          estrategia: "SUREBET",
                        }, "Surebet")
                      : transformSurebetToExport(s, "SUREBET")
                  )}
                  abaOrigem="Surebet"
                  filename={`surebets-${projetoId}-${format(new Date(), 'yyyy-MM-dd')}`}
                  filtrosAplicados={{
                    periodo: tabFilters.period,
                    dataInicio: dateRange?.start.toISOString(),
                    dataFim: dateRange?.end.toISOString(),
                  }}
                />
              }
            />
          </div>
          <div className="flex items-center gap-4">
            <CardTitle className="text-base font-medium flex items-center gap-2">
              <Target className="h-4 w-4 text-primary" />
              {operacoesSubTab === "abertas" ? "Operações Abertas" : "Histórico de Operações"}
            </CardTitle>
          </div>
        </CardHeader>
        <CardContent className="pt-0 space-y-3">
          {/* Filtros Dimensionais da Aba Operações (Casa, Parceiro) */}
          {/* ISOLAMENTO: Período já é controlado pelo filtro de nível superior */}
          {/* Apenas filtros dimensionais são exibidos aqui para não afetar Visão Geral */}
          <TabFiltersBar
            projetoId={projetoId}
            filters={tabFilters}
            showEstrategiaFilter={false}
            showPeriodFilter={false}
            showResultadoFilter={true}
            className="pb-3 border-b border-border/50"
          />
        </CardContent>
      </Card>

      {surebetsListaAtual.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12 text-center">
            <Calculator className="h-12 w-12 text-muted-foreground mb-4" />
            <h3 className="text-lg font-semibold">
              {operacoesSubTab === "abertas" ? "Nenhuma operação aberta" : "Nenhuma operação no histórico"}
            </h3>
            <p className="text-sm text-muted-foreground mt-1">
              {operacoesSubTab === "abertas" 
                ? "Use o botão \"Nova Aposta\" para registrar uma operação."
                : "Operações finalizadas aparecerão aqui."}
            </p>
          </CardContent>
        </Card>
      ) : (
        <ScrollArea className="h-[calc(100vh-400px)]">
          <div className={viewMode === "cards" ? "grid gap-5 md:grid-cols-2 xl:grid-cols-3" : "space-y-2"}>
            {surebetsListaAtual.map((operacao) => {
              // Diferenciar: aposta com pernas usa SurebetCard, simples usa ApostaCard
              const hasPernas = operacao.pernas && operacao.pernas.length > 0;
              const isSimples = !hasPernas;
              
              if (isSimples) {
                // Converter para formato ApostaCardData
                const bookmakerBase = operacao.bookmaker_nome?.split(" - ")[0] || operacao.bookmaker_nome;
                const apostaData: ApostaCardData = {
                  id: operacao.id,
                  evento: operacao.evento,
                  esporte: operacao.esporte,
                  selecao: operacao.selecao,
                  odd: operacao.odd,
                  stake: operacao.stake || operacao.stake_total,
                  data_aposta: operacao.data_operacao,
                  resultado: operacao.resultado,
                  status: operacao.status,
                  lucro_prejuizo: operacao.lucro_real,
                  estrategia: "SUREBET",
                  bookmaker_nome: operacao.bookmaker_nome,
                  parceiro_nome: operacao.parceiro_nome,
                  logo_url: getLogoUrl(bookmakerBase || ""),
                };
                
                return (
                  <ApostaCard
                    key={operacao.id}
                    aposta={apostaData}
                    estrategia="SUREBET"
                    variant={viewMode === "cards" ? "card" : "list"}
                    onEdit={() => {
                      // Converter para formato esperado pelo ApostaDialog
                      const apostaParaDialog = {
                        ...operacao,
                        data_aposta: operacao.data_operacao,
                        lucro_prejuizo: operacao.lucro_real,
                        bookmaker_id: operacao.bookmaker_id,
                        // Garantir que os campos de registro estejam presentes
                        estrategia: operacao.estrategia || "SUREBET",
                        forma_registro: operacao.forma_registro || "SIMPLES",
                        contexto_operacional: operacao.contexto_operacional || "NORMAL",
                      };
                      setSelectedAposta(apostaParaDialog);
                      setApostaDialogOpen(true);
                    }}
                    onQuickResolve={handleQuickResolve}
                    formatCurrency={formatCurrency}
                  />
                );
              }
              
              // Surebet com múltiplas pernas
              return (
                <SurebetCard
                  key={operacao.id}
                  surebet={operacao}
                  onEdit={(sb) => {
                    const url = `/janela/surebet/${sb.id}?projetoId=${encodeURIComponent(projetoId)}&tab=surebet`;
                    window.open(url, '_blank', 'width=780,height=900,menubar=no,toolbar=no,location=no,status=no,resizable=yes,scrollbars=yes');
                  }}
                  onQuickResolve={handleSurebetQuickResolve}
                  onPernaResultChange={handleSurebetPernaResolve}
                  onDelete={handleSurebetDelete}
                  formatCurrency={formatCurrency}
                  convertToConsolidation={convertFnOficial}
                  bookmakerNomeMap={bookmakerNomeMap}
                />
              );
            })}
          </div>
        </ScrollArea>
      )}
    </div>
  );

  // Render Por Casa - Padrão unificado com Duplo Green
  const renderPorCasa = () => (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Building2 className="h-5 w-5 text-primary" />
          <h3 className="text-lg font-semibold">Análise por Casa</h3>
          <Badge variant="secondary">{casaDataSorted.length} casas</Badge>
        </div>
        
        {/* Filtros discretos */}
        <div className="flex items-center gap-1.5">
          <ArrowUpDown className="h-3.5 w-3.5 text-muted-foreground" />
          <Select value={porCasaSort} onValueChange={(v) => setPorCasaSort(v as SortField)}>
            <SelectTrigger className="h-7 w-[110px] text-xs border-muted/50">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="volume" className="text-xs">Volume</SelectItem>
              <SelectItem value="lucro" className="text-xs">Lucro</SelectItem>
              <SelectItem value="apostas" className="text-xs">Qtd Apostas</SelectItem>
              <SelectItem value="roi" className="text-xs">ROI</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>
      
      {casaDataSorted.length === 0 ? (
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
          {casaDataSorted.map((casa) => {
            const logoUrl = getLogoUrl(casa.casa);
            return (
            <Tooltip key={casa.casa}>
              <TooltipTrigger asChild>
                <Card className={`cursor-default transition-colors hover:border-primary/30 ${casa.lucro >= 0 ? "border-emerald-500/20" : "border-red-500/20"}`}>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-medium flex items-center gap-3">
                      <div className="w-8 h-8 rounded bg-muted/50 flex items-center justify-center overflow-hidden shrink-0">
                        {logoUrl ? (
                          <img src={logoUrl} alt={casa.casa} className="w-6 h-6 object-contain" />
                        ) : (
                          <Building2 className="w-4 h-4 text-muted-foreground" />
                        )}
                      </div>
                      <span className="truncate">{casa.casa}</span>
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Apostas</span>
                        <span className="font-medium tabular-nums">{casa.apostas}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Volume</span>
                        <span className="font-medium tabular-nums">{formatCurrency(casa.volume)}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Lucro</span>
                        <span className={`font-medium tabular-nums ${casa.lucro >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                          {casa.lucro >= 0 ? '+' : ''}{formatCurrency(casa.lucro)}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">ROI</span>
                        <span className={`font-semibold tabular-nums ${casa.roi >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                          {formatPercent(casa.roi)}
                        </span>
                      </div>
                    </div>
                    {casa.vinculos.length > 1 && (
                      <div className="mt-3 pt-2 border-t flex items-center gap-1 text-xs text-muted-foreground">
                        <Users className="h-3 w-3" />
                        <span>{casa.vinculos.length} vínculos</span>
                      </div>
                    )}
                  </CardContent>
                </Card>
              </TooltipTrigger>
              <TooltipContent side="right" className="text-xs max-w-[320px] space-y-2">
                <p className="font-semibold border-b pb-1">{casa.casa}</p>
                <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-muted-foreground">
                  <span>Total Apostas:</span>
                  <span className="text-right font-medium text-foreground">{casa.apostas}</span>
                  <span>Volume Total:</span>
                  <span className="text-right font-medium text-foreground">{formatCurrency(casa.volume)}</span>
                  <span>Lucro Total:</span>
                  <span className={`text-right font-medium ${casa.lucro >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                    {casa.lucro >= 0 ? '+' : ''}{formatCurrency(casa.lucro)}
                  </span>
                  <span>ROI:</span>
                  <span className={`text-right font-semibold ${casa.roi >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                    {formatPercent(casa.roi)}
                  </span>
                </div>
                {casa.vinculos.length > 0 && (
                  <div className="space-y-1.5 pt-2 border-t">
                    <div className="flex items-center gap-1 text-muted-foreground">
                      <Users className="h-3 w-3" />
                      <span className="font-medium">Detalhamento por vínculo:</span>
                    </div>
                    <div className="grid grid-cols-[1fr_50px_70px_55px] gap-x-2 text-[10px] text-muted-foreground border-b pb-1">
                      <span>Vínculo</span>
                      <span className="text-right">Qtd</span>
                      <span className="text-right">Volume</span>
                      <span className="text-right">ROI</span>
                    </div>
                    {casa.vinculos.slice(0, 5).map((v) => (
                      <div key={v.vinculo} className="grid grid-cols-[1fr_50px_70px_55px] gap-x-2 items-center">
                        <span className="truncate">{v.vinculo}</span>
                        <span className="text-right text-muted-foreground tabular-nums">{v.apostas}</span>
                        <span className="text-right text-muted-foreground tabular-nums">{formatCurrency(v.volume)}</span>
                        <span className={`text-right font-medium tabular-nums ${v.roi >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                          {v.roi >= 0 ? '+' : ''}{v.roi.toFixed(1)}%
                        </span>
                      </div>
                    ))}
                    {casa.vinculos.length > 5 && (
                      <div className="text-muted-foreground">+{casa.vinculos.length - 5} vínculos...</div>
                    )}
                  </div>
                )}
              </TooltipContent>
            </Tooltip>
            );
          })}
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
        {activeNavTab !== "visao-geral" && <div className="mb-4">{periodFilterComponent}</div>}
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
          <div className="relative flex items-center justify-center border-b border-border/50">
            <TabsList className="bg-transparent border-0 rounded-none p-0 h-auto gap-6">
              {NAV_ITEMS.map((item) => (
                <TabsTrigger
                  key={item.value}
                  value={item.value}
                  className="bg-transparent border-0 rounded-none px-1 pb-3 pt-1 h-auto shadow-none data-[state=active]:bg-transparent data-[state=active]:shadow-none text-muted-foreground/70 data-[state=active]:text-foreground transition-colors relative"
                >
                  <item.icon className="h-4 w-4 mr-2 opacity-60" />
                  {item.label}
                  {item.showBadge && item.count > 0 && (
                    <Badge 
                      variant="destructive" 
                      className="ml-1.5 h-5 min-w-5 px-1.5 text-[10px] font-bold"
                    >
                      {item.count > 99 ? "99+" : item.count}
                    </Badge>
                  )}
                </TabsTrigger>
              ))}
            </TabsList>
            <div className="absolute right-0 flex items-center gap-4">
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
          surebet={selectedSurebet}
          onSuccess={handleDataChange}
        />
        
        <ApostaDialog
          open={apostaDialogOpen}
          onOpenChange={(open) => {
            setApostaDialogOpen(open);
            if (!open) setSelectedAposta(null);
          }}
          projetoId={projetoId}
          aposta={selectedAposta}
          onSuccess={handleDataChange}
          activeTab="surebet"
        />
      </div>
    );
  }

  // Mode: Sidebar
  return (
    <div className="space-y-4">
      
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
                    {item.showBadge && item.count > 0 && (
                      <Badge 
                        variant="destructive" 
                        className="h-5 min-w-5 px-1.5 text-[10px] font-bold"
                      >
                        {item.count > 99 ? "99+" : item.count}
                      </Badge>
                    )}
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
        surebet={selectedSurebet}
        onSuccess={handleDataChange}
      />
      
      <ApostaDialog
        open={apostaDialogOpen}
        onOpenChange={(open) => {
          setApostaDialogOpen(open);
          if (!open) setSelectedAposta(null);
        }}
        projetoId={projetoId}
        aposta={selectedAposta}
        onSuccess={handleDataChange}
        activeTab="surebet"
      />
    </div>
  );
}
