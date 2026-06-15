import { ReactNode } from "react";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

interface HeaderKpiCardProps {
  label: string;
  value: string;
  hint?: string;
  icon?: ReactNode;
  tone?: "default" | "positive" | "negative" | "warning";
  /** Pílula opcional no canto direito do header (ex: PeriodScopeBadge) */
  periodBadge?: ReactNode;
}

const TONE: Record<NonNullable<HeaderKpiCardProps["tone"]>, string> = {
  default: "text-foreground",
  positive: "text-emerald-600 dark:text-emerald-400",
  negative: "text-red-600 dark:text-red-400",
  warning: "text-amber-600 dark:text-amber-400",
};

export function HeaderKpiCard({ label, value, hint, icon, tone = "default", periodBadge }: HeaderKpiCardProps) {
  return (
    <Card className="p-4 flex flex-col gap-1 min-h-[96px]">
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span className="font-medium uppercase tracking-wide">{label}</span>
        <span className="flex items-center gap-1.5">
          {periodBadge}
          {icon ? <span className="opacity-70">{icon}</span> : null}
        </span>
      </div>
      <div className={cn("text-xl md:text-2xl font-bold leading-tight", TONE[tone])}>{value}</div>
      {hint ? <div className="text-[11px] text-muted-foreground">{hint}</div> : null}
    </Card>
  );
}