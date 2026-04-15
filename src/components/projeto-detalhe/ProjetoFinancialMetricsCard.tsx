import { useMemo } from "react";
import { differenceInDays, parseISO, format } from "date-fns";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Skeleton } from "@/components/ui/skeleton";
import {
  DollarSign,
  ArrowDownCircle,
  ArrowUpCircle,
  Wallet,
  TrendingUp,
  Clock,
  Info,
  BarChart3,
  Gift,
  ArrowRightLeft,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useProjetoCurrency } from "@/hooks/useProjetoCurrency";

interface ProjetoFinancialMetricsCardProps {
  projetoId: string;
}

interface LedgerEntry {
  valor: number;
  valor_confirmado?: number | null;
  moeda: string;
}

interface ReconciliationRaw {
  cashbackManual: { valor: number; moeda: string }[];
  cashbackEstorno: { valor: number; moeda: string }[];
  girosGratis: { valor: number; moeda: string }[];
  ajusteSaldo: { valor: number; moeda: string; ajuste_direcao?: string | null }[];
  perdaOperacional: { valor: number; moeda: string }[];
  perdaCambial: { valor: number; moeda: string }[];
  ganhoCambial: { valor: number; moeda: string }[];
}

interface DatedLedgerEntry {
  valor: number;
  valor_confirmado?: number | null;
  moeda: string;
  data_transacao: string;
  tipo_transacao: string;
}

interface FinancialMetricsRaw {
  bookmakerSaldos: { saldo_atual: number; moeda: string }[];
  depositos: (LedgerEntry & { tipo_transacao: string })[];
  saques: (LedgerEntry & { tipo_moeda?: string | null })[];
  saquesPendentes: LedgerEntry[];
  reconciliation: ReconciliationRaw;
  breakEvenTimeline: DatedLedgerEntry[];
}

