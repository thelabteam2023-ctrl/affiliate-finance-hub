/**
 * SaldoWaterfallPreview - Mostra como o stake será distribuído
 * 
 * Exibe a prévia do débito waterfall:
 * 1. BONUS (automático) → 2. FREEBET (se toggle) → 3. REAL
 */

import { useMemo } from "react";
import { Badge } from "@/components/ui/badge";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Coins, Gift, Sparkles, ArrowRight, AlertTriangle, CheckCircle } from "lucide-react";
import { cn } from "@/lib/utils";

interface WaterfallBreakdown {
  debitoBonus: number;
  debitoFreebet: number;
  debitoReal: number;
  stakeCoberto: boolean;
  saldoRestante: number;
}

interface SaldoWaterfallPreviewProps {
  stake: number;
  saldoBonus: number;
  saldoFreebet: number;
  saldoReal: number;
  usarFreebet: boolean;
  moeda: string;
  showBreakdown?: boolean;
  className?: string;
  /** Quando true, indica que esta é uma edição */
  isEditMode?: boolean;
  /** Stake original da aposta (para edição) */
  originalStake?: number;
  /** 
   * Resultado atual da aposta sendo editada.
   * Se RED/MEIO_RED: stake já foi perdido (não está no saldo) → adiciona ao cálculo
   * Se GREEN/VOID/PENDENTE: stake retornou ou está travado → não adiciona
   */
  currentResultado?: string | null;
}

/**
 * Calcula o débito waterfall (espelho do SQL)
 */
function calcularWaterfall(
  stake: number,
  saldoBonus: number,
  saldoFreebet: number,
  saldoReal: number,
  usarFreebet: boolean
): WaterfallBreakdown {
  let restante = stake;
  let debitoBonus = 0;
  let debitoFreebet = 0;
  let debitoReal = 0;

  // PASSO 1: Debitar BONUS primeiro (SEMPRE automático)
  if (saldoBonus > 0 && restante > 0) {
    debitoBonus = Math.min(saldoBonus, restante);
    restante -= debitoBonus;
  }

  // PASSO 2: Debitar FREEBET (APENAS se toggle ativo)
  if (usarFreebet && saldoFreebet > 0 && restante > 0) {
    debitoFreebet = Math.min(saldoFreebet, restante);
    restante -= debitoFreebet;
  }

  // PASSO 3: Debitar REAL (restante)
  if (restante > 0) {
    debitoReal = Math.min(saldoReal, restante);
    restante -= debitoReal;
  }

  return {
    debitoBonus,
    debitoFreebet,
    debitoReal,
    stakeCoberto: restante === 0,
    saldoRestante: restante,
  };
}

