import { useState, useEffect, useMemo, useCallback } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { calcularImpactoResultado } from "@/lib/bookmakerBalanceHelper";
import { reliquidarAposta } from "@/services/aposta/ApostaService";
import { useInvalidateBookmakerSaldos } from "@/hooks/useBookmakerSaldosQuery";
import { useBonusBalanceManager } from "@/hooks/useBonusBalanceManager";
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
// Removido: Dialogs agora abrem em janelas externas
// import { ApostaDialog } from "./ApostaDialog";
// import { SurebetDialog } from "./SurebetDialog";
import { ApostaPernasResumo, ApostaPernasInline, getModeloOperacao, Perna } from "./ApostaPernasResumo";
import { ApostaCard } from "./ApostaCard";
import { APOSTA_ESTRATEGIA } from "@/lib/apostaConstants";
import { StandardTimeFilter, StandardPeriodFilter, getDateRangeFromPeriod, DateRange as FilterDateRange } from "./StandardTimeFilter";
import { VisaoGeralCharts } from "./VisaoGeralCharts";
import { DuploGreenStatisticsCard } from "./DuploGreenStatisticsCard";

import { cn, getFirstLastName } from "@/lib/utils";
import { useOpenOperationsCount } from "@/hooks/useOpenOperationsCount";
import { useProjetoCurrency } from "@/hooks/useProjetoCurrency";
import { useBookmakerLogoMap } from "@/hooks/useBookmakerLogoMap";
import { OperationalFiltersBar } from "./OperationalFiltersBar";
import { OperationsSubTabHeader, type HistorySubTab } from "./operations";
import { ExportMenu, transformApostaToExport, transformSurebetToExport } from "./ExportMenu";
import { SaldoOperavelCard } from "./SaldoOperavelCard";

