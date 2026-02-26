import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { KpiSummaryBar } from "@/components/ui/kpi-summary-bar";
import { LucroCurrencyTooltip } from "@/components/ui/lucro-currency-tooltip";
import { calcularImpactoResultado } from "@/lib/bookmakerBalanceHelper";
import { getConsolidatedStake, getConsolidatedLucro } from "@/utils/consolidatedValues";
import { reliquidarAposta } from "@/services/aposta/ApostaService";
import { useInvalidateBookmakerSaldos } from "@/hooks/useBookmakerSaldosQuery";
import { useBonusBalanceManager } from "@/hooks/useBonusBalanceManager";
import { useCrossWindowSync } from "@/hooks/useCrossWindowSync";
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
  Info,
  LayoutGrid,
  List,
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
// Removido: Dialogs agora abrem em janelas externas
// import { ApostaDialog } from "./ApostaDialog";
// import { ApostaMultiplaDialog } from "./ApostaMultiplaDialog";
import { APOSTA_ESTRATEGIA } from "@/lib/apostaConstants";
import { StandardTimeFilter, StandardPeriodFilter, getDateRangeFromPeriod, DateRange as FilterDateRange } from "./StandardTimeFilter";
import { VisaoGeralCharts } from "./VisaoGeralCharts";
import { ApostaCard } from "./ApostaCard";
import { UnifiedStatisticsCard } from "./UnifiedStatisticsCard";
import { ChartEmptyState } from "@/components/ui/chart-empty-state";

import { cn, getFirstLastName } from "@/lib/utils";
import { useOpenOperationsCount } from "@/hooks/useOpenOperationsCount";
import { useProjetoCurrency } from "@/hooks/useProjetoCurrency";
import { useCotacoes } from "@/hooks/useCotacoes";
import { VolumeKPI } from "@/components/kpis/VolumeKPI";
import { useBookmakerLogoMap } from "@/hooks/useBookmakerLogoMap";
import { TabFiltersBar } from "./TabFiltersBar";
import { useTabFilters } from "@/hooks/useTabFilters";
import { OperationsSubTabHeader, type HistorySubTab } from "./operations";
import { ExportMenu, transformApostaToExport } from "./ExportMenu";
import { SaldoOperavelCard } from "./SaldoOperavelCard";
import { useCalendarApostas, transformCalendarApostasForCharts } from "@/hooks/useCalendarApostas";

