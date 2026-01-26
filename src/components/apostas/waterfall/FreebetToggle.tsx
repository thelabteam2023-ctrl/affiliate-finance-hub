/**
 * FreebetToggle - Toggle para usar saldo de freebet
 * 
 * REGRA: Bônus é consumido automaticamente. Freebet é OPCIONAL.
 * Este componente permite ao usuário ativar o uso de freebet.
 */

import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
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
}

export function FreebetToggle({
  checked,
  onCheckedChange,
  saldoFreebet,
  moeda,
  disabled = false,
  className,
}: FreebetToggleProps) {
  const hasFreebetBalance = saldoFreebet > 0;
  const isDisabled = disabled || !hasFreebetBalance;

  const formatCurrency = (valor: number) => {
    return new Intl.NumberFormat("pt-BR", {
      style: "currency",
      currency: moeda,
      minimumFractionDigits: 2,
    }).format(valor);
  };

  return (
    <div className={cn("flex items-center gap-3", className)}>
      <div className="flex items-center gap-2">
        <Switch
          id="usar-freebet"
          checked={checked && hasFreebetBalance}
          onCheckedChange={onCheckedChange}
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
      </div>

      {hasFreebetBalance && (
        <Badge
          variant="secondary"
          className="bg-purple-500/10 text-purple-600 dark:text-purple-400 text-xs"
        >
          {formatCurrency(saldoFreebet)}
        </Badge>
      )}

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
                  Se ativado, o saldo de freebet será usado após consumir 
                  qualquer bônus ativo. Em caso de GREEN, apenas o lucro 
                  retorna para o saldo real.
                </>
              ) : (
                <>
                  Nenhum saldo de freebet disponível nesta casa.
                  <br /><br />
                  Freebets são créditos promocionais que podem ser usados 
                  para apostar sem risco. Apenas o lucro é convertido em 
                  saldo real.
                </>
              )}
            </p>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    </div>
  );
}
