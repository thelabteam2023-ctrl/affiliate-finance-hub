import { Info } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

interface SaldoOperavelDisplayProps {
  /** Saldo Operável = Fiat + Bônus + Freebet */
  saldoOperavel: number;
  /** Em Aposta = Stakes pendentes */
  saldoEmAposta: number;
  /** Disponível = Saldo Operável - Em Aposta */
  saldoDisponivel: number;
  /** Componentes para o tooltip de composição */
  saldoReal: number;
  saldoFreebet: number;
  saldoBonus: number;
  /** Função de formatação */
  formatCurrency: (value: number, moeda?: string) => string;
  /** Moeda da conta */
  moeda?: string;
  /** Variante de exibição */
  variant?: "card" | "list" | "compact";
  /** Classes adicionais */
  className?: string;
}

/**
 * Componente unificado para exibição de saldos de conta
 * 
 * PRINCÍPIO DE VERDADE ÚNICA:
 * - Saldo Operável: Tudo que pode virar dinheiro apostável (Fiat + Bônus + Freebet)
 * - Em Aposta: Parte alocada em apostas pendentes
 * - Disponível para Aposta: O que ainda pode ser usado agora
 * 
 * FÓRMULAS OBRIGATÓRIAS:
 * - Saldo Operável = Fiat + Bônus + Freebet
 * - Disponível = Saldo Operável - Em Aposta
 * 
 * Bônus/Freebet/Fiat aparecem APENAS no tooltip de composição
 */
export function SaldoOperavelDisplay({
  saldoOperavel,
  saldoEmAposta,
  saldoDisponivel,
  saldoReal,
  saldoFreebet,
  saldoBonus,
  formatCurrency,
  moeda = "BRL",
  variant = "card",
  className,
}: SaldoOperavelDisplayProps) {
  const hasComposition = saldoFreebet > 0 || saldoBonus > 0;

  // Componente de tooltip com composição
  const CompositionTooltip = () => (
    <div className="space-y-2 min-w-[160px]">
      <p className="font-medium text-xs border-b border-border pb-1">Composição do Saldo</p>
      <div className="space-y-1 text-xs">
        <div className="flex justify-between">
          <span className="text-muted-foreground">Fiat:</span>
          <span className="font-medium">{formatCurrency(saldoReal, moeda)}</span>
        </div>
        {saldoFreebet > 0 && (
          <div className="flex justify-between">
            <span className="text-muted-foreground">Freebet:</span>
            <span className="font-medium text-amber-400">{formatCurrency(saldoFreebet, moeda)}</span>
          </div>
        )}
        {saldoBonus > 0 && (
          <div className="flex justify-between">
            <span className="text-muted-foreground">Bônus:</span>
            <span className="font-medium text-primary">{formatCurrency(saldoBonus, moeda)}</span>
          </div>
        )}
        <div className="flex justify-between pt-1 border-t border-border">
          <span className="text-muted-foreground font-medium">Total:</span>
          <span className="font-bold">{formatCurrency(saldoOperavel, moeda)}</span>
        </div>
      </div>
    </div>
  );

  // Variante LIST - horizontal
  if (variant === "list") {
    return (
      <div className={cn("flex items-center gap-4", className)}>
        {/* Saldo Operável - Dominante */}
        <div className="text-right w-[110px] flex-shrink-0">
          <p className="text-xs text-muted-foreground flex items-center justify-end gap-1">
            Saldo Operável
            {hasComposition && (
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Info className="h-3 w-3 text-muted-foreground/70 cursor-help" />
                  </TooltipTrigger>
                  <TooltipContent side="top">
                    <CompositionTooltip />
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            )}
          </p>
          <p className="font-bold text-foreground">{formatCurrency(saldoOperavel, moeda)}</p>
        </div>

        {/* Em Aposta - Informativo */}
        <div className="text-right w-[90px] flex-shrink-0">
          <p className="text-xs text-muted-foreground">Em Aposta</p>
          <p className="font-medium text-warning">{formatCurrency(saldoEmAposta, moeda)}</p>
        </div>

        {/* Disponível - Destaque secundário */}
        <div className="text-right w-[100px] flex-shrink-0">
          <p className="text-xs text-muted-foreground">Disponível</p>
          <p className="font-semibold text-accent-foreground">{formatCurrency(saldoDisponivel, moeda)}</p>
        </div>
      </div>
    );
  }

  // Variante COMPACT - mínima
  if (variant === "compact") {
    return (
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <div className={cn("text-right cursor-help", className)}>
              <p className="font-bold text-foreground">{formatCurrency(saldoOperavel, moeda)}</p>
              <p className="text-xs text-muted-foreground">
                {saldoEmAposta > 0 && (
                  <span className="text-warning mr-2">-{formatCurrency(saldoEmAposta, moeda)} em jogo</span>
                )}
                <span className="text-accent-foreground">{formatCurrency(saldoDisponivel, moeda)} livre</span>
              </p>
            </div>
          </TooltipTrigger>
          <TooltipContent side="top">
            <CompositionTooltip />
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  }

  // Variante CARD - vertical (default)
  return (
    <div className={cn("space-y-2", className)}>
      {/* Saldo Operável - Número dominante */}
      <div className="p-2 rounded-md bg-primary/10 border border-primary/20">
        <div className="flex items-center justify-between">
          <span className="text-xs font-medium text-primary flex items-center gap-1">
            Saldo Operável
            {hasComposition && (
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Info className="h-3 w-3 text-primary/70 cursor-help" />
                  </TooltipTrigger>
                  <TooltipContent side="top">
                    <CompositionTooltip />
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            )}
          </span>
          <span className="text-base font-bold text-primary">
            {formatCurrency(saldoOperavel, moeda)}
          </span>
        </div>
      </div>

      {/* Em Aposta + Disponível */}
      <div className="grid grid-cols-2 gap-2">
        {/* Em Aposta - Informativo */}
        <div className="flex flex-col">
          <span className="text-[10px] text-muted-foreground">Em Aposta</span>
          <span className="text-sm font-medium text-warning">
            {formatCurrency(saldoEmAposta, moeda)}
          </span>
        </div>

        {/* Disponível - Destaque secundário */}
        <div className="flex flex-col text-right">
          <span className="text-[10px] text-muted-foreground">Disponível</span>
          <span className="text-sm font-semibold text-accent-foreground">
            {formatCurrency(saldoDisponivel, moeda)}
          </span>
        </div>
      </div>
    </div>
  );
}
