import { ReactNode } from "react";
import { cn } from "@/lib/utils";

export interface KpiItem {
  label: string;
  value: ReactNode;
  /** Optional subtitle text below the value */
  subtitle?: ReactNode;
  /** Optional wrapper (e.g. tooltip) around the item */
  wrapper?: (children: ReactNode) => ReactNode;
  /** Min width for the item */
  minWidth?: string;
  /** Additional className for the value */
  valueClassName?: string;
  /** If true, render cursor-help */
  cursorHelp?: boolean;
  /** Hide on mobile */
  hideMobile?: boolean;
}

interface KpiSummaryBarProps {
  items: KpiItem[];
  /** Optional leading element (e.g. SaldoOperavelCard) */
  leading?: ReactNode;
  className?: string;
}

/**
 * Faixa horizontal compacta de KPIs — padrão unificado para todas as abas.
 * Substitui grids de cards por uma barra inline centralizada.
 */
export function KpiSummaryBar({ items, leading, className }: KpiSummaryBarProps) {
  return (
    <div
      className={cn(
        "flex-shrink-0 rounded-lg border border-border/60 bg-card/60 backdrop-blur px-4 py-2.5",
        className
      )}
    >
      <div className="flex items-center justify-center gap-4 md:gap-6 flex-wrap">
        {leading}

        {items.map((item, index) => {
          const content = (
            <div
              className={cn(
                "flex flex-col",
                item.minWidth || "min-w-[70px]",
                item.cursorHelp && "cursor-help",
                item.hideMobile && "hidden sm:flex"
              )}
            >
              <span className="text-xs text-muted-foreground leading-tight">
                {item.label}
              </span>
              <span
                className={cn(
                  "text-base md:text-lg font-bold leading-tight truncate",
                  item.valueClassName
                )}
              >
                {item.value}
              </span>
              {item.subtitle && (
                <div className="text-xs leading-tight mt-0.5">
                  {item.subtitle}
                </div>
              )}
            </div>
          );

          const wrappedContent = item.wrapper ? item.wrapper(content) : content;

          return (
            <div key={index} className="contents">
              {/* Separator before this item (after leading or previous item) */}
              {(index > 0 || leading) && (
                <div className="h-8 w-px bg-border/50 hidden sm:block flex-shrink-0" />
              )}
              {wrappedContent}
            </div>
          );
        })}
      </div>
    </div>
  );
}
