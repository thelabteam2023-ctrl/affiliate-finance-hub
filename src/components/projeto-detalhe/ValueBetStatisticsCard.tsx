import { useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { BarChart3, TrendingUp, TrendingDown, Target, DollarSign, Activity, Flame, Award } from "lucide-react";

interface Aposta {
  id: string;
  data_aposta: string;
  odd: number;
  stake: number;
  stake_total?: number | null;
  resultado: string | null;
  lucro_prejuizo: number | null;
  status: string;
}

interface ValueBetStatisticsCardProps {
  apostas: Aposta[];
}

export function ValueBetStatisticsCard({ apostas }: ValueBetStatisticsCardProps) {
  const stats = useMemo(() => {
    // Resultados
    const vencedoras = apostas.filter(a => a.resultado === "GREEN" || a.resultado === "MEIO_GREEN").length;
    const perdedoras = apostas.filter(a => a.resultado === "RED" || a.resultado === "MEIO_RED").length;
    const reembolsadas = apostas.filter(a => a.resultado === "VOID").length;
    const emCurso = apostas.filter(a => !a.resultado || a.resultado === "PENDENTE").length;

    // Valores
    const apostasLiquidadas = apostas.filter(a => a.resultado && a.resultado !== "PENDENTE");
    const apostasAbertas = apostas.filter(a => !a.resultado || a.resultado === "PENDENTE");
    
    const valorEmJogo = apostasLiquidadas.reduce((acc, a) => {
      const stake = typeof a.stake_total === "number" ? a.stake_total : a.stake;
      return acc + stake;
    }, 0);
    
    const valorEmCurso = apostasAbertas.reduce((acc, a) => {
      const stake = typeof a.stake_total === "number" ? a.stake_total : a.stake;
      return acc + stake;
    }, 0);

    // Séries de vitórias e derrotas
    let maxVitorias = 0;
    let maxDerrotas = 0;
    let currentVitorias = 0;
    let currentDerrotas = 0;

    // Ordenar por data para calcular séries
    const sorted = [...apostasLiquidadas].sort(
      (a, b) => new Date(a.data_aposta).getTime() - new Date(b.data_aposta).getTime()
    );

    sorted.forEach((a) => {
      if (a.resultado === "GREEN" || a.resultado === "MEIO_GREEN") {
        currentVitorias++;
        currentDerrotas = 0;
        maxVitorias = Math.max(maxVitorias, currentVitorias);
      } else if (a.resultado === "RED" || a.resultado === "MEIO_RED") {
        currentDerrotas++;
        currentVitorias = 0;
        maxDerrotas = Math.max(maxDerrotas, currentDerrotas);
      } else {
        // VOID não quebra a sequência
      }
    });

    // Métricas gerais
    const stakes = apostas.map(a => typeof a.stake_total === "number" ? a.stake_total : a.stake);
    const valorMedio = stakes.length > 0 ? stakes.reduce((a, b) => a + b, 0) / stakes.length : 0;
    const valorMaximo = stakes.length > 0 ? Math.max(...stakes) : 0;

    const odds = apostas.filter(a => a.odd > 0).map(a => a.odd);
    const cotacaoMedia = odds.length > 0 ? odds.reduce((a, b) => a + b, 0) / odds.length : 0;

    // Maior cotação ganha
    const apostasGanhas = apostas.filter(a => a.resultado === "GREEN" || a.resultado === "MEIO_GREEN");
    const maiorCotacaoGanha = apostasGanhas.length > 0 
      ? Math.max(...apostasGanhas.map(a => a.odd || 0)) 
      : 0;

    // Extremos
    const lucros = apostasLiquidadas.map(a => a.lucro_prejuizo || 0);
    const maiorLucro = lucros.length > 0 ? Math.max(...lucros) : 0;
    const maiorPerda = lucros.length > 0 ? Math.min(...lucros) : 0;

    return {
      vencedoras,
      perdedoras,
      reembolsadas,
      emCurso,
      valorEmJogo,
      valorEmCurso,
      maxVitorias,
      maxDerrotas,
      valorMedio,
      valorMaximo,
      cotacaoMedia,
      maiorCotacaoGanha,
      maiorLucro,
      maiorPerda,
    };
  }, [apostas]);

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat("pt-BR", {
      style: "currency",
      currency: "BRL",
    }).format(value);
  };

  if (apostas.length === 0) {
    return null;
  }

  return (
    <Card className="border-purple-500/20">
      <CardHeader className="py-3">
        <CardTitle className="text-sm font-medium flex items-center gap-2">
          <BarChart3 className="h-4 w-4 text-purple-400" />
          Estatísticas Avançadas
        </CardTitle>
      </CardHeader>
      <CardContent className="pt-0 pb-4 space-y-3 text-sm">
        {/* Resultados */}
        <div>
          <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider flex items-center gap-1.5 mb-2">
            <Target className="h-3 w-3" />
            Resultados
          </span>
          <div className="grid grid-cols-4 gap-x-4 gap-y-1">
            <div className="flex justify-between items-center">
              <span className="text-muted-foreground text-xs">Vencedoras</span>
              <span className="font-medium text-emerald-400 tabular-nums">{stats.vencedoras}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-muted-foreground text-xs">Perdedoras</span>
              <span className="font-medium text-red-400 tabular-nums">{stats.perdedoras}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-muted-foreground text-xs">Reembolsadas</span>
              <span className="font-medium text-slate-400 tabular-nums">{stats.reembolsadas}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-muted-foreground text-xs">Em curso</span>
              <span className="font-medium text-blue-400 tabular-nums">{stats.emCurso}</span>
            </div>
          </div>
        </div>

        {/* Valores + Séries */}
        <div className="grid grid-cols-2 gap-6 pt-2 border-t border-border/50">
          <div>
            <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider flex items-center gap-1.5 mb-2">
              <DollarSign className="h-3 w-3" />
              Valores
            </span>
            <div className="grid grid-cols-2 gap-x-4 gap-y-1">
              <div className="flex justify-between items-center">
                <span className="text-muted-foreground text-xs">Em jogo</span>
                <span className="font-medium tabular-nums text-xs">{formatCurrency(stats.valorEmJogo)}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-muted-foreground text-xs">Em curso</span>
                <span className="font-medium text-blue-400 tabular-nums text-xs">{formatCurrency(stats.valorEmCurso)}</span>
              </div>
            </div>
          </div>
          <div>
            <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider flex items-center gap-1.5 mb-2">
              <Flame className="h-3 w-3" />
              Séries
            </span>
            <div className="grid grid-cols-2 gap-x-4 gap-y-1">
              <div className="flex justify-between items-center">
                <span className="text-muted-foreground text-xs">Máx. vitórias</span>
                <div className="flex items-center gap-1">
                  <TrendingUp className="h-3 w-3 text-emerald-400" />
                  <span className="font-medium text-emerald-400 tabular-nums">{stats.maxVitorias}</span>
                </div>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-muted-foreground text-xs">Máx. derrotas</span>
                <div className="flex items-center gap-1">
                  <TrendingDown className="h-3 w-3 text-red-400" />
                  <span className="font-medium text-red-400 tabular-nums">{stats.maxDerrotas}</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Métricas Gerais */}
        <div className="pt-2 border-t border-border/50">
          <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider flex items-center gap-1.5 mb-2">
            <Activity className="h-3 w-3" />
            Métricas Gerais
          </span>
          <div className="grid grid-cols-4 gap-x-4 gap-y-1">
            <div className="flex justify-between items-center">
              <span className="text-muted-foreground text-xs">Valor médio</span>
              <span className="font-medium tabular-nums text-xs">{formatCurrency(stats.valorMedio)}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-muted-foreground text-xs">Valor máximo</span>
              <span className="font-medium tabular-nums text-xs">{formatCurrency(stats.valorMaximo)}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-muted-foreground text-xs">Cotação média</span>
              <span className="font-medium tabular-nums">{stats.cotacaoMedia.toFixed(2)}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-muted-foreground text-xs">Maior odd ganha</span>
              <span className="font-medium text-emerald-400 tabular-nums">
                {stats.maiorCotacaoGanha > 0 ? stats.maiorCotacaoGanha.toFixed(2) : "-"}
              </span>
            </div>
          </div>
        </div>

        {/* Extremos */}
        <div className="pt-2 border-t border-border/50">
          <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider flex items-center gap-1.5 mb-2">
            <Award className="h-3 w-3" />
            Extremos
          </span>
          <div className="grid grid-cols-2 gap-x-4 gap-y-1">
            <div className="flex justify-between items-center">
              <span className="text-muted-foreground text-xs">Maior lucro</span>
              <span className="font-medium text-emerald-400 tabular-nums text-xs">
                {stats.maiorLucro > 0 ? `+${formatCurrency(stats.maiorLucro)}` : formatCurrency(stats.maiorLucro)}
              </span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-muted-foreground text-xs">Maior perda</span>
              <span className="font-medium text-red-400 tabular-nums text-xs">
                {formatCurrency(stats.maiorPerda)}
              </span>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