async function fetchFinancialMetricsRaw(projetoId: string): Promise<FinancialMetricsRaw> {
  const { data: bookmakers } = await supabase
    .from("bookmakers")
    .select("id, saldo_atual, moeda")
    .eq("projeto_id", projetoId);

  const bookmakerSaldos = (bookmakers || []).map(b => ({ saldo_atual: b.saldo_atual || 0, moeda: b.moeda || "BRL" }));

  const [depositos, saques, saquesPend, cashbackM, cashbackE, giros, ajustes, perdasOp, perdasFx, ganhosFx] = await Promise.all([
    supabase.from("cash_ledger").select("valor, moeda, tipo_transacao")
      .in("tipo_transacao", ["DEPOSITO", "DEPOSITO_VIRTUAL"])
      .eq("status", "CONFIRMADO").eq("projeto_id_snapshot", projetoId).limit(10000),
    supabase.from("cash_ledger").select("valor, valor_confirmado, moeda, tipo_moeda")
      .in("tipo_transacao", ["SAQUE", "SAQUE_VIRTUAL"])
      .eq("status", "CONFIRMADO").eq("projeto_id_snapshot", projetoId).limit(10000),
    supabase.from("cash_ledger").select("valor, moeda")
      .in("tipo_transacao", ["SAQUE", "SAQUE_VIRTUAL"])
      .eq("status", "PENDENTE").eq("projeto_id_snapshot", projetoId).limit(10000),
    // Reconciliation components
    supabase.from("cash_ledger").select("valor, moeda")
      .eq("tipo_transacao", "CASHBACK_MANUAL").eq("status", "CONFIRMADO").eq("projeto_id_snapshot", projetoId).limit(10000),
    supabase.from("cash_ledger").select("valor, moeda")
      .eq("tipo_transacao", "CASHBACK_ESTORNO").eq("status", "CONFIRMADO").eq("projeto_id_snapshot", projetoId).limit(10000),
    supabase.from("cash_ledger").select("valor, moeda")
      .eq("tipo_transacao", "GIRO_GRATIS").eq("status", "CONFIRMADO").eq("projeto_id_snapshot", projetoId).limit(10000),
    supabase.from("cash_ledger").select("valor, moeda, ajuste_direcao")
      .eq("tipo_transacao", "AJUSTE_SALDO").eq("status", "CONFIRMADO").eq("projeto_id_snapshot", projetoId).limit(10000),
    supabase.from("cash_ledger").select("valor, moeda")
      .eq("tipo_transacao", "PERDA_OPERACIONAL").eq("status", "CONFIRMADO").eq("projeto_id_snapshot", projetoId).limit(10000),
    supabase.from("cash_ledger").select("valor, moeda")
      .eq("tipo_transacao", "PERDA_CAMBIAL").eq("status", "CONFIRMADO").eq("projeto_id_snapshot", projetoId).limit(10000),
    supabase.from("cash_ledger").select("valor, moeda")
      .eq("tipo_transacao", "GANHO_CAMBIAL").eq("status", "CONFIRMADO").eq("projeto_id_snapshot", projetoId).limit(10000),
  ]);

  // Timeline: all deposits and withdrawals with dates for break-even calculation
  const { data: timelineData } = await supabase
    .from("cash_ledger")
    .select("valor, valor_confirmado, moeda, data_transacao, tipo_transacao")
    .in("tipo_transacao", ["DEPOSITO", "DEPOSITO_VIRTUAL", "SAQUE", "SAQUE_VIRTUAL"])
    .eq("status", "CONFIRMADO")
    .eq("projeto_id_snapshot", projetoId)
    .order("data_transacao", { ascending: true })
    .limit(10000);

  return {
    bookmakerSaldos,
    depositos: (depositos.data || []) as (LedgerEntry & { tipo_transacao: string })[],
    saques: (saques.data || []) as (LedgerEntry & { tipo_moeda?: string | null })[],
    saquesPendentes: (saquesPend.data || []) as LedgerEntry[],
    reconciliation: {
      cashbackManual: (cashbackM.data || []) as { valor: number; moeda: string }[],
      cashbackEstorno: (cashbackE.data || []) as { valor: number; moeda: string }[],
      girosGratis: (giros.data || []) as { valor: number; moeda: string }[],
      ajusteSaldo: (ajustes.data || []) as { valor: number; moeda: string; ajuste_direcao?: string | null }[],
      perdaOperacional: (perdasOp.data || []) as { valor: number; moeda: string }[],
      perdaCambial: (perdasFx.data || []) as { valor: number; moeda: string }[],
      ganhoCambial: (ganhosFx.data || []) as { valor: number; moeda: string }[],
    },
    breakEvenTimeline: (timelineData || []) as DatedLedgerEntry[],
  };
}

