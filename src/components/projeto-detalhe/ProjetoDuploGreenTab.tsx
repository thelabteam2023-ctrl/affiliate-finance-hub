import { useState, useEffect, useMemo, useCallback } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { invalidateCanonicalCaches } from "@/lib/invalidateCanonicalCaches";
import { calcSurebetWindowHeight } from "@/lib/windowHelper";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { fetchAllPaginated } from "@/lib/fetchAllPaginated";
import { fetchChunkedIn } from "@/lib/fetchChunkedIn";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { KpiSummaryBar } from "@/components/ui/kpi-summary-bar";
import { LucroCurrencyTooltip } from "@/components/ui/lucro-currency-tooltip";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { FinancialMetricsPopover } from "./FinancialMetricsPopover";
import { calcularImpactoResultado } from "@/lib/bookmakerBalanceHelper";
import { getConsolidatedStake, getConsolidatedLucro } from "@/utils/consolidatedValues";
import { groupPernasBySelecao } from "@/utils/groupPernasBySelecao";
import { reliquidarAposta, liquidarPernaSurebet } from "@/services/aposta/ApostaService";
import { useInvalidateBookmakerSaldos } from "@/hooks/useBookmakerSaldosQuery";
import { useBonusBalanceManager } from "@/hooks/useBonusBalanceManager";
import { useCrossWindowSync } from "@/hooks/useCrossWindowSync";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { CasaDetailModal } from "./CasaDetailModal";
import { CasaAnalyticsCard } from "./CasaAnalyticsCard";
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
  Info,
  LayoutGrid,
  List,
  Zap,
  LayoutDashboard,
  PanelLeft,
  LayoutList,
  Users,
  Clock,
  History,
  ArrowUpDown,
  Sparkles
} from "lucide-react";
import { format, startOfDay, endOfDay, subDays, startOfMonth, startOfYear } from "date-fns";
import { ptBR } from "date-fns/locale";
import { getOperationalDateRangeForQuery } from "@/utils/dateUtils";
import { filterForKpis } from "@/utils/filterPendingByPeriod";
// Removido: Dialogs agora abrem em janelas externas
// import { ApostaDialog } from "./ApostaDialog";
// import { SurebetDialog } from "./SurebetDialog";
import { ApostaPernasResumo, ApostaPernasInline, getModeloOperacao, Perna } from "./ApostaPernasResumo";
import { ApostaCard } from "./ApostaCard";
import { SurebetCard, SurebetData } from "./SurebetCard";
import type { SurebetQuickResult } from "@/components/apostas/SurebetRowActionsMenu";
import { APOSTA_ESTRATEGIA } from "@/lib/apostaConstants";
import { StandardTimeFilter, StandardPeriodFilter, getDateRangeFromPeriod, DateRange as FilterDateRange } from "./StandardTimeFilter";
import { VisaoGeralCharts } from "./VisaoGeralCharts";
import { DuploGreenStatisticsCard } from "./DuploGreenStatisticsCard";

import { cn } from "@/lib/utils";
import { buildBookmakerNomeMap, collectMissingBookmakerIds, mergeBookmakerNomeMaps } from "@/lib/bookmaker-display";
import { useUnlinkedBookmakerNames } from "@/hooks/useUnlinkedBookmakerNames";
import { useOpenOperationsCount } from "@/hooks/useOpenOperationsCount";
import { useProjetoCurrency } from "@/hooks/useProjetoCurrency";
import { useCotacoes } from "@/hooks/useCotacoes";
import { VolumeKPI } from "@/components/kpis/VolumeKPI";
import { useBookmakerLogoMap } from "@/hooks/useBookmakerLogoMap";
import { TabFiltersBar } from "./TabFiltersBar";
import { useTabFilters } from "@/hooks/useTabFilters";
import { OperationsSubTabHeader, type HistorySubTab, SuspiciousDateFilterButton, useSuspiciousDateFilter } from "./operations";
import { ExportMenu, transformApostaToExport, transformSurebetToExport } from "./ExportMenu";
import { SaldoOperavelCard } from "./SaldoOperavelCard";
// FinancialSummaryCompact removed — now integrated into Lucro KPI popover
import { useCalendarApostasRpc, transformRpcDailyForCharts } from "@/hooks/useCalendarApostasRpc";
import { aggregateBookmakerUsage } from "@/utils/bookmakerUsageAnalytics";

interface ProjetoDuploGreenTabProps {
  projetoId: string;
  onDataChange?: () => void;
  refreshTrigger?: number;
  actionsSlot?: React.ReactNode;
}

