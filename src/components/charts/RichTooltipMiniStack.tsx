import React from "react";

export interface MiniStackSegment {
  key: string;
  value: number;
  color: string; // resolved css color, e.g. "hsl(var(--status-blue))"
}

interface Props {
  segments: MiniStackSegment[];
  height?: number;
}

export const RichTooltipMiniStack = React.memo(function RichTooltipMiniStack({
  segments,
  height = 8,
}: Props) {
  const total = segments.reduce((a, s) => a + Math.max(0, s.value), 0);
  if (total <= 0) {
    return (
      <div
        className="rounded-full bg-muted/40"
        style={{ height }}
      />
    );
  }
  return (
    <div
      className="flex w-full overflow-hidden rounded-full bg-muted/30"
      style={{ height }}
    >
      {segments.map((s) => {
        const pct = (Math.max(0, s.value) / total) * 100;
        if (pct <= 0) return null;
        return (
          <div
            key={s.key}
            style={{ width: `${pct}%`, background: s.color }}
            className="h-full transition-all"
          />
        );
      })}
    </div>
  );
});