import { Gift } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

interface SaldoCompostoProps {
  saldoReal: number;
  saldoFreebet?: number;
  saldoBonus?: number;
  formatCurrency: (value: number, moeda?: string) => string;
  moeda?: string;
  variant?: "default" | "compact" | "inline";
  showTooltip?: boolean;
  className?: string;
}

/**
 * Componente para exibir saldo composto (Real + Freebet + Bônus)
 * 
 * Exemplos de exibição:
 * - default: "R$ 100,00 + R$ 30 fb"
 * - compact: "R$ 100 + 30 fb"
 * - inline: "R$ 130,00" com tooltip mostrando composição
 */
export function SaldoComposto({
  saldoReal,
  saldoFreebet = 0,
  saldoBonus = 0,
  formatCurrency,
  moeda = "BRL",
  variant = "default",
  showTooltip = true,
  className,
}: SaldoCompostoProps) {
  const hasFreebet = saldoFreebet > 0;
  const hasBonus = saldoBonus > 0;
  const hasExtras = hasFreebet || hasBonus;
  const total = saldoReal + saldoFreebet + saldoBonus;

  // Formatar valor de forma mais compacta para extras
  const formatCompact = (value: number) => {
    if (value >= 1000) {
      return `${(value / 1000).toFixed(1)}k`;
    }
    return value.toFixed(0);
  };

  const content = (
    <div className={cn("flex items-center gap-1 flex-wrap", className)}>
      {/* Saldo Real - sempre visível */}
      <span className="font-semibold">
        {formatCurrency(saldoReal, moeda)}
      </span>

      {/* Freebet - se existir */}
      {hasFreebet && (
        <span className="flex items-center gap-0.5 text-amber-400">
          <span className="text-muted-foreground">+</span>
          {variant === "compact" ? (
            <span className="text-xs font-medium">
              {formatCompact(saldoFreebet)} fb
            </span>
          ) : (
            <span className="text-sm font-medium flex items-center gap-0.5">
              <Gift className="h-3 w-3" />
              {formatCurrency(saldoFreebet, moeda).replace(/[^\d.,]/g, '')}
            </span>
          )}
        </span>
      )}

      {/* Bônus - se existir */}
      {hasBonus && (
        <span className="flex items-center gap-0.5 text-purple-400">
          <span className="text-muted-foreground">+</span>
          {variant === "compact" ? (
            <span className="text-xs font-medium">
              {formatCompact(saldoBonus)} bônus
            </span>
          ) : (
            <span className="text-sm font-medium">
              {formatCurrency(saldoBonus, moeda).replace(/[^\d.,]/g, '')} bônus
            </span>
          )}
        </span>
      )}
    </div>
  );

  // Variante inline: mostra total, tooltip mostra composição
  if (variant === "inline") {
    if (!hasExtras || !showTooltip) {
      return (
        <span className={cn("font-semibold", className)}>
          {formatCurrency(total, moeda)}
        </span>
      );
    }

    return (
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <span className={cn("font-semibold cursor-help flex items-center gap-1", className)}>
              {formatCurrency(total, moeda)}
              {hasFreebet && <Gift className="h-3 w-3 text-amber-400" />}
            </span>
          </TooltipTrigger>
          <TooltipContent side="top" className="text-xs">
            <div className="space-y-0.5">
              <p>Real: {formatCurrency(saldoReal, moeda)}</p>
              {hasFreebet && (
                <p className="text-amber-400">Freebet: {formatCurrency(saldoFreebet, moeda)}</p>
              )}
              {hasBonus && (
                <p className="text-purple-400">Bônus: {formatCurrency(saldoBonus, moeda)}</p>
              )}
            </div>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  }

  // Default e Compact: mostra composição direta
  if (!hasExtras) {
    return (
      <span className={cn("font-semibold", className)}>
        {formatCurrency(saldoReal, moeda)}
      </span>
    );
  }

  if (showTooltip) {
    return (
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <div className="cursor-help">{content}</div>
          </TooltipTrigger>
          <TooltipContent side="top" className="text-xs">
            <p>Total Operável: {formatCurrency(total, moeda)}</p>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  }

  return content;
}

/**
 * Versão simplificada para uso em listas/tabelas
 * Mostra: "R$ 100 + R$ 30 fb" ou apenas "R$ 100" se não tiver freebet
 */
export function SaldoCompostoSimples({
  saldoReal,
  saldoFreebet = 0,
  formatCurrency,
  moeda = "BRL",
  className,
}: Omit<SaldoCompostoProps, "saldoBonus" | "variant" | "showTooltip">) {
  const hasFreebet = saldoFreebet > 0;

  if (!hasFreebet) {
    return (
      <span className={cn("font-semibold", className)}>
        {formatCurrency(saldoReal, moeda)}
      </span>
    );
  }

  return (
    <div className={cn("flex items-center gap-1", className)}>
      <span className="font-semibold">
        {formatCurrency(saldoReal, moeda)}
      </span>
      <span className="text-muted-foreground">+</span>
      <span className="text-amber-400 text-sm font-medium flex items-center gap-0.5">
        <Gift className="h-3 w-3" />
        {formatCurrency(saldoFreebet, moeda).replace(/[^\d.,]/g, '')}
      </span>
    </div>
  );
}
