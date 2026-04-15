/**
 * ConciliacaoDirectModal — Modal standalone para conciliar transações
 * diretamente de qualquer lugar (Central de Operações, Projetos, etc.)
 * sem precisar navegar até o Caixa Operacional.
 */

import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { dispatchCaixaDataChanged } from "@/hooks/useInvalidateCaixaData";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertCircle,
  CheckCircle2,
  ArrowRight,
  Building2,
  Wallet,
  RefreshCcw,
  TrendingUp,
  TrendingDown,
  Loader2,
  Lock,
  XCircle,
} from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth";
import { useWorkspace } from "@/hooks/useWorkspace";
import {
  registrarGanhoCambialViaLedger,
  registrarPerdaCambialViaLedger,
  getBookmakerMoeda,
} from "@/lib/ledgerService";
import { useWalletTransitBalance } from "@/hooks/useWalletTransitBalance";
import { useBookmakerLogoMap } from "@/hooks/useBookmakerLogoMap";
import { getFirstLastName } from "@/lib/utils";
import { extractCivilDateKey } from "@/utils/dateUtils";
import { useCentralOperacoesCache } from "@/hooks/useCentralOperacoesCache";

const CURRENCY_SYMBOLS: Record<string, string> = {
  USD: "$", BRL: "R$", EUR: "€", GBP: "£", MXN: "MX$", MYR: "RM", ARS: "AR$", COP: "COP$",
  USDT: "$", USDC: "$",
};

interface ConciliacaoDirectModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  bookmakerId: string;
  bookmakerNome?: string;
  onSuccess?: () => void;
}

