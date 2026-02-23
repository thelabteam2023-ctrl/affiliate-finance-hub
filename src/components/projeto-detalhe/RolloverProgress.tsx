import { useState } from "react";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { AlertTriangle, Check, Clock, Calculator, Target } from "lucide-react";
import { cn } from "@/lib/utils";
import { ProjectBonus } from "@/hooks/useProjectBonuses";
import { format, differenceInDays, isPast } from "date-fns";
import { parseLocalDateTime } from "@/utils/dateUtils";
import { ptBR } from "date-fns/locale";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

interface RolloverProgressProps {
  bonus: ProjectBonus;
  onUpdateProgress?: (id: string, progress: number) => Promise<boolean>;
  compact?: boolean;
}

export function RolloverProgress({ bonus, onUpdateProgress, compact = false }: RolloverProgressProps) {
  const target = bonus.rollover_target_amount || 0;
  const progress = bonus.rollover_progress || 0;
  const percentage = target > 0 ? Math.min(100, (progress / target) * 100) : 0;
  const isComplete = percentage >= 100;

  // Check expiration
  const expiresAt = bonus.expires_at ? new Date(bonus.expires_at) : null;
  const isExpired = expiresAt ? isPast(expiresAt) : false;
  const daysRemaining = expiresAt ? differenceInDays(expiresAt, new Date()) : null;
  const isNearExpiry = daysRemaining !== null && daysRemaining <= 5 && daysRemaining > 0;

  // Don't show if no rollover target
  if (!target || target <= 0) {
    return null;
  }

  const formatCurrency = (value: number) => {
    const symbols: Record<string, string> = {
      BRL: "R$",
      USD: "$",
      EUR: "€",
      GBP: "£",
      USDT: "USDT",
    };
    const symbol = symbols[bonus.currency] || bonus.currency;
    return `${symbol} ${value.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  };

  const rolloverBaseLabel = (() => {
    switch (bonus.rollover_base) {
      case "DEPOSITO":
        return "Base: Depósito";
      case "BONUS":
        return "Base: Bônus";
      case "DEPOSITO_BONUS":
        return "Base: Dep + Bônus";
      default:
        return "";
    }
  })();

  if (compact) {
    return (
      <div className="space-y-1">
        <div className="flex items-center justify-between text-xs">
          <span className="text-muted-foreground flex items-center gap-1">
            Rollover: {bonus.rollover_multiplier}x
            {bonus.min_odds && (
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Badge variant="outline" className="text-[8px] px-1 py-0 h-4">
                      ≥{bonus.min_odds}
                    </Badge>
                  </TooltipTrigger>
                  <TooltipContent side="top" className="text-xs">
                    Odd mínima: {bonus.min_odds}
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            )}
          </span>
          <span className={cn(
            "font-medium",
            isComplete && "text-emerald-500",
            isNearExpiry && !isComplete && "text-amber-500",
            isExpired && !isComplete && "text-red-500"
          )}>
            {percentage.toFixed(0)}%
          </span>
        </div>
        <Progress 
          value={percentage} 
          className={cn(
            "h-1.5",
            isComplete && "[&>div]:bg-emerald-500",
            isNearExpiry && !isComplete && "[&>div]:bg-amber-500",
            isExpired && !isComplete && "[&>div]:bg-red-500"
          )} 
        />
        <div className="flex items-center justify-between text-[10px] text-muted-foreground">
          <span>{formatCurrency(progress)}</span>
          <span>{formatCurrency(target)}</span>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-2 p-3 rounded-lg border bg-card">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium">
            Rollover {bonus.rollover_multiplier}x
          </span>
          {rolloverBaseLabel && (
            <Badge variant="outline" className="text-[10px]">
              {rolloverBaseLabel}
            </Badge>
          )}
          {bonus.min_odds && (
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Badge variant="outline" className="text-[10px] gap-1">
                    <Target className="h-2.5 w-2.5" />
                    Odd ≥ {bonus.min_odds}
                  </Badge>
                </TooltipTrigger>
                <TooltipContent side="top" className="text-xs max-w-[200px]">
                  <p>Apenas apostas com odd igual ou maior que {bonus.min_odds} são contabilizadas no rollover.</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          )}
        </div>
        <div className="flex items-center gap-2">
          {isComplete ? (
            <Badge className="bg-emerald-500/10 text-emerald-500 border-emerald-500/20">
              <Check className="h-3 w-3 mr-1" />
              Concluído
            </Badge>
          ) : isExpired ? (
            <Badge variant="destructive">
              <AlertTriangle className="h-3 w-3 mr-1" />
              Expirado
            </Badge>
          ) : isNearExpiry ? (
            <Badge className="bg-amber-500/10 text-amber-500 border-amber-500/20">
              <Clock className="h-3 w-3 mr-1" />
              {daysRemaining}d restantes
            </Badge>
          ) : daysRemaining !== null ? (
            <Badge variant="outline" className="text-xs">
              {daysRemaining}d restantes
            </Badge>
          ) : null}
        </div>
      </div>

      <div className="space-y-1">
        <div className="flex items-center justify-between text-sm">
          <span className="text-muted-foreground">Progresso</span>
          <span className={cn(
            "font-semibold",
            isComplete && "text-emerald-500",
            isNearExpiry && !isComplete && "text-amber-500",
            isExpired && !isComplete && "text-red-500"
          )}>
            {percentage.toFixed(1)}%
          </span>
        </div>
        <Progress 
          value={percentage} 
          className={cn(
            "h-2",
            isComplete && "[&>div]:bg-emerald-500",
            isNearExpiry && !isComplete && "[&>div]:bg-amber-500",
            isExpired && !isComplete && "[&>div]:bg-red-500"
          )}
        />
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>{formatCurrency(progress)} apostado</span>
          <span>Meta: {formatCurrency(target)}</span>
        </div>
      </div>

      {/* Info sobre cálculo automático */}
      <div className="flex items-center gap-1.5 p-2 rounded-md bg-muted/50 text-xs text-muted-foreground">
        <Calculator className="h-3.5 w-3.5 flex-shrink-0 text-primary" />
        <span>
          Cálculo automático baseado nas apostas vinculadas.
          {bonus.min_odds && ` Apenas odds ≥ ${bonus.min_odds} contam.`}
          {bonus.credited_at && ` Só apostas após ${format(parseLocalDateTime(bonus.credited_at), "dd/MM/yyyy", { locale: ptBR })}.`}
        </span>
      </div>
    </div>
  );
}