interface Aposta {
  id: string;
  workspace_id?: string;
  created_at?: string;
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
  parceiro_nome?: string;
  logo_url?: string | null;
  operador_nome?: string;
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
  // Campos para bônus
  stake_bonus?: number | null;
  bonus_id?: string | null;
  // Campos de consolidação multi-moeda
  moeda_operacao?: string | null;
  stake_consolidado?: number | null;
  pl_consolidado?: number | null;
  valor_brl_referencia?: number | null;
  lucro_prejuizo_brl_referencia?: number | null;
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

// Ordenação para Por Casa
type SortField = "volume" | "lucro" | "apostas" | "roi";

export function ProjetoDuploGreenTab({ projetoId, onDataChange, refreshTrigger, actionsSlot }: ProjetoDuploGreenTabProps) {
  const [apostas, setApostas] = useState<Aposta[]>([]);
  const [bookmakers, setBookmakers] = useState<Bookmaker[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [resultadoFilter, setResultadoFilter] = useState<string>("all");
  const [viewMode, setViewMode] = useState<"cards" | "list">("list");
  
  // Hook de formatação de moeda do projeto
  const { formatCurrency, convertToConsolidation: convertFn, convertToConsolidationOficial: convertFnOficial, moedaConsolidacao: moedaConsol } = useProjetoCurrency(projetoId);
  const { getRate, lastUpdate: rateLastUpdate } = useCotacoes();
  
  // Hook global de logos de bookmakers (busca do catálogo)
  const { logoMap: catalogLogoMap } = useBookmakerLogoMap();
  
  // DESACOPLAMENTO CALENDÁRIO: Dados via RPC (sem truncamento, timezone correto)
  const { daily: calendarDaily, refetch: refetchCalendar } = useCalendarApostasRpc({
    projetoId,
    estrategia: "DUPLO_GREEN",
    cotacaoUSD: convertFnOficial(1, "USD"),
    cotacoes: {
      EUR: getRate("EUR"),
      GBP: getRate("GBP"),
      MYR: getRate("MYR"),
      MXN: getRate("MXN"),
      ARS: getRate("ARS"),
      COP: getRate("COP"),
    },
  });
  // Estados removidos - dialogs agora abrem em janelas externas
  // const [dialogOpen, setDialogOpen] = useState(false);
  // const [surebetDialogOpen, setSurebetDialogOpen] = useState(false);
  // const [selectedAposta, setSelectedAposta] = useState<Aposta | null>(null);
  // const [selectedSurebet, setSelectedSurebet] = useState<any>(null);

  // Hook para invalidar cache de saldos
  const invalidateSaldos = useInvalidateBookmakerSaldos();
  const queryClient = useQueryClient();
  
  // Hook para gerenciamento de rollover (bônus)
  // NOTA: processarLiquidacaoBonus e reverterLiquidacaoBonus removidos - modelo unificado
  const { 
    hasActiveRolloverBonus, 
    atualizarProgressoRollover
  } = useBonusBalanceManager();
  
  // Sub-abas Abertas/Histórico - usa tipo padronizado
  const [apostasSubTab, setApostasSubTab] = useState<HistorySubTab>("abertas");
  
  // Ordenação Por Casa
  const [porCasaSort, setPorCasaSort] = useState<SortField>("volume");
  const [selectedPorCasa, setSelectedPorCasa] = useState<CasaAgregada | null>(null);

  const [navMode, setNavMode] = useState<NavigationMode>(() => {
    const saved = localStorage.getItem(NAV_STORAGE_KEY);
    return (saved === "tabs" ? "tabs" : "sidebar") as NavigationMode;
  });
  const [activeNavTab, setActiveNavTab] = useState<NavTabValue>("visao-geral");
  const [isTransitioning, setIsTransitioning] = useState(false);

  // Filtros LOCAIS da aba Duplo Green (isolados de outras abas)
  const tabFilters = useTabFilters({
    tabId: "duplogreen",
    projetoId,
    defaultPeriod: "mes_atual",
    persist: true,
  });
  
  // dateRange derivado dos filtros locais
  const dateRange = tabFilters.dateRange;

  // Count of open operations for badge - uses the canonical hook
  const { count: openOperationsCount } = useOpenOperationsCount({
    projetoId,
    estrategia: APOSTA_ESTRATEGIA.DUPLO_GREEN,
    refreshTrigger,
  });

  // NAV_ITEMS with dynamic count for badge
  const NAV_ITEMS = useMemo(() => [
    { value: "visao-geral" as NavTabValue, label: "Visão Geral", icon: LayoutDashboard },
    { value: "apostas" as NavTabValue, label: "Apostas", icon: Target, showBadge: true, count: openOperationsCount },
    { value: "por-casa" as NavTabValue, label: "Por Casa", icon: Building2 },
  ], [openOperationsCount]);

  useEffect(() => { localStorage.setItem(NAV_STORAGE_KEY, navMode); }, [navMode]);

  useEffect(() => { fetchData(); }, [projetoId, tabFilters.period, tabFilters.customDateRange, refreshTrigger]);

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
      const selectFields = `id, workspace_id, created_at, data_aposta, esporte, evento, mercado, selecao, odd, stake, estrategia, status, resultado, lucro_prejuizo, valor_retorno, observacoes, bookmaker_id, modo_entrada, gerou_freebet, valor_freebet_gerada, tipo_freebet, forma_registro, contexto_operacional, lay_exchange, lay_odd, lay_stake, lay_liability, lay_comissao, back_em_exchange, back_comissao, pernas, stake_total, spread_calculado, roi_esperado, roi_real, lucro_esperado, modelo, moeda_operacao, stake_consolidado, pl_consolidado, valor_brl_referencia, lucro_prejuizo_brl_referencia`;

      let dateFilters: { startUTC?: string; endUTC?: string } = {};
      if (dateRange) {
        dateFilters = getOperationalDateRangeForQuery(dateRange.start, dateRange.end);
      }

      const data = await fetchAllPaginated(() => {
        let q = supabase
          .from("apostas_unificada")
          .select(selectFields)
          .eq("projeto_id", projetoId)
          .eq("estrategia", APOSTA_ESTRATEGIA.DUPLO_GREEN)
          .is("cancelled_at", null)
          .order("data_aposta", { ascending: false });
        if (dateFilters.startUTC) q = q.gte("data_aposta", dateFilters.startUTC);
        if (dateFilters.endUTC) q = q.lte("data_aposta", dateFilters.endUTC);
        return q;
      });

      // Query separada para PENDENTES sem filtro de data (garantir que abertas sempre apareçam)
      let allData = data || [];
      if (dateRange) {
        const pendentesData = await fetchAllPaginated(() =>
          supabase
            .from("apostas_unificada")
            .select(selectFields)
            .eq("projeto_id", projetoId)
            .eq("estrategia", APOSTA_ESTRATEGIA.DUPLO_GREEN)
            .eq("status", "PENDENTE")
            .is("cancelled_at", null)
            .order("data_aposta", { ascending: false })
        );

        if (pendentesData && pendentesData.length > 0) {
          const existingIds = new Set(allData.map((a: any) => a.id));
          const newPendentes = pendentesData.filter((p: any) => !existingIds.has(p.id));
          allData = [...allData, ...newPendentes];
        }
      }
      
      const bookmakerIds = [...new Set(allData.map((a: any) => a.bookmaker_id).filter(Boolean))];
      let bookmakerMap = new Map<string, { nome: string; parceiroNome: string | null; logoUrl: string | null; instanceIdentifier: string | null }>();
      if (bookmakerIds.length > 0) {
        const { data: bks } = await supabase
          .from("bookmakers")
          .select("id, nome, instance_identifier, parceiro:parceiros(nome), bookmakers_catalogo(logo_url)")
          .in("id", bookmakerIds);

        bookmakerMap = new Map(
          (bks || []).map((b: any) => [
            b.id,
            { 
              nome: b.nome, 
              parceiroNome: b.parceiro?.nome ?? null,
              logoUrl: b.bookmakers_catalogo?.logo_url ?? null,
              instanceIdentifier: b.instance_identifier ?? null,
            },
          ])
        );
      }

      const mapped = allData.map((a: any) => {
          const bkInfo = a.bookmaker_id ? bookmakerMap.get(a.bookmaker_id) : null;
          return {
            ...a,
            bookmaker_nome: bkInfo?.nome ?? "Desconhecida",
            parceiro_nome: bkInfo?.parceiroNome ?? undefined,
            instance_identifier: bkInfo?.instanceIdentifier ?? null,
            logo_url: bkInfo?.logoUrl ?? null,
            operador_nome: bkInfo?.parceiroNome ?? undefined,
          };
        });

      // Enriquecer com pernas de apostas_pernas (para ARBITRAGEM e sub_entries de SIMPLES)
      const apostaIds = mapped.map((a: any) => a.id);
      if (apostaIds.length > 0) {
        const pernasData = await fetchChunkedIn(
          (idsChunk) =>
            supabase
              .from("apostas_pernas")
              .select(`
                id, aposta_id, bookmaker_id, odd, stake, stake_real, stake_freebet, moeda, selecao, selecao_livre, ordem,
                resultado, lucro_prejuizo, gerou_freebet, valor_freebet_gerada,
                stake_brl_referencia, lucro_prejuizo_brl_referencia, cotacao_snapshot, fonte_saldo,
                bookmaker:bookmakers (
                  nome, parceiro_id, instance_identifier,
                  parceiro:parceiros (nome),
                  bookmakers_catalogo (logo_url)
                )
              `)
              .in("aposta_id", idsChunk)
              .order("ordem", { ascending: true }),
          apostaIds
        );

        if (pernasData) {
          const pernasMap = new Map<string, any[]>();
          for (const p of pernasData) {
            const arr = pernasMap.get(p.aposta_id) || [];
            arr.push(p);
            pernasMap.set(p.aposta_id, arr);
          }
          for (const a of mapped) {
            const pernas = pernasMap.get(a.id);
            if (!pernas || pernas.length === 0) continue;

            if (a.forma_registro === "ARBITRAGEM") {
              // ARBITRAGEM/Surebet: populate pernas with full data for SurebetCard
              const parceiroNome = (p: any) => p.bookmaker?.parceiro?.nome;
              a.pernas = pernas.map((p: any) => ({
                id: p.id,
                bookmaker_id: p.bookmaker_id,
                bookmaker_nome: parceiroNome(p) 
                  ? `${p.bookmaker?.nome || "—"} - ${parceiroNome(p)}` 
                  : (p.bookmaker?.nome || "—"),
                parceiro_nome: parceiroNome(p) || null,
                moeda: p.moeda || 'BRL',
                selecao: p.selecao,
                selecao_livre: p.selecao_livre,
                odd: p.odd,
                stake: p.stake,
                resultado: p.resultado,
                lucro_prejuizo: p.lucro_prejuizo,
                gerou_freebet: p.gerou_freebet,
                valor_freebet_gerada: p.valor_freebet_gerada,
                stake_brl_referencia: p.stake_brl_referencia,
                lucro_prejuizo_brl_referencia: p.lucro_prejuizo_brl_referencia,
                cotacao_snapshot: p.cotacao_snapshot,
                fonte_saldo: p.fonte_saldo || null,
              }));
            } else if (pernas.length > 1) {
              // SIMPLES multi-entry: store as sub_entries
              (a as any)._sub_entries = pernas;
            }
          }
        }
      }

      setApostas(mapped);
    } catch (error) {
      console.error("Erro ao carregar apostas Duplo Green:", error);
    }
  };

