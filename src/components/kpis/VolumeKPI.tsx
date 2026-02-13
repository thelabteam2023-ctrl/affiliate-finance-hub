/**
 * COMPONENTE GLOBAL DE KPI DE VOLUME
 * 
 * Exibe APENAS o valor consolidado no card.
 * Detalhamento por moeda original aparece EXCLUSIVAMENTE na tooltip.
 * 
 * NENHUMA aba pode ter implementação própria de Volume KPI.
 */

import { ReactNode, useMemo } from "react";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DollarSign, Calculator } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  consolidateVolume,
  formatCurrencyForDisplay,
  type ConsolidationResult,
} from "@/utils/consolidateCurrency";

export interface VolumeKPIProps {
  /** Mapa de moeda -> valor original (raw stakes por moeda) */
  volumeByCurrency: Record<string, number>;
  /** Moeda de consolidação do projeto */
  consolidationCurrency: string;
  /** Função que retorna taxa BRL de uma moeda (ex: USD -> 5.16) */
  getRate: (moeda: string) => number;
  /** Formatador do projeto para o valor consolidado */
  formatCurrency: (valor: number) => string;
  /** Data da cotação (ISO ou label) */
  rateDate?: string;
  /** Ícone alternativo (default: DollarSign) */
  icon?: ReactNode;
  /** Label alternativo (default: "Volume") */
  label?: string;
  /** Sub-label quando não multi-moeda */
  subLabel?: string;
  /** Classes CSS extras para o Card */
  className?: string;
}

/**
 * Card de Volume com tooltip multi-moeda.
 * 
 * Card: Sempre mostra APENAS o total consolidado.
 * Tooltip: Mostra breakdown por moeda + taxas + total.
 */
export function VolumeKPI({
  volumeByCurrency,
  consolidationCurrency,
  getRate,
  formatCurrency,
  rateDate,
  icon,
  label = "Volume",
  subLabel = "Total apostado",
  className,
}: VolumeKPIProps) {
  const consolidation = useMemo(
    () => consolidateVolume(volumeByCurrency, consolidationCurrency, getRate),
    [volumeByCurrency, consolidationCurrency, getRate]
  );

  const hasMultipleCurrencies = consolidation.breakdown.length > 1;
  const hasDifferentCurrency = consolidation.breakdown.some(
    (c) => c.moeda !== consolidationCurrency
  );
  const showTooltip = hasMultipleCurrencies || hasDifferentCurrency;

  const rateEntries = Object.entries(consolidation.rates);

  const cardContent = (
    <Card className={cn("overflow-hidden", showTooltip && "cursor-help", className)} style={{ contain: "layout paint" }}>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-1 md:pb-2 p-3 md:p-6">
        <CardTitle className="text-xs md:text-sm font-medium">{label}</CardTitle>
        {icon || <DollarSign className="h-3.5 w-3.5 md:h-4 md:w-4 text-muted-foreground" />}
      </CardHeader>
      <CardContent className="p-3 pt-0 md:p-6 md:pt-0">
        <div className="text-lg md:text-2xl font-bold truncate">
          {formatCurrency(consolidation.total)}
        </div>
        <p className="text-[10px] md:text-xs text-muted-foreground">
          {showTooltip
            ? `Consolidado em ${consolidationCurrency}`
            : subLabel}
        </p>
      </CardContent>
    </Card>
  );

  if (!showTooltip) {
    return cardContent;
  }

  return (
    <TooltipProvider>
      <Tooltip delayDuration={200}>
        <TooltipTrigger asChild>{cardContent}</TooltipTrigger>
        <TooltipContent
          side="bottom"
          className="max-w-[320px] p-3"
          sideOffset={8}
        >
          <div className="space-y-2">
            {/* Header */}
            <p className="text-xs font-semibold text-foreground border-b border-border pb-1.5">
              Volume por moeda original
            </p>

            {/* Breakdown por moeda */}
            <div className="space-y-1">
              {consolidation.breakdown.map((item) => (
                <div
                  key={item.moeda}
                  className="flex items-center justify-between gap-3 text-xs"
                >
                  <Badge
                    variant="secondary"
                    className="text-[10px] px-1.5 py-0"
                  >
                    {item.moeda}
                  </Badge>
                  <span className="font-medium tabular-nums">
                    {formatCurrencyForDisplay(item.valor, item.moeda)}
                  </span>
                </div>
              ))}
            </div>

            {/* Total consolidado */}
            <div className="border-t border-border pt-1.5 mt-2">
              <div className="flex justify-between items-center">
                <span className="text-xs font-semibold">Total Consolidado</span>
                <span className="text-sm font-bold text-foreground tabular-nums">
                  {formatCurrency(consolidation.total)}
                </span>
              </div>
            </div>

            {/* Taxas utilizadas */}
            {rateEntries.length > 0 && (
              <div className="border-t border-border pt-1.5 mt-1">
                <p className="text-[10px] text-muted-foreground mb-1">
                  Cotação utilizada:
                </p>
                <div className="space-y-0.5">
                  {rateEntries.map(([moeda, taxa]) => (
                    <div
                      key={moeda}
                      className="flex justify-between text-[10px] text-muted-foreground"
                    >
                      <span>
                        {moeda} → {consolidationCurrency}:
                      </span>
                      <span className="tabular-nums">
                        {taxa.toLocaleString("pt-BR", {
                          minimumFractionDigits: 2,
                          maximumFractionDigits: 4,
                        })}
                      </span>
                    </div>
                  ))}
                </div>
                {rateDate && (
                  <p className="text-[9px] text-muted-foreground/60 mt-1">
                    Data da cotação: {rateDate}
                  </p>
                )}
              </div>
            )}
          </div>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
