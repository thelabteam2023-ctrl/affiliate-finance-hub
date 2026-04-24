import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useWorkspace } from "@/hooks/useWorkspace";
import { useProjectCurrencyFormat } from "@/hooks/useProjectCurrencyFormat";
import { useProjetoCurrency } from "@/hooks/useProjetoCurrency";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
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
  CalendarDays,
  ArrowRightLeft,
  Info,
  Sparkles,
  Gift,
  RefreshCcw,
} from "lucide-react";
import { CURRENCY_SYMBOLS, type SupportedCurrency } from "@/types/currency";

interface ExtratoProjetoTabProps {
  projetoId: string;
}

interface ProjetoTransaction {
  id: string;
  tipo_transacao: string;
  valor: number;
  moeda: string;
  tipo_moeda: string;
  valor_usd: number | null;
  cotacao: number | null;
  status: string;
  data_transacao: string;
  created_at: string;
  descricao: string | null;
  bookmaker_nome: string | null;
  bookmaker_id: string | null;
  parceiro_nome: string | null;
  origem_tipo: string | null;
  destino_tipo: string | null;
  ajuste_motivo: string | null;
  ajuste_direcao: string | null;
  evento_promocional_tipo: string | null;
}

// Metrics separated by currency
interface CurrencyMetrics {
  moeda: string;
  depositos: number;
  saques: number;
  ajustes: number;
}

interface ProjetoFlowMetrics {
  byCurrency: CurrencyMetrics[];
  /** Totais já convertidos para a moeda de consolidação do projeto via Cotação de Trabalho */
  depositosTotal: number;
  saquesTotal: number;
  ajustesTotal: number;
  saldoCasasTotal: number;
  resultadoCaixa: number;
  /** Quantidade de DEPOSITO_VIRTUAL classificados como BASELINE (excluídos do KPI) */
  baselineExcluidoCount: number;
  /** Soma (já convertida) dos baselines excluídos — apenas para tooltip informativo */
  baselineExcluidoTotalConvertido: number;
}

function getSymbol(moeda: string) {
  return CURRENCY_SYMBOLS[moeda as SupportedCurrency] || moeda;
}

