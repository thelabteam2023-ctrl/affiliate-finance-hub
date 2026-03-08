import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useProjetoCurrency } from "@/hooks/useProjetoCurrency";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { FinancialMetricsPopover } from "./FinancialMetricsPopover";
import { DollarSign } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";

interface FinancialSummaryCompactProps {
  projetoId: string;
}

async function fetchCompactMetrics(projetoId: string) {
  const depositoQ = supabase.from("cash_ledger").select("valor, moeda")
    .in("tipo_transacao", ["DEPOSITO", "DEPOSITO_VIRTUAL"])
    .eq("status", "CONFIRMADO").eq("projeto_id_snapshot", projetoId);

  const saqueQ = supabase.from("cash_ledger").select("valor, valor_confirmado, moeda")
    .in("tipo_transacao", ["SAQUE", "SAQUE_VIRTUAL"])
    .eq("status", "CONFIRMADO").eq("projeto_id_snapshot", projetoId);

  const saquePendQ = supabase.from("cash_ledger").select("valor, moeda")
    .in("tipo_transacao", ["SAQUE", "SAQUE_VIRTUAL"])
    .eq("status", "PENDENTE").eq("projeto_id_snapshot", projetoId);

  const [bookmakers, depositos, saques, saquesPend] = await Promise.all([
    supabase.from("bookmakers").select("saldo_atual, moeda").eq("projeto_id", projetoId),
    depositoQ,
    saqueQ,
    saquePendQ,
  ]);

  return {
    bookmakerSaldos: (bookmakers.data || []).map(b => ({ saldo_atual: b.saldo_atual || 0, moeda: b.moeda || "BRL" })),
    depositos: (depositos.data || []) as { valor: number; moeda: string }[],
    saques: (saques.data || []) as { valor: number; valor_confirmado?: number | null; moeda: string }[],
    saquesPendentes: (saquesPend.data || []) as { valor: number; moeda: string }[],
  };
}

export function FinancialSummaryCompact({ projetoId }: FinancialSummaryCompactProps) {
  const { formatCurrency, convertToConsolidationOficial, cotacaoOficialUSD } = useProjetoCurrency(projetoId);

  const { data: raw, isLoading } = useQuery({
    queryKey: ["projeto-financial-compact", projetoId],
    queryFn: () => fetchCompactMetrics(projetoId),
    staleTime: 30_000,
    gcTime: 60_000,
  });

  const metrics = useMemo(() => {
    if (!raw) return null;

    // LUCRO REAL = Saques Confirmados - Depósitos Confirmados
    // Nenhum outro evento (bônus, apostas, cashback) entra neste cálculo
    const depositosTotal = raw.depositos.reduce(
      (acc, d) => acc + convertToConsolidationOficial(d.valor, d.moeda), 0
    );
    const saquesRecebidos = raw.saques.reduce(
      (acc, s) => acc + convertToConsolidationOficial(s.valor_confirmado ?? s.valor, s.moeda), 0
    );

    const lucro = saquesRecebidos - depositosTotal;
    const roi = depositosTotal > 0 ? (lucro / depositosTotal) * 100 : 0;

    return { lucro, roi };
  }, [raw, convertToConsolidationOficial, cotacaoOficialUSD]);

  if (isLoading || !metrics) {
    return <Skeleton className="h-10 w-32" />;
  }

  const lucroColor = metrics.lucro >= 0 ? "text-emerald-500" : "text-red-500";
  const roiColor = metrics.roi >= 0 ? "text-emerald-500" : "text-red-500";

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
