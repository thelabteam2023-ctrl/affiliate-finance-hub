import { useState, useEffect, useRef } from "react";
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

interface BarConfig {
  dataKey: string;
  label: string;
  gradientStart: string;
  gradientEnd: string;
}

interface ModernBarChartProps {
  data: BarDataItem[];
  categoryKey: string;
  bars: BarConfig[];
  height?: number;
  barSize?: number;
  showLabels?: boolean;
  showLegend?: boolean;
  formatValue?: (value: number) => string;
  formatTooltip?: (dataKey: string, value: number) => string;
  customTooltipContent?: (payload: any, label: string) => React.ReactNode;
}

// Custom animated label component
const AnimatedLabel = (props: any) => {
  const { x, y, width, value, fill, index } = props;
  const [opacity, setOpacity] = useState(0);
  const [translateY, setTranslateY] = useState(10);

  useEffect(() => {
    const timer = setTimeout(() => {
      setOpacity(1);
      setTranslateY(0);
    }, 100 + index * 50);
    return () => clearTimeout(timer);
  }, [index]);

  if (!value || value === 0) return null;

  return (
    <text
      x={x + width / 2}
      y={y - 8}
      fill={fill}
      textAnchor="middle"
      dominantBaseline="middle"
      className="text-xs font-semibold"
      style={{
        opacity,
        transform: `translateY(${translateY}px)`,
        transition: "all 0.4s cubic-bezier(0.4, 0, 0.2, 1)",
        fontSize: "11px",
      }}
    >
      {value}
    </text>
  );
};

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

// Custom legend component
const ModernLegend = ({ bars }: { bars: BarConfig[] }) => {
  return (
    <div className="flex justify-center gap-6 mt-4">
      {bars.map((bar, index) => (
        <div 
          key={index}
          className="flex items-center gap-2 cursor-default"
        >
          <div 
            className="w-3 h-3 rounded-full shadow-sm"
            style={{ 
              background: `linear-gradient(180deg, ${bar.gradientStart}, ${bar.gradientEnd})`,
              boxShadow: `0 2px 8px ${bar.gradientStart}40`
            }}
          />
          <span className="text-xs text-muted-foreground font-medium">{bar.label}</span>
        </div>
      ))}
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
  formatValue,
  formatTooltip,
  customTooltipContent,
}: ModernBarChartProps) {
  const [isAnimated, setIsAnimated] = useState(false);
  const chartRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Trigger animation after mount
    const timer = setTimeout(() => setIsAnimated(true), 100);
    return () => clearTimeout(timer);
  }, []);

  if (!data || data.length === 0) {
    return (
      <div className="flex items-center justify-center h-full text-muted-foreground">
        Sem dados para exibir
      </div>
    );
  }

  return (
    <div ref={chartRef} className="w-full" style={{ height: height + (showLegend ? 40 : 0) }}>
      <ResponsiveContainer width="100%" height={height}>
        <BarChart 
          data={data} 
          margin={{ top: 25, right: 10, left: 0, bottom: 5 }}
          barCategoryGap="8%"
          barGap={0}
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
            tick={{ fill: "hsl(var(--muted-foreground))" }}
            width={35}
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
            wrapperStyle={{ zIndex: 1000 }}
            position={{ x: 0, y: -20 }}
            offset={20}
          />
          
          {bars.map((bar, barIndex) => (
            <Bar
              key={bar.dataKey}
              dataKey={bar.dataKey}
              fill={`url(#barGradient-${bar.dataKey})`}
              radius={[6, 6, 6, 6]}
              maxBarSize={barSize}
              animationBegin={barIndex * 100}
              animationDuration={800}
              animationEasing="ease-out"
            >
              {data.map((entry, index) => (
                <Cell 
                  key={`cell-${index}`}
                  style={{
                    filter: "drop-shadow(0 2px 4px rgba(0, 0, 0, 0.15))",
                    transition: "all 0.3s ease",
                  }}
                />
              ))}
              {showLabels && (
                <LabelList
                  dataKey={bar.dataKey}
                  position="top"
                  content={(props: any) => (
                    <AnimatedLabel 
                      {...props} 
                      fill={bar.gradientStart}
                    />
                  )}
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
