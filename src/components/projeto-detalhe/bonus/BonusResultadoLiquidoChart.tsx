import { useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Receipt, TrendingUp, TrendingDown } from "lucide-react";
import {
  ResponsiveContainer,
  ComposedChart,
  Area,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ReferenceLine,
} from "recharts";
import { format, parseISO, differenceInDays } from "date-fns";
import { ptBR } from "date-fns/locale";
import { ProjectBonus } from "@/hooks/useProjectBonuses";

interface BonusBetData {
  id: string;
  data_aposta: string;
  lucro_prejuizo: number | null;
  pl_consolidado: number | null;
  bonus_id: string | null;
  stake_bonus?: number | null;
  estrategia?: string | null;
}

interface BonusResultadoLiquidoChartProps {
  bonuses: ProjectBonus[];
  bonusBets: BonusBetData[];
  formatCurrency: (value: number) => string;
  isSingleDayPeriod?: boolean;
  dateRange?: { start: Date; end: Date } | null;
}

interface ChartDataPoint {
  data: string;
  label: string;
  bonus_creditado: number;
  juice: number;
  resultado_liquido: number;
  acumulado: number;
}

export function BonusResultadoLiquidoChart({
  bonuses,
  bonusBets,
  formatCurrency,
  isSingleDayPeriod = false,
  dateRange,
}: BonusResultadoLiquidoChartProps) {
  // Calcula dados do gráfico: Resultado Líquido = Bônus creditados + Juice
  const chartData = useMemo(() => {
    // Agrupa bônus creditados por data
    const bonusByDate: Record<string, number> = {};
    bonuses
      .filter(b => b.status === "credited" && b.credited_at)
      .forEach(b => {
        const date = b.credited_at!.split("T")[0];
        
        // Filtra por dateRange se especificado
        if (dateRange) {
          const bonusDate = parseISO(date);
          if (bonusDate < dateRange.start || bonusDate > dateRange.end) return;
        }
        
        bonusByDate[date] = (bonusByDate[date] || 0) + (b.bonus_amount || 0);
      });

    // Agrupa juice (P&L das apostas com bônus) por data
    // Inclui apostas com bonus_id OU estratégia EXTRACAO_BONUS
    const juiceByDate: Record<string, number> = {};
    bonusBets.forEach(bet => {
      const isBonusBet = bet.bonus_id || bet.estrategia === "EXTRACAO_BONUS";
      if (!isBonusBet) return;
      const date = bet.data_aposta.split("T")[0];
      const pl = bet.pl_consolidado ?? bet.lucro_prejuizo ?? 0;
      juiceByDate[date] = (juiceByDate[date] || 0) + pl;
    });

    // Combina todas as datas
    const allDates = new Set([...Object.keys(bonusByDate), ...Object.keys(juiceByDate)]);
    const sortedDates = Array.from(allDates).sort();

    if (sortedDates.length === 0) return [];

    // Calcula resultado líquido e acumulado
    let acumulado = 0;
    const data: ChartDataPoint[] = sortedDates.map(date => {
      const bonus = bonusByDate[date] || 0;
      const juice = juiceByDate[date] || 0;
      const resultado_liquido = bonus + juice;
      acumulado += resultado_liquido;

      return {
        data: date,
        label: format(parseISO(date), "dd/MM", { locale: ptBR }),
        bonus_creditado: bonus,
        juice: juice,
        resultado_liquido,
        acumulado,
      };
    });

    return data;
  }, [bonuses, bonusBets, dateRange]);

  // KPIs
  const kpis = useMemo(() => {
    const totalBonus = chartData.reduce((acc, d) => acc + d.bonus_creditado, 0);
    const totalJuice = chartData.reduce((acc, d) => acc + d.juice, 0);
    const resultadoLiquido = totalBonus + totalJuice;
    const diasOperados = chartData.length;

    return { totalBonus, totalJuice, resultadoLiquido, diasOperados };
  }, [chartData]);

  // Cores
  const colorBonus = "hsl(var(--warning))"; // Amarelo para bônus
  const colorJuice = "hsl(var(--destructive))"; // Vermelho para juice (custo)
  const colorResultado = kpis.resultadoLiquido >= 0 ? "hsl(var(--primary))" : "hsl(var(--destructive))";

  if (chartData.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <Receipt className="h-4 w-4 text-warning" />
            Resultado Líquido de Bônus
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-center h-[200px] text-muted-foreground">
            Sem dados para exibir
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <Receipt className="h-4 w-4 text-warning" />
            Resultado Líquido de Bônus
          </CardTitle>
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="outline" className="text-xs border-warning/30 text-warning">
              Bônus: {formatCurrency(kpis.totalBonus)}
            </Badge>
            <Badge variant="outline" className="text-xs border-destructive/30 text-destructive">
              Juice: {formatCurrency(kpis.totalJuice)}
            </Badge>
            <Badge 
              className={`text-xs ${
                kpis.resultadoLiquido >= 0 
                  ? "bg-primary/20 text-primary border-primary/30" 
                  : "bg-destructive/20 text-destructive border-destructive/30"
              }`}
            >
              {kpis.resultadoLiquido >= 0 ? <TrendingUp className="h-3 w-3 mr-1" /> : <TrendingDown className="h-3 w-3 mr-1" />}
              Líquido: {formatCurrency(kpis.resultadoLiquido)}
            </Badge>
          </div>
        </div>
        <p className="text-xs text-muted-foreground mt-1">
          Evolução: Bônus creditados + Juice (custo operacional) • {kpis.diasOperados} dias
        </p>
      </CardHeader>
      <CardContent className="pt-2">
        <div className="h-[280px]">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={chartData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-muted/30" />
              <XAxis
                dataKey="label"
                tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
                tickLine={false}
                axisLine={false}
              />
              <YAxis
                tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
                tickFormatter={(value) => {
                  if (Math.abs(value) >= 1000) return `${(value / 1000).toFixed(0)}k`;
                  return value.toFixed(0);
                }}
                tickLine={false}
                axisLine={false}
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: "hsl(var(--card))",
                  border: "1px solid hsl(var(--border))",
                  borderRadius: "8px",
                  fontSize: "12px",
                }}
                formatter={(value: number, name: string) => {
                  const labels: Record<string, string> = {
                    bonus_creditado: "Bônus Creditado",
                    juice: "Juice (Custo)",
                    acumulado: "Acumulado",
                  };
                  return [formatCurrency(value), labels[name] || name];
                }}
                labelFormatter={(label) => `Data: ${label}`}
              />
              <Legend
                wrapperStyle={{ fontSize: "11px" }}
                formatter={(value) => {
                  const labels: Record<string, string> = {
                    bonus_creditado: "Bônus Creditado",
                    juice: "Juice (Custo)",
                    acumulado: "Resultado Acumulado",
                  };
                  return labels[value] || value;
                }}
              />
              <ReferenceLine y={0} stroke="hsl(var(--muted-foreground))" strokeDasharray="3 3" />
              
              {/* Barras para bônus e juice */}
              <Bar
                dataKey="bonus_creditado"
                fill={colorBonus}
                opacity={0.8}
                radius={[2, 2, 0, 0]}
                stackId="stack"
              />
              <Bar
                dataKey="juice"
                fill={colorJuice}
                opacity={0.8}
                radius={[2, 2, 0, 0]}
                stackId="stack"
              />
              
              {/* Linha de acumulado */}
              <Area
                type="monotone"
                dataKey="acumulado"
                stroke={colorResultado}
                fill={colorResultado}
                fillOpacity={0.1}
                strokeWidth={2}
                dot={chartData.length <= 15}
              />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
}
