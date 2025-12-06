import { useState, useEffect } from "react";
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Sector } from "recharts";

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

// Custom active shape with enhanced styling
const renderActiveShape = (props: any) => {
  const {
    cx, cy, innerRadius, outerRadius, startAngle, endAngle,
    fill, payload, percent
  } = props;

  return (
    <g>
      <Sector
        cx={cx}
        cy={cy}
        innerRadius={innerRadius - 2}
        outerRadius={outerRadius + 6}
        startAngle={startAngle}
        endAngle={endAngle}
        fill={fill}
        cornerRadius={8}
        style={{
          filter: "drop-shadow(0 4px 12px rgba(0, 0, 0, 0.3))",
          transition: "all 0.3s ease"
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

// Custom label with curved connecting lines
const renderCustomLabel = ({
  cx, cy, midAngle, innerRadius, outerRadius, percent, name, fill
}: any) => {
  const RADIAN = Math.PI / 180;
  const radius = outerRadius + 25;
  const x = cx + radius * Math.cos(-midAngle * RADIAN);
  const y = cy + radius * Math.sin(-midAngle * RADIAN);
  
  // Calculate connection line points
  const lineRadius = outerRadius + 8;
  const lineX = cx + lineRadius * Math.cos(-midAngle * RADIAN);
  const lineY = cy + lineRadius * Math.sin(-midAngle * RADIAN);

  // Only show label if percentage is significant enough
  if (percent < 0.05) return null;

  return (
    <g>
      {/* Curved connecting line */}
      <path
        d={`M${lineX},${lineY} Q${(lineX + x) / 2},${(lineY + y) / 2 - 5} ${x},${y}`}
        stroke={fill}
        strokeWidth={1.5}
        fill="none"
        strokeOpacity={0.6}
        style={{ transition: "all 0.3s ease" }}
      />
      {/* Label dot */}
      <circle cx={x} cy={y} r={3} fill={fill} />
      {/* Label text */}
      <text
        x={x + (x > cx ? 8 : -8)}
        y={y}
        textAnchor={x > cx ? "start" : "end"}
        dominantBaseline="central"
        className="text-xs fill-foreground font-medium"
        style={{ fontSize: "11px" }}
      >
        {name}
      </text>
      <text
        x={x + (x > cx ? 8 : -8)}
        y={y + 14}
        textAnchor={x > cx ? "start" : "end"}
        dominantBaseline="central"
        className="text-xs fill-muted-foreground font-mono"
        style={{ fontSize: "10px" }}
      >
        {(percent * 100).toFixed(0)}%
      </text>
    </g>
  );
};

export function ModernDonutChart({
  data,
  height = 280,
  innerRadius = 60,
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
    return (
      <div className="flex items-center justify-center h-full text-muted-foreground">
        Sem dados para exibir
      </div>
    );
  }

  return (
    <div className="relative" style={{ height }}>
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
          />
        </PieChart>
      </ResponsiveContainer>

      {/* Center content with animated percentage */}
      <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
        <div className="text-center">
          {centerValue !== undefined ? (
            <>
              <div className="text-2xl font-bold font-mono">
                {typeof centerValue === 'number' ? (
                  <AnimatedPercentage value={centerValue} />
                ) : (
                  centerValue
                )}
              </div>
              {centerLabel && (
                <div className="text-xs text-muted-foreground mt-1">{centerLabel}</div>
              )}
            </>
          ) : (
            <>
              <div className="text-2xl font-bold font-mono">
                <AnimatedPercentage value={mainPercentage} />
              </div>
              <div className="text-xs text-muted-foreground mt-1">
                {largestSegment.name}
              </div>
            </>
          )}
        </div>
      </div>

      {/* Legend */}
      {showLegend && (
        <div className="flex flex-wrap justify-center gap-4 mt-4">
          {enrichedData.map((item, index) => (
            <div 
              key={index} 
              className="flex items-center gap-2 cursor-pointer transition-opacity hover:opacity-80"
              onMouseEnter={() => setActiveIndex(index)}
              onMouseLeave={() => setActiveIndex(null)}
            >
              <div 
                className="w-3 h-3 rounded-full"
                style={{ 
                  background: `linear-gradient(135deg, ${item.gradientStart}, ${item.gradientEnd})` 
                }}
              />
              <span className="text-xs text-muted-foreground">{item.name}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
