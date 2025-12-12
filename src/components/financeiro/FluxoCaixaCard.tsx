import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ArrowDownCircle, ArrowUpCircle, TrendingUp, TrendingDown, Calendar, HelpCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import { ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip, ReferenceLine } from "recharts";
import {
  Tooltip as UITooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

interface FluxoSemanal {
  label: string;
  entradas: number;
  saidas: number;
  saldo: number;
}

interface FluxoCaixaCardProps {
  fluxoSemanal: FluxoSemanal[];
  totalEntradas: number;
  totalSaidas: number;
  formatCurrency: (value: number) => string;
}

const KpiTooltip = ({ children, content }: { children: React.ReactNode; content: string }) => (
  <TooltipProvider>
    <UITooltip delayDuration={300}>
      <TooltipTrigger asChild>
        <button className="text-muted-foreground hover:text-foreground transition-colors">
          {children}
        </button>
      </TooltipTrigger>
      <TooltipContent side="top" className="max-w-[250px] text-xs">
        <p>{content}</p>
      </TooltipContent>
    </UITooltip>
  </TooltipProvider>
);

export function FluxoCaixaCard({
  fluxoSemanal,
  totalEntradas,
  totalSaidas,
  formatCurrency,
}: FluxoCaixaCardProps) {
  const saldoLiquido = totalEntradas - totalSaidas;
  const tendencia = saldoLiquido >= 0 ? "positiva" : "negativa";

  return (
    <Card className="overflow-hidden">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base flex items-center gap-2">
            <Calendar className="h-4 w-4 text-primary" />
            Fluxo de Caixa Semanal
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
            <div className="flex items-center justify-center gap-1 mb-1">
              <ArrowUpCircle className="h-4 w-4 text-success" />
              <KpiTooltip content="Aportes de investidores + Saques de bookmakers = dinheiro que entrou no caixa operacional">
                <HelpCircle className="h-3 w-3" />
              </KpiTooltip>
            </div>
            <p className="text-[10px] text-muted-foreground uppercase">Entradas</p>
            <p className="text-sm font-bold text-success">{formatCurrency(totalEntradas)}</p>
          </div>
          <div className="p-3 bg-destructive/5 border border-destructive/20 rounded-lg text-center">
            <div className="flex items-center justify-center gap-1 mb-1">
              <ArrowDownCircle className="h-4 w-4 text-destructive" />
              <KpiTooltip content="Depósitos em bookmakers + Custos operacionais + Despesas administrativas = dinheiro que saiu do caixa">
                <HelpCircle className="h-3 w-3" />
              </KpiTooltip>
            </div>
            <p className="text-[10px] text-muted-foreground uppercase">Saídas</p>
            <p className="text-sm font-bold text-destructive">{formatCurrency(totalSaidas)}</p>
          </div>
          <div className={cn(
            "p-3 border rounded-lg text-center",
            saldoLiquido >= 0 ? "bg-primary/5 border-primary/20" : "bg-destructive/5 border-destructive/20"
          )}>
            <div className="flex items-center justify-center gap-1 mb-1">
              {saldoLiquido >= 0 ? <TrendingUp className="h-4 w-4 text-primary" /> : <TrendingDown className="h-4 w-4 text-destructive" />}
              <KpiTooltip content="Diferença entre entradas e saídas das últimas 8 semanas">
                <HelpCircle className="h-3 w-3" />
              </KpiTooltip>
            </div>
            <p className="text-[10px] text-muted-foreground uppercase">Saldo</p>
            <p className={cn("text-sm font-bold", saldoLiquido >= 0 ? "text-primary" : "text-destructive")}>
              {formatCurrency(saldoLiquido)}
            </p>
          </div>
        </div>

        {/* Chart */}
        {fluxoSemanal.length > 0 && (
          <div className="h-[140px]">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={fluxoSemanal} margin={{ top: 5, right: 5, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="colorEntradasSemanal" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="hsl(var(--success))" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="hsl(var(--success))" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="colorSaidasSemanal" x1="0" y1="0" x2="0" y2="1">
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
                  fill="url(#colorEntradasSemanal)"
                />
                <Area
                  type="monotone"
                  dataKey="saidas"
                  stroke="hsl(var(--destructive))"
                  strokeWidth={2}
                  fill="url(#colorSaidasSemanal)"
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