  // Resolução rápida de apostas simples / multi-entry simples
  // CRÍTICO: multi-entry simples DEVE usar a mesma metodologia global das outras abas
  // (reliquidarAposta no pai), nunca liquidação per-perna, para evitar inflação de saldo.
  const handleQuickResolve = useCallback(async (apostaId: string, resultado: string) => {
    try {
      const aposta = apostas.find(a => a.id === apostaId);
      if (!aposta) return;

      const subEntries = (aposta as any)._sub_entries;
      const isMultiEntrySimples = Array.isArray(subEntries) && subEntries.length > 1;
      const stake = typeof aposta.stake_total === "number" ? aposta.stake_total : aposta.stake;
      const odd = aposta.odd || 1;
      const bookmakerId = aposta.bookmaker_id;

      console.log("[ProjetoDuploGreenTab] handleQuickResolve iniciado", {
        apostaId,
        resultado,
        forma_registro: aposta.forma_registro,
        status_atual: aposta.status,
        resultado_atual: aposta.resultado,
        isMultiEntrySimples,
        subEntriesCount: Array.isArray(subEntries) ? subEntries.length : 0,
        stake,
        odd,
      });
      
      // Calcular lucro usando função canônica
      const lucro = calcularImpactoResultado(stake, odd, resultado);

      console.log("[ProjetoDuploGreenTab] Chamando reliquidarAposta (fluxo global)", {
        apostaId,
        resultado,
        lucro,
        metodologia: isMultiEntrySimples ? "parent-rpc-multi-entry" : "parent-rpc-default",
      });

      // 1. Liquidar via RPC atômica (atualiza aposta + registra no ledger + trigger atualiza saldo)
      const rpcResult = await reliquidarAposta(apostaId, resultado, lucro);
      
      if (!rpcResult.success) {
        console.error("[ProjetoDuploGreenTab] reliquidarAposta falhou", {
          apostaId,
          resultado,
          error: rpcResult.error,
          isMultiEntrySimples,
        });
        toast.error(rpcResult.error?.message || "Erro ao liquidar aposta");
        return;
      }

      console.log("[ProjetoDuploGreenTab] reliquidarAposta sucesso", {
        apostaId,
        resultado,
        isMultiEntrySimples,
        rpcData: rpcResult.data,
      });

      // 2. Atualizar rollover se houver bônus ativo para a casa
      if (bookmakerId && resultado !== "VOID") {
        const temBonusAtivo = await hasActiveRolloverBonus(projetoId, bookmakerId);
        if (temBonusAtivo) {
          await atualizarProgressoRollover(projetoId, bookmakerId, stake, odd);
        }
      }

      // 3. Recarregar do banco: retorno/lucro canônicos são calculados no motor financeiro.
      invalidateSaldos(projetoId);
      await fetchApostas();

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
  }, [apostas, onDataChange, projetoId, invalidateSaldos, hasActiveRolloverBonus, atualizarProgressoRollover]);

  // Handler para liquidação granular por perna (inline pill) - Motor Financeiro Unificado
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

      invalidateSaldos(projetoId);
      fetchData();
      onDataChange?.();

      const resultLabel = {
        GREEN: "Green", RED: "Red", MEIO_GREEN: "½ Green",
        MEIO_RED: "½ Red", VOID: "Void",
      }[input.resultado] || input.resultado;

      if (!input.silent) {
        const nome = input.bookmakerNome || '';
        toast.success(nome ? `${resultLabel} na ${nome}` : `Resultado alterado com sucesso`);
      }
    } catch (error: any) {
      console.error("Erro ao liquidar perna:", error);
      toast.error("Erro ao atualizar resultado da perna");
    }
  }, [projetoId, invalidateSaldos, onDataChange]);

  // Handler para quick resolve de surebet - usa liquidação por perna (Motor Financeiro Unificado)
  // CRÍTICO: Usa groupPernasBySelecao para alinhar índices com o menu (que usa pernas agrupadas por seleção)
  const handleQuickResolveSurebet = useCallback(async (surebetId: string, quickResult: SurebetQuickResult) => {
    try {
      const aposta = apostas.find(a => a.id === surebetId);
      if (!aposta?.pernas || aposta.pernas.length === 0) return;

      const workspaceId = (aposta as any).workspace_id || aposta.pernas[0]?.workspace_id || '';

      // Agrupar pernas por seleção para alinhar com os índices do menu (que usa pernas agrupadas)
      const pernasAgrupadas = groupPernasBySelecao(
        (aposta.pernas || []).map((p: any) => ({
          id: p.id,
          selecao: p.selecao,
          selecao_livre: p.selecao_livre,
          odd: p.odd,
          stake: p.stake,
          resultado: p.resultado,
          bookmaker_nome: p.bookmaker?.nome || p.bookmaker_nome || "—",
          bookmaker_id: p.bookmaker_id,
          moeda: p.moeda || 'BRL',
          fonte_saldo: p.fonte_saldo || null,
        }))
      ).filter(p => p.bookmaker_id && p.odd && p.odd > 0);

      for (let i = 0; i < pernasAgrupadas.length; i++) {
        const perna = pernasAgrupadas[i];
        const isWinner = quickResult.winners.includes(i);
        const resultado = quickResult.type === "all_void" ? "VOID" : (isWinner ? "GREEN" : "RED");

        // Se a perna tem sub-entries (múltiplas casas na mesma seleção),
        // liquidar CADA sub-entry individualmente com o mesmo resultado
        const hasEntries = perna.entries && perna.entries.length > 1;

        if (hasEntries) {
          for (const entry of perna.entries!) {
            const entryPernaId = entry.id;
            if (!entryPernaId || !entry.bookmaker_id) continue;

            await handleSurebetPernaResolve({
              pernaId: entryPernaId,
              surebetId,
              bookmarkerId: entry.bookmaker_id,
              resultado,
              stake: entry.stake,
              odd: entry.odd,
              moeda: entry.moeda || 'BRL',
              resultadoAnterior: perna.resultado,
              workspaceId,
              silent: true,
            });
          }
        } else {
          await handleSurebetPernaResolve({
            pernaId: perna.id,
            surebetId,
            bookmarkerId: perna.bookmaker_id!,
            resultado,
            stake: perna.stake,
            odd: perna.odd,
            moeda: perna.moeda || 'BRL',
            resultadoAnterior: perna.resultado,
            workspaceId,
            silent: true,
          });
        }
      }

      toast.success("Resultado da surebet alterado com sucesso");
    } catch (error: any) {
      console.error("Erro ao liquidar surebet:", error);
      toast.error("Erro ao liquidar surebet");
    }
  }, [apostas, handleSurebetPernaResolve]);

  // Deletar surebet
  const handleDeleteSurebet = useCallback(async (surebetId: string) => {
    try {
      const { deletarAposta } = await import("@/services/aposta/ApostaService");
      const result = await deletarAposta(surebetId);
      if (!result.success) {
        toast.error(result.error?.message || "Erro ao excluir surebet");
        return;
      }
      invalidateSaldos(projetoId);
      fetchData();
      onDataChange?.();
      toast.success("Surebet excluída");
    } catch (error: any) {
      console.error("Erro ao excluir surebet:", error);
      toast.error("Erro ao excluir surebet");
    }
  }, [projetoId, invalidateSaldos, onDataChange]);

  // Deletar aposta simples
  const handleDeleteAposta = useCallback(async (apostaId: string) => {
    try {
      const { deletarAposta } = await import("@/services/aposta/ApostaService");
      const result = await deletarAposta(apostaId);
      if (!result.success) {
        toast.error(result.error?.message || "Erro ao excluir aposta");
        return;
      }
      invalidateSaldos(projetoId);
      invalidateCanonicalCaches(queryClient, projetoId);
      fetchData();
      onDataChange?.();
      toast.success("Aposta excluída");
    } catch (error: any) {
      console.error("Erro ao excluir aposta:", error);
      toast.error("Erro ao excluir aposta");
    }
  }, [projetoId, invalidateSaldos, onDataChange, queryClient]);

  // === DUPLICAR ===
  const handleDuplicateAposta = useCallback((apostaId: string) => {
    const url = `/janela/aposta/novo?projetoId=${encodeURIComponent(projetoId)}&tab=duplogreen&estrategia=DUPLO_GREEN&duplicateFrom=${apostaId}`;
    window.open(url, '_blank', 'width=780,height=900,menubar=no,toolbar=no,location=no,status=no,resizable=yes,scrollbars=yes');
  }, [projetoId]);

  const handleDuplicateSurebet = useCallback((surebetId: string) => {
    const url = `/janela/surebet/novo?projetoId=${encodeURIComponent(projetoId)}&tab=duplogreen&duplicateFrom=${surebetId}`;
    window.open(url, '_blank', 'width=780,height=900,menubar=no,toolbar=no,location=no,status=no,resizable=yes,scrollbars=yes');
  }, [projetoId]);

  // Filtrar pendentes fora do período para KPIs
  const apostasParaKpi = useMemo(() => 
    filterForKpis(apostas, dateRange?.start, dateRange?.end),
    [apostas, dateRange]
  );

  const metricas = useMemo(() => {
    const total = apostasParaKpi.length;

    // CORREÇÃO: para apostas multi-pernas (ARBITRAGEM), o volume fica em stake_total.
    // A estratégia define a contabilização; a forma_registro define apenas a estrutura.
    const getStakeVolume = (a: Aposta) => {
      const value =
        typeof a.stake_total === "number" ? a.stake_total : typeof a.stake === "number" ? a.stake : 0;
      return Number.isFinite(value) ? value : 0;
    };

    const apostasLiquidadas = apostasParaKpi.filter((a) => a.resultado && a.resultado !== "PENDENTE");
    // SNAPSHOT: Usa Cotação de Trabalho (congelada no registro) para eliminar variação cambial
    const totalStake = apostasParaKpi.reduce((acc, a) => acc + getConsolidatedStake(a, convertFn, moedaConsol), 0);
    const volumeLiquidado = apostasLiquidadas.reduce((acc, a) => acc + getConsolidatedStake(a, convertFn, moedaConsol), 0);
    const lucroTotal = apostasLiquidadas.reduce((acc, a) => acc + getConsolidatedLucro(a, convertFn, moedaConsol), 0);
    const pendentes = apostasParaKpi.filter((a) => !a.resultado || a.resultado === "PENDENTE").length;
    const greens = apostasParaKpi.filter((a) => a.resultado === "GREEN" || a.resultado === "MEIO_GREEN").length;
    const reds = apostasParaKpi.filter((a) => a.resultado === "RED" || a.resultado === "MEIO_RED").length;
    const liquidadas = apostasLiquidadas.length;
    const taxaAcerto = liquidadas > 0 ? (greens / liquidadas) * 100 : 0;
    // ROI usa volume LIQUIDADO — apostas pendentes não têm resultado
    const roi = volumeLiquidado > 0 ? (lucroTotal / volumeLiquidado) * 100 : 0;

    // Breakdown de volume por moeda original
    const volumePorMoeda = new Map<string, number>();
    apostasParaKpi.forEach(a => {
      const moeda = a.moeda_operacao || "BRL";
      const rawStake = a.forma_registro === "ARBITRAGEM" ? (a.stake_total || 0) : (a.stake || 0);
      volumePorMoeda.set(moeda, (volumePorMoeda.get(moeda) || 0) + rawStake);
    });
    const currencyBreakdown = Array.from(volumePorMoeda.entries())
      .map(([moeda, valor]) => ({ moeda, valor }))
      .filter(item => Math.abs(item.valor) > 0.01);

    // Breakdown de LUCRO por moeda original
    const lucroPorMoedaMap = new Map<string, number>();
    apostasParaKpi.forEach(a => {
      const moeda = a.moeda_operacao || "BRL";
      const rawLucro = a.lucro_prejuizo ?? 0;
      lucroPorMoedaMap.set(moeda, (lucroPorMoedaMap.get(moeda) || 0) + rawLucro);
    });
    const lucroPorMoeda = Array.from(lucroPorMoedaMap.entries())
      .map(([moeda, valor]) => ({ moeda, valor }))
      .filter(item => Math.abs(item.valor) > 0.01);

    const porCasa: Record<string, { stake: number; lucro: number; count: number }> = {};
    apostasParaKpi.forEach((a) => {
      const pernas = Array.isArray(a.pernas) ? a.pernas : [];

      // Multi-pernas: cada perna conta separadamente para a casa correspondente
      if (pernas.length > 0) {
        const lucroPorPernaFallback =
          a.status === "LIQUIDADA" ? Number(a.lucro_prejuizo || 0) / Math.max(pernas.length, 1) : 0;

        pernas.forEach((p: any) => {
          const casa = p?.bookmaker_nome || "Desconhecida";
          if (!porCasa[casa]) porCasa[casa] = { stake: 0, lucro: 0, count: 0 };

          porCasa[casa].stake += Number(p?.stake || 0);
          porCasa[casa].lucro +=
            typeof p?.lucro_prejuizo === "number" ? p.lucro_prejuizo : lucroPorPernaFallback;
          porCasa[casa].count += 1;
        });

        return;
      }

      // Aposta simples
      const casa = a.bookmaker_nome || "Desconhecida";
      if (!porCasa[casa]) porCasa[casa] = { stake: 0, lucro: 0, count: 0 };
      porCasa[casa].stake += getConsolidatedStake(a, convertFn, moedaConsol);
      porCasa[casa].lucro += getConsolidatedLucro(a, convertFn, moedaConsol);
      porCasa[casa].count++;
    });

    return { total, totalStake, lucroTotal, pendentes, greens, reds, taxaAcerto, roi, porCasa, currencyBreakdown, lucroPorMoeda };
  }, [apostasParaKpi, convertFn, moedaConsol]);

  // Interface para vínculos dentro de cada casa
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

  // casaData agregado por CASA (não por vínculo)
  const casaData = useMemo((): CasaAgregada[] => {
    return aggregateBookmakerUsage(apostasParaKpi, {
      moedaConsolidacao: moedaConsol,
      convertToConsolidation: convertFn,
    })
      .map(({ casa, apostas, volume, lucro, roi, vinculos }) => ({ casa, apostas, volume, lucro, roi, vinculos }))
      .sort((a, b) => b.volume - a.volume)
      .slice(0, 8);
  }, [apostasParaKpi, moedaConsol, convertFn]);

  // Mapa base do projeto (bookmakers vinculadas)
  const projectNomeMap = useMemo(() => buildBookmakerNomeMap(bookmakers), [bookmakers]);
  const missingBookmakerIds = useMemo(
    () => collectMissingBookmakerIds(projectNomeMap, apostas.map(a => ({ bookmaker_id: (a as any).bookmaker_id, pernas: (a as any).pernas }))),
    [projectNomeMap, apostas]
  );
  const unlinkedNomeMap = useUnlinkedBookmakerNames(missingBookmakerIds);
  const bookmakerNomeMap = useMemo(
    () => mergeBookmakerNomeMaps(projectNomeMap, unlinkedNomeMap),
    [projectNomeMap, unlinkedNomeMap]
  );

  // Mapa de logos combinando catálogo global + bookmakers do projeto
  const logoMap = useMemo(() => {
    const map = new Map<string, string | null>();
    
    if (catalogLogoMap) {
      for (const [key, value] of catalogLogoMap.entries()) {
        map.set(key, value);
      }
    }
    
    bookmakers.forEach(bk => {
      const nomeParts = bk.nome.split(" - ");
      const baseName = nomeParts[0].trim().toUpperCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "");
      const logoUrl = bk.bookmakers_catalogo?.logo_url || null;
      if (logoUrl && !map.has(baseName)) {
        map.set(baseName, logoUrl);
      }
    });
    
    return map;
  }, [bookmakers, catalogLogoMap]);

  const getLogoUrl = useCallback((casaName: string): string | null => {
    if (!casaName || logoMap.size === 0) return null;
    
    const normalizedInput = casaName
      .toUpperCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .trim();
    
    if (logoMap.has(normalizedInput)) {
      return logoMap.get(normalizedInput) ?? null;
    }
    
    for (const [key, value] of logoMap.entries()) {
      if (normalizedInput.includes(key) || key.includes(normalizedInput)) {
        return value ?? null;
      }
    }
    
    return null;
  }, [logoMap]);

  // Separar apostas em abertas e histórico
  // Abertas: ordenadas por data_aposta crescente (jogo mais próximo primeiro)
  // FONTE DA VERDADE: usamos `status` (servidor) — não `resultado` — para evitar
  // dessincronização entre badges (que usam status) e a lista (ver incidente
  // de inconsistência status/resultado corrigido pela RPC reverter_liquidacao_v4 idempotente).
  const apostasAbertas = useMemo(() =>
    apostas
      .filter(a => a.status === "PENDENTE")
      .sort((a, b) => new Date(a.data_aposta).getTime() - new Date(b.data_aposta).getTime()),
    [apostas]
  );
  const apostasHistorico = useMemo(() => {
    const hist = apostas.filter(a => a.status === "LIQUIDADA");
    const asc = tabFilters.sortOrder === "asc";
    return hist.sort((a, b) => {
      const ta = new Date(a.data_aposta).getTime();
      const tb = new Date(b.data_aposta).getTime();
      return asc ? ta - tb : tb - ta;
    });
  }, [apostas, tabFilters.sortOrder]);

  // Helpers para coletar bookmaker_ids e parceiro_ids de uma aposta (incluindo pernas)
  const getApostaBookmakerIds = (a: Aposta): string[] => {
    const ids: string[] = [];
    if (a.bookmaker_id) ids.push(a.bookmaker_id);
    (a.pernas || []).forEach((p: any) => {
      if (p?.bookmaker_id) ids.push(p.bookmaker_id);
    });
    return ids;
  };
  const getApostaParceiroIds = (a: Aposta): string[] => {
    const bkIds = getApostaBookmakerIds(a);
    const ids: string[] = [];
    bkIds.forEach(id => {
      const bk = bookmakers.find(b => b.id === id);
      if (bk?.parceiro_id) ids.push(bk.parceiro_id);
    });
    return ids;
  };
  const matchesBookmakerFilter = (a: Aposta): boolean => {
    if (tabFilters.bookmakerIds.length === 0) return true;
    return getApostaBookmakerIds(a).some(id => tabFilters.bookmakerIds.includes(id));
  };
  const matchesParceiroFilter = (a: Aposta): boolean => {
    if (tabFilters.parceiroIds.length === 0) return true;
    return getApostaParceiroIds(a).some(id => tabFilters.parceiroIds.includes(id));
  };

  // Filtered counts per sub-tab for badge display
  const filteredAbertasCount = useMemo(() => apostasAbertas.filter(a => {
    if (!matchesBookmakerFilter(a)) return false;
    if (!matchesParceiroFilter(a)) return false;
    const matchesResultado = tabFilters.resultados.length === 0 || tabFilters.resultados.includes(a.resultado as any);
    return matchesResultado;
  }).length, [apostasAbertas, tabFilters.bookmakerIds, tabFilters.parceiroIds, tabFilters.resultados, bookmakers]);
  const filteredHistoricoCount = useMemo(() => apostasHistorico.filter(a => {
    if (!matchesBookmakerFilter(a)) return false;
    if (!matchesParceiroFilter(a)) return false;
    const matchesResultado = tabFilters.resultados.length === 0 || tabFilters.resultados.includes(a.resultado as any);
    return matchesResultado;
  }).length, [apostasHistorico, tabFilters.bookmakerIds, tabFilters.parceiroIds, tabFilters.resultados, bookmakers]);

  // Auto-switch to history tab when no open operations
  useEffect(() => {
    if (!loading && apostasAbertas.length === 0 && apostasHistorico.length > 0 && apostasSubTab === 'abertas') {
      setApostasSubTab('historico');
    }
  }, [loading, apostasAbertas.length, apostasHistorico.length]);
  
  // Aplicar filtros na lista atual (abertas ou histórico)
  const apostasListaAtual = apostasSubTab === "abertas" ? apostasAbertas : apostasHistorico;
  
  // Suspicious date filter
  const suspiciousFilter = useSuspiciousDateFilter(apostasListaAtual);

  const apostasFiltradas = useMemo(() => {
    const term = searchTerm.toLowerCase();
    return apostasListaAtual.filter(a => {
      if (!suspiciousFilter.filterFn(a)) return false;
      if (term) {
        const matchesBase = (a.evento || '').toLowerCase().includes(term) || (a.esporte || '').toLowerCase().includes(term) || (a.selecao || '').toLowerCase().includes(term) || (a.bookmaker_nome || '').toLowerCase().includes(term);
        const matchesPernas = (a.pernas || []).some((p: any) => (p?.bookmaker_nome || '').toLowerCase().includes(term) || (p?.selecao || '').toLowerCase().includes(term));
        const matchesSelecoes = Array.isArray((a as any).selecoes) && (a as any).selecoes.some((s: any) => (s?.descricao || '').toLowerCase().includes(term));
        if (!matchesBase && !matchesPernas && !matchesSelecoes) return false;
      }
      // Filtro por casa (inclui pernas para multi-leg)
      if (!matchesBookmakerFilter(a)) return false;
      // Filtro por parceiro (inclui pernas para multi-leg)
      if (!matchesParceiroFilter(a)) return false;
      const matchesResultado = tabFilters.resultados.length === 0 || tabFilters.resultados.includes(a.resultado as any);
      return matchesResultado;
    });
  }, [apostasListaAtual, searchTerm, tabFilters.bookmakerIds, tabFilters.parceiroIds, tabFilters.resultados, bookmakers, suspiciousFilter.active]);
  
  // Ordenar casaData conforme filtro selecionado
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

  // formatCurrency agora vem do useProjetoCurrency
  const formatPercent = (v: number) => `${v >= 0 ? "+" : ""}${v.toFixed(2)}%`;
  const handleApostaUpdated = () => { fetchData(); onDataChange?.(); };
  // Abrir formulário em janela externa (padronizado com Surebet)
  const handleOpenAposta = useCallback((aposta: Aposta) => {
    console.log("[DuploGreen] handleOpenAposta chamado:", { id: aposta.id, forma_registro: aposta.forma_registro });
    
    let url: string;
    let windowFeatures: string;
    
    if (aposta.forma_registro === "ARBITRAGEM") {
      url = `/janela/surebet/${aposta.id}?projetoId=${encodeURIComponent(projetoId)}&tab=duplogreen`;
      const height = calcSurebetWindowHeight(3);
      windowFeatures = `width=780,height=${height},menubar=no,toolbar=no,location=no,status=no,resizable=yes,scrollbars=yes`;
    } else {
      url = `/janela/aposta/${aposta.id}?projetoId=${encodeURIComponent(projetoId)}&tab=duplogreen&estrategia=DUPLO_GREEN`;
      windowFeatures = 'width=780,height=900,menubar=no,toolbar=no,location=no,status=no,resizable=yes,scrollbars=yes';
    }
    
    const win = window.open(url, '_blank', windowFeatures);
    console.log("[DuploGreen] window.open resultado:", win ? "abriu" : "BLOQUEADO");
    
    // Fallback se popup bloqueado
    if (!win) {
      window.open(url, '_blank');
    }
  }, [projetoId]);

  // Hook centralizado para sincronização cross-window
  useCrossWindowSync({
    projetoId,
    onSync: useCallback(() => {
      fetchData();
      onDataChange?.();
    }, [onDataChange]),
  });
  const handleModeToggle = () => { setIsTransitioning(true); setTimeout(() => { setNavMode(p => p === "tabs" ? "sidebar" : "tabs"); setTimeout(() => setIsTransitioning(false), 50); }, 150); };
  const handleNavTabChange = (v: string) => { if (v !== activeNavTab) { setIsTransitioning(true); setActiveNavTab(v as NavTabValue); setTimeout(() => setIsTransitioning(false), 180); } };

  const modeToggle = (
    <Tooltip><TooltipTrigger asChild><Button variant="ghost" size="sm" onClick={handleModeToggle} className="h-8 w-8 p-0 text-muted-foreground/60 hover:text-foreground hover:bg-muted/50 transition-colors">{navMode === "tabs" ? <PanelLeft className="h-4 w-4" /> : <LayoutList className="h-4 w-4" />}</Button></TooltipTrigger><TooltipContent side="bottom" className="text-xs">{navMode === "tabs" ? "Modo Gestão" : "Modo Compacto"}</TooltipContent></Tooltip>
  );
  const periodFilterComponent = <StandardTimeFilter period={tabFilters.period} onPeriodChange={tabFilters.setPeriod} customDateRange={tabFilters.customDateRange} onCustomDateRangeChange={tabFilters.setCustomDateRange} projetoId={projetoId} />;

  const renderVisaoGeral = () => (
    <div className="space-y-6">
      <KpiSummaryBar
        actions={actionsSlot}
        leading={<SaldoOperavelCard projetoId={projetoId} variant="compact" />}
        items={[
          {
            label: "Duplo Green",
            value: metricas.total,
            tooltip: (
              <div className="space-y-1.5">
                <p className="font-semibold text-foreground">Detalhamento Duplo Green</p>
                <div className="space-y-0.5">
                  <div className="flex justify-between gap-4">
                    <span className="flex items-center gap-1.5"><span className="inline-block w-1.5 h-1.5 rounded-full bg-emerald-500" /> Greens</span>
                    <span className="font-semibold text-foreground">{metricas.greens}</span>
                  </div>
                  <div className="flex justify-between gap-4">
                    <span className="flex items-center gap-1.5"><span className="inline-block w-1.5 h-1.5 rounded-full bg-red-500" /> Reds</span>
                    <span className="font-semibold text-foreground">{metricas.reds}</span>
                  </div>
                  {metricas.pendentes > 0 && (
                    <div className="flex justify-between gap-4">
                      <span className="flex items-center gap-1.5"><span className="inline-block w-1.5 h-1.5 rounded-full bg-blue-400" /> Pendentes</span>
                      <span className="font-semibold text-foreground">{metricas.pendentes}</span>
                    </div>
                  )}
                </div>
                <div className="border-t border-border/50 pt-1 flex justify-between gap-4">
                  <span className="font-semibold">Total</span>
                  <span className="font-semibold text-foreground">{metricas.total}</span>
                </div>
              </div>
            ),
            subtitle: (
              <div className="flex items-center gap-2">
                {metricas.pendentes > 0 && <span className="text-blue-400">{metricas.pendentes} Pend.</span>}
                <span className="inline-flex items-center gap-0.5 text-emerald-500 font-semibold">
                  <span className="inline-block w-1.5 h-1.5 rounded-full bg-emerald-500" />
                  {metricas.greens}
                </span>
                <span className="inline-flex items-center gap-0.5 text-red-500 font-semibold">
                  <span className="inline-block w-1.5 h-1.5 rounded-full bg-red-500" />
                  {metricas.reds}
                </span>
              </div>
            ),
          },
          {
            label: "Volume",
            value: formatCurrency(metricas.totalStake),
            tooltip: (
              <div className="space-y-1">
                <p className="font-semibold text-foreground">Volume Apostado</p>
                <p className="text-muted-foreground">Soma total das stakes apostadas em Duplo Green no período.</p>
              </div>
            ),
            minWidth: "min-w-[80px]",
          },
          {
            label: metricas.lucroTotal >= 0 ? "Lucro" : "Prejuízo",
            value: formatCurrency(metricas.lucroTotal),
            valueClassName: metricas.lucroTotal >= 0 ? "text-emerald-500" : "text-red-500",
            minWidth: "min-w-[80px]",
            wrapper: (children) => {
              const lucroPorMoeda = metricas.lucroPorMoeda || [];
              const hasMultiCurrency = lucroPorMoeda.length > 1 || lucroPorMoeda.some(c => c.moeda !== (moedaConsol || 'BRL'));
              return (
                <Popover>
                  <PopoverTrigger asChild>
                    <button className="cursor-pointer hover:opacity-80 transition-opacity">
                      {children}
                    </button>
                  </PopoverTrigger>
                  <PopoverContent side="bottom" align="center" className="w-auto p-0" sideOffset={8}>
                    <div>
                      {hasMultiCurrency && (
                        <div className="p-3 space-y-2 border-b border-border">
                          <p className="text-xs font-semibold text-foreground">Lucro por Moeda</p>
                          <div className="space-y-1">
                            {lucroPorMoeda.map((item) => (
                              <div key={item.moeda} className="flex items-center justify-between gap-4 text-xs">
                                <span className="text-muted-foreground">{item.moeda}</span>
                                <span className={cn("font-medium font-mono", item.valor >= 0 ? "text-emerald-500" : "text-red-500")}>
                                  {item.valor >= 0 ? "+" : "-"}{item.moeda === 'USD' ? `$ ${Math.abs(item.valor).toFixed(2)}` : formatCurrency(Math.abs(item.valor))}
                                </span>
                              </div>
                            ))}
                          </div>
                          <div className="flex justify-between items-center pt-1 border-t border-border/50">
                            <span className="text-[10px] text-muted-foreground">Consolidado ({moedaConsol || 'BRL'})</span>
                            <span className={cn("text-xs font-bold font-mono", metricas.lucroTotal >= 0 ? "text-emerald-500" : "text-red-500")}>
                              {formatCurrency(metricas.lucroTotal)}
                            </span>
                          </div>
                        </div>
                      )}
                      <FinancialMetricsPopover projetoId={projetoId} dateRange={dateRange ? { from: dateRange.start.toISOString().split('T')[0], to: dateRange.end.toISOString().split('T')[0] } : null} />
                    </div>
                  </PopoverContent>
                </Popover>
              );
            },
          },
          {
            label: "ROI",
            value: formatPercent(metricas.roi),
            tooltip: (
              <div className="space-y-1">
                <p className="font-semibold text-foreground">Retorno sobre Investimento</p>
                <p className="text-muted-foreground">Lucro dividido pelo volume apostado no período. Considera apenas apostas com resultado definido.</p>
              </div>
            ),
            valueClassName: metricas.roi >= 0 ? "text-emerald-500" : "text-red-500",
            minWidth: "min-w-[50px]",
          },
        ]}
      />

      {/* Filtro de período - abaixo dos KPIs */}
      {periodFilterComponent}

      {metricas.total > 0 && (
        <VisaoGeralCharts 
          apostas={apostas} 
          apostasCalendario={transformRpcDailyForCharts(calendarDaily)}
          accentColor="#84cc16" 
          logoMap={logoMap} 
          isSingleDayPeriod={tabFilters.period === "1dia"} 
          periodStart={tabFilters.dateRange?.start}
          periodEnd={tabFilters.dateRange?.end}
          formatCurrency={formatCurrency}
          convertToConsolidation={convertFnOficial}
          moedaConsolidacao={moedaConsol}
        />
      )}

      {/* Card de Estatísticas Detalhadas */}
      {metricas.total > 0 && (
        <DuploGreenStatisticsCard apostas={apostas} formatCurrency={formatCurrency} />
      )}

      {/* Banner Info - No final da página */}
      <Card className="border-lime-500/30 bg-lime-500/5">
        <CardContent className="py-3">
          <div className="flex items-start gap-2">
            <Info className="h-4 w-4 text-lime-400 mt-0.5 shrink-0" />
            <p className="text-xs text-muted-foreground">
              <span className="font-medium text-lime-400">Visão Especializada:</span> Esta aba exibe apenas operações de Duplo Green. 
              As mesmas apostas também aparecem na aba "Todas Apostas".
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );

  const renderApostas = () => (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-3">
          {/* Sub-abas Abertas / Histórico - usando componente padronizado */}
          <div className="mb-3">
            <OperationsSubTabHeader
              subTab={apostasSubTab}
              onSubTabChange={setApostasSubTab}
              openCount={filteredAbertasCount}
              totalOpenCount={apostasAbertas.length}
              historyCount={filteredHistoricoCount}
              totalHistoryCount={apostasHistorico.length}
              viewMode={viewMode}
              onViewModeChange={(mode) => setViewMode(mode)}
              showViewToggle={true}
              searchQuery={searchTerm}
              onSearchChange={setSearchTerm}
              sortOrder={tabFilters.sortOrder}
              onSortOrderToggle={tabFilters.toggleSortOrder}
              extraActions={
                <ExportMenu
                  getData={() => apostasFiltradas.map(a => {
                    // Multi-pernas use transformSurebetToExport
                    const hasPernas = Array.isArray(a.pernas) && a.pernas.length > 1;
                    if (hasPernas) {
                      return transformSurebetToExport({
                        id: a.id,
                        data_operacao: a.data_aposta,
                        evento: a.evento,
                        mercado: a.mercado,
                        modelo: a.modelo,
                        stake_total: a.stake_total || a.stake,
                        spread_calculado: a.spread_calculado,
                        resultado: a.resultado,
                        status: a.status,
                        lucro_real: a.lucro_prejuizo,
                        observacoes: a.observacoes,
                        moeda_operacao: a.moeda_operacao,
                        pernas: a.pernas?.map(p => ({
                          bookmaker_nome: p.bookmaker_nome,
                          selecao: p.selecao,
                          odd: p.odd,
                          stake: p.stake,
                          moeda: p.moeda,
                        })),
                      }, "DUPLO_GREEN", convertFnOficial);
                    }
                    return transformApostaToExport({
                      ...a,
                      estrategia: "DUPLO_GREEN",
                    }, "Duplo Green", convertFnOficial);
                  })}
                  abaOrigem="Duplo Green"
                  filename={`duplogreen-${projetoId}-${format(new Date(), 'yyyy-MM-dd')}`}
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
              <Zap className="h-4 w-4 text-lime-400" />
              {apostasSubTab === "abertas" ? "Operações Abertas" : "Histórico de Operações"}
            </CardTitle>
          </div>
        </CardHeader>
        <CardContent className="pt-0 space-y-3">
          {/* Filtros LOCAIS da aba (isolados de outras abas) */}
          <div className="flex items-center gap-2 pb-3 border-b border-border/50 flex-wrap">
            <TabFiltersBar
              projetoId={projetoId}
              filters={tabFilters}
              showEstrategiaFilter={false}
              showResultadoFilter={true}
              className="flex-1"
            />
            <SuspiciousDateFilterButton
              active={suspiciousFilter.active}
              onToggle={suspiciousFilter.setActive}
              count={suspiciousFilter.suspiciousCount}
            />
          </div>
        </CardContent>
      </Card>

      {apostasFiltradas.length === 0 ? (
        <Card>
          <CardContent className="text-center py-8 text-muted-foreground">
            <Zap className="h-12 w-12 mx-auto mb-4 opacity-50" />
            <p>{apostasSubTab === "abertas" ? "Nenhuma aposta aberta" : "Nenhuma aposta no histórico"}</p>
          </CardContent>
        </Card>
      ) : (() => {
        const apostasSimples = apostasFiltradas.filter(a => a.forma_registro !== "ARBITRAGEM");
        const apostasArbitragem = apostasFiltradas.filter(a => a.forma_registro === "ARBITRAGEM");
        
        return (
          <div className="space-y-2">
            {/* Surebets renderizadas com SurebetCard (motor financeiro unificado) */}
            {apostasArbitragem.map((aposta) => {
              // Group pernas by selecao (same as Surebet tab)
              const pernasRaw = (aposta.pernas as any[] || []).map((p: any) => ({
                id: p.id,
                bookmaker_id: p.bookmaker_id,
                bookmaker_nome: p.bookmaker_nome || '',
                parceiro_nome: p.parceiro_nome || null,
                moeda: p.moeda || 'BRL',
                selecao: p.selecao || '',
                selecao_livre: p.selecao_livre,
                odd: p.odd || 0,
                stake: p.stake || 0,
                resultado: p.resultado,
                lucro_prejuizo: p.lucro_prejuizo ?? null,
                gerou_freebet: p.gerou_freebet,
                valor_freebet_gerada: p.valor_freebet_gerada,
                stake_brl_referencia: p.stake_brl_referencia,
                lucro_prejuizo_brl_referencia: p.lucro_prejuizo_brl_referencia,
                fonte_saldo: p.fonte_saldo || null,
              }));
              const pernasOrdenadas = [...pernasRaw].sort((a, b) => {
                const order: Record<string, number> = { "Casa": 1, "1": 1, "Empate": 2, "X": 2, "Fora": 3, "2": 3 };
                return (order[a.selecao] || 99) - (order[b.selecao] || 99);
              });
              const pernasAgrupadas = groupPernasBySelecao(pernasOrdenadas);

              const surebetData = {
                id: aposta.id,
                workspace_id: (aposta as any).workspace_id || '',
                data_operacao: aposta.data_aposta,
                evento: aposta.evento || '',
                esporte: aposta.esporte || '',
                modelo: aposta.modelo || '1-2',
                mercado: aposta.mercado,
                estrategia: aposta.estrategia,
                stake_total: aposta.stake_total || aposta.stake || 0,
                spread_calculado: aposta.spread_calculado ?? null,
                roi_esperado: aposta.roi_esperado ?? null,
                lucro_esperado: aposta.lucro_esperado ?? null,
                lucro_real: (aposta as any).pl_consolidado ?? aposta.lucro_prejuizo ?? null,
                pl_consolidado: (aposta as any).pl_consolidado ?? null,
                stake_consolidado: (aposta as any).stake_consolidado ?? null,
                roi_real: aposta.roi_real ?? null,
                status: aposta.status,
                resultado: aposta.resultado,
                observacoes: aposta.observacoes,
                pernas: pernasAgrupadas,
              };
              return (
                <SurebetCard
                  key={aposta.id}
                  surebet={surebetData}
                  onEdit={() => handleOpenAposta(aposta)}
                  onQuickResolve={handleQuickResolveSurebet}
                  onSimpleMenuQuickResolve={handleQuickResolve}
                  onPernaResultChange={handleSurebetPernaResolve}
                  onSimpleQuickResolve={handleQuickResolve}
                   onDelete={handleDeleteSurebet}
                   onDuplicate={handleDuplicateSurebet}
                  formatCurrency={formatCurrency}
                  convertToConsolidation={convertFnOficial}
                  bookmakerNomeMap={bookmakerNomeMap}
                />
              );
            })}
            {/* Apostas simples */}
              <div className={viewMode === "cards" ? "grid gap-5 md:grid-cols-2 xl:grid-cols-3" : "space-y-2"}>
                {apostasSimples.map((aposta) => {
                  const subEntries = (aposta as any)._sub_entries;
                  const hasMultipleEntries = subEntries && subEntries.length > 1;

                  if (hasMultipleEntries) {
                    const surebetData: SurebetData = {
                      id: aposta.id,
                      workspace_id: (aposta as any).workspace_id,
                      data_operacao: aposta.data_aposta,
                      evento: aposta.evento,
                      esporte: aposta.esporte,
                      mercado: aposta.mercado,
                      modelo: (aposta as any).modelo || '1-N',
                      estrategia: aposta.estrategia || 'DUPLO_GREEN',
                      stake_total: (aposta as any).stake_total ?? aposta.stake ?? 0,
                      spread_calculado: null,
                      roi_esperado: null,
                      lucro_esperado: null,
                      lucro_real: aposta.pl_consolidado ?? aposta.lucro_prejuizo,
                      roi_real: null,
                      pl_consolidado: aposta.pl_consolidado,
                      stake_consolidado: aposta.stake_consolidado,
                      status: aposta.status,
                      resultado: aposta.resultado,
                      observacoes: aposta.observacoes,
                      pernas: groupPernasBySelecao(
                        subEntries.map((p: any) => ({
                          id: p.id,
                          selecao: p.selecao || aposta.selecao,
                          selecao_livre: p.selecao_livre,
                          odd: p.odd,
                          stake: p.stake,
                          resultado: p.resultado,
                          lucro_prejuizo: p.lucro_prejuizo ?? null,
                          bookmaker_nome: p.bookmaker?.nome || '—',
                          bookmaker_id: p.bookmaker_id,
                          moeda: p.moeda || 'BRL',
                          fonte_saldo: p.fonte_saldo || null,
                        }))
                      ),
                    };

                    return (
                      <SurebetCard
                        key={aposta.id}
                        surebet={surebetData}
                        onEdit={() => handleOpenAposta(aposta)}
                        onQuickResolve={handleQuickResolveSurebet}
                        onSimpleMenuQuickResolve={handleQuickResolve}
                        onPernaResultChange={handleSurebetPernaResolve}
                        onSimpleQuickResolve={handleQuickResolve}
                         onDelete={handleDeleteAposta}
                         onDuplicate={handleDuplicateAposta}
                        formatCurrency={formatCurrency}
                        convertToConsolidation={convertFnOficial}
                        bookmakerNomeMap={bookmakerNomeMap}
                      />
                    );
                  }

                  return (
                    <ApostaCard
                      key={aposta.id}
                      aposta={{ ...aposta, pernas: aposta.pernas as Perna[], moeda: aposta.moeda_operacao || "BRL" }}
                      estrategia="DUPLO_GREEN"
                      onEdit={(apostaId) => { const a = apostasFiltradas.find(ap => ap.id === apostaId); if (a) handleOpenAposta(a); }}
                      onQuickResolve={handleQuickResolve}
                       onDelete={handleDeleteAposta}
                       onDuplicate={handleDuplicateAposta}
                      variant={viewMode === "cards" ? "card" : "list"}
                      formatCurrency={formatCurrency}
                      convertToConsolidation={convertFnOficial}
                      moedaConsolidacao={moedaConsol}
                    />
                  );
                })}
              </div>
          </div>
        );
      })()}
    </div>
  );

  const renderPorCasa = () => (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Building2 className="h-5 w-5 text-lime-400" />
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
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {casaDataSorted.map((casa) => (
            <CasaAnalyticsCard
              key={casa.casa}
              casa={casa}
              logoUrl={getLogoUrl(casa.casa)}
              formatValue={formatCurrency}
              formatPercent={formatPercent}
              onClick={() => setSelectedPorCasa(casa)}
              accentHoverClass="hover:border-lime-500/40"
            />
          ))}
        </div>
      )}

      <CasaDetailModal
        casa={selectedPorCasa}
        onClose={() => setSelectedPorCasa(null)}
        logoUrl={selectedPorCasa ? getLogoUrl(selectedPorCasa.casa) : null}
        formatValue={formatCurrency}
      />
    </div>
  );

  const renderMainContent = () => {
    const contentClass = cn("transition-all duration-200 ease-out", isTransitioning ? "opacity-0 translate-y-2" : "opacity-100 translate-y-0");
    return (
      <div className={cn("min-h-[400px]", contentClass)}>
        {activeNavTab === "visao-geral" && renderVisaoGeral()}
        {activeNavTab !== "visao-geral" && (
          <div className="flex items-center gap-3 mb-4">
            <div className="flex-1">{periodFilterComponent}</div>
            <div className="shrink-0 flex items-center gap-2">
              <SaldoOperavelCard projetoId={projetoId} variant="compact" />
              {actionsSlot}
            </div>
          </div>
        )}
        {activeNavTab === "apostas" && renderApostas()}
        {activeNavTab === "por-casa" && renderPorCasa()}
      </div>
    );
  };

  if (loading) return <div className="space-y-4"><div className="grid gap-4 md:grid-cols-4">{[1, 2, 3, 4].map(i => <Skeleton key={i} className="h-24" />)}</div><Skeleton className="h-64" /></div>;

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
            <div className="absolute right-0 flex items-center gap-4">{modeToggle}</div>
          </div>
          <TabsContent value={activeNavTab} className="mt-0">{renderMainContent()}</TabsContent>
        </Tabs>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex gap-6">
        <div className="w-52 shrink-0 space-y-6">
          <div>
            <div className="flex items-center justify-between mb-4">
              <span className="text-xs font-medium text-muted-foreground/60 uppercase tracking-wider">Navegação</span>
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
                      isActive ? "bg-accent/10 text-foreground shadow-sm" : "text-muted-foreground/70 hover:text-foreground hover:bg-muted/50"
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
        <div className="flex-1 min-w-0">{renderMainContent()}</div>
      </div>
    </div>
  );
}