interface ProjetoValueBetTabProps {
  projetoId: string;
  onDataChange?: () => void;
  refreshTrigger?: number;
  actionsSlot?: React.ReactNode;
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
  // Quando a aposta é registrada como ARBITRAGEM (multi-pernas), o volume fica aqui
  stake_total?: number | null;
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
  pernas?: any[] | null;
  modelo?: string | null;
  // Campos para apostas múltiplas
  selecoes?: { descricao: string; odd: number | string; resultado?: string }[] | null;
  tipo_multipla?: string | null;
  odd_final?: number | null;
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

type NavigationMode = "tabs" | "sidebar";
type NavTabValue = "visao-geral" | "apostas" | "por-casa";

const NAV_STORAGE_KEY = "valuebet-nav-mode";

// Ordenação para Por Casa
type SortField = "volume" | "lucro" | "apostas" | "roi";

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

export function ProjetoValueBetTab({ 
  projetoId, 
  onDataChange, 
  refreshTrigger,
  actionsSlot
}: ProjetoValueBetTabProps) {
  const [apostas, setApostas] = useState<Aposta[]>([]);
  const [bookmakers, setBookmakers] = useState<Bookmaker[]>([]);
  const [loading, setLoading] = useState(true);
  const loadedOnceRef = useRef(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [resultadoFilter, setResultadoFilter] = useState<string>("all");
  const [viewMode, setViewMode] = useState<"cards" | "list">("list");
  
  // Hook de formatação de moeda do projeto
  const { formatCurrency, getSymbol, convertToConsolidation: convertToConsolidationFn, convertToConsolidationOficial: convertToConsolidationOficialFn, moedaConsolidacao: moedaConsolidacaoVal } = useProjetoCurrency(projetoId);
  const { getRate, lastUpdate: rateLastUpdate } = useCotacoes();
  const currencySymbol = getSymbol();

  // Hook para invalidar cache de saldos
  const invalidateSaldos = useInvalidateBookmakerSaldos();
  
  // DESACOPLAMENTO CALENDÁRIO: Dados separados para o calendário (sem filtro de período)
  const { apostas: calendarApostas, refetch: refetchCalendar } = useCalendarApostas({
    projetoId,
    estrategia: "VALUEBET",
  });
  
  // Hook para gerenciamento de rollover (bônus)
  // NOTA: processarLiquidacaoBonus e reverterLiquidacaoBonus removidos - modelo unificado
  const { 
    hasActiveRolloverBonus, 
    atualizarProgressoRollover
  } = useBonusBalanceManager();
  
  // Hook global de logos de bookmakers (busca do catálogo)
  const { logoMap: catalogLogoMap } = useBookmakerLogoMap();

  // Estados removidos - dialogs agora abrem em janelas externas
  // const [dialogOpen, setDialogOpen] = useState(false);
  // const [selectedAposta, setSelectedAposta] = useState<Aposta | null>(null);
  // const [dialogMultiplaOpen, setDialogMultiplaOpen] = useState(false);
  // const [selectedApostaMultipla, setSelectedApostaMultipla] = useState<any | null>(null);

  // Sub-abas Abertas/Histórico - usa tipo padronizado
  const [apostasSubTab, setApostasSubTab] = useState<HistorySubTab>("abertas");
  
  // Ordenação Por Casa
  const [porCasaSort, setPorCasaSort] = useState<SortField>("volume");

  // Navigation mode
  const [navMode, setNavMode] = useState<NavigationMode>(() => {
    const saved = localStorage.getItem(NAV_STORAGE_KEY);
    return (saved === "tabs" ? "tabs" : "sidebar") as NavigationMode;
  });
  const [activeNavTab, setActiveNavTab] = useState<NavTabValue>("visao-geral");
  const [isTransitioning, setIsTransitioning] = useState(false);

  // Filtros LOCAIS da aba ValueBet (isolados de outras abas)
  const tabFilters = useTabFilters({
    tabId: "valuebet",
    projetoId,
    defaultPeriod: "mes_atual",
    persist: true,
  });
  
  // dateRange derivado dos filtros locais
  const dateRange = tabFilters.dateRange;

  // Count of open operations for badge - uses the canonical hook
  const { count: openOperationsCount } = useOpenOperationsCount({
    projetoId,
    estrategia: APOSTA_ESTRATEGIA.VALUEBET,
    refreshTrigger,
  });

  // NAV_ITEMS with dynamic count for badge
  const NAV_ITEMS = useMemo(() => [
    { value: "visao-geral" as NavTabValue, label: "Visão Geral", icon: LayoutDashboard },
    { value: "apostas" as NavTabValue, label: "Apostas", icon: Target, showBadge: true, count: openOperationsCount },
    { value: "por-casa" as NavTabValue, label: "Por Casa", icon: Building2 },
  ], [openOperationsCount]);

  // Save nav mode preference
  useEffect(() => {
    localStorage.setItem(NAV_STORAGE_KEY, navMode);
  }, [navMode]);

  useEffect(() => {
    fetchData();
  }, [projetoId, tabFilters.period, tabFilters.customDateRange, refreshTrigger]);

  const fetchData = async () => {
    try {
      if (!loadedOnceRef.current) setLoading(true);
      await Promise.all([fetchApostas(), fetchBookmakers()]);
    } finally {
      setLoading(false);
      loadedOnceRef.current = true;
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
        .select(`
          id, data_aposta, esporte, evento, mercado, selecao, odd, stake, stake_total, estrategia, 
          status, resultado, lucro_prejuizo, valor_retorno, observacoes, bookmaker_id,
          modo_entrada, gerou_freebet, valor_freebet_gerada, tipo_freebet, forma_registro,
          contexto_operacional, lay_exchange, lay_odd, lay_stake, lay_liability, lay_comissao,
          back_em_exchange, back_comissao, pernas, modelo, selecoes, tipo_multipla, odd_final,
          moeda_operacao, stake_consolidado, pl_consolidado, valor_brl_referencia, lucro_prejuizo_brl_referencia
        `)
        .eq("projeto_id", projetoId)
        .eq("estrategia", APOSTA_ESTRATEGIA.VALUEBET)
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
      
      const bookmakerIds = [...new Set((data || []).map((a: { bookmaker_id: string | null }) => a.bookmaker_id).filter(Boolean))];
      
      let bookmakerMap = new Map<string, { nome: string; loginUsername: string | null; parceiroNome: string | null; logoUrl: string | null }>();
      if (bookmakerIds.length > 0) {
        const { data: bookmakers } = await supabase
          .from("bookmakers")
          .select("id, nome, login_username, parceiro:parceiros(nome), bookmakers_catalogo(logo_url)")
          .in("id", bookmakerIds);

        bookmakerMap = new Map(
          (bookmakers || []).map((b: any) => [
            b.id,
            { 
              nome: b.nome, 
              loginUsername: b.login_username ?? null,
              parceiroNome: b.parceiro?.nome ?? null,
              logoUrl: b.bookmakers_catalogo?.logo_url ?? null,
            },
          ])
        );
      }

      const mappedApostas: Aposta[] = (data || []).map((a: any) => {
        const bkInfo = a.bookmaker_id ? bookmakerMap.get(a.bookmaker_id) : null;
        // Construir nome completo: "CASA - PARCEIRO" se parceiroNome existir
        let bookmakerNomeCompleto = bkInfo?.nome ?? "Desconhecida";
        if (bkInfo?.parceiroNome) {
          bookmakerNomeCompleto = `${bkInfo.nome} - ${bkInfo.parceiroNome}`;
        }
        return {
          ...a,
          odd: a.odd ?? 0,
          stake: a.stake ?? 0,
          bookmaker_nome: bookmakerNomeCompleto,
          parceiro_nome: bkInfo?.parceiroNome ?? undefined,
          logo_url: bkInfo?.logoUrl ?? null,
          operador_nome: bkInfo?.parceiroNome ?? undefined,
        };
      });

      // Enriquecer com sub_entries de apostas_pernas
      const apostaIds = mappedApostas.map(a => a.id);
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
          const pernasMap = new Map<string, any[]>();
          for (const p of pernasData) {
            const arr = pernasMap.get(p.aposta_id) || [];
            arr.push(p);
            pernasMap.set(p.aposta_id, arr);
          }
          for (const a of mappedApostas) {
            const pernas = pernasMap.get(a.id);
            if (pernas && pernas.length > 1) {
              (a as any)._sub_entries = pernas;
            }
          }
        }
      }
      
      setApostas(mappedApostas);
    } catch (error: unknown) {
      console.error("Erro ao carregar apostas ValueBet:", error);
    }
  };

