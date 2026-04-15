import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useProjetoCurrency } from "@/hooks/useProjetoCurrency";
import { useProjetoDashboardData, buildBookmakerMoedaMap } from "@/hooks/useProjetoDashboardData";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { FinancialMetricsPopover } from "./FinancialMetricsPopover";
import { DollarSign } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { calcularMetricasPeriodo } from "@/services/calcularMetricasPeriodo";
import { format } from "date-fns";

interface DateRangeResult {
  start: Date;
  end: Date;
}

interface FinancialSummaryCompactProps {
  projetoId: string;
  dateRange?: DateRangeResult | null;
}

export function FinancialSummaryCompact({ projetoId, dateRange }: FinancialSummaryCompactProps) {
  const { formatCurrency, convertToConsolidationOficial, cotacaoOficialUSD, convertToConsolidation, moedaConsolidacao } = useProjetoCurrency(projetoId);

  // Usa o RPC centralizado em vez de queries individuais
  const { data: rawData, isLoading } = useProjetoDashboardData(projetoId);

  // Métricas do período selecionado (ciclo/filtro)
  const dateRangeKey = dateRange ? `${format(dateRange.start, "yyyy-MM-dd")}_${format(dateRange.end, "yyyy-MM-dd")}` : null;
  
  const { data: periodMetrics } = useQuery({
    queryKey: ["projeto-financial-compact-period", projetoId, dateRangeKey],
    queryFn: async () => {
      if (!dateRange) return null;
      return calcularMetricasPeriodo({
        projetoId,
        dataInicio: format(dateRange.start, "yyyy-MM-dd"),
        dataFim: format(dateRange.end, "yyyy-MM-dd"),
        convertToConsolidation: convertToConsolidationOficial,
        moedaConsolidacao: moedaConsolidacao || "BRL",
      });
    },
    enabled: !!dateRange && !!dateRangeKey,
    staleTime: 30_000,
    gcTime: 60_000,
  });

  const metrics = useMemo(() => {
    if (!rawData) return null;

    // Depósitos efetivos: exclui DEPOSITO_VIRTUAL de baseline (não é dinheiro real)
    // Mantém DEPOSITO_VIRTUAL de migração (origem_tipo = 'MIGRACAO')
    const depositosEfetivos = rawData.depositos
      .filter(d => d.tipo_transacao === 'DEPOSITO' || (d.tipo_transacao === 'DEPOSITO_VIRTUAL' && d.origem_tipo === 'MIGRACAO'))
      .reduce(
        (acc, d) => acc + convertToConsolidationOficial(Number(d.valor || 0), d.moeda || 'BRL'), 0
      );
    const saquesRecebidos = rawData.saques.reduce(
      (acc, s) => acc + convertToConsolidationOficial(Number(s.valor_confirmado ?? s.valor), s.moeda || 'BRL'), 0
    );

    const lucro = saquesRecebidos - depositosEfetivos;
    const roi = depositosEfetivos > 0 ? (lucro / depositosEfetivos) * 100 : 0;

    return { lucro, roi };
  }, [rawData, convertToConsolidationOficial, cotacaoOficialUSD]);

  if (isLoading || !metrics) {
    return <Skeleton className="h-10 w-32" />;
  }

  const lucroColor = metrics.lucro >= 0 ? "text-emerald-500" : "text-red-500";
  const roiColor = metrics.roi >= 0 ? "text-emerald-500" : "text-red-500";
  
  // Lucro do período (operacional)
  const hasPeriod = !!periodMetrics && !!dateRange;
  const periodLucro = periodMetrics?.lucroLiquido ?? 0;
  const periodColor = periodLucro >= 0 ? "text-emerald-500" : "text-red-500";

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button className="flex items-center gap-2 rounded-lg border border-border/50 bg-muted/30 px-3 py-1.5 hover:bg-muted/60 transition-colors cursor-pointer group">
          <div className="flex flex-col items-center">
            <span className="text-[10px] text-muted-foreground leading-tight">{metrics.lucro >= 0 ? "Lucro" : "Prejuízo"}</span>
            <span className={`text-sm font-bold leading-tight tabular-nums ${lucroColor}`}>
              {formatCurrency(metrics.lucro)}
            </span>
            <span className={`text-[10px] leading-tight tabular-nums ${roiColor}`}>
              ROI {metrics.roi.toFixed(2)}%
            </span>
          </div>
          <div className="h-6 w-6 rounded-full bg-muted/60 flex items-center justify-center group-hover:bg-muted transition-colors">
            <DollarSign className="h-3 w-3 text-muted-foreground" />
          </div>
        </button>
      </PopoverTrigger>
      <PopoverContent side="bottom" align="start" className="p-0 w-auto">
        <FinancialMetricsPopover projetoId={projetoId} />
      </PopoverContent>
    </Popover>
  );
}
