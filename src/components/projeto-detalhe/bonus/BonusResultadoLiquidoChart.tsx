import { useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Receipt, TrendingUp, TrendingDown, AreaChart as AreaChartIcon, Activity, Filter, X } from "lucide-react";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
  DropdownMenuLabel,
} from "@/components/ui/dropdown-menu";
import { ScrollArea } from "@/components/ui/scroll-area";
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
  moeda_operacao?: string | null;
  bonus_id: string | null;
  stake_bonus?: number | null;
  estrategia?: string | null;
}

interface AjustePostLimitacao {
  valor: number;
  moeda: string;
  bookmaker_id: string;
  created_at: string;
}

interface BonusResultadoLiquidoChartProps {
  bonuses: ProjectBonus[];
  bonusBets: BonusBetData[];
  ajustesPostLimitacao?: AjustePostLimitacao[];
  formatCurrency: (value: number) => string;
  /** Função para converter valores para moeda de consolidação do projeto */
  convertToConsolidation?: (valor: number, moedaOrigem: string) => number;
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

interface BookmakerBonusStats {
  bookmaker_id: string;
  bookmaker_nome: string;
  total_bonus: number;
  count: number;
}

type ChartMode = "resultado" | "bonus_juice";

export function BonusResultadoLiquidoChart({
  bonuses,
  bonusBets,
  ajustesPostLimitacao = [],
  formatCurrency,
  convertToConsolidation,
  isSingleDayPeriod = false,
  dateRange,
}: BonusResultadoLiquidoChartProps) {
  const [chartMode, setChartMode] = useState<ChartMode>("resultado");
  const [selectedBookmaker, setSelectedBookmaker] = useState<string | null>(null);

  // Calcula estatísticas por bookmaker (para filtro e breakdown)
  const bookmakerStats = useMemo(() => {
    const statsMap: Record<string, BookmakerBonusStats> = {};
    
    bonuses
      .filter(b => (b.status === "credited" || b.status === "finalized") && b.credited_at)
      .forEach(b => {
        // Filtra por dateRange se especificado
        if (dateRange) {
          const bonusDate = parseISO(b.credited_at!.split("T")[0]);
          if (bonusDate < dateRange.start || bonusDate > dateRange.end) return;
        }
        
        const id = b.bookmaker_id;
        if (!statsMap[id]) {
          statsMap[id] = {
            bookmaker_id: id,
            bookmaker_nome: b.bookmaker_nome || b.bookmaker_login || "Casa desconhecida",
            total_bonus: 0,
            count: 0,
          };
        }
        statsMap[id].total_bonus += b.bonus_amount || 0;
        statsMap[id].count += 1;
      });
    
    return Object.values(statsMap).sort((a, b) => b.total_bonus - a.total_bonus);
  }, [bonuses, dateRange]);

  // Filtra bônus pelo bookmaker selecionado
  const filteredBonuses = useMemo(() => {
    if (!selectedBookmaker) return bonuses;
    return bonuses.filter(b => b.bookmaker_id === selectedBookmaker);
  }, [bonuses, selectedBookmaker]);

  // Calcula dados do gráfico: Resultado Líquido = Bônus creditados + Juice
  const chartData = useMemo(() => {
    // Agrupa bônus creditados por data
    const bonusByDate: Record<string, number> = {};
    filteredBonuses
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
    // CRÍTICO: Converter valores para moeda de consolidação do projeto
    const juiceByDate: Record<string, number> = {};
    bonusBets.forEach(bet => {
      const isBonusBet = bet.bonus_id || bet.estrategia === "EXTRACAO_BONUS";
      if (!isBonusBet) return;
      
      // Se filtro por bookmaker ativo, filtrar juice também
      if (selectedBookmaker && bet.bonus_id) {
        const relatedBonus = bonuses.find(b => b.id === bet.bonus_id);
        if (relatedBonus && relatedBonus.bookmaker_id !== selectedBookmaker) return;
      }
      
      const date = bet.data_aposta.split("T")[0];
      
      // Priorizar pl_consolidado se disponível (já está na moeda do projeto)
      let pl: number;
      if (bet.pl_consolidado != null) {
        pl = bet.pl_consolidado;
      } else if (convertToConsolidation) {
        // Se não tiver pl_consolidado, converter lucro_prejuizo da moeda de operação
        const moedaOperacao = bet.moeda_operacao || "BRL";
        pl = convertToConsolidation(bet.lucro_prejuizo ?? 0, moedaOperacao);
      } else {
        // Fallback: usar valor bruto (comportamento anterior)
        pl = bet.lucro_prejuizo ?? 0;
      }
      
      juiceByDate[date] = (juiceByDate[date] || 0) + pl;
    });

    // Inclui ajustes pós-limitação no juice por data
    ajustesPostLimitacao.forEach(ajuste => {
      // Filtro por bookmaker se ativo
      if (selectedBookmaker && ajuste.bookmaker_id !== selectedBookmaker) return;

      const date = ajuste.created_at.split("T")[0];

      // Filtro por dateRange
      if (dateRange) {
        const ajusteDate = parseISO(date);
        if (ajusteDate < dateRange.start || ajusteDate > dateRange.end) return;
      }

      const valor = convertToConsolidation
        ? convertToConsolidation(ajuste.valor, ajuste.moeda)
        : ajuste.valor;

      juiceByDate[date] = (juiceByDate[date] || 0) + valor;
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
  }, [filteredBonuses, bonusBets, bonuses, ajustesPostLimitacao, dateRange, selectedBookmaker, convertToConsolidation]);

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
    bonus_juice: {
      title: "Bônus vs Juice por Período",
      subtitle: "Comparativo diário de créditos e custos operacionais",
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
      case "bonus_juice":
        const selectedBookmakerName = selectedBookmaker 
          ? bookmakerStats.find(b => b.bookmaker_id === selectedBookmaker)?.bookmaker_nome 
          : null;
        return (
          <>
            {/* Filtro por casa */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm" className="h-6 px-2 text-xs gap-1">
                  <Filter className="h-3 w-3" />
                  {selectedBookmakerName ? (
                    <span className="max-w-[100px] truncate">{selectedBookmakerName}</span>
                  ) : (
                    "Todas as casas"
                  )}
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="w-64">
                <DropdownMenuLabel className="text-xs">Filtrar por casa</DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem 
                  onClick={() => setSelectedBookmaker(null)}
                  className="text-xs"
                >
                  <span className="flex-1">Todas as casas</span>
                  {!selectedBookmaker && <Badge variant="secondary" className="text-[10px] h-4">Ativo</Badge>}
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <ScrollArea className="h-[200px]">
                  {bookmakerStats.map((stat) => (
                    <DropdownMenuItem 
                      key={stat.bookmaker_id}
                      onClick={() => setSelectedBookmaker(stat.bookmaker_id)}
                      className="text-xs flex items-center justify-between"
                    >
                      <span className="flex-1 truncate">{stat.bookmaker_nome}</span>
                      <div className="flex items-center gap-2">
                        <span className="text-warning font-medium">{formatCurrency(stat.total_bonus)}</span>
                        {selectedBookmaker === stat.bookmaker_id && (
                          <Badge variant="secondary" className="text-[10px] h-4">Ativo</Badge>
                        )}
                      </div>
                    </DropdownMenuItem>
                  ))}
                </ScrollArea>
              </DropdownMenuContent>
            </DropdownMenu>
            
            {selectedBookmaker && (
              <Button 
                variant="ghost" 
                size="sm" 
                className="h-6 px-1.5 text-xs text-muted-foreground hover:text-foreground"
                onClick={() => setSelectedBookmaker(null)}
              >
                <X className="h-3 w-3" />
              </Button>
            )}
            
            <Badge variant="outline" className="text-xs border-warning/30 text-warning">
              Bônus: {formatCurrency(kpis.totalBonus)}
            </Badge>
            <Badge 
              variant="outline" 
              className={`text-xs ${kpis.totalJuice >= 0 ? "border-primary/30 text-primary" : "border-destructive/30 text-destructive"}`}
            >
              Juice: {formatCurrency(kpis.totalJuice)}
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
      
      case "bonus_juice":
        // Gráfico de barras agrupadas: Bônus e Juice lado a lado
        return (
          <BarChart 
            data={chartData} 
            margin={{ top: 10, right: 10, left: 0, bottom: 0 }}
            barCategoryGap="20%"
            barGap={2}
          >
            <defs>
              <linearGradient id="bonusBarGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="hsl(45, 93%, 58%)" stopOpacity={0.95} />
                <stop offset="100%" stopColor="hsl(38, 92%, 45%)" stopOpacity={0.75} />
              </linearGradient>
              <linearGradient id="juicePositiveGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="hsl(var(--chart-2))" stopOpacity={0.9} />
                <stop offset="100%" stopColor="hsl(var(--chart-2))" stopOpacity={0.6} />
              </linearGradient>
              <linearGradient id="juiceNegativeGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="hsl(var(--destructive))" stopOpacity={0.9} />
                <stop offset="100%" stopColor="hsl(var(--destructive))" stopOpacity={0.6} />
              </linearGradient>
            </defs>
            <CartesianGrid 
              strokeDasharray="3 3" 
              stroke="hsl(var(--border))" 
              strokeOpacity={0.4}
              vertical={false} 
            />
            <XAxis
              dataKey="label"
              stroke="hsl(var(--muted-foreground))"
              fontSize={10}
              tickLine={false}
              axisLine={false}
              interval="preserveStartEnd"
              tickMargin={8}
            />
            <YAxis
              stroke="hsl(var(--muted-foreground))"
              fontSize={10}
              tickLine={false}
              axisLine={false}
              width={55}
              tickCount={5}
              tickFormatter={(value) => {
                if (Math.abs(value) >= 1000) return `${(value / 1000).toFixed(1)}k`;
                return value.toFixed(0);
              }}
            />
            <Tooltip content={<BonusJuiceTooltip formatCurrency={formatCurrency} />} cursor={{ fill: 'hsl(var(--muted)/0.1)' }} />
            <ReferenceLine y={0} stroke="hsl(var(--muted-foreground))" strokeDasharray="4 4" strokeOpacity={0.3} />
            {/* Barra de Bônus (amarelo/dourado) */}
            <Bar 
              dataKey="bonus_creditado" 
              name="Bônus"
              fill="url(#bonusBarGradient)" 
              radius={[4, 4, 0, 0]}
              maxBarSize={24}
            />
            {/* Barra de Juice (verde/vermelho) */}
            <Bar 
              dataKey="juice" 
              name="Juice"
              radius={[4, 4, 0, 0]} 
              maxBarSize={24}
            >
              {chartData.map((entry, index) => (
                <Cell 
                  key={`cell-juice-${index}`} 
                  fill={entry.juice >= 0 ? "url(#juicePositiveGradient)" : "url(#juiceNegativeGradient)"} 
                />
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
            <ToggleGroupItem value="bonus_juice" aria-label="Bônus vs Juice" className="h-8 px-2.5 text-xs gap-1">
              <Activity className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Bônus vs Juice</span>
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

// Tooltip para modo Bônus vs Juice (grouped bar chart)
function BonusJuiceTooltip({ active, payload, label, formatCurrency }: any) {
  if (!active || !payload || payload.length === 0) return null;
  const data = payload[0]?.payload as ChartDataPoint;
  if (!data) return null;

  const isJuiceGanho = data.juice >= 0;
  const resultadoDia = data.bonus_creditado + data.juice;

  return (
    <div className="bg-popover/95 backdrop-blur-sm border border-border/50 rounded-lg p-3 shadow-xl min-w-[180px]">
      <p className="text-[10px] text-muted-foreground/70 uppercase tracking-wide mb-2">
        {label}
      </p>
      <div className="space-y-2">
        {/* Bônus */}
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <div className="w-2.5 h-2.5 rounded-sm bg-warning" />
            <span className="text-xs text-muted-foreground">Bônus</span>
          </div>
          <span className="text-sm font-semibold text-warning">
            {formatCurrency(data.bonus_creditado)}
          </span>
        </div>
        {/* Juice */}
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <div className={`w-2.5 h-2.5 rounded-sm ${isJuiceGanho ? "bg-primary" : "bg-destructive"}`} />
            <span className="text-xs text-muted-foreground">Juice</span>
          </div>
          <span className={`text-sm font-semibold ${isJuiceGanho ? "text-primary" : "text-destructive"}`}>
            {formatCurrency(data.juice)}
          </span>
        </div>
        {/* Resultado do dia */}
        <div className="border-t border-border/30 pt-2 flex items-center justify-between gap-4">
          <span className="text-xs text-muted-foreground">Resultado</span>
          <span className={`text-sm font-bold ${resultadoDia >= 0 ? "text-primary" : "text-destructive"}`}>
            {formatCurrency(resultadoDia)}
          </span>
        </div>
      </div>
    </div>
  );
}
