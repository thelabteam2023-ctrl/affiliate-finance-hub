import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuthContext } from "@/contexts/AuthContext";
import { useExchangeRates } from "@/contexts/ExchangeRatesContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import {
  getRpcLogs,
  subscribeRpcLogs,
  clearRpcLogs,
  type RpcCallLog,
} from "@/lib/dev/rpcInterceptor";
import { Activity, AlertTriangle, Database, Receipt, Wallet, Zap, Trash2, Pause, Play } from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

const POLL_MS = 3000;

function fmtTime(iso: string | null | undefined) {
  if (!iso) return "—";
  const d = new Date(iso);
  return d.toLocaleTimeString("pt-BR", { hour12: false }) + "." + String(d.getMilliseconds()).padStart(3, "0");
}

function fmtMoney(v: number | null | undefined, moeda?: string | null) {
  if (v == null) return "—";
  return `${moeda ?? ""} ${Number(v).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`.trim();
}

function fmtCoin(qtd: number | null | undefined, coin?: string | null) {
  if (qtd == null) return "—";
  return `${Number(qtd).toLocaleString("pt-BR", { minimumFractionDigits: 0, maximumFractionDigits: 8 })} ${coin ?? ""}`.trim();
}

function fmtRate(rate: number | null | undefined, from?: string | null, to?: string | null) {
  if (rate == null || !isFinite(rate) || rate === 0) return null;
  const r = Number(rate).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 6 });
  return `1 ${from ?? "?"} = ${r} ${to ?? "?"}`;
}

// ─── Cash Ledger Stream ───
function useCashLedger(enabled: boolean) {
  return useQuery({
    queryKey: ["dev-monitor", "cash-ledger"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("cash_ledger")
        .select("id, created_at, data_transacao, tipo_transacao, status, moeda, valor, descricao, origem_tipo, destino_tipo, origem_bookmaker_id, destino_bookmaker_id, projeto_id_snapshot, balance_processed_at, reversed_at, moeda_origem, valor_origem, moeda_destino, valor_destino, qtd_coin, coin, cotacao, cotacao_origem_usd, cotacao_destino_usd")
        .order("created_at", { ascending: false })
        .limit(100);
      if (error) throw error;
      return data ?? [];
    },
    refetchInterval: enabled ? POLL_MS : false,
    refetchIntervalInBackground: true,
  });
}

// ─── Apostas Stream ───
function useApostas(enabled: boolean) {
  return useQuery({
    queryKey: ["dev-monitor", "apostas"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("apostas_unificada")
        .select("id, created_at, updated_at, estrategia, status, resultado, evento, stake, moeda_operacao, lucro_prejuizo, projeto_id, bookmaker_id")
        .order("updated_at", { ascending: false })
        .limit(100);
      if (error) throw error;
      return data ?? [];
    },
    refetchInterval: enabled ? POLL_MS : false,
    refetchIntervalInBackground: true,
  });
}

// ─── Bookmaker Saldos ───
function useBookmakerSaldos(enabled: boolean) {
  return useQuery({
    queryKey: ["dev-monitor", "bookmakers"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("bookmakers")
        .select("id, nome, moeda, saldo_atual, saldo_freebet, saldo_bonus, status, projeto_id, updated_at")
        .order("updated_at", { ascending: false })
        .limit(50);
      if (error) throw error;
      return data ?? [];
    },
    refetchInterval: enabled ? POLL_MS : false,
    refetchIntervalInBackground: true,
  });
}

