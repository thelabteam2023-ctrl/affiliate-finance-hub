import { useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { TrendingUp, TrendingDown } from "lucide-react";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";

interface Props {
  daily: Array<{ dia: string; lucro: number; qtd: number }>;
  currencySymbol: string;
}

const MONTH_NAMES_SHORT = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];

function formatCurrency(value: number, symbol: string) {
  return `${symbol} ${value.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function formatAxis(value: number, symbol: string) {
  if (Math.abs(value) >= 1000) {
    return `${symbol}${(value / 1000).toFixed(1)}k`;
  }
  return `${symbol}${value.toFixed(0)}`;
}

const CustomTooltip = ({ active, payload, symbol }: any) => {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  const isPositive = d.impacto >= 0;

  return (
    <div className="bg-popover border border-border rounded-lg p-3 shadow-lg text-sm space-y-1.5">
      <div className="font-semibold text-foreground border-b border-border pb-1.5 mb-1.5">
        {d.dataFormatada}
      </div>
      <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
        <span className="text-muted-foreground">Apostas:</span>
        <span className="text-foreground font-medium">{d.qtd}</span>
        <span className="text-muted-foreground">Lucro do dia:</span>
        <span className={`font-semibold ${isPositive ? 'text-emerald-500' : 'text-red-500'}`}>
          {isPositive ? '+' : ''}{formatCurrency(d.impacto, symbol)}
        </span>
        <span className="text-muted-foreground">Acumulado:</span>
        <span className={`font-bold ${d.acumulado >= 0 ? 'text-emerald-500' : 'text-red-500'}`}>
          {formatCurrency(d.acumulado, symbol)}
        </span>
      </div>
    </div>
  );
};

export function SharedDailyChart({ daily, currencySymbol }: Props) {
  const { chartData, totalDias, totalApostas, lastValue, isPositive, useMonthlyTicks, monthlyTickIndices } = useMemo(() => {
    if (!daily.length) return { chartData: [], totalDias: 0, totalApostas: 0, lastValue: 0, isPositive: true, useMonthlyTicks: false, monthlyTickIndices: null as Set<number> | null };

    const sorted = [...daily].sort((a, b) => a.dia.localeCompare(b.dia));
    let cumulative = 0;
    const mapped = sorted.map((d) => {
      cumulative += d.lucro;
      const [, m, day] = d.dia.split("-");
      return {
        dia: d.dia,
        xLabel: `${day}/${m}`,
        dataFormatada: `${day}/${m}`,
        impacto: d.lucro,
        acumulado: cumulative,
        qtd: d.qtd,
      };
    });

    const last = mapped[mapped.length - 1]?.acumulado ?? 0;
    const monthly = mapped.length > 20;
    
    let indices: Set<number> | null = null;
    if (monthly) {
      indices = new Set<number>();
      let lastMonth = '';
      mapped.forEach((d, i) => {
        const month = d.dia.substring(0, 7);
        if (month !== lastMonth) {
          indices!.add(i);
          lastMonth = month;
        }
      });
    }

    return {
      chartData: mapped,
      totalDias: mapped.length,
      totalApostas: sorted.reduce((s, d) => s + d.qtd, 0),
      lastValue: last,
      isPositive: last >= 0,
      useMonthlyTicks: monthly,
      monthlyTickIndices: indices,
    };
  }, [daily]);

  if (!chartData.length) return null;

  const strokeColor = isPositive ? "hsl(var(--chart-2))" : "hsl(var(--destructive))";
  const fillColor = isPositive ? "hsl(var(--chart-2))" : "hsl(var(--destructive))";
  const gradientId = "sharedAreaGradient";

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            {isPositive ? (
              <TrendingUp className="h-4 w-4 text-emerald-500" />
            ) : (
              <TrendingDown className="h-4 w-4 text-red-500" />
            )}
            <CardTitle className="text-sm font-medium">Evolução do Lucro</CardTitle>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">
              Acumulado diário ({totalDias} dias • {totalApostas} apostas)
            </span>
            <Badge
              variant="outline"
              className={`text-xs font-bold ${
                isPositive
                  ? "text-emerald-500 border-emerald-500/30"
                  : "text-red-500 border-red-500/30"
              }`}
            >
              {formatCurrency(lastValue, currencySymbol)}
            </Badge>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="h-[300px]">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={chartData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor={fillColor} stopOpacity={0.3} />
                  <stop offset="95%" stopColor={fillColor} stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
              <XAxis
                dataKey="xLabel"
                stroke="hsl(var(--muted-foreground))"
                fontSize={11}
                tickLine={false}
                axisLine={false}
                interval={useMonthlyTicks ? 0 : undefined}
                tick={({ x, y, payload, index }: any) => {
                  if (useMonthlyTicks && monthlyTickIndices) {
                    if (!monthlyTickIndices.has(index)) return <text />;
                    const entry = chartData[index];
                    const monthIdx = entry ? parseInt(entry.dia.substring(5, 7), 10) - 1 : -1;
                    const label = monthIdx >= 0 ? MONTH_NAMES_SHORT[monthIdx] : '';
                    return (
                      <text x={x} y={y + 10} textAnchor="middle" fill="hsl(var(--muted-foreground))" fontSize={11} fontWeight={500}>
                        {label}
                      </text>
                    );
                  }
                  if (!payload.value) return <text />;
                  return (
                    <text x={x} y={y + 10} textAnchor="middle" fill="hsl(var(--muted-foreground))" fontSize={11}>
                      {payload.value}
                    </text>
                  );
                }}
              />
              <YAxis
                stroke="hsl(var(--muted-foreground))"
                fontSize={11}
                tickLine={false}
                axisLine={false}
                width={60}
                tickFormatter={(v) => formatAxis(v, currencySymbol)}
              />
              <Tooltip content={<CustomTooltip symbol={currencySymbol} />} />
              <Area
                type="monotone"
                dataKey="acumulado"
                stroke={strokeColor}
                strokeWidth={2}
                fill={`url(#${gradientId})`}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
}