interface ProjetoDuploGreenTabProps {
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

export function ProjetoDuploGreenTab({ projetoId, onDataChange, refreshTrigger }: ProjetoDuploGreenTabProps) {
  const [apostas, setApostas] = useState<Aposta[]>([]);
  const [bookmakers, setBookmakers] = useState<Bookmaker[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [resultadoFilter, setResultadoFilter] = useState<string>("all");
  const [viewMode, setViewMode] = useState<"cards" | "list">("list");
  
  // Hook de formatação de moeda do projeto
  const { formatCurrency } = useProjetoCurrency(projetoId);
  
  // Hook global de logos de bookmakers (busca do catálogo)
  const { logoMap: catalogLogoMap } = useBookmakerLogoMap();
  // Estados removidos - dialogs agora abrem em janelas externas
  // const [dialogOpen, setDialogOpen] = useState(false);
  // const [surebetDialogOpen, setSurebetDialogOpen] = useState(false);
  // const [selectedAposta, setSelectedAposta] = useState<Aposta | null>(null);
  // const [selectedSurebet, setSelectedSurebet] = useState<any>(null);

  // Hook para invalidar cache de saldos
  const invalidateSaldos = useInvalidateBookmakerSaldos();
  
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

  const [navMode, setNavMode] = useState<NavigationMode>(() => {
    const saved = localStorage.getItem(NAV_STORAGE_KEY);
    return (saved === "tabs" ? "tabs" : "sidebar") as NavigationMode;
  });
  const [activeNavTab, setActiveNavTab] = useState<NavTabValue>("visao-geral");
  const [isTransitioning, setIsTransitioning] = useState(false);

  const [internalPeriod, setInternalPeriod] = useState<StandardPeriodFilter>("30dias");
  const [internalDateRange, setInternalDateRange] = useState<FilterDateRange | undefined>(undefined);

  const dateRange = useMemo(() => getDateRangeFromPeriod(internalPeriod, internalDateRange), [internalPeriod, internalDateRange]);

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

  useEffect(() => { fetchData(); }, [projetoId, internalPeriod, internalDateRange, refreshTrigger]);

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
      let query = supabase
        .from("apostas_unificada")
        .select(`id, data_aposta, esporte, evento, mercado, selecao, odd, stake, estrategia, status, resultado, lucro_prejuizo, valor_retorno, observacoes, bookmaker_id, modo_entrada, gerou_freebet, valor_freebet_gerada, tipo_freebet, forma_registro, contexto_operacional, lay_exchange, lay_odd, lay_stake, lay_liability, lay_comissao, back_em_exchange, back_comissao, pernas, stake_total, spread_calculado, roi_esperado, roi_real, lucro_esperado, modelo`)
        .eq("projeto_id", projetoId)
        .eq("estrategia", APOSTA_ESTRATEGIA.DUPLO_GREEN)
        .is("cancelled_at", null)
        .order("data_aposta", { ascending: false });
      
      if (dateRange) {
        query = query.gte("data_aposta", dateRange.start.toISOString());
        query = query.lte("data_aposta", dateRange.end.toISOString());
      }

      const { data, error } = await query;
      if (error) throw error;
      
      const bookmakerIds = [...new Set((data || []).map((a: any) => a.bookmaker_id).filter(Boolean))];
      let bookmakerMap = new Map<string, { nome: string; parceiroNome: string | null; logoUrl: string | null }>();
      if (bookmakerIds.length > 0) {
        const { data: bks } = await supabase
          .from("bookmakers")
          .select("id, nome, parceiro:parceiros(nome), bookmakers_catalogo(logo_url)")
          .in("id", bookmakerIds);

        bookmakerMap = new Map(
          (bks || []).map((b: any) => [
            b.id,
            { 
              nome: b.nome, 
              parceiroNome: b.parceiro?.nome ?? null,
              logoUrl: b.bookmakers_catalogo?.logo_url ?? null,
            },
          ])
        );
      }

      setApostas(
        (data || []).map((a: any) => {
          const bkInfo = a.bookmaker_id ? bookmakerMap.get(a.bookmaker_id) : null;
          return {
            ...a,
            bookmaker_nome: bkInfo?.nome ?? "Desconhecida",
            parceiro_nome: bkInfo?.parceiroNome ?? undefined,
            logo_url: bkInfo?.logoUrl ?? null,
            operador_nome: bkInfo?.parceiroNome ?? undefined,
          };
        })
      );
    } catch (error) {
      console.error("Erro ao carregar apostas Duplo Green:", error);
    }
  };

  // Resolução rápida de apostas simples - USA RPC ATÔMICA + ROLLOVER
  const handleQuickResolve = useCallback(async (apostaId: string, resultado: string) => {
    try {
      const aposta = apostas.find(a => a.id === apostaId);
      if (!aposta) return;

      // Só permitir para apostas simples (sem pernas multi)
      const hasPernas = Array.isArray(aposta.pernas) && aposta.pernas.length > 1;
      if (hasPernas) return;

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

      // 3. Atualizar estado local
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
    } catch (error: any) {
      console.error("Erro ao atualizar aposta:", error);
      toast.error("Erro ao atualizar resultado");
    }
  }, [apostas, onDataChange, projetoId, invalidateSaldos, hasActiveRolloverBonus, atualizarProgressoRollover]);

