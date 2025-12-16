import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ArrowDownCircle, ArrowUpCircle, TrendingUp, TrendingDown, HelpCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import { ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip, ReferenceLine } from "recharts";
import {
  Tooltip as UITooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

export interface FluxoCaixaRealData {
  label: string;
  entradas: number;
  saidas: number;
  saldo: number;
}

interface FluxoCaixaRealCardProps {
  fluxoData: FluxoCaixaRealData[];
  totalEntradas: number;
  totalSaidas: number;
  formatCurrency: (value: number) => string;
}

export function FluxoCaixaRealCard({
  fluxoData,
  totalEntradas,
  totalSaidas,
  formatCurrency,
}: FluxoCaixaRealCardProps) {
  const saldoLiquido = totalEntradas - totalSaidas;
  const isPositivo = saldoLiquido >= 0;

  return (
    <Card className="overflow-hidden">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base flex items-center gap-2">
            <TrendingUp className="h-4 w-4 text-success" />
            Fluxo de Caixa Real
            <TooltipProvider>
              <UITooltip delayDuration={300}>
                <TooltipTrigger asChild>
                  <button className="text-muted-foreground hover:text-foreground transition-colors">
                    <HelpCircle className="h-3.5 w-3.5" />
                  </button>
                </TooltipTrigger>
                <TooltipContent side="top" className="max-w-[320px] text-xs">
                  <p className="font-medium mb-1">Fluxo de Caixa Real</p>
                  <p className="mb-2">Mostra apenas movimentações que impactam o P&L real.</p>
                  <p><strong>Entradas:</strong> Aportes de investidores, receitas realizadas, saques de bookmakers</p>
                  <p><strong>Saídas:</strong> Custos operacionais, despesas administrativas, pagamentos a parceiros/operadores</p>
                  <p className="mt-2 text-muted-foreground italic">Não inclui depósitos em bookmakers (realocação patrimonial)</p>
                </TooltipContent>
              </UITooltip>
            </TooltipProvider>
          </CardTitle>
          <div className={cn(
            "flex items-center gap-1.5 text-xs font-medium px-2 py-1 rounded-full",
            isPositivo ? "bg-success/10 text-success" : "bg-destructive/10 text-destructive"
          )}>
            {isPositivo ? <TrendingUp className="h-3.5 w-3.5" /> : <TrendingDown className="h-3.5 w-3.5" />}
            {isPositivo ? "Gerando Caixa" : "Queimando Caixa"}
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Summary */}
        <div className="grid grid-cols-3 gap-3">
          <div className="p-3 bg-success/5 border border-success/20 rounded-lg text-center">
            <ArrowUpCircle className="h-4 w-4 text-success mx-auto mb-1" />
            <p className="text-[10px] text-muted-foreground uppercase">Entradas Reais</p>
            <p className="text-sm font-bold text-success">{formatCurrency(totalEntradas)}</p>
          </div>
          <div className="p-3 bg-destructive/5 border border-destructive/20 rounded-lg text-center">
            <ArrowDownCircle className="h-4 w-4 text-destructive mx-auto mb-1" />
            <p className="text-[10px] text-muted-foreground uppercase">Saídas Reais</p>
            <p className="text-sm font-bold text-destructive">{formatCurrency(totalSaidas)}</p>
          </div>
          <div className={cn(
            "p-3 border rounded-lg text-center",
            isPositivo ? "bg-primary/5 border-primary/20" : "bg-destructive/5 border-destructive/20"
          )}>
            {isPositivo ? <TrendingUp className="h-4 w-4 text-primary mx-auto mb-1" /> : <TrendingDown className="h-4 w-4 text-destructive mx-auto mb-1" />}
            <p className="text-[10px] text-muted-foreground uppercase">Saldo Real</p>
            <p className={cn("text-sm font-bold", isPositivo ? "text-primary" : "text-destructive")}>
              {formatCurrency(saldoLiquido)}
            </p>
          </div>
        </div>

        {/* Chart */}
        {fluxoData.length > 0 && (
          <div className="h-[120px]">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={fluxoData} margin={{ top: 5, right: 5, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="colorEntradasReal" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="hsl(var(--success))" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="hsl(var(--success))" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="colorSaidasReal" x1="0" y1="0" x2="0" y2="1">
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
                  fill="url(#colorEntradasReal)"
                />
                <Area
                  type="monotone"
                  dataKey="saidas"
                  stroke="hsl(var(--destructive))"
                  strokeWidth={2}
                  fill="url(#colorSaidasReal)"
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