function formatVal(value: number, moeda: string = "BRL") {
  const symbol = getSymbol(moeda);
  return `${symbol} ${value.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function getTransactionIcon(tipo: string) {
  if (tipo.includes("DEPOSITO")) return <ArrowDownToLine className="h-3.5 w-3.5 text-red-400" />;
  if (tipo.includes("SAQUE")) return <ArrowUpFromLine className="h-3.5 w-3.5 text-emerald-400" />;
  if (tipo === "AJUSTE") return <ArrowRightLeft className="h-3.5 w-3.5 text-blue-400" />;
  if (tipo === "CASHBACK") return <Sparkles className="h-3.5 w-3.5 text-purple-400" />;
  if (tipo === "BONUS") return <Gift className="h-3.5 w-3.5 text-amber-400" />;
  if (tipo === "ESTORNO") return <RefreshCcw className="h-3.5 w-3.5 text-orange-400" />;
  return <ArrowRightLeft className="h-3.5 w-3.5 text-muted-foreground" />;
}

function getTransactionLabel(tipo: string) {
  switch (tipo) {
    case "DEPOSITO": return "Depósito";
    case "DEPOSITO_VIRTUAL": return "Depósito Virtual";
    case "SAQUE": return "Saque";
    case "SAQUE_VIRTUAL": return "Saque Virtual";
    case "AJUSTE": return "Ajuste";
    case "CASHBACK": return "Cashback";
    case "BONUS": return "Bônus";
    case "ESTORNO": return "Estorno";
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

function getTransactionSign(tipo: string, ajusteDirecao?: string | null): "positive" | "negative" | "neutral" {
  if (tipo.includes("SAQUE")) return "positive";
  if (tipo.includes("DEPOSITO")) return "negative";
  if (tipo === "AJUSTE") {
    if (ajusteDirecao === "CREDITO") return "positive";
    if (ajusteDirecao === "DEBITO") return "negative";
    return "neutral";
  }
  if (tipo === "CASHBACK" || tipo === "BONUS") return "positive";
  if (tipo === "ESTORNO") return "negative";
  return "neutral";
}

function useProjetoExtrato(
  projetoId: string,
  convertToConsolidation: (valor: number, moedaOrigem: string) => number,
  moedaConsolidacao: string,
) {
  const { workspaceId } = useWorkspace();

  const historyQuery = useQuery({
    queryKey: ["projeto-extrato-history", projetoId],
    queryFn: async () => {
      const { data: ledger, error } = await supabase
        .from("cash_ledger")
        .select(`
          id, tipo_transacao, valor, moeda, tipo_moeda, valor_usd, cotacao, status, 
          data_transacao, created_at, descricao,
          origem_bookmaker_id, destino_bookmaker_id, origem_tipo, destino_tipo,
          ajuste_motivo, ajuste_direcao, evento_promocional_tipo
        `)
        .eq("projeto_id_snapshot", projetoId)
        .not("status", "eq", "CANCELADO")
        .order("data_transacao", { ascending: false })
        .order("created_at", { ascending: false })
        .limit(500);

      if (error) throw error;

      // Collect bookmaker IDs
      const bmIds = new Set<string>();
      (ledger || []).forEach((e: any) => {
        if (e.origem_bookmaker_id) bmIds.add(e.origem_bookmaker_id);
        if (e.destino_bookmaker_id) bmIds.add(e.destino_bookmaker_id);
      });

      let bmMap: Record<string, { nome: string; parceiro_nome: string | null }> = {};
      if (bmIds.size > 0) {
        const { data: bms } = await supabase
          .from("bookmakers")
          .select("id, nome, instance_identifier, parceiros(nome)")
          .in("id", Array.from(bmIds));
        (bms || []).forEach((b: any) => {
          bmMap[b.id] = {
            nome: b.instance_identifier ? `${b.nome} (${b.instance_identifier})` : b.nome,
            parceiro_nome: b.parceiros?.nome || null,
          };
        });
      }

      return (ledger || []).map((e: any): ProjetoTransaction => {
        const bmId = e.destino_bookmaker_id || e.origem_bookmaker_id;
        const bm = bmId ? bmMap[bmId] : null;
        return {
          id: e.id,
          tipo_transacao: e.tipo_transacao,
          valor: e.valor,
          moeda: e.moeda,
          tipo_moeda: e.tipo_moeda,
          valor_usd: e.valor_usd,
          cotacao: e.cotacao,
          status: e.status,
          data_transacao: e.data_transacao,
          created_at: e.created_at,
          descricao: e.descricao,
          bookmaker_nome: bm?.nome || null,
          bookmaker_id: bmId,
          parceiro_nome: bm?.parceiro_nome || null,
          origem_tipo: e.origem_tipo,
          destino_tipo: e.destino_tipo,
          ajuste_motivo: e.ajuste_motivo,
          ajuste_direcao: e.ajuste_direcao,
          evento_promocional_tipo: e.evento_promocional_tipo,
        };
      });
    },
    enabled: !!projetoId && !!workspaceId,
    staleTime: 30_000,
  });

  const metricsQuery = useQuery({
    queryKey: ["projeto-extrato-metrics", projetoId, moedaConsolidacao],
    queryFn: async () => {
      // Get confirmed ledger entries for metrics
      const { data: ledger, error } = await supabase
        .from("cash_ledger")
        .select(
          "tipo_transacao, valor, valor_confirmado, moeda, tipo_moeda, valor_usd, cotacao, ajuste_direcao, origem_tipo, descricao"
        )
        .eq("projeto_id_snapshot", projetoId)
        .eq("status", "CONFIRMADO");
      if (error) throw error;

      // === CLASSIFICAÇÃO CANÔNICA (memory: virtual-deposit-origin-classification) ===
      // Depósitos efetivos = DEPOSITO real + DEPOSITO_VIRTUAL onde origem_tipo='MIGRACAO'
      // Saques efetivos    = SAQUE real    + SAQUE_VIRTUAL    onde origem_tipo='MIGRACAO'
      // EXCLUI: BASELINE (primeira vinculação) e NULL (rebaselines antigos sem classificação)
      // ============================================================================
      const isBaselineDV = (e: any) =>
        e.tipo_transacao === "DEPOSITO_VIRTUAL" &&
        (e.origem_tipo === "BASELINE" || e.origem_tipo == null);

      const isMigracaoDV = (e: any) =>
        e.tipo_transacao === "DEPOSITO_VIRTUAL" && e.origem_tipo === "MIGRACAO";

      const isMigracaoSV = (e: any) =>
        e.tipo_transacao === "SAQUE_VIRTUAL" && e.origem_tipo === "MIGRACAO";

      // Aggregate by currency (apenas o que conta como movimento efetivo)
      const currencyMap = new Map<string, CurrencyMetrics>();
      const ensureCM = (moeda: string) => {
        if (!currencyMap.has(moeda)) {
          currencyMap.set(moeda, { moeda, depositos: 0, saques: 0, ajustes: 0 });
        }
        return currencyMap.get(moeda)!;
      };

      let baselineExcluidoCount = 0;
      let baselineExcluidoTotalConvertido = 0;

      (ledger || []).forEach((e: any) => {
        const moeda = e.moeda || "BRL";
        const valorBase = Number(e.valor_confirmado ?? e.valor ?? 0);

        // 1) Baseline DV: NÃO entra no KPI (seria duplicação do DEPOSITO real)
        if (isBaselineDV(e)) {
          baselineExcluidoCount += 1;
          baselineExcluidoTotalConvertido += convertToConsolidation(valorBase, moeda);
          return;
        }

        // 2) Depósito efetivo
        if (e.tipo_transacao === "DEPOSITO" || isMigracaoDV(e)) {
          ensureCM(moeda).depositos += valorBase;
          return;
        }

        // 3) Saque efetivo
        if (e.tipo_transacao === "SAQUE" || isMigracaoSV(e)) {
          ensureCM(moeda).saques += valorBase;
          return;
        }

        // 4) SAQUE_VIRTUAL não-MIGRACAO (raros) — ignora no KPI; aparece só no histórico
        if (e.tipo_transacao === "SAQUE_VIRTUAL") return;

        // 5) Demais (AJUSTE_*, CASHBACK, etc) — somente se tiverem direção/sinal claro
        const cm = ensureCM(moeda);
        if (e.ajuste_direcao === "ENTRADA" || e.ajuste_direcao === "CREDITO") {
          cm.ajustes += valorBase;
        } else if (e.ajuste_direcao === "SAIDA" || e.ajuste_direcao === "DEBITO") {
          cm.ajustes -= valorBase;
        } else {
          cm.ajustes += valorBase;
        }
      });

      // Saldo REAL atual das casas vinculadas (somente saldo_atual; freebet à parte)
      const { data: balances } = await supabase
        .from("bookmakers")
        .select("saldo_atual, moeda")
        .eq("projeto_id", projetoId)
        .in("status", [
          "ativo",
          "ATIVO",
          "EM_USO",
          "limitada",
          "LIMITADA",
          "AGUARDANDO_SAQUE",
        ]);

      // Saldo Casas convertido p/ moeda de consolidação
      let saldoCasasTotal = 0;
      (balances || []).forEach((b: any) => {
        saldoCasasTotal += convertToConsolidation(
          Number(b.saldo_atual || 0),
          b.moeda || "BRL"
        );
      });

      const byCurrency = Array.from(currencyMap.values());

      // Totais GLOBAIS já convertidos para a moeda de consolidação (USD, BRL, etc)
      const depositosTotal = byCurrency.reduce(
        (s, c) => s + convertToConsolidation(c.depositos, c.moeda),
        0
      );
      const saquesTotal = byCurrency.reduce(
        (s, c) => s + convertToConsolidation(c.saques, c.moeda),
        0
      );
      const ajustesTotal = byCurrency.reduce(
        (s, c) => s + convertToConsolidation(c.ajustes, c.moeda),
        0
      );

      // Resultado de Caixa (NÃO é Lucro Operacional canônico — é fluxo de caixa do projeto):
      //   saques + saldo casas + ajustes − depósitos
      const resultadoCaixa =
        saquesTotal + saldoCasasTotal + ajustesTotal - depositosTotal;

      return {
        byCurrency,
        depositosTotal,
        saquesTotal,
        ajustesTotal,
        saldoCasasTotal,
        resultadoCaixa,
        baselineExcluidoCount,
        baselineExcluidoTotalConvertido,
      } as ProjetoFlowMetrics;
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

export function ExtratoProjetoTab({ projetoId }: ExtratoProjetoTabProps) {
  const {
    convertToConsolidation,
    moedaConsolidacao,
    formatCurrency: formatConsolidated,
    getSymbol: getConsolidatedSymbol,
  } = useProjetoCurrency(projetoId);

  const { transactions, metrics, isLoading } = useProjetoExtrato(
    projetoId,
    convertToConsolidation,
    moedaConsolidacao,
  );
  const [searchTerm, setSearchTerm] = useState("");
  const [filterType, setFilterType] = useState<string>("todos");
  const [filterStatus, setFilterStatus] = useState<string>("todos");

  const filteredTransactions = useMemo(() => {
    return transactions.filter((t) => {
      if (filterType !== "todos") {
        if (filterType === "depositos" && !t.tipo_transacao.includes("DEPOSITO")) return false;
        if (filterType === "saques" && !t.tipo_transacao.includes("SAQUE")) return false;
        if (filterType === "ajustes" && !["AJUSTE", "CASHBACK", "BONUS", "ESTORNO"].includes(t.tipo_transacao)) return false;
      }
      if (filterStatus !== "todos" && t.status !== filterStatus) return false;
      if (searchTerm) {
        const s = searchTerm.toLowerCase();
        if (
          !t.bookmaker_nome?.toLowerCase().includes(s) &&
          !t.parceiro_nome?.toLowerCase().includes(s) &&
          !t.descricao?.toLowerCase().includes(s) &&
          !getTransactionLabel(t.tipo_transacao).toLowerCase().includes(s)
        ) return false;
      }
      return true;
    });
  }, [transactions, filterType, filterStatus, searchTerm]);

  // Detect multi-currency
  const currencies = useMemo(() => {
    const set = new Set<string>();
    transactions.forEach((t) => set.add(t.moeda));
    return Array.from(set);
  }, [transactions]);
  const isMultiCurrency = currencies.length > 1;

  // Group transactions by date
  const grouped = useMemo(() => {
    const map = new Map<string, ProjetoTransaction[]>();
    filteredTransactions.forEach((t) => {
      const date = new Date(t.data_transacao).toLocaleDateString("pt-BR");
      if (!map.has(date)) map.set(date, []);
      map.get(date)!.push(t);
    });
    return Array.from(map.entries());
  }, [filteredTransactions]);

  // Currency-aware KPI rendering
  const renderCurrencyBreakdown = (byCurrency: CurrencyMetrics[] | undefined, field: keyof CurrencyMetrics) => {
    if (!byCurrency || byCurrency.length <= 1) return null;
    return (
      <div className="space-y-0.5">
        {byCurrency.filter(c => Math.abs(c[field] as number) > 0.01).map((c) => (
          <div key={c.moeda} className="flex justify-between gap-3">
            <span className="text-muted-foreground">{c.moeda}:</span>
            <span>{formatVal(c[field] as number, c.moeda)}</span>
          </div>
        ))}
      </div>
    );
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
                  <p className="text-lg font-bold text-foreground">
                    {formatVal(metrics?.depositosTotal || 0)}
                  </p>
                  {isMultiCurrency && metrics?.byCurrency && (
                    <div className="mt-1 flex flex-wrap gap-1">
                      {metrics.byCurrency.filter(c => c.depositos > 0.01).map(c => (
                        <Badge key={c.moeda} variant="outline" className="text-[9px] px-1 py-0">
                          {formatVal(c.depositos, c.moeda)}
                        </Badge>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            </TooltipTrigger>
            {isMultiCurrency && (
              <TooltipContent side="bottom" className="text-xs">
                {renderCurrencyBreakdown(metrics?.byCurrency, "depositos")}
              </TooltipContent>
            )}
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
                  <p className="text-lg font-bold text-foreground">
                    {formatVal(metrics?.saquesTotal || 0)}
                  </p>
                  {isMultiCurrency && metrics?.byCurrency && (
                    <div className="mt-1 flex flex-wrap gap-1">
                      {metrics.byCurrency.filter(c => c.saques > 0.01).map(c => (
                        <Badge key={c.moeda} variant="outline" className="text-[9px] px-1 py-0">
                          {formatVal(c.saques, c.moeda)}
                        </Badge>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            </TooltipTrigger>
            {isMultiCurrency && (
              <TooltipContent side="bottom" className="text-xs">
                {renderCurrencyBreakdown(metrics?.byCurrency, "saques")}
              </TooltipContent>
            )}
          </Tooltip>
        </TooltipProvider>

        <Card className="border-border/50">
          <CardContent className="p-3">
            <div className="flex items-center gap-2 mb-1">
              <Wallet className="h-3.5 w-3.5 text-blue-400" />
              <span className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">Saldo Casas</span>
            </div>
            <p className="text-lg font-bold text-foreground">
              {formatVal(metrics?.saldoCasasTotal || 0)}
            </p>
          </CardContent>
        </Card>

        <Card className="border-border/50">
          <CardContent className="p-3">
            <div className="flex items-center gap-2 mb-1">
              <ArrowRightLeft className="h-3.5 w-3.5 text-purple-400" />
              <span className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">Extras</span>
            </div>
            <p className={`text-lg font-bold ${(metrics?.ajustesTotal || 0) >= 0 ? "text-emerald-400" : "text-red-400"}`}>
              {formatVal(metrics?.ajustesTotal || 0)}
            </p>
            {isMultiCurrency && metrics?.byCurrency && (
              <div className="mt-1 flex flex-wrap gap-1">
                {metrics.byCurrency.filter(c => Math.abs(c.ajustes) > 0.01).map(c => (
                  <Badge key={c.moeda} variant="outline" className="text-[9px] px-1 py-0">
                    {formatVal(c.ajustes, c.moeda)}
                  </Badge>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="border-border/50">
          <CardContent className="p-3">
            <div className="flex items-center gap-2 mb-1">
              <TrendingUp className="h-3.5 w-3.5 text-emerald-400" />
              <span className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">Lucro Consolidado</span>
            </div>
            <p className={`text-lg font-bold ${(metrics?.lucroConsolidado || 0) >= 0 ? "text-emerald-400" : "text-red-400"}`}>
              {formatVal(metrics?.lucroConsolidado || 0)}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[200px] max-w-xs">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            placeholder="Buscar por casa, parceiro..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-8 h-8 text-xs"
          />
        </div>

        <Select value={filterType} onValueChange={setFilterType}>
          <SelectTrigger className="h-8 w-auto min-w-[140px] text-xs">
            <SelectValue placeholder="Tipo" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Todos os tipos</SelectItem>
            <SelectItem value="depositos">Depósitos</SelectItem>
            <SelectItem value="saques">Saques</SelectItem>
            <SelectItem value="ajustes">Ajustes / Extras</SelectItem>
          </SelectContent>
        </Select>

        <Select value={filterStatus} onValueChange={setFilterStatus}>
          <SelectTrigger className="h-8 w-auto min-w-[140px] text-xs">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Todos status</SelectItem>
            <SelectItem value="CONFIRMADO">Confirmado</SelectItem>
            <SelectItem value="PENDENTE">Pendente</SelectItem>
            <SelectItem value="EM_TRANSITO">Em Trânsito</SelectItem>
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
              Depósitos, saques e ajustes aparecerão aqui conforme forem realizados
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
                {txns.map((t) => {
                  const sign = getTransactionSign(t.tipo_transacao, t.ajuste_direcao);
                  const isForeign = t.moeda !== "BRL";

                  return (
                    <Card
                      key={t.id}
                      className="border-border/30 hover:border-border/60 transition-colors"
                    >
                      <CardContent className="p-3 flex items-center gap-3">
                        {/* Icon */}
                        <div className="shrink-0 h-8 w-8 rounded-full flex items-center justify-center bg-muted/50">
                          {getTransactionIcon(t.tipo_transacao)}
                        </div>

                        {/* Info */}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-medium text-foreground truncate">
                              {getTransactionLabel(t.tipo_transacao)}
                            </span>
                            {isForeign && (
                              <Badge variant="outline" className="text-[9px] px-1 py-0 text-blue-400 border-blue-400/30">
                                {t.moeda}
                              </Badge>
                            )}
                            {t.evento_promocional_tipo && (
                              <Badge variant="outline" className="text-[9px] px-1 py-0 text-purple-400 border-purple-400/30">
                                {t.evento_promocional_tipo}
                              </Badge>
                            )}
                          </div>
                          <p className="text-xs text-muted-foreground truncate">
                            {t.bookmaker_nome || "—"}
                            {t.parceiro_nome && ` · ${t.parceiro_nome}`}
                            {t.tipo_transacao === "DEPOSITO_VIRTUAL" 
                              ? " · Saldo existente incorporado ao projeto na vinculação"
                              : t.tipo_transacao === "SAQUE_VIRTUAL"
                              ? " · Saldo transferido para fora do projeto na desvinculação"
                              : t.descricao ? ` · ${t.descricao}` : ""}
                            {t.ajuste_motivo && ` · ${t.ajuste_motivo}`}
                          </p>
                        </div>

                        {/* Value */}
                        <div className="text-right shrink-0">
                          <p className={`text-sm font-semibold ${
                            sign === "positive" ? "text-emerald-400" : 
                            sign === "negative" ? "text-red-400" : "text-foreground"
                          }`}>
                            {sign === "positive" ? "+" : sign === "negative" ? "-" : ""}
                            {formatVal(t.valor, t.moeda)}
                          </p>
                          {isForeign && t.cotacao && (
                            <p className="text-[9px] text-muted-foreground/60">
                              cotação {t.cotacao.toFixed(4)}
                            </p>
                          )}
                          <p className="text-[10px] text-muted-foreground">
                            {new Date(t.created_at).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
                          </p>
                        </div>

                        {/* Status */}
                        <div className="shrink-0">
                          {getStatusBadge(t.status)}
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
