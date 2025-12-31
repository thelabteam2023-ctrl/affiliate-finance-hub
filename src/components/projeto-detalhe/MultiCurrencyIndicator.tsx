/**
 * Indicador visual de operação multi-moeda
 * 
 * Exibe transparentemente:
 * - Moeda de consolidação do projeto
 * - Cotação utilizada
 * - Fonte da cotação (PTAX ou Trabalho)
 * - Delta cambial (se aplicável)
 */

import { Badge } from "@/components/ui/badge";
import { 
  Tooltip, 
  TooltipContent, 
  TooltipProvider, 
  TooltipTrigger 
} from "@/components/ui/tooltip";
import { 
  ArrowRightLeft, 
  TrendingUp, 
  TrendingDown, 
  Info,
  DollarSign,
  Banknote
} from "lucide-react";
import { 
  getMoedaSymbol, 
  getMoedaBadgeColor, 
  getMoedaTextColor,
  type MoedaConsolidacao,
  type FonteCotacao 
} from "@/types/projeto";
import { cn } from "@/lib/utils";

interface MultiCurrencyIndicatorProps {
  moedaConsolidacao: MoedaConsolidacao;
  cotacaoAtual: number;
  fonteCotacao: FonteCotacao;
  ptaxAtual?: number;
  deltaCambial?: number | null;
  isMultiCurrency?: boolean;
  compact?: boolean;
  className?: string;
}

