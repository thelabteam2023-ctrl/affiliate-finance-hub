/**
 * KPI CARD V2 — Card premium de KPI com estilo elevado
 * 
 * Baseado no padrão visual do modal de casas (Bet365).
 * Suporta hierarquia visual (highlight), cores semânticas e ícones contextuais.
 */

import { ReactNode } from "react";
import { cn } from "@/lib/utils";

type KPIVariant = "positive" | "negative" | "neutral";

interface KPICardV2Props {
  title: string;
  value: string | number;
  subtitle?: string;
  icon?: ReactNode;
  variant?: KPIVariant;
  /** Nível 1 = destaque máximo */
  highlight?: boolean;
  className?: string;
}

const variantStyles: Record<KPIVariant, { value: string; iconBg: string; iconText: string }> = {
  positive: {
    value: "text-emerald-400",
    iconBg: "bg-emerald-500/15",
    iconText: "text-emerald-400",
  },
  negative: {
    value: "text-red-400",
    iconBg: "bg-red-500/15",
    iconText: "text-red-400",
  },
  neutral: {
    value: "text-foreground",
    iconBg: "bg-muted/60",
    iconText: "text-muted-foreground",
  },
};

export function KPICardV2({
  title,
  value,
  subtitle,
  icon,
  variant = "neutral",
  highlight = false,
  className,
}: KPICardV2Props) {
  const styles = variantStyles[variant];

  return (
    <div
      className={cn(
        "relative rounded-xl border border-border/40 p-4 md:p-5",
        "bg-card/80 backdrop-blur-sm",
        "transition-all duration-200",
        highlight && "md:col-span-2 border-border/60",
        className
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex flex-col gap-1.5 min-w-0">
          <span className="text-[10px] md:text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            {title}
          </span>
          <span
            className={cn(
              "font-bold tabular-nums leading-tight truncate",
              highlight
                ? "text-2xl md:text-3xl"
                : "text-xl md:text-2xl",
              styles.value
            )}
          >
            {value}
          </span>
          {subtitle && (
            <span className="text-[11px] md:text-xs text-muted-foreground mt-0.5">
              {subtitle}
            </span>
          )}
        </div>

        {icon && (
          <div
            className={cn(
              "flex items-center justify-center rounded-lg shrink-0",
              highlight ? "w-10 h-10 md:w-11 md:h-11" : "w-9 h-9 md:w-10 md:h-10",
              styles.iconBg
            )}
          >
            <span className={cn("flex items-center justify-center", styles.iconText)}>
              {icon}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
