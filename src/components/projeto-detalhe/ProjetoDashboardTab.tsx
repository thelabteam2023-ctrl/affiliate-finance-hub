import { useState, useEffect, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
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
import { SaldoOperavelCard } from "./SaldoOperavelCard";
import { PerformancePorCasaCard } from "./PerformancePorCasaCard";

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
  const [extrasLucro, setExtrasLucro] = useState<ExtraLucroEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedEsporte, setSelectedEsporte] = useState<string>("");
  
  // Hook de formatação de moeda do projeto
  const { formatCurrency, formatChartAxis } = useProjetoCurrency(projetoId);
  
  // Hook global de logos
  const { logoMap: catalogLogoMap, getLogoUrl: getCatalogLogoUrl } = useBookmakerLogoMap();
  
  /**
   * VISÃO GERAL = CONSOLIDADO GLOBAL
   * Esta aba SEMPRE exibe dados globais do projeto, sem filtros herdados de outras abas.
   * Não utiliza filtros de período/bookmaker/parceiro - mostra TUDO.
   */

  useEffect(() => {
    fetchAllData();
  }, [projetoId]);

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
      
      // VISÃO GERAL: Busca TODAS as apostas sem filtro de período
      // Isso garante que a visão consolidada sempre mostre o projeto inteiro
      const query = supabase
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
          bonus_id,
          pernas
        `)
        .eq("projeto_id", projetoId)
        .is("cancelled_at", null)
        .order("data_aposta", { ascending: true });

      const { data, error } = await query;

      if (error) throw error;
      
      // Buscar bookmaker names - incluindo bookmakers das pernas de arbitragem
      const bookmakerIdsFromApostas = (data || []).map(a => a.bookmaker_id).filter(Boolean);
      
      // Extrair bookmaker_ids das pernas de arbitragem
      const bookmakerIdsFromPernas: string[] = [];
      (data || []).forEach((item: any) => {
        if (item.forma_registro === 'ARBITRAGEM' && Array.isArray(item.pernas)) {
          item.pernas.forEach((perna: any) => {
            if (perna.bookmaker_id) {
              bookmakerIdsFromPernas.push(perna.bookmaker_id);
            }
          });
        }
      });
      
      const bookmakerIds = [...new Set([...bookmakerIdsFromApostas, ...bookmakerIdsFromPernas])];
      let bookmakerMap: Record<string, { nome: string; parceiro_nome: string | null; logo_url: string | null }> = {};
      
      if (bookmakerIds.length > 0) {
        const { data: bookmakers } = await supabase
          .from("bookmakers")
          .select("id, nome, parceiros(nome), bookmakers_catalogo(logo_url)")
          .in("id", bookmakerIds);
        
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
      // NOTA: Apostas de arbitragem mantêm bookmaker_id como null/unknown
      // mas suas pernas contêm os bookmaker_ids reais - usados em bookmakerMetrics
      const apostasTransformadas: ApostaUnificada[] = (data || []).map((item: any) => {
        const bkInfo = bookmakerMap[item.bookmaker_id] || { nome: 'Desconhecida', parceiro_nome: null, logo_url: null };
        const stake = item.forma_registro === 'ARBITRAGEM' ? item.stake_total : item.stake;
        
        // Enriquecer pernas com dados do bookmakerMap
        let pernasEnriquecidas = undefined;
        if (item.forma_registro === 'ARBITRAGEM' && Array.isArray(item.pernas)) {
          pernasEnriquecidas = item.pernas.map((perna: any) => {
            const pernaBookmakerInfo = bookmakerMap[perna.bookmaker_id] || { 
              nome: perna.bookmaker_nome || 'Desconhecida', 
              parceiro_nome: null, 
              logo_url: null 
            };
            return {
              ...perna,
              bookmaker_nome: pernaBookmakerInfo.nome,
              parceiro_nome: pernaBookmakerInfo.parceiro_nome,
              logo_url: pernaBookmakerInfo.logo_url,
            };
          });
        }
        
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

  // Visão Geral não usa período - sempre mostra evolução completa
  const isSingleDayPeriod = false;

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
      acc[aposta.esporte].lucro += aposta.lucro_prejuizo || 0;
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
  // Passa bookmaker_nome e parceiro_nome separados - o VisaoGeralCharts faz o agrupamento
  const apostasParaGraficos = useMemo(() => {
    return apostasUnificadas.map(a => ({
      data_aposta: a.data_aposta,
      lucro_prejuizo: a.lucro_prejuizo,
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

  if (apostasUnificadas.length === 0) {
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
      {/* Visão Geral - Cockpit Estratégico (sem filtros, mostra o projeto inteiro) */}
      
      {/* KPI Estratégico Principal: Saldo Operável */}
      <SaldoOperavelCard projetoId={projetoId} />

      {/* Gráficos de Evolução e Casas Mais Utilizadas */}
      <VisaoGeralCharts 
        apostas={apostasParaGraficos}
        extrasLucro={extrasLucro}
        accentColor="hsl(var(--primary))"
        logoMap={catalogLogoMap}
        showCalendar={true}
        showEvolucaoChart={true}
        showCasasCard={true}
        isSingleDayPeriod={isSingleDayPeriod}
        formatCurrency={formatCurrency}
        formatChartAxis={formatChartAxis}
        showScopeToggle={false}
      />

      {/* Performance por Casa - Componente com visões alternáveis */}
      <PerformancePorCasaCard
        apostasUnificadas={apostasUnificadas}
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
