import { useMemo } from "react";
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
  ajusteSaldo: { valor: number; moeda: string }[];
  perdaOperacional: { valor: number; moeda: string }[];
  perdaCambial: { valor: number; moeda: string }[];
  ganhoCambial: { valor: number; moeda: string }[];
}

interface FinancialMetricsRaw {
  bookmakerSaldos: { saldo_atual: number; moeda: string }[];
  depositos: LedgerEntry[];
  saques: LedgerEntry[];
  saquesPendentes: LedgerEntry[];
  reconciliation: ReconciliationRaw;
}

async function fetchFinancialMetricsRaw(projetoId: string): Promise<FinancialMetricsRaw> {
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
    // Reconciliation components
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
    const saquesRecebidos = rawMetrics.saques.reduce(
      (acc, s) => acc + convertToConsolidationOficial(s.valor_confirmado ?? s.valor, s.moeda), 0
    );
    const saquesPendentes = rawMetrics.saquesPendentes.reduce(
      (acc, s) => acc + convertToConsolidationOficial(s.valor, s.moeda), 0
    );

    // Ganho de confirmação: diferença entre valor_confirmado e valor nos saques
    const ganhoConfirmacao = rawMetrics.saques.reduce((acc, s) => {
      if (s.valor_confirmado != null && s.valor_confirmado !== s.valor) {
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
    const ajustes = sumConvert(r.ajusteSaldo);
    const perdaOp = sumConvert(r.perdaOperacional);
    const perdaFx = sumConvert(r.perdaCambial);
    const ganhoFx = sumConvert(r.ganhoCambial);

    const fluxoCaixaLiquido = saquesRecebidos - depositosTotal;
    const lucroTotal = (saldoCasas + saquesRecebidos) - depositosTotal;

    // Extras = tudo que não é aposta mas impacta fluxo de caixa
    const totalExtras = cashbackLiquido + girosGratis + ajustes + ganhoConfirmacao + ganhoFx - perdaOp - perdaFx;

    return {
      depositosTotal,
      saquesRecebidos,
      saquesPendentes,
      saldoCasas,
      fluxoCaixaLiquido,
      lucroTotal,
      // Reconciliation items
      cashbackLiquido,
      girosGratis,
      ajustes,
      ganhoConfirmacao,
      ganhoFx,
      perdaOp,
      perdaFx,
      totalExtras,
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

  const mainItems = [
    {
      label: "Lucro Total",
      value: metrics.lucroTotal,
      icon: TrendingUp,
      tooltip: "Patrimônio Total - Depósitos = (Saldo Casas + Saques Recebidos) - Depósitos. Inclui saldo ainda nas casas.",
      primary: true,
    },
    {
      label: "Fluxo Líquido",
      value: metrics.fluxoCaixaLiquido,
      icon: ArrowRightLeft,
      tooltip: "Saques Recebidos - Depósitos. Dinheiro que efetivamente voltou ao caixa. Inclui cashback, giros e ajustes (veja a conciliação abaixo).",
    },
    {
      label: "Saldo nas Casas",
      value: metrics.saldoCasas,
      icon: Wallet,
      tooltip: "Soma dos saldos atuais de todas as bookmakers (convertidos para moeda de consolidação).",
      neutral: true,
    },
    {
      label: "Depósitos",
      value: metrics.depositosTotal,
      icon: ArrowDownCircle,
      tooltip: "Total de depósitos confirmados nas bookmakers do projeto.",
      neutral: true,
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
    { label: "Ajustes/FX", value: metrics.ajustes + metrics.ganhoFx - metrics.perdaFx, icon: ArrowRightLeft },
    { label: "Perdas Operacionais", value: -metrics.perdaOp, icon: ArrowDownCircle },
  ].filter(item => Math.abs(item.value) >= 0.01);

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
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-2.5">
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
                    <span className="text-muted-foreground text-[10px] mt-1 text-center leading-tight">
                      {item.label}
                    </span>
                  </div>
                </TooltipTrigger>
                <TooltipContent side="top" className="text-xs max-w-xs">
                  {item.tooltip}
                </TooltipContent>
              </Tooltip>
            );
          })}
        </div>

        {/* Reconciliation breakdown */}
        {reconciliationItems.length > 0 && (
          <div className="rounded-lg border border-border/40 bg-muted/20 px-3 py-2.5">
            <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">
              Conciliação: Composição do Fluxo Líquido
            </p>
            <div className="space-y-1">
              {reconciliationItems.map((item) => {
                const isPositive = item.value >= 0;
                return (
                  <div key={item.label} className="flex items-center justify-between text-xs">
                    <div className="flex items-center gap-1.5 text-muted-foreground">
                      <item.icon className="h-3 w-3" />
                      <span>{item.label}</span>
                    </div>
                    <span className={`font-mono font-medium ${isPositive ? "text-emerald-500" : "text-red-500"}`}>
                      {isPositive ? "+" : ""}{formatCurrency(item.value)}
                    </span>
                  </div>
                );
              })}
              <div className="border-t border-border/40 pt-1 mt-1 flex items-center justify-between text-xs">
                <span className="text-muted-foreground font-medium">Total Extras (fora apostas)</span>
                <span className={`font-mono font-bold ${metrics.totalExtras >= 0 ? "text-emerald-500" : "text-red-500"}`}>
                  {metrics.totalExtras >= 0 ? "+" : ""}{formatCurrency(metrics.totalExtras)}
                </span>
              </div>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
