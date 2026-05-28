import React, { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuthContext } from "@/contexts/AuthContext";
import { useExchangeRates } from "@/contexts/ExchangeRatesContext";
 import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
 import {
   Select,
   SelectContent,
   SelectItem,
   SelectTrigger,
   SelectValue,
 } from "@/components/ui/select";
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
import { explainRpcCall } from "@/lib/dev/rpcExplain";
 import { Activity, AlertTriangle, Database, Receipt, Wallet, Zap, Trash2, Pause, Play, HelpCircle, ArrowRight, History, Search, CheckCircle2, ChevronDown, ChevronUp } from "lucide-react";
import { getTabWorkspaceId, getTabId } from "@/lib/tabWorkspace";
 import {
   Tooltip,
   TooltipContent,
   TooltipTrigger,
 } from "@/components/ui/tooltip";
 import {
   Dialog,
   DialogContent,
   DialogHeader,
   DialogTitle,
 } from "@/components/ui/dialog";
  // ─── Workspaces Hook (for System Owner) ───
  function useWorkspaces(enabled: boolean) {
    return useQuery({
      queryKey: ["dev-monitor", "workspaces"],
      queryFn: async () => {
        const { data, error } = await supabase
          .from("workspaces")
          .select("id, name")
          .order("name");
        if (error) throw error;
        return data ?? [];
      },
      enabled,
    });
  }
 
  // ─── Reconciliation Hook ───
  function useReconciliation(workspaceId: string | null, enabled: boolean) {
   return useQuery({
     queryKey: ["dev-monitor", "reconciliation"],
      queryFn: async () => {
        const { data, error } = await supabase.rpc("fn_reconciliar_saldos_bookmakers", { 
          p_workspace_id: workspaceId 
        });
        if (error) throw error;
        return data ?? [];
      },
      refetchInterval: enabled ? POLL_MS * 5 : false,
   });
 }
 
 // ─── Deep Ledger Hook ───
 function useDeepLedger(bookmakerId: string | null, enabled: boolean) {
   return useQuery({
     queryKey: ["dev-monitor", "deep-ledger", bookmakerId],
     queryFn: async () => {
       if (!bookmakerId) return [];
       const { data, error } = await supabase.rpc("fn_ledger_profundo_bookmaker", { p_bookmaker_id: bookmakerId });
       if (error) throw error;
       return data ?? [];
     },
     enabled: enabled && !!bookmakerId,
   });
 }
 
 // ─── Deep Ledger View Component ───
  function DeepLedgerView({ bookmakerId, bookmakerNome, onClose }: { bookmakerId: string; bookmakerNome: string; onClose: () => void }) {
    const deepLedger = useDeepLedger(bookmakerId, true);
    const [expandedLedgerId, setExpandedLedgerId] = useState<string | null>(null);
 
   return (
     <Dialog open={!!bookmakerId} onOpenChange={(open) => !open && onClose()}>
       <DialogContent className="max-w-5xl h-[90vh] flex flex-col">
         <DialogHeader>
           <DialogTitle className="flex items-center gap-2">
             <History className="h-5 w-5 text-primary" />
             Linha do Tempo (Deep Ledger) — {bookmakerNome}
           </DialogTitle>
         </DialogHeader>
         <div className="flex-1 min-h-0 overflow-hidden mt-4">
           {deepLedger.isLoading ? (
             <div className="flex items-center justify-center h-full">Carregando histórico...</div>
           ) : (
             <ScrollArea className="h-full">
               <table className="w-full text-xs">
                 <thead className="sticky top-0 bg-background border-b z-10">
                   <tr className="text-left text-muted-foreground">
                     <th className="px-2 py-2">Data/Hora</th>
                      <th className="px-2 py-2">Tipo / ID</th>
                      <th className="px-2 py-2 text-right">Stake/Retorno</th>
                      <th className="px-2 py-2 text-right">Saldo Antes</th>
                      <th className="px-2 py-2 text-right font-bold text-primary bg-primary/5">Saldo Depois (Ledger)</th>
                      <th className="px-2 py-2 text-right text-muted-foreground italic">Saldo Depois (Audit)</th>
                      <th className="px-2 py-2">Observação</th>
                   </tr>
                 </thead>
                 <tbody className="font-mono">
                    {deepLedger.data?.map((r: any) => {
                      const isDivergent = r.audit_saldo_novo !== null && Math.abs(r.audit_saldo_novo - r.running_balance) > 0.01;
                      const isExpanded = expandedLedgerId === r.ledger_id;
                      
                      // Ciclo de Aposta Logic
                      const isSettlement = ['APOSTA_GREEN', 'APOSTA_MEIO_GREEN', 'APOSTA_RED', 'APOSTA_MEIO_RED', 'APOSTA_VOID', 'APOSTA_REEMBOLSO', 'PAYOUT'].includes(r.tipo_transacao);
                      let stakeRow = null;
                      if (isSettlement && r.referencia_id) {
                        stakeRow = deepLedger.data.find((s: any) => 
                          s.referencia_id === r.referencia_id && 
                          (s.tipo_transacao === 'STAKE' || s.tipo_transacao === 'APOSTA_STAKE')
                        );
                      }

                      return (
                        <React.Fragment key={r.ledger_id}>
                        <tr 
                          className={`border-b hover:bg-accent/30 cursor-pointer transition-colors ${isDivergent ? 'bg-destructive/5' : ''} ${isExpanded ? 'bg-primary/5' : ''}`}
                          onClick={() => setExpandedLedgerId(isExpanded ? null : r.ledger_id)}
                        >
                         <td className="px-2 py-1 whitespace-nowrap text-muted-foreground">{fmtTime(r.created_at)}</td>
                          <td className="px-2 py-1 whitespace-nowrap">
                            <Badge variant={r.tipo_transacao === 'STAKE' ? 'outline' : 'secondary'} className="text-[9px] font-bold">
                              {r.tipo_transacao}
                            </Badge>
                          </td>
                          <td className={`px-2 py-1 text-right tabular-nums font-semibold group relative ${r.impacto < 0 ? 'text-destructive' : 'text-emerald-500'}`}>
                            <div className="flex items-center justify-end gap-1">
                              {r.impacto > 0 ? '+' : ''}{fmtMoney(r.impacto, r.moeda)}
                              {isExpanded ? <ChevronUp className="h-3 w-3 opacity-50" /> : <ChevronDown className="h-3 w-3 opacity-0 group-hover:opacity-50" />}
                            </div>
                          </td>
                          <td className="px-2 py-1 text-right tabular-nums text-muted-foreground italic">
                            {fmtMoney(r.audit_saldo_anterior, r.moeda)}
                          </td>
                         <td className="px-2 py-1 text-right tabular-nums font-bold bg-primary/5">
                           {fmtMoney(r.running_balance, r.moeda)}
                         </td>
                         <td className="px-2 py-1 text-right tabular-nums text-muted-foreground italic">
                           {fmtMoney(r.audit_saldo_anterior, r.moeda)}
                         </td>
                         <td className={`px-2 py-1 text-right tabular-nums ${isDivergent ? 'text-destructive font-bold' : 'text-muted-foreground italic'}`}>
                           {fmtMoney(r.audit_saldo_novo, r.moeda)}
                           {isDivergent && (
                             <Tooltip>
                               <TooltipTrigger asChild>
                                 <AlertTriangle className="h-3 w-3 inline ml-1 text-destructive" />
                               </TooltipTrigger>
                               <TooltipContent>
                                 Divergência detectada! O audit registrou {fmtMoney(r.audit_saldo_novo, r.moeda)} mas o cálculo real do ledger aponta {fmtMoney(r.running_balance, r.moeda)}.
                               </TooltipContent>
                             </Tooltip>
                           )}
                         </td>
                          <td className="px-2 py-1 text-muted-foreground text-[10px] max-w-[150px] truncate" title={r.descricao}>
                            {r.descricao || '—'}
                          </td>
                        </tr>
                        {isExpanded && (
                          <tr className="bg-primary/5 border-b">
                            <td colSpan={7} className="px-4 py-3">
                              <div className="flex flex-col gap-2 max-w-md ml-auto">
                                <h4 className="text-[10px] font-bold uppercase text-primary mb-1 flex items-center gap-1">
                                  <Receipt className="h-3 w-3" /> Decomposição do Ciclo de Operação
                                </h4>
                                
                                {stakeRow ? (
                                  <div className="space-y-1 text-xs border-l-2 border-primary/20 pl-3 py-1">
                                    <div className="flex justify-between">
                                      <span className="text-muted-foreground">Saldo antes da aposta:</span>
                                      <span className="font-semibold">{fmtMoney(stakeRow.audit_saldo_anterior, r.moeda)}</span>
                                    </div>
                                    <div className="flex justify-between text-destructive">
                                      <span>(-) Stake reservado:</span>
                                      <span className="font-bold">{fmtMoney(Math.abs(stakeRow.impacto), r.moeda)}</span>
                                    </div>
                                    <div className="flex justify-between border-t border-primary/10 pt-1">
                                      <span className="text-muted-foreground italic">(=) Remanescente durante aposta:</span>
                                      <span className="italic">{fmtMoney(Number(stakeRow.audit_saldo_anterior) - Math.abs(Number(stakeRow.impacto)), r.moeda)}</span>
                                    </div>
                                    <div className="flex justify-between text-emerald-500 font-medium">
                                      <span>(+) Retorno recebido:</span>
                                      <span>{fmtMoney(r.impacto, r.moeda)}</span>
                                    </div>
                                    <div className="flex justify-between border-t-2 border-primary/20 pt-1 font-bold">
                                      <span>Saldo final:</span>
                                      <span>{fmtMoney(r.audit_saldo_novo, r.moeda)}</span>
                                    </div>
                                    <div className={`flex justify-between text-[11px] mt-1 p-1 rounded ${Number(r.impacto) - Math.abs(Number(stakeRow.impacto)) >= 0 ? 'bg-emerald-500/10 text-emerald-600' : 'bg-destructive/10 text-destructive'}`}>
                                      <span className="font-bold">(=) Delta líquido da operação:</span>
                                      <span className="font-black">{fmtMoney(Number(r.impacto) - Math.abs(Number(stakeRow.impacto)), r.moeda)}</span>
                                    </div>
                                  </div>
                                ) : (
                                  <div className="space-y-1 text-xs border-l-2 border-primary/20 pl-3 py-1">
                                    <div className="flex justify-between">
                                      <span className="text-muted-foreground">Saldo antes:</span>
                                      <span className="font-semibold">{fmtMoney(r.audit_saldo_anterior, r.moeda)}</span>
                                    </div>
                                    <div className="flex justify-between">
                                      <span className="text-muted-foreground">Impacto direto:</span>
                                      <span className={`font-bold ${r.impacto < 0 ? 'text-destructive' : 'text-emerald-500'}`}>
                                        {r.impacto > 0 ? '+' : ''}{fmtMoney(r.impacto, r.moeda)}
                                      </span>
                                    </div>
                                    <div className="flex justify-between border-t border-primary/20 pt-1 font-bold">
                                      <span>Saldo final:</span>
                                      <span>{fmtMoney(r.audit_saldo_novo, r.moeda)}</span>
                                    </div>
                                    <p className="text-[9px] text-muted-foreground mt-2 italic">
                                      {isSettlement ? "* Stake correspondente não encontrado no histórico recente para decomposição completa." : "* Operação avulsa (não vinculada a ciclo de aposta detectado)."}
                                    </p>
                                  </div>
                                )}
                              </div>
                            </td>
                          </tr>
                        )}
                        </React.Fragment>
                      );
                    })}
                 </tbody>
               </table>
             </ScrollArea>
           )}
         </div>
       </DialogContent>
     </Dialog>
   );
 }
 

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

   // ─── Cash Ledger Stream (Filtered by Workspace) ───
   function useCashLedger(workspaceId: string | null, enabled: boolean) {
  return useQuery({
      queryKey: ["dev-monitor", "cash-ledger", workspaceId],
    queryFn: async () => {
        let query = supabase
        .from("cash_ledger")
          .select("id, created_at, data_transacao, tipo_transacao, status, moeda, valor, descricao, origem_tipo, destino_tipo, origem_bookmaker_id, destino_bookmaker_id, projeto_id_snapshot, balance_processed_at, reversed_at, moeda_origem, valor_origem, moeda_destino, valor_destino, qtd_coin, coin, cotacao, cotacao_origem_usd, cotacao_destino_usd");
        
        if (workspaceId) {
          query = query.eq("workspace_id", workspaceId);
        }

        const { data, error } = await query
          .order("created_at", { ascending: false })
          .limit(100);

      if (error) throw error;
      return data ?? [];
    },
    refetchInterval: enabled ? POLL_MS : false,
    refetchIntervalInBackground: true,
  });
}

   // ─── Apostas Stream (Filtered by Workspace) ───
   function useApostas(workspaceId: string | null, enabled: boolean) {
  return useQuery({
      queryKey: ["dev-monitor", "apostas", workspaceId],
    queryFn: async () => {
        let query = supabase
        .from("apostas_unificada")
          .select("id, created_at, updated_at, estrategia, status, resultado, evento, stake, moeda_operacao, lucro_prejuizo, projeto_id, bookmaker_id");

        if (workspaceId) {
          query = query.eq("workspace_id", workspaceId);
        }

        const { data, error } = await query
          .order("updated_at", { ascending: false })
          .limit(100);

      if (error) throw error;
      return data ?? [];
    },
    refetchInterval: enabled ? POLL_MS : false,
    refetchIntervalInBackground: true,
  });
}

   // ─── Auditoria de edição de apostas ───
   function useApostaEditAudit(workspaceId: string | null, enabled: boolean) {
  return useQuery({
      queryKey: ["dev-monitor", "aposta-edit-audit", workspaceId],
    queryFn: async () => {
        let query = (supabase as any)
        .from("aposta_edit_audit_logs")
          .select("id, created_at, aposta_id, projeto_id, bookmaker_id, actor_user_id, status_before, resultado_before, status_after, resultado_after, changed_fields, bookmaker_balance_before, bookmaker_balance_after, before_data, after_data, ledger_before, ledger_after, success, error_message");

        if (workspaceId) query = query.eq("workspace_id", workspaceId);

        const { data, error } = await query.order("created_at", { ascending: false }).limit(100);
      if (error) throw error;
      return data ?? [];
    },
    refetchInterval: enabled ? POLL_MS : false,
    refetchIntervalInBackground: true,
  });
}

   // ─── Bookmaker Saldos (Filtered by Workspace) ───
   function useBookmakerSaldos(workspaceId: string | null, enabled: boolean) {
  return useQuery({
      queryKey: ["dev-monitor", "bookmakers", workspaceId],
    queryFn: async () => {
        let query = supabase
        .from("bookmakers")
          .select("id, nome, moeda, saldo_atual, saldo_freebet, saldo_bonus, status, projeto_id, updated_at");

        if (workspaceId) {
          query = query.eq("workspace_id", workspaceId);
        }

        const { data, error } = await query
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

  const AUTHORIZED_EMAILS = ['lu-lipe@hotmail.com', 'labbetconsultoria@gmail.com'];

  export default function DevLedgerMonitor() {
    const { user, isSystemOwner: originalIsSystemOwner, initialized, workspaceId, role } = useAuthContext();
    
    // System Owner check: either flag is true or email is in the authorized list
    const isSystemOwner = Boolean(originalIsSystemOwner || (user?.email && AUTHORIZED_EMAILS.includes(user.email)));

    const [selectedFilterWs, setSelectedFilterWs] = useState<string | null>(null);

    // Initialize filter workspace: if System Owner, default to null (All Workspaces), else current workspaceId
    useEffect(() => {
      if (initialized && !selectedFilterWs) {
        setSelectedFilterWs(isSystemOwner ? null : workspaceId);
      }
    }, [initialized, isSystemOwner, workspaceId]);

  const navigate = useNavigate();
  const [paused, setPaused] = useState(false);
  const [filter, setFilter] = useState("");
  const [rpcExplainedMode, setRpcExplainedMode] = useState(true);
   const [selectedBookmaker, setSelectedBookmaker] = useState<{ id: string; nome: string } | null>(null);
  const { getRate } = useExchangeRates();

   // Authorized workspace IDs
   const AUTHORIZED_WORKSPACES = ['f8b6f7ce-92b9-4d26-899a-0f0eeb1324cd', 'feee9758-a7f4-474c-b2b1-679b66ec1cd9'];
   const isAuthorized = isSystemOwner || (workspaceId && AUTHORIZED_WORKSPACES.includes(workspaceId) && (role === 'owner' || role === 'admin'));
 
   // Hard guard — authorized users only
   useEffect(() => {
     if (initialized && (!user || !isAuthorized)) {
       navigate("/", { replace: true });
     }
   }, [initialized, user, isAuthorized, navigate]);
 
    const enabled = !paused && isAuthorized;
    
    // Effective workspaceId to use for queries
    const effectiveWorkspaceId = isSystemOwner ? selectedFilterWs : workspaceId;

    const ledger = useCashLedger(effectiveWorkspaceId, enabled);
    const apostas = useApostas(effectiveWorkspaceId, enabled);
    const apostaEditAudit = useApostaEditAudit(effectiveWorkspaceId, enabled);
    const bookmakers = useBookmakerSaldos(effectiveWorkspaceId, enabled);
    const reconciliation = useReconciliation(effectiveWorkspaceId, enabled);

   const workspacesList = useWorkspaces(isSystemOwner && enabled);
  const rpcLogs = useRpcLogs();

  // Snapshots de cotação congelados por bookmaker (último ledger CONFIRMADO)
  const bookmakerIds = useMemo(
    () => (bookmakers.data ?? []).map((b) => b.id),
    [bookmakers.data]
  );
  const cotacaoSnapshots = useBookmakerCotacaoSnapshots(bookmakerIds, enabled);

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

  const apostaEditAuditFiltered = useMemo(
    () => (apostaEditAudit.data ?? []).filter((r: any) =>
      filterFn(`${r.aposta_id} ${(r.changed_fields ?? []).join(" ")} ${r.status_before} ${r.resultado_before} ${r.status_after} ${r.resultado_after}`)
    ),
    [apostaEditAudit.data, filter]
  );

  const bookmakersFiltered = useMemo(
    () => (bookmakers.data ?? []).filter((r) => filterFn(`${r.nome} ${r.moeda} ${r.status}`)),
    [bookmakers.data, filter]
  );
 
   const reconciliationFiltered = useMemo(
     () => (reconciliation.data ?? []).filter((r: any) => filterFn(`${r.nome} ${r.moeda} ${r.status_reconciliacao}`)),
     [reconciliation.data, filter]
   );

  const rpcFiltered = useMemo(
    () => rpcLogs.filter((r) => {
      const explanation = explainRpcCall(r);
      return filterFn(`${r.fn_name} ${r.status} ${r.error ?? ""} ${explanation.name} ${explanation.description} ${explanation.impactLabel}`);
    }),
    [rpcLogs, filter]
  );

  if (!initialized) {
    return <div className="p-8 text-muted-foreground">Carregando...</div>;
  }

   if (!isAuthorized) {
    return null;
  }

  return (
    <div className="p-4 space-y-4 h-full flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-6">
          <div className="flex items-center gap-3">
            <Activity className="h-6 w-6 text-primary" />
            <div>
              <h1 className="text-xl font-bold">Ledger Monitor</h1>
               <p className="text-xs text-muted-foreground">
                  {isSystemOwner ? "System Owner" : "Restricted Access"} · Polling {POLL_MS / 1000}s · {paused ? "Pausado" : "Ao vivo"}
               </p>
            </div>
          </div>

          {/* Global Workspace Selector */}
          <div className="flex items-center gap-3 bg-accent/20 px-4 py-2 rounded-lg border border-primary/10">
            {isSystemOwner ? (
              <div className="flex items-center gap-3">
                <div className="flex flex-col">
                  <Label className="text-[10px] text-muted-foreground uppercase font-black tracking-wider">Workspace Ativo</Label>
                  {!selectedFilterWs && (
                    <Badge variant="outline" className="mt-0.5 bg-orange-500/10 text-orange-600 border-orange-500/20 text-[9px] font-bold h-4">
                      GLOBAL
                    </Badge>
                  )}
                </div>
                <Select 
                  value={selectedFilterWs || 'ALL'} 
                  onValueChange={(v) => setSelectedFilterWs(v === 'ALL' ? null : v)}
                >
                  <SelectTrigger className="h-9 text-xs min-w-[220px] w-auto bg-background/50 border-primary/20 hover:border-primary/40 transition-colors">
                    <SelectValue placeholder="Todos os Workspaces" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ALL" className="font-bold text-orange-600">Todos os Workspaces (Global)</SelectItem>
                    {workspacesList.data?.map(ws => (
                      <SelectItem key={ws.id} value={ws.id}>{ws.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            ) : (
              <div className="flex flex-col">
                <Label className="text-[10px] text-muted-foreground uppercase font-black tracking-wider">Workspace</Label>
                <Badge variant="outline" className="mt-0.5 text-xs h-6 px-3 bg-primary/5 border-primary/20 font-semibold">
                  {workspacesList.data?.find(w => w.id === workspaceId)?.name || '...'}
                </Badge>
              </div>
            )}
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
      <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
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
              <History className="h-4 w-4 text-orange-500" />
              <div>
                <div className="text-xs text-muted-foreground">Edições auditadas</div>
                <div className="text-lg font-bold tabular-nums">{apostaEditAudit.data?.length ?? 0}</div>
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
          <TabsTrigger value="edit-audit">Auditoria Edição</TabsTrigger>
          <TabsTrigger value="bookmakers">Saldos Bookmakers</TabsTrigger>
          <TabsTrigger value="reconciliacao">
            Reconciliação
            {reconciliation.data?.some((r: any) => r.status_reconciliacao.includes('DIVERTENTE')) && (
              <AlertTriangle className="h-3 w-3 ml-1 text-destructive animate-pulse" />
            )}
          </TabsTrigger>
          <TabsTrigger value="rpc">RPCs</TabsTrigger>
        </TabsList>

          {/* Auditoria Edição de Apostas */}
          <TabsContent value="edit-audit" className="flex-1 min-h-0 mt-2">
            <Card className="h-full flex flex-col">
              <CardHeader className="py-2 border-b mb-2">
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="text-sm">Auditoria de Edição de Apostas</CardTitle>
                    <CardDescription className="text-[11px]">
                      Snapshots before/after de cada edição via RPC <code>editar_aposta_simples_segura</code>, incluindo ledger e saldo do bookmaker.
                    </CardDescription>
                  </div>
                  {apostaEditAudit.isFetching && (
                    <span className="text-[10px] text-muted-foreground animate-pulse italic uppercase font-bold">
                      carregando...
                    </span>
                  )}
                </div>
              </CardHeader>
              <CardContent className="flex-1 min-h-0 p-0">
                <ScrollArea className="h-full">
                  <table className="w-full text-xs">
                    <thead className="sticky top-0 bg-card border-b z-10">
                      <tr className="text-left text-muted-foreground">
                        <th className="px-2 py-1.5">Quando</th>
                        <th className="px-2 py-1.5">Aposta</th>
                        <th className="px-2 py-1.5">Status (antes → depois)</th>
                        <th className="px-2 py-1.5">Resultado (antes → depois)</th>
                        <th className="px-2 py-1.5">Campos alterados</th>
                        <th className="px-2 py-1.5 text-right">Saldo Bookmaker (antes → depois)</th>
                        <th className="px-2 py-1.5 text-right">Δ Ledger</th>
                        <th className="px-2 py-1.5">OK?</th>
                      </tr>
                    </thead>
                    <tbody className="font-mono">
                      {(apostaEditAudit.data ?? []).length === 0 && (
                        <tr>
                          <td colSpan={8} className="px-2 py-6 text-center text-muted-foreground">
                            Nenhuma edição auditada ainda. Edite uma aposta liquidada para gerar um registro aqui.
                          </td>
                        </tr>
                      )}
                      {(apostaEditAudit.data ?? []).map((row: any) => {
                        const changed: string[] = Array.isArray(row.changed_fields)
                          ? row.changed_fields
                          : (row.changed_fields ? Object.keys(row.changed_fields) : []);
                        const ledgerBeforeCount = Array.isArray(row.ledger_before) ? row.ledger_before.length : 0;
                        const ledgerAfterCount = Array.isArray(row.ledger_after) ? row.ledger_after.length : 0;
                        const deltaLedger = ledgerAfterCount - ledgerBeforeCount;
                        return (
                          <tr key={row.id} className={`border-b hover:bg-accent/30 ${row.success === false ? 'bg-destructive/10' : ''}`}>
                            <td className="px-2 py-2 text-muted-foreground whitespace-nowrap">{fmtTime(row.created_at)}</td>
                            <td className="px-2 py-2 text-[10px]" title={row.aposta_id}>{String(row.aposta_id).slice(0, 8)}…</td>
                            <td className="px-2 py-2">
                              <span className="text-muted-foreground">{row.status_before ?? '—'}</span>
                              <span className="mx-1">→</span>
                              <span className="font-semibold">{row.status_after ?? '—'}</span>
                            </td>
                            <td className="px-2 py-2">
                              <span className="text-muted-foreground">{row.resultado_before ?? '—'}</span>
                              <span className="mx-1">→</span>
                              <span className="font-semibold">{row.resultado_after ?? '—'}</span>
                            </td>
                            <td className="px-2 py-2 max-w-[280px]">
                              <div className="flex flex-wrap gap-1">
                                {changed.length === 0 && <span className="text-muted-foreground">—</span>}
                                {changed.map((f) => (
                                  <Badge key={f} variant="outline" className="text-[9px] px-1 py-0">{f}</Badge>
                                ))}
                              </div>
                            </td>
                            <td className="px-2 py-2 text-right tabular-nums">
                              <span className="text-muted-foreground">{Number(row.bookmaker_balance_before ?? 0).toFixed(2)}</span>
                              <span className="mx-1">→</span>
                              <span className="font-semibold">{Number(row.bookmaker_balance_after ?? 0).toFixed(2)}</span>
                            </td>
                            <td className={`px-2 py-2 text-right tabular-nums font-bold ${deltaLedger === 0 ? 'text-muted-foreground' : deltaLedger > 0 ? 'text-emerald-500' : 'text-orange-500'}`}>
                              {deltaLedger > 0 ? '+' : ''}{deltaLedger}
                            </td>
                            <td className="px-2 py-2">
                              {row.success === false ? (
                                <Badge variant="destructive" className="text-[10px]" title={row.error_message ?? ''}>FALHA</Badge>
                              ) : (
                                <Badge variant="default" className="text-[10px]">OK</Badge>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </ScrollArea>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Reconciliação */}
          <TabsContent value="reconciliacao" className="flex-1 min-h-0 mt-2">
            <Card className="h-full flex flex-col">
              <CardHeader className="py-2 border-b mb-2">
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="text-sm">Auditoria de Integridade (Ledger vs Saldo Atual)</CardTitle>
                    <CardDescription className="text-[11px]">
                      Soma histórica do Ledger comparada ao campo `saldo_atual` do banco.
                    </CardDescription>
                  </div>
                  
                  <div className="flex items-center gap-4">
                    <div className="flex items-center gap-2">
                      {reconciliation.isFetching && <span className="text-[10px] text-muted-foreground animate-pulse italic uppercase font-bold">recalculando ledger...</span>}
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <HelpCircle className="h-4 w-4 text-muted-foreground cursor-help" />
                        </TooltipTrigger>
                        <TooltipContent className="max-w-[300px]">
                          Esta aba compara o `saldo_atual` registrado no banco com a soma real de todas as entradas do Ledger.
                          Divergências indicam falhas em triggers ou atualizações manuais indevidas.
                        </TooltipContent>
                      </Tooltip>
                    </div>
                  </div>
                </div>
              </CardHeader>
            <CardContent className="flex-1 min-h-0 p-0">
              <ScrollArea className="h-full">
                <table className="w-full text-xs">
                  <thead className="sticky top-0 bg-card border-b z-10">
                    <tr className="text-left text-muted-foreground">
                      <th className="px-2 py-1.5">Bookmaker</th>
                      <th className="px-2 py-1.5">Moeda</th>
                      <th className="px-2 py-1.5 text-right">Saldo Registrado</th>
                      <th className="px-2 py-1.5 text-right">Saldo Calculado (Ledger)</th>
                       <th className="px-2 py-1.5 text-right font-bold">Delta</th>
                       <th className="px-2 py-1.5 text-right text-orange-500">Stake Risco</th>
                       <th className="px-2 py-1.5">Status</th>
                      <th className="px-2 py-1.5">Última Transação</th>
                      <th className="px-2 py-1.5">Ações</th>
                    </tr>
                  </thead>
                  <tbody className="font-mono">
                    {reconciliationFiltered.map((r: any) => (
                      <tr key={r.bookmaker_id} className={`border-b hover:bg-accent/30 ${r.status_reconciliacao.includes('DIVERTENTE') ? 'bg-destructive/5' : ''}`}>
                        <td className="px-2 py-2 font-semibold">{r.nome}</td>
                        <td className="px-2 py-2">{r.moeda}</td>
                        <td className="px-2 py-2 text-right tabular-nums">{fmtMoney(r.saldo_registrado, r.moeda)}</td>
                        <td className="px-2 py-2 text-right tabular-nums text-primary/80">{fmtMoney(r.saldo_calculado, r.moeda)}</td>
                         <td className={`px-2 py-2 text-right tabular-nums font-bold ${Math.abs(r.delta) > 0.01 ? 'text-destructive' : 'text-emerald-500'}`}>
                           {r.delta > 0 ? '+' : ''}{fmtMoney(r.delta, r.moeda)}
                         </td>
                         <td className="px-2 py-2 text-right tabular-nums text-orange-500 font-semibold">
                           {fmtMoney(r.stake_em_risco, r.moeda)}
                         </td>
                        <td className="px-2 py-2">
                          <Badge variant={r.status_reconciliacao.includes('OK') ? 'default' : 'destructive'} className="text-[10px] whitespace-nowrap">
                            {r.status_reconciliacao}
                          </Badge>
                        </td>
                        <td className="px-2 py-2 text-muted-foreground whitespace-nowrap">{fmtTime(r.last_transaction_at)}</td>
                        <td className="px-2 py-2">
                          <Button 
                            variant="outline" 
                            size="sm" 
                            className="h-7 text-[10px] px-2"
                            onClick={() => setSelectedBookmaker({ id: r.bookmaker_id, nome: r.nome })}
                          >
                            <Search className="h-3 w-3 mr-1" /> Deep Ledger
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </ScrollArea>
            </CardContent>
          </Card>
        </TabsContent>
 
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
                      // Conversão usa SNAPSHOT congelado (cotacao_destino_usd do último cash_ledger
                      // confirmado) para garantir paridade com o histórico. Fallback: cotação live.
                      const saldo = Number(r.saldo_atual ?? 0);
                      const snap = cotacaoSnapshots.data?.[r.id] ?? null;
                      const usdRateLive = getRate("USD");
                      const fromRateLive = getRate(r.moeda);

                      let valorUSD: number | null = null;
                      let valorBRL: number | null = null;
                      let cotacaoSource: "snapshot" | "live" | "none" = "none";
                      let cotacaoUsadaUsd: number | null = null;
                      let cotacaoCapturedAt: string | null = null;

                      if (snap) {
                        // SNAPSHOT: cotação congelada (1 unidade da moeda nativa = X USD)
                        cotacaoSource = "snapshot";
                        cotacaoUsadaUsd = snap.cotacaoUsd;
                        cotacaoCapturedAt = snap.capturedAt;
                        if (r.moeda === "USD") {
                          valorUSD = saldo;
                        } else {
                          valorUSD = saldo * snap.cotacaoUsd;
                        }
                        if (usdRateLive && usdRateLive > 0) {
                          valorBRL = (valorUSD ?? 0) * usdRateLive;
                        }
                      } else if (fromRateLive && fromRateLive > 0) {
                        // LIVE fallback (sem snapshot histórico)
                        cotacaoSource = "live";
                        valorBRL = saldo * fromRateLive;
                        valorUSD =
                          usdRateLive && usdRateLive > 0 ? valorBRL / usdRateLive : null;
                        cotacaoUsadaUsd =
                          usdRateLive && usdRateLive > 0 ? fromRateLive / usdRateLive : null;
                      }

                      const rateInfo =
                        cotacaoSource === "snapshot" && cotacaoUsadaUsd
                          ? `📌 Snapshot: 1 ${r.moeda} = ${cotacaoUsadaUsd.toFixed(4)} USD${cotacaoCapturedAt ? ` · capturado ${new Date(cotacaoCapturedAt).toLocaleString("pt-BR")}` : ""}`
                          : cotacaoSource === "live" && cotacaoUsadaUsd
                            ? `⚡ Cotação live: 1 ${r.moeda} = ${cotacaoUsadaUsd.toFixed(4)} USD (sem snapshot histórico)`
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
                                <span className={`cursor-help inline-flex items-center gap-1 ${cotacaoSource === "live" ? "text-amber-500/80" : ""}`}>
                                  {valorUSD != null ? fmtMoney(valorUSD, "USD") : "—"}
                                  {cotacaoSource === "live" && <span className="text-[9px]">⚡</span>}
                                  {cotacaoSource === "snapshot" && <span className="text-[9px] opacity-60">📌</span>}
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
                <div className="flex items-center gap-3 text-xs font-normal">
                  <div className="flex items-center gap-2">
                    <Switch id="rpc-mode" checked={rpcExplainedMode} onCheckedChange={setRpcExplainedMode} />
                    <Label htmlFor="rpc-mode" className="text-xs cursor-pointer">
                      {rpcExplainedMode ? "Modo explicado" : "Modo técnico"}
                    </Label>
                  </div>
                  <span className="text-muted-foreground">capturado via interceptor</span>
                </div>
              </CardTitle>
            </CardHeader>
            <CardContent className="flex-1 min-h-0 p-0">
              <ScrollArea className="h-full">
                <table className="w-full text-xs">
                  <thead className="sticky top-0 bg-card border-b">
                    <tr className="text-left text-muted-foreground">
                      <th className="px-2 py-1.5">Hora</th>
                      <th className="px-2 py-1.5">Função</th>
                      {rpcExplainedMode && <th className="px-2 py-1.5">Entendimento</th>}
                      <th className="px-2 py-1.5">Status</th>
                      <th className="px-2 py-1.5 text-right">Duração</th>
                      <th className="px-2 py-1.5">Args / Erro / Preview</th>
                    </tr>
                  </thead>
                  <tbody className="font-mono">
                    {rpcFiltered.map((r) => {
                      const explanation = explainRpcCall(r);
                      return (
                        <tr key={r.id} className="border-b hover:bg-accent/30 align-top">
                          <td className="px-2 py-1 whitespace-nowrap text-muted-foreground">{fmtTime(r.started_at)}</td>
                          <td className="px-2 py-1 font-semibold text-primary">
                            <div>{r.fn_name}</div>
                            {rpcExplainedMode && <div className="text-[10px] text-muted-foreground font-normal">{explanation.name}</div>}
                          </td>
                          {rpcExplainedMode && (
                            <td className="px-2 py-1 max-w-[340px]">
                              <div className="space-y-1 font-sans">
                                <div className="text-[11px] leading-snug">{explanation.description}</div>
                                <div className="flex flex-wrap items-center gap-1">
                                  <Badge variant={explanation.isCritical ? "destructive" : "outline"} className="text-[10px]">
                                    {explanation.impactLabel}
                                  </Badge>
                                  <Tooltip>
                                    <TooltipTrigger asChild>
                                      <span className="inline-flex items-center gap-1 text-[10px] text-muted-foreground cursor-help">
                                        <HelpCircle className="h-3 w-3" /> leitura leiga
                                      </span>
                                    </TooltipTrigger>
                                    <TooltipContent side="top" className="text-xs max-w-[280px]">
                                      Consulta apenas lê dados. Escrita altera registros. Financeiro crítico pode afetar saldo, aposta, ledger, vínculo ou liquidação.
                                    </TooltipContent>
                                  </Tooltip>
                                </div>
                              </div>
                            </td>
                          )}
                          <td className="px-2 py-1">
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Badge variant={statusVariant(r.status)} className="text-[10px] cursor-help">{rpcExplainedMode ? explanation.statusLabel : r.status}</Badge>
                              </TooltipTrigger>
                              <TooltipContent side="top" className="text-xs max-w-[260px]">{explanation.statusMeaning}</TooltipContent>
                            </Tooltip>
                          </td>
                          <td className="px-2 py-1 text-right tabular-nums">
                            <div>{r.duration_ms != null ? `${r.duration_ms}ms` : "..."}</div>
                            {rpcExplainedMode && <div className="text-[10px] text-muted-foreground font-sans">{explanation.durationLabel}</div>}
                          </td>
                          <td className="px-2 py-1 max-w-[520px]">
                            {rpcExplainedMode ? (
                              <details className="font-sans">
                                <summary className="cursor-pointer text-[11px] text-muted-foreground">
                                  {r.error ? "Ver erro explicado e dados técnicos" : "Ver dados enviados e retorno"}
                                </summary>
                                <div className="mt-2 space-y-2 text-[11px]">
                                  <div className="rounded bg-muted p-2">
                                    <div className="font-semibold mb-1">O que foi enviado</div>
                                    <div className="text-muted-foreground">{explanation.argsSummary}</div>
                                  </div>
                                  <div className="rounded bg-muted p-2">
                                    <div className="font-semibold mb-1">O que voltou</div>
                                    <div className={r.error ? "text-destructive" : "text-muted-foreground"}>
                                      {r.error ? explanation.errorMeaning : explanation.resultSummary}
                                    </div>
                                    {r.error && <div className="mt-1 font-mono text-[10px] text-destructive">{r.error}</div>}
                                  </div>
                                  <pre className="text-[10px] whitespace-pre-wrap p-2 bg-muted rounded font-mono">
                                    args: {JSON.stringify(r.args, null, 2)}
                                    {r.result_preview && `\n\nresult: ${r.result_preview}`}
                                  </pre>
                                </div>
                              </details>
                            ) : r.error ? (
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
                      );
                    })}
                    {rpcFiltered.length === 0 && (
                      <tr><td colSpan={rpcExplainedMode ? 6 : 5} className="text-center py-6 text-muted-foreground">Nenhuma RPC capturada ainda. Interaja com o sistema.</td></tr>
                    )}
                  </tbody>
                </table>
              </ScrollArea>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Deep Ledger Slide-over / Dialog */}
      {selectedBookmaker && (
        <DeepLedgerView 
          bookmakerId={selectedBookmaker.id} 
          bookmakerNome={selectedBookmaker.nome} 
          onClose={() => setSelectedBookmaker(null)} 
        />
      )}
    </div>
  );
}
