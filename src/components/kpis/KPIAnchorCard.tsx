/**
 * KPI ANCHOR CARD — Componente de destaque máximo (Nível 1)
 * 
 * Mobile-first: full-width em mobile, grid adaptável em desktop.
 * Usado para: Lucro, Saldo, ROI — métricas de decisão rápida.
 */

import { ReactNode } from "react";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

interface KPIAnchorCardProps {
  label: string;
  value: string | number;
  /** Classes CSS para o valor (ex: cores semânticas) */
  valueClass?: string;
  /** Tooltip de contexto */
  tooltip?: string;
  /** Ícone opcional (ReactNode) */
  icon?: ReactNode;
  /** Tamanho: "lg" para KPI principal, "md" para KPI secundário */
  size?: "lg" | "md";
  /** Classes extras no container */
  className?: string;
}

export function KPIAnchorCard({
  label,
  value,
  valueClass = "",
  tooltip,
  icon,
  size = "md",
  className,
}: KPIAnchorCardProps) {
  const content = (
    <div
      className={cn(
        "flex flex-col items-center justify-center rounded-xl border border-border/30",
        "bg-gradient-to-br from-muted/60 to-muted/30",
        size === "lg"
          ? "px-4 py-5 min-h-[100px]"
          : "px-3 py-3 min-h-[76px] md:min-h-[90px]",
        className
      )}
    >
      {icon && <div className="mb-1.5">{icon}</div>}
      <span
        className={cn(
          "font-bold tabular-nums leading-tight",
          size === "lg"
            ? "text-2xl md:text-3xl"
            : "text-lg md:text-2xl lg:text-3xl",
          valueClass
        )}
      >
        {value}
      </span>
      <span className="text-muted-foreground text-[10px] md:text-xs mt-1 text-center leading-tight">
        {label}
      </span>
    </div>
  );

  if (tooltip) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>{content}</TooltipTrigger>
        <TooltipContent side="top" className="text-xs max-w-xs">
          {tooltip}
        </TooltipContent>
      </Tooltip>
    );
  }
  return content;
}