  const metricas = useMemo(() => {
    const total = apostas.length;

    // CORREÇÃO: para apostas multi-pernas (ARBITRAGEM), o volume fica em stake_total.
    // A estratégia define a contabilização; a forma_registro define apenas a estrutura.
    const getStakeVolume = (a: Aposta) => {
      const value =
        typeof a.stake_total === "number" ? a.stake_total : typeof a.stake === "number" ? a.stake : 0;
      return Number.isFinite(value) ? value : 0;
    };

    const totalStake = apostas.reduce((acc, a) => acc + getStakeVolume(a), 0);
    const lucroTotal = apostas.reduce((acc, a) => acc + (a.lucro_prejuizo || 0), 0);
    const pendentes = apostas.filter((a) => !a.resultado || a.resultado === "PENDENTE").length;
    const greens = apostas.filter((a) => a.resultado === "GREEN" || a.resultado === "MEIO_GREEN").length;
    const reds = apostas.filter((a) => a.resultado === "RED" || a.resultado === "MEIO_RED").length;
    const liquidadas = apostas.filter((a) => a.resultado && a.resultado !== "PENDENTE").length;
    const taxaAcerto = liquidadas > 0 ? (greens / liquidadas) * 100 : 0;
    const roi = totalStake > 0 ? (lucroTotal / totalStake) * 100 : 0;

    const porCasa: Record<string, { stake: number; lucro: number; count: number }> = {};
    apostas.forEach((a) => {
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
      porCasa[casa].stake += getStakeVolume(a);
      porCasa[casa].lucro += a.lucro_prejuizo || 0;
      porCasa[casa].count++;
    });

    return { total, totalStake, lucroTotal, pendentes, greens, reds, taxaAcerto, roi, porCasa };
  }, [apostas]);

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
    // Estrutura: casa → { total, vinculos: Map<vinculo, dados> }
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

    apostas.forEach((a) => {
      const pernas = Array.isArray(a.pernas) ? a.pernas : [];

      if (pernas.length > 0) {
        const lucroPorPernaFallback =
          a.status === "LIQUIDADA" ? Number(a.lucro_prejuizo || 0) / Math.max(pernas.length, 1) : 0;

        pernas.forEach((p: any) => {
          const nomeCompleto = p?.bookmaker_nome || "Desconhecida";
          const stake = Number(p?.stake || 0);
          const lucro = typeof p?.lucro_prejuizo === "number" ? p.lucro_prejuizo : lucroPorPernaFallback;
          processEntry(nomeCompleto, stake, lucro);
        });
        return;
      }

      // Aposta simples
      const nomeCompleto = a.bookmaker_nome || "Desconhecida";
      const stake = typeof a.stake_total === "number" ? a.stake_total : (a.stake || 0);
      processEntry(nomeCompleto, stake, a.lucro_prejuizo || 0);
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
  
  const apostasFiltradas = useMemo(() => apostasListaAtual.filter(a => {
    const matchesSearch = a.evento.toLowerCase().includes(searchTerm.toLowerCase()) || a.esporte.toLowerCase().includes(searchTerm.toLowerCase()) || a.selecao.toLowerCase().includes(searchTerm.toLowerCase());
    return matchesSearch && (resultadoFilter === "all" || a.resultado === resultadoFilter);
  }), [apostasListaAtual, searchTerm, resultadoFilter]);
  
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
    if (aposta.forma_registro === "ARBITRAGEM") {
      // Surebet/Arbitragem
      const url = `/janela/surebet/${aposta.id}?projetoId=${encodeURIComponent(projetoId)}&tab=duplogreen`;
      window.open(url, '_blank', 'width=1280,height=800,menubar=no,toolbar=no,location=no,status=no,resizable=yes,scrollbars=yes');
    } else {
      // Aposta simples
      const url = `/janela/aposta/${aposta.id}?projetoId=${encodeURIComponent(projetoId)}&tab=duplogreen&estrategia=DUPLO_GREEN`;
      window.open(url, '_blank', 'width=1280,height=800,menubar=no,toolbar=no,location=no,status=no,resizable=yes,scrollbars=yes');
    }
  }, [projetoId]);

