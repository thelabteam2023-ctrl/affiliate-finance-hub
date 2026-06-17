import React from "react";
import { cn } from "@/lib/utils";
import { RichTooltipMiniStack } from "./RichTooltipMiniStack";
import { RichTooltipMiniDonut } from "./RichTooltipMiniDonut";

export interface RichTooltipSegment {
  key: string;
  label: string;
  value: number;
  color: string;       // resolved CSS color (e.g. "hsl(var(--status-blue))")
  formatted: string;   // human readable formatted value
}

export interface RichTooltipFooterRow {
  label: string;
  value: string;
  tone?: "positive" | "negative" | "neutral" | "strong";
}

export interface ChartRichTooltipProps {
  title: string;
  badge?: { label: string; tone: "positive" | "negative" | "neutral" };
  segments: RichTooltipSegment[];
  total?: number;
  totalLabel?: string;
  totalFormatted?: string;
  footerRows?: RichTooltipFooterRow[];
  variant?: "stackedBar" | "donut";
  note?: string;
  className?: string;
}

const toneText = (tone?: RichTooltipFooterRow["tone"]) => {
  switch (tone) {
    case "positive":
      return "text-[hsl(var(--status-emerald))]";
    case "negative":
      return "text-[hsl(var(--status-red))]";
    case "strong":
      return "text-foreground font-semibold";
    default:
      return "text-foreground";
  }
};

const badgeTone = (tone: "positive" | "negative" | "neutral") => {
  switch (tone) {
    case "positive":
      return "text-[hsl(var(--status-emerald))] bg-[hsl(var(--status-emerald)/0.12)]";
    case "negative":
      return "text-[hsl(var(--status-red))] bg-[hsl(var(--status-red)/0.12)]";
    default:
      return "text-muted-foreground bg-muted/40";
  }
};

export const ChartRichTooltip = React.memo(function ChartRichTooltip({
  title,
  badge,
  segments,
  total,
  totalLabel,
  totalFormatted,
  footerRows,
  variant = "stackedBar",
  note,
  className,
}: ChartRichTooltipProps) {
  const computedTotal =
    total ?? segments.reduce((a, s) => a + Math.max(0, s.value), 0);

  return (
    <div
      className={cn(
        "pointer-events-none select-none",
        "min-w-[260px] max-w-[min(340px,92vw)]",
        "rounded-xl border border-border/80 bg-popover/95 backdrop-blur-sm",
        "shadow-[0_12px_40px_hsl(0_0%_0%/0.35)]",
        "p-3.5 text-popover-foreground",
        "animate-in fade-in-0 zoom-in-95 duration-150",
        className
      )}
    >
      {/* Header */}
      <div className="flex items-center justify-between gap-2 mb-2.5">
        <span className="text-[12px] font-semibold tracking-tight text-foreground">
          {title}
        </span>
        {badge && (
          <span
            className={cn(
              "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium",
              badgeTone(badge.tone)
            )}
          >
            <span
              className={cn(
                "h-1.5 w-1.5 rounded-full",
                badge.tone === "positive" && "bg-[hsl(var(--status-emerald))]",
                badge.tone === "negative" && "bg-[hsl(var(--status-red))]",
                badge.tone === "neutral" && "bg-muted-foreground"
              )}
            />
            {badge.label}
          </span>
        )}
      </div>

      {/* Mini visual */}
      {variant === "stackedBar" ? (
        <div className="mb-3">
          <RichTooltipMiniStack segments={segments} />
        </div>
      ) : (
        <div className="mb-3 flex items-center justify-center">
          <RichTooltipMiniDonut
            segments={segments}
            centerLabel={totalLabel}
            centerValue={totalFormatted}
          />
        </div>
      )}

      {/* Segments list */}
      <div className="space-y-1.5">
        {segments.map((s) => {
          const pct =
            computedTotal > 0 ? (Math.max(0, s.value) / computedTotal) * 100 : 0;
          return (
            <div
              key={s.key}
              className="relative flex items-center justify-between gap-3 rounded-md px-1.5 py-0.5"
            >
              {/* weight track */}
              <div
                className="absolute inset-y-0 left-0 rounded-md transition-all"
                style={{
                  width: `${pct}%`,
                  background: s.color,
                  opacity: 0.1,
                }}
              />
              <div className="relative flex items-center gap-2 min-w-0">
                <span
                  className="h-2 w-2 shrink-0 rounded-full"
                  style={{ background: s.color }}
                />
                <span className="truncate text-[11px] text-muted-foreground">
                  {s.label}
                </span>
              </div>
              <span className="relative text-[11px] tabular-nums text-foreground">
                {s.formatted}
              </span>
            </div>
          );
        })}
      </div>

      {/* Footer rows */}
      {footerRows && footerRows.length > 0 && (
        <>
          <div className="my-2.5 border-t border-border/70" />
          <div className="space-y-1">
            {footerRows.map((row, i) => (
              <div
                key={i}
                className="flex items-center justify-between gap-3 px-1.5"
              >
                <span className="text-[11px] text-muted-foreground">
                  {row.label}
                </span>
                <span
                  className={cn(
                    "text-[12px] tabular-nums",
                    toneText(row.tone ?? "strong")
                  )}
                >
                  {row.value}
                </span>
              </div>
            ))}
          </div>
        </>
      )}

      {note && (
        <p className="mt-2.5 text-[10px] leading-snug text-muted-foreground/80">
          {note}
        </p>
      )}
    </div>
  );
});