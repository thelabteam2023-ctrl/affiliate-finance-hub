import { Skeleton } from "@/components/ui/skeleton";
import { FinancialMetricsContent } from "./FinancialMetricsContent";
import { useFinancialMetrics } from "./useFinancialMetrics";

interface FinancialMetricsPanelProps {
  projetoId: string;
  className?: string;
}

export function FinancialMetricsPanel({ projetoId, className }: FinancialMetricsPanelProps) {
  const { metrics, isLoading, formatCurrency } = useFinancialMetrics(projetoId);

  if (isLoading || !metrics) {
    return (
      <div className="p-5 space-y-3 w-[340px]">
        <Skeleton className="h-5 w-40" />
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-10 w-full" />
      </div>
    );
  }

  return <FinancialMetricsContent metrics={metrics} formatCurrency={formatCurrency} className={className} />;
}
