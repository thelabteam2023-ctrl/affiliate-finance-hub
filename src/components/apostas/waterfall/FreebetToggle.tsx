/**
 * FreebetToggle - Toggle para usar saldo de freebet com valor editável
 * 
 * REGRA: Bônus é consumido automaticamente. Freebet é OPCIONAL.
 * Este componente permite ao usuário ativar o uso de freebet e definir o valor.
 * 
 * COMPORTAMENTO:
 * - Ao ativar, o campo de valor é preenchido automaticamente com o saldo total de freebet
 * - O operador pode editar o valor para usar parcialmente
 * - O valor não pode exceder o saldo disponível
 */

import { useState, useEffect } from "react";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Gift, HelpCircle } from "lucide-react";
import { cn } from "@/lib/utils";

interface FreebetToggleProps {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  saldoFreebet: number;
  moeda: string;
  disabled?: boolean;
  className?: string;
  /** Valor de freebet a usar (controlado externamente) */
  valorFreebet?: number;
  /** Callback quando o valor de freebet muda */
  onValorFreebetChange?: (valor: number) => void;
}

export function FreebetToggle({
  checked,
  onCheckedChange,
  saldoFreebet,
  moeda,
  disabled = false,
  className,
  valorFreebet,
  onValorFreebetChange,
}: FreebetToggleProps) {
  const hasFreebetBalance = saldoFreebet > 0;
  const isDisabled = disabled || !hasFreebetBalance;

  // Estado interno para o valor quando não controlado externamente
  const [valorInterno, setValorInterno] = useState<string>("");

  const valorAtual = valorFreebet !== undefined ? valorFreebet : parseFloat(valorInterno) || 0;

  // Quando toggle é ativado, preencher com saldo total
  useEffect(() => {
    if (checked && hasFreebetBalance) {
      if (valorFreebet === undefined) {
        setValorInterno(saldoFreebet.toString());
      } else if (valorFreebet === 0 && onValorFreebetChange) {
        onValorFreebetChange(saldoFreebet);
      }
    }
  }, [checked, hasFreebetBalance, saldoFreebet]);

  const handleToggleChange = (newChecked: boolean) => {
    onCheckedChange(newChecked);
    if (newChecked) {
      // Auto-preencher com saldo total
      if (onValorFreebetChange) {
        onValorFreebetChange(saldoFreebet);
      } else {
        setValorInterno(saldoFreebet.toString());
      }
    } else {
      if (onValorFreebetChange) {
        onValorFreebetChange(0);
      } else {
        setValorInterno("");
      }
    }
  };

  const handleValorChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value;
    let num = parseFloat(raw) || 0;
    // Limitar ao saldo disponível
    if (num > saldoFreebet) num = saldoFreebet;
    if (num < 0) num = 0;

    if (onValorFreebetChange) {
      onValorFreebetChange(num);
    } else {
      setValorInterno(raw);
    }
  };

  const formatCurrency = (valor: number) => {
    return new Intl.NumberFormat("pt-BR", {
      style: "currency",
      currency: moeda,
      minimumFractionDigits: 2,
    }).format(valor);
  };

  const getCurrencySymbol = (curr: string) => {
    try {
      return new Intl.NumberFormat("pt-BR", {
        style: "currency",
        currency: curr,
      }).formatToParts(0).find(p => p.type === "currency")?.value || curr;
    } catch {
      return curr;
    }
  };

  return (
    <div className={cn(
      "rounded-lg border transition-all duration-200",
      checked && hasFreebetBalance
        ? "bg-purple-500/10 border-purple-500/30"
        : "bg-muted/20 border-border/40",
      className
    )}>
      <div className="flex items-center justify-between px-3 py-2.5">
        <div className="flex items-center gap-2">
          <Switch
            id="usar-freebet"
            checked={checked && hasFreebetBalance}
            onCheckedChange={handleToggleChange}
            disabled={isDisabled}
            className={cn(
              checked && hasFreebetBalance && "data-[state=checked]:bg-purple-500"
            )}
          />
          <Label
            htmlFor="usar-freebet"
            className={cn(
              "text-sm cursor-pointer flex items-center gap-1.5",
              isDisabled && "opacity-50 cursor-not-allowed"
            )}
          >
            <Gift className="h-3.5 w-3.5 text-purple-500" />
            Usar Freebet
          </Label>

          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <HelpCircle className="h-3.5 w-3.5 text-muted-foreground/50 cursor-help" />
              </TooltipTrigger>
              <TooltipContent side="top" className="max-w-xs">
                <p className="text-xs">
                  {hasFreebetBalance ? (
                    <>
                      <strong>Freebet disponível:</strong> {formatCurrency(saldoFreebet)}
                      <br /><br />
                      Se ativado, o saldo de freebet será usado. Em caso de GREEN, 
                      apenas o lucro retorna para o saldo real (SNR - stake não retorna).
                    </>
                  ) : (
                    <>
                      Nenhum saldo de freebet disponível nesta casa.
                    </>
                  )}
                </p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>

        {hasFreebetBalance && !checked && (
          <Badge
            variant="secondary"
            className="bg-purple-500/10 text-purple-600 dark:text-purple-400 text-xs"
          >
            {formatCurrency(saldoFreebet)}
          </Badge>
        )}
      </div>

      {/* Campo de valor editável - aparece quando toggle está ativo */}
      {checked && hasFreebetBalance && (
        <div className="px-3 pb-2.5 pt-0">
          <div className="flex items-center gap-2">
            <span className="text-xs text-purple-400/80 font-medium whitespace-nowrap">
              {getCurrencySymbol(moeda)}
            </span>
            <Input
              type="number"
              step="0.01"
              min="0"
              max={saldoFreebet}
              value={valorFreebet !== undefined ? valorFreebet : valorInterno}
              onChange={handleValorChange}
              placeholder="0.00"
              disabled={disabled}
              className="h-8 text-sm text-center px-2 bg-background/60 border-purple-500/40 focus:border-purple-500/60 max-w-[140px]"
            />
            <span className="text-xs text-muted-foreground whitespace-nowrap">
              de {formatCurrency(saldoFreebet)}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
