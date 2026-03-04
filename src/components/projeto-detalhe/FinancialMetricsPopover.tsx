import { useMemo } from "react";
import { differenceInDays, parseISO, format } from "date-fns";
import { useQuery } from "@tanstack/react-query";
import { Skeleton } from "@/components/ui/skeleton";
import {
  DollarSign,
  ArrowDownCircle,
  ArrowUpCircle,
  Wallet,
  TrendingUp,
  Clock,
  ArrowRightLeft,
  Gift,
  BarChart3,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useProjetoCurrency } from "@/hooks/useProjetoCurrency";

interface FinancialMetricsPopoverProps {
  projetoId: string;
}

interface LedgerEntry {
  valor: number;
  valor_confirmado?: number | null;
  moeda: string;
}

async function fetchFinancialMetricsRaw(projetoId: string) {
  const { data: bookmakers } = await supabase
    .from("bookmakers")
    .select("id, saldo_atual, moeda")
    .eq("projeto_id", projetoId);

  const bookmakerSaldos = (bookmakers || []).map(b => ({ saldo_atual: b.saldo_atual || 0, moeda: b.moeda || "BRL" }));

  const [depositos, saques, saquesPend, cashbackM, cashbackE, giros, ajustes, perdasOp, perdasFx, ganhosFx] = await Promise.all([
    supabase.from("cash_ledger").select("valor, moeda")
      .in("tipo_transacao", ["DEPOSITO", "DEPOSITO_VIRTUAL"])
      .eq("status", "CONFIRMADO").eq("projeto_id_snapshot", projetoId),
    supabase.from("cash_ledger").select("valor, valor_confirmado, moeda")
      .in("tipo_transacao", ["SAQUE", "SAQUE_VIRTUAL"])
      .eq("status", "CONFIRMADO").eq("projeto_id_snapshot", projetoId),
    supabase.from("cash_ledger").select("valor, moeda")
      .in("tipo_transacao", ["SAQUE", "SAQUE_VIRTUAL"])
      .eq("status", "PENDENTE").eq("projeto_id_snapshot", projetoId),
    supabase.from("cash_ledger").select("valor, moeda")
      .eq("tipo_transacao", "CASHBACK_MANUAL").eq("status", "CONFIRMADO").eq("projeto_id_snapshot", projetoId),
    supabase.from("cash_ledger").select("valor, moeda")
      .eq("tipo_transacao", "CASHBACK_ESTORNO").eq("status", "CONFIRMADO").eq("projeto_id_snapshot", projetoId),
    supabase.from("cash_ledger").select("valor, moeda")
      .eq("tipo_transacao", "GIRO_GRATIS").eq("status", "CONFIRMADO").eq("projeto_id_snapshot", projetoId),
    supabase.from("cash_ledger").select("valor, moeda")
      .eq("tipo_transacao", "AJUSTE_SALDO").eq("status", "CONFIRMADO").eq("projeto_id_snapshot", projetoId),
    supabase.from("cash_ledger").select("valor, moeda")
      .eq("tipo_transacao", "PERDA_OPERACIONAL").eq("status", "CONFIRMADO").eq("projeto_id_snapshot", projetoId),
    supabase.from("cash_ledger").select("valor, moeda")
      .eq("tipo_transacao", "PERDA_CAMBIAL").eq("status", "CONFIRMADO").eq("projeto_id_snapshot", projetoId),
    supabase.from("cash_ledger").select("valor, moeda")
      .eq("tipo_transacao", "GANHO_CAMBIAL").eq("status", "CONFIRMADO").eq("projeto_id_snapshot", projetoId),
  ]);

  const { data: timelineData } = await supabase
    .from("cash_ledger")
    .select("valor, valor_confirmado, moeda, data_transacao, tipo_transacao")
    .in("tipo_transacao", ["DEPOSITO", "DEPOSITO_VIRTUAL", "SAQUE", "SAQUE_VIRTUAL"])
    .eq("status", "CONFIRMADO")
    .eq("projeto_id_snapshot", projetoId)
    .order("data_transacao", { ascending: true });

  return {
    bookmakerSaldos,
    depositos: (depositos.data || []) as LedgerEntry[],
    saques: (saques.data || []) as LedgerEntry[],
    saquesPendentes: (saquesPend.data || []) as LedgerEntry[],
    reconciliation: {
      cashbackManual: (cashbackM.data || []) as { valor: number; moeda: string }[],
      cashbackEstorno: (cashbackE.data || []) as { valor: number; moeda: string }[],
      girosGratis: (giros.data || []) as { valor: number; moeda: string }[],
      ajusteSaldo: (ajustes.data || []) as { valor: number; moeda: string }[],
      perdaOperacional: (perdasOp.data || []) as { valor: number; moeda: string }[],
      perdaCambial: (perdasFx.data || []) as { valor: number; moeda: string }[],
      ganhoCambial: (ganhosFx.data || []) as { valor: number; moeda: string }[],
    },
    breakEvenTimeline: (timelineData || []) as { valor: number; valor_confirmado?: number | null; moeda: string; data_transacao: string; tipo_transacao: string }[],
  };
}

