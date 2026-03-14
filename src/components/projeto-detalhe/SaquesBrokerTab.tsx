import { useState, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useWorkspace } from "@/hooks/useWorkspace";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  ArrowDownToLine,
  ArrowUpFromLine,
  TrendingUp,
  Wallet,
  Search,
  Clock,
  CheckCircle2,
  Package,
  Info,
  ArrowRightLeft,
  Filter,
  CalendarDays,
} from "lucide-react";
import { toast } from "sonner";

interface SaquesBrokerTabProps {
  projetoId: string;
}

type TransactionType = "DEPOSITO" | "DEPOSITO_VIRTUAL" | "SAQUE" | "SAQUE_VIRTUAL" | "AJUSTE";

interface BrokerTransaction {
  id: string;
  tipo_transacao: string;
  valor: number;
  moeda: string;
  status: string;
  data_transacao: string;
  created_at: string;
  descricao: string | null;
  bookmaker_nome: string | null;
  bookmaker_id: string | null;
  investidor_nome: string | null;
  is_investor_account: boolean;
  origem_tipo: string | null;
  destino_tipo: string | null;
}

interface BrokerFlowMetrics {
  depositosTotal: number;
  depositosInternos: number;
  depositosInvestidor: number;
  saquesTotal: number;
  saquesInternos: number;
  saquesInvestidor: number;
  saldoCasas: number;
  saldoInternos: number;
  saldoInvestidor: number;
  contasAguardando: number;
}