export function ProjetoFinancialMetricsCard({ projetoId }: ProjetoFinancialMetricsCardProps) {
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
    const depositosReais = rawMetrics.depositos
      .filter(d => d.tipo_transacao === 'DEPOSITO')
      .reduce((acc, d) => acc + convertToConsolidationOficial(d.valor, d.moeda), 0);
    const saquesRecebidos = rawMetrics.saques.reduce(
      (acc, s) => acc + convertToConsolidationOficial(s.valor_confirmado ?? s.valor, s.moeda), 0
    );
    const saquesPendentes = rawMetrics.saquesPendentes.reduce(
      (acc, s) => acc + convertToConsolidationOficial(s.valor, s.moeda), 0
    );

    // Ganho de confirmação: diferença entre valor_confirmado e valor nos saques
    // Exclude crypto: valor_confirmado stores raw crypto amount, not fiat equivalent
    const ganhoConfirmacao = rawMetrics.saques.reduce((acc, s) => {
      if (s.tipo_moeda === 'CRYPTO') return acc;
      if (s.valor_confirmado != null && Math.abs(s.valor_confirmado - s.valor) >= 0.01) {
        return acc + convertToConsolidationOficial(s.valor_confirmado - s.valor, s.moeda);
      }
      return acc;
    }, 0);

    // Reconciliation
    const r = rawMetrics.reconciliation;
    const sumConvert = (arr: { valor: number; moeda: string }[]) =>
      arr.reduce((acc, e) => acc + convertToConsolidationOficial(e.valor, e.moeda), 0);

    const cashbackLiquido = sumConvert(r.cashbackManual) - sumConvert(r.cashbackEstorno);
    const girosGratis = sumConvert(r.girosGratis);
    const ajustes = r.ajusteSaldo.reduce((acc, e) => {
      const sinal = e.ajuste_direcao === 'SAIDA' ? -1 : 1;
      return acc + convertToConsolidationOficial(e.valor * sinal, e.moeda);
    }, 0);
    const perdaOp = sumConvert(r.perdaOperacional);
    const perdaFx = sumConvert(r.perdaCambial);
    const ganhoFx = sumConvert(r.ganhoCambial);

    const fluxoCaixaLiquido = saquesRecebidos - depositosTotal;
    const lucroTotal = (saldoCasas + saquesRecebidos) - depositosTotal;

    // Extras = tudo que não é aposta mas impacta fluxo de caixa
    const totalExtras = cashbackLiquido + girosGratis + ajustes + ganhoConfirmacao + ganhoFx - perdaOp - perdaFx;

    // Break-even calculation: find when cumulative saques first exceeded cumulative deposits
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
      
      if (cumulativeFlow >= 0 && !breakEvenDate) {
        breakEvenDate = entry.data_transacao;
      }
      // Reset if it goes negative again (we want the LAST time it crossed zero and stayed)
      if (cumulativeFlow < 0) {
        breakEvenDate = null;
      }
    }

    const breakEvenDays = breakEvenDate && firstTransactionDate
      ? differenceInDays(parseISO(breakEvenDate), parseISO(firstTransactionDate))
      : null;

    return {
      depositosTotal, depositosReais,
      saquesRecebidos,
      saquesPendentes,
      saldoCasas,
      fluxoCaixaLiquido,
      lucroTotal,
      cashbackLiquido,
      girosGratis,
      ajustes,
      ganhoConfirmacao,
      ganhoFx,
      perdaOp,
      perdaFx,
      totalExtras,
      breakEvenDate,
      breakEvenDays,
    };
  }, [rawMetrics, convertToConsolidationOficial, cotacaoOficialUSD]);

  if (isLoading || !metrics) {
    return (
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <DollarSign className="h-4 w-4 text-primary" />
            Indicadores Financeiros
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {[1, 2, 3, 4].map(i => <Skeleton key={i} className="h-20" />)}
          </div>
        </CardContent>
      </Card>
    );
  }

    // Créditos Extras = receita operacional (bônus, cashback, giros, ajustes, FX)
    const extrasPositivos = metrics.cashbackLiquido + metrics.girosGratis + metrics.ajustes + metrics.ganhoConfirmacao + metrics.ganhoFx;
    // Fluxo Líquido Ajustado = Saques - Depósitos (fórmula canônica de fluxo de caixa)
    const fluxoLiquidoAjustado = metrics.saquesRecebidos - metrics.depositosTotal;
    // Lucro Operacional Puro = Patrimônio - Depósitos
    const lucroOperacionalPuro = (metrics.saldoCasas + metrics.saquesRecebidos) - metrics.depositosTotal;

    const breakEvenReached = metrics.fluxoCaixaLiquido >= 0;

    const mainItems = [
    {
      label: "Fluxo Líquido Ajustado",
      value: fluxoLiquidoAjustado,
      icon: ArrowRightLeft,
      richFluxoTooltip: true,
      primary: true,
    },
    {
      label: "Saldo nas Casas",
      value: metrics.saldoCasas,
      icon: Wallet,
      tooltip: "Soma dos saldos atuais de todas as bookmakers (convertidos para moeda de consolidação).",
      neutral: true,
    },
    {
      label: "Capital na Operação",
      value: metrics.depositosTotal,
      icon: ArrowDownCircle,
      richTooltip: true,
      neutral: true,
      composite: true,
      compositeValues: {
        depositos: metrics.depositosTotal,
        extras: extrasPositivos,
      },
    },
    {
      label: "Saques Recebidos",
      value: metrics.saquesRecebidos,
      icon: ArrowUpCircle,
      tooltip: "Total de saques confirmados (dinheiro que voltou ao caixa).",
      neutral: true,
    },
    {
      label: "Saques Pendentes",
      value: metrics.saquesPendentes,
      icon: Clock,
      tooltip: "Saques solicitados mas ainda não recebidos. Capital em trânsito.",
      neutral: true,
      warning: metrics.saquesPendentes > 0,
    },
  ];

  // Reconciliation items for breakdown
  const reconciliationItems = [
    { label: "Cashback Líquido", value: metrics.cashbackLiquido, icon: Gift },
    { label: "Giros Grátis", value: metrics.girosGratis, icon: BarChart3 },
    { label: "Ganho Confirmação", value: metrics.ganhoConfirmacao, icon: ArrowUpCircle },
    { label: "Ajustes de Saldo/FX", value: metrics.ajustes + metrics.ganhoFx - metrics.perdaFx, icon: ArrowRightLeft },
    { label: "Perdas Operacionais", value: -metrics.perdaOp, icon: ArrowDownCircle },
  ].filter(item => Math.abs(item.value) >= 0.01);

  const lucroApenas = lucroOperacionalPuro;

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <DollarSign className="h-4 w-4 text-primary" />
            Indicadores Financeiros Reais
          </CardTitle>
          <Tooltip>
            <TooltipTrigger>
              <Info className="h-3.5 w-3.5 text-muted-foreground" />
            </TooltipTrigger>
            <TooltipContent side="left" className="max-w-xs text-xs">
              <p className="font-semibold mb-1">Fluxo de Caixa Real</p>
              <p>Estes indicadores medem o fluxo de caixa real (depósitos e saques confirmados). O "Fluxo Líquido" inclui cashback e ajustes além do lucro das apostas — veja a conciliação abaixo para o detalhamento.</p>
            </TooltipContent>
          </Tooltip>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {/* Main metrics grid */}
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-2.5">
          {mainItems.map((item) => {
            const Icon = item.icon;
            const isPositive = item.value >= 0;
            const colorClass = item.neutral
              ? "text-foreground"
              : isPositive
              ? "text-emerald-500"
              : "text-red-500";

            return (
              <Tooltip key={item.label}>
                <TooltipTrigger asChild>
                  <div
                    className={`flex flex-col items-center justify-center rounded-xl px-3 py-3 border transition-colors ${
                      item.primary
                        ? "bg-gradient-to-br from-primary/10 to-primary/5 border-primary/20"
                        : item.warning
                        ? "bg-amber-500/5 border-amber-500/20"
                        : "bg-muted/40 border-border/30"
                    }`}
                  >
                    <Icon className={`h-4 w-4 mb-1.5 ${
                      item.warning ? "text-amber-500" : item.neutral ? "text-muted-foreground" : colorClass
                    }`} />
                    <span className={`font-bold tabular-nums text-base ${colorClass}`}>
                      {formatCurrency(item.value)}
                    </span>
                    {(item as any).composite && (item as any).compositeValues && (
                      <div className="flex items-center gap-1 mt-0.5">
                        <span className="text-muted-foreground text-[9px] tabular-nums">
                          {formatCurrency((item as any).compositeValues.depositos)}
                        </span>
                        <span className="text-emerald-500 text-[9px] tabular-nums">
                          +{formatCurrency((item as any).compositeValues.extras)}
                        </span>
                      </div>
                    )}
                    <span className="text-muted-foreground text-[10px] mt-1 text-center leading-tight">
                      {item.label}
                    </span>
                  </div>
                </TooltipTrigger>
                {(item as any).richFluxoTooltip ? (
                  <TooltipContent side="top" className="text-xs max-w-sm p-3">
                    <p className="font-semibold mb-2">Fluxo Líquido Ajustado</p>
                    <div className="space-y-1.5">
                      <div className="flex justify-between gap-6">
                        <span className="text-muted-foreground">Saques Recebidos</span>
                        <span className="font-mono">{formatCurrency(metrics.saquesRecebidos)}</span>
                      </div>
                      <div className="flex justify-between gap-6">
                        <span className="text-muted-foreground">Depósitos Reais</span>
                        <span className="font-mono">−{formatCurrency(metrics.depositosReais)}</span>
                      </div>
                      <div className="border-t border-border/40 pt-1.5 mt-1">
                        <div className="flex justify-between gap-6 font-medium">
                          <span>Resultado</span>
                          <span className={`font-mono font-bold ${fluxoLiquidoAjustado >= 0 ? "text-emerald-500" : "text-red-500"}`}>
                            {formatCurrency(fluxoLiquidoAjustado)}
                          </span>
                        </div>
                      </div>
                    </div>
                    {/* Break Even section */}
                    <div className="border-t border-border/40 mt-2 pt-2">
                      <div className="flex items-center gap-1.5 mb-1">
                        <TrendingUp className={`h-3 w-3 ${breakEvenReached ? "text-emerald-500" : "text-muted-foreground"}`} />
                        <span className="font-semibold">
                          {breakEvenReached ? "Break Even Atingido" : "Break Even Pendente"}
                        </span>
                      </div>
                      {breakEvenReached ? (
                        <p className="text-muted-foreground leading-relaxed">
                          O projeto se pagou em <span className="text-foreground font-medium">{metrics.breakEvenDays ?? "—"} dias</span>
                          {metrics.breakEvenDate && (
                            <> ({format(parseISO(metrics.breakEvenDate), "dd/MM/yyyy")})</>
                          )}. Saques ({formatCurrency(metrics.saquesRecebidos)}) já superaram Depósitos ({formatCurrency(metrics.depositosTotal)}).
                        </p>
                      ) : (
                        <p className="text-muted-foreground leading-relaxed">
                          Falta <span className="text-foreground font-medium">{formatCurrency(Math.abs(metrics.fluxoCaixaLiquido))}</span> em saques para recuperar os depósitos ({formatCurrency(metrics.depositosTotal)}).
                        </p>
                      )}
                    </div>
                  </TooltipContent>
                ) : (item as any).richTooltip ? (
                  <TooltipContent side="top" className="text-xs max-w-sm p-3">
                    <p className="font-semibold mb-2">Capital na Operação</p>
                    <div className="space-y-1">
                      <div className="flex justify-between gap-4">
                        <span className="text-muted-foreground">Depósitos</span>
                        <span className="font-mono">{formatCurrency(metrics.depositosTotal)}</span>
                      </div>
                      {reconciliationItems.map((ri) => {
                        const riPositive = ri.value >= 0;
                        return (
                          <div key={ri.label} className="flex justify-between gap-4">
                            <span className="text-muted-foreground">{ri.label}</span>
                            <span className={`font-mono ${riPositive ? "text-emerald-500" : "text-red-500"}`}>
                              {riPositive ? "+" : ""}{formatCurrency(ri.value)}
                            </span>
                          </div>
                        );
                      })}
                      <div className="border-t border-border/40 pt-1 mt-1 space-y-1">
                        <div className="flex justify-between gap-4 font-medium">
                          <span>Total Créditos Extras</span>
                          <span className={`font-mono font-bold ${metrics.totalExtras >= 0 ? "text-emerald-500" : "text-red-500"}`}>
                            {metrics.totalExtras >= 0 ? "+" : ""}{formatCurrency(metrics.totalExtras)}
                          </span>
                        </div>
                        <div className="flex justify-between gap-4 font-medium">
                          <span>Lucro Puro (só apostas)</span>
                          <span className={`font-mono font-bold ${lucroApenas >= 0 ? "text-emerald-500" : "text-red-500"}`}>
                            {formatCurrency(lucroApenas)}
                          </span>
                        </div>
                      </div>
                    </div>
                  </TooltipContent>
                ) : (
                  <TooltipContent side="top" className="text-xs max-w-xs">
                    {item.tooltip}
                  </TooltipContent>
                )}
              </Tooltip>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
