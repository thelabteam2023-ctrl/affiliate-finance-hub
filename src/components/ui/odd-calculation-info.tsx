import { Info } from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import type { OddCalculationResult } from "@/lib/oddRealCalculation";

interface OddCalculationInfoProps {
  calculation: OddCalculationResult | null;
  className?: string;
}

/**
 * Componente informativo que exibe quando a odd foi derivada do ganho liquidado
 * e há diferença relevante em relação à odd exibida (decimais ocultas)
 */
export function OddCalculationInfo({ calculation, className = "" }: OddCalculationInfoProps) {
  // Não exibir se não há cálculo ou se a odd veio diretamente
  if (!calculation || calculation.metodo !== "ODD_DERIVADA_DO_GANHO") {
    return null;
  }
  
  // Só exibir se há decimal oculta significativa
  if (!calculation.temDecimalOculta) {
    return null;
  }
  
  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <span 
            className={`inline-flex items-center gap-1 text-xs text-blue-500 cursor-help ${className}`}
          >
            <Info className="h-3 w-3" />
            <span>Odd calculada</span>
          </span>
        </TooltipTrigger>
        <TooltipContent side="top" className="max-w-xs">
          <div className="space-y-1 text-xs">
            <p className="font-medium">Odd real derivada do ganho liquidado</p>
            <p className="text-muted-foreground">
              A odd exibida ({calculation.oddExibida?.toFixed(2)}) difere da odd real ({calculation.oddReal.toFixed(4)}).
            </p>
            <p className="text-muted-foreground">
              Algumas casas ocultam casas decimais. A odd registrada é a real, calculada com base no ganho total.
            </p>
          </div>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
