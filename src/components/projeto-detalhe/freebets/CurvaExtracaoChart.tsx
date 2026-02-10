import { useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { 
  AreaChart, Area, LineChart, Line, XAxis, YAxis, 
  CartesianGrid, Tooltip, ResponsiveContainer, Legend, 
  ReferenceLine, ComposedChart
} from "recharts";
import { TrendingUp, Activity, Percent, Info } from "lucide-react";
import { ApostaOperacionalFreebet, FreebetRecebida } from "./types";
import { format, parseISO, startOfDay, eachDayOfInterval, eachWeekOfInterval, eachMonthOfInterval, subDays, startOfWeek, startOfMonth, endOfWeek, endOfMonth } from "date-fns";
import { ptBR } from "date-fns/locale";
import { getSmartLabelInterval } from "@/utils/chartAxisUtils";
import {
  Tooltip as UITooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

interface CurvaExtracaoChartProps {
  apostas: ApostaOperacionalFreebet[];
  freebets: FreebetRecebida[];
  formatCurrency: (value: number) => string;
  dateRange: { start: Date; end: Date } | null;
}

type Granularidade = "dia" | "semana" | "mes";

interface DataPoint {
  label: string;
  date: Date;
  freebetRecebida: number;
  freebetAcumulada: number;
  valorExtraido: number;
  valorExtraidoAcumulado: number;
  juiceQualificadora: number;
  juiceQualificadoraAcumulado: number;
  lucroTotalAcumulado: number;
  eficiencia: number;
  potencialNaoExtraido: number;
}

export function CurvaExtracaoChart({ 
  apostas, 
  freebets,
  formatCurrency, 
  dateRange
}: CurvaExtracaoChartProps) {
  const [granularidade, setGranularidade] = useState<Granularidade>("dia");

  // Gerar dados do gráfico baseado na granularidade
  const chartData = useMemo((): DataPoint[] => {
    const range = dateRange || {
      start: subDays(new Date(), 30),
      end: new Date()
    };

    let intervals: Date[];
    let formatLabel: (date: Date) => string;
    let getIntervalStart: (date: Date) => Date;
    let getIntervalEnd: (date: Date) => Date;

    switch (granularidade) {
      case "semana":
        intervals = eachWeekOfInterval({ start: range.start, end: range.end }, { weekStartsOn: 1 });
        formatLabel = (d) => format(d, "dd/MM", { locale: ptBR });
        getIntervalStart = (d) => startOfWeek(d, { weekStartsOn: 1 });
        getIntervalEnd = (d) => endOfWeek(d, { weekStartsOn: 1 });
        break;
      case "mes":
        intervals = eachMonthOfInterval({ start: range.start, end: range.end });
        formatLabel = (d) => format(d, "MMM/yy", { locale: ptBR });
        getIntervalStart = startOfMonth;
        getIntervalEnd = endOfMonth;
        break;
      case "dia":
      default:
        intervals = eachDayOfInterval({ start: range.start, end: range.end });
        formatLabel = (d) => format(d, "dd/MM", { locale: ptBR });
        getIntervalStart = startOfDay;
        getIntervalEnd = (d) => startOfDay(d);
        break;
    }

    let freebetAcumulada = 0;
    let valorExtraidoAcumulado = 0;
    let juiceQualificadoraAcumulado = 0;

    return intervals.map(intervalDate => {
      const intervalStart = getIntervalStart(intervalDate);
      const intervalEnd = granularidade === "dia" ? intervalStart : getIntervalEnd(intervalDate);

      // Freebets recebidas no intervalo
      const freebetsNoIntervalo = freebets.filter(fb => {
        if (fb.status !== "LIBERADA") return false;
        const fbDate = startOfDay(parseISO(fb.data_recebida));
        if (granularidade === "dia") {
          return fbDate.getTime() === intervalStart.getTime();
        }
        return fbDate >= intervalStart && fbDate <= intervalEnd;
      });

      const freebetRecebida = freebetsNoIntervalo.reduce((acc, fb) => acc + fb.valor, 0);
      freebetAcumulada += freebetRecebida;

      // Apostas no intervalo
      const apostasNoIntervalo = apostas.filter(ap => {
        if (ap.status !== "LIQUIDADA") return false;
        const apDate = startOfDay(parseISO(ap.data_aposta));
        if (granularidade === "dia") {
          return apDate.getTime() === intervalStart.getTime();
        }
        return apDate >= intervalStart && apDate <= intervalEnd;
      });

      // EXTRAÇÃO: apostas que usam freebet E não são qualificadoras
      const apostasExtracao = apostasNoIntervalo.filter(ap => ap.tipo_freebet && !ap.gerou_freebet);
      const valorExtraido = apostasExtracao.reduce((acc, ap) => {
        return acc + (ap.lucro_prejuizo || 0);
      }, 0);
      valorExtraidoAcumulado += valorExtraido;

      // JUICE: apostas qualificadoras (geram freebet)
      const apostasQualificadoras = apostasNoIntervalo.filter(ap => ap.gerou_freebet);
      const juiceQualificadora = apostasQualificadoras.reduce((acc, ap) => {
        return acc + (ap.lucro_prejuizo || 0);
      }, 0);
      juiceQualificadoraAcumulado += juiceQualificadora;

      // Lucro total = extração + juice
      const lucroTotalAcumulado = valorExtraidoAcumulado + juiceQualificadoraAcumulado;

      // Eficiência: Valor Extraído Acumulado / Freebet Recebida Acumulada
      const eficiencia = freebetAcumulada > 0 
        ? (valorExtraidoAcumulado / freebetAcumulada) * 100 
        : 0;

      // Potencial não extraído (diferença entre freebet acumulada e valor extraído acumulado)
      const potencialNaoExtraido = Math.max(0, freebetAcumulada - valorExtraidoAcumulado);

      return {
        label: formatLabel(intervalDate),
        date: intervalDate,
        freebetRecebida,
        freebetAcumulada,
        valorExtraido,
        valorExtraidoAcumulado,
        juiceQualificadora,
        juiceQualificadoraAcumulado,
        lucroTotalAcumulado,
        eficiencia,
        potencialNaoExtraido
      };
    });
  }, [apostas, freebets, dateRange, granularidade]);

  // Métricas resumo
  const metricas = useMemo(() => {
    const ultimo = chartData[chartData.length - 1];
    if (!ultimo) return { totalRecebido: 0, totalExtraido: 0, eficienciaFinal: 0 };
    
    return {
      totalRecebido: ultimo.freebetAcumulada,
      totalExtraido: ultimo.valorExtraidoAcumulado,
      eficienciaFinal: ultimo.eficiencia
    };
  }, [chartData]);

  // Custom tooltip rico
  const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      const data = payload[0]?.payload as DataPoint;
      if (!data) return null;

      return (
        <div className="bg-popover/95 backdrop-blur-sm border rounded-lg shadow-xl p-4 min-w-[240px]">
          <p className="text-sm font-semibold border-b pb-2 mb-2">{label}</p>
          
          <div className="space-y-2">
            <div className="flex justify-between items-center">
              <span className="text-xs text-amber-400 flex items-center gap-1">
                <span className="w-2 h-2 rounded-full bg-amber-400"></span>
                FB Recebida
              </span>
              <span className="text-sm font-medium">{formatCurrency(data.freebetAcumulada)}</span>
            </div>
            
            <div className="flex justify-between items-center">
              <span className="text-xs text-emerald-400 flex items-center gap-1">
                <span className="w-2 h-2 rounded-full bg-emerald-400"></span>
                Extração
              </span>
              <span className="text-sm font-medium">{formatCurrency(data.valorExtraidoAcumulado)}</span>
            </div>

            <div className="flex justify-between items-center">
              <span className="text-xs text-violet-400 flex items-center gap-1">
                <span className="w-2 h-2 rounded-full bg-violet-400"></span>
                Juice Qualif.
              </span>
              <span className={`text-sm font-medium ${data.juiceQualificadoraAcumulado >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                {formatCurrency(data.juiceQualificadoraAcumulado)}
              </span>
            </div>

            <div className="flex justify-between items-center border-t pt-2">
              <span className="text-xs text-cyan-400 flex items-center gap-1">
                <span className="w-2 h-2 rounded-full bg-cyan-400"></span>
                Lucro Total
              </span>
              <span className={`text-sm font-bold ${data.lucroTotalAcumulado >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                {formatCurrency(data.lucroTotalAcumulado)}
              </span>
            </div>

            <div className="flex justify-between items-center text-muted-foreground">
              <span className="text-xs">Eficiência</span>
              <Badge className={`text-xs ${
                data.eficiencia >= 70 ? 'bg-emerald-500/20 text-emerald-400' :
                data.eficiencia >= 50 ? 'bg-amber-500/20 text-amber-400' :
                'bg-red-500/20 text-red-400'
              }`}>
                {data.eficiencia.toFixed(1)}%
              </Badge>
            </div>
          </div>
        </div>
      );
    }
    return null;
  };

  if (apostas.length === 0 && freebets.length === 0) {
    return (
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <Activity className="h-4 w-4 text-primary" />
            Curva de Extração de Freebets
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-center py-12 border rounded-lg bg-muted/5">
            <TrendingUp className="mx-auto h-10 w-10 text-muted-foreground/30" />
            <p className="mt-3 text-sm text-muted-foreground">Sem dados suficientes para o gráfico</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <Activity className="h-4 w-4 text-primary" />
            <CardTitle className="text-base">Curva de Extração de Freebets</CardTitle>
            <TooltipProvider>
              <UITooltip>
                <TooltipTrigger>
                  <Info className="h-3.5 w-3.5 text-muted-foreground" />
                </TooltipTrigger>
                <TooltipContent className="max-w-xs">
                  <p className="text-xs">
                    Compara o total de Freebets recebidas com o valor efetivamente extraído ao longo do tempo.
                    A área sombreada representa o potencial não extraído.
                  </p>
                </TooltipContent>
              </UITooltip>
            </TooltipProvider>
          </div>

          {/* Filtro de Granularidade */}
          <Select value={granularidade} onValueChange={(v) => setGranularidade(v as Granularidade)}>
            <SelectTrigger className="w-[110px] h-8 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="dia">Por Dia</SelectItem>
              <SelectItem value="semana">Por Semana</SelectItem>
              <SelectItem value="mes">Por Mês</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </CardHeader>

      <CardContent>
        <div className="h-[320px]">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={chartData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="gradientFreebet" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#f59e0b" stopOpacity={0.3}/>
                  <stop offset="95%" stopColor="#f59e0b" stopOpacity={0.05}/>
                </linearGradient>
                <linearGradient id="gradientExtraido" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#22c55e" stopOpacity={0.4}/>
                  <stop offset="95%" stopColor="#22c55e" stopOpacity={0.1}/>
                </linearGradient>
                <linearGradient id="gradientGap" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#ef4444" stopOpacity={0.15}/>
                  <stop offset="95%" stopColor="#ef4444" stopOpacity={0.05}/>
                </linearGradient>
              </defs>
              
              <CartesianGrid strokeDasharray="3 3" className="stroke-border/50" />
              <XAxis 
                dataKey="label" 
                tick={{ fontSize: 10 }} 
                className="text-muted-foreground"
                tickLine={false}
                interval={getSmartLabelInterval(chartData.length)}
              />
              <YAxis 
                tick={{ fontSize: 10 }} 
                className="text-muted-foreground"
                tickLine={false}
                axisLine={false}
                tickFormatter={(value) => {
                  if (value >= 1000) return `${(value / 1000).toFixed(0)}k`;
                  return value.toString();
                }}
              />
              <Tooltip content={<CustomTooltip />} />
              <Legend 
                wrapperStyle={{ fontSize: '11px' }}
                iconType="circle"
              />
              
              {/* Área sombreada para Freebet (potencial total) */}
              <Area
                type="monotone"
                dataKey="freebetAcumulada"
                name="Freebet Acumulada"
                stroke="#f59e0b"
                strokeWidth={2}
                fill="url(#gradientFreebet)"
              />

              {/* Linha para juice das qualificadoras */}
              <Line
                type="monotone"
                dataKey="juiceQualificadoraAcumulado"
                name="Juice Qualif."
                stroke="#8b5cf6"
                strokeWidth={2}
                dot={false}
                strokeDasharray="4 2"
              />

              {/* Linha para lucro total (extração + juice) */}
              <Line
                type="monotone"
                dataKey="lucroTotalAcumulado"
                name="Lucro Total"
                stroke="#22c55e"
                strokeWidth={2.5}
                dot={false}
              />

              {/* Linha de referência para meta de 70% */}
              {metricas.totalRecebido > 0 && (
                <ReferenceLine 
                  y={metricas.totalRecebido * 0.7} 
                  stroke="#6366f1" 
                  strokeDasharray="5 5" 
                  strokeWidth={1}
                  label={{ 
                    value: 'Meta 70%', 
                    position: 'right', 
                    fontSize: 10,
                    fill: '#6366f1'
                  }} 
                />
              )}
            </ComposedChart>
          </ResponsiveContainer>
        </div>

        {/* Legenda explicativa */}
        <div className="mt-4 p-3 rounded-lg bg-muted/30 border">
          <p className="text-xs text-muted-foreground">
            <strong className="text-foreground">Como interpretar:</strong> A área 
            <span className="text-amber-400 font-medium"> laranja </span>
            representa o total de Freebets recebidas. A linha
            <span className="text-violet-400 font-medium"> roxa </span>
            mostra o juice das qualificadoras. A linha
            <span className="text-emerald-400 font-medium"> verde </span>
            é o lucro total (extração + juice).
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
