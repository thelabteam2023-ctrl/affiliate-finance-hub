/**
 * Dialog de encerramento de parceria com auditoria de pendências.
 * 
 * Lista todas as pendências operacionais do parceiro (saques, depósitos,
 * pagamentos, saldos em bookmakers) antes de permitir o encerramento.
 * Política: SEMPRE permite encerrar — apenas avisa o operador.
 */
import { useEffect, useState } from "react";
import { Loader2, AlertTriangle, ArrowDownLeft, ArrowUpRight, Wallet, HandCoins } from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { supabase } from "@/integrations/supabase/client";
import { useWorkspace } from "@/hooks/useWorkspace";
import type { ParceriaAlertaEncerramento } from "@/hooks/useCentralOperacoesData";

interface PendenciasParceiro {
  saquesPendentes: Array<{ id: string; valor: number; moeda: string; data: string }>;
  depositosPendentes: Array<{ id: string; valor: number; moeda: string; data: string }>;
  pagamentosPendentes: Array<{ id: string; valor: number; descricao: string | null }>;
  bookmakersComSaldo: Array<{ id: string; nome: string; saldo_atual: number; moeda: string }>;
}

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  parceria: ParceriaAlertaEncerramento | null;
  loading: boolean;
  onConfirm: () => void;
}

