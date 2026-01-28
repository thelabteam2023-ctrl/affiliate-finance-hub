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

  // saldoReal já inclui bônus creditados (via ledger). Não somar saldoBonus novamente.
  const saldoOperavel = saldoRealEfetivo + (usarFreebet ? saldoFreebet : 0);

  if (stake <= 0) {
    return null;
  }

  // Verifica se há bônus ou freebet ativo no breakdown
  const hasActivePromo = saldoBonus > 0 || (usarFreebet && saldoFreebet > 0);

  return (
    <div className={cn("flex items-center gap-2", className)}>
      {/* Status de cobertura + Saldo Operável unificado */}
      {breakdown.stakeCoberto ? (
        <Badge variant="secondary" className="bg-primary/10 text-primary gap-1">
          <CheckCircle className="h-3 w-3" />
          Stake coberto
        </Badge>
      ) : (
        <Badge variant="destructive" className="gap-1">
          <AlertTriangle className="h-3 w-3" />
          Faltam {formatCurrency(breakdown.saldoRestante)}
        </Badge>
      )}
      
      {/* Saldo Operável simplificado: valor único + ícone de presente se há promo */}
      <span className="text-xs text-muted-foreground flex items-center gap-1">
        Saldo Operável: {formatCurrency(saldoOperavel)}
        {hasActivePromo && (
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Gift className="h-3 w-3 text-warning cursor-help" />
              </TooltipTrigger>
              <TooltipContent side="bottom" className="text-xs">
                Inclui bônus/freebet ativo
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        )}
      </span>
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
