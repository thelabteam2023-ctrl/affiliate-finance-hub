import { useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { BarChart3 } from "lucide-react";
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

export function SharedDailyChart({ daily, currencySymbol }: Props) {
  const chartData = useMemo(() => {
    if (!daily.length) return [];

    // Cumulative P&L
    let cumulative = 0;
    return daily
      .sort((a, b) => a.dia.localeCompare(b.dia))
      .map((d) => {
        cumulative += d.lucro;
        return {
          dia: d.dia.substring(5), // MM-DD
          lucro: d.lucro,
          acumulado: cumulative,
        };
      });
  }, [daily]);

  if (!chartData.length) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm font-medium flex items-center gap-2">
          <BarChart3 className="h-4 w-4" />
          Evolução do Lucro Acumulado
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="h-[300px]">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
              <XAxis
                dataKey="dia"
                tick={{ fontSize: 10 }}
                interval="preserveStartEnd"
              />
              <YAxis tick={{ fontSize: 10 }} />
              <Tooltip
                formatter={(value: number) => [
                  `${currencySymbol} ${value.toLocaleString("pt-BR", {
                    minimumFractionDigits: 2,
                  })}`,
                  "Acumulado",
                ]}
                labelFormatter={(label) => `Dia: ${label}`}
              />
              <Area
                type="monotone"
                dataKey="acumulado"
                stroke="hsl(var(--primary))"
                fill="hsl(var(--primary) / 0.15)"
                strokeWidth={2}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
}
