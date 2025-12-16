import { useState, useEffect, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import { 
  TrendingUp, 
  TrendingDown, 
  Trophy, 
  Target,
  AlertTriangle,
  CheckCircle2,
  ArrowUp,
  ArrowDown,
  Minus,
  BarChart3,
  Lightbulb,
  Calendar,
  Zap,
  Award,
  ThumbsUp,
  ThumbsDown,
  Building2
} from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { AnalisePorCasaSection } from "./AnalisePorCasaSection";
import { useBookmakerAnalise } from "@/hooks/useBookmakerAnalise";

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
  roi: number;
  // Métricas derivadas
  lucroPoAposta: number;
  lucroPor100Apostados: number;
}

interface ComparativoCiclosTabProps {
  projetoId: string;
}

export function ComparativoCiclosTab({ projetoId }: ComparativoCiclosTabProps) {
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
          
          const [apostasResult, apostasMultiplasResult, surebetsResult, perdasResult] = await Promise.all([
            supabase
              .from("apostas")
              .select("lucro_prejuizo, stake, status")
              .eq("projeto_id", projetoId)
              .gte("data_aposta", ciclo.data_inicio)
              .lte("data_aposta", dataFimAjustada),
            supabase
              .from("apostas_multiplas")
              .select("lucro_prejuizo, stake, resultado")
              .eq("projeto_id", projetoId)
              .gte("data_aposta", ciclo.data_inicio)
              .lte("data_aposta", dataFimAjustada),
            supabase
              .from("surebets")
              .select("lucro_real, stake_total, status")
              .eq("projeto_id", projetoId)
              .gte("data_evento", ciclo.data_inicio)
              .lte("data_evento", dataFimAjustada),
            supabase
              .from("projeto_perdas")
              .select("valor, status")
              .eq("projeto_id", projetoId)
              .eq("status", "CONFIRMADA")
              .gte("data_registro", ciclo.data_inicio)
              .lte("data_registro", dataFimAjustada),
          ]);

          const apostas = apostasResult.data || [];
          const apostasMultiplas = apostasMultiplasResult.data || [];
          const surebets = surebetsResult.data || [];
          const perdas = perdasResult.data || [];

          const qtdApostas = apostas.length + apostasMultiplas.length + surebets.length;
          const volume = 
            apostas.reduce((acc, a) => acc + (a.stake || 0), 0) +
            apostasMultiplas.reduce((acc, a) => acc + (a.stake || 0), 0) +
            surebets.reduce((acc, a) => acc + (a.stake_total || 0), 0);
          
          const lucroBrutoCalculado = 
            apostas.filter(a => a.status === "LIQUIDADA").reduce((acc, a) => acc + (a.lucro_prejuizo || 0), 0) +
            apostasMultiplas.filter(a => ["GREEN", "RED", "VOID", "MEIO_GREEN", "MEIO_RED"].includes(a.resultado || "")).reduce((acc, a) => acc + (a.lucro_prejuizo || 0), 0) +
            surebets.filter(a => a.status === "LIQUIDADA").reduce((acc, a) => acc + (a.lucro_real || 0), 0);

          const perdasConfirmadas = perdas.reduce((acc, p) => acc + p.valor, 0);
          
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
      const mes = format(new Date(ciclo.data_inicio), "MMMM yyyy", { locale: ptBR });
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

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat("pt-BR", {
      style: "currency",
      currency: "BRL",
    }).format(value);
  };

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
                  <th className="text-right p-2">Ticket Médio</th>
                  <th className="text-right p-2">Lucro</th>
                  <th className="text-right p-2">ROI</th>
                  <th className="text-right p-2">Lucro/Aposta</th>
                  <th className="text-center p-2">Status</th>
                </tr>
              </thead>
              <tbody>
                {ciclos.map((ciclo) => (
                  <tr key={ciclo.id} className="border-b hover:bg-muted/50">
                    <td className="p-2 font-medium">{ciclo.numero_ciclo}</td>
                    <td className="p-2 text-muted-foreground">
                      {format(new Date(ciclo.data_inicio), "dd/MM")} - {format(new Date(ciclo.data_fim_prevista), "dd/MM")}
                    </td>
                    <td className="p-2 text-right">{ciclo.qtdApostas}</td>
                    <td className="p-2 text-right">{formatCurrency(ciclo.volume)}</td>
                    <td className="p-2 text-right">{formatCurrency(ciclo.ticketMedio)}</td>
                    <td className={`p-2 text-right font-medium ${ciclo.lucro >= 0 ? "text-emerald-500" : "text-red-500"}`}>
                      {formatCurrency(ciclo.lucro)}
                    </td>
                    <td className={`p-2 text-right ${ciclo.roi >= 0 ? "text-emerald-500" : "text-red-500"}`}>
                      {ciclo.roi.toFixed(2)}%
                    </td>
                    <td className="p-2 text-right">{formatCurrency(ciclo.lucroPoAposta)}</td>
                    <td className="p-2 text-center">
                      <Badge variant={ciclo.status === "FECHADO" ? "secondary" : "default"} className="text-xs">
                        {ciclo.status === "FECHADO" ? "Fechado" : "Em Andamento"}
                      </Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
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
            />
          )}
        </CardContent>
      </Card>
    </div>
  );
}
