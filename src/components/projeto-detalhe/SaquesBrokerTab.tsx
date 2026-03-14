import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
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
  ArrowDownToLine,
  ArrowUpFromLine,
  TrendingUp,
  Wallet,
  Search,
  Clock,
  CheckCircle2,
  Package,
  Info,
} from "lucide-react";

interface SaquesBrokerTabProps {
  projetoId: string;
}

interface BrokerWithdrawalAccount {
  id: string;
  nome: string;
  instance_identifier: string | null;
  investidor_nome: string | null;
  saldo_atual: number;
  moeda: string;
  status: string;
  aguardando_saque_at: string | null;
  logo_url: string | null;
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
  contasDevolvidas: number;
}

function useBrokerWithdrawals(projetoId: string) {
  const { workspaceId } = useWorkspace();

  // Accounts awaiting withdrawal (investor accounts)
  const accountsQuery = useQuery({
    queryKey: ["broker-withdrawals-accounts", projetoId],
    queryFn: async () => {
      // Get all bookmakers linked to this project with investidor_id
      const { data, error } = await supabase
        .from("bookmakers")
        .select(`
          id, nome, instance_identifier, saldo_atual, moeda, status, aguardando_saque_at,
          bookmaker_catalogo_id,
          investidores(nome),
          bookmakers_catalogo(logo_url)
        `)
        .eq("projeto_id", projetoId)
        .not("investidor_id", "is", null)
        .in("status", ["AGUARDANDO_SAQUE", "ativo", "ATIVO", "EM_USO", "limitada", "LIMITADA"]);

      if (error) throw error;

      // Also get unlinked accounts that had withdrawals from this project
      const { data: unlinkedWithdrawals, error: unlinkErr } = await supabase
        .from("cash_ledger")
        .select(`
          origem_bookmaker_id,
          bookmakers!cash_ledger_origem_bookmaker_id_fkey(
            id, nome, instance_identifier, saldo_atual, moeda, status, aguardando_saque_at,
            investidores(nome),
            bookmakers_catalogo(logo_url)
          )
        `)
        .eq("projeto_id_snapshot", projetoId)
        .eq("tipo_transacao", "SAQUE")
        .not("origem_bookmaker_id", "is", null);

      return (data || []).map((b: any) => ({
        id: b.id,
        nome: b.nome,
        instance_identifier: b.instance_identifier,
        investidor_nome: b.investidores?.nome || null,
        saldo_atual: b.saldo_atual,
        moeda: b.moeda,
        status: b.status,
        aguardando_saque_at: b.aguardando_saque_at,
        logo_url: b.bookmakers_catalogo?.logo_url || null,
      })) as BrokerWithdrawalAccount[];
    },
    enabled: !!projetoId,
    staleTime: 30_000,
  });

  // Financial flow metrics
  const metricsQuery = useQuery({
    queryKey: ["broker-flow-metrics", projetoId],
    queryFn: async () => {
      // Get investor bookmaker IDs for this project
      const { data: investorBks } = await supabase
        .from("bookmakers")
        .select("id, investidor_id, saldo_atual")
        .eq("workspace_id", workspaceId!)
        .not("investidor_id", "is", null);

      const investorBkIds = new Set((investorBks || []).map((b: any) => b.id));

      // Get all ledger entries for this project
      const { data: ledger, error } = await supabase
        .from("cash_ledger")
        .select("tipo_transacao, valor, destino_bookmaker_id, origem_bookmaker_id, moeda")
        .eq("projeto_id_snapshot", projetoId)
        .eq("status", "CONFIRMADO")
        .in("tipo_transacao", ["DEPOSITO", "DEPOSITO_VIRTUAL", "SAQUE", "SAQUE_VIRTUAL"]);

      if (error) throw error;

      // Get current balances
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
      (balances || []).forEach((b: any) => {
        if (b.investidor_id) saldoInvestidor += b.saldo_atual;
        else saldoInternos += b.saldo_atual;
      });

      const contasAguardando = (balances || []).filter(
        (b: any) => b.investidor_id && b.status === "AGUARDANDO_SAQUE"
      ).length;

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
        contasDevolvidas: 0,
      } as BrokerFlowMetrics;
    },
    enabled: !!projetoId && !!workspaceId,
    staleTime: 30_000,
  });

  return {
    accounts: accountsQuery.data || [],
    metrics: metricsQuery.data,
    isLoading: accountsQuery.isLoading || metricsQuery.isLoading,
  };
}

