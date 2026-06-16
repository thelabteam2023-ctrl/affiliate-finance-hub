import { ReactNode } from "react";
import { CalendarDays, Wallet, TrendingUp, Coins, Percent } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

export interface KpiRailItem {
  id: string;
  label: string;
  value: string;
  icon: ReactNode;
  /** Cor do valor */
  valueTone?: "default" | "positive" | "negative" | "warning";
  /** Cor da borda esquerda (ativo) */
  activeTone?: "none" | "positive" | "warning" | "negative";
  tooltip?: ReactNode;
  onClick?: () => void;
  loading?: boolean;
}

interface KpiRailProps {
  periodLabel: string;
  items: KpiRailItem[];
}

const VALUE_TONE: Record<NonNullable<KpiRailItem["valueTone"]>, string> = {
  default: "text-foreground/90",
  positive: "text-emerald-500",
  negative: "text-red-500",
  warning: "text-amber-500",
};

const ACTIVE_TONE: Record<NonNullable<KpiRailItem["activeTone"]>, string> = {
  none: "border-l-transparent",
  positive: "border-l-emerald-500 bg-emerald-500/[0.04]",
  warning: "border-l-amber-500 bg-amber-500/[0.04]",
  negative: "border-l-red-500 bg-red-500/[0.04]",
};

export function KpiRail({ periodLabel, items }: KpiRailProps) {
  return (
    <aside
      className={cn(
        "w-full lg:w-[188px] lg:flex-shrink-0",
        "lg:border-r lg:border-border/40",
        "bg-transparent",
      )}
    >
      <div className="px-3.5 pt-3 pb-2.5 border-b border-border/30">
        <div className="text-[9px] uppercase tracking-[0.08em] text-muted-foreground/70 mb-0.5">
          Referência
        </div>
        <div className="flex items-center gap-1.5 text-[11px] font-medium text-muted-foreground">
          <CalendarDays className="h-3 w-3" />
          <span className="truncate">{periodLabel}</span>
        </div>
      </div>

      <div className="flex flex-row lg:flex-col overflow-x-auto lg:overflow-visible">
        {items.map((item, idx) => {
          const content = (
            <button
              type="button"
              onClick={item.onClick}
              className={cn(
                "group relative w-full text-left px-3.5 py-3 border-l-2 transition-colors flex-shrink-0 min-w-[160px] lg:min-w-0",
                idx > 0 && "lg:border-t lg:border-t-border/20",
                ACTIVE_TONE[item.activeTone ?? "none"],
                "hover:bg-foreground/[0.02]",
                item.onClick ? "cursor-pointer" : "cursor-default",
              )}
            >
              <div className="flex items-center gap-1.5 text-[9px] uppercase tracking-[0.07em] text-muted-foreground/60 mb-1.5">
                <span className="opacity-80">{item.icon}</span>
                <span>{item.label}</span>
              </div>
              {item.loading ? (
                <div className="h-4 w-20 rounded bg-foreground/[0.06] animate-pulse" />
              ) : (
                <div
                  className={cn(
                    "text-[15px] font-semibold tabular-nums tracking-tight leading-none",
                    VALUE_TONE[item.valueTone ?? "default"],
                  )}
                >
                  {item.value}
                </div>
              )}
            </button>
          );

          if (!item.tooltip) return <div key={item.id}>{content}</div>;
          return (
            <TooltipProvider key={item.id} delayDuration={200}>
              <Tooltip>
                <TooltipTrigger asChild>{content}</TooltipTrigger>
                <TooltipContent
                  side="right"
                  className="max-w-[280px] text-xs normal-case tracking-normal leading-relaxed"
                >
                  {item.tooltip}
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          );
        })}
      </div>
    </aside>
  );
}