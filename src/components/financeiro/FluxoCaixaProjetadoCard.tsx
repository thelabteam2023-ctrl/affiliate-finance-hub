import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ArrowDownCircle, ArrowUpCircle, TrendingUp, TrendingDown, Calendar } from "lucide-react";
import { cn } from "@/lib/utils";
import { ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip, ReferenceLine } from "recharts";

interface FluxoMensal {
  label: string;
  entradas: number;
  saidas: number;
  saldo: number;
}

interface FluxoCaixaProjetadoCardProps {
  fluxoMensal: FluxoMensal[];
  totalEntradas: number;
  totalSaidas: number;
  saldoProjetado: number;
  formatCurrency: (value: number) => string;
}

export function FluxoCaixaProjetadoCard({
  fluxoMensal,
  totalEntradas,
  totalSaidas,
  saldoProjetado,
  formatCurrency,
}: FluxoCaixaProjetadoCardProps) {
  const tendencia = saldoProjetado >= 0 ? "positiva" : "negativa";
  const saldoLiquido = totalEntradas - totalSaidas;

  return (
    <Card className="overflow-hidden">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base flex items-center gap-2">
            <Calendar className="h-4 w-4 text-primary" />
            Fluxo de Caixa
          </CardTitle>
          <div className={cn(
            "flex items-center gap-1.5 text-xs font-medium",
            tendencia === "positiva" ? "text-success" : "text-destructive"
          )}>
            {tendencia === "positiva" ? <TrendingUp className="h-3.5 w-3.5" /> : <TrendingDown className="h-3.5 w-3.5" />}
            {tendencia === "positiva" ? "Tendência Positiva" : "Tendência Negativa"}
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Summary */}
        <div className="grid grid-cols-3 gap-3">
          <div className="p-3 bg-success/5 border border-success/20 rounded-lg text-center">
            <ArrowUpCircle className="h-4 w-4 text-success mx-auto mb-1" />
            <p className="text-[10px] text-muted-foreground uppercase">Entradas</p>
            <p className="text-sm font-bold text-success">{formatCurrency(totalEntradas)}</p>
          </div>
          <div className="p-3 bg-destructive/5 border border-destructive/20 rounded-lg text-center">
            <ArrowDownCircle className="h-4 w-4 text-destructive mx-auto mb-1" />
            <p className="text-[10px] text-muted-foreground uppercase">Saídas</p>
            <p className="text-sm font-bold text-destructive">{formatCurrency(totalSaidas)}</p>
          </div>
          <div className={cn(
            "p-3 border rounded-lg text-center",
            saldoLiquido >= 0 ? "bg-primary/5 border-primary/20" : "bg-destructive/5 border-destructive/20"
          )}>
            {saldoLiquido >= 0 ? <TrendingUp className="h-4 w-4 text-primary mx-auto mb-1" /> : <TrendingDown className="h-4 w-4 text-destructive mx-auto mb-1" />}
            <p className="text-[10px] text-muted-foreground uppercase">Saldo</p>
            <p className={cn("text-sm font-bold", saldoLiquido >= 0 ? "text-primary" : "text-destructive")}>
              {formatCurrency(saldoLiquido)}
            </p>
          </div>
        </div>

        {/* Chart */}
        {fluxoMensal.length > 0 && (
          <div className="h-[140px]">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={fluxoMensal} margin={{ top: 5, right: 5, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="colorEntradas" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="hsl(var(--success))" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="hsl(var(--success))" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="colorSaidas" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="hsl(var(--destructive))" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="hsl(var(--destructive))" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <XAxis 
                  dataKey="label" 
                  tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 10 }}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis hide />
                <Tooltip
                  contentStyle={{
                    backgroundColor: "rgba(0, 0, 0, 0.8)",
                    border: "1px solid rgba(255, 255, 255, 0.1)",
                    backdropFilter: "blur(12px)",
                    borderRadius: "12px",
                    padding: "12px 16px",
                  }}
                  formatter={(value: number, name: string) => [
                    formatCurrency(value),
                    name === "entradas" ? "Entradas" : "Saídas"
                  ]}
                />
                <ReferenceLine y={0} stroke="hsl(var(--border))" strokeDasharray="3 3" />
                <Area
                  type="monotone"
                  dataKey="entradas"
                  stroke="hsl(var(--success))"
                  strokeWidth={2}
                  fill="url(#colorEntradas)"
                />
                <Area
                  type="monotone"
                  dataKey="saidas"
                  stroke="hsl(var(--destructive))"
                  strokeWidth={2}
                  fill="url(#colorSaidas)"
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        )}

        {/* Projeção */}
        <div className={cn(
          "flex items-center justify-between p-3 rounded-lg border",
          saldoProjetado >= 0 ? "bg-success/5 border-success/20" : "bg-destructive/5 border-destructive/20"
        )}>
          <div>
            <p className="text-[10px] text-muted-foreground uppercase">Saldo Projetado (30 dias)</p>
            <p className={cn(
              "text-lg font-bold",
              saldoProjetado >= 0 ? "text-success" : "text-destructive"
            )}>
              {formatCurrency(saldoProjetado)}
            </p>
          </div>
          <div className="text-right text-xs text-muted-foreground">
            <p>Base: média últimos 3 meses</p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
