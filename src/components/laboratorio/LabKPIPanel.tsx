import { Metrics } from "@/hooks/useValueBetLabData";
import { cn } from "@/lib/utils";
import { 
  Target, Zap, TrendingUp, TrendingDown, 
  Percent, CheckCircle2, XCircle, Slash
} from "lucide-react";

interface LabKPIPanelProps {
  metrics: Metrics;
  className?: string;
}

export function LabKPIPanel({ metrics, className }: LabKPIPanelProps) {
  const isPositive = metrics.profit >= 0;

  const kpis = [
    { 
      label: "Total Apostas", 
      value: metrics.total.toLocaleString(), 
      sub: `${metrics.validas} válidas`,
      icon: <Target className="h-4 w-4" /> 
    },
    { 
      label: "Volume", 
      value: `R$ ${metrics.stake.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`, 
      icon: <Zap className="h-4 w-4" /> 
    },
    { 
      label: "Lucro/Prejuízo", 
      value: `R$ ${metrics.profit.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`, 
      color: isPositive ? "text-green-500" : "text-red-500",
      icon: isPositive ? <TrendingUp className="h-4 w-4" /> : <TrendingDown className="h-4 w-4" /> 
    },
    { 
      label: "ROI", 
      value: `${metrics.roi.toFixed(2)}%`, 
      color: metrics.roi >= 0 ? "text-green-400" : "text-red-400",
      icon: <Percent className="h-4 w-4" /> 
    },
    { 
      label: "Win Rate", 
      value: `${metrics.winRate.toFixed(1)}%`, 
      icon: <CheckCircle2 className="h-4 w-4" /> 
    },
  ];

  return (
    <div className={cn("grid grid-cols-2 md:grid-cols-5 gap-4", className)}>
      {kpis.map((kpi, i) => (
        <div 
          key={i} 
          className="bg-card/40 border border-border/40 rounded-xl p-4 space-y-2 group hover:border-primary/20 transition-all shadow-sm"
        >
          <div className="flex items-center justify-between text-muted-foreground group-hover:text-foreground transition-colors">
            <span className="text-[10px] font-bold uppercase tracking-wider">{kpi.label}</span>
            <div className="p-1.5 bg-muted/30 rounded-lg">{kpi.icon}</div>
          </div>
          <div className="flex flex-col">
            <span className={cn("text-xl font-black tabular-nums tracking-tight", kpi.color)}>
              {kpi.value}
            </span>
            {kpi.sub && <span className="text-[9px] text-muted-foreground font-medium uppercase">{kpi.sub}</span>}
          </div>
        </div>
      ))}
      
      <div className="col-span-2 md:col-span-5 flex gap-4 pt-2">
        <MiniBadge label="Greens" count={metrics.greens} icon={<CheckCircle2 className="h-3 w-3 text-green-500" />} />
        <MiniBadge label="Reds" count={metrics.reds} icon={<XCircle className="h-3 w-3 text-red-500" />} />
        <MiniBadge label="Voids" count={metrics.voids} icon={<Slash className="h-3 w-3 text-slate-500" />} />
      </div>
    </div>
  );
}

function MiniBadge({ label, count, icon }: { label: string, count: number, icon: any }) {
  return (
    <div className="flex items-center gap-1.5 px-3 py-1 bg-muted/20 rounded-full border border-border/10">
      {icon}
      <span className="text-[10px] font-bold text-muted-foreground uppercase">{label}</span>
      <span className="text-[11px] font-black">{count}</span>
    </div>
  );
}
