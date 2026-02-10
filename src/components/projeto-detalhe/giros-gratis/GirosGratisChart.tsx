import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";
import { TrendingUp, Calendar } from "lucide-react";
import { GirosGratisChartData } from "@/types/girosGratis";
import { format, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";
import { getSmartTickInterval } from "@/utils/chartAxisUtils";

interface GirosGratisChartProps {
  data: GirosGratisChartData[];
  formatCurrency: (value: number) => string;
}

export function GirosGratisChart({ data, formatCurrency }: GirosGratisChartProps) {
  if (data.length === 0) {
    return (
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <TrendingUp className="h-4 w-4" />
            Evolução de Retorno
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-[200px] flex items-center justify-center text-muted-foreground">
            <div className="text-center">
              <Calendar className="h-8 w-8 mx-auto mb-2 opacity-50" />
              <p className="text-sm">Nenhum dado para exibir</p>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  const lastPoint = data[data.length - 1];
  const isPositive = lastPoint?.acumulado >= 0;

  const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      const date = parseISO(label);
      return (
        <div className="bg-popover border rounded-lg p-3 shadow-lg">
          <p className="text-xs text-muted-foreground mb-2">
            {format(date, "dd 'de' MMMM", { locale: ptBR })}
          </p>
          <div className="space-y-1">
            <div className="flex items-center justify-between gap-4">
              <span className="text-xs text-amber-500">Dia:</span>
              <span className="text-xs font-medium text-amber-500">{formatCurrency(payload[0]?.value || 0)}</span>
            </div>
            <div className="flex items-center justify-between gap-4">
              <span className="text-xs text-green-500">Acumulado:</span>
              <span className={`text-xs font-medium ${payload[1]?.value >= 0 ? 'text-green-500' : 'text-red-500'}`}>
                {formatCurrency(payload[1]?.value || 0)}
              </span>
            </div>
          </div>
        </div>
      );
    }
    return null;
  };

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base flex items-center gap-2">
            <TrendingUp className="h-4 w-4" />
            Evolução de Retorno
          </CardTitle>
          <Badge variant={isPositive ? "default" : "destructive"} className="text-xs">
            {formatCurrency(lastPoint?.acumulado || 0)}
          </Badge>
        </div>
      </CardHeader>
      <CardContent>
        <div className="h-[200px]">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={data} margin={{ top: 5, right: 5, left: 5, bottom: 5 }}>
              <defs>
                <linearGradient id="colorValorDiario" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#f59e0b" stopOpacity={0.4} />
                  <stop offset="95%" stopColor="#f59e0b" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="colorAcumulado" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor={isPositive ? "#22c55e" : "#ef4444"} stopOpacity={0.3} />
                  <stop offset="95%" stopColor={isPositive ? "#22c55e" : "#ef4444"} stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
              <XAxis
                dataKey="date"
                tickFormatter={(value) => format(parseISO(value), "dd/MM")}
                tick={{ fontSize: 10 }}
                className="text-muted-foreground"
                interval={getSmartTickInterval(data.length)}
                tickLine={false}
              />
              <YAxis
                tickFormatter={(value) => `R$${value}`}
                tick={{ fontSize: 10 }}
                className="text-muted-foreground"
              />
              <Tooltip content={<CustomTooltip />} />
              <Area
                type="monotone"
                dataKey="valor"
                stroke="#f59e0b"
                fillOpacity={1}
                fill="url(#colorValorDiario)"
                strokeWidth={2}
              />
              <Area
                type="monotone"
                dataKey="acumulado"
                stroke={isPositive ? "#22c55e" : "#ef4444"}
                fillOpacity={1}
                fill="url(#colorAcumulado)"
                strokeWidth={2}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
        <div className="flex items-center justify-center gap-6 mt-2 text-xs text-muted-foreground">
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-full bg-amber-500" />
            <span>Retorno diário</span>
          </div>
          <div className="flex items-center gap-2">
            <div className={`w-3 h-3 rounded-full ${isPositive ? 'bg-green-500' : 'bg-red-500'}`} />
            <span>Acumulado</span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