  // Resolução rápida de apostas - USA RPC ATÔMICA + ROLLOVER
  const handleQuickResolve = useCallback(async (apostaId: string, resultado: string) => {
    try {
      const aposta = apostas.find(a => a.id === apostaId);
      if (!aposta) return;

      const stake = typeof aposta.stake_total === "number" ? aposta.stake_total : aposta.stake;
      const odd = aposta.odd || 1;
      const bookmakerId = aposta.bookmaker_id;
      
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

      // 3. Atualizar lista local
      setApostas(prev => prev.map(a => 
        a.id === apostaId 
          ? { ...a, resultado, lucro_prejuizo: lucro, status: "LIQUIDADA" }
          : a
      ));

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
    } catch (error) {
      console.error("Erro ao resolver aposta:", error);
      toast.error("Erro ao atualizar resultado");
    }
  }, [apostas, onDataChange, projetoId, invalidateSaldos, hasActiveRolloverBonus, atualizarProgressoRollover]);

  // Deletar aposta
  const handleDeleteAposta = useCallback(async (apostaId: string) => {
    try {
      const { deletarAposta } = await import("@/services/aposta/ApostaService");
      const result = await deletarAposta(apostaId);
      if (!result.success) {
        toast.error(result.error?.message || "Erro ao excluir aposta");
        return;
      }
      setApostas(prev => prev.filter(a => a.id !== apostaId));
      invalidateSaldos(projetoId);
      onDataChange?.();
      toast.success("Aposta excluída");
    } catch (error: any) {
      console.error("Erro ao excluir aposta:", error);
      toast.error("Erro ao excluir aposta");
    }
  }, [projetoId, invalidateSaldos, onDataChange]);

