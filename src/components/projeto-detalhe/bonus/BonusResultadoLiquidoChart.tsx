import { useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Receipt, TrendingUp, TrendingDown } from "lucide-react";
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ReferenceLine,
} from "recharts";
import { format, parseISO } from "date-fns";
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
  resultado_dia: number;
  acumulado: number;
  // Para área gradiente
  acumuladoPositivo: number;
  acumuladoNegativo: number;
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
      .filter(b => (b.status === "credited" || b.status === "finalized") && b.credited_at)
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
      const resultado_dia = bonus + juice;
      acumulado += resultado_dia;

      return {
        data: date,
        label: format(parseISO(date), "dd/MM", { locale: ptBR }),
        bonus_creditado: bonus,
        juice: juice,
        resultado_dia,
        acumulado,
        acumuladoPositivo: acumulado >= 0 ? acumulado : 0,
        acumuladoNegativo: acumulado < 0 ? acumulado : 0,
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
    const ultimoAcumulado = chartData.length > 0 ? chartData[chartData.length - 1].acumulado : 0;

    return { totalBonus, totalJuice, resultadoLiquido, diasOperados, ultimoAcumulado };
  }, [chartData]);

  // Cores
  const colorPositivo = "hsl(var(--primary))";
  const colorNegativo = "hsl(var(--destructive))";
  const colorJuice = "hsl(142, 76%, 36%)"; // Verde para juice positivo
  const colorJuiceNeg = "hsl(var(--destructive))";

  if (chartData.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <Receipt className="h-4 w-4 text-warning" />
            Evolução do Resultado Líquido de Bônus
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

  // Determina cor do acumulado final
  const acumuladoFinal = chartData[chartData.length - 1]?.acumulado ?? 0;
  const isPositivo = acumuladoFinal >= 0;

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <Receipt className="h-4 w-4 text-warning" />
            Evolução do Resultado Líquido de Bônus
          </CardTitle>
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="outline" className="text-xs border-warning/30 text-warning">
              Bônus: {formatCurrency(kpis.totalBonus)}
            </Badge>
            <Badge 
              variant="outline" 
              className={`text-xs ${kpis.totalJuice >= 0 ? "border-primary/30 text-primary" : "border-destructive/30 text-destructive"}`}
            >
              Juice: {formatCurrency(kpis.totalJuice)}
            </Badge>
            <Badge 
              className={`text-xs ${
                isPositivo 
                  ? "bg-primary/20 text-primary border-primary/30" 
                  : "bg-destructive/20 text-destructive border-destructive/30"
              }`}
            >
              {isPositivo ? <TrendingUp className="h-3 w-3 mr-1" /> : <TrendingDown className="h-3 w-3 mr-1" />}
              Acumulado: {formatCurrency(acumuladoFinal)}
            </Badge>
          </div>
        </div>
        <p className="text-xs text-muted-foreground mt-1">
          Acumulado diário • {kpis.diasOperados} {kpis.diasOperados === 1 ? "dia" : "dias"} de operação
        </p>
      </CardHeader>
      <CardContent className="pt-2">
        <div className="h-[280px]">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={chartData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="gradientPositivo" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor={colorPositivo} stopOpacity={0.4} />
                  <stop offset="95%" stopColor={colorPositivo} stopOpacity={0.05} />
                </linearGradient>
                <linearGradient id="gradientNegativo" x1="0" y1="1" x2="0" y2="0">
                  <stop offset="5%" stopColor={colorNegativo} stopOpacity={0.4} />
                  <stop offset="95%" stopColor={colorNegativo} stopOpacity={0.05} />
                </linearGradient>
              </defs>
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
                content={({ active, payload, label }) => {
                  if (!active || !payload || payload.length === 0) return null;
                  const data = payload[0]?.payload as ChartDataPoint;
                  if (!data) return null;

                  return (
                    <div className="bg-card border border-border rounded-lg p-3 shadow-lg">
                      <p className="text-xs text-muted-foreground mb-2">Data: {label}</p>
                      <div className="space-y-1">
                        {data.bonus_creditado > 0 && (
                          <div className="flex justify-between gap-4 text-xs">
                            <span className="text-warning">Bônus Creditado:</span>
                            <span className="font-medium">{formatCurrency(data.bonus_creditado)}</span>
                          </div>
                        )}
                        <div className="flex justify-between gap-4 text-xs">
                          <span className={data.juice >= 0 ? "text-primary" : "text-destructive"}>
                            Juice do Dia:
                          </span>
                          <span className={`font-medium ${data.juice >= 0 ? "text-primary" : "text-destructive"}`}>
                            {formatCurrency(data.juice)}
                          </span>
                        </div>
                        <div className="border-t border-border pt-1 mt-1">
                          <div className="flex justify-between gap-4 text-xs">
                            <span className="text-muted-foreground">Resultado do Dia:</span>
                            <span className={`font-medium ${data.resultado_dia >= 0 ? "text-primary" : "text-destructive"}`}>
                              {formatCurrency(data.resultado_dia)}
                            </span>
                          </div>
                          <div className="flex justify-between gap-4 text-xs font-semibold mt-1">
                            <span className={data.acumulado >= 0 ? "text-primary" : "text-destructive"}>
                              Acumulado:
                            </span>
                            <span className={data.acumulado >= 0 ? "text-primary" : "text-destructive"}>
                              {formatCurrency(data.acumulado)}
                            </span>
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                }}
              />
              <ReferenceLine y={0} stroke="hsl(var(--muted-foreground))" strokeDasharray="3 3" strokeOpacity={0.5} />
              
              {/* Área principal - Resultado Acumulado */}
              <Area
                type="monotone"
                dataKey="acumulado"
                stroke={isPositivo ? colorPositivo : colorNegativo}
                fill={isPositivo ? "url(#gradientPositivo)" : "url(#gradientNegativo)"}
                strokeWidth={2.5}
                dot={(props) => {
                  const { cx, cy, payload } = props;
                  if (chartData.length > 20) return null;
                  const isPos = payload.acumulado >= 0;
                  return (
                    <circle
                      cx={cx}
                      cy={cy}
                      r={4}
                      fill={isPos ? colorPositivo : colorNegativo}
                      stroke="hsl(var(--card))"
                      strokeWidth={2}
                    />
                  );
                }}
                activeDot={{
                  r: 6,
                  fill: isPositivo ? colorPositivo : colorNegativo,
                  stroke: "hsl(var(--card))",
                  strokeWidth: 2,
                }}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
}
