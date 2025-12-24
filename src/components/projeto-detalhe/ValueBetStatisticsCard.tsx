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
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-medium flex items-center gap-2">
          <BarChart3 className="h-4 w-4 text-purple-400" />
          Estatísticas Avançadas
        </CardTitle>
      </CardHeader>
      <CardContent className="grid grid-cols-2 gap-x-6 gap-y-4 text-sm">
        {/* Resultados */}
        <div className="col-span-2 pb-2 border-b border-border/50">
          <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
            <Target className="h-3 w-3" />
            Resultados
          </span>
        </div>
        
        <div className="flex justify-between items-center">
          <span className="text-muted-foreground">Vencedoras</span>
          <span className="font-medium text-emerald-400 tabular-nums">{stats.vencedoras}</span>
        </div>
        <div className="flex justify-between items-center">
          <span className="text-muted-foreground">Perdedoras</span>
          <span className="font-medium text-red-400 tabular-nums">{stats.perdedoras}</span>
        </div>
        <div className="flex justify-between items-center">
          <span className="text-muted-foreground">Reembolsadas</span>
          <span className="font-medium text-slate-400 tabular-nums">{stats.reembolsadas}</span>
        </div>
        <div className="flex justify-between items-center">
          <span className="text-muted-foreground">Em curso</span>
          <span className="font-medium text-blue-400 tabular-nums">{stats.emCurso}</span>
        </div>

        {/* Valores */}
        <div className="col-span-2 pb-2 pt-2 border-b border-border/50">
          <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
            <DollarSign className="h-3 w-3" />
            Valores
          </span>
        </div>
        
        <div className="flex justify-between items-center">
          <span className="text-muted-foreground">Valor em jogo</span>
          <span className="font-medium tabular-nums">{formatCurrency(stats.valorEmJogo)}</span>
        </div>
        <div className="flex justify-between items-center">
          <span className="text-muted-foreground">Valor em curso</span>
          <span className="font-medium text-blue-400 tabular-nums">{formatCurrency(stats.valorEmCurso)}</span>
        </div>

        {/* Séries */}
        <div className="col-span-2 pb-2 pt-2 border-b border-border/50">
          <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
            <Flame className="h-3 w-3" />
            Séries
          </span>
        </div>
        
        <div className="flex justify-between items-center">
          <span className="text-muted-foreground">Máx. vitórias</span>
          <div className="flex items-center gap-1.5">
            <TrendingUp className="h-3.5 w-3.5 text-emerald-400" />
            <span className="font-medium text-emerald-400 tabular-nums">{stats.maxVitorias}</span>
          </div>
        </div>
        <div className="flex justify-between items-center">
          <span className="text-muted-foreground">Máx. derrotas</span>
          <div className="flex items-center gap-1.5">
            <TrendingDown className="h-3.5 w-3.5 text-red-400" />
            <span className="font-medium text-red-400 tabular-nums">{stats.maxDerrotas}</span>
          </div>
        </div>

        {/* Métricas Gerais */}
        <div className="col-span-2 pb-2 pt-2 border-b border-border/50">
          <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
            <Activity className="h-3 w-3" />
            Métricas Gerais
          </span>
        </div>
        
        <div className="flex justify-between items-center">
          <span className="text-muted-foreground">Valor médio</span>
          <span className="font-medium tabular-nums">{formatCurrency(stats.valorMedio)}</span>
        </div>
        <div className="flex justify-between items-center">
          <span className="text-muted-foreground">Valor máximo</span>
          <span className="font-medium tabular-nums">{formatCurrency(stats.valorMaximo)}</span>
        </div>
        <div className="flex justify-between items-center">
          <span className="text-muted-foreground">Cotação média</span>
          <span className="font-medium tabular-nums">{stats.cotacaoMedia.toFixed(2)}</span>
        </div>
        <div className="flex justify-between items-center">
          <span className="text-muted-foreground">Maior odd ganha</span>
          <span className="font-medium text-emerald-400 tabular-nums">
            {stats.maiorCotacaoGanha > 0 ? stats.maiorCotacaoGanha.toFixed(2) : "-"}
          </span>
        </div>

        {/* Extremos */}
        <div className="col-span-2 pb-2 pt-2 border-b border-border/50">
          <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
            <Award className="h-3 w-3" />
            Extremos
          </span>
        </div>
        
        <div className="flex justify-between items-center">
          <span className="text-muted-foreground">Maior lucro</span>
          <span className="font-medium text-emerald-400 tabular-nums">
            {stats.maiorLucro > 0 ? `+${formatCurrency(stats.maiorLucro)}` : formatCurrency(stats.maiorLucro)}
          </span>
        </div>
        <div className="flex justify-between items-center">
          <span className="text-muted-foreground">Maior perda</span>
          <span className="font-medium text-red-400 tabular-nums">
            {formatCurrency(stats.maiorPerda)}
          </span>
        </div>
      </CardContent>
    </Card>
  );
}
