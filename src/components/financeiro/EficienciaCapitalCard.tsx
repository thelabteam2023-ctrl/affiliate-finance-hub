import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Zap, TrendingUp, TrendingDown, HelpCircle, Target, Globe, BarChart3, RefreshCw, AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
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
  // Multi-moeda
  hasMultiCurrency?: boolean;
  capitalBRL?: number;
  capitalUSD?: number;
  cotacaoUSD?: number;
  // Capital médio do período (novo)
  capitalMedio?: number;
  capitalMedioIsFallback?: boolean;
  snapshotsCount?: number;
  // Volume apostado no período (para Yield e Turnover)
  volumeApostado?: number;
}

export function EficienciaCapitalCard({
  lucroOperacional,
  capitalEmBookmakers,
  formatCurrency,
  hasMultiCurrency = false,
  capitalBRL = 0,
  capitalUSD = 0,
  cotacaoUSD = 1,
  capitalMedio,
  capitalMedioIsFallback = true,
  snapshotsCount = 0,
  volumeApostado = 0,
}: EficienciaCapitalCardProps) {
  // Use capital médio do período quando disponível, senão capital atual
  const capitalReferencia = capitalMedio && capitalMedio > 0 ? capitalMedio : capitalEmBookmakers;
  const usandoCapitalMedio = capitalMedio && capitalMedio > 0 && !capitalMedioIsFallback;

  const eficiencia = capitalReferencia > 0 ? (lucroOperacional / capitalReferencia) * 100 : 0;

  // Yield = Lucro / Volume apostado
  const yieldPct = volumeApostado > 0 ? (lucroOperacional / volumeApostado) * 100 : null;

  // Turnover = Volume apostado / Capital médio
  const turnover = capitalReferencia > 0 ? volumeApostado / capitalReferencia : null;

  const getStatus = () => {
    if (eficiencia >= 25) return { 
      label: "Excelente", 
      color: "text-success", 
      description: "Alta eficiência — otimizar mais difícil"
    };
    if (eficiencia >= 15) return { 
      label: "Muito Bom", 
      color: "text-emerald-500", 
      description: "Eficiência acima da média"
    };
    if (eficiencia >= 10) return { 
      label: "Bom", 
      color: "text-primary", 
      description: "Eficiência adequada"
    };
    if (eficiencia >= 5) return { 
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
    if (eficiencia >= 25) return "Já operando no topo. Escalar capital pode diluir eficiência.";
    if (eficiencia >= 15) return "Excelente desempenho. Pode escalar com confiança.";
    if (eficiencia >= 10) return "Bom equilíbrio. Pode escalar com monitoramento.";
    if (eficiencia >= 5) return "Focar em otimização antes de aumentar capital.";
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
                <TooltipContent side="top" className="max-w-[360px] text-xs">
                  <p className="font-medium mb-1">Eficiência do Capital (ROI)</p>
                  <p className="mb-2">ROI sobre capital médio alocado no período.</p>
                  <p><strong>Cálculo:</strong> Lucro Operacional ÷ Capital Médio do Período</p>
                  {yieldPct !== null && turnover !== null && (
                    <div className="mt-2 pt-2 border-t border-border/50 space-y-1">
                      <p><strong>Yield:</strong> Lucro ÷ Volume apostado = {yieldPct.toFixed(2)}%</p>
                      <p><strong>Turnover:</strong> Volume ÷ Capital médio = {turnover.toFixed(2)}x</p>
                      <p className="text-muted-foreground italic">ROI = Yield × Turnover</p>
                    </div>
                  )}
                  <p className="mt-2 text-muted-foreground italic">Responde: "Vale mais alocar mais capital ou otimizar execução?"</p>
                </TooltipContent>
              </UITooltip>
            </TooltipProvider>
            {hasMultiCurrency && (
              <TooltipProvider>
                <UITooltip delayDuration={200}>
                  <TooltipTrigger asChild>
                    <Badge variant="outline" className="text-xs gap-1 border-green-500/50 text-green-600 dark:text-green-400 ml-2">
                      <Globe className="h-3 w-3" />
                      <span>Multi</span>
                    </Badge>
                  </TooltipTrigger>
                  <TooltipContent side="top" className="max-w-[240px]">
                    <div className="space-y-1 text-xs">
                      <p className="font-medium">Capital em Múltiplas Moedas</p>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">BRL:</span>
                        <span>{formatCurrency(capitalBRL)}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">USD:</span>
                        <span>${capitalUSD.toLocaleString("en-US", { minimumFractionDigits: 2 })}</span>
                      </div>
                      <div className="flex justify-between pt-1 border-t border-border/50">
                        <span className="text-muted-foreground">Cotação:</span>
                        <span>R$ {cotacaoUSD.toFixed(4)}</span>
                      </div>
                    </div>
                  </TooltipContent>
                </UITooltip>
              </TooltipProvider>
            )}
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
          <p className="text-xs text-muted-foreground mt-1">ROI sobre capital {usandoCapitalMedio ? "médio do período" : "alocado"}</p>
          
          {/* Fallback warning */}
          {capitalMedioIsFallback && capitalEmBookmakers > 0 && (
            <TooltipProvider>
              <UITooltip delayDuration={200}>
                <TooltipTrigger asChild>
                  <div className="flex items-center justify-center gap-1 mt-1.5">
                    <AlertTriangle className="h-3 w-3 text-yellow-500" />
                    <p className="text-[10px] text-yellow-500">Usando capital atual (sem histórico)</p>
                  </div>
                </TooltipTrigger>
                <TooltipContent className="max-w-[280px] text-xs">
                  <p>O sistema ainda não possui snapshots diários suficientes para calcular o capital médio do período.</p>
                  <p className="mt-1">Os snapshots são gravados automaticamente a cada dia. Em poucos dias o cálculo será temporalmente preciso.</p>
                </TooltipContent>
              </UITooltip>
            </TooltipProvider>
          )}
        </div>

        {/* Details */}
        <div className="grid grid-cols-2 gap-3">
          <div className="p-3 bg-muted/30 rounded-lg">
            <div className="flex items-center gap-1.5 mb-1">
              {lucroOperacional >= 0 ? (
                <TrendingUp className="h-3.5 w-3.5 text-success" />
              ) : (
                <TrendingDown className="h-3.5 w-3.5 text-destructive" />
              )}
              <p className="text-[10px] text-muted-foreground uppercase">Lucro Operacional</p>
            </div>
            <p className={cn("text-sm font-semibold", lucroOperacional >= 0 ? "text-success" : "text-destructive")}>
              {formatCurrency(lucroOperacional)}
            </p>
          </div>
          <div className="p-3 bg-muted/30 rounded-lg">
            <div className="flex items-center gap-1.5 mb-1">
              <Target className="h-3.5 w-3.5 text-primary" />
              <p className="text-[10px] text-muted-foreground uppercase">
                Capital {usandoCapitalMedio ? "Médio" : "Alocado"}
              </p>
            </div>
            <p className="text-sm font-semibold text-primary">{formatCurrency(capitalReferencia)}</p>
            {usandoCapitalMedio && (
              <p className="text-[10px] text-muted-foreground mt-0.5">{snapshotsCount} dias de amostra</p>
            )}
          </div>
        </div>

        {/* Yield & Turnover (quando há volume) */}
        {volumeApostado > 0 && (
          <div className="grid grid-cols-3 gap-2">
            <div className="p-2.5 bg-muted/30 rounded-lg text-center">
              <p className="text-[10px] text-muted-foreground uppercase mb-0.5">Yield</p>
              <p className={cn("text-sm font-bold", yieldPct && yieldPct >= 0 ? "text-success" : "text-destructive")}>
                {yieldPct !== null ? `${yieldPct.toFixed(2)}%` : "—"}
              </p>
            </div>
            <div className="p-2.5 bg-muted/30 rounded-lg text-center">
              <p className="text-[10px] text-muted-foreground uppercase mb-0.5">Turnover</p>
              <p className="text-sm font-bold text-primary">
                {turnover !== null ? `${turnover.toFixed(1)}x` : "—"}
              </p>
            </div>
            <div className="p-2.5 bg-muted/30 rounded-lg text-center">
              <TooltipProvider>
                <UITooltip delayDuration={200}>
                  <TooltipTrigger asChild>
                    <div>
                      <p className="text-[10px] text-muted-foreground uppercase mb-0.5">Volume</p>
                      <p className="text-sm font-bold text-foreground">
                        {formatCurrency(volumeApostado)}
                      </p>
                    </div>
                  </TooltipTrigger>
                  <TooltipContent className="text-xs">
                    Volume total apostado no período (stakes liquidadas)
                  </TooltipContent>
                </UITooltip>
              </TooltipProvider>
            </div>
          </div>
        )}

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
