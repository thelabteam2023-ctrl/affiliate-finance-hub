import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Flame, TrendingUp, TrendingDown, HelpCircle, ArrowRight } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  Tooltip as UITooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

interface BurnRateCardProps {
  burnRateMensal: number;
  burnRateSemanal: number;
  entradasMensais: number;
  formatCurrency: (value: number) => string;
}

export function BurnRateCard({
  burnRateMensal,
  burnRateSemanal,
  entradasMensais,
  formatCurrency,
}: BurnRateCardProps) {
  const netBurn = burnRateMensal - entradasMensais;
  const isPositivo = netBurn < 0; // Negativo = gerando caixa
  const cobertura = burnRateMensal > 0 ? (entradasMensais / burnRateMensal) * 100 : 0;

  const getStatus = () => {
    if (cobertura >= 120) return { label: "Excelente", color: "text-success", bg: "bg-success/10" };
    if (cobertura >= 100) return { label: "Equilibrado", color: "text-primary", bg: "bg-primary/10" };
    if (cobertura >= 70) return { label: "Atenção", color: "text-yellow-500", bg: "bg-yellow-500/10" };
    return { label: "Crítico", color: "text-destructive", bg: "bg-destructive/10" };
  };

  const status = getStatus();

  return (
    <Card className="overflow-hidden">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base flex items-center gap-2">
            <Flame className="h-4 w-4 text-orange-500" />
            Burn Rate
            <TooltipProvider>
              <UITooltip delayDuration={300}>
                <TooltipTrigger asChild>
                  <button className="text-muted-foreground hover:text-foreground transition-colors">
                    <HelpCircle className="h-3.5 w-3.5" />
                  </button>
                </TooltipTrigger>
                <TooltipContent side="top" className="max-w-[320px] text-xs">
                  <p className="font-medium mb-1">Taxa de Queima de Caixa</p>
                  <p className="mb-2">Velocidade média de consumo de recursos.</p>
                  <p><strong>Burn Rate:</strong> Saídas reais de caixa por período</p>
                  <p><strong>Net Burn:</strong> Burn Rate - Entradas (queima líquida)</p>
                  <p className="mt-2 text-muted-foreground italic">Responde: "Qual a velocidade de consumo de recursos?"</p>
                </TooltipContent>
              </UITooltip>
            </TooltipProvider>
          </CardTitle>
          <div className={cn("flex items-center gap-1.5 text-xs font-medium px-2 py-1 rounded-full", status.bg, status.color)}>
            {status.label}
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Burn Rates */}
        <div className="grid grid-cols-2 gap-3">
          <div className="p-3 bg-orange-500/5 border border-orange-500/20 rounded-lg text-center">
            <p className="text-[10px] text-muted-foreground uppercase mb-1">Burn Mensal</p>
            <p className="text-xl font-bold text-orange-500">{formatCurrency(burnRateMensal)}</p>
          </div>
          <div className="p-3 bg-orange-500/5 border border-orange-500/20 rounded-lg text-center">
            <p className="text-[10px] text-muted-foreground uppercase mb-1">Burn Semanal</p>
            <p className="text-xl font-bold text-orange-400">{formatCurrency(burnRateSemanal)}</p>
          </div>
        </div>

        {/* Net Burn Comparison */}
        <div className="p-4 bg-muted/30 border rounded-lg">
          <div className="flex items-center justify-between text-xs text-muted-foreground mb-3">
            <span>Entradas</span>
            <ArrowRight className="h-3 w-3" />
            <span>vs Burn</span>
            <ArrowRight className="h-3 w-3" />
            <span>Net Burn</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-success">{formatCurrency(entradasMensais)}</span>
            <span className="text-muted-foreground">-</span>
            <span className="text-sm font-medium text-orange-500">{formatCurrency(burnRateMensal)}</span>
            <span className="text-muted-foreground">=</span>
            <span className={cn("text-lg font-bold", isPositivo ? "text-success" : "text-destructive")}>
              {netBurn > 0 ? "-" : "+"}{formatCurrency(Math.abs(netBurn))}
            </span>
          </div>
        </div>

        {/* Coverage */}
        <div className="space-y-2">
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">Cobertura de Entradas</span>
            <span className={cn("font-semibold", status.color)}>{cobertura.toFixed(0)}%</span>
          </div>
          <div className="h-2 bg-muted rounded-full overflow-hidden">
            <div 
              className={cn("h-full rounded-full transition-all", status.bg.replace('/10', ''))}
              style={{ 
                width: `${Math.min(cobertura, 100)}%`,
                backgroundColor: cobertura >= 120 ? 'hsl(var(--success))' : cobertura >= 100 ? 'hsl(var(--primary))' : cobertura >= 70 ? 'rgb(234 179 8)' : 'hsl(var(--destructive))'
              }}
            />
          </div>
          <p className="text-[10px] text-muted-foreground text-center">
            {cobertura >= 100 
              ? "Entradas cobrem os custos ✓" 
              : `Faltam ${formatCurrency(burnRateMensal - entradasMensais)} para cobrir custos`}
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