  // Listener para sincronização com janelas externas via BroadcastChannel
  useEffect(() => {
    const channels: BroadcastChannel[] = [];
    
    try {
      const apostaChannel = new BroadcastChannel("aposta_channel");
      apostaChannel.onmessage = (event) => {
        if (event.data?.type === "APOSTA_SAVED" && event.data?.projetoId === projetoId) {
          fetchData();
          onDataChange?.();
        }
      };
      channels.push(apostaChannel);

      const surebetChannel = new BroadcastChannel("surebet_channel");
      surebetChannel.onmessage = (event) => {
        if (event.data?.type === "SUREBET_SAVED" && event.data?.projetoId === projetoId) {
          fetchData();
          onDataChange?.();
        }
      };
      channels.push(surebetChannel);
    } catch (err) {
      // Fallback para localStorage (navegadores sem BroadcastChannel)
      const handleStorage = (event: StorageEvent) => {
        if ((event.key === "aposta_saved" || event.key === "surebet_saved") && event.newValue) {
          try {
            const data = JSON.parse(event.newValue);
            if (data.projetoId === projetoId) {
              fetchData();
              onDataChange?.();
            }
          } catch (e) { /* ignore */ }
        }
      };
      window.addEventListener("storage", handleStorage);
      return () => window.removeEventListener("storage", handleStorage);
    }

    return () => {
      channels.forEach(ch => ch.close());
    };
  }, [projetoId, onDataChange]);
  const handleModeToggle = () => { setIsTransitioning(true); setTimeout(() => { setNavMode(p => p === "tabs" ? "sidebar" : "tabs"); setTimeout(() => setIsTransitioning(false), 50); }, 150); };
  const handleNavTabChange = (v: string) => { if (v !== activeNavTab) { setIsTransitioning(true); setActiveNavTab(v as NavTabValue); setTimeout(() => setIsTransitioning(false), 180); } };

  const modeToggle = (
    <Tooltip><TooltipTrigger asChild><Button variant="ghost" size="sm" onClick={handleModeToggle} className="h-8 w-8 p-0 text-muted-foreground/60 hover:text-foreground hover:bg-muted/50 transition-colors">{navMode === "tabs" ? <PanelLeft className="h-4 w-4" /> : <LayoutList className="h-4 w-4" />}</Button></TooltipTrigger><TooltipContent side="bottom" className="text-xs">{navMode === "tabs" ? "Modo Gestão" : "Modo Compacto"}</TooltipContent></Tooltip>
  );
  const periodFilterComponent = <StandardTimeFilter period={internalPeriod} onPeriodChange={setInternalPeriod} customDateRange={internalDateRange} onCustomDateRangeChange={setInternalDateRange} />;

  const renderVisaoGeral = () => (
    <div className="space-y-6">
      <div className="grid gap-4 md:grid-cols-5">
        <SaldoOperavelCard projetoId={projetoId} />
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Duplo Green</CardTitle>
            <Sparkles className="h-4 w-4 text-lime-400" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{metricas.total}</div>
            <p className="text-xs text-muted-foreground flex items-center gap-2">
              {metricas.pendentes > 0 && <span>{metricas.pendentes} Pendentes</span>}
              <span className="text-emerald-400">{metricas.greens}G</span>
              <span className="text-red-400">{metricas.reds}R</span>
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Volume</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatCurrency(metricas.totalStake)}</div>
            <p className="text-xs text-muted-foreground">Total investido</p>
          </CardContent>
        </Card>