export function SaldoWaterfallPreview({
  stake,
  saldoBonus,
  saldoFreebet,
  saldoReal,
  usarFreebet,
  moeda,
  showBreakdown = true,
  className,
  isEditMode = false,
  originalStake = 0,
  currentResultado = null,
}: SaldoWaterfallPreviewProps) {
  /**
   * Lógica de ajuste de saldo em modo de edição:
   * - PENDENTE: stake foi "travado" (debitado mas pendente) → será devolvido na reversão → adicionar
   * - RED/MEIO_RED: stake foi perdido definitivamente → precisa ser considerado → adicionar
   * - GREEN/VOID/MEIO_GREEN: stake JÁ retornou via payout → saldo atual está correto → NÃO adicionar
   */
  const stakeJaFoiPerdido = currentResultado === 'RED' || currentResultado === 'MEIO_RED';
  const apostaPendente = currentResultado === null || currentResultado === 'PENDENTE' || currentResultado === '';
  const ajusteSaldo = isEditMode && (stakeJaFoiPerdido || apostaPendente) ? originalStake : 0;
  const saldoRealEfetivo = saldoReal + ajusteSaldo;
  
  const breakdown = useMemo(
    () => calcularWaterfall(stake, saldoBonus, saldoFreebet, saldoRealEfetivo, usarFreebet),
    [stake, saldoBonus, saldoFreebet, saldoRealEfetivo, usarFreebet]
  );

  const formatCurrency = (valor: number) => {
    if (valor === 0) return "-";
    return new Intl.NumberFormat("pt-BR", {
      style: "currency",
      currency: moeda,
      minimumFractionDigits: 2,
    }).format(valor);
  };

  const saldoOperavel = saldoRealEfetivo + saldoBonus + (usarFreebet ? saldoFreebet : 0);

  if (stake <= 0) {
    return null;
  }

  return (
    <div className={cn("space-y-2", className)}>
      {/* Status de cobertura */}
      <div className="flex items-center gap-2">
        {breakdown.stakeCoberto ? (
          <Badge variant="secondary" className="bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 gap-1">
            <CheckCircle className="h-3 w-3" />
            Stake coberto
          </Badge>
        ) : (
          <Badge variant="destructive" className="gap-1">
            <AlertTriangle className="h-3 w-3" />
            Faltam {formatCurrency(breakdown.saldoRestante)}
          </Badge>
        )}
        
        {showBreakdown && (
          <span className="text-xs text-muted-foreground">
            Saldo operável: {formatCurrency(saldoOperavel)}
          </span>
        )}
      </div>

      {/* Breakdown visual */}
      {showBreakdown && stake > 0 && (
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <div className="flex items-center gap-1.5 text-xs cursor-help">
                {breakdown.debitoBonus > 0 && (
                  <>
                    <span className="flex items-center gap-0.5 text-amber-600 dark:text-amber-400">
                      <Sparkles className="h-3 w-3" />
                      {formatCurrency(breakdown.debitoBonus)}
                    </span>
                    <ArrowRight className="h-3 w-3 text-muted-foreground" />
                  </>
                )}
                {breakdown.debitoFreebet > 0 && (
                  <>
                    <span className="flex items-center gap-0.5 text-purple-600 dark:text-purple-400">
                      <Gift className="h-3 w-3" />
                      {formatCurrency(breakdown.debitoFreebet)}
                    </span>
                    <ArrowRight className="h-3 w-3 text-muted-foreground" />
                  </>
                )}
                {breakdown.debitoReal > 0 && (
                  <span className="flex items-center gap-0.5 text-primary">
                    <Coins className="h-3 w-3" />
                    {formatCurrency(breakdown.debitoReal)}
                  </span>
                )}
                {breakdown.debitoBonus === 0 && breakdown.debitoFreebet === 0 && breakdown.debitoReal === 0 && stake > 0 && (
                  <span className="text-destructive">Sem saldo</span>
                )}
              </div>
            </TooltipTrigger>
            <TooltipContent side="bottom" className="max-w-xs">
              <div className="text-xs space-y-1">
                <p className="font-medium">Distribuição do Stake</p>
                <p>O sistema debita automaticamente nesta ordem:</p>
                <ol className="list-decimal list-inside space-y-0.5 pl-1">
                  <li className={cn(breakdown.debitoBonus > 0 && "text-amber-500")}>
                    Bônus: {formatCurrency(breakdown.debitoBonus)} 
                    <span className="text-muted-foreground"> (automático)</span>
                  </li>
                  <li className={cn(breakdown.debitoFreebet > 0 && "text-purple-500")}>
                    Freebet: {formatCurrency(breakdown.debitoFreebet)}
                    {!usarFreebet && <span className="text-muted-foreground"> (desativado)</span>}
                  </li>
                  <li className={cn(breakdown.debitoReal > 0 && "text-primary")}>
                    Real: {formatCurrency(breakdown.debitoReal)}
                  </li>
                </ol>
              </div>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      )}
    </div>
  );
}

/**
 * Hook para usar o cálculo waterfall em outros componentes
 */
export function useWaterfallCalculation(
  stake: number,
  saldoBonus: number,
  saldoFreebet: number,
  saldoReal: number,
  usarFreebet: boolean
): WaterfallBreakdown {
  return useMemo(
    () => calcularWaterfall(stake, saldoBonus, saldoFreebet, saldoReal, usarFreebet),
    [stake, saldoBonus, saldoFreebet, saldoReal, usarFreebet]
  );
}
