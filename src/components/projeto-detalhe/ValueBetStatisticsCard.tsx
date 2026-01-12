import { useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { BarChart3 } from "lucide-react";
import { parseLocalDateTime } from "@/utils/dateUtils";

interface Aposta {
  id: string;
  data_aposta: string;
  odd: number;
  odd_final?: number | null;
  stake: number;
  stake_total?: number | null;
  resultado: string | null;
  lucro_prejuizo: number | null;
  status: string;
}

interface ValueBetStatisticsCardProps {
  apostas: Aposta[];
  /** Função de formatação obrigatória - deve vir do useProjetoCurrency */
  formatCurrency: (value: number) => string;
}

const StatCell = ({ label, value, valueClass = "" }: { 
  label: string; 
  value: string | number; 
  valueClass?: string 
}) => (
  <div className="flex items-center justify-between bg-muted/40 rounded px-3 py-1.5">
    <span className="text-muted-foreground text-xs">{label}</span>
    <span className={`font-medium tabular-nums text-xs ${valueClass}`}>{value}</span>
  </div>
);

export function ValueBetStatisticsCard({ apostas, formatCurrency }: ValueBetStatisticsCardProps) {
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
      (a, b) => parseLocalDateTime(a.data_aposta).getTime() - parseLocalDateTime(b.data_aposta).getTime()
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

    // Usa odd_final para múltiplas, senão odd normal
    const getEffectiveOdd = (a: Aposta) => a.odd_final ?? a.odd ?? 0;
    
    const odds = apostas.filter(a => getEffectiveOdd(a) > 0).map(a => getEffectiveOdd(a));
    const cotacaoMedia = odds.length > 0 ? odds.reduce((a, b) => a + b, 0) / odds.length : 0;

    // Maior cotação ganha (considera odd_final para múltiplas)
    const apostasGanhas = apostas.filter(a => a.resultado === "GREEN" || a.resultado === "MEIO_GREEN");
    const maiorCotacaoGanha = apostasGanhas.length > 0 
      ? Math.max(...apostasGanhas.map(a => getEffectiveOdd(a))) 
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


  if (apostas.length === 0) {
    return null;
  }

  return (
    <Card className="border-purple-500/20">
      <CardHeader className="py-3">
        <CardTitle className="text-sm font-medium flex items-center gap-2">
          <BarChart3 className="h-4 w-4 text-purple-400" />
          Estatísticas
        </CardTitle>
      </CardHeader>
      <CardContent className="pt-0 pb-3">
        <div className="grid grid-cols-2 gap-2">
          <StatCell label="Vencedoras" value={stats.vencedoras} valueClass="text-emerald-400" />
          <StatCell label="Perdedoras" value={stats.perdedoras} valueClass="text-red-400" />
          <StatCell label="Reembolsadas" value={stats.reembolsadas} />
          <StatCell label="Em curso" value={stats.emCurso} valueClass="text-blue-400" />
          <StatCell label="Valor Total Apostado" value={formatCurrency(stats.valorEmJogo)} />
          <StatCell label="Valor em apostas em curso" value={formatCurrency(stats.valorEmCurso)} valueClass="text-blue-400" />
          <StatCell label="Máx. vitórias" value={stats.maxVitorias} valueClass="text-emerald-400" />
          <StatCell label="Máx. derrotas" value={stats.maxDerrotas} valueClass="text-red-400" />
          <StatCell label="Valor médio" value={formatCurrency(stats.valorMedio)} />
          <StatCell label="Valor máximo" value={formatCurrency(stats.valorMaximo)} />
          <StatCell label="Cotação média" value={stats.cotacaoMedia.toFixed(2)} />
          <StatCell 
            label="Maior odd ganha" 
            value={stats.maiorCotacaoGanha > 0 ? stats.maiorCotacaoGanha.toFixed(2) : "-"} 
            valueClass="text-emerald-400" 
          />
          <StatCell 
            label="Maior lucro" 
            value={stats.maiorLucro > 0 ? `+${formatCurrency(stats.maiorLucro)}` : formatCurrency(stats.maiorLucro)} 
            valueClass="text-emerald-400" 
          />
          <StatCell label="Maior perda" value={formatCurrency(stats.maiorPerda)} valueClass="text-red-400" />
        </div>
      </CardContent>
    </Card>
  );
}
