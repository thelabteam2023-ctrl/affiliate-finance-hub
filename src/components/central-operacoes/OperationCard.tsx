/**
 * OperationCard — Card premium reutilizável para Central de Operações
 * 
 * Design: glass effect, bordas suaves, sombra leve, accordion no mobile
 */

import { ReactNode, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { CardInfoTooltip } from "@/components/ui/card-info-tooltip";
import { cn } from "@/lib/utils";
import { ChevronDown } from "lucide-react";
import { useIsMobile } from "@/hooks/use-mobile";

export type OperationCardColor = "red" | "yellow" | "emerald" | "orange" | "purple" | "indigo" | "cyan" | "pink" | "teal" | "violet" | "amber" | "slate" | "blue";

const colorConfig: Record<OperationCardColor, { border: string; bg: string; badge: string; badgeText: string }> = {
  red:     { border: "border-red-500/30",     bg: "bg-red-500/[0.03]",     badge: "bg-red-500/20",     badgeText: "text-red-400" },
  yellow:  { border: "border-yellow-500/30",  bg: "bg-yellow-500/[0.03]",  badge: "bg-yellow-500/20",  badgeText: "text-yellow-400" },
  emerald: { border: "border-emerald-500/30", bg: "bg-emerald-500/[0.03]", badge: "bg-emerald-500/20", badgeText: "text-emerald-400" },
  orange:  { border: "border-orange-500/30",  bg: "bg-orange-500/[0.03]",  badge: "bg-orange-500/20",  badgeText: "text-orange-400" },
  purple:  { border: "border-purple-500/30",  bg: "bg-purple-500/[0.03]",  badge: "bg-purple-500/20",  badgeText: "text-purple-400" },
  indigo:  { border: "border-indigo-500/30",  bg: "bg-indigo-500/[0.03]",  badge: "bg-indigo-500/20",  badgeText: "text-indigo-400" },
  cyan:    { border: "border-cyan-500/30",    bg: "bg-cyan-500/[0.03]",    badge: "bg-cyan-500/20",    badgeText: "text-cyan-400" },
  pink:    { border: "border-pink-500/30",    bg: "bg-pink-500/[0.03]",    badge: "bg-pink-500/20",    badgeText: "text-pink-400" },
  teal:    { border: "border-teal-500/30",    bg: "bg-teal-500/[0.03]",    badge: "bg-teal-500/20",    badgeText: "text-teal-400" },
  violet:  { border: "border-violet-500/30",  bg: "bg-violet-500/[0.03]",  badge: "bg-violet-500/20",  badgeText: "text-violet-400" },
  amber:   { border: "border-amber-500/30",   bg: "bg-amber-500/[0.03]",   badge: "bg-amber-500/20",   badgeText: "text-amber-400" },
  slate:   { border: "border-slate-500/30",   bg: "bg-slate-500/[0.03]",   badge: "bg-slate-500/20",   badgeText: "text-slate-400" },
  blue:    { border: "border-blue-500/30",    bg: "bg-blue-500/[0.03]",    badge: "bg-blue-500/20",    badgeText: "text-blue-400" },
};

interface OperationCardProps {
  title: string;
  icon: ReactNode;
  color: OperationCardColor;
  count: number;
  description?: string;
  tooltip?: { title: string; description: string; flow?: string };
  children: ReactNode;
  /** Total value to show in mobile collapsed preview */
  totalValue?: string;
  /** Footer content */
  footer?: ReactNode;
  /** Extra actions in header */
  headerActions?: ReactNode;
  className?: string;
  /** Force expanded state (bypass mobile accordion) */
  forceExpanded?: boolean;
}

export function OperationCard({
  title,
  icon,
  color,
  count,
  description,
  tooltip,
  children,
  totalValue,
  footer,
  headerActions,
  className,
  forceExpanded,
}: OperationCardProps) {
  const isMobile = useIsMobile();
  const [expanded, setExpanded] = useState(!isMobile);
  const isExpanded = forceExpanded || expanded;
  const c = colorConfig[color];

  return (
    <div
      className={cn(
        "rounded-2xl border backdrop-blur-sm transition-all duration-200",
        "hover:shadow-md hover:shadow-black/5",
        c.border, c.bg,
        className
      )}
    >
      {/* Header */}
      <button
        type="button"
        className={cn(
          "w-full flex items-center gap-2 p-3 md:p-4",
          isMobile && !forceExpanded && "cursor-pointer active:scale-[0.99]",
          !isMobile && "cursor-default"
        )}
        onClick={() => isMobile && !forceExpanded && setExpanded(!isExpanded)}
      >
        <span className={cn("shrink-0", c.badgeText)}>{icon}</span>
        <span className="text-sm font-semibold truncate flex-1 text-left">{title}</span>
        {tooltip && (
          <span onClick={(e) => e.stopPropagation()}>
            <CardInfoTooltip title={tooltip.title} description={tooltip.description} flow={tooltip.flow} />
          </span>
        )}
        {headerActions && <span onClick={(e) => e.stopPropagation()}>{headerActions}</span>}
        <Badge className={cn("shrink-0 h-5 min-w-5 px-1.5 text-[10px] font-bold", c.badge, c.badgeText)}>{count}</Badge>
        {isMobile && !forceExpanded && (
          <div className="flex items-center gap-2 shrink-0">
            {totalValue && !isExpanded && (
              <span className={cn("text-xs font-bold", c.badgeText)}>{totalValue}</span>
            )}
            <ChevronDown className={cn("h-4 w-4 text-muted-foreground transition-transform duration-200", isExpanded && "rotate-180")} />
          </div>
        )}
      </button>

      {/* Description */}
      {description && isExpanded && (
        <p className="px-3 md:px-4 -mt-1 mb-2 text-[11px] text-muted-foreground">{description}</p>
      )}

      {/* Content */}
      {isExpanded && (
        <div className="px-3 md:px-4 pb-3 md:pb-4">
          <div className="max-h-[400px] overflow-y-auto space-y-2 pr-0.5 scrollbar-thin">
            {children}
          </div>
        </div>
      )}

      {/* Footer */}
      {footer && isExpanded && (
        <div className={cn("px-3 md:px-4 pb-3 md:pb-4 pt-0 border-t mt-1 pt-2", c.border)}>
          {footer}
        </div>
      )}
    </div>
  );
}
