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
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useProjetoCurrency } from "@/hooks/useProjetoCurrency";

interface ProjetoFinancialMetricsCardProps {
  projetoId: string;
}

interface FinancialMetricsRaw {
  bookmakerSaldos: { saldo_atual: number; moeda: string }[];
  depositosTotal: number;
  saquesRecebidos: number;
  saquesPendentes: number;
}

async function fetchFinancialMetricsRaw(projetoId: string): Promise<FinancialMetricsRaw> {
  // 1. Buscar bookmakers do projeto COM moeda
  const { data: bookmakers } = await supabase
    .from("bookmakers")
    .select("id, saldo_atual, moeda")
    .eq("projeto_id", projetoId);

  const bookmakerIds = (bookmakers || []).map(b => b.id);
  const bookmakerSaldos = (bookmakers || []).map(b => ({ saldo_atual: b.saldo_atual || 0, moeda: b.moeda || "BRL" }));

  if (bookmakerIds.length === 0) {
    return { bookmakerSaldos: [], depositosTotal: 0, saquesRecebidos: 0, saquesPendentes: 0 };
  }

  // 2-4: Buscar ledger em paralelo
  const [depositos, saques, saquesPend] = await Promise.all([
    supabase
      .from("cash_ledger")
      .select("valor, moeda")
      .in("tipo_transacao", ["DEPOSITO", "DEPOSITO_VIRTUAL"])
      .eq("status", "CONFIRMADO")
      .in("destino_bookmaker_id", bookmakerIds)
      .eq("projeto_id_snapshot", projetoId),
    supabase
      .from("cash_ledger")
      .select("valor, valor_confirmado, moeda")
      .in("tipo_transacao", ["SAQUE", "SAQUE_VIRTUAL"])
      .eq("status", "CONFIRMADO")
      .in("origem_bookmaker_id", bookmakerIds)
      .eq("projeto_id_snapshot", projetoId),
    supabase
      .from("cash_ledger")
      .select("valor, moeda")
      .in("tipo_transacao", ["SAQUE", "SAQUE_VIRTUAL"])
      .eq("status", "PENDENTE")
      .in("origem_bookmaker_id", bookmakerIds)
      .eq("projeto_id_snapshot", projetoId),
  ]);

  // Retornar dados brutos — conversão será feita no componente com acesso às cotações
  const depositosTotal = (depositos.data || []).reduce((acc, d) => acc + (d.valor || 0), 0);
  const saquesRecebidos = (saques.data || []).reduce((acc, s) => acc + (s.valor_confirmado ?? s.valor ?? 0), 0);
  const saquesPendentes = (saquesPend.data || []).reduce((acc, s) => acc + (s.valor || 0), 0);

  return { bookmakerSaldos, depositosTotal, saquesRecebidos, saquesPendentes };
}

export function ProjetoFinancialMetricsCard({ projetoId }: ProjetoFinancialMetricsCardProps) {
  const { formatCurrency, convertToConsolidationOficial, cotacaoOficialUSD } = useProjetoCurrency(projetoId);

  const { data: rawMetrics, isLoading } = useQuery({
    queryKey: ["projeto-financial-metrics", projetoId],
    queryFn: () => fetchFinancialMetricsRaw(projetoId),
    staleTime: 30_000,
    gcTime: 60_000,
  });

  // Calcular métricas com conversão de moeda
  const metrics = useMemo(() => {
    if (!rawMetrics) return null;

    // Converter saldo de cada bookmaker para moeda de consolidação
    const saldoCasas = rawMetrics.bookmakerSaldos.reduce(
      (acc, b) => acc + convertToConsolidationOficial(b.saldo_atual, b.moeda),
      0
    );

    // Depósitos e saques já estão na moeda da transação — por ora assumem BRL
    // TODO: converter ledger entries individualmente se multi-moeda
    const { depositosTotal, saquesRecebidos, saquesPendentes } = rawMetrics;

    const lucroRealizado = saquesRecebidos - depositosTotal;
    const lucroPotencial = saldoCasas - depositosTotal;
    const lucroTotal = (saldoCasas + saquesRecebidos) - depositosTotal;

    return {
      depositosTotal,
      saquesRecebidos,
      saquesPendentes,
      saldoCasas,
      lucroRealizado,
      lucroPotencial,
      lucroTotal,
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

  const items = [
    {
      label: "Lucro Total",
      value: metrics.lucroTotal,
      icon: TrendingUp,
      tooltip: "Patrimônio Total - Depósitos = (Saldo nas Casas + Saques Recebidos) - Depósitos",
      primary: true,
    },
    {
      label: "Lucro Realizado",
      value: metrics.lucroRealizado,
      icon: ArrowUpCircle,
      tooltip: "Saques Recebidos - Depósitos. Dinheiro que efetivamente voltou ao caixa.",
    },
    {
      label: "Lucro Potencial",
      value: metrics.lucroPotencial,
      icon: Wallet,
      tooltip: "Saldo nas Casas - Depósitos. Lucro que seria realizado se todo saldo fosse sacado agora.",
    },
    {
      label: "Saldo nas Casas",
      value: metrics.saldoCasas,
      icon: DollarSign,
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
              <p className="font-semibold mb-1">Separação Operacional × Financeiro</p>
              <p>Estes indicadores medem o fluxo de caixa real (depósitos e saques confirmados). Bônus e performance operacional são métricas separadas na aba Bônus.</p>
            </TooltipContent>
          </Tooltip>
        </div>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2.5">
          {items.map((item) => {
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
      </CardContent>
    </Card>
  );
}