// ─── Snapshots de Cotação por Bookmaker ───
// Para cada bookmaker, busca o ÚLTIMO cash_ledger confirmado onde ele foi destino,
// extraindo cotacao_destino_usd (cotação CONGELADA no momento da operação).
// Isso garante que o "≈ USD/BRL" no monitor reflita a cotação histórica fixa,
// não a cotação live (que muda a cada segundo).
function useBookmakerCotacaoSnapshots(bookmakerIds: string[], enabled: boolean) {
  return useQuery({
    queryKey: ["dev-monitor", "bookmaker-cotacao-snapshots", bookmakerIds.sort().join(",")],
    queryFn: async () => {
      if (bookmakerIds.length === 0) return {} as Record<string, { cotacaoUsd: number; capturedAt: string; source: "snapshot" }>;
      const { data, error } = await supabase
        .from("cash_ledger")
        .select("destino_bookmaker_id, cotacao_destino_usd, cotacao_snapshot_at, created_at, status")
        .in("destino_bookmaker_id", bookmakerIds)
        .eq("status", "CONFIRMADO")
        .not("cotacao_destino_usd", "is", null)
        .order("created_at", { ascending: false })
        .limit(500);
      if (error) throw error;
      const map: Record<string, { cotacaoUsd: number; capturedAt: string; source: "snapshot" }> = {};
      for (const row of data ?? []) {
        const id = row.destino_bookmaker_id as string | null;
        if (!id || map[id]) continue;
        const rate = Number(row.cotacao_destino_usd);
        if (!isFinite(rate) || rate <= 0) continue;
        map[id] = {
          cotacaoUsd: rate,
          capturedAt: (row.cotacao_snapshot_at as string) ?? (row.created_at as string),
          source: "snapshot",
        };
      }
      return map;
    },
    enabled: enabled && bookmakerIds.length > 0,
    refetchInterval: enabled ? POLL_MS * 4 : false, // snapshots mudam pouco, refresh menor
    staleTime: POLL_MS * 2,
  });
}

// ─── Hook RPC Logs (subscribe to in-memory store) ───
function useRpcLogs(): RpcCallLog[] {
  return useSyncExternalStore(
    (cb) => subscribeRpcLogs(cb),
    () => getRpcLogs(),
    () => getRpcLogs(),
  );
}

// ─── Status badge helpers ───
function statusVariant(status: string): "default" | "secondary" | "destructive" | "outline" {
  const s = status?.toUpperCase();
  if (s === "CONFIRMADO" || s === "GANHO" || s === "success") return "default";
  if (s === "PENDENTE" || s === "pending") return "secondary";
  if (s === "CANCELADO" || s === "PERDIDO" || s === "error") return "destructive";
  return "outline";
}

