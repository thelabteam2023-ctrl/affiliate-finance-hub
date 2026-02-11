import { useState, useEffect, useRef, memo } from "react";
import { ChartEmptyState } from "@/components/ui/chart-empty-state";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
  LabelList,
} from "recharts";

interface BarDataItem {
  [key: string]: any;
}

export type CurrencyType = "BRL" | "USD" | "EUR" | "GBP" | "MXN" | "MYR" | "ARS" | "COP" | "none";

interface BarConfig {
  dataKey: string;
  label: string;
  gradientStart: string;
  gradientEnd: string;
  /** Optional: key to use for label value (useful when bar uses a normalized value) */
  labelValueKey?: string;
  /** Currency type for this bar - controls label formatting */
  currency?: CurrencyType;
}

interface ModernBarChartProps {
  data: BarDataItem[];
  categoryKey: string;
  bars: BarConfig[];
  height?: number;
  barSize?: number;
  showLabels?: boolean;
  showLegend?: boolean;
  /** Disable all chart + label animations (helps avoid flicker in tabbed/rapid re-render scenarios) */
  disableAnimations?: boolean;
  formatValue?: (value: number) => string;
  formatTooltip?: (dataKey: string, value: number) => string;
  customTooltipContent?: (payload: any, label: string) => React.ReactNode;
  labelDataKey?: string; // Key to use for label values (e.g., 'lucro' instead of bar count)
  formatLabel?: (value: number, ctx: { dataKey: string; payload: any; currency?: CurrencyType }) => string; // Custom formatter for labels
  /** Hide Y axis tick values (useful for proportional scale charts) */
  hideYAxisTicks?: boolean;
  /** Enable dynamic coloring based on value sign (green for positive, red for negative) */
  dynamicColors?: boolean;
}

// Custom animated label component - MEMOIZED to prevent flicker
// KEY FIX: Use refs to track if already animated, preventing re-animation on parent re-renders
const AnimatedLabel = memo(function AnimatedLabel(props: any) {
  const { x, y, width, height, value, fill, index, formattedValue, isNegative } = props;
  
  // Use ref to track if we've already animated - survives re-renders without triggering new animations
  const hasAnimatedRef = useRef(false);
  const [isVisible, setIsVisible] = useState(hasAnimatedRef.current);

  useEffect(() => {
    // Only animate once per mount cycle
    if (hasAnimatedRef.current) {
      setIsVisible(true);
      return;
    }
    
    const timer = setTimeout(() => {
      hasAnimatedRef.current = true;
      setIsVisible(true);
    }, 100 + (index % 12) * 30); // Cap animation delay to prevent excessive delays
    
    return () => clearTimeout(timer);
  }, []); // Empty deps - only run on mount

  const displayValue = formattedValue !== undefined ? formattedValue : value;
  if (
    displayValue === undefined ||
    displayValue === null ||
    displayValue === 0 ||
    displayValue === "" ||
    displayValue === "R$ 0"
  )
    return null;

  // Position label OUTSIDE the bar using the original bar viewBox.
  // Note: in Recharts, negative values often produce a negative `height`.
  // So we must compute the bar's top/bottom using min/max.
  const labelOffset = 8;
  const barTop = Math.min(y, y + height);
  const barBottom = Math.max(y, y + height);
  const labelY = isNegative ? barBottom + labelOffset : barTop - labelOffset;

  return (
    <text
      x={x + width / 2}
      y={labelY}
      fill={fill}
      textAnchor="middle"
      dominantBaseline={isNegative ? "hanging" : "baseline"}
      className="text-xs font-semibold"
      style={{
        opacity: isVisible ? 1 : 0,
        transform: `translateY(${isVisible ? 0 : 10}px)`,
        transition: "all 0.4s cubic-bezier(0.4, 0, 0.2, 1)",
        fontSize: "11px",
        pointerEvents: "none",
      }}
    >
      {displayValue}
    </text>
  );
}, (prevProps, nextProps) => {
  // Custom comparison: only re-render if visual values actually changed
  return (
    prevProps.formattedValue === nextProps.formattedValue &&
    prevProps.x === nextProps.x &&
    prevProps.y === nextProps.y &&
    prevProps.width === nextProps.width &&
    prevProps.height === nextProps.height &&
    prevProps.fill === nextProps.fill &&
    prevProps.isNegative === nextProps.isNegative
  );
});

