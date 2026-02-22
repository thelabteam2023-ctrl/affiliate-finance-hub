import { ReactNode } from "react";
import { cn } from "@/lib/utils";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

export interface KpiItem {
  label: string;
  value: ReactNode;
  subtitle?: ReactNode;
  tooltip?: ReactNode;
  wrapper?: (children: ReactNode) => ReactNode;
  minWidth?: string;
  valueClassName?: string;
  cursorHelp?: boolean;
  hideMobile?: boolean;
}

interface KpiSummaryBarProps {
  items: KpiItem[];
  leading?: ReactNode;
  actions?: ReactNode;
  className?: string;
}

export function KpiSummaryBar({ items, leading, actions, className }: KpiSummaryBarProps) {
  const renderKpis = () => (
    <>
      {leading}
      {items.map((item, index) => {
        const content = (
          <div
            className={cn(
              "flex flex-col items-center text-center",
              item.minWidth || "min-w-[70px]",
              (item.cursorHelp || item.tooltip) && "cursor-help",
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

        let wrappedContent: ReactNode;
        if (item.wrapper) {
          wrappedContent = item.wrapper(content);
        } else if (item.tooltip) {
          wrappedContent = (
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  {content}
                </TooltipTrigger>
                <TooltipContent side="bottom" className="max-w-xs text-sm p-0">
                  <div className="px-3 py-2.5">
                    {typeof item.tooltip === "string" ? (
                      <p>{item.tooltip}</p>
                    ) : (
                      item.tooltip
                    )}
                  </div>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          );
        } else {
          wrappedContent = content;
        }

        return (
          <div key={index} className="contents">
            {(index > 0 || leading) && (
              <div className="h-8 w-px bg-border/50 hidden sm:block flex-shrink-0" />
            )}
            {wrappedContent}
          </div>
        );
      })}
    </>
  );

  return (
    <div
      className={cn(
        "flex-shrink-0 rounded-lg border border-border/60 bg-card/60 backdrop-blur px-4 py-2.5",
        className
      )}
    >
      {actions ? (
        <div className="flex items-center gap-4 md:gap-6">
          {/* Actions — left-aligned */}
          <div className="flex flex-col gap-1.5 items-start flex-shrink-0">
            {actions}
          </div>
          <div className="h-8 w-px bg-border/50 hidden sm:block flex-shrink-0" />
          {/* KPIs — centered in remaining space */}
          <div className="flex-1 flex items-center justify-center gap-4 md:gap-6 flex-wrap">
            {renderKpis()}
          </div>
        </div>
      ) : (
        <div className="flex items-center justify-center gap-4 md:gap-6 flex-wrap">
          {renderKpis()}
        </div>
      )}
    </div>
  );
}
