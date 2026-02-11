import { useState, useEffect, useMemo, useCallback } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
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
import { VisaoGeralCharts, ExtraLucroEntry } from "./VisaoGeralCharts";
import { PerformancePorCasaCard } from "./PerformancePorCasaCard";
import { StandardTimeFilter, StandardPeriodFilter, getDateRangeFromPeriod } from "./StandardTimeFilter";
import { DateRange } from "react-day-picker";
import { isSameDay } from "date-fns";
import { getOperationalDateRangeForQuery } from "@/utils/dateUtils";

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
  logo_url: string | null;
  forma_registro: string | null;
  estrategia?: string | null;
  pl_consolidado?: number | null;
  bonus_id?: string | null;
  pernas?: {
    bookmaker_id?: string;
    bookmaker_nome?: string;
    parceiro_nome?: string | null;
    logo_url?: string | null;
    stake?: number;
    lucro_prejuizo?: number | null;
    resultado?: string | null;
  }[];
}

export function ProjetoDashboardTab({ projetoId }: ProjetoDashboardTabProps) {
  const [apostasUnificadas, setApostasUnificadas] = useState<ApostaUnificada[]>([]);
  // DESACOPLAMENTO CALENDÁRIO: Dados separados para o calendário (sem filtro de período)
  const [apostasCalendario, setApostasCalendario] = useState<ApostaUnificada[]>([]);
  const [extrasLucro, setExtrasLucro] = useState<ExtraLucroEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedEsporte, setSelectedEsporte] = useState<string>("");
  
  // Filtros de período
  const [period, setPeriod] = useState<StandardPeriodFilter>("mes_atual");
  const [customDateRange, setCustomDateRange] = useState<DateRange | undefined>(undefined);
  
  // Hook de formatação de moeda do projeto
  const { formatCurrency, formatChartAxis } = useProjetoCurrency(projetoId);
  
  // Hook global de logos
  const { logoMap: catalogLogoMap, getLogoUrl: getCatalogLogoUrl } = useBookmakerLogoMap();
  
  // Calcula o range de datas
  const dateRange = useMemo(() => {
    return getDateRangeFromPeriod(period, customDateRange);
  }, [period, customDateRange]);

  // Busca apostas para o calendário (SEM filtro de período) - apenas quando projetoId muda
  useEffect(() => {
    fetchApostasCalendario();
  }, [projetoId]);

  // Busca apostas filtradas quando filtros mudam
  useEffect(() => {
    fetchAllData();
  }, [projetoId, dateRange]);

  // CRÍTICO: Listener para BroadcastChannel - sincroniza quando apostas são atualizadas em outras janelas
  const queryClient = useQueryClient();
  
  const handleBetUpdate = useCallback(() => {
    fetchAllData();
    fetchApostasCalendario(); // DESACOPLAMENTO: Também atualiza calendário
    queryClient.invalidateQueries({ queryKey: ["projeto-resultado", projetoId] });
    queryClient.invalidateQueries({ queryKey: ["bookmaker-saldos"] });
  }, [queryClient, projetoId]);

  // Hook centralizado para sincronização cross-window
  useCrossWindowSync({
    projetoId,
    onSync: handleBetUpdate,
  });

  // Busca todos os dados: apostas + cashback + giros grátis + eventos promocionais
  const fetchAllData = async () => {
    try {
      setLoading(true);
      await Promise.all([
        fetchAllApostas(),
        fetchExtrasLucro(),
      ]);
    } finally {
      setLoading(false);
    }
  };

  /**
   * DESACOPLAMENTO CALENDÁRIO-FILTROS:
   * Busca apostas SEM filtro de data para alimentar o calendário.
   * O calendário é um componente VISUAL que deve mostrar dados independentemente
   * dos filtros analíticos aplicados nos KPIs/gráficos.
   */
  const fetchApostasCalendario = async () => {
    try {
      // Busca simplificada apenas para o calendário (sem enriquecimento completo)
      const { data, error } = await supabase
        .from("apostas_unificada")
        .select(`
          id, 
          data_aposta, 
          lucro_prejuizo, 
          pl_consolidado,
          resultado,
          stake,
          stake_total,
          bookmaker_id
        `)
        .eq("projeto_id", projetoId)
        .eq("status", "LIQUIDADA")
        .is("cancelled_at", null)
        .order("data_aposta", { ascending: true });

      if (error) throw error;

      // Transformação simplificada para o calendário
      const apostasCalendarioData: ApostaUnificada[] = (data || []).map((item: any) => ({
        id: item.id,
        data_aposta: item.data_aposta,
        lucro_prejuizo: item.pl_consolidado ?? item.lucro_prejuizo,
        pl_consolidado: item.pl_consolidado,
        resultado: item.resultado,
        stake: item.stake || 0,
        stake_total: item.stake_total,
        esporte: 'N/A',
        bookmaker_id: item.bookmaker_id || 'unknown',
        bookmaker_nome: '',
        parceiro_nome: null,
        logo_url: null,
        forma_registro: null,
        estrategia: null,
        bonus_id: null,
        pernas: undefined,
      }));

      setApostasCalendario(apostasCalendarioData);
    } catch (error) {
      console.error("[Calendário] Erro ao carregar apostas:", error);
    }
  };

  // Busca cashback, giros grátis e eventos promocionais
  const fetchExtrasLucro = async () => {
    try {
      const extras: ExtraLucroEntry[] = [];

      // 1. Buscar cashback manual
      const { data: cashback } = await supabase
        .from("cashback_manual")
        .select("data_credito, valor")
        .eq("projeto_id", projetoId);

      cashback?.forEach(cb => {
        if (cb.valor && cb.valor > 0) {
          extras.push({
            data: cb.data_credito,
            valor: cb.valor,
            tipo: 'cashback',
          });
        }
      });

      // 2. Buscar giros grátis confirmados
      const { data: girosGratis } = await supabase
        .from("giros_gratis" as any)
        .select("data_registro, valor_retorno")
        .eq("projeto_id", projetoId)
        .eq("status", "confirmado")
        .not("valor_retorno", "is", null);

      (girosGratis as any[])?.forEach((gg: any) => {
        if (gg.valor_retorno && gg.valor_retorno > 0 && gg.data_registro) {
          extras.push({
            data: gg.data_registro,
            valor: gg.valor_retorno,
            tipo: 'giro_gratis',
          });
        }
      });

      // 3. Buscar eventos promocionais do cash_ledger (freebets convertidas, bônus creditados)
      const { data: eventos } = await supabase
        .from("cash_ledger")
        .select("data_transacao, valor, tipo_transacao, evento_promocional_tipo, destino_bookmaker_id")
        .eq("status", "CONFIRMADO")
        .in("tipo_transacao", ["FREEBET_CONVERTIDA", "BONUS_CREDITADO", "CREDITO_PROMOCIONAL", "GIRO_GRATIS_GANHO"]);

      // Filtrar por bookmakers do projeto
      const { data: projectBookmakers } = await supabase
        .from("bookmakers")
        .select("id")
        .eq("projeto_id", projetoId);

      const projectBookmakerIds = new Set(projectBookmakers?.map(b => b.id) || []);

      eventos?.forEach(ev => {
        // Só incluir se o destino é um bookmaker do projeto
        if (ev.destino_bookmaker_id && projectBookmakerIds.has(ev.destino_bookmaker_id)) {
          const valor = ev.valor || 0;
          if (valor > 0) {
            let tipo: ExtraLucroEntry['tipo'] = 'promocional';
            if (ev.tipo_transacao === 'FREEBET_CONVERTIDA') tipo = 'freebet';
            else if (ev.tipo_transacao === 'BONUS_CREDITADO') tipo = 'bonus';
            else if (ev.tipo_transacao === 'GIRO_GRATIS_GANHO') tipo = 'giro_gratis';

            extras.push({
              data: ev.data_transacao,
              valor,
              tipo,
            });
          }
        }
      });

      setExtrasLucro(extras);
    } catch (error) {
      console.error("Erro ao carregar extras de lucro:", error);
    }
  };

  const fetchAllApostas = async () => {
    try {
      setLoading(true);
      
      // Busca apostas com filtro de período (SEM o campo pernas JSONB)
      let query = supabase
        .from("apostas_unificada")
        .select(`
          id, 
          data_aposta, 
          lucro_prejuizo, 
          pl_consolidado,
          resultado, 
          stake,
          stake_total,
          esporte,
          bookmaker_id,
          forma_registro,
          estrategia,
          bonus_id
        `)
        .eq("projeto_id", projetoId)
        .eq("status", "LIQUIDADA") // CRÍTICO: Só contabilizar apostas liquidadas
        .is("cancelled_at", null)
        .order("data_aposta", { ascending: true });

      // Aplica filtro de data se existir
      // CRÍTICO: Usar getOperationalDateRangeForQuery para garantir timezone operacional (São Paulo)
      if (dateRange) {
        const { startUTC, endUTC } = getOperationalDateRangeForQuery(dateRange.start, dateRange.end);
        query = query
          .gte("data_aposta", startUTC)
          .lte("data_aposta", endUTC);
      }

      const { data, error } = await query;
      if (error) throw error;
      
      // Buscar pernas da tabela normalizada para apostas de arbitragem
      const apostaIds = (data || [])
        .filter(a => a.forma_registro === 'ARBITRAGEM')
        .map(a => a.id);
      
      let pernasMap: Record<string, any[]> = {};
      if (apostaIds.length > 0) {
        const { data: pernasData } = await supabase
          .from("apostas_pernas")
          .select(`
            aposta_id,
            bookmaker_id,
            selecao,
            odd,
            stake,
            moeda,
            resultado,
            lucro_prejuizo,
            gerou_freebet,
            valor_freebet_gerada,
            bookmakers (
              nome,
              parceiro_id,
              parceiros (nome),
              bookmakers_catalogo (logo_url)
            )
          `)
          .in("aposta_id", apostaIds)
          .order("ordem", { ascending: true });
        
        // Agrupar pernas por aposta_id
        (pernasData || []).forEach((p: any) => {
          if (!pernasMap[p.aposta_id]) {
            pernasMap[p.aposta_id] = [];
          }
          pernasMap[p.aposta_id].push({
            bookmaker_id: p.bookmaker_id,
            bookmaker_nome: p.bookmakers?.nome || 'Desconhecida',
            parceiro_nome: p.bookmakers?.parceiros?.nome || null,
            logo_url: p.bookmakers?.bookmakers_catalogo?.logo_url || null,
            selecao: p.selecao,
            odd: p.odd,
            stake: p.stake,
            moeda: p.moeda,
            resultado: p.resultado,
            lucro_prejuizo: p.lucro_prejuizo,
            gerou_freebet: p.gerou_freebet,
            valor_freebet_gerada: p.valor_freebet_gerada,
          });
        });
      }
      
      // Buscar bookmaker info para apostas simples
      const bookmakerIdsFromApostas = (data || [])
        .filter(a => a.bookmaker_id)
        .map(a => a.bookmaker_id as string);
      
      let bookmakerMap: Record<string, { nome: string; parceiro_nome: string | null; logo_url: string | null }> = {};
      
      if (bookmakerIdsFromApostas.length > 0) {
        const { data: bookmakers } = await supabase
          .from("bookmakers")
          .select("id, nome, parceiros(nome), bookmakers_catalogo(logo_url)")
          .in("id", bookmakerIdsFromApostas);
        
        bookmakerMap = (bookmakers || []).reduce((acc: any, bk: any) => {
          acc[bk.id] = {
            nome: bk.nome,
            parceiro_nome: bk.parceiros?.nome || null,
            logo_url: bk.bookmakers_catalogo?.logo_url || null
          };
          return acc;
        }, {});
      }
      
      // Transform para formato unificado
      const apostasTransformadas: ApostaUnificada[] = (data || []).map((item: any) => {
        const bkInfo = bookmakerMap[item.bookmaker_id] || { nome: 'Desconhecida', parceiro_nome: null, logo_url: null };
        const stake = item.forma_registro === 'ARBITRAGEM' ? item.stake_total : item.stake;
        
        // Pernas da tabela normalizada (já enriquecidas com dados do bookmaker)
        const pernasEnriquecidas = item.forma_registro === 'ARBITRAGEM' 
          ? pernasMap[item.id] || []
          : undefined;
        
        return {
          id: item.id,
          data_aposta: item.data_aposta,
          lucro_prejuizo: item.lucro_prejuizo,
          pl_consolidado: item.pl_consolidado,
          resultado: item.resultado,
          stake: stake || 0,
          stake_total: item.stake_total,
          esporte: item.esporte || item.estrategia || 'N/A',
          bookmaker_id: item.bookmaker_id || 'unknown',
          bookmaker_nome: bkInfo.nome,
          parceiro_nome: bkInfo.parceiro_nome,
          logo_url: bkInfo.logo_url,
          forma_registro: item.forma_registro,
          estrategia: item.estrategia,
          bonus_id: item.bonus_id,
          pernas: pernasEnriquecidas,
        };
      });
      
      setApostasUnificadas(apostasTransformadas);
    } catch (error) {
      console.error("Erro ao carregar apostas:", error);
    } finally {
      setLoading(false);
    }
  };

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
      // CRÍTICO: Usar pl_consolidado quando disponível para evitar inflação
      acc[aposta.esporte].lucro += (aposta.pl_consolidado ?? aposta.lucro_prejuizo) || 0;
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
  // CRÍTICO: Passa pl_consolidado para usar lucro correto (evitar inflação em surebets)
  const apostasParaGraficos = useMemo(() => {
    return apostasUnificadas.map(a => ({
      data_aposta: a.data_aposta,
      // CRÍTICO: Usar pl_consolidado quando disponível para evitar inflação
      lucro_prejuizo: a.pl_consolidado ?? a.lucro_prejuizo,
      stake: a.stake,
      stake_total: a.stake_total,
      bookmaker_nome: a.bookmaker_nome,
      parceiro_nome: a.parceiro_nome,
      bookmaker_id: a.bookmaker_id,
      pernas: a.pernas,
      forma_registro: a.forma_registro ?? undefined,
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
  const hasAnyBetsInProject = apostasCalendario.length > 0;

  if (!hasAnyBetsInProject && apostasUnificadas.length === 0) {
    return (
      <div className="space-y-4">
        {/* Visão Geral - Sempre consolidada, sem filtros */}
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
    <div className="space-y-4">
      {/* Filtro de período */}
      <StandardTimeFilter
        period={period}
        onPeriodChange={setPeriod}
        customDateRange={customDateRange}
        onCustomDateRangeChange={setCustomDateRange}
      />

      {/* Gráficos de Evolução e Casas Mais Utilizadas */}
      <VisaoGeralCharts 
        apostas={apostasParaGraficos}
        apostasCalendario={apostasCalendario.map(a => ({
          data_aposta: a.data_aposta,
          lucro_prejuizo: a.pl_consolidado ?? a.lucro_prejuizo,
          stake: a.stake,
          stake_total: a.stake_total,
          bookmaker_nome: a.bookmaker_nome,
          parceiro_nome: a.parceiro_nome,
          bookmaker_id: a.bookmaker_id,
          pernas: a.pernas,
          forma_registro: a.forma_registro ?? undefined,
        }))}
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
      />

      {/* Performance por Casa - Componente com visões alternáveis */}
      <PerformancePorCasaCard
        apostasUnificadas={apostasUnificadas}
        extrasLucro={extrasLucro}
        formatCurrency={formatCurrency}
        getLogoUrl={getCatalogLogoUrl}
      />

      {/* Performance por Esporte */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="flex items-center gap-2">
            <BarChart3 className="h-5 w-5" />
            Performance por Esporte
          </CardTitle>
          {esportesData.length > 0 && (
            <Select value={selectedEsporte} onValueChange={setSelectedEsporte}>
              <SelectTrigger className="w-[180px] h-8 text-sm">
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
        <CardContent className="overflow-hidden">
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
            height={250}
            barSize={16}
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
  );
}
