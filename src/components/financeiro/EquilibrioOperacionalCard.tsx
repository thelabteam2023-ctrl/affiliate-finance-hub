import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Scale, TrendingUp, TrendingDown, Minus, HelpCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  Tooltip as UITooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

interface EquilibrioOperacionalCardProps {
  lucroOperacional: number;
  custoSustentacao: number;
  formatCurrency: (value: number) => string;
}

export function EquilibrioOperacionalCard({
  lucroOperacional,
  custoSustentacao,
  formatCurrency,
}: EquilibrioOperacionalCardProps) {
  const diferenca = lucroOperacional - custoSustentacao;
  const coberturaPercent = custoSustentacao > 0 ? (lucroOperacional / custoSustentacao) * 100 : 0;

  const getStatus = () => {
    if (coberturaPercent >= 120) return { 
      label: "Acima do Ponto", 
      color: "text-success", 
      bg: "bg-success/10",
      icon: TrendingUp,
      description: "Lucro cobre custos com folga"
    };
    if (coberturaPercent >= 95) return { 
      label: "No Ponto", 
      color: "text-primary", 
      bg: "bg-primary/10",
      icon: Minus,
      description: "Operação equilibrada"
    };
    return { 
      label: "Abaixo do Ponto", 
      color: "text-destructive", 
      bg: "bg-destructive/10",
      icon: TrendingDown,
      description: "Lucro não cobre custos"
    };
  };

  const status = getStatus();
  const StatusIcon = status.icon;

  // Calculate bar widths
  const maxValue = Math.max(lucroOperacional, custoSustentacao);
  const lucroWidth = maxValue > 0 ? (lucroOperacional / maxValue) * 100 : 0;
  const custoWidth = maxValue > 0 ? (custoSustentacao / maxValue) * 100 : 0;

  return (
    <Card className="overflow-hidden">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base flex items-center gap-2">
            <Scale className="h-4 w-4 text-primary" />
            Equilíbrio Operacional
            <TooltipProvider>
              <UITooltip delayDuration={300}>
                <TooltipTrigger asChild>
                  <button className="text-muted-foreground hover:text-foreground transition-colors">
                    <HelpCircle className="h-3.5 w-3.5" />
                  </button>
                </TooltipTrigger>
                <TooltipContent side="top" className="max-w-[320px] text-xs">
                  <p className="font-medium mb-1">Equilíbrio Operacional</p>
                  <p className="mb-2">Comparação entre lucro e custos de sustentação.</p>
                  <p><strong>Lucro:</strong> Resultado das operações (apostas)</p>
                  <p><strong>Custos:</strong> Valor mínimo para manter operação</p>
                  <p className="mt-2 text-muted-foreground italic">Responde: "A operação já se paga?"</p>
                </TooltipContent>
              </UITooltip>
            </TooltipProvider>
          </CardTitle>
          <div className={cn("flex items-center gap-1.5 text-xs font-medium px-2 py-1 rounded-full", status.bg, status.color)}>
            <StatusIcon className="h-3.5 w-3.5" />
            {status.label}
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Main Status */}
        <div className={cn("p-4 rounded-lg text-center", status.bg)}>
          <StatusIcon className={cn("h-6 w-6 mx-auto mb-1", status.color)} />
          <p className="text-sm text-muted-foreground">{status.description}</p>
          <p className={cn("text-2xl font-bold mt-2", status.color)}>
            {coberturaPercent.toFixed(0)}%
          </p>
          <p className="text-xs text-muted-foreground">de cobertura</p>
        </div>

        {/* Visual Comparison */}
        <div className="space-y-3">
          <div className="space-y-1">
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Lucro Operacional</span>
              <span className="font-semibold text-success">{formatCurrency(lucroOperacional)}</span>
            </div>
            <div className="h-3 bg-muted rounded-full overflow-hidden">
              <div 
                className="h-full bg-success rounded-full transition-all"
                style={{ width: `${lucroWidth}%` }}
              />
            </div>
          </div>

          <div className="space-y-1">
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Custo de Sustentação</span>
              <span className="font-semibold text-orange-500">{formatCurrency(custoSustentacao)}</span>
            </div>
            <div className="h-3 bg-muted rounded-full overflow-hidden">
              <div 
                className="h-full bg-orange-500 rounded-full transition-all"
                style={{ width: `${custoWidth}%` }}
              />
            </div>
          </div>
        </div>

        {/* Difference */}
        <div className="pt-3 border-t flex items-center justify-between">
          <span className="text-sm text-muted-foreground">Diferença</span>
          <span className={cn("text-lg font-bold", diferenca >= 0 ? "text-success" : "text-destructive")}>
            {diferenca >= 0 ? "+" : ""}{formatCurrency(diferenca)}
          </span>
        </div>
      </CardContent>
    </Card>
  );
}
