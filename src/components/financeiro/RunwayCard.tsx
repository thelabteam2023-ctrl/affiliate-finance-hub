import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Clock, AlertTriangle, CheckCircle, AlertCircle, HelpCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  Tooltip as UITooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

interface RunwayCardProps {
  liquidezImediata: number;
  burnRateMensal: number;
  formatCurrency: (value: number) => string;
}

export function RunwayCard({
  liquidezImediata,
  burnRateMensal,
  formatCurrency,
}: RunwayCardProps) {
  const runwayMeses = burnRateMensal > 0 ? liquidezImediata / burnRateMensal : Infinity;
  const runwaySemanas = runwayMeses * 4;

  const getStatus = () => {
    if (runwayMeses >= 6) return { 
      label: "Saudável", 
      color: "text-success", 
      bg: "bg-success/10",
      border: "border-success/20",
      icon: CheckCircle,
      description: "Operação sustentável"
    };
    if (runwayMeses >= 3) return { 
      label: "Atenção", 
      color: "text-yellow-500", 
      bg: "bg-yellow-500/10",
      border: "border-yellow-500/20",
      icon: AlertCircle,
      description: "Monitorar entradas"
    };
    return { 
      label: "Crítico", 
      color: "text-destructive", 
      bg: "bg-destructive/10",
      border: "border-destructive/20",
      icon: AlertTriangle,
      description: "Ação imediata necessária"
    };
  };

  const status = getStatus();
  const StatusIcon = status.icon;

  return (
    <Card className={cn("overflow-hidden border-2", status.border)}>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base flex items-center gap-2">
            <Clock className="h-4 w-4 text-primary" />
            Runway Financeiro
            <TooltipProvider>
              <UITooltip delayDuration={300}>
                <TooltipTrigger asChild>
                  <button className="text-muted-foreground hover:text-foreground transition-colors">
                    <HelpCircle className="h-3.5 w-3.5" />
                  </button>
                </TooltipTrigger>
                <TooltipContent side="top" className="max-w-[320px] text-xs">
                  <p className="font-medium mb-1">Runway Financeiro</p>
                  <p className="mb-2">Tempo de sobrevivência sem novos aportes.</p>
                  <p><strong>Cálculo:</strong> Liquidez Imediata ÷ Burn Rate Mensal</p>
                  <p className="mt-2"><strong>Referência:</strong></p>
                  <p>• 6+ meses: Saudável</p>
                  <p>• 3-6 meses: Atenção</p>
                  <p>• &lt;3 meses: Crítico</p>
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
        {/* Main Display */}
        <div className={cn("p-6 rounded-lg text-center", status.bg)}>
          <StatusIcon className={cn("h-8 w-8 mx-auto mb-2", status.color)} />
          {runwayMeses === Infinity ? (
            <>
              <p className="text-3xl font-bold text-success">∞</p>
              <p className="text-sm text-muted-foreground mt-1">Sem burn rate</p>
            </>
          ) : (
            <>
              <div className="flex items-baseline justify-center gap-2">
                <p className={cn("text-4xl font-bold", status.color)}>
                  {runwayMeses >= 1 ? runwayMeses.toFixed(1) : runwaySemanas.toFixed(0)}
                </p>
                <p className="text-lg text-muted-foreground">
                  {runwayMeses >= 1 ? "meses" : "semanas"}
                </p>
              </div>
              <p className="text-sm text-muted-foreground mt-2">{status.description}</p>
            </>
          )}
        </div>

        {/* Details */}
        <div className="grid grid-cols-2 gap-3">
          <div className="p-3 bg-muted/30 rounded-lg">
            <p className="text-[10px] text-muted-foreground uppercase">Liquidez Imediata</p>
            <p className="text-sm font-semibold text-foreground">{formatCurrency(liquidezImediata)}</p>
          </div>
          <div className="p-3 bg-muted/30 rounded-lg">
            <p className="text-[10px] text-muted-foreground uppercase">Burn Mensal</p>
            <p className="text-sm font-semibold text-orange-500">{formatCurrency(burnRateMensal)}</p>
          </div>
        </div>

        {/* Progress bar showing runway */}
        {runwayMeses !== Infinity && (
          <div className="space-y-1">
            <div className="h-3 bg-muted rounded-full overflow-hidden flex">
              {runwayMeses >= 6 ? (
                <div className="h-full bg-success w-full rounded-full" />
              ) : (
                <>
                  <div 
                    className={cn("h-full transition-all")}
                    style={{ 
                      width: `${Math.min((runwayMeses / 6) * 100, 100)}%`,
                      backgroundColor: runwayMeses >= 3 ? 'hsl(var(--success))' : 'hsl(var(--destructive))'
                    }}
                  />
                  <div 
                    className="h-full bg-muted-foreground/20 flex-1"
                  />
                </>
              )}
            </div>
            <div className="flex justify-between text-[10px] text-muted-foreground">
              <span>0</span>
              <span>3 meses</span>
              <span>6+ meses</span>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
