import React from "react";

export interface MiniDonutSegment {
  key: string;
  value: number;
  color: string;
}

interface Props {
  segments: MiniDonutSegment[];
  size?: number;
  stroke?: number;
  centerLabel?: string;
  centerValue?: string;
}

export const RichTooltipMiniDonut = React.memo(function RichTooltipMiniDonut({
  segments,
  size = 72,
  stroke = 10,
  centerLabel,
  centerValue,
}: Props) {
  const total = segments.reduce((a, s) => a + Math.max(0, s.value), 0);
  const radius = (size - stroke) / 2;
  const circ = 2 * Math.PI * radius;
  let acc = 0;

  return (
    <div className="relative flex items-center justify-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="hsl(var(--muted) / 0.4)"
          strokeWidth={stroke}
        />
        {total > 0 &&
          segments.map((s) => {
            const v = Math.max(0, s.value);
            if (v <= 0) return null;
            const len = (v / total) * circ;
            const dash = `${len} ${circ - len}`;
            const offset = circ - acc;
            acc += len;
            return (
              <circle
                key={s.key}
                cx={size / 2}
                cy={size / 2}
                r={radius}
                fill="none"
                stroke={s.color}
                strokeWidth={stroke}
                strokeDasharray={dash}
                strokeDashoffset={offset}
                strokeLinecap="butt"
              />
            );
          })}
      </svg>
      {(centerLabel || centerValue) && (
        <div className="absolute inset-0 flex flex-col items-center justify-center text-center leading-tight">
          {centerLabel && (
            <span className="text-[8px] uppercase tracking-wider text-muted-foreground">
              {centerLabel}
            </span>
          )}
          {centerValue && (
            <span className="text-[10px] font-semibold text-foreground">
              {centerValue}
            </span>
          )}
        </div>
      )}
    </div>
  );
});