import { useState, useEffect, useMemo } from "react";
import { ChartEmptyState } from "@/components/ui/chart-empty-state";
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Sector } from "recharts";
import {
  Tooltip as UITooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

interface DonutDataItem {
  name: string;
  value: number;
  color?: string;
}

interface ModernDonutChartProps {
  data: DonutDataItem[];
  height?: number;
  innerRadius?: number;
  outerRadius?: number;
  showLabels?: boolean;
  showLegend?: boolean;
  centerLabel?: string;
  centerValue?: string | number;
  formatValue?: (value: number) => string;
  formatTooltip?: (item: DonutDataItem, total: number) => React.ReactNode;
  colors?: string[];
}

// Format currency in compact form (k, M, B)
const formatCompactCurrency = (valueStr: string): { 
  display: string; 
  full: string;
  isAbbreviated: boolean;
} => {
  // Extract numeric value from currency string like "R$ 54.861,70"
  const cleanStr = valueStr.replace(/[R$\s.]/g, '').replace(',', '.');
  const value = parseFloat(cleanStr);
  
  if (isNaN(value)) {
    return { display: valueStr, full: valueStr, isAbbreviated: false };
  }

  if (value >= 1_000_000_000) {
    return { 
      display: `R$ ${(value / 1_000_000_000).toFixed(1).replace('.', ',')}B`, 
      full: valueStr,
      isAbbreviated: true 
    };
  }
  if (value >= 1_000_000) {
    return { 
      display: `R$ ${(value / 1_000_000).toFixed(1).replace('.', ',')}M`, 
      full: valueStr,
      isAbbreviated: true 
    };
  }
  if (value >= 100_000) {
    return { 
      display: `R$ ${(value / 1_000).toFixed(1).replace('.', ',')}k`, 
      full: valueStr,
      isAbbreviated: true 
    };
  }
  return { display: valueStr, full: valueStr, isAbbreviated: false };
};

// Auto-fit center value component
interface AutoFitCenterValueProps {
  value: string;
  label?: string;
  innerRadius: number;
}

function AutoFitCenterValue({ value, label, innerRadius }: AutoFitCenterValueProps) {
  // Safe area = 85% of inner diameter
  const safeWidth = innerRadius * 2 * 0.85;
  
  // Calculate optimal display strategy
  const { displayValue, fullValue, fontSize, needsLineBreak, isAbbreviated } = useMemo(() => {
    const charWidthRatio = 0.6; // Average char width relative to font size
    const baseFontSize = 18;
    const minFontSize = 10;
    
    // Check if value starts with R$ (currency)
    const isCurrency = value.startsWith('R$');
    const valueWithoutPrefix = isCurrency ? value.replace('R$ ', '') : value;
    
    // Calculate text width at base font size
    const estimateWidth = (text: string, size: number) => text.length * size * charWidthRatio;
    
    // Strategy 1: Full value with scaled font
    const fullWidth = estimateWidth(value, baseFontSize);
    if (fullWidth <= safeWidth) {
      return { 
        displayValue: value, 
        fullValue: value, 
        fontSize: baseFontSize, 
        needsLineBreak: false,
        isAbbreviated: false 
      };
    }
    
    // Try scaling down font
    const scaledFontSize = Math.max(minFontSize, Math.floor(baseFontSize * (safeWidth / fullWidth)));
    if (estimateWidth(value, scaledFontSize) <= safeWidth && scaledFontSize >= 12) {
      return { 
        displayValue: value, 
        fullValue: value, 
        fontSize: scaledFontSize, 
        needsLineBreak: false,
        isAbbreviated: false 
      };
    }
    
    // Strategy 2: Line break for currency (R$ on line 1, value on line 2)
    if (isCurrency) {
      const valueOnlyWidth = estimateWidth(valueWithoutPrefix, 14);
      if (valueOnlyWidth <= safeWidth) {
        return { 
          displayValue: value, 
          fullValue: value, 
          fontSize: 14, 
          needsLineBreak: true,
          isAbbreviated: false 
        };
      }
    }
    
    // Strategy 3: Abbreviated format with tooltip
    const compact = formatCompactCurrency(value);
    const compactWidth = estimateWidth(compact.display, 14);
    if (compactWidth <= safeWidth) {
      return { 
        displayValue: compact.display, 
        fullValue: compact.full, 
        fontSize: 14, 
        needsLineBreak: false,
        isAbbreviated: compact.isAbbreviated 
      };
    }
    
    // Final fallback: smallest abbreviated with minimum font
    return { 
      displayValue: compact.display, 
      fullValue: compact.full, 
      fontSize: minFontSize, 
      needsLineBreak: false,
      isAbbreviated: compact.isAbbreviated 
    };
  }, [value, safeWidth]);
  
  const renderValue = () => {
    if (needsLineBreak && displayValue.startsWith('R$')) {
      const valueWithoutPrefix = displayValue.replace('R$ ', '');
      return (
        <div className="flex flex-col items-center">
          <span style={{ fontSize: fontSize * 0.75 }} className="text-muted-foreground">R$</span>
          <span style={{ fontSize }} className="font-bold font-mono leading-none">{valueWithoutPrefix}</span>
        </div>
      );
    }
    return (
      <span style={{ fontSize }} className="font-bold font-mono leading-tight">
        {displayValue}
      </span>
    );
  };

  const content = (
    <div 
      className="text-center flex flex-col items-center justify-center"
      style={{ maxWidth: safeWidth }}
    >
      {renderValue()}
      {label && (
        <div className="text-[10px] text-muted-foreground mt-0.5 leading-tight">{label}</div>
      )}
    </div>
  );

  // Wrap with tooltip if abbreviated
  if (isAbbreviated) {
    return (
      <TooltipProvider>
        <UITooltip>
          <TooltipTrigger asChild>
            <div className="pointer-events-auto cursor-help">
              {content}
            </div>
          </TooltipTrigger>
          <TooltipContent>
            <span className="font-mono">{fullValue}</span>
          </TooltipContent>
        </UITooltip>
      </TooltipProvider>
    );
  }

  return content;
}

// Modern gradient color pairs [start, end]
const DEFAULT_GRADIENT_COLORS = [
  ["#22C55E", "#16A34A"], // Green
  ["#EF4444", "#DC2626"], // Red
  ["#3B82F6", "#2563EB"], // Blue
  ["#F59E0B", "#D97706"], // Amber
  ["#8B5CF6", "#7C3AED"], // Violet
  ["#06B6D4", "#0891B2"], // Cyan
  ["#EC4899", "#DB2777"], // Pink
  ["#F97316", "#EA580C"], // Orange
];

// Custom active shape with enhanced styling (clean, no internal stroke)
const renderActiveShape = (props: any) => {
  const {
    cx, cy, innerRadius, outerRadius, startAngle, endAngle,
    fill
  } = props;

  return (
    <g>
      <Sector
        cx={cx}
        cy={cy}
        innerRadius={innerRadius}
        outerRadius={outerRadius + 4}
        startAngle={startAngle}
        endAngle={endAngle}
        fill={fill}
        cornerRadius={6}
        style={{
          filter: "drop-shadow(0 2px 8px rgba(0, 0, 0, 0.2))",
          transition: "all 0.2s ease"
        }}
      />
    </g>
  );
};

// Animated center percentage component
function AnimatedPercentage({ value, duration = 1000 }: { value: number; duration?: number }) {
  const [displayValue, setDisplayValue] = useState(0);

  useEffect(() => {
    let startTime: number;
    let animationFrame: number;

    const animate = (timestamp: number) => {
      if (!startTime) startTime = timestamp;
      const progress = Math.min((timestamp - startTime) / duration, 1);
      
      // Easing function for smooth animation
      const easeOutQuart = 1 - Math.pow(1 - progress, 4);
      setDisplayValue(Math.round(easeOutQuart * value));

      if (progress < 1) {
        animationFrame = requestAnimationFrame(animate);
      }
    };

    animationFrame = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(animationFrame);
  }, [value, duration]);

  return <span>{displayValue}%</span>;
}

// Custom tooltip component
const CustomTooltip = ({ 
  active, 
  payload, 
  total,
  formatValue,
  formatTooltip
}: any) => {
  if (active && payload && payload.length) {
    const data = payload[0].payload;
    const percent = total > 0 ? ((data.value / total) * 100).toFixed(1) : "0";

    if (formatTooltip) {
      return (
        <div className="bg-background/80 backdrop-blur-xl border border-border/50 rounded-xl px-4 py-3 shadow-2xl">
          {formatTooltip(data, total)}
        </div>
      );
    }

    return (
      <div className="bg-background/80 backdrop-blur-xl border border-border/50 rounded-xl px-4 py-3 shadow-2xl min-w-[140px]">
        <div className="flex items-center gap-2 mb-1">
          <div 
            className="w-3 h-3 rounded-full" 
            style={{ background: `linear-gradient(135deg, ${data.gradientStart || data.color}, ${data.gradientEnd || data.color})` }}
          />
          <span className="font-medium text-sm">{data.name}</span>
        </div>
        <div className="text-lg font-bold font-mono">
          {formatValue ? formatValue(data.value) : data.value}
        </div>
        <div className="text-xs text-muted-foreground">{percent}% do total</div>
      </div>
    );
  }
  return null;
};

// Custom label with curved connecting lines - positioned further away
const renderCustomLabel = ({
  cx, cy, midAngle, innerRadius, outerRadius, percent, name, fill, viewBox
}: any) => {
  const RADIAN = Math.PI / 180;
  // Increase radius for labels to prevent overlap
  const radius = outerRadius + 40;
  const x = cx + radius * Math.cos(-midAngle * RADIAN);
  const y = cy + radius * Math.sin(-midAngle * RADIAN);
  
  // Calculate connection line points
  const lineRadius = outerRadius + 10;
  const lineX = cx + lineRadius * Math.cos(-midAngle * RADIAN);
  const lineY = cy + lineRadius * Math.sin(-midAngle * RADIAN);

  // Only show label if percentage is significant enough
  if (percent < 0.08) return null;

  return (
    <g>
      {/* Curved connecting line */}
      <path
        d={`M${lineX},${lineY} L${x},${y}`}
        stroke={fill}
        strokeWidth={1}
        fill="none"
        strokeOpacity={0.5}
        style={{ transition: "all 0.3s ease" }}
      />
      {/* Label dot */}
      <circle cx={x} cy={y} r={2} fill={fill} />
      {/* Label text */}
      <text
        x={x + (x > cx ? 6 : -6)}
        y={y - 6}
        textAnchor={x > cx ? "start" : "end"}
        dominantBaseline="central"
        className="fill-foreground font-medium"
        style={{ fontSize: "10px" }}
      >
        {name}
      </text>
      <text
        x={x + (x > cx ? 6 : -6)}
        y={y + 6}
        textAnchor={x > cx ? "start" : "end"}
        dominantBaseline="central"
        className="fill-muted-foreground font-mono"
        style={{ fontSize: "9px" }}
      >
        {(percent * 100).toFixed(0)}%
      </text>
    </g>
  );
};

export function ModernDonutChart({
  data,
  height = 280,
  innerRadius = 70,
  outerRadius = 95,
  showLabels = false,
  showLegend = false,
  centerLabel,
  centerValue,
  formatValue,
  formatTooltip,
  colors,
}: ModernDonutChartProps) {
  const [activeIndex, setActiveIndex] = useState<number | null>(null);

  // Calculate total for percentage
  const total = data.reduce((sum, item) => sum + item.value, 0);

  // Calculate the largest segment's percentage for center display
  const largestSegment = data.reduce((max, item) => 
    item.value > max.value ? item : max, { value: 0, name: "" }
  );
  const mainPercentage = total > 0 ? Math.round((largestSegment.value / total) * 100) : 0;

  // Prepare data with gradient colors
  const enrichedData = data.map((item, index) => {
    const gradientPair = colors 
      ? [colors[index % colors.length], colors[index % colors.length]]
      : DEFAULT_GRADIENT_COLORS[index % DEFAULT_GRADIENT_COLORS.length];
    
    return {
      ...item,
      gradientStart: item.color || gradientPair[0],
      gradientEnd: item.color ? item.color : gradientPair[1],
      gradientId: `donutGradient-${index}`
    };
  });

  if (data.length === 0 || total === 0) {
    return <ChartEmptyState />;
  }

  return (
    <div className="relative overflow-hidden" style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <defs>
            {enrichedData.map((item, index) => (
              <linearGradient
                key={item.gradientId}
                id={item.gradientId}
                x1="0"
                y1="0"
                x2="1"
                y2="1"
              >
                <stop offset="0%" stopColor={item.gradientStart} stopOpacity={1} />
                <stop offset="100%" stopColor={item.gradientEnd} stopOpacity={0.85} />
              </linearGradient>
            ))}
          </defs>
          <Pie
            data={enrichedData}
            cx="50%"
            cy="50%"
            innerRadius={innerRadius}
            outerRadius={outerRadius}
            paddingAngle={3}
            dataKey="value"
            cornerRadius={8}
            stroke="transparent"
            activeIndex={activeIndex !== null ? activeIndex : undefined}
            activeShape={renderActiveShape}
            onMouseEnter={(_, index) => setActiveIndex(index)}
            onMouseLeave={() => setActiveIndex(null)}
            label={showLabels ? renderCustomLabel : undefined}
            labelLine={false}
          >
            {enrichedData.map((entry, index) => (
              <Cell
                key={`cell-${index}`}
                fill={`url(#${entry.gradientId})`}
                className="cursor-pointer transition-all duration-300"
                style={{
                  filter: activeIndex === index 
                    ? "drop-shadow(0 4px 12px rgba(0, 0, 0, 0.3))" 
                    : "none",
                  opacity: activeIndex !== null && activeIndex !== index ? 0.6 : 1,
                }}
              />
            ))}
          </Pie>
          <Tooltip 
            content={
              <CustomTooltip 
                total={total} 
                formatValue={formatValue}
                formatTooltip={formatTooltip}
              />
            }
            wrapperStyle={{ zIndex: 1000 }}
            position={{ x: 0, y: 0 }}
            offset={20}
          />
        </PieChart>
      </ResponsiveContainer>

      {/* Center content with auto-fit */}
      <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
        {centerValue !== undefined ? (
          typeof centerValue === 'number' ? (
            <div className="text-center">
              <div className="text-lg font-bold font-mono leading-tight">
                <AnimatedPercentage value={centerValue} />
              </div>
              {centerLabel && (
                <div className="text-[10px] text-muted-foreground mt-0.5 leading-tight">{centerLabel}</div>
              )}
            </div>
          ) : (
            <AutoFitCenterValue 
              value={centerValue} 
              label={centerLabel} 
              innerRadius={innerRadius} 
            />
          )
        ) : (
          <div className="text-center">
            <div className="text-lg font-bold font-mono leading-tight">
              <AnimatedPercentage value={mainPercentage} />
            </div>
            <div className="text-[10px] text-muted-foreground mt-0.5 leading-tight">
              {largestSegment.name}
            </div>
          </div>
        )}
      </div>

      {/* Legend - scrollable if too many items */}
      {showLegend && (
        <div className="mt-4 max-h-20 overflow-y-auto overflow-x-hidden">
          <div className="flex flex-wrap justify-center gap-x-4 gap-y-2 px-2">
            {enrichedData.map((item, index) => (
              <div 
                key={index} 
                className="flex items-center gap-1.5 cursor-pointer transition-opacity hover:opacity-80 min-w-0 max-w-[45%]"
                onMouseEnter={() => setActiveIndex(index)}
                onMouseLeave={() => setActiveIndex(null)}
              >
                <div 
                  className="w-2.5 h-2.5 rounded-full shrink-0"
                  style={{ 
                    background: `linear-gradient(135deg, ${item.gradientStart}, ${item.gradientEnd})` 
                  }}
                />
                <span className="text-[10px] text-muted-foreground truncate">{item.name}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
