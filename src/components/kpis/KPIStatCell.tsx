/**
 * KPI STAT CELL — Célula de estatística compacta (Nível 2/3)
 * 
 * Mobile-first: texto legível em telas pequenas.
 * Layout horizontal: label à esquerda, valor à direita.
 */

import { ReactNode } from "react";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

interface KPIStatCellProps {
  label: string;
  value: string | number;
  /** Classes CSS para o valor */
  valueClass?: string;
  /** Tooltip simples (texto) */
  tooltip?: string;
  /** Tooltip customizado (ReactNode) */
  tooltipContent?: ReactNode;
  /** Tamanho: "sm" compacto, "md" padrão */
  size?: "sm" | "md";
  /** Classes extras */
  className?: string;
}

export function KPIStatCell({
  label,
  value,
  valueClass = "",
  tooltip,
  tooltipContent,
  size = "md",
  className,
}: KPIStatCellProps) {
  const content = (
    <div
      className={cn(
        "flex items-center justify-between bg-muted/40 rounded-lg",
        size === "sm" ? "px-2.5 py-1.5" : "px-3 py-2 md:py-2.5",
        className
      )}
    >
      <span
        className={cn(
          "text-muted-foreground",
          size === "sm" ? "text-[10px]" : "text-[11px] md:text-xs"
        )}
      >
        {label}
      </span>
      <span
        className={cn(
          "font-semibold tabular-nums",
          size === "sm" ? "text-xs" : "text-xs md:text-sm",
          valueClass
        )}
      >
        {value}
      </span>
    </div>
  );

  if (tooltip || tooltipContent) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>{content}</TooltipTrigger>
        <TooltipContent
          side="top"
          className="text-xs max-w-xs bg-popover/95 backdrop-blur-sm border-border/50 shadow-xl"
        >
          {tooltipContent || tooltip}
        </TooltipContent>
      </Tooltip>
    );
  }
  return content;
}