export function MultiCurrencyIndicator({
  moedaConsolidacao,
  cotacaoAtual,
  fonteCotacao,
  ptaxAtual,
  deltaCambial,
  isMultiCurrency = false,
  compact = false,
  className,
}: MultiCurrencyIndicatorProps) {
  const MoedaIcon = moedaConsolidacao === "USD" ? DollarSign : Banknote;
  
  const tooltipContent = (
    <div className="space-y-2 text-sm">
      <div className="font-semibold border-b border-border pb-1 mb-2">
        Consolidação Multi-Moeda
      </div>
      <div className="flex justify-between gap-4">
        <span className="text-muted-foreground">Moeda de consolidação:</span>
        <span className={cn("font-medium", getMoedaTextColor(moedaConsolidacao))}>
          {moedaConsolidacao}
        </span>
      </div>
      <div className="flex justify-between gap-4">
        <span className="text-muted-foreground">Cotação usada:</span>
        <span className="font-mono">{cotacaoAtual.toFixed(4)}</span>
      </div>
      <div className="flex justify-between gap-4">
        <span className="text-muted-foreground">Fonte:</span>
        <Badge variant="outline" className="text-xs">
          {fonteCotacao === "PTAX" ? "PTAX (BCB)" : "Trabalho"}
        </Badge>
      </div>
      {fonteCotacao === "TRABALHO" && ptaxAtual && (
        <>
          <div className="flex justify-between gap-4">
            <span className="text-muted-foreground">PTAX atual:</span>
            <span className="font-mono text-muted-foreground">{ptaxAtual.toFixed(4)}</span>
          </div>
          {deltaCambial !== null && deltaCambial !== undefined && (
            <div className="flex justify-between gap-4">
              <span className="text-muted-foreground">Delta:</span>
              <span className={cn(
                "font-mono",
                deltaCambial > 0 ? "text-amber-400" : "text-emerald-400"
              )}>
                {deltaCambial > 0 ? "+" : ""}{deltaCambial.toFixed(2)}%
              </span>
            </div>
          )}
        </>
      )}
      <div className="text-xs text-muted-foreground border-t border-border pt-2 mt-2">
        Todas as métricas consolidadas em {moedaConsolidacao}.
        Valores originais não são alterados.
      </div>
    </div>
  );

  if (compact) {
    return (
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <Badge 
              variant="outline" 
              className={cn(
                "cursor-help gap-1",
                getMoedaBadgeColor(moedaConsolidacao),
                className
              )}
            >
              <MoedaIcon className="h-3 w-3" />
              {moedaConsolidacao}
              {isMultiCurrency && (
                <ArrowRightLeft className="h-3 w-3 ml-0.5" />
              )}
            </Badge>
          </TooltipTrigger>
          <TooltipContent side="bottom" className="max-w-xs">
            {tooltipContent}
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  }

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <div className={cn(
            "flex items-center gap-2 px-3 py-1.5 rounded-lg border cursor-help",
            "bg-muted/30 border-border/50",
            className
          )}>
            <MoedaIcon className={cn("h-4 w-4", getMoedaTextColor(moedaConsolidacao))} />
            
            <div className="flex items-center gap-1.5">
              <span className="text-sm text-muted-foreground">
                KPIs em:
              </span>
              <Badge 
                variant="outline" 
                className={cn("font-semibold", getMoedaBadgeColor(moedaConsolidacao))}
              >
                {moedaConsolidacao}
              </Badge>
            </div>

            {isMultiCurrency && (
              <Badge variant="secondary" className="text-xs gap-1">
                <ArrowRightLeft className="h-3 w-3" />
                Multi-moeda
              </Badge>
            )}

            <div className="flex items-center gap-1 text-xs text-muted-foreground ml-auto">
              <span className="font-mono">{cotacaoAtual.toFixed(2)}</span>
              {deltaCambial !== null && deltaCambial !== undefined && (
                <span className={cn(
                  "flex items-center gap-0.5",
                  deltaCambial > 0 ? "text-amber-400" : "text-emerald-400"
                )}>
                  {deltaCambial > 0 ? (
                    <TrendingUp className="h-3 w-3" />
                  ) : (
                    <TrendingDown className="h-3 w-3" />
                  )}
                  {Math.abs(deltaCambial).toFixed(1)}%
                </span>
              )}
            </div>

            <Info className="h-3.5 w-3.5 text-muted-foreground" />
          </div>
        </TooltipTrigger>
        <TooltipContent side="bottom" className="max-w-xs">
          {tooltipContent}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

/**
 * Badge simples para exibir moeda de consolidação em dashboards
 */
export function ConsolidationBadge({ 
  moeda, 
  showLabel = true,
  className 
}: { 
  moeda: MoedaConsolidacao; 
  showLabel?: boolean;
  className?: string;
}) {
  return (
    <Badge 
      variant="outline" 
      className={cn(
        "gap-1 font-normal",
        getMoedaBadgeColor(moeda),
        className
      )}
    >
      {moeda === "USD" ? (
        <DollarSign className="h-3 w-3" />
      ) : (
        <Banknote className="h-3 w-3" />
      )}
      {showLabel && (
        <span>
          {moeda === "USD" ? "Dólar" : "Real"}
        </span>
      )}
    </Badge>
  );
}

/**
 * Aviso de transparência para dashboards multi-moeda
 */
export function MultiCurrencyWarning({
  moedaConsolidacao,
  fonteCotacao,
  cotacao,
  className,
}: {
  moedaConsolidacao: MoedaConsolidacao;
  fonteCotacao: FonteCotacao;
  cotacao: number;
  className?: string;
}) {
  return (
    <div className={cn(
      "flex items-center gap-2 text-xs text-muted-foreground p-2 rounded-md bg-muted/30 border border-border/50",
      className
    )}>
      <ArrowRightLeft className="h-3.5 w-3.5 flex-shrink-0" />
      <span>
        Projeto opera em multi-moeda. KPIs consolidados em{" "}
        <span className={cn("font-medium", getMoedaTextColor(moedaConsolidacao))}>
          {moedaConsolidacao}
        </span>
        . Conversões baseadas em{" "}
        <span className="font-medium">
          {fonteCotacao === "PTAX" ? "PTAX" : `cotação de trabalho (${cotacao.toFixed(2)})`}
        </span>
        .
      </span>
    </div>
  );
}
