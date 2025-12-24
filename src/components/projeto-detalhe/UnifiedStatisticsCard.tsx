import { useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { 
  BarChart3, 
  TrendingUp, 
  DollarSign, 
  Target, 
  Dumbbell,
  LineChart,
  Percent,
  AlertTriangle,
  Zap,
  Trophy
} from "lucide-react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RechartsTooltip,
  ResponsiveContainer,
  Cell,
  Legend,
} from "recharts";

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
  esporte?: string | null;
}

interface UnifiedStatisticsCardProps {
  apostas: Aposta[];
  accentColor?: string;
}

// Componente de célula de estatística
const StatCell = ({ 
  label, 
  value, 
  valueClass = "",
  tooltip
}: { 
  label: string; 
  value: string | number; 
  valueClass?: string;
  tooltip?: string;
}) => {
  const content = (
    <div className="flex items-center justify-between bg-muted/40 rounded px-3 py-2">
      <span className="text-muted-foreground text-xs">{label}</span>
      <span className={`font-semibold tabular-nums text-sm ${valueClass}`}>{value}</span>
    </div>
  );

  if (tooltip) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>{content}</TooltipTrigger>
        <TooltipContent side="top" className="text-xs max-w-xs">
          {tooltip}
        </TooltipContent>
      </Tooltip>
    );
  }
  return content;
};

// Cabeçalho de seção
const SectionHeader = ({ title, icon: Icon }: { title: string; icon?: React.ElementType }) => (
  <div className="mt-4 first:mt-0 mb-2">
    <div className="flex items-center gap-2">
      <div className="w-0.5 h-4 bg-purple-500 rounded-full" />
      {Icon && <Icon className="h-3.5 w-3.5 text-purple-400" />}
      <span className="text-xs font-semibold text-foreground/90 uppercase tracking-wider">
        {title}
      </span>
    </div>
  </div>
);

// Formatadores
const formatCurrency = (value: number) => {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(value);
};

const formatPercent = (value: number) => {
  const sign = value >= 0 ? "+" : "";
  return `${sign}${value.toFixed(2)}%`;
};

// Faixas de valor para análise
const VALUE_RANGES = [
  { min: 0, max: 50, label: "R$ 0-50" },
  { min: 50, max: 100, label: "R$ 50-100" },
  { min: 100, max: 250, label: "R$ 100-250" },
  { min: 250, max: 500, label: "R$ 250-500" },
  { min: 500, max: 1000, label: "R$ 500-1k" },
  { min: 1000, max: Infinity, label: "R$ 1k+" },
];

// Faixas de cotação
const ODD_RANGES = [
  { min: 1.0, max: 1.5, label: "1.0-1.5" },
  { min: 1.5, max: 2.0, label: "1.5-2.0" },
  { min: 2.0, max: 2.5, label: "2.0-2.5" },
  { min: 2.5, max: 3.0, label: "2.5-3.0" },
  { min: 3.0, max: 4.0, label: "3.0-4.0" },
  { min: 4.0, max: Infinity, label: "4.0+" },
];

