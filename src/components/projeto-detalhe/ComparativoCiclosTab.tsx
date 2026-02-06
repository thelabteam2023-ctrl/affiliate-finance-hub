import { useState, useEffect, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { 
  TrendingUp, 
  TrendingDown, 
  Trophy, 
  Target,
  AlertTriangle,
  CheckCircle2,
  BarChart3,
  ThumbsUp,
  ThumbsDown,
  Building2
} from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { parseLocalDate } from "@/lib/dateUtils";
import { AnalisePorCasaSection } from "./AnalisePorCasaSection";
import { useBookmakerAnalise } from "@/hooks/useBookmakerAnalise";
import { PerdaCicloTooltip } from "./ciclos/PerdaCicloTooltip";

interface PerdaDetalhe {
  valor: number;
  bookmaker_nome?: string;
  categoria: string;
}

interface CicloData {
  id: string;
  numero_ciclo: number;
  data_inicio: string;
  data_fim_prevista: string;
  data_fim_real: string | null;
  status: string;
  lucro_bruto: number;
  lucro_liquido: number;
  meta_volume: number | null;
  metrica_acumuladora: string;
  valor_acumulado: number;
  tipo_gatilho: string;
  // Métricas calculadas
  qtdApostas: number;
  volume: number;
  ticketMedio: number;
  lucro: number;  // Lucro real (líquido, após perdas)
  lucroBruto: number;
  perdasConfirmadas: number;
  perdasDetalhes: PerdaDetalhe[];
  roi: number;
  // Métricas derivadas
  lucroPoAposta: number;
  lucroPor100Apostados: number;
}

interface ComparativoCiclosTabProps {
  projetoId: string;
  formatCurrency?: (value: number) => string;
}

// Fallback para formatação de moeda
const defaultFormatCurrency = (value: number): string => {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(value);
};

export function ComparativoCiclosTab({ projetoId, formatCurrency: formatCurrencyProp }: ComparativoCiclosTabProps) {
  const formatCurrency = formatCurrencyProp || defaultFormatCurrency;
  const [ciclos, setCiclos] = useState<CicloData[]>([]);
  const [loading, setLoading] = useState(true);

  // Hook para análise por casa
  const { analises: bookmakerAnalises, loading: loadingBookmakers, lucroTotal, projetoContexto } = useBookmakerAnalise({ projetoId });

  useEffect(() => {
    fetchCiclosComMetricas();
  }, [projetoId]);

  const fetchCiclosComMetricas = async () => {
    try {
      setLoading(true);
      
      const { data: ciclosData, error } = await supabase
        .from("projeto_ciclos")
        .select("*")
        .eq("projeto_id", projetoId)
        .order("numero_ciclo", { ascending: true });

      if (error) throw error;
      if (!ciclosData || ciclosData.length === 0) {
        setCiclos([]);
        return;
      }

      // Calcular métricas para cada ciclo incluindo perdas
      const ciclosComMetricas: CicloData[] = await Promise.all(
        ciclosData.map(async (ciclo) => {
          const dataFim = ciclo.data_fim_real || ciclo.data_fim_prevista;
          
          // Ajustar data fim para incluir o dia inteiro (timestamp com hora 23:59:59)
          const dataFimAjustada = `${dataFim}T23:59:59.999Z`;
          
          const [apostasResult, perdasResult, bookmakersResult, cashbackResult, girosResult] = await Promise.all([
            supabase
              .from("apostas_unificada")
              .select("lucro_prejuizo, stake, stake_total, status, forma_registro")
              .eq("projeto_id", projetoId)
              .gte("data_aposta", ciclo.data_inicio)
              .lte("data_aposta", dataFimAjustada),
            supabase
              .from("projeto_perdas")
              .select("valor, status, categoria, bookmaker_id")
              .eq("projeto_id", projetoId)
              .eq("status", "CONFIRMADA")
              .gte("data_registro", ciclo.data_inicio)
              .lte("data_registro", dataFimAjustada),
            supabase
              .from("bookmakers")
              .select("id, nome"),
            // NOVO: Buscar cashback do período do ciclo
            supabase
              .from("cashback_manual")
              .select("valor")
              .eq("projeto_id", projetoId)
              .gte("data_credito", ciclo.data_inicio)
              .lte("data_credito", dataFim),
            // NOVO: Buscar giros grátis do período do ciclo
            supabase
              .from("giros_gratis")
              .select("valor_retorno")
              .eq("projeto_id", projetoId)
              .eq("status", "confirmado")
              .gte("data_registro", ciclo.data_inicio)
              .lte("data_registro", dataFimAjustada)
          ]);

          const apostas = apostasResult.data || [];
          const perdas = perdasResult.data || [];
          const bookmakers = bookmakersResult.data || [];
          const cashbacks = cashbackResult.data || [];
          const giros = girosResult.data || [];
          
          // Mapa de bookmaker ID -> nome
          const bookmakerMap = new Map(bookmakers.map(b => [b.id, b.nome]));

          const qtdApostas = apostas.length;
          const volume = apostas.reduce((acc, a) => {
            if (a.forma_registro === 'ARBITRAGEM') {
              return acc + (a.stake_total || 0);
            }
            return acc + (a.stake || 0);
          }, 0);
          
          // Lucro de apostas liquidadas
          const lucroApostas = apostas
            .filter(a => a.status === "LIQUIDADA")
            .reduce((acc, a) => acc + (a.lucro_prejuizo || 0), 0);
          
          // NOVO: Lucro de cashback (sempre >= 0)
          const lucroCashback = cashbacks.reduce((acc, cb) => acc + Math.max(0, cb.valor || 0), 0);
          
          // NOVO: Lucro de giros grátis (sempre >= 0)
          const lucroGiros = giros.reduce((acc, g) => acc + Math.max(0, (g as any).valor_retorno || 0), 0);
          
          // LUCRO BRUTO = apostas + cashback + giros
          const lucroBrutoCalculado = lucroApostas + lucroCashback + lucroGiros;

          const perdasConfirmadas = perdas.reduce((acc, p) => acc + p.valor, 0);
          
          // Detalhes das perdas para tooltip
          const perdasDetalhes: PerdaDetalhe[] = perdas.map(p => ({
            valor: p.valor,
            categoria: p.categoria,
            bookmaker_nome: p.bookmaker_id ? bookmakerMap.get(p.bookmaker_id) : undefined
          }));
          
          // Para ciclos fechados, usar lucro_liquido do banco; para em andamento, calcular
          const lucroReal = ciclo.status === "FECHADO" 
            ? (ciclo.lucro_liquido ?? ciclo.lucro_bruto) 
            : lucroBrutoCalculado - perdasConfirmadas;

          const ticketMedio = qtdApostas > 0 ? volume / qtdApostas : 0;
          const roi = volume > 0 ? (lucroReal / volume) * 100 : 0;
          const lucroPoAposta = qtdApostas > 0 ? lucroReal / qtdApostas : 0;
          const lucroPor100Apostados = volume > 0 ? (lucroReal / volume) * 100 : 0;

          return {
            ...ciclo,
            qtdApostas,
            volume,
            ticketMedio,
            lucro: lucroReal,
            lucroBruto: ciclo.status === "FECHADO" ? ciclo.lucro_bruto : lucroBrutoCalculado,
            perdasConfirmadas,
            perdasDetalhes,
            roi,
            lucroPoAposta,
            lucroPor100Apostados,
          };
        })
      );

      setCiclos(ciclosComMetricas);
    } catch (error: any) {
      console.error("Erro ao carregar ciclos:", error.message);
    } finally {
      setLoading(false);
    }
  };

  // Helper functions - defined before useMemo
  const calcularTendencia = (ciclosFechados: CicloData[]): "crescimento" | "estabilidade" | "queda" => {
    if (ciclosFechados.length < 2) return "estabilidade";
    
    const ultimos3 = ciclosFechados.slice(-3);
    if (ultimos3.length < 2) return "estabilidade";

    let crescimentos = 0;
    let quedas = 0;

    for (let i = 1; i < ultimos3.length; i++) {
      if (ultimos3[i].lucro > ultimos3[i - 1].lucro) crescimentos++;
      else if (ultimos3[i].lucro < ultimos3[i - 1].lucro) quedas++;
    }

    if (crescimentos > quedas) return "crescimento";
    if (quedas > crescimentos) return "queda";
    return "estabilidade";
  };

  const calcularVariacoes = (ciclosData: CicloData[]) => {
    const variacoes: Array<{
      cicloAtual: CicloData;
      cicloAnterior: CicloData;
      varLucro: number;
      varLucroAbs: number;
      varApostas: number;
      varTicketMedio: number;
      varRoi: number;
      varVolume: number;
    }> = [];

    for (let i = 1; i < ciclosData.length; i++) {
      const atual = ciclosData[i];
      const anterior = ciclosData[i - 1];

      variacoes.push({
        cicloAtual: atual,
        cicloAnterior: anterior,
        varLucro: anterior.lucro !== 0 ? ((atual.lucro - anterior.lucro) / Math.abs(anterior.lucro)) * 100 : atual.lucro > 0 ? 100 : -100,
        varLucroAbs: atual.lucro - anterior.lucro,
        varApostas: atual.qtdApostas - anterior.qtdApostas,
        varTicketMedio: anterior.ticketMedio !== 0 ? ((atual.ticketMedio - anterior.ticketMedio) / anterior.ticketMedio) * 100 : 0,
        varRoi: atual.roi - anterior.roi,
        varVolume: anterior.volume !== 0 ? ((atual.volume - anterior.volume) / anterior.volume) * 100 : 0,
      });
    }

    return variacoes;
  };

  const calcularMelhorMes = (ciclosFechados: CicloData[]) => {
    const porMes: Record<string, { lucro: number; volume: number; apostas: number }> = {};
    
    ciclosFechados.forEach(ciclo => {
      const mes = format(parseLocalDate(ciclo.data_inicio), "MMMM yyyy", { locale: ptBR });
      if (!porMes[mes]) {
        porMes[mes] = { lucro: 0, volume: 0, apostas: 0 };
      }
      porMes[mes].lucro += ciclo.lucro;
      porMes[mes].volume += ciclo.volume;
      porMes[mes].apostas += ciclo.qtdApostas;
    });

    const meses = Object.entries(porMes);
    if (meses.length === 0) return null;

    const melhor = meses.reduce((a, b) => a[1].lucro > b[1].lucro ? a : b);
    return { mes: melhor[0], ...melhor[1], lucroMedio: melhor[1].apostas > 0 ? melhor[1].lucro / melhor[1].apostas : 0 };
  };

  // formatCurrency definido no escopo do componente

  const identificarPontosAtencao = (ciclosData: CicloData[], variacoes: ReturnType<typeof calcularVariacoes>) => {
    const pontos: string[] = [];

    // Quedas de ROI
    variacoes.forEach(v => {
      if (v.varRoi < -5) {
        pontos.push(`Ciclo ${v.cicloAtual.numero_ciclo}: queda de ${Math.abs(v.varRoi).toFixed(1)}pp no ROI em relação ao ciclo anterior`);
      }
    });

    // Volume aumentou mas lucro não acompanhou
    variacoes.forEach(v => {
      if (v.varVolume > 20 && v.varLucro < 10) {
        pontos.push(`Ciclo ${v.cicloAtual.numero_ciclo}: aumento de ${v.varVolume.toFixed(0)}% no volume sem aumento proporcional de lucro`);
      }
    });

    // Ciclos com prejuízo
    ciclosData.filter(c => c.lucro < 0 && c.status === "FECHADO").forEach(c => {
      pontos.push(`Ciclo ${c.numero_ciclo}: fechou com prejuízo de ${formatCurrency(Math.abs(c.lucro))}`);
    });

    return pontos;
  };

  const identificarDestaquesPositivos = (ciclosData: CicloData[], variacoes: ReturnType<typeof calcularVariacoes>) => {
    const destaques: string[] = [];

    // Melhoria significativa de ROI
    variacoes.forEach(v => {
      if (v.varRoi > 5) {
        destaques.push(`Ciclo ${v.cicloAtual.numero_ciclo}: melhoria de ${v.varRoi.toFixed(1)}pp no ROI`);
      }
    });

    // Aumento de lucro com menos apostas (eficiência)
    variacoes.forEach(v => {
      if (v.varLucro > 20 && v.varApostas <= 0) {
        destaques.push(`Ciclo ${v.cicloAtual.numero_ciclo}: +${v.varLucro.toFixed(0)}% de lucro com menos apostas (maior eficiência)`);
      }
    });

    // Ticket médio melhorou
    variacoes.forEach(v => {
      if (v.varTicketMedio > 15 && v.varLucro > 0) {
        destaques.push(`Ciclo ${v.cicloAtual.numero_ciclo}: ticket médio subiu ${v.varTicketMedio.toFixed(0)}%, impulsionando o lucro`);
      }
    });

    return destaques;
  };

  // Análises calculadas
  const analises = useMemo(() => {
    if (ciclos.length === 0) return null;

    const ciclosFechados = ciclos.filter(c => c.status === "FECHADO");
    
    // Melhor ciclo por lucro
    const melhorLucro = ciclosFechados.length > 0 
      ? ciclosFechados.reduce((a, b) => a.lucro > b.lucro ? a : b)
      : null;
    
    // Melhor ciclo por ROI
    const melhorRoi = ciclosFechados.length > 0
      ? ciclosFechados.reduce((a, b) => a.roi > b.roi ? a : b)
      : null;
    
    // Melhor ciclo por eficiência (lucro por aposta)
    const melhorEficiencia = ciclosFechados.filter(c => c.qtdApostas > 0).length > 0
      ? ciclosFechados.filter(c => c.qtdApostas > 0).reduce((a, b) => a.lucroPoAposta > b.lucroPoAposta ? a : b)
      : null;

    // Tendência geral
    const tendencia = calcularTendencia(ciclosFechados);

    // Comparação ciclo atual vs anterior
    const cicloAtual = ciclos.find(c => c.status === "EM_ANDAMENTO") || ciclos[ciclos.length - 1];
    const cicloAnterior = ciclos.length >= 2 ? ciclos[ciclos.length - 2] : null;

    // Variações entre ciclos consecutivos
    const variacoes = calcularVariacoes(ciclos);

    // Agrupar por mês
    const melhorMes = calcularMelhorMes(ciclosFechados);

    // Pontos de atenção
    const pontosAtencao = identificarPontosAtencao(ciclos, variacoes);

    // Destaques positivos
    const destaquesPositivos = identificarDestaquesPositivos(ciclos, variacoes);

    return {
      melhorLucro,
      melhorRoi,
      melhorEficiencia,
      tendencia,
      cicloAtual,
      cicloAnterior,
      variacoes,
      melhorMes,
      pontosAtencao,
      destaquesPositivos,
      ciclosFechados,
    };
  }, [ciclos]);


  const gerarInsightComparativo = (v: ReturnType<typeof calcularVariacoes>[0]) => {
    const partes: string[] = [];
    
    if (v.varLucro > 0) {
      partes.push(`O Ciclo ${v.cicloAtual.numero_ciclo} apresentou +${v.varLucro.toFixed(0)}% de lucro em relação ao Ciclo ${v.cicloAnterior.numero_ciclo}, com ${formatCurrency(v.varLucroAbs)} a mais`);
    } else if (v.varLucro < 0) {
      partes.push(`O Ciclo ${v.cicloAtual.numero_ciclo} teve queda de ${Math.abs(v.varLucro).toFixed(0)}% no lucro em relação ao Ciclo ${v.cicloAnterior.numero_ciclo}, com ${formatCurrency(Math.abs(v.varLucroAbs))} a menos`);
    }

    // Análise do motivo
    if (v.varLucro > 10 && v.varApostas <= 5) {
      partes.push(", indicando maior eficiência.");
    } else if (v.varLucro > 10 && v.varTicketMedio > 10) {
      partes.push(". O aumento foi impulsionado pelo ticket médio maior.");
    } else if (v.varLucro > 10 && v.varVolume > 20) {
      partes.push(". O crescimento veio do maior volume apostado.");
    } else if (v.varLucro < -10 && v.varRoi < 0) {
      partes.push(". A queda no ROI sugere menor qualidade das entradas.");
    } else if (v.varLucro < -10 && v.varVolume < -10) {
      partes.push(". O menor volume apostado contribuiu para o resultado.");
    } else {
      partes.push(".");
    }

    return partes.join("");
  };

  const gerarConclusaoGerencial = () => {
    if (!analises || analises.ciclosFechados.length < 2) return null;

    const manter: string[] = [];
    const ajustar: string[] = [];

    // Analisar tendência
    if (analises.tendencia === "crescimento") {
      manter.push("Manter a estratégia atual que está gerando crescimento consistente");
    } else if (analises.tendencia === "queda") {
      ajustar.push("Revisar a estratégia de entradas para reverter a tendência de queda");
    }

    // Analisar ticket médio
    const ultimaVar = analises.variacoes[analises.variacoes.length - 1];
    if (ultimaVar) {
      if (ultimaVar.varTicketMedio > 0 && ultimaVar.varLucro > 0) {
        manter.push("Tickets médios maiores estão contribuindo positivamente");
      } else if (ultimaVar.varTicketMedio < -10) {
        ajustar.push("Considerar aumentar o ticket médio para potencializar resultados");
      }
    }

    // Analisar eficiência
    if (analises.melhorEficiencia) {
      manter.push(`Usar o Ciclo ${analises.melhorEficiencia.numero_ciclo} como referência de eficiência`);
    }

    // Pontos de atenção
    if (analises.pontosAtencao.length > 0) {
      ajustar.push("Investigar os pontos de atenção identificados antes do próximo ciclo");
    }

    return { manter, ajustar };
  };

  if (loading) {
    return (
      <div className="space-y-4">
        {[1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-32 w-full" />
        ))}
      </div>
    );
  }

  if (ciclos.length === 0) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center justify-center py-12">
          <BarChart3 className="h-12 w-12 text-muted-foreground mb-4" />
          <h4 className="text-lg font-medium mb-2">Nenhum ciclo para comparar</h4>
          <p className="text-muted-foreground text-center">
            Crie ciclos na aba "Ciclos" para visualizar análises comparativas
          </p>
        </CardContent>
      </Card>
    );
  }

  if (ciclos.length < 2) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center justify-center py-12">
          <BarChart3 className="h-12 w-12 text-muted-foreground mb-4" />
          <h4 className="text-lg font-medium mb-2">Ciclo único</h4>
          <p className="text-muted-foreground text-center">
            É necessário ter pelo menos 2 ciclos para gerar comparativos
          </p>
        </CardContent>
      </Card>
    );
  }

  const conclusao = gerarConclusaoGerencial();

  return (
    <div className="space-y-6">
      {/* Tabela Completa - PRIMEIRA POSIÇÃO */}
      <Card>
        <CardHeader>
          <CardTitle>Tabela de Ciclos</CardTitle>
          <CardDescription>Dados completos de todos os ciclos</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b">
                  <th className="text-left p-2">Ciclo</th>
                  <th className="text-left p-2">Período</th>
                  <th className="text-right p-2">Apostas</th>
                  <th className="text-right p-2">Volume</th>
                  <th className="text-right p-2">Meta</th>
                  <th className="text-right p-2">Lucro</th>
                  <th className="text-right p-2">Perdas</th>
                  <th className="text-right p-2">ROI</th>
                  <th className="text-center p-2">Status</th>
                </tr>
              </thead>
              <tbody>
                {ciclos.map((ciclo) => (
                  <tr key={ciclo.id} className="border-b hover:bg-muted/50">
                    <td className="p-2 font-medium">{ciclo.numero_ciclo}</td>
                    <td className="p-2 text-muted-foreground">
                      {format(parseLocalDate(ciclo.data_inicio), "dd/MM")} - {format(parseLocalDate(ciclo.data_fim_prevista), "dd/MM")}
                    </td>
                    <td className="p-2 text-right">{ciclo.qtdApostas}</td>
                    <td className="p-2 text-right">{formatCurrency(ciclo.volume)}</td>
                    <td className="p-2 text-right text-muted-foreground">
                      {ciclo.meta_volume ? formatCurrency(ciclo.meta_volume) : "—"}
                    </td>
                    <td className={`p-2 text-right font-medium ${ciclo.lucro >= 0 ? "text-emerald-500" : "text-red-500"}`}>
                      {formatCurrency(ciclo.lucro)}
                    </td>
                    <td className="p-2 text-right">
                      <PerdaCicloTooltip
                        totalPerdas={ciclo.perdasConfirmadas}
                        perdas={ciclo.perdasDetalhes}
                        formatCurrency={formatCurrency}
                      />
                    </td>
                    <td className={`p-2 text-right ${ciclo.roi >= 0 ? "text-emerald-500" : "text-red-500"}`}>
                      {ciclo.roi.toFixed(2)}%
                    </td>
                    <td className="p-2 text-center">
                      {(() => {
                        const hoje = new Date();
                        hoje.setHours(0, 0, 0, 0);
                        const dataInicio = parseLocalDate(ciclo.data_inicio);
                        const dataFim = parseLocalDate(ciclo.data_fim_real || ciclo.data_fim_prevista);
                        
                        if (ciclo.status === "FECHADO") {
                          return <Badge variant="secondary" className="text-xs">Fechado</Badge>;
                        } else if (dataInicio > hoje) {
                          return <Badge variant="outline" className="text-xs text-muted-foreground">Futuro</Badge>;
                        } else if (dataFim < hoje) {
                          return <Badge variant="secondary" className="text-xs">Concluído</Badge>;
                        } else {
                          return <Badge variant="default" className="text-xs">Em Andamento</Badge>;
                        }
                      })()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          
          {/* KPIs Resumo */}
          {(() => {
            const totalMetas = ciclos.reduce((acc, c) => acc + (c.meta_volume || 0), 0);
            const totalLucro = ciclos.reduce((acc, c) => acc + c.lucro, 0);
            const totalApostas = ciclos.reduce((acc, c) => acc + c.qtdApostas, 0);
            const totalVolume = ciclos.reduce((acc, c) => acc + c.volume, 0);
            const progressoMeta = totalMetas > 0 ? Math.min((totalLucro / totalMetas) * 100, 100) : 0;
            const roiGeral = totalVolume > 0 ? (totalLucro / totalVolume) * 100 : 0;
            
            return (
              <div className="mt-3 pt-3 border-t">
                <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                  {/* Total Metas */}
                  <div className="bg-muted/30 rounded p-2 text-center">
                    <p className="text-xs text-muted-foreground mb-0.5 flex items-center justify-center gap-1">
                      <Target className="h-3 w-3" />
                      Total de Metas
                    </p>
                    <p className="text-sm font-semibold">
                      {totalMetas > 0 ? formatCurrency(totalMetas) : "—"}
                    </p>
                  </div>
                  
                  {/* Total Atingido */}
                  <div className="bg-muted/30 rounded p-2 text-center">
                    <p className="text-xs text-muted-foreground mb-0.5 flex items-center justify-center gap-1">
                      <TrendingUp className="h-3 w-3" />
                      Total Atingido
                    </p>
                    <p className={`text-sm font-semibold ${totalLucro >= 0 ? "text-emerald-500" : "text-red-500"}`}>
                      {formatCurrency(totalLucro)}
                    </p>
                  </div>
                  
                  {/* ROI Geral */}
                  <div className="bg-muted/30 rounded p-2 text-center">
                    <p className="text-xs text-muted-foreground mb-0.5">ROI Geral</p>
                    <p className={`text-sm font-semibold ${roiGeral >= 0 ? "text-emerald-500" : "text-red-500"}`}>
                      {roiGeral.toFixed(2)}%
                    </p>
                  </div>
                  
                  {/* Progresso das Metas */}
                  <div className="bg-muted/30 rounded p-2 text-center">
                    <p className="text-xs text-muted-foreground mb-0.5">Progresso</p>
                    {totalMetas > 0 ? (
                      <div className="space-y-1">
                        <span className={`text-sm font-semibold ${progressoMeta >= 100 ? "text-emerald-500" : "text-primary"}`}>
                          {progressoMeta.toFixed(1)}%
                        </span>
                        <div className="h-1.5 w-full bg-muted rounded-full overflow-hidden">
                          <div 
                            className={`h-full transition-all duration-500 ${
                              progressoMeta >= 100 ? "bg-emerald-500" : "bg-primary"
                            }`}
                            style={{ width: `${Math.min(progressoMeta, 100)}%` }}
                          />
                        </div>
                      </div>
                    ) : (
                      <p className="text-sm text-muted-foreground">—</p>
                    )}
                  </div>
                </div>
                
                {/* Resumo textual */}
                <p className="text-xs text-muted-foreground mt-2 text-center">
                  {totalApostas} apostas • Volume total: {formatCurrency(totalVolume)}
                </p>
              </div>
            );
          })()}
        </CardContent>
      </Card>


      {/* Destaques Positivos */}
      {analises?.destaquesPositivos && analises.destaquesPositivos.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <ThumbsUp className="h-5 w-5 text-emerald-500" />
              Destaques Positivos
            </CardTitle>
            <CardDescription>Ciclos e decisões que se destacaram positivamente</CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="space-y-2">
              {analises.destaquesPositivos.map((destaque, idx) => (
                <li key={idx} className="flex items-start gap-2">
                  <CheckCircle2 className="h-4 w-4 text-emerald-500 mt-0.5 shrink-0" />
                  <span className="text-sm">{destaque}</span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      {/* Pontos de Atenção */}
      {analises?.pontosAtencao && analises.pontosAtencao.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <ThumbsDown className="h-5 w-5 text-amber-500" />
              Pontos de Atenção
            </CardTitle>
            <CardDescription>Aspectos que merecem revisão</CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="space-y-2">
              {analises.pontosAtencao.map((ponto, idx) => (
                <li key={idx} className="flex items-start gap-2">
                  <AlertTriangle className="h-4 w-4 text-amber-500 mt-0.5 shrink-0" />
                  <span className="text-sm">{ponto}</span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      {/* Análise por Casa */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Building2 className="h-5 w-5 text-primary" />
            Análise por Casa (Bookmaker)
          </CardTitle>
          <CardDescription>Inteligência estratégica de performance × risco operacional por casa</CardDescription>
        </CardHeader>
        <CardContent>
          {loadingBookmakers ? (
            <div className="space-y-4">
              <Skeleton className="h-24" />
              <Skeleton className="h-32" />
            </div>
          ) : (
            <AnalisePorCasaSection 
              bookmakerAnalises={bookmakerAnalises} 
              lucroTotalCiclo={lucroTotal}
              projetoContexto={projetoContexto}
              formatCurrency={formatCurrency}
            />
          )}
        </CardContent>
      </Card>
    </div>
  );
}