export default function DevLedgerMonitor() {
  const { user, isSystemOwner, initialized } = useAuthContext();
  const navigate = useNavigate();
  const [paused, setPaused] = useState(false);
  const [filter, setFilter] = useState("");
  const { getRate } = useExchangeRates();

  // Hard guard — only system owner
  useEffect(() => {
    if (initialized && (!user || !isSystemOwner)) {
      navigate("/", { replace: true });
    }
  }, [initialized, user, isSystemOwner, navigate]);

  const enabled = !paused && isSystemOwner;
  const ledger = useCashLedger(enabled);
  const apostas = useApostas(enabled);
  const bookmakers = useBookmakerSaldos(enabled);
  const rpcLogs = useRpcLogs();

  const filterFn = (text: string) => {
    if (!filter.trim()) return true;
    return text.toLowerCase().includes(filter.toLowerCase().trim());
  };

  const ledgerFiltered = useMemo(
    () => (ledger.data ?? []).filter((r) =>
      filterFn(`${r.tipo_transacao} ${r.descricao ?? ""} ${r.moeda} ${r.status}`)
    ),
    [ledger.data, filter]
  );

  const apostasFiltered = useMemo(
    () => (apostas.data ?? []).filter((r) =>
      filterFn(`${r.estrategia} ${r.evento ?? ""} ${r.status} ${r.resultado ?? ""}`)
    ),
    [apostas.data, filter]
  );

  const bookmakersFiltered = useMemo(
    () => (bookmakers.data ?? []).filter((r) => filterFn(`${r.nome} ${r.moeda} ${r.status}`)),
    [bookmakers.data, filter]
  );

  const rpcFiltered = useMemo(
    () => rpcLogs.filter((r) => filterFn(`${r.fn_name} ${r.status} ${r.error ?? ""}`)),
    [rpcLogs, filter]
  );

  if (!initialized) {
    return <div className="p-8 text-muted-foreground">Carregando...</div>;
  }

  if (!isSystemOwner) {
    return null;
  }

  return (
    <div className="p-4 space-y-4 h-full flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-3">
          <Activity className="h-6 w-6 text-primary" />
          <div>
            <h1 className="text-xl font-bold">Ledger Monitor</h1>
            <p className="text-xs text-muted-foreground">
              System Owner Only · Polling {POLL_MS / 1000}s · {paused ? "Pausado" : "Ao vivo"}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Input
            placeholder="Filtrar..."
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            className="w-48 h-8"
          />
          <div className="flex items-center gap-2">
            <Switch id="pause" checked={!paused} onCheckedChange={(v) => setPaused(!v)} />
            <Label htmlFor="pause" className="text-xs flex items-center gap-1">
              {paused ? <Pause className="h-3 w-3" /> : <Play className="h-3 w-3" />}
              {paused ? "Pausado" : "Ativo"}
            </Label>
          </div>
          <Button variant="outline" size="sm" onClick={() => clearRpcLogs()}>
            <Trash2 className="h-3 w-3 mr-1" /> Limpar RPCs
          </Button>
        </div>
      </div>

      {/* Counters */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
        <Card className="bg-card">
          <CardContent className="p-3">
            <div className="flex items-center gap-2">
              <Receipt className="h-4 w-4 text-blue-500" />
              <div>
                <div className="text-xs text-muted-foreground">Ledger</div>
                <div className="text-lg font-bold tabular-nums">{ledger.data?.length ?? 0}</div>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3">
            <div className="flex items-center gap-2">
              <Database className="h-4 w-4 text-purple-500" />
              <div>
                <div className="text-xs text-muted-foreground">Apostas</div>
                <div className="text-lg font-bold tabular-nums">{apostas.data?.length ?? 0}</div>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3">
            <div className="flex items-center gap-2">
              <Wallet className="h-4 w-4 text-emerald-500" />
              <div>
                <div className="text-xs text-muted-foreground">Bookmakers</div>
                <div className="text-lg font-bold tabular-nums">{bookmakers.data?.length ?? 0}</div>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3">
            <div className="flex items-center gap-2">
              <Zap className="h-4 w-4 text-amber-500" />
              <div>
                <div className="text-xs text-muted-foreground">RPCs (sessão)</div>
                <div className="text-lg font-bold tabular-nums">{rpcLogs.length}</div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Tabs */}
      <Tabs defaultValue="ledger" className="flex-1 flex flex-col min-h-0">
        <TabsList className="self-start">
          <TabsTrigger value="ledger">Cash Ledger</TabsTrigger>
          <TabsTrigger value="apostas">Apostas</TabsTrigger>
          <TabsTrigger value="bookmakers">Saldos Bookmakers</TabsTrigger>
          <TabsTrigger value="rpc">RPCs</TabsTrigger>
        </TabsList>

        {/* Ledger */}
        <TabsContent value="ledger" className="flex-1 min-h-0 mt-2">
          <Card className="h-full flex flex-col">
            <CardHeader className="py-2">
              <CardTitle className="text-sm flex items-center justify-between">
                <span>Últimos 100 eventos</span>
                {ledger.isFetching && <span className="text-xs text-muted-foreground">atualizando...</span>}
              </CardTitle>
            </CardHeader>
            <CardContent className="flex-1 min-h-0 p-0">
              <ScrollArea className="h-full">
                <table className="w-full text-xs">
                  <thead className="sticky top-0 bg-card border-b">
                    <tr className="text-left text-muted-foreground">
                      <th className="px-2 py-1.5">Hora</th>
                      <th className="px-2 py-1.5">Tipo</th>
                      <th className="px-2 py-1.5">Status</th>
                      <th className="px-2 py-1.5 text-right">Valor</th>
                      <th className="px-2 py-1.5">Origem → Destino</th>
                      <th className="px-2 py-1.5">Descrição</th>
                    </tr>
                  </thead>
                  <tbody className="font-mono">
                    {ledgerFiltered.map((r) => (
                      <tr key={r.id} className="border-b hover:bg-accent/30">
                        <td className="px-2 py-1 whitespace-nowrap text-muted-foreground">{fmtTime(r.created_at)}</td>
                        <td className="px-2 py-1"><Badge variant="outline" className="text-[10px]">{r.tipo_transacao}</Badge></td>
                        <td className="px-2 py-1"><Badge variant={statusVariant(r.status)} className="text-[10px]">{r.status}</Badge></td>
                        <td className="px-2 py-1 text-right tabular-nums">
                          {(() => {
                            const isCripto = r.coin != null && r.qtd_coin != null;
                            const isCrossCurrency =
                              r.moeda_origem && r.moeda_destino && r.moeda_origem !== r.moeda_destino;

                            // Calcula a conversão ESPERADA usando cotações oficiais (BRL pivô).
                            // Detecta divergências entre o que está GRAVADO no banco e o
                            // valor saudável atual — útil para auditoria do System Owner.
                            const expectedConvert = (
                              valor: number,
                              from: string,
                              to: string
                            ): number | null => {
                              if (!valor || !from || !to) return null;
                              const fromRate = getRate(from);
                              const toRate = getRate(to);
                              if (!fromRate || !toRate) return null;
                              return (valor * fromRate) / toRate;
                            };

                            const renderDivergence = (
                              storedAmount: number,
                              expectedAmount: number | null,
                              moedaDestino: string,
                              from: string,
                              fromAmount: number
                            ) => {
                              if (expectedAmount == null || !isFinite(expectedAmount)) return null;
                              const diffPct =
                                expectedAmount !== 0
                                  ? Math.abs((storedAmount - expectedAmount) / expectedAmount)
                                  : 0;
                              // Tolerância de 5% (acomoda flutuação cambial vs cotação histórica)
                              if (diffPct < 0.05) return null;
                              const expectedRate = fromAmount !== 0 ? expectedAmount / fromAmount : null;
                              return (
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <span className="text-[10px] text-destructive flex items-center gap-1 justify-end cursor-help">
                                      <AlertTriangle className="h-3 w-3" />
                                      Divergente {(diffPct * 100).toFixed(1)}%
                                    </span>
                                  </TooltipTrigger>
                                  <TooltipContent side="left" className="text-xs max-w-[260px]">
                                    <div>Esperado: {fmtMoney(expectedAmount, moedaDestino)}</div>
                                    {expectedRate && (
                                      <div className="text-muted-foreground">
                                        Cotação atual: {fmtRate(expectedRate, from, moedaDestino)}
                                      </div>
                                    )}
                                  </TooltipContent>
                                </Tooltip>
                              );
                            };

                            // Caso 1: Cripto (qtd_coin = verdade primária)
                            if (isCripto) {
                              const qtd = Number(r.qtd_coin);
                              const stored = Number(r.valor_destino ?? r.valor);
                              const moedaDest = r.moeda_destino ?? r.moeda;
                              const storedRate = qtd !== 0 ? stored / qtd : null;
                              const expected = expectedConvert(qtd, r.coin!, moedaDest);
                              return (
                                <div className="flex flex-col items-end leading-tight">
                                  <span className="font-semibold">{fmtCoin(qtd, r.coin)}</span>
                                  <span className="text-[10px] text-muted-foreground">
                                    ≈ {fmtMoney(stored, moedaDest)}
                                  </span>
                                  {storedRate && (
                                    <span className="text-[10px] text-amber-500/80">
                                      {fmtRate(storedRate, r.coin, moedaDest)}
                                    </span>
                                  )}
                                  {renderDivergence(stored, expected, moedaDest, r.coin!, qtd)}
                                </div>
                              );
                            }
                            // Caso 2: Cross-currency fiat (origem ≠ destino)
                            if (isCrossCurrency) {
                              const vOrigem = Number(r.valor_origem);
                              const vDestino = Number(r.valor_destino);
                              const storedRate = vOrigem !== 0 ? vDestino / vOrigem : null;
                              const expected = expectedConvert(vOrigem, r.moeda_origem!, r.moeda_destino!);
                              return (
                                <div className="flex flex-col items-end leading-tight">
                                  <span className="font-semibold">
                                    {fmtMoney(vOrigem, r.moeda_origem)}
                                  </span>
                                  <span className="text-[10px] text-muted-foreground">
                                    → {fmtMoney(vDestino, r.moeda_destino)}
                                  </span>
                                  {storedRate && (
                                    <span className="text-[10px] text-amber-500/80">
                                      {fmtRate(storedRate, r.moeda_origem, r.moeda_destino)}
                                    </span>
                                  )}
                                  {renderDivergence(
                                    vDestino,
                                    expected,
                                    r.moeda_destino!,
                                    r.moeda_origem!,
                                    vOrigem
                                  )}
                                </div>
                              );
                            }
                            // Caso 3: Single currency
                            return fmtMoney(Number(r.valor), r.moeda);
                          })()}
                        </td>
                        <td className="px-2 py-1 text-muted-foreground text-[11px]">
                          {r.origem_tipo ?? "—"} → {r.destino_tipo ?? "—"}
                        </td>
                        <td className="px-2 py-1 truncate max-w-[300px]" title={r.descricao ?? ""}>{r.descricao ?? "—"}</td>
                      </tr>
                    ))}
                    {ledgerFiltered.length === 0 && (
                      <tr><td colSpan={6} className="text-center py-6 text-muted-foreground">Nenhum evento</td></tr>
                    )}
                  </tbody>
                </table>
              </ScrollArea>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Apostas */}
        <TabsContent value="apostas" className="flex-1 min-h-0 mt-2">
          <Card className="h-full flex flex-col">
            <CardHeader className="py-2">
              <CardTitle className="text-sm flex items-center justify-between">
                <span>Últimas 100 apostas (por updated_at)</span>
                {apostas.isFetching && <span className="text-xs text-muted-foreground">atualizando...</span>}
              </CardTitle>
            </CardHeader>
            <CardContent className="flex-1 min-h-0 p-0">
              <ScrollArea className="h-full">
                <table className="w-full text-xs">
                  <thead className="sticky top-0 bg-card border-b">
                    <tr className="text-left text-muted-foreground">
                      <th className="px-2 py-1.5">Atualizado</th>
                      <th className="px-2 py-1.5">Estratégia</th>
                      <th className="px-2 py-1.5">Status</th>
                      <th className="px-2 py-1.5">Resultado</th>
                      <th className="px-2 py-1.5">Evento</th>
                      <th className="px-2 py-1.5 text-right">Stake</th>
                      <th className="px-2 py-1.5 text-right">P&L</th>
                    </tr>
                  </thead>
                  <tbody className="font-mono">
                    {apostasFiltered.map((r) => (
                      <tr key={r.id} className="border-b hover:bg-accent/30">
                        <td className="px-2 py-1 whitespace-nowrap text-muted-foreground">{fmtTime(r.updated_at)}</td>
                        <td className="px-2 py-1"><Badge variant="outline" className="text-[10px]">{r.estrategia}</Badge></td>
                        <td className="px-2 py-1"><Badge variant={statusVariant(r.status)} className="text-[10px]">{r.status}</Badge></td>
                        <td className="px-2 py-1"><Badge variant={statusVariant(r.resultado ?? "")} className="text-[10px]">{r.resultado ?? "—"}</Badge></td>
                        <td className="px-2 py-1 truncate max-w-[200px]" title={r.evento ?? ""}>{r.evento ?? "—"}</td>
                        <td className="px-2 py-1 text-right tabular-nums">{fmtMoney(Number(r.stake), r.moeda_operacao)}</td>
                        <td className={`px-2 py-1 text-right tabular-nums ${(r.lucro_prejuizo ?? 0) > 0 ? "text-emerald-500" : (r.lucro_prejuizo ?? 0) < 0 ? "text-destructive" : ""}`}>
                          {fmtMoney(r.lucro_prejuizo, r.moeda_operacao)}
                        </td>
                      </tr>
                    ))}
                    {apostasFiltered.length === 0 && (
                      <tr><td colSpan={7} className="text-center py-6 text-muted-foreground">Nenhuma aposta</td></tr>
                    )}
                  </tbody>
                </table>
              </ScrollArea>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Bookmakers */}
        <TabsContent value="bookmakers" className="flex-1 min-h-0 mt-2">
          <Card className="h-full flex flex-col">
            <CardHeader className="py-2">
              <CardTitle className="text-sm flex items-center justify-between">
                <span>Saldos de bookmakers (top 50 por updated_at)</span>
                {bookmakers.isFetching && <span className="text-xs text-muted-foreground">atualizando...</span>}
              </CardTitle>
            </CardHeader>
            <CardContent className="flex-1 min-h-0 p-0">
              <ScrollArea className="h-full">
                <table className="w-full text-xs">
                  <thead className="sticky top-0 bg-card border-b">
                    <tr className="text-left text-muted-foreground">
                      <th className="px-2 py-1.5">Atualizado</th>
                      <th className="px-2 py-1.5">Bookmaker</th>
                      <th className="px-2 py-1.5">Moeda</th>
                      <th className="px-2 py-1.5">Status</th>
                      <th className="px-2 py-1.5">Projeto</th>
                      <th className="px-2 py-1.5 text-right">Saldo Atual</th>
                      <th className="px-2 py-1.5 text-right">Freebet</th>
                      <th className="px-2 py-1.5 text-right">Bônus</th>
                      <th className="px-2 py-1.5 text-right">≈ USD</th>
                      <th className="px-2 py-1.5 text-right">≈ BRL</th>
                    </tr>
                  </thead>
                  <tbody className="font-mono">
                    {bookmakersFiltered.map((r) => {
                      // Converte saldo nativo → USD e → BRL via cotações de Trabalho (BRL pivô)
                      const fromRate = getRate(r.moeda);
                      const usdRate = getRate("USD");
                      const saldo = Number(r.saldo_atual ?? 0);
                      const valorBRL =
                        fromRate && fromRate > 0 ? saldo * fromRate : null;
                      const valorUSD =
                        valorBRL != null && usdRate && usdRate > 0
                          ? valorBRL / usdRate
                          : null;
                      const rateInfo =
                        fromRate && usdRate
                          ? `Cotação: 1 ${r.moeda} = ${fromRate.toFixed(4)} BRL · 1 USD = ${usdRate.toFixed(4)} BRL`
                          : "Cotação indisponível";
                      return (
                        <tr key={r.id} className="border-b hover:bg-accent/30">
                          <td className="px-2 py-1 whitespace-nowrap text-muted-foreground">{fmtTime(r.updated_at)}</td>
                          <td className="px-2 py-1 font-semibold">{r.nome}</td>
                          <td className="px-2 py-1">{r.moeda}</td>
                          <td className="px-2 py-1"><Badge variant={statusVariant(r.status)} className="text-[10px]">{r.status}</Badge></td>
                          <td className="px-2 py-1 text-[10px] text-muted-foreground">{r.projeto_id ? r.projeto_id.slice(0, 8) : "—"}</td>
                          <td className="px-2 py-1 text-right tabular-nums">{fmtMoney(r.saldo_atual, r.moeda)}</td>
                          <td className="px-2 py-1 text-right tabular-nums text-amber-500">{fmtMoney(r.saldo_freebet, r.moeda)}</td>
                          <td className="px-2 py-1 text-right tabular-nums">{fmtMoney(r.saldo_bonus, r.moeda)}</td>
                          <td className="px-2 py-1 text-right tabular-nums text-muted-foreground">
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <span className="cursor-help">
                                  {valorUSD != null ? fmtMoney(valorUSD, "USD") : "—"}
                                </span>
                              </TooltipTrigger>
                              <TooltipContent side="left" className="text-xs">
                                {rateInfo}
                              </TooltipContent>
                            </Tooltip>
                          </td>
                          <td className="px-2 py-1 text-right tabular-nums text-muted-foreground">
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <span className="cursor-help">
                                  {valorBRL != null ? fmtMoney(valorBRL, "BRL") : "—"}
                                </span>
                              </TooltipTrigger>
                              <TooltipContent side="left" className="text-xs">
                                {rateInfo}
                              </TooltipContent>
                            </Tooltip>
                          </td>
                        </tr>
                      );
                    })}
                    {bookmakersFiltered.length === 0 && (
                      <tr><td colSpan={10} className="text-center py-6 text-muted-foreground">Nenhum bookmaker</td></tr>
                    )}
                  </tbody>
                </table>
              </ScrollArea>
            </CardContent>
          </Card>
        </TabsContent>

        {/* RPCs */}
        <TabsContent value="rpc" className="flex-1 min-h-0 mt-2">
          <Card className="h-full flex flex-col">
            <CardHeader className="py-2">
              <CardTitle className="text-sm flex items-center justify-between">
                <span>Chamadas RPC (sessão atual, max 500)</span>
                <span className="text-xs text-muted-foreground">capturado via interceptor</span>
              </CardTitle>
            </CardHeader>
            <CardContent className="flex-1 min-h-0 p-0">
              <ScrollArea className="h-full">
                <table className="w-full text-xs">
                  <thead className="sticky top-0 bg-card border-b">
                    <tr className="text-left text-muted-foreground">
                      <th className="px-2 py-1.5">Hora</th>
                      <th className="px-2 py-1.5">Função</th>
                      <th className="px-2 py-1.5">Status</th>
                      <th className="px-2 py-1.5 text-right">Duração</th>
                      <th className="px-2 py-1.5">Args / Erro / Preview</th>
                    </tr>
                  </thead>
                  <tbody className="font-mono">
                    {rpcFiltered.map((r) => (
                      <tr key={r.id} className="border-b hover:bg-accent/30 align-top">
                        <td className="px-2 py-1 whitespace-nowrap text-muted-foreground">{fmtTime(r.started_at)}</td>
                        <td className="px-2 py-1 font-semibold text-primary">{r.fn_name}</td>
                        <td className="px-2 py-1"><Badge variant={statusVariant(r.status)} className="text-[10px]">{r.status}</Badge></td>
                        <td className="px-2 py-1 text-right tabular-nums">{r.duration_ms != null ? `${r.duration_ms}ms` : "..."}</td>
                        <td className="px-2 py-1 max-w-[500px]">
                          {r.error ? (
                            <span className="text-destructive text-[11px]">{r.error}</span>
                          ) : (
                            <details>
                              <summary className="cursor-pointer text-[11px] text-muted-foreground">
                                {JSON.stringify(r.args).slice(0, 80)}
                              </summary>
                              <pre className="text-[10px] whitespace-pre-wrap mt-1 p-2 bg-muted rounded">
                                args: {JSON.stringify(r.args, null, 2)}
                                {r.result_preview && `\n\nresult: ${r.result_preview}`}
                              </pre>
                            </details>
                          )}
                        </td>
                      </tr>
                    ))}
                    {rpcFiltered.length === 0 && (
                      <tr><td colSpan={5} className="text-center py-6 text-muted-foreground">Nenhuma RPC capturada ainda. Interaja com o sistema.</td></tr>
                    )}
                  </tbody>
                </table>
              </ScrollArea>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
