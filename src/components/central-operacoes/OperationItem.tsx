/**
 * OperationItem — Item de lista dentro de OperationCard
 * 
 * Layout: estrutura multi-linha para máxima legibilidade
 * Linha 1: Nome + Valor (destaque forte)
 * Linha 2: Sublabel (metadados)
 * Linha 3: Ações
 */

import { ReactNode } from "react";
import { cn } from "@/lib/utils";
import type { OperationCardColor } from "./OperationCard";

const itemColorConfig: Record<OperationCardColor, { border: string; bg: string; valueColor: string }> = {
  red:     { border: "border-red-500/20",     bg: "bg-red-500/[0.06]",     valueColor: "text-red-400" },
  yellow:  { border: "border-yellow-500/20",  bg: "bg-yellow-500/[0.06]",  valueColor: "text-yellow-400" },
  emerald: { border: "border-emerald-500/20", bg: "bg-emerald-500/[0.06]", valueColor: "text-emerald-400" },
  orange:  { border: "border-orange-500/20",  bg: "bg-orange-500/[0.06]",  valueColor: "text-orange-400" },
  purple:  { border: "border-purple-500/20",  bg: "bg-purple-500/[0.06]",  valueColor: "text-purple-400" },
  indigo:  { border: "border-indigo-500/20",  bg: "bg-indigo-500/[0.06]",  valueColor: "text-indigo-400" },
  cyan:    { border: "border-cyan-500/20",    bg: "bg-cyan-500/[0.06]",    valueColor: "text-cyan-400" },
  pink:    { border: "border-pink-500/20",    bg: "bg-pink-500/[0.06]",    valueColor: "text-pink-400" },
  teal:    { border: "border-teal-500/20",    bg: "bg-teal-500/[0.06]",    valueColor: "text-teal-400" },
  violet:  { border: "border-violet-500/20",  bg: "bg-violet-500/[0.06]",  valueColor: "text-violet-400" },
  amber:   { border: "border-amber-500/20",   bg: "bg-amber-500/[0.06]",   valueColor: "text-amber-400" },
  slate:   { border: "border-slate-500/20",   bg: "bg-slate-500/[0.06]",   valueColor: "text-slate-400" },
  blue:    { border: "border-blue-500/20",    bg: "bg-blue-500/[0.06]",    valueColor: "text-blue-400" },
};

interface OperationItemProps {
  icon: ReactNode;
  color: OperationCardColor;
  /** Main label */
  label: string;
  /** Secondary text line */
  sublabel?: string;
  /** Highlighted value */
  value?: string;
  /** Action buttons */
  actions?: ReactNode;
  /** Click handler for the whole item */
  onClick?: () => void;
  /** Animate border (pulse) */
  pulse?: boolean;
  className?: string;
}

export function OperationItem({
  icon,
  color,
  label,
  sublabel,
  value,
  actions,
  onClick,
  pulse,
  className,
}: OperationItemProps) {
  const c = itemColorConfig[color];

  return (
    <div
      className={cn(
        "flex flex-col gap-1.5 p-3 rounded-xl border transition-all duration-150",
        "hover:translate-y-[-1px] hover:shadow-sm",
        c.border, c.bg,
        pulse && "animate-pulse",
        onClick && "cursor-pointer",
        className
      )}
      onClick={onClick}
    >
      {/* Row 1: Icon + Name + Value */}
      <div className="flex items-start gap-2">
        <span className={cn("shrink-0 mt-0.5", c.valueColor)}>{icon}</span>
        <p className="text-sm font-medium flex-1 break-words leading-snug">{label}</p>
        {value && (
          <span className={cn("text-sm font-bold shrink-0 tabular-nums whitespace-nowrap", c.valueColor)}>{value}</span>
        )}
      </div>

      {/* Row 2: Sublabel */}
      {sublabel && (
        <p className="text-[11px] text-muted-foreground pl-5 break-words leading-snug">{sublabel}</p>
      )}

      {/* Row 3: Actions */}
      {actions && (
        <div className="flex items-center gap-1.5 pl-5 pt-0.5">{actions}</div>
      )}
    </div>
  );
}