  const metricas = useMemo(() => {
    const { convertToConsolidation, moedaConsolidacao } = { convertToConsolidation: convertToConsolidationOficialFn, moedaConsolidacao: moedaConsolidacaoVal };
    
    const total = apostas.length;
    const totalStake = apostas.reduce((acc, a) => acc + getConsolidatedStake(a, convertToConsolidation, moedaConsolidacao), 0);
    const lucroTotal = apostas.reduce((acc, a) => acc + getConsolidatedLucro(a, convertToConsolidation, moedaConsolidacao), 0);
    const pendentes = apostas.filter(a => !a.resultado || a.resultado === "PENDENTE").length;
    const greens = apostas.filter(a => a.resultado === "GREEN" || a.resultado === "MEIO_GREEN").length;
    const reds = apostas.filter(a => a.resultado === "RED" || a.resultado === "MEIO_RED").length;
    const liquidadas = apostas.filter(a => a.resultado && a.resultado !== "PENDENTE").length;
    const taxaAcerto = liquidadas > 0 ? (greens / liquidadas) * 100 : 0;
    const roi = totalStake > 0 ? (lucroTotal / totalStake) * 100 : 0;

    // Breakdown de volume por moeda original
    const volumePorMoeda = new Map<string, number>();
    apostas.forEach(a => {
      const moeda = a.moeda_operacao || "BRL";
      const rawStake = a.forma_registro === "ARBITRAGEM" ? (a.stake_total || 0) : (a.stake || 0);
      volumePorMoeda.set(moeda, (volumePorMoeda.get(moeda) || 0) + rawStake);
    });
    const currencyBreakdown = Array.from(volumePorMoeda.entries())
      .map(([moeda, valor]) => ({ moeda, valor }))
      .filter(item => Math.abs(item.valor) > 0.01);

    // Breakdown de LUCRO por moeda original
    const lucroPorMoedaMap = new Map<string, number>();
    apostas.forEach(a => {
      const moeda = a.moeda_operacao || "BRL";
      const rawLucro = a.lucro_prejuizo ?? 0;
      lucroPorMoedaMap.set(moeda, (lucroPorMoedaMap.get(moeda) || 0) + rawLucro);
    });
    const lucroPorMoeda = Array.from(lucroPorMoedaMap.entries())
      .map(([moeda, valor]) => ({ moeda, valor }))
      .filter(item => Math.abs(item.valor) > 0.01);

    const porCasa: Record<string, { stake: number; lucro: number; count: number }> = {};
    apostas.forEach(a => {
      const casa = a.bookmaker_nome || "Desconhecida";
      if (!porCasa[casa]) porCasa[casa] = { stake: 0, lucro: 0, count: 0 };
      porCasa[casa].stake += getConsolidatedStake(a, convertToConsolidation, moedaConsolidacao);
      porCasa[casa].lucro += getConsolidatedLucro(a, convertToConsolidation, moedaConsolidacao);
      porCasa[casa].count++;
    });

    return { total, totalStake, lucroTotal, pendentes, greens, reds, taxaAcerto, roi, porCasa, currencyBreakdown, lucroPorMoeda };
  }, [apostas, convertToConsolidationOficialFn, moedaConsolidacaoVal]);