function formatCurrency(value: number, moeda: string = "BRL") {
  const prefix = moeda === "USD" ? "$" : moeda === "EUR" ? "€" : "R$";
  return `${prefix} ${value.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function SaquesBrokerTab({ projetoId }: SaquesBrokerTabProps) {
  const { accounts, metrics, isLoading } = useBrokerWithdrawals(projetoId);
  const [searchTerm, setSearchTerm] = useState("");

  const aguardandoSaque = useMemo(
    () => accounts.filter((a) => a.status === "AGUARDANDO_SAQUE"),
    [accounts]
  );

  const emOperacao = useMemo(
    () => accounts.filter((a) => a.status !== "AGUARDANDO_SAQUE"),
    [accounts]
  );

  const filteredAguardando = useMemo(() => {
    if (!searchTerm) return aguardandoSaque;
    const s = searchTerm.toLowerCase();
    return aguardandoSaque.filter(
      (a) =>
        a.nome.toLowerCase().includes(s) ||
        a.instance_identifier?.toLowerCase().includes(s) ||
        a.investidor_nome?.toLowerCase().includes(s)
    );
  }, [aguardandoSaque, searchTerm]);

  if (isLoading) {
    return (
      <div className="space-y-4">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[...Array(4)].map((_, i) => (
            <Skeleton key={i} className="h-24 rounded-lg" />
          ))}
        </div>
        <Skeleton className="h-48 rounded-lg" />
      </div>
    );
  }

  const lucroConsolidado = metrics
    ? metrics.saquesTotal - metrics.depositosTotal + metrics.saldoCasas
    : 0;

  return (
    <div className="space-y-4">
      {/* KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        {/* Depósitos */}
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <Card className="border-border/50">
                <CardContent className="p-3">
                  <div className="flex items-center gap-2 mb-1">
                    <ArrowDownToLine className="h-3.5 w-3.5 text-red-400" />
                    <span className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                      Depósitos
                    </span>
                  </div>
                  <p className="text-lg font-bold text-foreground">
                    {formatCurrency(metrics?.depositosTotal || 0)}
                  </p>
                </CardContent>
              </Card>
            </TooltipTrigger>
            <TooltipContent side="bottom" className="text-xs">
              <div className="space-y-1">
                <div className="flex justify-between gap-4">
                  <span className="text-muted-foreground">Interno:</span>
                  <span>{formatCurrency(metrics?.depositosInternos || 0)}</span>
                </div>
                <div className="flex justify-between gap-4">
                  <span className="text-muted-foreground">Investidor:</span>
                  <span>{formatCurrency(metrics?.depositosInvestidor || 0)}</span>
                </div>
              </div>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>

        {/* Saques */}
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <Card className="border-border/50">
                <CardContent className="p-3">
                  <div className="flex items-center gap-2 mb-1">
                    <ArrowUpFromLine className="h-3.5 w-3.5 text-emerald-400" />
                    <span className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                      Saques
                    </span>
                  </div>
                  <p className="text-lg font-bold text-foreground">
                    {formatCurrency(metrics?.saquesTotal || 0)}
                  </p>
                </CardContent>
              </Card>
            </TooltipTrigger>
            <TooltipContent side="bottom" className="text-xs">
              <div className="space-y-1">
                <div className="flex justify-between gap-4">
                  <span className="text-muted-foreground">Interno (Central Ops):</span>
                  <span>{formatCurrency(metrics?.saquesInternos || 0)}</span>
                </div>
                <div className="flex justify-between gap-4">
                  <span className="text-muted-foreground">Investidor (Broker):</span>
                  <span>{formatCurrency(metrics?.saquesInvestidor || 0)}</span>
                </div>
              </div>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>

        {/* Saldo nas Casas */}
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <Card className="border-border/50">
                <CardContent className="p-3">
                  <div className="flex items-center gap-2 mb-1">
                    <Wallet className="h-3.5 w-3.5 text-blue-400" />
                    <span className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                      Saldo Casas
                    </span>
                  </div>
                  <p className="text-lg font-bold text-foreground">
                    {formatCurrency(metrics?.saldoCasas || 0)}
                  </p>
                </CardContent>
              </Card>
            </TooltipTrigger>
            <TooltipContent side="bottom" className="text-xs">
              <div className="space-y-1">
                <div className="flex justify-between gap-4">
                  <span className="text-muted-foreground">Interno:</span>
                  <span>{formatCurrency(metrics?.saldoInternos || 0)}</span>
                </div>
                <div className="flex justify-between gap-4">
                  <span className="text-muted-foreground">Investidor:</span>
                  <span>{formatCurrency(metrics?.saldoInvestidor || 0)}</span>
                </div>
              </div>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>

        {/* Lucro Consolidado */}
        <Card className="border-border/50">
          <CardContent className="p-3">
            <div className="flex items-center gap-2 mb-1">
              <TrendingUp className="h-3.5 w-3.5 text-emerald-400" />
              <span className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                Lucro Consolidado
              </span>
            </div>
            <p className={`text-lg font-bold ${lucroConsolidado >= 0 ? "text-emerald-400" : "text-red-400"}`}>
              {formatCurrency(lucroConsolidado)}
            </p>
          </CardContent>
        </Card>

        {/* Aguardando Saque */}
        <Card className="border-border/50">
          <CardContent className="p-3">
            <div className="flex items-center gap-2 mb-1">
              <Clock className="h-3.5 w-3.5 text-amber-400" />
              <span className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                Aguardando
              </span>
            </div>
            <p className="text-lg font-bold text-amber-400">
              {metrics?.contasAguardando || 0}
              <span className="text-xs text-muted-foreground font-normal ml-1">contas</span>
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Info Banner */}
      <div className="flex items-start gap-2 px-3 py-2 rounded-lg bg-muted/30 border border-border/30">
        <Info className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
        <p className="text-xs text-muted-foreground">
          Saques de contas de investidor não impactam o caixa operacional. O fluxo é independente da Central de Operações.
        </p>
      </div>

      {/* Contas Aguardando Saque */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
            <Clock className="h-4 w-4 text-amber-400" />
            Aguardando Devolução
            {aguardandoSaque.length > 0 && (
              <Badge variant="outline" className="text-amber-400 border-amber-400/30 text-[10px]">
                {aguardandoSaque.length}
              </Badge>
            )}
          </h3>
          {aguardandoSaque.length > 3 && (
            <div className="relative w-48">
              <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <Input
                placeholder="Buscar conta..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-8 h-8 text-xs"
              />
            </div>
          )}
        </div>

        {filteredAguardando.length === 0 ? (
          <Card className="border-dashed border-border/30">
            <CardContent className="p-6 flex flex-col items-center justify-center text-center">
              <CheckCircle2 className="h-8 w-8 text-emerald-400/50 mb-2" />
              <p className="text-sm text-muted-foreground">
                Nenhuma conta de investidor aguardando devolução
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-2">
            {filteredAguardando.map((account) => (
              <Card key={account.id} className="border-border/40 hover:border-amber-400/30 transition-colors">
                <CardContent className="p-3 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    {account.logo_url ? (
                      <img
                        src={account.logo_url}
                        alt={account.nome}
                        className="h-8 w-8 rounded object-contain bg-background"
                      />
                    ) : (
                      <div className="h-8 w-8 rounded bg-muted flex items-center justify-center">
                        <Package className="h-4 w-4 text-muted-foreground" />
                      </div>
                    )}
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium text-foreground">{account.nome}</span>
                        <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                          {account.moeda}
                        </Badge>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {account.instance_identifier || account.investidor_nome || "Investidor"}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="text-right">
                      <p className="text-sm font-semibold text-foreground">
                        {formatCurrency(account.saldo_atual, account.moeda)}
                      </p>
                      {account.aguardando_saque_at && (
                        <p className="text-[10px] text-muted-foreground">
                          desde {new Date(account.aguardando_saque_at).toLocaleDateString("pt-BR")}
                        </p>
                      )}
                    </div>
                    <Badge className="bg-amber-400/10 text-amber-400 border-amber-400/20 text-[10px]">
                      <Clock className="h-3 w-3 mr-1" />
                      Pendente
                    </Badge>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>

      {/* Contas em Operação (investidor) */}
      {emOperacao.length > 0 && (
        <div className="space-y-3">
          <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
            <Package className="h-4 w-4 text-blue-400" />
            Contas Investidor em Operação
            <Badge variant="outline" className="text-blue-400 border-blue-400/30 text-[10px]">
              {emOperacao.length}
            </Badge>
          </h3>
          <div className="grid gap-2">
            {emOperacao.map((account) => (
              <Card key={account.id} className="border-border/30">
                <CardContent className="p-3 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    {account.logo_url ? (
                      <img
                        src={account.logo_url}
                        alt={account.nome}
                        className="h-8 w-8 rounded object-contain bg-background"
                      />
                    ) : (
                      <div className="h-8 w-8 rounded bg-muted flex items-center justify-center">
                        <Package className="h-4 w-4 text-muted-foreground" />
                      </div>
                    )}
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium text-foreground">{account.nome}</span>
                        <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                          {account.moeda}
                        </Badge>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {account.instance_identifier || account.investidor_nome || "Investidor"}
                      </p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-semibold text-foreground">
                      {formatCurrency(account.saldo_atual, account.moeda)}
                    </p>
                    <Badge variant="outline" className="text-[10px] text-emerald-400 border-emerald-400/20">
                      Em operação
                    </Badge>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