export function ConciliacaoDirectModal({
  open,
  onOpenChange,
  bookmakerId,
  bookmakerNome,
  onSuccess,
}: ConciliacaoDirectModalProps) {
  const { user } = useAuth();
  const { workspace } = useWorkspace();
  const { getLogoUrl } = useBookmakerLogoMap();
  const { confirmTransit, revertTransit } = useWalletTransitBalance();
  const { fullRefetch } = useCentralOperacoesCache();

  const [transactions, setTransactions] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  // Per-transaction state
  const [selectedTx, setSelectedTx] = useState<any>(null);
  const [valorConfirmado, setValorConfirmado] = useState("");
  const [observacoes, setObservacoes] = useState("");
  const [saving, setSaving] = useState(false);
  const [failingId, setFailingId] = useState<string | null>(null);

  // Step: "list" (when multiple) or "confirm" (single transaction detail)
  const [step, setStep] = useState<"list" | "confirm">("list");

  // Fetch pending transactions for this bookmaker
  const fetchPending = useCallback(async () => {
    if (!workspace?.id || !bookmakerId) return;
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("cash_ledger")
        .select("*")
        .eq("workspace_id", workspace.id)
        .eq("status", "PENDENTE")
        .eq("tipo_transacao", "DEPOSITO")
        .or(`destino_bookmaker_id.eq.${bookmakerId},origem_bookmaker_id.eq.${bookmakerId}`)
        .order("data_transacao", { ascending: false });

      if (error) throw error;
      setTransactions(data || []);

      // If only 1 transaction, go directly to confirm step
      if (data && data.length === 1) {
        openConfirmStep(data[0]);
      } else {
        setStep("list");
      }
    } catch (err) {
      console.error("Erro ao buscar transações pendentes:", err);
      toast.error("Erro ao buscar transações pendentes");
    } finally {
      setLoading(false);
    }
  }, [workspace?.id, bookmakerId]);

  useEffect(() => {
    if (open) {
      fetchPending();
      setSelectedTx(null);
      setStep("list");
    }
  }, [open, fetchPending]);

  const openConfirmStep = (tx: any) => {
    setSelectedTx(tx);
    const valorInicial = tx.valor_destino ?? tx.valor_usd ?? tx.valor ?? 0;
    setValorConfirmado(valorInicial > 0 ? valorInicial.toFixed(2) : "");
    setObservacoes("");
    setStep("confirm");
  };

  const handleConfirm = async () => {
    if (!selectedTx || !user?.id || !workspace?.id) return;

    const valorReal = parseFloat(valorConfirmado);
    if (isNaN(valorReal) || valorReal < 0) {
      toast.error("Informe um valor válido");
      return;
    }

    setSaving(true);
    try {
      const valorNominal = selectedTx.valor_destino || selectedTx.valor_usd || selectedTx.valor || 0;
      const diferenca = valorReal - valorNominal;
      const hasDiferenca = Math.abs(diferenca) > 0.01;
      const isCrypto = selectedTx.tipo_moeda === "CRYPTO";

      // 1. Update transaction with STATUS GUARD
      const { data: updateResult, error: updateError } = await supabase
        .from("cash_ledger")
        .update({
          status: "CONFIRMADO",
          status_valor: hasDiferenca ? "AJUSTADO" : "CONFIRMADO",
          valor_confirmado: valorReal,
          ...(hasDiferenca ? {} : { valor: valorReal, valor_destino: valorReal }),
          transit_status: isCrypto && selectedTx.origem_wallet_id ? "CONFIRMED" : selectedTx.transit_status,
          cotacao_implicita: isCrypto && hasDiferenca && selectedTx.qtd_coin
            ? (selectedTx.qtd_coin / valorReal)
            : null,
          descricao: observacoes
            ? `${selectedTx.descricao || ""} | Obs: ${observacoes}`
            : selectedTx.descricao,
        })
        .eq("id", selectedTx.id)
        .eq("status", "PENDENTE")
        .select("id");

      if (updateError) throw updateError;

      if (!updateResult || updateResult.length === 0) {
        toast.error("Esta transação já foi conciliada por outro usuário.");
        handlePostAction();
        return;
      }

      // 2. Confirm crypto transit
      if (isCrypto && selectedTx.origem_wallet_id && selectedTx.transit_status === "PENDING") {
        const transitResult = await confirmTransit(selectedTx.id, valorReal);
        if (!transitResult.success) {
          console.warn("[ConciliacaoDirectModal] Aviso ao confirmar trânsito:", transitResult.error);
        }
      }

      // 3. Register exchange adjustment if needed
      if (hasDiferenca) {
        const bmId = selectedTx.destino_bookmaker_id || selectedTx.origem_bookmaker_id;
        const moedaDestino = selectedTx.moeda_destino || selectedTx.moeda || "USD";

        // Insert exchange_adjustments record
        await supabase.from("exchange_adjustments").insert({
          workspace_id: workspace.id,
          user_id: user.id,
          cash_ledger_id: selectedTx.id,
          bookmaker_id: bmId,
          wallet_id: selectedTx.origem_wallet_id || selectedTx.destino_wallet_id,
          tipo: selectedTx.tipo_transacao,
          valor_nominal: valorNominal,
          valor_confirmado: valorReal,
          diferenca,
          tipo_ajuste: diferenca > 0 ? "GANHO_CAMBIAL" : "PERDA_CAMBIAL",
          coin: selectedTx.coin,
          qtd_coin: selectedTx.qtd_coin,
          observacoes: observacoes || null,
          moeda_destino: moedaDestino,
        });

        // Register via ledger
        if (bmId) {
          const moeda = await getBookmakerMoeda(bmId);
          let fxProjetoSnapshot = selectedTx.projeto_id_snapshot;
          if (!fxProjetoSnapshot) {
            const { data: bmData } = await supabase
              .from("bookmakers")
              .select("projeto_id")
              .eq("id", bmId)
              .single();
            fxProjetoSnapshot = bmData?.projeto_id || null;
          }

          if (diferenca > 0) {
            await registrarGanhoCambialViaLedger({
              bookmakerId: bmId,
              valor: diferenca,
              moeda,
              workspaceId: workspace.id,
              userId: user.id,
              descricao: `Ganho cambial em conciliação: ${valorNominal.toFixed(2)} nominal → ${valorReal.toFixed(2)} confirmado`,
              transacaoOrigemId: selectedTx.id,
              projetoIdSnapshot: fxProjetoSnapshot || undefined,
            });
          } else {
            await registrarPerdaCambialViaLedger({
              bookmakerId: bmId,
              valor: Math.abs(diferenca),
              moeda,
              workspaceId: workspace.id,
              userId: user.id,
              descricao: `Perda cambial em conciliação: ${valorNominal.toFixed(2)} nominal → ${valorReal.toFixed(2)} confirmado`,
              transacaoOrigemId: selectedTx.id,
              projetoIdSnapshot: fxProjetoSnapshot || undefined,
            });
          }
        }

        const tipoAjuste = diferenca > 0 ? "GANHO_CAMBIAL" : "PERDA_CAMBIAL";
        toast.success(`Conciliação confirmada! ${tipoAjuste === "PERDA_CAMBIAL" ? "Perda" : "Ganho"} cambial: ${Math.abs(diferenca).toFixed(2)}`);
      } else {
        toast.success("Conciliação confirmada sem diferença");
      }

      handlePostAction();
    } catch (error: any) {
      console.error("Erro ao confirmar conciliação:", error);
      toast.error("Erro ao confirmar: " + error.message);
    } finally {
      setSaving(false);
    }
  };

  const handleFail = async (tx: any) => {
    if (failingId || !user?.id || !workspace?.id) return;
    setFailingId(tx.id);

    try {
      const isCrypto = tx.tipo_moeda === "CRYPTO";

      // Revert transit if crypto
      if (isCrypto && tx.origem_wallet_id && tx.transit_status === "PENDING") {
        const result = await revertTransit(tx.id, "FAILED", "Falhou na blockchain");
        if (!result.success) {
          toast.error("Erro ao reverter: " + result.error);
          return;
        }
      }

      // Cancel in ledger
      const { error } = await supabase
        .from("cash_ledger")
        .update({
          status: "CANCELADO",
          transit_status: isCrypto ? "FAILED" : tx.transit_status,
          descricao: `${tx.descricao || ""} | FALHOU: Transação não confirmada`,
        })
        .eq("id", tx.id)
        .eq("status", "PENDENTE");

      if (error) throw error;

      toast.success("Transação marcada como falha. Saldo liberado.");
      handlePostAction();
    } catch (err: any) {
      console.error("Erro ao falhar transação:", err);
      toast.error("Erro: " + err.message);
    } finally {
      setFailingId(null);
    }
  };

  const handlePostAction = () => {
    dispatchCaixaDataChanged();
    fullRefetch();
    onSuccess?.();
    onOpenChange(false);
  };

  // Render helpers
  const getSymbol = (moeda: string) => CURRENCY_SYMBOLS[moeda] || moeda;

  const renderTransactionSummary = (tx: any) => {
    const isCrypto = tx.tipo_moeda === "CRYPTO";
    const moedaOrigem = tx.moeda_origem || (isCrypto ? tx.coin : tx.moeda) || "BRL";
    const moedaDestino = tx.moeda_destino || tx.moeda || "BRL";
    const valorOrigem = tx.valor_origem || tx.valor || 0;
    const valorNominalDestino = tx.valor_destino || tx.valor || 0;
    const symbolDestino = getSymbol(moedaDestino);

    return (
      <div className="p-3 rounded-lg bg-muted/50 space-y-2">
        <div className="flex justify-between text-sm">
          <span className="text-muted-foreground">Valor enviado:</span>
          <span className="font-mono font-medium">
            {isCrypto
              ? `${tx.qtd_coin?.toFixed(6)} ${tx.coin}`
              : `${moedaOrigem} ${valorOrigem.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`}
          </span>
        </div>
        <div className="flex justify-between text-sm">
          <span className="text-muted-foreground">Valor estimado ({moedaDestino}):</span>
          <span className="font-medium">
            {symbolDestino} {valorNominalDestino.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
          </span>
        </div>
        <div className="flex justify-between text-sm">
          <span className="text-muted-foreground">Destino:</span>
          <span className="font-medium">{bookmakerNome || "Bookmaker"}</span>
        </div>
        <div className="flex justify-between text-sm">
          <span className="text-muted-foreground">Data:</span>
          <span className="text-xs">
            {(() => {
              const dk = extractCivilDateKey(tx.data_transacao);
              if (!dk) return "-";
              const [y, m, d] = dk.split("-");
              return `${d}/${m}/${y}`;
            })()}
          </span>
        </div>
      </div>
    );
  };

  // Confirm step view
  const renderConfirmStep = () => {
    if (!selectedTx) return null;

    const isCrypto = selectedTx.tipo_moeda === "CRYPTO";
    const moedaDestino = selectedTx.moeda_destino || selectedTx.moeda || "BRL";
    const valorNominalDestino = selectedTx.valor_destino || selectedTx.valor || 0;
    const symbolDestino = getSymbol(moedaDestino);

    return (
      <>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <RefreshCcw className="h-5 w-5 text-primary" />
            Confirmar Conciliação
          </DialogTitle>
          <DialogDescription>
            Informe o valor real que foi creditado na casa
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {renderTransactionSummary(selectedTx)}

          {/* Valor real input */}
          <div className="space-y-2">
            <Label htmlFor="valorReal">
              Valor real creditado ({moedaDestino})
            </Label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">
                {symbolDestino}
              </span>
              <Input
                id="valorReal"
                type="number"
                step="0.01"
                value={valorConfirmado}
                onChange={(e) => setValorConfirmado(e.target.value)}
                className="pl-10"
                placeholder="0.00"
                autoFocus
              />
            </div>

            {valorConfirmado && (() => {
              const valorReal = parseFloat(valorConfirmado) || 0;
              const diferenca = valorReal - valorNominalDestino;

              if (Math.abs(diferenca) < 0.01) {
                return (
                  <span className="text-emerald-400 flex items-center gap-1 text-sm">
                    <CheckCircle2 className="h-4 w-4" />
                    Valores conferem
                  </span>
                );
              }

              return diferenca > 0 ? (
                <span className="text-emerald-400 flex items-center gap-1 text-sm">
                  <TrendingUp className="h-4 w-4" />
                  Ganho cambial: +{symbolDestino} {diferenca.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
                </span>
              ) : (
                <span className="text-amber-400 flex items-center gap-1 text-sm">
                  <TrendingDown className="h-4 w-4" />
                  Perda cambial: {symbolDestino} {diferenca.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
                </span>
              );
            })()}
          </div>

          {/* Observações */}
          <div className="space-y-2">
            <Label htmlFor="observacoes">Observações (opcional)</Label>
            <Textarea
              id="observacoes"
              value={observacoes}
              onChange={(e) => setObservacoes(e.target.value)}
              placeholder="Ex: Cotação da casa estava defasada"
              rows={2}
            />
          </div>
        </div>

        <DialogFooter className="flex-col sm:flex-row gap-2">
          {/* Falhar button */}
          <Button
            variant="outline"
            className="gap-2 text-destructive border-destructive/30 hover:bg-destructive/10 sm:mr-auto"
            onClick={() => handleFail(selectedTx)}
            disabled={saving || failingId === selectedTx.id}
          >
            {failingId === selectedTx.id ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <XCircle className="h-4 w-4" />
            )}
            Falhar
          </Button>

          <div className="flex gap-2">
            <Button
              variant="outline"
              onClick={() => {
                if (transactions.length > 1) {
                  setStep("list");
                  setSelectedTx(null);
                } else {
                  onOpenChange(false);
                }
              }}
              disabled={saving}
            >
              {transactions.length > 1 ? "Voltar" : "Cancelar"}
            </Button>
            <Button onClick={handleConfirm} disabled={saving || !valorConfirmado}>
              {saving ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Confirmando...
                </>
              ) : (
                <>
                  <CheckCircle2 className="h-4 w-4 mr-2" />
                  Confirmar
                </>
              )}
            </Button>
          </div>
        </DialogFooter>
      </>
    );
  };

  // List step view (multiple transactions)
  const renderListStep = () => (
    <>
      <DialogHeader>
        <DialogTitle className="flex items-center gap-2">
          <RefreshCcw className="h-5 w-5 text-primary" />
          Conciliação — {bookmakerNome || "Bookmaker"}
        </DialogTitle>
        <DialogDescription>
          {transactions.length} transaç{transactions.length === 1 ? "ão" : "ões"} pendente{transactions.length === 1 ? "" : "s"} de conciliação
        </DialogDescription>
      </DialogHeader>

      <div className="space-y-2 py-4 max-h-[400px] overflow-y-auto">
        {transactions.map((tx) => {
          const isCrypto = tx.tipo_moeda === "CRYPTO";
          const moedaDestino = tx.moeda_destino || tx.moeda || "BRL";
          const valorNominal = tx.valor_destino || tx.valor_usd || tx.valor || 0;
          const sym = getSymbol(moedaDestino);

          return (
            <div
              key={tx.id}
              className="flex items-center justify-between p-3 rounded-lg border border-amber-500/30 bg-amber-500/5 hover:bg-amber-500/10 transition-colors"
            >
              <div className="flex items-center gap-3 min-w-0">
                <Badge variant="outline" className="text-[10px] shrink-0">
                  {isCrypto ? "CRYPTO" : "FIAT"}
                </Badge>
                {isCrypto && tx.transit_status === "PENDING" && (
                  <Badge variant="secondary" className="gap-1 text-[10px] bg-warning/20 text-warning border-warning/30 shrink-0">
                    <Lock className="h-3 w-3" />
                    Trânsito
                  </Badge>
                )}
                <span className="text-sm font-mono font-medium truncate">
                  {isCrypto
                    ? `${tx.qtd_coin?.toFixed(4)} ${tx.coin}`
                    : `${sym} ${valorNominal.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`}
                </span>
                <span className="text-xs text-muted-foreground">
                  {(() => {
                    const dk = extractCivilDateKey(tx.data_transacao);
                    if (!dk) return "-";
                    const [y, m, d] = dk.split("-");
                    return `${d}/${m}/${y}`;
                  })()}
                </span>
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 text-[10px] px-2 text-destructive border-destructive/30 hover:bg-destructive/10"
                  onClick={() => handleFail(tx)}
                  disabled={failingId === tx.id}
                >
                  {failingId === tx.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <XCircle className="h-3 w-3" />}
                </Button>
                <Button
                  size="sm"
                  className="h-7 text-[10px] px-2.5"
                  onClick={() => openConfirmStep(tx)}
                >
                  <CheckCircle2 className="h-3 w-3 mr-1" />
                  Conciliar
                </Button>
              </div>
            </div>
          );
        })}
      </div>

      <DialogFooter>
        <Button variant="outline" onClick={() => onOpenChange(false)}>
          Fechar
        </Button>
      </DialogFooter>
    </>
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[480px]">
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : transactions.length === 0 ? (
          <>
            <DialogHeader>
              <DialogTitle>Nenhuma pendência</DialogTitle>
              <DialogDescription>
                Todas as transações desta casa já foram conciliadas.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button variant="outline" onClick={() => onOpenChange(false)}>
                Fechar
              </Button>
            </DialogFooter>
          </>
        ) : step === "confirm" ? (
          renderConfirmStep()
        ) : (
          renderListStep()
        )}
      </DialogContent>
    </Dialog>
  );
}
