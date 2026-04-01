/**
 * KPI SECTION HEADER — Cabeçalho de seção dentro de cards de estatísticas
 * 
 * Design system unificado para todas as abas.
 */

import { cn } from "@/lib/utils";

type SectionColor = "lime" | "emerald" | "amber" | "blue" | "purple" | "red";

interface KPISectionHeaderProps {
  title: string;
  icon?: React.ElementType;
  color?: SectionColor;
  className?: string;
}

const colorMap: Record<SectionColor, string> = {
  lime: "bg-lime-500",
  emerald: "bg-emerald-500",
  amber: "bg-amber-500",
  blue: "bg-blue-500",
  purple: "bg-purple-500",
  red: "bg-red-500",
};

const iconColorMap: Record<SectionColor, string> = {
  lime: "text-lime-400",
  emerald: "text-emerald-400",
  amber: "text-amber-400",
  blue: "text-blue-400",
  purple: "text-purple-400",
  red: "text-red-400",
};

export function KPISectionHeader({
  title,
  icon: Icon,
  color = "emerald",
  className,
}: KPISectionHeaderProps) {
  return (
    <div className={cn("flex items-center gap-2 mb-2 md:mb-3 mt-4 first:mt-0", className)}>
      <div className={cn("w-1 h-4 rounded-full", colorMap[color])} />
      {Icon && <Icon className={cn("w-3.5 h-3.5", iconColorMap[color])} />}
      <span className="text-[10px] md:text-xs font-semibold text-foreground/90 uppercase tracking-wider">
        {title}
      </span>
    </div>
  );
}