function formatCurrency(value: number, moeda: string = "BRL") {
  const prefix = moeda === "USD" ? "$" : moeda === "EUR" ? "€" : "R$";
  return `${prefix} ${value.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function getTransactionIcon(tipo: string) {
  if (tipo.includes("DEPOSITO")) return <ArrowDownToLine className="h-3.5 w-3.5 text-red-400" />;
  if (tipo.includes("SAQUE")) return <ArrowUpFromLine className="h-3.5 w-3.5 text-emerald-400" />;
  return <ArrowRightLeft className="h-3.5 w-3.5 text-blue-400" />;
}

function getTransactionLabel(tipo: string) {
  switch (tipo) {
    case "DEPOSITO": return "Depósito";
    case "DEPOSITO_VIRTUAL": return "Depósito Virtual";
    case "SAQUE": return "Saque";
    case "SAQUE_VIRTUAL": return "Saque Virtual";
    default: return tipo;
  }
}

function getStatusBadge(status: string) {
  switch (status) {
    case "CONFIRMADO":
      return <Badge className="bg-emerald-500/15 text-emerald-400 border-emerald-500/20 text-[10px]">Confirmado</Badge>;
    case "PENDENTE":
      return <Badge className="bg-amber-500/15 text-amber-400 border-amber-500/20 text-[10px]">Pendente</Badge>;
    case "EM_TRANSITO":
      return <Badge className="bg-blue-500/15 text-blue-400 border-blue-500/20 text-[10px]">Em Trânsito</Badge>;
    case "CANCELADO":
      return <Badge className="bg-red-500/15 text-red-400 border-red-500/20 text-[10px]">Cancelado</Badge>;
    default:
      return <Badge variant="outline" className="text-[10px]">{status}</Badge>;
  }
}

function useBrokerExtrato(projetoId: string) {
  const { workspaceId } = useWorkspace();

  // Full transaction history
  const historyQuery = useQuery({
    queryKey: ["broker-extrato-history", projetoId],
    queryFn: async () => {
      // Get investor bookmaker IDs
      const { data: investorBks } = await supabase
        .from("bookmakers")
        .select("id, investidor_id")
        .eq("workspace_id", workspaceId!)
        .not("investidor_id", "is", null);
      const investorBkIds = new Set((investorBks || []).map((b: any) => b.id));

      // Get all ledger entries for this project
      const { data: ledger, error } = await supabase
        .from("cash_ledger")
        .select(`
          id, tipo_transacao, valor, moeda, status, data_transacao, created_at, descricao,
          origem_bookmaker_id, destino_bookmaker_id, origem_tipo, destino_tipo
        `)
        .eq("projeto_id_snapshot", projetoId)
        .in("tipo_transacao", ["DEPOSITO", "DEPOSITO_VIRTUAL", "SAQUE", "SAQUE_VIRTUAL"])
        .order("data_transacao", { ascending: false });

      if (error) throw error;

      // Get bookmaker names
      const bmIds = new Set<string>();
      (ledger || []).forEach((e: any) => {
        if (e.origem_bookmaker_id) bmIds.add(e.origem_bookmaker_id);
        if (e.destino_bookmaker_id) bmIds.add(e.destino_bookmaker_id);
      });

      let bmMap: Record<string, { nome: string; investidor_nome: string | null }> = {};
      if (bmIds.size > 0) {
        const { data: bms } = await supabase
          .from("bookmakers")
          .select("id, nome, instance_identifier, investidores(nome)")
          .in("id", Array.from(bmIds));
        (bms || []).forEach((b: any) => {
          bmMap[b.id] = {
            nome: b.instance_identifier ? `${b.nome} (${b.instance_identifier})` : b.nome,
            investidor_nome: b.investidores?.nome || null,
          };
        });
      }

      return (ledger || []).map((e: any): BrokerTransaction => {
        const bmId = e.destino_bookmaker_id || e.origem_bookmaker_id;
        const bm = bmId ? bmMap[bmId] : null;
        return {
          id: e.id,
          tipo_transacao: e.tipo_transacao,
          valor: e.valor,
          moeda: e.moeda,
          status: e.status,
          data_transacao: e.data_transacao,
          created_at: e.created_at,
          descricao: e.descricao,
          bookmaker_nome: bm?.nome || null,
          bookmaker_id: bmId,
          investidor_nome: bm?.investidor_nome || null,
          is_investor_account: bmId ? investorBkIds.has(bmId) : false,
          origem_tipo: e.origem_tipo,
          destino_tipo: e.destino_tipo,
        };
      });
    },
    enabled: !!projetoId && !!workspaceId,
    staleTime: 30_000,
  });

  // KPI metrics
  const metricsQuery = useQuery({
    queryKey: ["broker-flow-metrics", projetoId],
    queryFn: async () => {
      const { data: investorBks } = await supabase
        .from("bookmakers")
        .select("id, investidor_id, saldo_atual")
        .eq("workspace_id", workspaceId!)
        .not("investidor_id", "is", null);
      const investorBkIds = new Set((investorBks || []).map((b: any) => b.id));

      const { data: ledger, error } = await supabase
        .from("cash_ledger")
        .select("tipo_transacao, valor, destino_bookmaker_id, origem_bookmaker_id, moeda")
        .eq("projeto_id_snapshot", projetoId)
        .eq("status", "CONFIRMADO")
        .in("tipo_transacao", ["DEPOSITO", "DEPOSITO_VIRTUAL", "SAQUE", "SAQUE_VIRTUAL"]);
      if (error) throw error;

      const { data: balances } = await supabase
        .from("bookmakers")
        .select("id, saldo_atual, investidor_id, status")
        .eq("projeto_id", projetoId)
        .in("status", ["ativo", "ATIVO", "EM_USO", "limitada", "LIMITADA", "AGUARDANDO_SAQUE"]);

      let depositosInternos = 0, depositosInvestidor = 0;
      let saquesInternos = 0, saquesInvestidor = 0;

      (ledger || []).forEach((entry: any) => {
        const isDeposito = entry.tipo_transacao === "DEPOSITO" || entry.tipo_transacao === "DEPOSITO_VIRTUAL";
        const isSaque = entry.tipo_transacao === "SAQUE" || entry.tipo_transacao === "SAQUE_VIRTUAL";
        const bmId = isDeposito ? entry.destino_bookmaker_id : entry.origem_bookmaker_id;
        const isInvestor = bmId && investorBkIds.has(bmId);

        if (isDeposito) {
          if (isInvestor) depositosInvestidor += entry.valor;
          else depositosInternos += entry.valor;
        } else if (isSaque) {
          if (isInvestor) saquesInvestidor += entry.valor;
          else saquesInternos += entry.valor;
        }
      });

      let saldoInternos = 0, saldoInvestidor = 0;
      let contasAguardando = 0;
      (balances || []).forEach((b: any) => {
        if (b.investidor_id) {
          saldoInvestidor += b.saldo_atual;
          if (b.status === "AGUARDANDO_SAQUE") contasAguardando++;
        } else {
          saldoInternos += b.saldo_atual;
        }
      });

      return {
        depositosTotal: depositosInternos + depositosInvestidor,
        depositosInternos,
        depositosInvestidor,
        saquesTotal: saquesInternos + saquesInvestidor,
        saquesInternos,
        saquesInvestidor,
        saldoCasas: saldoInternos + saldoInvestidor,
        saldoInternos,
        saldoInvestidor,
        contasAguardando,
      } as BrokerFlowMetrics;
    },
    enabled: !!projetoId && !!workspaceId,
    staleTime: 30_000,
  });

  return {
    transactions: historyQuery.data || [],
    metrics: metricsQuery.data,
    isLoading: historyQuery.isLoading || metricsQuery.isLoading,
  };
}

export function SaquesBrokerTab({ projetoId }: SaquesBrokerTabProps) {
  const { transactions, metrics, isLoading } = useBrokerExtrato(projetoId);
  const [searchTerm, setSearchTerm] = useState("");
  const [filterType, setFilterType] = useState<string>("todos");
  const [filterStatus, setFilterStatus] = useState<string>("todos");
  const [filterOrigem, setFilterOrigem] = useState<string>("todos");
  const queryClient = useQueryClient();

  const filteredTransactions = useMemo(() => {
    return transactions.filter((t) => {
      if (filterType !== "todos") {
        if (filterType === "depositos" && !t.tipo_transacao.includes("DEPOSITO")) return false;
        if (filterType === "saques" && !t.tipo_transacao.includes("SAQUE")) return false;
      }
      if (filterStatus !== "todos" && t.status !== filterStatus) return false;
      if (filterOrigem === "investidor" && !t.is_investor_account) return false;
      if (filterOrigem === "interno" && t.is_investor_account) return false;
      if (searchTerm) {
        const s = searchTerm.toLowerCase();
        if (
          !t.bookmaker_nome?.toLowerCase().includes(s) &&
          !t.investidor_nome?.toLowerCase().includes(s) &&
          !t.descricao?.toLowerCase().includes(s)
        ) return false;
      }
      return true;
    });
  }, [transactions, filterType, filterStatus, filterOrigem, searchTerm]);

  const handleUpdateStatus = async (transactionId: string, newStatus: string) => {
    const { error } = await supabase
      .from("cash_ledger")
      .update({ status: newStatus, updated_at: new Date().toISOString() })
      .eq("id", transactionId);

    if (error) {
      toast.error("Erro ao atualizar status");
      return;
    }
    toast.success(`Status atualizado para ${newStatus}`);
    queryClient.invalidateQueries({ queryKey: ["broker-extrato-history", projetoId] });
    queryClient.invalidateQueries({ queryKey: ["broker-flow-metrics", projetoId] });
  };

  if (isLoading) {
    return (
      <div className="space-y-4">
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          {[...Array(5)].map((_, i) => (
            <Skeleton key={i} className="h-24 rounded-lg" />
          ))}
        </div>
        <Skeleton className="h-64 rounded-lg" />
      </div>
    );
  }

  const lucroConsolidado = metrics
    ? metrics.saquesTotal - metrics.depositosTotal + metrics.saldoCasas
    : 0;

  // Group transactions by date
  const grouped = useMemo(() => {
    const map = new Map<string, BrokerTransaction[]>();
    filteredTransactions.forEach((t) => {
      const date = new Date(t.data_transacao).toLocaleDateString("pt-BR");
      if (!map.has(date)) map.set(date, []);
      map.get(date)!.push(t);
    });
    return Array.from(map.entries());
  }, [filteredTransactions]);

  return (
    <div className="space-y-4">
      {/* KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <Card className="border-border/50">
                <CardContent className="p-3">
                  <div className="flex items-center gap-2 mb-1">
                    <ArrowDownToLine className="h-3.5 w-3.5 text-red-400" />
                    <span className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">Depósitos</span>
                  </div>
                  <p className="text-lg font-bold text-foreground">{formatCurrency(metrics?.depositosTotal || 0)}</p>
                </CardContent>
              </Card>
            </TooltipTrigger>
            <TooltipContent side="bottom" className="text-xs">
              <div className="space-y-1">
                <div className="flex justify-between gap-4"><span className="text-muted-foreground">Interno:</span><span>{formatCurrency(metrics?.depositosInternos || 0)}</span></div>
                <div className="flex justify-between gap-4"><span className="text-muted-foreground">Investidor:</span><span>{formatCurrency(metrics?.depositosInvestidor || 0)}</span></div>
              </div>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>

        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <Card className="border-border/50">
                <CardContent className="p-3">
                  <div className="flex items-center gap-2 mb-1">
                    <ArrowUpFromLine className="h-3.5 w-3.5 text-emerald-400" />
                    <span className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">Saques</span>
                  </div>
                  <p className="text-lg font-bold text-foreground">{formatCurrency(metrics?.saquesTotal || 0)}</p>
                </CardContent>
              </Card>
            </TooltipTrigger>
            <TooltipContent side="bottom" className="text-xs">
              <div className="space-y-1">
                <div className="flex justify-between gap-4"><span className="text-muted-foreground">Interno:</span><span>{formatCurrency(metrics?.saquesInternos || 0)}</span></div>
                <div className="flex justify-between gap-4"><span className="text-muted-foreground">Investidor:</span><span>{formatCurrency(metrics?.saquesInvestidor || 0)}</span></div>
              </div>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>

        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <Card className="border-border/50">
                <CardContent className="p-3">
                  <div className="flex items-center gap-2 mb-1">
                    <Wallet className="h-3.5 w-3.5 text-blue-400" />
                    <span className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">Saldo Casas</span>
                  </div>
                  <p className="text-lg font-bold text-foreground">{formatCurrency(metrics?.saldoCasas || 0)}</p>
                </CardContent>
              </Card>
            </TooltipTrigger>
            <TooltipContent side="bottom" className="text-xs">
              <div className="space-y-1">
                <div className="flex justify-between gap-4"><span className="text-muted-foreground">Interno:</span><span>{formatCurrency(metrics?.saldoInternos || 0)}</span></div>
                <div className="flex justify-between gap-4"><span className="text-muted-foreground">Investidor:</span><span>{formatCurrency(metrics?.saldoInvestidor || 0)}</span></div>
              </div>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>

        <Card className="border-border/50">
          <CardContent className="p-3">
            <div className="flex items-center gap-2 mb-1">
              <TrendingUp className="h-3.5 w-3.5 text-emerald-400" />
              <span className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">Lucro Consolidado</span>
            </div>
            <p className={`text-lg font-bold ${lucroConsolidado >= 0 ? "text-emerald-400" : "text-red-400"}`}>
              {formatCurrency(lucroConsolidado)}
            </p>
          </CardContent>
        </Card>

        <Card className="border-border/50">
          <CardContent className="p-3">
            <div className="flex items-center gap-2 mb-1">
              <Clock className="h-3.5 w-3.5 text-amber-400" />
              <span className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">Aguardando</span>
            </div>
            <p className="text-lg font-bold text-amber-400">
              {metrics?.contasAguardando || 0}
              <span className="text-xs text-muted-foreground font-normal ml-1">contas</span>
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[200px] max-w-xs">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            placeholder="Buscar por casa, investidor..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-8 h-8 text-xs"
          />
        </div>

        <Select value={filterType} onValueChange={setFilterType}>
          <SelectTrigger className="h-8 w-[130px] text-xs">
            <SelectValue placeholder="Tipo" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Todos os tipos</SelectItem>
            <SelectItem value="depositos">Depósitos</SelectItem>
            <SelectItem value="saques">Saques</SelectItem>
          </SelectContent>
        </Select>

        <Select value={filterStatus} onValueChange={setFilterStatus}>
          <SelectTrigger className="h-8 w-[130px] text-xs">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Todos status</SelectItem>
            <SelectItem value="CONFIRMADO">Confirmado</SelectItem>
            <SelectItem value="PENDENTE">Pendente</SelectItem>
            <SelectItem value="EM_TRANSITO">Em Trânsito</SelectItem>
          </SelectContent>
        </Select>

        <Select value={filterOrigem} onValueChange={setFilterOrigem}>
          <SelectTrigger className="h-8 w-[130px] text-xs">
            <SelectValue placeholder="Origem" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Todas origens</SelectItem>
            <SelectItem value="investidor">Investidor</SelectItem>
            <SelectItem value="interno">Interno</SelectItem>
          </SelectContent>
        </Select>

        <span className="text-[11px] text-muted-foreground ml-auto">
          {filteredTransactions.length} / {transactions.length} registros
        </span>
      </div>

      {/* Transaction List */}
      {grouped.length === 0 ? (
        <Card className="border-dashed border-border/30">
          <CardContent className="p-8 flex flex-col items-center justify-center text-center">
            <CalendarDays className="h-10 w-10 text-muted-foreground/30 mb-3" />
            <p className="text-sm text-muted-foreground">Nenhuma movimentação registrada</p>
            <p className="text-xs text-muted-foreground/60 mt-1">
              Depósitos e saques aparecerão aqui conforme forem realizados
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {grouped.map(([date, txns]) => (
            <div key={date}>
              <div className="flex items-center gap-2 mb-2">
                <CalendarDays className="h-3.5 w-3.5 text-muted-foreground" />
                <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">{date}</span>
                <div className="flex-1 h-px bg-border/30" />
              </div>
              <div className="space-y-1.5">
                {txns.map((t) => (
                  <Card key={t.id} className="border-border/30 hover:border-border/60 transition-colors">
                    <CardContent className="p-3 flex items-center gap-3">
                      {/* Icon */}
                      <div className="shrink-0 h-8 w-8 rounded-full bg-muted/50 flex items-center justify-center">
                        {getTransactionIcon(t.tipo_transacao)}
                      </div>

                      {/* Info */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium text-foreground truncate">
                            {getTransactionLabel(t.tipo_transacao)}
                          </span>
                          {t.is_investor_account && (
                            <Badge variant="outline" className="text-[9px] px-1 py-0 text-blue-400 border-blue-400/30">
                              Investidor
                            </Badge>
                          )}
                        </div>
                        <p className="text-xs text-muted-foreground truncate">
                          {t.bookmaker_nome || "—"}
                          {t.investidor_nome && ` · ${t.investidor_nome}`}
                          {t.descricao && ` · ${t.descricao}`}
                        </p>
                      </div>

                      {/* Value */}
                      <div className="text-right shrink-0">
                        <p className={`text-sm font-semibold ${t.tipo_transacao.includes("SAQUE") ? "text-emerald-400" : "text-red-400"}`}>
                          {t.tipo_transacao.includes("SAQUE") ? "+" : "-"}{formatCurrency(t.valor, t.moeda)}
                        </p>
                        <p className="text-[10px] text-muted-foreground">
                          {new Date(t.created_at).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
                        </p>
                      </div>

                      {/* Status with edit */}
                      <div className="shrink-0">
                        <Select
                          value={t.status}
                          onValueChange={(val) => handleUpdateStatus(t.id, val)}
                        >
                          <SelectTrigger className="h-6 w-auto border-0 bg-transparent p-0 gap-1 text-xs focus:ring-0 [&>svg]:h-3 [&>svg]:w-3">
                            {getStatusBadge(t.status)}
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="PENDENTE">Pendente</SelectItem>
                            <SelectItem value="EM_TRANSITO">Em Trânsito</SelectItem>
                            <SelectItem value="CONFIRMADO">Confirmado</SelectItem>
                            <SelectItem value="CANCELADO">Cancelado</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
