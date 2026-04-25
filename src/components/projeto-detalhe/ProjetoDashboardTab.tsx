import { useState, useEffect, useMemo, useCallback } from "react";
import { useQuery, useQueryClient, keepPreviousData } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { fetchAllPaginated } from "@/lib/fetchAllPaginated";
import { fetchChunkedIn } from "@/lib/fetchChunkedIn";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useCrossWindowSync } from "@/hooks/useCrossWindowSync";
import { 
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { 
  Target, 
  BarChart3,
} from "lucide-react";
import { ModernBarChart } from "@/components/ui/modern-bar-chart";
import { useProjetoCurrency } from "@/hooks/useProjetoCurrency";
import { useBookmakerLogoMap } from "@/hooks/useBookmakerLogoMap";
import { VisaoGeralCharts } from "./VisaoGeralCharts";
import { fetchProjetoExtras, type ProjetoExtraEntry } from "@/services/fetchProjetoExtras";
import { useCalendarApostasRpc } from "@/hooks/useCalendarApostasRpc";
import { useCanonicalCalendarDaily, transformCanonicalDailyForCharts } from "@/hooks/useCanonicalCalendarDaily";
// fetchProjetosLucroOperacionalKpi removido — badge agora derivado do canonicalDaily
import { useCotacoes } from "@/hooks/useCotacoes";

import { PerformancePorCasaCard } from "./PerformancePorCasaCard";
import { StandardTimeFilter, StandardPeriodFilter, getDateRangeFromPeriod } from "./StandardTimeFilter";
import { PERIOD_STALE_TIME, PERIOD_GC_TIME } from "@/lib/query-cache-config";
import { DateRange } from "react-day-picker";
import { isSameDay, format } from "date-fns";
import { getOperationalDateRangeForQuery, extractLocalDateKey, extractCivilDateKey } from "@/utils/dateUtils";

interface ProjetoDashboardTabProps {
  projetoId: string;
}

interface ApostaUnificada {
  id: string;
  data_aposta: string;
  lucro_prejuizo: number | null;
  resultado: string | null;
  stake: number;
  stake_total: number | null;
  esporte: string;
  bookmaker_id: string;
  bookmaker_nome: string;
  parceiro_nome: string | null;
  instance_identifier: string | null;
  logo_url: string | null;
  forma_registro: string | null;
  estrategia?: string | null;
  pl_consolidado?: number | null;
  bonus_id?: string | null;
  // Multi-currency fields
  moeda_operacao?: string | null;
  stake_consolidado?: number | null;
  consolidation_currency?: string | null;
  valor_brl_referencia?: number | null;
  lucro_prejuizo_brl_referencia?: number | null;
  pernas?: {
    bookmaker_id?: string;
    bookmaker_nome?: string;
    parceiro_nome?: string | null;
    instance_identifier?: string | null;
    logo_url?: string | null;
    stake?: number;
    lucro_prejuizo?: number | null;
    resultado?: string | null;
  }[];
}

// ---------- Data Fetching Functions (extracted for useQuery) ----------

// Calendar apostas agora vem do hook compartilhado useCalendarApostas

async function fetchApostasFiltradas(
  projetoId: string, 
  dateRange: { start: Date; end: Date } | null
): Promise<ApostaUnificada[]> {
  let dateFilters: { startUTC?: string; endUTC?: string } = {};
  if (dateRange) {
    dateFilters = getOperationalDateRangeForQuery(dateRange.start, dateRange.end);
  }

  const data = await fetchAllPaginated(() => {
    let q = supabase
      .from("apostas_unificada")
      .select(`id, data_aposta, lucro_prejuizo, pl_consolidado, consolidation_currency, resultado, stake, stake_total, stake_consolidado, esporte, bookmaker_id, forma_registro, estrategia, bonus_id, moeda_operacao, valor_brl_referencia, lucro_prejuizo_brl_referencia`)
      .eq("projeto_id", projetoId)
      .eq("status", "LIQUIDADA")
      .is("cancelled_at", null)
      .order("data_aposta", { ascending: true });
    if (dateFilters.startUTC) q = q.gte("data_aposta", dateFilters.startUTC);
    if (dateFilters.endUTC) q = q.lte("data_aposta", dateFilters.endUTC);
    return q;
  });

  // Fetch pernas for all bets (including SIMPLES with multi-entry)
  const apostaIds = (data || []).map(a => a.id);
  let pernasMap: Record<string, any[]> = {};
  if (apostaIds.length > 0) {
    const pernasData = await fetchChunkedIn(
      (idsChunk) =>
        supabase
          .from("apostas_pernas")
          .select(`aposta_id, bookmaker_id, selecao, odd, stake, stake_brl_referencia, cotacao_snapshot, moeda, resultado, lucro_prejuizo, lucro_prejuizo_brl_referencia, gerou_freebet, valor_freebet_gerada, bookmakers (nome, instance_identifier, parceiro_id, parceiros (nome), bookmakers_catalogo (logo_url))`)
          .in("aposta_id", idsChunk)
          .order("ordem", { ascending: true }),
      apostaIds
    );
    
    (pernasData || []).forEach((p: any) => {
      if (!pernasMap[p.aposta_id]) pernasMap[p.aposta_id] = [];
      pernasMap[p.aposta_id].push({
        bookmaker_id: p.bookmaker_id,
        bookmaker_nome: p.bookmakers?.nome || 'Desconhecida',
        parceiro_nome: p.bookmakers?.parceiros?.nome || null,
        instance_identifier: p.bookmakers?.instance_identifier || null,
        logo_url: p.bookmakers?.bookmakers_catalogo?.logo_url || null,
        selecao: p.selecao, odd: p.odd, stake: p.stake, moeda: p.moeda,
        resultado: p.resultado, lucro_prejuizo: p.lucro_prejuizo,
        stake_brl_referencia: p.stake_brl_referencia,
        lucro_prejuizo_brl_referencia: p.lucro_prejuizo_brl_referencia,
        cotacao_snapshot: p.cotacao_snapshot,
        gerou_freebet: p.gerou_freebet, valor_freebet_gerada: p.valor_freebet_gerada,
      });
    });
  }

  // Fetch bookmaker info
  const bookmakerIdsFromApostas = (data || []).filter(a => a.bookmaker_id).map(a => a.bookmaker_id as string);
  let bookmakerMap: Record<string, { nome: string; parceiro_nome: string | null; logo_url: string | null; instance_identifier: string | null }> = {};
  if (bookmakerIdsFromApostas.length > 0) {
    const { data: bookmakers } = await supabase
      .from("bookmakers")
      .select("id, nome, instance_identifier, parceiros(nome), bookmakers_catalogo(logo_url)")
      .in("id", bookmakerIdsFromApostas);
    bookmakerMap = (bookmakers || []).reduce((acc: any, bk: any) => {
      acc[bk.id] = { nome: bk.nome, parceiro_nome: bk.parceiros?.nome || null, logo_url: bk.bookmakers_catalogo?.logo_url || null, instance_identifier: bk.instance_identifier || null };
      return acc;
    }, {});
  }

  return (data || []).map((item: any) => {
    const bkInfo = bookmakerMap[item.bookmaker_id] || { nome: 'Desconhecida', parceiro_nome: null, logo_url: null, instance_identifier: null };
    return {
      id: item.id, data_aposta: item.data_aposta,
      lucro_prejuizo: item.lucro_prejuizo, pl_consolidado: item.pl_consolidado,
      consolidation_currency: item.consolidation_currency,
      resultado: item.resultado, stake: item.stake || 0, stake_total: item.stake_total,
      esporte: item.esporte || item.estrategia || 'N/A',
      bookmaker_id: item.bookmaker_id || 'unknown',
      bookmaker_nome: bkInfo.nome, parceiro_nome: bkInfo.parceiro_nome, logo_url: bkInfo.logo_url,
      instance_identifier: bkInfo.instance_identifier,
      forma_registro: item.forma_registro, estrategia: item.estrategia, bonus_id: item.bonus_id,
      moeda_operacao: item.moeda_operacao,
      stake_consolidado: item.stake_consolidado,
      valor_brl_referencia: item.valor_brl_referencia,
      lucro_prejuizo_brl_referencia: item.lucro_prejuizo_brl_referencia,
      // Inclui pernas para ARBITRAGEM e também para SIMPLES multi-entry (>=2 pernas)
      pernas: (() => {
        const pernas = pernasMap[item.id] || [];
        if (item.forma_registro === 'ARBITRAGEM') return pernas;
        return pernas.length >= 2 ? pernas : undefined;
      })(),
    };
  });
}

// CANÔNICO: Usa o serviço centralizado de extras (fetchProjetoExtras)
// Toda lógica de quais módulos contribuem ao lucro está em src/services/fetchProjetoExtras.ts

// Cache key helpers
const STALE_TIME = PERIOD_STALE_TIME;
const GC_TIME = PERIOD_GC_TIME;

export function ProjetoDashboardTab({ projetoId }: ProjetoDashboardTabProps) {
  const [selectedEsporte, setSelectedEsporte] = useState<string>("");
  
  // Filtros de período
  const [period, setPeriod] = useState<StandardPeriodFilter>("mes_atual");
  const [customDateRange, setCustomDateRange] = useState<DateRange | undefined>(undefined);
  
  // Hook de formatação de moeda do projeto
  const { formatCurrency, formatChartAxis, convertToConsolidation, convertToConsolidationOficial, moedaConsolidacao, cotacaoOficialUSD } = useProjetoCurrency(projetoId);
  const { cotacaoEUR, cotacaoGBP, cotacaoMYR, cotacaoMXN, cotacaoARS, cotacaoCOP } = useCotacoes();
  
  // Hook global de logos
  const { logoMap: catalogLogoMap, getLogoUrl: getCatalogLogoUrl } = useBookmakerLogoMap();
  
  // Calcula o range de datas
  const dateRange = useMemo(() => {
    return getDateRangeFromPeriod(period, customDateRange);
  }, [period, customDateRange]);

  // Serialized date range for stable query keys
  const dateRangeKey = useMemo(() => {
    if (!dateRange) return 'all';
    return `${dateRange.start.toISOString()}_${dateRange.end.toISOString()}`;
  }, [dateRange]);

  // ---- Canonical Calendar Daily: mesma lógica do badge (Lucro Operacional completo) ----
  const { daily: canonicalDaily } = useCanonicalCalendarDaily({
    projetoId,
    // KPIs operacionais da Visão Geral devem usar Cotação de Trabalho
    // para eliminar variação cambial entre header, gráfico e calendário.
    convertToConsolidation,
  });

  // ---- useCalendarApostasRpc: ainda usado para contagens (greens/reds/operações) ----
  const cotacoesCalendario = useMemo(() => ({
    EUR: cotacaoEUR,
    GBP: cotacaoGBP,
    MYR: cotacaoMYR,
    MXN: cotacaoMXN,
    ARS: cotacaoARS,
    COP: cotacaoCOP,
  }), [cotacaoEUR, cotacaoGBP, cotacaoMYR, cotacaoMXN, cotacaoARS, cotacaoCOP]);

  const { daily: calendarDaily, resumo: calendarResumo } = useCalendarApostasRpc({
    projetoId,
    cotacaoUSD: cotacaoOficialUSD,
    cotacoes: cotacoesCalendario,
  });

  // ---- Mesclar: lucro canônico + contagens da RPC de apostas ----
  const mergedCalendarData = useMemo(() => {
    // Criar mapa de operações por dia a partir do calendarDaily (RPC apostas)
    const qtdMap = new Map<string, number>();
    calendarDaily.forEach(d => qtdMap.set(d.dia, d.qtd));

    // Usar canonical daily para lucro, mas enriquecer com qtd do calendarDaily
    return canonicalDaily.map(d => ({
      data_aposta: d.dia,
      lucro_prejuizo: d.lucro,
      stake: 0,
      stake_total: null as number | null,
      bookmaker_nome: '',
      parceiro_nome: null as string | null,
      bookmaker_id: null as string | null,
      pl_consolidado: d.lucro,
      moeda_operacao: null as string | null,
      stake_consolidado: null as number | null,
      lucro_prejuizo_brl_referencia: null as number | null,
      valor_brl_referencia: null as number | null,
      operacoes: qtdMap.get(d.dia) ?? 0,
    }));
  }, [canonicalDaily, calendarDaily]);


  const { 
    data: apostasUnificadas = [], 
    isLoading: isLoadingApostas,
    isFetching: isFetchingApostas,
    isPlaceholderData: isStaleApostas,
  } = useQuery({
    queryKey: ["projeto-dashboard-apostas", projetoId, dateRangeKey],
    queryFn: () => fetchApostasFiltradas(projetoId, dateRange),
    staleTime: STALE_TIME,
    gcTime: GC_TIME,
    placeholderData: keepPreviousData, // Keep previous data visible while fetching new period
  });

  // ---- useQuery: Extras lucro ----
  const { data: extrasLucro = [] } = useQuery({
    queryKey: ["projeto-dashboard-extras", projetoId],
    queryFn: () => fetchProjetoExtras(projetoId),
    staleTime: STALE_TIME,
    gcTime: GC_TIME,
  });

  // ---- Badge do gráfico: derivado da MESMA fonte (canonicalDaily) que alimenta o chart ----
  // CORREÇÃO: Antes usava uma RPC separada (get_projetos_lucro_operacional) que divergia
  // do motor client-side. Agora usa a soma dos dados diários canônicos, garantindo
  // que badge = soma dos pontos do gráfico = paridade absoluta.
  const lucroKpiData = useMemo(() => {
    if (!canonicalDaily.length) return null;
    // Filtrar pelo período selecionado
    if (dateRange) {
      const startStr = format(dateRange.start, 'yyyy-MM-dd');
      const endStr = format(dateRange.end, 'yyyy-MM-dd');
      return canonicalDaily
        .filter(d => d.dia >= startStr && d.dia <= endStr)
        .reduce((sum, d) => sum + d.lucro, 0);
    }
    return canonicalDaily.reduce((sum, d) => sum + d.lucro, 0);
  }, [canonicalDaily, dateRange]);

  const loading = isLoadingApostas; // Only true on first load (no cached data)
  const isTransitioning = isFetchingApostas && !isLoadingApostas; // Fetching new period but showing previous data

  // CRÍTICO: Listener para BroadcastChannel - sincroniza quando apostas são atualizadas em outras janelas
  const queryClient = useQueryClient();
  
  const handleBetUpdate = useCallback(() => {
    // Invalidate all dashboard queries for this project
    queryClient.invalidateQueries({ queryKey: ["projeto-dashboard-apostas", projetoId] });
    queryClient.invalidateQueries({ queryKey: ["projeto-dashboard-calendario", projetoId] });
    queryClient.invalidateQueries({ queryKey: ["projeto-dashboard-extras", projetoId] });
    queryClient.invalidateQueries({ queryKey: ["projeto-resultado", projetoId] });
    queryClient.invalidateQueries({ queryKey: ["bookmaker-saldos"] });
    // CRÍTICO: Invalidar calendário RPC e canônico
    queryClient.invalidateQueries({ queryKey: ["calendar-apostas-rpc", projetoId] });
    queryClient.invalidateQueries({ queryKey: ["canonical-calendar-daily", projetoId] });
    queryClient.invalidateQueries({ queryKey: ["projeto-lucro-kpi-canonical", projetoId] });
  }, [queryClient, projetoId]);

  // Hook centralizado para sincronização cross-window
  useCrossWindowSync({
    projetoId,
    onSync: handleBetUpdate,
  });


  // Detecta se é um único dia para ajustar gráficos
  const isSingleDayPeriod = useMemo(() => {
    if (!dateRange) return false;
    return isSameDay(dateRange.start, dateRange.end);
  }, [dateRange]);

  // Aggregate by sport
  const esportesData = useMemo(() => {
    const esportesMap = apostasUnificadas.reduce((acc: Record<string, { 
      greens: number; 
      reds: number; 
      meioGreens: number;
      meioReds: number;
      lucro: number;
    }>, aposta) => {
      if (!acc[aposta.esporte]) {
        acc[aposta.esporte] = { greens: 0, reds: 0, meioGreens: 0, meioReds: 0, lucro: 0 };
      }
      if (aposta.resultado === "GREEN") acc[aposta.esporte].greens++;
      if (aposta.resultado === "RED") acc[aposta.esporte].reds++;
      if (aposta.resultado === "MEIO_GREEN") acc[aposta.esporte].meioGreens++;
      if (aposta.resultado === "MEIO_RED") acc[aposta.esporte].meioReds++;
      // CRÍTICO: Converter para moeda de consolidação do projeto
      const moedaOp = aposta.moeda_operacao || 'BRL';
      const rawLucro = aposta.lucro_prejuizo || 0;
      let lucroConsolidado = rawLucro;
      // CRÍTICO: Só usar pl_consolidado se consolidation_currency bate com moeda do projeto
      if (aposta.pl_consolidado != null && aposta.consolidation_currency === moedaConsolidacao) {
        lucroConsolidado = aposta.pl_consolidado;
      } else if (moedaOp !== moedaConsolidacao) {
        lucroConsolidado = convertToConsolidationOficial(rawLucro, moedaOp);
      }
      acc[aposta.esporte].lucro += lucroConsolidado;
      return acc;
    }, {});

    const data = Object.entries(esportesMap).map(([esporte, sportData]) => {
      const totalApostas = sportData.greens + sportData.reds + sportData.meioGreens + sportData.meioReds;
      return {
        esporte,
        greens: sportData.greens,
        reds: sportData.reds,
        meioGreens: sportData.meioGreens,
        meioReds: sportData.meioReds,
        lucro: sportData.lucro,
        totalApostas,
      };
    });
    return data.sort((a, b) => b.totalApostas - a.totalApostas);
  }, [apostasUnificadas]);

  useEffect(() => {
    if (esportesData.length > 0 && !selectedEsporte) {
      setSelectedEsporte(esportesData[0].esporte);
    }
  }, [esportesData, selectedEsporte]);

  useEffect(() => {
    if (selectedEsporte && esportesData.length > 0) {
      const stillExists = esportesData.some(e => e.esporte === selectedEsporte);
      if (!stillExists) {
        setSelectedEsporte(esportesData[0].esporte);
      }
    }
  }, [esportesData, selectedEsporte]);

  const filteredEsportesData = useMemo(() => {
    return esportesData.filter(e => e.esporte === selectedEsporte);
  }, [esportesData, selectedEsporte]);

  // Preparar dados para VisaoGeralCharts
  // CRÍTICO: stake e lucro já estão consolidados na moeda do projeto (feito em fetchApostasFiltradas)
  const apostasParaGraficos = useMemo(() => {
    return apostasUnificadas.map(a => ({
      data_aposta: a.data_aposta,
      lucro_prejuizo: a.lucro_prejuizo,
      resultado: a.resultado,
      stake: a.stake,
      stake_total: a.stake_total,
      bookmaker_nome: a.bookmaker_nome,
      parceiro_nome: a.parceiro_nome,
      instance_identifier: a.instance_identifier,
      bookmaker_id: a.bookmaker_id,
      pernas: a.pernas,
      forma_registro: a.forma_registro ?? undefined,
      moeda_operacao: a.moeda_operacao,
      stake_consolidado: a.stake_consolidado,
      pl_consolidado: a.pl_consolidado,
      consolidation_currency: a.consolidation_currency,
      valor_brl_referencia: a.valor_brl_referencia,
      lucro_prejuizo_brl_referencia: a.lucro_prejuizo_brl_referencia,
    }));
  }, [apostasUnificadas]);

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-full" />
        <div className="grid gap-4 md:grid-cols-4">
          {[1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-24" />
          ))}
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          {[1, 2].map((i) => (
            <Skeleton key={i} className="h-64" />
          ))}
        </div>
      </div>
    );
  }

  // Distinguir entre "projeto sem apostas" e "filtro sem resultados"
  const hasAnyBetsInProject = calendarDaily.length > 0 || (calendarResumo?.total_apostas ?? 0) > 0;

  if (!hasAnyBetsInProject && apostasUnificadas.length === 0) {
    return (
      <div className="space-y-4">
        <Card>
          <CardContent className="pt-6">
            <div className="text-center py-10">
              <Target className="mx-auto h-12 w-12 text-muted-foreground/50" />
              <h3 className="mt-4 text-lg font-semibold">Nenhuma aposta registrada</h3>
              <p className="text-muted-foreground">
                Vá para a aba "Apostas" para registrar suas operações
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-w-0 space-y-4">
      {/* Filtro de período */}
      <StandardTimeFilter
        period={period}
        onPeriodChange={setPeriod}
        customDateRange={customDateRange}
        onCustomDateRangeChange={setCustomDateRange}
        projetoId={projetoId}
      />

      {/* Conteúdo com transição suave ao trocar filtro */}
      <div 
        className="min-w-0 space-y-4 transition-opacity duration-300 ease-in-out" 
        style={{ opacity: isTransitioning ? 0.5 : 1 }}
      >

      <VisaoGeralCharts 
        apostas={apostasParaGraficos}
        apostasCalendario={mergedCalendarData}
        extrasLucro={extrasLucro}
        accentColor="hsl(var(--primary))"
        logoMap={catalogLogoMap}
        showCalendar={true}
        showEvolucaoChart={true}
        showCasasCard={true}
        isSingleDayPeriod={isSingleDayPeriod}
        periodStart={dateRange?.start}
        periodEnd={dateRange?.end}
        formatCurrency={formatCurrency}
        formatChartAxis={formatChartAxis}
        showScopeToggle={false}
        convertToConsolidation={convertToConsolidation}
        moedaConsolidacao={moedaConsolidacao}
        lucroOperacionalKpi={lucroKpiData ?? undefined}
      />

      {/* Performance por Casa - Componente com visões alternáveis */}
      <PerformancePorCasaCard
        apostasUnificadas={apostasUnificadas}
        extrasLucro={extrasLucro}
        formatCurrency={formatCurrency}
        getLogoUrl={getCatalogLogoUrl}
        moedaConsolidacao={moedaConsolidacao}
        convertToConsolidation={convertToConsolidation}
      />

      {/* Performance por Esporte */}
      <Card className="overflow-hidden">
        <CardHeader className="flex flex-col gap-3 space-y-0 p-4 pb-2 sm:flex-row sm:items-center sm:justify-between sm:p-6 sm:pb-2">
          <CardTitle className="flex items-center gap-2 text-base sm:text-lg">
            <BarChart3 className="h-5 w-5" />
            Performance por Esporte
          </CardTitle>
          {esportesData.length > 0 && (
            <Select value={selectedEsporte} onValueChange={setSelectedEsporte}>
              <SelectTrigger className="h-8 w-full text-sm sm:w-[180px]">
                <SelectValue placeholder="Selecione" />
              </SelectTrigger>
              <SelectContent>
                {esportesData.map(esporte => (
                  <SelectItem key={esporte.esporte} value={esporte.esporte}>
                    {esporte.esporte} ({esporte.totalApostas})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </CardHeader>
        <CardContent className="overflow-hidden p-2 pt-0 sm:p-6 sm:pt-0">
          <ModernBarChart
            data={filteredEsportesData}
            categoryKey="esporte"
            bars={[
              { 
                dataKey: "greens", 
                label: "Greens", 
                gradientStart: "#22C55E", 
                gradientEnd: "#16A34A" 
              },
              { 
                dataKey: "meioGreens", 
                label: "Meio Green", 
                gradientStart: "#4ADE80", 
                gradientEnd: "#22C55E" 
              },
              { 
                dataKey: "reds", 
                label: "Reds", 
                gradientStart: "#EF4444", 
                gradientEnd: "#DC2626" 
              },
              { 
                dataKey: "meioReds", 
                label: "Meio Red", 
                gradientStart: "#F87171", 
                gradientEnd: "#EF4444" 
              },
            ]}
            height={220}
            barSize={14}
            showLabels={false}
            showLegend={true}
            customTooltipContent={(payload, label) => {
              const data = payload[0]?.payload;
              if (!data) return null;
              const totalApostas = data.greens + data.reds + data.meioGreens + data.meioReds;
              const totalWins = data.greens + (data.meioGreens * 0.5);
              const winRate = totalApostas > 0 ? ((totalWins / totalApostas) * 100).toFixed(1) : "0";
              return (
                <>
                  <p className="font-medium text-sm mb-3 text-foreground">{label}</p>
                  <div className="space-y-2">
                    <div className="flex items-center justify-between gap-4">
                      <div className="flex items-center gap-2">
                        <div className="w-2.5 h-2.5 rounded-full bg-gradient-to-b from-[#22C55E] to-[#16A34A]" />
                        <span className="text-xs text-muted-foreground">Greens</span>
                      </div>
                      <span className="text-sm font-semibold font-mono">{data.greens}</span>
                    </div>
                    {data.meioGreens > 0 && (
                      <div className="flex items-center justify-between gap-4">
                        <div className="flex items-center gap-2">
                          <div className="w-2.5 h-2.5 rounded-full bg-gradient-to-b from-[#4ADE80] to-[#22C55E]" />
                          <span className="text-xs text-muted-foreground">Meio Green</span>
                        </div>
                        <span className="text-sm font-semibold font-mono">{data.meioGreens}</span>
                      </div>
                    )}
                    <div className="flex items-center justify-between gap-4">
                      <div className="flex items-center gap-2">
                        <div className="w-2.5 h-2.5 rounded-full bg-gradient-to-b from-[#EF4444] to-[#DC2626]" />
                        <span className="text-xs text-muted-foreground">Reds</span>
                      </div>
                      <span className="text-sm font-semibold font-mono">{data.reds}</span>
                    </div>
                    {data.meioReds > 0 && (
                      <div className="flex items-center justify-between gap-4">
                        <div className="flex items-center gap-2">
                          <div className="w-2.5 h-2.5 rounded-full bg-gradient-to-b from-[#F87171] to-[#EF4444]" />
                          <span className="text-xs text-muted-foreground">Meio Red</span>
                        </div>
                        <span className="text-sm font-semibold font-mono">{data.meioReds}</span>
                      </div>
                    )}
                    <div className="border-t border-border/50 pt-2 mt-2 space-y-1.5">
                      <div className="flex items-center justify-between">
                        <span className="text-xs text-muted-foreground">Total Apostas</span>
                        <span className="text-sm font-mono">{totalApostas}</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-xs text-muted-foreground">Lucro/Prejuízo</span>
                        <span className={`text-sm font-mono font-semibold ${data.lucro >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                          {formatCurrency(data.lucro)}
                        </span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-xs text-muted-foreground">Win Rate</span>
                        <span className="text-sm font-mono">{winRate}%</span>
                      </div>
                    </div>
                  </div>
                </>
              );
            }}
          />
        </CardContent>
      </Card>
      </div>
    </div>
  );
}
