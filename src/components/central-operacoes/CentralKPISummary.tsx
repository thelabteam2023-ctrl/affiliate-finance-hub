/**
 * CentralKPISummary — Resumo de KPIs no topo da Central de Operações
 */

import { cn } from "@/lib/utils";
import { AlertTriangle, Clock, DollarSign, ShieldAlert } from "lucide-react";

interface KPIItem {
  label: string;
  value: number;
  icon: React.ReactNode;
  color: string;
  valueColor: string;
}

interface CentralKPISummaryProps {
  criticalCount: number;
  saquesCount: number;
  pendentesCount: number;
  limitadasCount: number;
}

export function CentralKPISummary({ criticalCount, saquesCount, pendentesCount, limitadasCount }: CentralKPISummaryProps) {
  const items: KPIItem[] = [
    { label: "Críticos", value: criticalCount, icon: <AlertTriangle className="h-3.5 w-3.5" />, color: "bg-red-500/10 border-red-500/20", valueColor: "text-red-400" },
    { label: "Saques", value: saquesCount, icon: <DollarSign className="h-3.5 w-3.5" />, color: "bg-yellow-500/10 border-yellow-500/20", valueColor: "text-yellow-400" },
    { label: "Pendentes", value: pendentesCount, icon: <Clock className="h-3.5 w-3.5" />, color: "bg-emerald-500/10 border-emerald-500/20", valueColor: "text-emerald-400" },
    { label: "Limitadas", value: limitadasCount, icon: <ShieldAlert className="h-3.5 w-3.5" />, color: "bg-orange-500/10 border-orange-500/20", valueColor: "text-orange-400" },
  ];

  const totalCount = items.reduce((s, i) => s + i.value, 0);
  if (totalCount === 0) return null;

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-2 md:gap-3">
      {items.map((item) => (
        <div
          key={item.label}
          className={cn(
            "flex items-center gap-2 rounded-xl border p-2.5 md:p-3 backdrop-blur-sm transition-all duration-150",
            "hover:shadow-sm",
            item.color
          )}
        >
          <span className={item.valueColor}>{item.icon}</span>
          <div className="min-w-0 flex-1">
            <p className="text-[10px] md:text-[11px] text-muted-foreground truncate">{item.label}</p>
            <p className={cn("text-base md:text-lg font-bold tabular-nums leading-none", item.valueColor)}>
              {item.value}
            </p>
          </div>
        </div>
      ))}
    </div>
  );
}
