import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Activity, AlertTriangle, CheckCircle, Clock, HelpCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

interface SaudeFinanceiraCardProps {
  caixaDisponivel: number;
  compromissosPendentes: number;
  custosMensais: number;
  formatCurrency: (value: number) => string;
}

export function SaudeFinanceiraCard({
  caixaDisponivel,
  compromissosPendentes,
  custosMensais,
  formatCurrency,
}: SaudeFinanceiraCardProps) {
  // Saúde = (Caixa - Compromissos) / Caixa * 100
  const saudePercent = caixaDisponivel > 0 
    ? Math.max(0, Math.min(100, ((caixaDisponivel - compromissosPendentes) / caixaDisponivel) * 100))
    : 0;

  // Burn Rate = meses que o caixa sustenta a operação
  const burnRateMeses = custosMensais > 0 
    ? Math.floor(caixaDisponivel / custosMensais)
    : Infinity;

  // Status baseado na saúde
  const getStatus = () => {
    if (saudePercent >= 70) return { color: "text-success", bg: "bg-success", label: "Saudável", icon: CheckCircle };
    if (saudePercent >= 40) return { color: "text-yellow-500", bg: "bg-yellow-500", label: "Atenção", icon: AlertTriangle };
    return { color: "text-destructive", bg: "bg-destructive", label: "Crítico", icon: AlertTriangle };
  };

  const status = getStatus();
  const StatusIcon = status.icon;

  // Burn rate status
  const getBurnStatus = () => {
    if (burnRateMeses === Infinity) return { color: "text-muted-foreground", label: "N/A" };
    if (burnRateMeses >= 6) return { color: "text-success", label: `${burnRateMeses} meses` };
    if (burnRateMeses >= 3) return { color: "text-yellow-500", label: `${burnRateMeses} meses` };
    return { color: "text-destructive", label: `${burnRateMeses} ${burnRateMeses === 1 ? "mês" : "meses"}` };
  };

  const burnStatus = getBurnStatus();

  return (
    <Card className="overflow-hidden">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base flex items-center gap-2">
            <Activity className="h-4 w-4 text-primary" />
            Saúde Financeira
            <TooltipProvider>
              <Tooltip delayDuration={300}>
                <TooltipTrigger asChild>
                  <button className="text-muted-foreground hover:text-foreground transition-colors">
                    <HelpCircle className="h-3.5 w-3.5" />
                  </button>
                </TooltipTrigger>
                <TooltipContent side="top" className="max-w-[280px] text-xs">
                  <p className="font-medium mb-1">Saúde Financeira</p>
                  <p>Mede a capacidade de honrar compromissos com o caixa disponível.</p>
                  <p className="mt-1"><strong>Burn Rate:</strong> Quantos meses o caixa atual sustenta a operação no ritmo de custos mensais.</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </CardTitle>
          <div className={cn("flex items-center gap-1.5 text-xs font-medium", status.color)}>
            <StatusIcon className="h-3.5 w-3.5" />
            {status.label}
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Gauge visual */}
        <div className="space-y-2">
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">Caixa vs Compromissos</span>
            <span className={cn("font-bold", status.color)}>{saudePercent.toFixed(0)}%</span>
          </div>
          <div className="relative h-3 bg-muted rounded-full overflow-hidden">
            <div 
              className={cn("h-full rounded-full transition-all duration-700 ease-out", status.bg)}
              style={{ width: `${saudePercent}%` }}
            />
            {/* Markers */}
            <div className="absolute inset-0 flex justify-between px-[1px]">
              <div className="w-[1px] h-full bg-background/50" style={{ marginLeft: '40%' }} />
              <div className="w-[1px] h-full bg-background/50" style={{ marginLeft: '30%' }} />
            </div>
          </div>
          <div className="flex justify-between text-[10px] text-muted-foreground">
            <span>Crítico</span>
            <span>Atenção</span>
            <span>Saudável</span>
          </div>
        </div>

        {/* Values */}
        <div className="grid grid-cols-2 gap-3">
          <div className="p-3 bg-muted/30 rounded-lg">
            <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Disponível</p>
            <p className="text-sm font-bold text-success">{formatCurrency(caixaDisponivel)}</p>
          </div>
          <div className="p-3 bg-muted/30 rounded-lg">
            <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Compromissos</p>
            <p className="text-sm font-bold text-destructive">{formatCurrency(compromissosPendentes)}</p>
          </div>
        </div>

        {/* Burn Rate */}
        <div className="flex items-center justify-between p-3 bg-gradient-to-r from-primary/5 to-primary/10 rounded-lg border border-primary/20">
          <div className="flex items-center gap-2">
            <Clock className="h-4 w-4 text-primary" />
            <span className="text-sm font-medium">Burn Rate</span>
          </div>
          <span className={cn("font-bold", burnStatus.color)}>{burnStatus.label}</span>
        </div>
        <p className="text-[10px] text-muted-foreground text-center">
          Tempo que o caixa atual sustenta a operação no ritmo atual
        </p>
      </CardContent>
    </Card>
  );
}