export function FinancialMetricsPopover({ projetoId }: FinancialMetricsPopoverProps) {
  const { formatCurrency, convertToConsolidationOficial, cotacaoOficialUSD } = useProjetoCurrency(projetoId);

  const { data: rawMetrics, isLoading } = useQuery({
    queryKey: ["projeto-financial-metrics", projetoId],
    queryFn: () => fetchFinancialMetricsRaw(projetoId),
    staleTime: 30_000,
    gcTime: 60_000,
  });

  const metrics = useMemo(() => {
    if (!rawMetrics) return null;

    const saldoCasas = rawMetrics.bookmakerSaldos.reduce(
      (acc, b) => acc + convertToConsolidationOficial(b.saldo_atual, b.moeda), 0
    );
    const depositosTotal = rawMetrics.depositos.reduce(
      (acc, d) => acc + convertToConsolidationOficial(d.valor, d.moeda), 0
    );
    const saquesRecebidos = rawMetrics.saques.reduce(
      (acc, s) => acc + convertToConsolidationOficial(s.valor_confirmado ?? s.valor, s.moeda), 0
    );
    const saquesPendentes = rawMetrics.saquesPendentes.reduce(
      (acc, s) => acc + convertToConsolidationOficial(s.valor, s.moeda), 0
    );
    const ganhoConfirmacao = rawMetrics.saques.reduce((acc, s) => {
      if (s.valor_confirmado != null && s.valor_confirmado !== s.valor) {
        return acc + convertToConsolidationOficial(s.valor_confirmado - s.valor, s.moeda);
      }
      return acc;
    }, 0);

    const r = rawMetrics.reconciliation;
    const sumConvert = (arr: { valor: number; moeda: string }[]) =>
      arr.reduce((acc, e) => acc + convertToConsolidationOficial(e.valor, e.moeda), 0);

    const cashbackLiquido = sumConvert(r.cashbackManual) - sumConvert(r.cashbackEstorno);
    const girosGratis = sumConvert(r.girosGratis);
    const ajustes = sumConvert(r.ajusteSaldo);
    const perdaOp = sumConvert(r.perdaOperacional);
    const perdaFx = sumConvert(r.perdaCambial);
    const ganhoFx = sumConvert(r.ganhoCambial);

    const fluxoCaixaLiquido = saquesRecebidos - depositosTotal;
    const extrasPositivos = cashbackLiquido + girosGratis + ajustes + ganhoConfirmacao + ganhoFx;
    const capitalTotal = depositosTotal + extrasPositivos;
    const fluxoLiquidoAjustado = saquesRecebidos - capitalTotal;

    // Break-even
    let cumulativeFlow = 0;
    let breakEvenDate: string | null = null;
    let firstTransactionDate: string | null = null;
    const timeline = rawMetrics.breakEvenTimeline || [];
    for (const entry of timeline) {
      if (!firstTransactionDate) firstTransactionDate = entry.data_transacao;
      const isSaque = entry.tipo_transacao === "SAQUE" || entry.tipo_transacao === "SAQUE_VIRTUAL";
      const valor = isSaque
        ? convertToConsolidationOficial(entry.valor_confirmado ?? entry.valor, entry.moeda)
        : convertToConsolidationOficial(entry.valor, entry.moeda);
      cumulativeFlow += isSaque ? valor : -valor;
      if (cumulativeFlow >= 0 && !breakEvenDate) breakEvenDate = entry.data_transacao;
      if (cumulativeFlow < 0) breakEvenDate = null;
    }
    const breakEvenDays = breakEvenDate && firstTransactionDate
      ? differenceInDays(parseISO(breakEvenDate), parseISO(firstTransactionDate))
      : null;

    return {
      depositosTotal, saquesRecebidos, saquesPendentes, saldoCasas,
      fluxoCaixaLiquido, fluxoLiquidoAjustado, capitalTotal, extrasPositivos,
      cashbackLiquido, girosGratis, ajustes, ganhoConfirmacao, ganhoFx, perdaOp, perdaFx,
      breakEvenDate, breakEvenDays,
    };
  }, [rawMetrics, convertToConsolidationOficial, cotacaoOficialUSD]);

  if (isLoading || !metrics) {
    return (
      <div className="p-4 space-y-2 w-72">
        <Skeleton className="h-4 w-32" />
        <Skeleton className="h-8 w-full" />
        <Skeleton className="h-8 w-full" />
        <Skeleton className="h-8 w-full" />
      </div>
    );
  }

  const breakEvenReached = metrics.fluxoCaixaLiquido >= 0;

  const items = [
    { label: "Fluxo Líquido Ajustado", value: metrics.fluxoLiquidoAjustado, icon: ArrowRightLeft, highlight: true },
    { label: "Saldo nas Casas", value: metrics.saldoCasas, icon: Wallet },
    { label: "Capital na Operação", value: metrics.capitalTotal, icon: ArrowDownCircle },
    { label: "Depósitos", value: metrics.depositosTotal, icon: ArrowDownCircle },
    { label: "Saques Recebidos", value: metrics.saquesRecebidos, icon: ArrowUpCircle },
    { label: "Saques Pendentes", value: metrics.saquesPendentes, icon: Clock, warning: metrics.saquesPendentes > 0 },
    { label: "Cashback Líquido", value: metrics.cashbackLiquido, icon: Gift },
    { label: "Giros Grátis", value: metrics.girosGratis, icon: BarChart3 },
  ].filter(item => item.highlight || Math.abs(item.value) >= 0.01 || item.label === "Saques Pendentes");

  return (
    <div className="p-3 w-80 space-y-3">
      <div className="flex items-center gap-2">
        <DollarSign className="h-3.5 w-3.5 text-primary" />
        <span className="text-xs font-semibold">Indicadores Financeiros</span>
      </div>

      <div className="space-y-1.5">
        {items.map((item) => {
          const Icon = item.icon;
          const isPositive = item.value >= 0;
          return (
            <div 
              key={item.label} 
              className={`flex items-center justify-between gap-3 py-1 px-2 rounded-md ${
                item.highlight ? "bg-primary/10" : ""
              }`}
            >
              <div className="flex items-center gap-2 min-w-0">
                <Icon className={`h-3 w-3 flex-shrink-0 ${
                  item.warning ? "text-amber-500" : "text-muted-foreground"
                }`} />
                <span className="text-xs text-muted-foreground truncate">{item.label}</span>
              </div>
              <span className={`text-xs font-mono font-semibold flex-shrink-0 ${
                item.highlight 
                  ? isPositive ? "text-emerald-500" : "text-red-500"
                  : "text-foreground"
              }`}>
                {formatCurrency(item.value)}
              </span>
            </div>
          );
        })}
      </div>

      {/* Break Even */}
      <div className="border-t border-border/40 pt-2">
        <div className="flex items-center gap-1.5 mb-1">
          <TrendingUp className={`h-3 w-3 ${breakEvenReached ? "text-emerald-500" : "text-muted-foreground"}`} />
          <span className="text-xs font-semibold">
            {breakEvenReached 
              ? `Break Even em ${metrics.breakEvenDays ?? "—"}d ✓` 
              : "Break Even Pendente"
            }
          </span>
        </div>
        <p className="text-[10px] text-muted-foreground leading-relaxed">
          {breakEvenReached ? (
            <>
              Projeto se pagou em {metrics.breakEvenDays} dias
              {metrics.breakEvenDate && <> ({format(parseISO(metrics.breakEvenDate), "dd/MM/yyyy")})</>}.
            </>
          ) : (
            <>Falta {formatCurrency(Math.abs(metrics.fluxoCaixaLiquido))} em saques para recuperar depósitos.</>
          )}
        </p>
      </div>
    </div>
  );
}