        <Card className={metricas.lucroTotal >= 0 ? "border-emerald-500/20" : "border-red-500/20"}>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">{metricas.lucroTotal >= 0 ? 'Lucro' : 'Prejuízo'}</CardTitle>
            <TrendingUp className={`h-4 w-4 ${metricas.lucroTotal >= 0 ? 'text-emerald-400' : 'text-red-400'}`} />
          </CardHeader>
          <CardContent>
            <div className={`text-2xl font-bold ${metricas.lucroTotal >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
              {formatCurrency(metricas.lucroTotal)}
            </div>
            <p className="text-xs text-muted-foreground">Resultado liquidado</p>
          </CardContent>
        </Card>

        <Card className={metricas.roi >= 0 ? "border-emerald-500/20" : "border-red-500/20"}>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">ROI</CardTitle>
            <Percent className={`h-4 w-4 ${metricas.roi >= 0 ? 'text-emerald-400' : 'text-red-400'}`} />
          </CardHeader>
          <CardContent>
            <div className={`text-2xl font-bold ${metricas.roi >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
              {formatPercent(metricas.roi)}
            </div>
            <p className="text-xs text-muted-foreground">Retorno sobre investimento</p>
          </CardContent>
        </Card>
      </div>

      {metricas.total > 0 && (
        <VisaoGeralCharts apostas={apostas} accentColor="#84cc16" logoMap={logoMap} isSingleDayPeriod={internalPeriod === "1dia"} formatCurrency={formatCurrency} />
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
              As mesmas apostas também aparecem na aba "Apostas Livres".
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );

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
              openCount={apostasAbertas.length}
              historyCount={apostasHistorico.length}
              viewMode={viewMode}
              onViewModeChange={(mode) => setViewMode(mode)}
              showViewToggle={true}
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
                        pernas: a.pernas?.map(p => ({
                          bookmaker_nome: p.bookmaker_nome,
                          selecao: p.selecao,
                          odd: p.odd,
                          stake: p.stake,
                        })),
                      }, "DUPLO_GREEN");
                    }
                    return transformApostaToExport({
                      ...a,
                      estrategia: "DUPLO_GREEN",
                    }, "Duplo Green");
                  })}
                  abaOrigem="Duplo Green"
                  filename={`duplogreen-${projetoId}-${format(new Date(), 'yyyy-MM-dd')}`}
                  filtrosAplicados={{
                    periodo: internalPeriod,
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
          {/* Filtros Transversais (Período, Casa, Parceiro) */}
          <OperationalFiltersBar
            projetoId={projetoId}
            showEstrategiaFilter={false}
            preselectedEstrategia="DUPLO_GREEN"
            className="pb-3 border-b border-border/50"
          />
        </CardContent>
      </Card>

      {apostasFiltradas.length === 0 ? (
        <Card>
          <CardContent className="text-center py-8 text-muted-foreground">
            <Zap className="h-12 w-12 mx-auto mb-4 opacity-50" />
            <p>{apostasSubTab === "abertas" ? "Nenhuma aposta aberta" : "Nenhuma aposta no histórico"}</p>
          </CardContent>
        </Card>
      ) : viewMode === "cards" ? (
        <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
          {apostasFiltradas.map((aposta) => (
            <ApostaCard
              key={aposta.id}
              aposta={{
                ...aposta,
                pernas: aposta.pernas as Perna[],
              }}
              estrategia="DUPLO_GREEN"
              onClick={() => handleOpenAposta(aposta)}
              onQuickResolve={handleQuickResolve}
              variant="card"
              formatCurrency={formatCurrency}
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
                pernas: aposta.pernas as Perna[],
              }}
              estrategia="DUPLO_GREEN"
              onClick={() => handleOpenAposta(aposta)}
              onQuickResolve={handleQuickResolve}
              variant="list"
              formatCurrency={formatCurrency}
            />
          ))}
        </div>
      )}
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
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {casaDataSorted.map((casa) => {
            const logoUrl = getLogoUrl(casa.casa);
            return (
            <Tooltip key={casa.casa}>
              <TooltipTrigger asChild>
                <Card className={`cursor-default transition-colors hover:border-lime-500/30 ${casa.lucro >= 0 ? "border-emerald-500/20" : "border-red-500/20"}`}>
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
          )})}
        </div>
      )}
    </div>
  );

  const renderMainContent = () => {
    const contentClass = cn("transition-all duration-200 ease-out", isTransitioning ? "opacity-0 translate-y-2" : "opacity-100 translate-y-0");
    return <div className={cn("min-h-[400px]", contentClass)}>{activeNavTab === "visao-geral" && renderVisaoGeral()}{activeNavTab === "apostas" && renderApostas()}{activeNavTab === "por-casa" && renderPorCasa()}</div>;
  };

  if (loading) return <div className="space-y-4"><div className="grid gap-4 md:grid-cols-4">{[1, 2, 3, 4].map(i => <Skeleton key={i} className="h-24" />)}</div><Skeleton className="h-64" /></div>;

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
            <div className="flex items-center gap-4">{periodFilterComponent}{modeToggle}</div>
          </div>
          <TabsContent value={activeNavTab} className="mt-0">{renderMainContent()}</TabsContent>
        </Tabs>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-end">{periodFilterComponent}</div>
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
