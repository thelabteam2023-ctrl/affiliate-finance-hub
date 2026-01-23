import { Badge } from "@/components/ui/badge";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { History, CircleDashed, CircleCheck } from "lucide-react";
import {
  BookmakerUsageInfo,
  getUsageCategoryConfig,
} from "@/hooks/useBookmakerUsageStatus";
import { getTipoProjetoLabel, TIPO_PROJETO_CONFIG, TipoProjeto } from "@/types/projeto";

interface BookmakerUsageBadgeProps {
  usage: BookmakerUsageInfo | undefined;
  showTipos?: boolean;
  compact?: boolean;
  onClick?: () => void;
}

/**
 * Badge que exibe o status de uso de uma bookmaker
 * - Virgem: nunca usada
 * - Já usada: possui histórico
 * - Ativa: em projeto ativo
 */
export function BookmakerUsageBadge({
  usage,
  showTipos = true,
  compact = false,
  onClick,
}: BookmakerUsageBadgeProps) {
  if (!usage) return null;

  const config = getUsageCategoryConfig(usage.category);

  const IconComponent =
    usage.category === "ATIVA"
      ? CircleCheck
      : usage.category === "JA_USADA"
      ? History
      : CircleDashed;

  // Tooltip com tipos de projeto usados
  const tooltipContent = (
    <div className="space-y-1.5 max-w-[200px]">
      <p className="font-medium text-xs">{config.tooltip}</p>
      {showTipos && usage.tiposProjeto.length > 0 && (
        <div className="pt-1 border-t border-border/50">
          <p className="text-[10px] text-muted-foreground mb-1">
            Estratégias utilizadas:
          </p>
          <div className="flex flex-wrap gap-1">
            {usage.tiposProjeto.map((tipo) => {
              const tipoConfig = TIPO_PROJETO_CONFIG[tipo as TipoProjeto];
              return (
                <Badge
                  key={tipo}
                  variant="outline"
                  className={`text-[9px] px-1 py-0 ${tipoConfig?.color || ""}`}
                >
                  {tipoConfig?.icon} {getTipoProjetoLabel(tipo)}
                </Badge>
              );
            })}
          </div>
        </div>
      )}
      {usage.totalVinculos > 0 && (
        <p className="text-[10px] text-muted-foreground">
          {usage.totalVinculos} vínculo{usage.totalVinculos !== 1 ? "s" : ""} no
          histórico
        </p>
      )}
    </div>
  );

  if (compact) {
    return (
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              onClick={onClick}
              className={`p-1 rounded transition-colors hover:bg-accent/50 ${config.iconColor}`}
            >
              <IconComponent className="h-4 w-4" />
            </button>
          </TooltipTrigger>
          <TooltipContent side="top" className="p-2">
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
          <Badge
            variant="outline"
            className={`gap-1 cursor-pointer hover:opacity-80 transition-opacity ${config.bgColor} ${config.color} border-transparent`}
            onClick={onClick}
          >
            <IconComponent className="h-3 w-3" />
            {config.label}
          </Badge>
        </TooltipTrigger>
        <TooltipContent side="top" className="p-2">
          {tooltipContent}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