  // casaData agregado por CASA (não por vínculo) - Padrão unificado
  const casaData = useMemo((): CasaAgregada[] => {
    const casaMap = new Map<string, {
      apostas: number;
      volume: number;
      lucro: number;
      vinculos: Map<string, { apostas: number; volume: number; lucro: number }>;
    }>();

    const extractCasaVinculo = (bookmakerNome: string, operadorNome?: string) => {
      // Primeiro tenta extrair do formato "CASA - Operador" no nome do bookmaker
      const separatorIdx = bookmakerNome.indexOf(" - ");
      if (separatorIdx > 0) {
        const vinculoRaw = bookmakerNome.substring(separatorIdx + 3).trim();
        return {
          casa: bookmakerNome.substring(0, separatorIdx).trim(),
          vinculo: getFirstLastName(vinculoRaw)
        };
      }
      // Se não tem separador, usa o operador_nome como vínculo
      return { 
        casa: bookmakerNome, 
        vinculo: operadorNome ? getFirstLastName(operadorNome) : "Sem vínculo" 
      };
    };

    const processEntry = (bookmakerNome: string, operadorNome: string | undefined, stake: number, lucro: number) => {
      const { casa, vinculo } = extractCasaVinculo(bookmakerNome, operadorNome);

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

    apostas.forEach((a) => {
      const bookmakerNome = a.bookmaker_nome || "Desconhecida";
      const stake = getConsolidatedStake(a, convertToConsolidationOficialFn, moedaConsolidacaoVal);
      const lucro = getConsolidatedLucro(a, convertToConsolidationOficialFn, moedaConsolidacaoVal);
      processEntry(bookmakerNome, a.operador_nome, stake, lucro);
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
  }, [apostas]);

  // Mapa de logos combinando catálogo global + bookmakers do projeto
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
      const logoUrl = bk.bookmakers_catalogo?.logo_url || null;
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

  // Separar apostas em abertas e histórico
  const apostasAbertas = useMemo(() => apostas.filter(a => !a.resultado || a.resultado === "PENDENTE"), [apostas]);
  const apostasHistorico = useMemo(() => apostas.filter(a => a.resultado && a.resultado !== "PENDENTE"), [apostas]);

  // Auto-switch to history tab when no open operations
  useEffect(() => {
    if (!loading && apostasAbertas.length === 0 && apostasHistorico.length > 0 && apostasSubTab === 'abertas') {
      setApostasSubTab('historico');
    }
  }, [loading, apostasAbertas.length, apostasHistorico.length]);
  
  // Aplicar filtros na lista atual (abertas ou histórico)
  const apostasListaAtual = apostasSubTab === "abertas" ? apostasAbertas : apostasHistorico;
  
  const apostasFiltradas = useMemo(() => {
    return apostasListaAtual.filter(a => {
      const matchesSearch = 
        (a.evento || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
        (a.esporte || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
        (a.selecao || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
        (a.bookmaker_nome || '').toLowerCase().includes(searchTerm.toLowerCase());
      const matchesResultado = tabFilters.resultados.length === 0 || tabFilters.resultados.includes(a.resultado as any);
      return matchesSearch && matchesResultado;
    });
  }, [apostasListaAtual, searchTerm, tabFilters.resultados]);

  // Filtered counts per sub-tab for badge display
  const filteredAbertasCount = useMemo(() => apostasAbertas.filter(a => {
    const matchesResultado = tabFilters.resultados.length === 0 || tabFilters.resultados.includes(a.resultado as any);
    return matchesResultado;
  }).length, [apostasAbertas, tabFilters.resultados]);
  const filteredHistoricoCount = useMemo(() => apostasHistorico.filter(a => {
    const matchesResultado = tabFilters.resultados.length === 0 || tabFilters.resultados.includes(a.resultado as any);
    return matchesResultado;
  }).length, [apostasHistorico, tabFilters.resultados]);

  // formatCurrency agora vem do useProjetoCurrency

  const formatPercent = (value: number) => {
    return `${value >= 0 ? "+" : ""}${value.toFixed(2)}%`;
  };

  // Abrir formulário em janela externa (padronizado com Surebet)
  const openEditDialog = useCallback((a: Aposta) => {
    const isMultipla =
      a.forma_registro === "MULTIPLA" ||
      Boolean(a.tipo_multipla) ||
      (Array.isArray(a.selecoes) && a.selecoes.length > 0);

    if (isMultipla) {
      const url = `/janela/multipla/${a.id}?projetoId=${encodeURIComponent(projetoId)}&tab=valuebet&estrategia=VALUEBET`;
      window.open(url, '_blank', 'width=780,height=900,menubar=no,toolbar=no,location=no,status=no,resizable=yes,scrollbars=yes');
    } else {
      const url = `/janela/aposta/${a.id}?projetoId=${encodeURIComponent(projetoId)}&tab=valuebet&estrategia=VALUEBET`;
      window.open(url, '_blank', 'width=780,height=900,menubar=no,toolbar=no,location=no,status=no,resizable=yes,scrollbars=yes');
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

  const handleApostaUpdated = () => {
    fetchData();
    onDataChange?.();
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

  // Period filter component
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
      {/* KPIs - Faixa compacta */}
      <KpiSummaryBar
        actions={actionsSlot}
        leading={<SaldoOperavelCard projetoId={projetoId} variant="compact" />}
        items={[
          {
            label: "Apostas ValueBet",
            value: metricas.total,
            tooltip: (
              <div className="space-y-1.5">
                <p className="font-semibold text-foreground">Detalhamento de ValueBets</p>
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
                <p className="text-muted-foreground">Soma total das stakes apostadas em ValueBets no período.</p>
              </div>
            ),
            minWidth: "min-w-[80px]",
          },
          {
            label: metricas.lucroTotal >= 0 ? "Lucro" : "Prejuízo",
            value: formatCurrency(metricas.lucroTotal),
            valueClassName: metricas.lucroTotal >= 0 ? "text-emerald-500" : "text-red-500",
            minWidth: "min-w-[80px]",
            wrapper: (children) => (
              <LucroCurrencyTooltip
                lucroPorMoeda={metricas.lucroPorMoeda || []}
                totalConsolidado={metricas.lucroTotal}
                moedaConsolidacao={moedaConsolidacaoVal || 'BRL'}
                formatValue={formatCurrency}
              >
                {children}
              </LucroCurrencyTooltip>
            ),
            cursorHelp: true,
          },
          {
            label: "ROI",
            value: formatPercent(metricas.roi),
            tooltip: (
              <div className="space-y-1">
                <p className="font-semibold text-foreground">Retorno sobre Investimento</p>
                <p className="text-muted-foreground">Lucro dividido pelo volume total apostado no período.</p>
              </div>
            ),
            valueClassName: metricas.roi >= 0 ? "text-emerald-500" : "text-red-500",
            minWidth: "min-w-[50px]",
          },
        ]}
      />

      {/* Filtro de período - abaixo dos KPIs */}
      {periodFilterComponent}

      {/* Gráficos e Estatísticas */}
      {metricas.total > 0 ? (
        <>
          <VisaoGeralCharts 
            apostas={apostas} 
            apostasCalendario={transformCalendarApostasForCharts(calendarApostas)}
            logoMap={logoMap}
            isSingleDayPeriod={tabFilters.period === "1dia"}
            periodStart={dateRange?.start}
            periodEnd={dateRange?.end}
            formatCurrency={formatCurrency}
            convertToConsolidation={convertToConsolidationOficialFn}
            moedaConsolidacao={moedaConsolidacaoVal}
          />
          <UnifiedStatisticsCard apostas={apostas} formatCurrency={formatCurrency} currencySymbol={currencySymbol} />
        </>
      ) : (
        <Card>
          <CardContent className="py-16">
            <ChartEmptyState isSingleDayPeriod={tabFilters.period === "1dia"} />
          </CardContent>
        </Card>
      )}

      {/* Banner Info - No final da página */}
      <Card className="border-purple-500/30 bg-purple-500/5">
        <CardContent className="py-3">
          <div className="flex items-start gap-2">
            <Info className="h-4 w-4 text-purple-400 mt-0.5 shrink-0" />
            <p className="text-xs text-muted-foreground">
              <span className="font-medium text-purple-400">Visão Especializada:</span> Esta aba exibe apenas apostas com estratégia ValueBet. 
              As mesmas apostas também aparecem na aba "Todas Apostas".
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );

  // Render Apostas
  const renderApostas = () => (
    <div className="space-y-4">
      {/* Card de Histórico com Filtros Internos */}
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
              extraActions={
                <ExportMenu
                  getData={() => apostasFiltradas.map(a => transformApostaToExport({
                    ...a,
                    data_aposta: a.data_aposta,
                    estrategia: "VALUEBET",
                  }, "ValueBet"))}
                  abaOrigem="ValueBet"
                filename={`valuebets-${projetoId}-${format(new Date(), 'yyyy-MM-dd')}`}
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
            <Target className="h-4 w-4 text-purple-400" />
            {apostasSubTab === "abertas" ? "Operações Abertas" : "Histórico de Operações"}
          </CardTitle>
        </div>
      </CardHeader>
      <CardContent className="pt-0 space-y-3">
        {/* Filtros LOCAIS da aba (isolados de outras abas) */}
        <TabFiltersBar
          projetoId={projetoId}
          filters={tabFilters}
          showEstrategiaFilter={false}
          showResultadoFilter={true}
          className="pb-3 border-b border-border/50"
        />
      </CardContent>
    </Card>

      {apostasFiltradas.length === 0 ? (
        <Card>
          <CardContent className="text-center py-8 text-muted-foreground">
            <Target className="h-12 w-12 mx-auto mb-4 opacity-50" />
            <p>{apostasSubTab === "abertas" ? "Nenhuma aposta aberta" : "Nenhuma aposta no histórico"}</p>
          </CardContent>
        </Card>
      ) : viewMode === "cards" ? (
        <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
          {apostasFiltradas.map((aposta) => (
            <ApostaCard
              key={aposta.id}
               aposta={{
                 ...aposta,
                 evento: aposta.evento || '',
                 esporte: aposta.esporte || '',
                 pernas: aposta.pernas ?? undefined,
                 selecoes: Array.isArray(aposta.selecoes) ? aposta.selecoes : undefined,
                 moeda: aposta.moeda_operacao || "BRL",
                 primary_odd: (aposta as any)._sub_entries?.[0]?.odd ?? undefined,
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
               }}
               estrategia="VALUEBET"
               onEdit={(apostaId) => {
                 const a = apostasFiltradas.find(ap => ap.id === apostaId);
                 if (a) openEditDialog(a);
               }}
               onQuickResolve={handleQuickResolve}
               onDelete={handleDeleteAposta}
               variant="card"
               formatCurrency={formatCurrency}
               convertToConsolidation={convertToConsolidationOficialFn}
               moedaConsolidacao={moedaConsolidacaoVal}
            />
          ))}
        </div>
      ) : (
        <div className="space-y-2">
          {apostasFiltradas.map((aposta) => (
            <ApostaCard
              key={aposta.id}
               aposta={{
                 ...aposta,
                 evento: aposta.evento || '',
                 esporte: aposta.esporte || '',
                 pernas: aposta.pernas ?? undefined,
                 selecoes: Array.isArray(aposta.selecoes) ? aposta.selecoes : undefined,
                 moeda: aposta.moeda_operacao || "BRL",
                 primary_odd: (aposta as any)._sub_entries?.[0]?.odd ?? undefined,
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
               }}
               estrategia="VALUEBET"
               onEdit={(apostaId) => {
                 const a = apostasFiltradas.find(ap => ap.id === apostaId);
                 if (a) openEditDialog(a);
               }}
               onQuickResolve={handleQuickResolve}
               onDelete={handleDeleteAposta}
               variant="list"
               formatCurrency={formatCurrency}
               convertToConsolidation={convertToConsolidationOficialFn}
               moedaConsolidacao={moedaConsolidacaoVal}
            />
          ))}
        </div>
      )}
    </div>
  );

  // Render Por Casa - Padrão unificado com Duplo Green
  const renderPorCasa = () => (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Building2 className="h-5 w-5 text-purple-400" />
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
              Registre apostas para ver a análise por casa.
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
                <Card className={`cursor-default transition-colors hover:border-purple-500/30 ${casa.lucro >= 0 ? "border-emerald-500/20" : "border-red-500/20"}`}>
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
        {activeNavTab === "apostas" && renderApostas()}
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
        <Skeleton className="h-64" />
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
    </div>
  );
}
