import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Zap, TrendingUp, TrendingDown, HelpCircle, Target } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  Tooltip as UITooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

interface EficienciaCapitalCardProps {
  lucroOperacional: number;
  capitalEmBookmakers: number;
  formatCurrency: (value: number) => string;
}

export function EficienciaCapitalCard({
  lucroOperacional,
  capitalEmBookmakers,
  formatCurrency,
}: EficienciaCapitalCardProps) {
  const eficiencia = capitalEmBookmakers > 0 ? (lucroOperacional / capitalEmBookmakers) * 100 : 0;
  const roiMensal = eficiencia; // ROI sobre capital alocado

  const getStatus = () => {
    if (eficiencia >= 10) return { 
      label: "Excelente", 
      color: "text-success", 
      description: "Alta eficiência — otimizar mais difícil"
    };
    if (eficiencia >= 5) return { 
      label: "Bom", 
      color: "text-primary", 
      description: "Eficiência adequada"
    };
    if (eficiencia >= 2) return { 
      label: "Razoável", 
      color: "text-yellow-500", 
      description: "Espaço para melhorar execução"
    };
    if (eficiencia > 0) return { 
      label: "Baixo", 
      color: "text-orange-500", 
      description: "Otimizar execução antes de escalar"
    };
    return { 
      label: "Negativo", 
      color: "text-destructive", 
      description: "Revisar estratégia operacional"
    };
  };

  const status = getStatus();

  const getRecomendacao = () => {
    if (eficiencia >= 10) return "Já operando no topo. Escalar capital pode diluir eficiência.";
    if (eficiencia >= 5) return "Bom equilíbrio. Pode escalar com monitoramento.";
    if (eficiencia >= 2) return "Focar em otimização antes de aumentar capital.";
    if (eficiencia > 0) return "Melhorar execução é mais prioritário que escalar.";
    return "Não escalar — revisar estratégia primeiro.";
  };

  return (
    <Card className="overflow-hidden">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base flex items-center gap-2">
            <Zap className="h-4 w-4 text-yellow-500" />
            Eficiência do Capital
            <TooltipProvider>
              <UITooltip delayDuration={300}>
                <TooltipTrigger asChild>
                  <button className="text-muted-foreground hover:text-foreground transition-colors">
                    <HelpCircle className="h-3.5 w-3.5" />
                  </button>
                </TooltipTrigger>
                <TooltipContent side="top" className="max-w-[320px] text-xs">
                  <p className="font-medium mb-1">Eficiência do Capital</p>
                  <p className="mb-2">ROI sobre capital alocado em bookmakers.</p>
                  <p><strong>Cálculo:</strong> Lucro Operacional ÷ Capital em Bookmakers</p>
                  <p className="mt-2 text-muted-foreground italic">Responde: "Vale mais alocar mais capital ou otimizar execução?"</p>
                </TooltipContent>
              </UITooltip>
            </TooltipProvider>
          </CardTitle>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Main Metric */}
        <div className="p-4 bg-gradient-to-br from-yellow-500/10 to-yellow-500/5 border border-yellow-500/20 rounded-lg text-center">
          <Zap className="h-6 w-6 text-yellow-500 mx-auto mb-1" />
          <div className="flex items-baseline justify-center gap-1">
            <p className={cn("text-3xl font-bold", status.color)}>
              {eficiencia.toFixed(1)}
            </p>
            <p className="text-lg text-muted-foreground">%</p>
          </div>
          <p className="text-xs text-muted-foreground mt-1">ROI sobre capital alocado</p>
        </div>

        {/* Details */}
        <div className="grid grid-cols-2 gap-3">
          <div className="p-3 bg-muted/30 rounded-lg">
            <div className="flex items-center gap-1.5 mb-1">
              <TrendingUp className="h-3.5 w-3.5 text-success" />
              <p className="text-[10px] text-muted-foreground uppercase">Lucro Operacional</p>
            </div>
            <p className="text-sm font-semibold text-success">{formatCurrency(lucroOperacional)}</p>
          </div>
          <div className="p-3 bg-muted/30 rounded-lg">
            <div className="flex items-center gap-1.5 mb-1">
              <Target className="h-3.5 w-3.5 text-primary" />
              <p className="text-[10px] text-muted-foreground uppercase">Capital Alocado</p>
            </div>
            <p className="text-sm font-semibold text-primary">{formatCurrency(capitalEmBookmakers)}</p>
          </div>
        </div>

        {/* Recommendation */}
        <div className="p-3 bg-muted/30 rounded-lg">
          <div className="flex items-start gap-2">
            <div className={cn("p-1.5 rounded", 
              eficiencia >= 5 ? "bg-success/10" : eficiencia > 0 ? "bg-yellow-500/10" : "bg-destructive/10"
            )}>
              {eficiencia >= 5 ? (
                <TrendingUp className="h-4 w-4 text-success" />
              ) : eficiencia > 0 ? (
                <Target className="h-4 w-4 text-yellow-500" />
              ) : (
                <TrendingDown className="h-4 w-4 text-destructive" />
              )}
            </div>
            <div>
              <p className={cn("text-sm font-medium", status.color)}>{status.label}</p>
              <p className="text-xs text-muted-foreground mt-0.5">{getRecomendacao()}</p>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
