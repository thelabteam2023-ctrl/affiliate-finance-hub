import { useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Receipt, TrendingUp, TrendingDown, AreaChart as AreaChartIcon, BarChart3, Activity } from "lucide-react";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ReferenceLine,
  Cell,
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
  acumuladoPositivo: number;
  acumuladoNegativo: number;
}

type ChartMode = "resultado" | "bonus" | "juice";

export function BonusResultadoLiquidoChart({
  bonuses,
  bonusBets,
  formatCurrency,
  isSingleDayPeriod = false,
  dateRange,
}: BonusResultadoLiquidoChartProps) {
  const [chartMode, setChartMode] = useState<ChartMode>("resultado");

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
    
    // Performance % = (Resultado Líquido / Total Bônus) * 100
    const performancePercent = totalBonus > 0 
      ? ((resultadoLiquido / totalBonus) * 100) 
      : 0;

    return { totalBonus, totalJuice, resultadoLiquido, diasOperados, ultimoAcumulado, performancePercent };
  }, [chartData]);

  // Cores
  const colorPositivo = "hsl(var(--chart-2))";
  const colorNegativo = "hsl(var(--destructive))";
  const colorWarning = "hsl(var(--warning))";
  
  // Helper para cor do performance %: <60% vermelho, 60-70% amarelo, 70%+ verde
  const getPerformanceColorClass = (percent: number) => {
    if (percent >= 70) return "border-emerald-500/50 text-emerald-500 bg-emerald-500/10";
    if (percent >= 60) return "border-warning/50 text-warning bg-warning/10";
    return "border-destructive/50 text-destructive bg-destructive/10";
  };

  // Configurações por modo
  const modeConfig = {
    resultado: {
      title: "Evolução do Resultado Líquido de Bônus",
      subtitle: "Acumulado diário (Bônus + Juice)",
      icon: <AreaChartIcon className="h-4 w-4 text-warning" />,
    },
    bonus: {
      title: "Bônus Recebidos por Período",
      subtitle: "Volume bruto de bônus creditados por dia",
      icon: <Receipt className="h-4 w-4 text-warning" />,
    },
    juice: {
      title: "Juice por Período",
      subtitle: "Custo ou ganho operacional diário",
      icon: <Activity className="h-4 w-4 text-warning" />,
    },
  };

  const currentConfig = modeConfig[chartMode];

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

  // Renderiza KPIs baseado no modo
  const renderKPIs = () => {
    switch (chartMode) {
      case "resultado":
        return (
          <>
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
            <Badge 
              variant="outline"
              className={`text-xs font-semibold ${getPerformanceColorClass(kpis.performancePercent)}`}
            >
              Performance: {kpis.performancePercent.toFixed(1)}%
            </Badge>
          </>
        );
      case "bonus":
        return (
          <>
            <Badge variant="outline" className="text-xs border-warning/30 text-warning">
              Total Bônus: {formatCurrency(kpis.totalBonus)}
            </Badge>
            <Badge variant="outline" className="text-xs border-muted-foreground/30 text-muted-foreground">
              {kpis.diasOperados} {kpis.diasOperados === 1 ? "dia" : "dias"} com bônus
            </Badge>
          </>
        );
      case "juice":
        return (
          <>
            <Badge 
              variant="outline" 
              className={`text-xs ${kpis.totalJuice >= 0 ? "border-primary/30 text-primary" : "border-destructive/30 text-destructive"}`}
            >
              {kpis.totalJuice >= 0 ? <TrendingUp className="h-3 w-3 mr-1" /> : <TrendingDown className="h-3 w-3 mr-1" />}
              Juice Total: {formatCurrency(kpis.totalJuice)}
            </Badge>
            <Badge variant="outline" className="text-xs border-muted-foreground/30 text-muted-foreground">
              {kpis.diasOperados} {kpis.diasOperados === 1 ? "dia" : "dias"} operados
            </Badge>
          </>
        );
    }
  };

  // Renderiza gráfico baseado no modo
  const renderChart = () => {
    switch (chartMode) {
      case "resultado":
        return (
          <AreaChart data={chartData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
            <defs>
              <linearGradient id="bonusGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor={isPositivo ? colorPositivo : colorNegativo} stopOpacity={0.3} />
                <stop offset="95%" stopColor={isPositivo ? colorPositivo : colorNegativo} stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
            <XAxis
              dataKey="label"
              stroke="hsl(var(--muted-foreground))"
              fontSize={11}
              tickLine={false}
              axisLine={false}
            />
            <YAxis
              stroke="hsl(var(--muted-foreground))"
              fontSize={11}
              tickLine={false}
              axisLine={false}
              width={60}
              tickFormatter={(value) => {
                if (Math.abs(value) >= 1000) return `${(value / 1000).toFixed(1)}k`;
                return value.toFixed(0);
              }}
            />
            <Tooltip content={<ResultadoTooltip formatCurrency={formatCurrency} />} />
            <ReferenceLine y={0} stroke="hsl(var(--muted-foreground))" strokeDasharray="3 3" strokeOpacity={0.5} />
            <Area
              type="monotone"
              dataKey="acumulado"
              stroke={isPositivo ? colorPositivo : colorNegativo}
              strokeWidth={2}
              fill="url(#bonusGradient)"
            />
          </AreaChart>
        );
      
      case "bonus":
        return (
          <BarChart data={chartData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
            <XAxis
              dataKey="label"
              stroke="hsl(var(--muted-foreground))"
              fontSize={11}
              tickLine={false}
              axisLine={false}
            />
            <YAxis
              stroke="hsl(var(--muted-foreground))"
              fontSize={11}
              tickLine={false}
              axisLine={false}
              width={60}
              tickFormatter={(value) => {
                if (Math.abs(value) >= 1000) return `${(value / 1000).toFixed(1)}k`;
                return value.toFixed(0);
              }}
            />
            <Tooltip content={<BonusTooltip formatCurrency={formatCurrency} />} />
            <Bar dataKey="bonus_creditado" fill={colorWarning} radius={[4, 4, 0, 0]} />
          </BarChart>
        );
      
      case "juice":
        return (
          <BarChart data={chartData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
            <XAxis
              dataKey="label"
              stroke="hsl(var(--muted-foreground))"
              fontSize={11}
              tickLine={false}
              axisLine={false}
            />
            <YAxis
              stroke="hsl(var(--muted-foreground))"
              fontSize={11}
              tickLine={false}
              axisLine={false}
              width={60}
              tickFormatter={(value) => {
                if (Math.abs(value) >= 1000) return `${(value / 1000).toFixed(1)}k`;
                return value.toFixed(0);
              }}
            />
            <Tooltip content={<JuiceTooltip formatCurrency={formatCurrency} />} />
            <ReferenceLine y={0} stroke="hsl(var(--muted-foreground))" strokeDasharray="3 3" strokeOpacity={0.5} />
            <Bar dataKey="juice" radius={[4, 4, 0, 0]}>
              {chartData.map((entry, index) => (
                <Cell key={`cell-${index}`} fill={entry.juice >= 0 ? colorPositivo : colorNegativo} />
              ))}
            </Bar>
          </BarChart>
        );
    }
  };

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
          <div className="flex-1">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              {currentConfig.icon}
              {currentConfig.title}
            </CardTitle>
            <p className="text-xs text-muted-foreground mt-1">
              {currentConfig.subtitle} • {kpis.diasOperados} {kpis.diasOperados === 1 ? "dia" : "dias"} de operação
            </p>
          </div>
          
          {/* Toggle de modos */}
          <ToggleGroup 
            type="single" 
            value={chartMode} 
            onValueChange={(value) => value && setChartMode(value as ChartMode)}
            className="justify-start"
          >
            <ToggleGroupItem value="resultado" aria-label="Resultado Líquido" className="h-8 px-2.5 text-xs gap-1">
              <AreaChartIcon className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Resultado</span>
            </ToggleGroupItem>
            <ToggleGroupItem value="bonus" aria-label="Bônus Recebidos" className="h-8 px-2.5 text-xs gap-1">
              <Receipt className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Bônus</span>
            </ToggleGroupItem>
            <ToggleGroupItem value="juice" aria-label="Juice por Período" className="h-8 px-2.5 text-xs gap-1">
              <Activity className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Juice</span>
            </ToggleGroupItem>
          </ToggleGroup>
        </div>
        
        {/* KPIs dinâmicos */}
        <div className="flex flex-wrap items-center gap-2 mt-2">
          {renderKPIs()}
        </div>
      </CardHeader>
      <CardContent className="pt-2">
        <div className="h-[280px]">
          <ResponsiveContainer width="100%" height="100%">
            {renderChart()}
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
}

// Tooltip para modo Resultado
function ResultadoTooltip({ active, payload, label, formatCurrency }: any) {
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
}

// Tooltip para modo Bônus
function BonusTooltip({ active, payload, label, formatCurrency }: any) {
  if (!active || !payload || payload.length === 0) return null;
  const data = payload[0]?.payload as ChartDataPoint;
  if (!data) return null;

  return (
    <div className="bg-card border border-border rounded-lg p-3 shadow-lg">
      <p className="text-xs text-muted-foreground mb-2">Data: {label}</p>
      <div className="flex justify-between gap-4 text-xs">
        <span className="text-warning">Bônus Creditado:</span>
        <span className="font-medium text-warning">{formatCurrency(data.bonus_creditado)}</span>
      </div>
      <p className="text-xs text-muted-foreground mt-2 italic">
        Valor bruto recebido (não considera juice)
      </p>
    </div>
  );
}

// Tooltip para modo Juice
function JuiceTooltip({ active, payload, label, formatCurrency }: any) {
  if (!active || !payload || payload.length === 0) return null;
  const data = payload[0]?.payload as ChartDataPoint;
  if (!data) return null;

  const isGanho = data.juice >= 0;

  return (
    <div className="bg-card border border-border rounded-lg p-3 shadow-lg">
      <p className="text-xs text-muted-foreground mb-2">Data: {label}</p>
      <div className="flex justify-between gap-4 text-xs">
        <span className={isGanho ? "text-primary" : "text-destructive"}>
          {isGanho ? "Ganho:" : "Custo:"}
        </span>
        <span className={`font-medium ${isGanho ? "text-primary" : "text-destructive"}`}>
          {formatCurrency(Math.abs(data.juice))}
        </span>
      </div>
      <p className="text-xs text-muted-foreground mt-2 italic">
        {isGanho 
          ? "Resultado positivo das apostas com bônus" 
          : "Custo operacional das apostas com bônus"}
      </p>
    </div>
  );
}