export function EncerrarParceriaDialog({ open, onOpenChange, parceria, loading, onConfirm }: Props) {
  const { workspaceId } = useWorkspace();
  const [pendencias, setPendencias] = useState<PendenciasParceiro | null>(null);
  const [loadingPendencias, setLoadingPendencias] = useState(false);

  useEffect(() => {
    if (!open || !parceria || !workspaceId) {
      setPendencias(null);
      return;
    }

    const fetchPendencias = async () => {
      setLoadingPendencias(true);
      try {
        const parceiroId = parceria.parceiro_id;

        const [saquesRes, depositosRes, pagamentosRes, bookmakersRes] = await Promise.all([
          supabase
            .from("cash_ledger")
            .select("id, valor, moeda, data_transacao")
            .eq("workspace_id", workspaceId)
            .eq("tipo_transacao", "SAQUE")
            .eq("status", "PENDENTE")
            .or(`origem_parceiro_id.eq.${parceiroId},destino_parceiro_id.eq.${parceiroId}`),
          supabase
            .from("cash_ledger")
            .select("id, valor, moeda, data_transacao")
            .eq("workspace_id", workspaceId)
            .eq("tipo_transacao", "DEPOSITO")
            .eq("status", "PENDENTE")
            .or(`origem_parceiro_id.eq.${parceiroId},destino_parceiro_id.eq.${parceiroId}`),
          supabase
            .from("pagamentos_parceiros" as any)
            .select("id, valor, descricao")
            .eq("workspace_id", workspaceId)
            .eq("parceiro_id", parceiroId)
            .eq("status", "PENDENTE"),
          supabase
            .from("bookmakers")
            .select("id, nome, saldo_atual, moeda")
            .eq("workspace_id", workspaceId)
            .eq("parceiro_id", parceiroId)
            .gt("saldo_atual", 0),
        ]);

        setPendencias({
          saquesPendentes: (saquesRes.data || []).map((r: any) => ({
            id: r.id,
            valor: Number(r.valor),
            moeda: r.moeda,
            data: r.data_transacao,
          })),
          depositosPendentes: (depositosRes.data || []).map((r: any) => ({
            id: r.id,
            valor: Number(r.valor),
            moeda: r.moeda,
            data: r.data_transacao,
          })),
          pagamentosPendentes: (pagamentosRes.data as any[] || []).map((r) => ({
            id: r.id,
            valor: Number(r.valor),
            descricao: r.descricao,
          })),
          bookmakersComSaldo: (bookmakersRes.data || []).map((r: any) => ({
            id: r.id,
            nome: r.nome,
            saldo_atual: Number(r.saldo_atual),
            moeda: r.moeda,
          })),
        });
      } catch (err) {
        console.error("Erro ao carregar pendências:", err);
        setPendencias({ saquesPendentes: [], depositosPendentes: [], pagamentosPendentes: [], bookmakersComSaldo: [] });
      } finally {
        setLoadingPendencias(false);
      }
    };

    fetchPendencias();
  }, [open, parceria, workspaceId]);

  const totalPendencias = pendencias
    ? pendencias.saquesPendentes.length +
      pendencias.depositosPendentes.length +
      pendencias.pagamentosPendentes.length +
      pendencias.bookmakersComSaldo.length
    : 0;

  const fmt = (v: number, m: string) =>
    new Intl.NumberFormat("pt-BR", { style: "currency", currency: m === "USDT" ? "USD" : m, minimumFractionDigits: 2 })
      .format(v)
      .replace("US$", m === "USDT" ? "USDT" : "US$");

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent className="max-w-2xl max-h-[90vh] flex flex-col">
        <AlertDialogHeader className="flex-shrink-0">
          <AlertDialogTitle className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-amber-500" />
            Encerrar Parceria — {parceria?.parceiroNome}
          </AlertDialogTitle>
        </AlertDialogHeader>

        <div className="space-y-3 flex-1 min-h-0 flex flex-col overflow-hidden">
          {loadingPendencias ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              <span className="ml-2 text-sm text-muted-foreground">Auditando pendências...</span>
            </div>
          ) : totalPendencias === 0 ? (
            <div className="rounded-md border border-emerald-500/30 bg-emerald-500/5 p-4 text-sm">
              <p className="text-emerald-400">
                ✓ Nenhuma pendência operacional encontrada para este parceiro.
              </p>
              <p className="mt-1 text-muted-foreground">
                A parceria será marcada como ENCERRADA com data de fim real = hoje.
              </p>
            </div>
          ) : (
            <>
              <div className="rounded-md border border-amber-500/30 bg-amber-500/5 p-3 text-sm">
                <p className="font-semibold text-amber-400">
                  ⚠ Este parceiro possui {totalPendencias} pendência{totalPendencias > 1 ? "s" : ""} em aberto.
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Recomendamos resolver antes de encerrar. Você pode prosseguir, mas as pendências
                  permanecerão no Caixa Operacional vinculadas ao parceiro.
                </p>
              </div>

              <div className="space-y-3">
                {pendencias!.saquesPendentes.length > 0 && (
                  <Section
                    icon={<ArrowUpRight className="h-4 w-4 text-orange-400" />}
                    title="Saques pendentes"
                    count={pendencias!.saquesPendentes.length}
                  >
                    {pendencias!.saquesPendentes.map((s) => (
                      <Row key={s.id} label={new Date(s.data).toLocaleDateString("pt-BR")} value={fmt(s.valor, s.moeda)} />
                    ))}
                  </Section>
                )}

                {pendencias!.depositosPendentes.length > 0 && (
                  <Section
                    icon={<ArrowDownLeft className="h-4 w-4 text-blue-400" />}
                    title="Depósitos pendentes"
                    count={pendencias!.depositosPendentes.length}
                  >
                    {pendencias!.depositosPendentes.map((d) => (
                      <Row key={d.id} label={new Date(d.data).toLocaleDateString("pt-BR")} value={fmt(d.valor, d.moeda)} />
                    ))}
                  </Section>
                )}

                {pendencias!.pagamentosPendentes.length > 0 && (
                  <Section
                    icon={<HandCoins className="h-4 w-4 text-purple-400" />}
                    title="Pagamentos a parceiro pendentes"
                    count={pendencias!.pagamentosPendentes.length}
                  >
                    {pendencias!.pagamentosPendentes.map((p) => (
                      <Row key={p.id} label={p.descricao || "Pagamento"} value={fmt(p.valor, "BRL")} />
                    ))}
                  </Section>
                )}

                {pendencias!.bookmakersComSaldo.length > 0 && (
                  <Section
                    icon={<Wallet className="h-4 w-4 text-emerald-400" />}
                    title="Bookmakers com saldo"
                    count={pendencias!.bookmakersComSaldo.length}
                  >
                    {pendencias!.bookmakersComSaldo.map((b) => (
                      <Row key={b.id} label={b.nome} value={fmt(b.saldo_atual, b.moeda)} />
                    ))}
                  </Section>
                )}
              </div>
            </>
          )}
        </div>

        <AlertDialogFooter className="flex-shrink-0">
          <AlertDialogCancel disabled={loading}>Cancelar</AlertDialogCancel>
          <AlertDialogAction
            onClick={onConfirm}
            disabled={loading || loadingPendencias}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
          >
            {loading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
            {totalPendencias > 0 ? "Encerrar mesmo assim" : "Encerrar"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

function Section({ icon, title, count, children }: { icon: React.ReactNode; title: string; count: number; children: React.ReactNode }) {
  return (
    <div className="rounded-md border border-border/60 bg-muted/30 p-3">
      <div className="mb-2 flex items-center justify-between">
        <div className="flex items-center gap-2 text-sm font-medium">
          {icon}
          {title}
        </div>
        <Badge variant="secondary" className="text-xs">{count}</Badge>
      </div>
      <ScrollArea className="max-h-[140px] pr-2">
        <div className="space-y-1">{children}</div>
      </ScrollArea>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between text-xs">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-mono font-medium">{value}</span>
    </div>
  );
}