// Non-animated label (stable DOM, no transitions)
function StaticLabel(props: any) {
  const { x, y, width, height, value, fill, formattedValue, isNegative } = props;

  const displayValue = formattedValue !== undefined ? formattedValue : value;
  if (
    displayValue === undefined ||
    displayValue === null ||
    displayValue === 0 ||
    displayValue === "" ||
    displayValue === "R$ 0"
  )
    return null;

  const labelOffset = 8;
  const barTop = Math.min(y, y + height);
  const barBottom = Math.max(y, y + height);
  const labelY = isNegative ? barBottom + labelOffset : barTop - labelOffset;

  return (
    <text
      x={x + width / 2}
      y={labelY}
      fill={fill}
      textAnchor="middle"
      dominantBaseline={isNegative ? "hanging" : "baseline"}
      className="text-xs font-semibold"
      style={{
        opacity: 1,
        transform: "none",
        transition: "none",
        fontSize: "11px",
        pointerEvents: "none",
      }}
    >
      {displayValue}
    </text>
  );
}

// Custom tooltip component
const CustomTooltip = ({ 
  active, 
  payload, 
  label,
  bars,
  formatValue,
  formatTooltip,
  customTooltipContent,
}: any) => {
  if (active && payload && payload.length) {
    // Use custom content if provided
    if (customTooltipContent) {
      return (
        <div className="bg-background/90 backdrop-blur-xl border border-border/50 rounded-xl px-4 py-3 shadow-2xl min-w-[180px]">
          {customTooltipContent(payload, label)}
        </div>
      );
    }

    return (
      <div className="bg-background/90 backdrop-blur-xl border border-border/50 rounded-xl px-4 py-3 shadow-2xl min-w-[160px]">
        <p className="font-medium text-sm mb-2 text-foreground">{label}</p>
        <div className="space-y-1.5">
          {payload.map((entry: any, index: number) => {
            const barConfig = bars.find((b: BarConfig) => b.dataKey === entry.dataKey);
            const displayValue = formatTooltip 
              ? formatTooltip(entry.dataKey, entry.value)
              : formatValue 
                ? formatValue(entry.value) 
                : entry.value;
            
            return (
              <div key={index} className="flex items-center gap-2">
                <div 
                  className="w-3 h-3 rounded-full"
                  style={{ 
                    background: `linear-gradient(180deg, ${barConfig?.gradientStart || entry.color}, ${barConfig?.gradientEnd || entry.color})` 
                  }}
                />
                <span className="text-xs text-muted-foreground">{barConfig?.label || entry.dataKey}:</span>
                <span className="text-sm font-semibold font-mono">{displayValue}</span>
              </div>
            );
          })}
        </div>
      </div>
    );
  }
  return null;
};

