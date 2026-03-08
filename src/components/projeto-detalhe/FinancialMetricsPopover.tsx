import { FinancialMetricsPanel } from "./financial-metrics/FinancialMetricsPanel";

interface FinancialMetricsPopoverProps {
  projetoId: string;
}

export function FinancialMetricsPopover({ projetoId }: FinancialMetricsPopoverProps) {
  return <FinancialMetricsPanel projetoId={projetoId} className="p-4 w-[340px] space-y-0" />;
}