export function UnifiedStatisticsCard({ apostas, accentColor = "hsl(270, 76%, 60%)" }: UnifiedStatisticsCardProps) {
  const [activeTab, setActiveTab] = useState("resumo");

  // ==================== CÁLCULOS DE ESTATÍSTICAS ====================
  const stats = useMemo(() => {
    const getStake = (a: Aposta) => typeof a.stake_total === "number" ? a.stake_total : a.stake;
    const getOdd = (a: Aposta) => a.odd_final ?? a.odd ?? 0;

    // Apostas liquidadas vs abertas
    const liquidadas = apostas.filter(a => a.resultado && a.resultado !== "PENDENTE");
    const abertas = apostas.filter(a => !a.resultado || a.resultado === "PENDENTE");

    // === RESUMO ===
    const vencedoras = apostas.filter(a => a.resultado === "GREEN" || a.resultado === "MEIO_GREEN").length;
    const perdedoras = apostas.filter(a => a.resultado === "RED" || a.resultado === "MEIO_RED").length;
    const reembolsadas = apostas.filter(a => a.resultado === "VOID").length;
    const emCurso = abertas.length;

    const valorTotal = liquidadas.reduce((acc, a) => acc + getStake(a), 0);
    const valorEmCurso = abertas.reduce((acc, a) => acc + getStake(a), 0);
    const lucroTotal = liquidadas.reduce((acc, a) => acc + (a.lucro_prejuizo || 0), 0);
    const roi = valorTotal > 0 ? (lucroTotal / valorTotal) * 100 : 0;
    const taxaAcerto = liquidadas.length > 0 ? (vencedoras / liquidadas.length) * 100 : 0;

    // Séries
    let maxVitorias = 0, maxDerrotas = 0, currentVitorias = 0, currentDerrotas = 0;
    const sorted = [...liquidadas].sort((a, b) => 
      new Date(a.data_aposta).getTime() - new Date(b.data_aposta).getTime()
    );
    sorted.forEach(a => {
      if (a.resultado === "GREEN" || a.resultado === "MEIO_GREEN") {
        currentVitorias++;
        currentDerrotas = 0;
        maxVitorias = Math.max(maxVitorias, currentVitorias);
      } else if (a.resultado === "RED" || a.resultado === "MEIO_RED") {
        currentDerrotas++;
        currentVitorias = 0;
        maxDerrotas = Math.max(maxDerrotas, currentDerrotas);
      }
    });

    // === POR VALOR ===
    const porValor = VALUE_RANGES.map(range => {
      const filtered = apostas.filter(a => {
        const stake = getStake(a);
        return stake >= range.min && stake < range.max;
      });
      const filteredLiquidadas = filtered.filter(a => a.resultado && a.resultado !== "PENDENTE");
      const ganhas = filtered.filter(a => a.resultado === "GREEN" || a.resultado === "MEIO_GREEN").length;
      const volume = filtered.reduce((acc, a) => acc + getStake(a), 0);
      const lucro = filteredLiquidadas.reduce((acc, a) => acc + (a.lucro_prejuizo || 0), 0);
      const roiFaixa = volume > 0 ? (lucro / volume) * 100 : 0;
      const sucesso = filteredLiquidadas.length > 0 ? (ganhas / filteredLiquidadas.length) * 100 : 0;

      return {
        faixa: range.label,
        apostas: filtered.length,
        volume,
        lucro,
        roi: roiFaixa,
        sucesso,
      };
    }).filter(r => r.apostas > 0);

    // === POR COTAÇÃO ===
    const porCotacao = ODD_RANGES.map(range => {
      const filtered = apostas.filter(a => {
        const odd = getOdd(a);
        return odd >= range.min && odd < range.max;
      });
      const filteredLiquidadas = filtered.filter(a => a.resultado && a.resultado !== "PENDENTE");
      const ganhas = filtered.filter(a => a.resultado === "GREEN" || a.resultado === "MEIO_GREEN").length;
      const perdidas = filtered.filter(a => a.resultado === "RED" || a.resultado === "MEIO_RED").length;
      const reemb = filtered.filter(a => a.resultado === "VOID").length;
      const volume = filtered.reduce((acc, a) => acc + getStake(a), 0);
      const lucro = filteredLiquidadas.reduce((acc, a) => acc + (a.lucro_prejuizo || 0), 0);

      return {
        faixa: range.label,
        apostas: filtered.length,
        ganhas,
        perdidas,
        reembolsadas: reemb,
        volume,
        lucro,
      };
    }).filter(r => r.apostas > 0);

    // === POR ESPORTE ===
    const esporteMap = new Map<string, {
      apostas: number;
      ganhas: number;
      perdidas: number;
      reembolsadas: number;
      volume: number;
      lucro: number;
    }>();

    apostas.forEach(a => {
      const esporte = a.esporte || "Não informado";
      if (!esporteMap.has(esporte)) {
        esporteMap.set(esporte, { apostas: 0, ganhas: 0, perdidas: 0, reembolsadas: 0, volume: 0, lucro: 0 });
      }
      const entry = esporteMap.get(esporte)!;
      entry.apostas++;
      entry.volume += getStake(a);
      if (a.resultado === "GREEN" || a.resultado === "MEIO_GREEN") entry.ganhas++;
      else if (a.resultado === "RED" || a.resultado === "MEIO_RED") entry.perdidas++;
      else if (a.resultado === "VOID") entry.reembolsadas++;
      if (a.resultado && a.resultado !== "PENDENTE") {
        entry.lucro += a.lucro_prejuizo || 0;
      }
    });

    const porEsporte = Array.from(esporteMap.entries())
      .map(([esporte, data]) => ({
        esporte,
        ...data,
        roi: data.volume > 0 ? (data.lucro / data.volume) * 100 : 0,
        sucesso: (data.ganhas + data.perdidas + data.reembolsadas) > 0 
          ? (data.ganhas / (data.ganhas + data.perdidas + data.reembolsadas)) * 100 
          : 0,
      }))
      .sort((a, b) => b.lucro - a.lucro);

    // === AVANÇADO ===
    const lucros = liquidadas.map(a => a.lucro_prejuizo || 0);
    const maiorLucro = lucros.length > 0 ? Math.max(...lucros) : 0;
    const maiorPerda = lucros.length > 0 ? Math.min(...lucros) : 0;

    // Maior prejuízo diário
    const lucroPorDia = new Map<string, number>();
    liquidadas.forEach(a => {
      const dia = a.data_aposta.slice(0, 10);
      lucroPorDia.set(dia, (lucroPorDia.get(dia) || 0) + (a.lucro_prejuizo || 0));
    });
    const maiorPrejuizoDiario = lucroPorDia.size > 0 
      ? Math.min(...Array.from(lucroPorDia.values()), 0) 
      : 0;

    // Odds médias e por faixas
    const odds = apostas.filter(a => getOdd(a) > 0).map(a => getOdd(a));
    const oddMedia = odds.length > 0 ? odds.reduce((a, b) => a + b, 0) / odds.length : 0;

    // Taxa de acerto em odds > 2.0
    const oddsAltas = apostas.filter(a => getOdd(a) > 2.0);
    const oddsAltasGanhas = oddsAltas.filter(a => a.resultado === "GREEN" || a.resultado === "MEIO_GREEN").length;
    const oddsAltasLiquidadas = oddsAltas.filter(a => a.resultado && a.resultado !== "PENDENTE").length;
    const taxaAcertoOddsAltas = oddsAltasLiquidadas > 0 ? (oddsAltasGanhas / oddsAltasLiquidadas) * 100 : 0;

    // Lucro por R$ 1.000 apostados
    const lucroPorMil = valorTotal > 0 ? (lucroTotal / valorTotal) * 1000 : 0;

    // Stake média
    const stakeMedia = apostas.length > 0 
      ? apostas.reduce((acc, a) => acc + getStake(a), 0) / apostas.length 
      : 0;
    const stakeMaxima = apostas.length > 0 
      ? Math.max(...apostas.map(a => getStake(a))) 
      : 0;

    // Maior cotação ganha
    const apostasGanhas = apostas.filter(a => a.resultado === "GREEN" || a.resultado === "MEIO_GREEN");
    const maiorCotacaoGanha = apostasGanhas.length > 0 
      ? Math.max(...apostasGanhas.map(a => getOdd(a))) 
      : 0;

    return {
      // Resumo
      vencedoras,
      perdedoras,
      reembolsadas,
      emCurso,
      valorTotal,
      valorEmCurso,
      lucroTotal,
      roi,
      taxaAcerto,
      maxVitorias,
      maxDerrotas,
      // Por Valor
      porValor,
      // Por Cotação
      porCotacao,
      // Por Esporte
      porEsporte,
      // Avançado
      maiorLucro,
      maiorPerda,
      maiorPrejuizoDiario,
      oddMedia,
      taxaAcertoOddsAltas,
      lucroPorMil,
      stakeMedia,
      stakeMaxima,
      maiorCotacaoGanha,
    };
  }, [apostas]);

  if (apostas.length === 0) {
    return null;
  }

  // ==================== RENDERIZAÇÃO DAS ABAS ====================

  // Aba Resumo
  const renderResumo = () => (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-2">
      <StatCell label="Vencedoras" value={stats.vencedoras} valueClass="text-emerald-400" />
      <StatCell label="Perdedoras" value={stats.perdedoras} valueClass="text-red-400" />
      <StatCell label="Reembolsadas" value={stats.reembolsadas} />
      <StatCell label="Em curso" value={stats.emCurso} valueClass="text-blue-400" />
      <StatCell label="Valor apostado" value={formatCurrency(stats.valorTotal)} />
      <StatCell label="Em curso" value={formatCurrency(stats.valorEmCurso)} valueClass="text-blue-400" />
      <StatCell 
        label="Lucro/Prejuízo" 
        value={formatCurrency(stats.lucroTotal)} 
        valueClass={stats.lucroTotal >= 0 ? "text-emerald-400" : "text-red-400"} 
      />
      <StatCell 
        label="ROI" 
        value={formatPercent(stats.roi)} 
        valueClass={stats.roi >= 0 ? "text-emerald-400" : "text-red-400"} 
      />
      <StatCell 
        label="Taxa de acerto" 
        value={`${stats.taxaAcerto.toFixed(1)}%`} 
        valueClass={stats.taxaAcerto >= 50 ? "text-emerald-400" : "text-amber-400"} 
      />
      <StatCell label="Máx. vitórias seguidas" value={stats.maxVitorias} valueClass="text-emerald-400" />
      <StatCell label="Máx. derrotas seguidas" value={stats.maxDerrotas} valueClass="text-red-400" />
    </div>
  );

  // Aba Por Valor
  const renderPorValor = () => (
    <div className="space-y-4">
      {stats.porValor.length === 0 ? (
        <div className="text-center py-8 text-muted-foreground text-sm">
          Nenhuma aposta registrada
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-border/50">
                <th className="text-left py-2 px-2 text-muted-foreground font-medium">Faixa</th>
                <th className="text-right py-2 px-2 text-muted-foreground font-medium">Apostas</th>
                <th className="text-right py-2 px-2 text-muted-foreground font-medium">Volume</th>
                <th className="text-right py-2 px-2 text-muted-foreground font-medium">Lucro</th>
                <th className="text-right py-2 px-2 text-muted-foreground font-medium">ROI</th>
                <th className="text-right py-2 px-2 text-muted-foreground font-medium">Sucesso</th>
              </tr>
            </thead>
            <tbody>
              {stats.porValor.map((row, i) => (
                <tr key={row.faixa} className={i % 2 === 0 ? "bg-muted/20" : ""}>
                  <td className="py-2 px-2 font-medium">{row.faixa}</td>
                  <td className="py-2 px-2 text-right tabular-nums">{row.apostas}</td>
                  <td className="py-2 px-2 text-right tabular-nums">{formatCurrency(row.volume)}</td>
                  <td className={`py-2 px-2 text-right tabular-nums font-medium ${row.lucro >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                    {formatCurrency(row.lucro)}
                  </td>
                  <td className={`py-2 px-2 text-right tabular-nums ${row.roi >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                    {formatPercent(row.roi)}
                  </td>
                  <td className={`py-2 px-2 text-right tabular-nums ${row.sucesso >= 50 ? "text-emerald-400" : "text-amber-400"}`}>
                    {row.sucesso.toFixed(1)}%
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );

  // Aba Por Cotação
  const renderPorCotacao = () => {
    const chartData = stats.porCotacao.map(d => ({
      faixa: d.faixa,
      lucro: d.lucro,
      ganhas: d.ganhas,
      perdidas: d.perdidas,
      reembolsadas: d.reembolsadas,
    }));

    return (
      <div className="space-y-4">
        {/* Gráfico de Lucros por Faixa */}
        <div className="h-[180px]">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData} margin={{ top: 5, right: 5, left: 5, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.3} />
              <XAxis 
                dataKey="faixa" 
                tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
                axisLine={{ stroke: "hsl(var(--border))" }}
              />
              <YAxis 
                tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
                axisLine={{ stroke: "hsl(var(--border))" }}
                tickFormatter={(v) => `R$${v}`}
              />
              <RechartsTooltip 
                contentStyle={{ 
                  backgroundColor: "hsl(var(--popover))", 
                  border: "1px solid hsl(var(--border))",
                  borderRadius: "8px",
                  fontSize: "11px"
                }}
                formatter={(value: number) => [formatCurrency(value), "Lucro"]}
              />
              <Bar dataKey="lucro" radius={[4, 4, 0, 0]}>
                {chartData.map((entry, index) => (
                  <Cell 
                    key={`cell-${index}`} 
                    fill={entry.lucro >= 0 ? "hsl(142, 76%, 36%)" : "hsl(0, 84%, 60%)"} 
                  />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Gráfico Comparativo */}
        <div className="h-[160px]">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData} margin={{ top: 5, right: 5, left: 5, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.3} />
              <XAxis 
                dataKey="faixa" 
                tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
                axisLine={{ stroke: "hsl(var(--border))" }}
              />
              <YAxis 
                tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
                axisLine={{ stroke: "hsl(var(--border))" }}
              />
              <RechartsTooltip 
                contentStyle={{ 
                  backgroundColor: "hsl(var(--popover))", 
                  border: "1px solid hsl(var(--border))",
                  borderRadius: "8px",
                  fontSize: "11px"
                }}
              />
              <Legend 
                wrapperStyle={{ fontSize: "10px" }}
                iconSize={8}
              />
              <Bar dataKey="ganhas" name="Ganhas" fill="hsl(142, 76%, 36%)" radius={[2, 2, 0, 0]} />
              <Bar dataKey="perdidas" name="Perdidas" fill="hsl(0, 84%, 60%)" radius={[2, 2, 0, 0]} />
              <Bar dataKey="reembolsadas" name="Reembolsadas" fill="hsl(var(--muted-foreground))" radius={[2, 2, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
    );
  };

  // Aba Por Esporte
  const renderPorEsporte = () => (
    <div className="space-y-4">
      {stats.porEsporte.length === 0 ? (
        <div className="text-center py-8 text-muted-foreground text-sm">
          Nenhum esporte registrado
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-border/50">
                <th className="text-left py-2 px-2 text-muted-foreground font-medium">Esporte</th>
                <th className="text-right py-2 px-1 text-muted-foreground font-medium">Apo</th>
                <th className="text-right py-2 px-1 text-muted-foreground font-medium">G</th>
                <th className="text-right py-2 px-1 text-muted-foreground font-medium">P</th>
                <th className="text-right py-2 px-1 text-muted-foreground font-medium">R</th>
                <th className="text-right py-2 px-2 text-muted-foreground font-medium">Volume</th>
                <th className="text-right py-2 px-2 text-muted-foreground font-medium">Lucro</th>
                <th className="text-right py-2 px-2 text-muted-foreground font-medium">ROI</th>
                <th className="text-right py-2 px-2 text-muted-foreground font-medium">%</th>
              </tr>
            </thead>
            <tbody>
              {stats.porEsporte.map((row, i) => (
                <tr key={row.esporte} className={i % 2 === 0 ? "bg-muted/20" : ""}>
                  <td className="py-2 px-2 font-medium truncate max-w-[100px]" title={row.esporte}>
                    {row.esporte}
                  </td>
                  <td className="py-2 px-1 text-right tabular-nums">{row.apostas}</td>
                  <td className="py-2 px-1 text-right tabular-nums text-emerald-400">{row.ganhas}</td>
                  <td className="py-2 px-1 text-right tabular-nums text-red-400">{row.perdidas}</td>
                  <td className="py-2 px-1 text-right tabular-nums text-muted-foreground">{row.reembolsadas}</td>
                  <td className="py-2 px-2 text-right tabular-nums">{formatCurrency(row.volume)}</td>
                  <td className={`py-2 px-2 text-right tabular-nums font-medium ${row.lucro >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                    {formatCurrency(row.lucro)}
                  </td>
                  <td className={`py-2 px-2 text-right tabular-nums ${row.roi >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                    {formatPercent(row.roi)}
                  </td>
                  <td className={`py-2 px-2 text-right tabular-nums ${row.sucesso >= 50 ? "text-emerald-400" : "text-amber-400"}`}>
                    {row.sucesso.toFixed(0)}%
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );

  // Aba Avançado
  const renderAvancado = () => (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
      <div className="space-y-2">
        <SectionHeader title="ROI" icon={TrendingUp} />
        <StatCell 
          label="ROI médio" 
          value={formatPercent(stats.roi)} 
          valueClass={stats.roi >= 0 ? "text-emerald-400" : "text-red-400"}
          tooltip="Lucro total ÷ Volume total apostado"
        />
        <StatCell 
          label="Lucro por R$ 1.000" 
          value={formatCurrency(stats.lucroPorMil)}
          valueClass={stats.lucroPorMil >= 0 ? "text-emerald-400" : "text-red-400"}
          tooltip="Quanto você ganha para cada R$ 1.000 apostados"
        />
      </div>

      <div className="space-y-2">
        <SectionHeader title="Risco" icon={AlertTriangle} />
        <StatCell 
          label="Maior prejuízo unitário" 
          value={formatCurrency(stats.maiorPerda)} 
          valueClass="text-red-400"
          tooltip="Maior perda em uma única aposta"
        />
        <StatCell 
          label="Maior prejuízo diário" 
          value={formatCurrency(stats.maiorPrejuizoDiario)} 
          valueClass="text-red-400"
          tooltip="Maior soma negativa em um único dia"
        />
      </div>

      <div className="space-y-2">
        <SectionHeader title="Eficiência" icon={Zap} />
        <StatCell 
          label="Stake média" 
          value={formatCurrency(stats.stakeMedia)}
          tooltip="Valor médio apostado"
        />
        <StatCell 
          label="Stake máxima" 
          value={formatCurrency(stats.stakeMaxima)}
          tooltip="Maior valor apostado"
        />
      </div>

      <div className="space-y-2">
        <SectionHeader title="Cotações" icon={Target} />
        <StatCell 
          label="Odd média" 
          value={stats.oddMedia.toFixed(2)}
          tooltip="Média de todas as cotações"
        />
        <StatCell 
          label="Maior odd ganha" 
          value={stats.maiorCotacaoGanha > 0 ? stats.maiorCotacaoGanha.toFixed(2) : "-"}
          valueClass="text-emerald-400"
        />
      </div>

      <div className="space-y-2">
        <SectionHeader title="Qualidade" icon={Trophy} />
        <StatCell 
          label="Acerto em odd > 2.0" 
          value={`${stats.taxaAcertoOddsAltas.toFixed(1)}%`}
          valueClass={stats.taxaAcertoOddsAltas >= 40 ? "text-emerald-400" : "text-amber-400"}
          tooltip="Taxa de acerto em apostas com cotação > 2.0"
        />
        <StatCell 
          label="Maior lucro unitário" 
          value={formatCurrency(stats.maiorLucro)}
          valueClass="text-emerald-400"
          tooltip="Maior lucro em uma única aposta"
        />
      </div>
    </div>
  );

  return (
    <Card className="border-purple-500/20">
      <CardHeader className="py-3 pb-0">
        <CardTitle className="text-sm font-medium flex items-center gap-2">
          <BarChart3 className="h-4 w-4 text-purple-400" />
          Estatísticas
        </CardTitle>
      </CardHeader>
      <CardContent className="pt-2 pb-4">
        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="w-full grid grid-cols-5 h-8 mb-4">
            <TabsTrigger value="resumo" className="text-xs data-[state=active]:bg-purple-500/20">
              Resumo
            </TabsTrigger>
            <TabsTrigger value="por-valor" className="text-xs data-[state=active]:bg-purple-500/20">
              Por Valor
            </TabsTrigger>
            <TabsTrigger value="por-cotacao" className="text-xs data-[state=active]:bg-purple-500/20">
              Por Cotação
            </TabsTrigger>
            <TabsTrigger value="por-esporte" className="text-xs data-[state=active]:bg-purple-500/20">
              Por Esporte
            </TabsTrigger>
            <TabsTrigger value="avancado" className="text-xs data-[state=active]:bg-purple-500/20">
              Avançado
            </TabsTrigger>
          </TabsList>

          <TabsContent value="resumo" className="mt-0">
            {renderResumo()}
          </TabsContent>

          <TabsContent value="por-valor" className="mt-0">
            {renderPorValor()}
          </TabsContent>

          <TabsContent value="por-cotacao" className="mt-0">
            {renderPorCotacao()}
          </TabsContent>

          <TabsContent value="por-esporte" className="mt-0">
            {renderPorEsporte()}
          </TabsContent>

          <TabsContent value="avancado" className="mt-0">
            {renderAvancado()}
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}