// Custom legend component - contained within card bounds
const ModernLegend = ({ bars }: { bars: BarConfig[] }) => {
  return (
    <div className="mt-4 overflow-hidden">
      <div className="flex flex-wrap justify-center gap-x-4 gap-y-2 px-2">
        {bars.map((bar, index) => (
          <div 
            key={index}
            className="flex items-center gap-1.5 cursor-default min-w-0"
          >
            <div 
              className="w-2.5 h-2.5 rounded-full shadow-sm shrink-0"
              style={{ 
                background: `linear-gradient(180deg, ${bar.gradientStart}, ${bar.gradientEnd})`,
                boxShadow: `0 2px 8px ${bar.gradientStart}40`
              }}
            />
            <span className="text-[10px] text-muted-foreground font-medium truncate">{bar.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
};

export function ModernBarChart({
  data,
  categoryKey,
  bars,
  height = 250,
  barSize = 20,
  showLabels = true,
  showLegend = true,
  disableAnimations = false,
  formatValue,
  formatTooltip,
  customTooltipContent,
  labelDataKey,
  formatLabel,
  hideYAxisTicks = false,
  dynamicColors = true,
}: ModernBarChartProps) {
  const chartRef = useRef<HTMLDivElement>(null);

  if (!data || data.length === 0) {
    return <ChartEmptyState />;
  }

  return (
    <div ref={chartRef} className="w-full overflow-visible" style={{ height: height + (showLegend ? 40 : 0) }}>
      <ResponsiveContainer width="100%" height={height}>
        <BarChart 
          data={data} 
          margin={{ top: 30, right: 15, left: 5, bottom: 5 }}
          barCategoryGap="2%"
          barGap={1}
        >
          <defs>
            {bars.map((bar, index) => (
              <linearGradient
                key={`gradient-${index}`}
                id={`barGradient-${bar.dataKey}`}
                x1="0"
                y1="0"
                x2="0"
                y2="1"
              >
                <stop offset="0%" stopColor={bar.gradientStart} stopOpacity={1} />
                <stop offset="100%" stopColor={bar.gradientEnd} stopOpacity={0.85} />
              </linearGradient>
            ))}
            {/* Gradient for negative values */}
            <linearGradient id="barGradient-negative" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#EF4444" stopOpacity={1} />
              <stop offset="100%" stopColor="#DC2626" stopOpacity={0.85} />
            </linearGradient>
            {/* Gradient for neutral/zero values */}
            <linearGradient id="barGradient-neutral" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#6B7280" stopOpacity={1} />
              <stop offset="100%" stopColor="#4B5563" stopOpacity={0.85} />
            </linearGradient>
          </defs>
          
          <CartesianGrid 
            strokeDasharray="0" 
            stroke="hsl(var(--border)/0.3)" 
            vertical={false}
          />
          
          <XAxis 
            dataKey={categoryKey}
            stroke="hsl(var(--muted-foreground))"
            fontSize={11}
            axisLine={false}
            tickLine={false}
            tick={{ fill: "hsl(var(--muted-foreground))" }}
            dy={8}
          />
          
          <YAxis 
            stroke="hsl(var(--muted-foreground))"
            fontSize={11}
            axisLine={false}
            tickLine={false}
            tick={hideYAxisTicks ? false : { fill: "hsl(var(--muted-foreground))" }}
            width={hideYAxisTicks ? 10 : 35}
          />
          
          <Tooltip 
            content={
              <CustomTooltip 
                bars={bars}
                formatValue={formatValue}
                formatTooltip={formatTooltip}
                customTooltipContent={customTooltipContent}
              />
            }
            cursor={{ fill: "rgba(255, 255, 255, 0.03)", radius: 4 }}
            wrapperStyle={{ 
              zIndex: 9999, 
              visibility: 'visible',
              pointerEvents: 'none',
            }}
            allowEscapeViewBox={{ x: false, y: false }}
            position={{ y: 0 }}
            offset={15}
          />
          
          {bars.map((bar, barIndex) => (
            <Bar
              key={bar.dataKey}
              dataKey={bar.dataKey}
              fill={`url(#barGradient-${bar.dataKey})`}
              radius={[3, 3, 3, 3]}
              barSize={barSize}
              isAnimationActive={!disableAnimations}
              animationBegin={disableAnimations ? 0 : barIndex * 100}
              animationDuration={disableAnimations ? 0 : 800}
              animationEasing={disableAnimations ? "linear" : "ease-out"}
            >
              {data.map((entry, index) => {
                const value = entry[bar.dataKey];
                let fillUrl = `url(#barGradient-${bar.dataKey})`;
                
                if (dynamicColors && typeof value === 'number') {
                  if (value < 0) {
                    fillUrl = 'url(#barGradient-negative)';
                  } else if (value === 0) {
                    fillUrl = 'url(#barGradient-neutral)';
                  }
                }
                
                return (
                  <Cell 
                    key={`cell-${index}`}
                    fill={fillUrl}
                    style={{
                      filter: "drop-shadow(0 2px 4px rgba(0, 0, 0, 0.15))",
                      transition: "all 0.3s ease",
                    }}
                  />
                );
              })}
              {showLabels && (
                <LabelList
                  dataKey={bar.labelValueKey ?? labelDataKey ?? bar.dataKey}
                  position="top"
                  content={(props: any) => {
                    const entry = props.payload;
                    // If a label key is provided (global or per-bar), use that value instead of the bar value
                    const effectiveLabelKey = bar.labelValueKey ?? labelDataKey;
                    const rawValue = effectiveLabelKey && entry ? entry[effectiveLabelKey] : props.value;

                    // Pass the currency type from the bar config to the formatter
                    const ctx = { dataKey: bar.dataKey, payload: entry, currency: bar.currency };
                    const formattedValue =
                      formatLabel && rawValue !== undefined ? formatLabel(rawValue, ctx) : rawValue;

                    // Check if value is negative for label positioning
                    const isNegative = typeof rawValue === 'number' && rawValue < 0;

                    // Color labels based on sign of the displayed label value
                    const signValue = rawValue;

                    return (
                      disableAnimations ? (
                        <StaticLabel
                          {...props}
                          isNegative={isNegative}
                          fill={
                            typeof signValue === "number"
                              ? signValue > 0
                                ? "#22C55E"
                                : signValue < 0
                                  ? "#EF4444"
                                  : "#6B7280"
                              : bar.gradientStart
                          }
                          formattedValue={formattedValue}
                        />
                      ) : (
                        <AnimatedLabel
                          {...props}
                          isNegative={isNegative}
                          fill={
                            typeof signValue === "number"
                              ? signValue > 0
                                ? "#22C55E"
                                : signValue < 0
                                  ? "#EF4444"
                                  : "#6B7280"
                              : bar.gradientStart
                          }
                          formattedValue={formattedValue}
                        />
                      )
                    );
                  }}
                />
              )}
            </Bar>
          ))}
        </BarChart>
      </ResponsiveContainer>
      
      {showLegend && <ModernLegend bars={bars} />}
    </div>
  );
}
