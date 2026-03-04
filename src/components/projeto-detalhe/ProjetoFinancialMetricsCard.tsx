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

interface ProjetoFinancialMetricsCardProps {
  projetoId: string;
  formatCurrency: (value: number) => string;
}

interface FinancialMetrics {
  depositosTotal: number;
  saquesRecebidos: number;
  saquesPendentes: number;
  saldoCasas: number;
  lucroRealizado: number;
  lucroPotencial: number;
  lucroTotal: number;
  patrimonioTotal: number;
}

async function fetchFinancialMetrics(projetoId: string): Promise<FinancialMetrics> {
  // 1. Buscar bookmakers do projeto
  const { data: bookmakers } = await supabase
    .from("bookmakers")
    .select("id, saldo_atual")
    .eq("projeto_id", projetoId);

  const bookmakerIds = (bookmakers || []).map(b => b.id);
  const saldoCasas = (bookmakers || []).reduce((acc, b) => acc + (b.saldo_atual || 0), 0);

  if (bookmakerIds.length === 0) {
    return {
      depositosTotal: 0,
      saquesRecebidos: 0,
      saquesPendentes: 0,
      saldoCasas: 0,
      lucroRealizado: 0,
      lucroPotencial: 0,
      lucroTotal: 0,
      patrimonioTotal: 0,
    };
  }

  // 2. Buscar depósitos confirmados (destino = bookmaker do projeto)
  const { data: depositos } = await supabase
    .from("cash_ledger")
    .select("valor")
    .eq("tipo_transacao", "DEPOSITO")
    .eq("status", "CONFIRMADO")
    .in("destino_bookmaker_id", bookmakerIds);

  const depositosTotal = (depositos || []).reduce((acc, d) => acc + (d.valor || 0), 0);

  // 3. Buscar saques confirmados (origem = bookmaker do projeto)
  const { data: saques } = await supabase
    .from("cash_ledger")
    .select("valor, valor_confirmado")
    .eq("tipo_transacao", "SAQUE")
    .eq("status", "CONFIRMADO")
    .in("origem_bookmaker_id", bookmakerIds);

  const saquesRecebidos = (saques || []).reduce((acc, s) => acc + (s.valor_confirmado ?? s.valor ?? 0), 0);

  // 4. Buscar saques pendentes
  const { data: saquesPend } = await supabase
    .from("cash_ledger")
    .select("valor")
    .eq("tipo_transacao", "SAQUE")
    .eq("status", "PENDENTE")
    .in("origem_bookmaker_id", bookmakerIds);

  const saquesPendentes = (saquesPend || []).reduce((acc, s) => acc + (s.valor || 0), 0);

  // 5. Calcular métricas derivadas
  const lucroRealizado = saquesRecebidos - depositosTotal;
  const lucroPotencial = saldoCasas - depositosTotal;
  const patrimonioTotal = saldoCasas + saquesRecebidos;
  const lucroTotal = patrimonioTotal - depositosTotal;

  return {
    depositosTotal,
    saquesRecebidos,
    saquesPendentes,
    saldoCasas,
    lucroRealizado,
    lucroPotencial,
    lucroTotal,
    patrimonioTotal,
  };
}

export function ProjetoFinancialMetricsCard({ projetoId, formatCurrency }: ProjetoFinancialMetricsCardProps) {
  const { data: metrics, isLoading } = useQuery({
    queryKey: ["projeto-financial-metrics", projetoId],
    queryFn: () => fetchFinancialMetrics(projetoId),
    staleTime: 30_000,
    gcTime: 60_000,
  });

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
      tooltip: "Soma dos saldos atuais de todas as bookmakers vinculadas ao projeto.",
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
    {
      label: "Patrimônio Total",
      value: metrics.patrimonioTotal,
      icon: TrendingUp,
      tooltip: "Saldo nas Casas + Saques Recebidos. Todo o capital gerado pela operação.",
      neutral: true,
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
