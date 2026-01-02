import { useState, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
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
  Clock,
  ArrowRight,
  Building2,
  Wallet,
  RefreshCcw,
  TrendingUp,
  TrendingDown,
  Loader2,
} from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { toast } from "sonner";

interface ConciliacaoSaldosProps {
  transacoes: any[];
  bookmakers: { [key: string]: { nome: string; status: string } };
  wallets: { [key: string]: string };
  walletsDetalhes: Array<{ id: string; exchange: string; endereco: string; network: string; parceiro_id: string }>;
  parceiros: { [key: string]: string };
  onRefresh: () => void;
}

export function ConciliacaoSaldos({
  transacoes,
  bookmakers,
  wallets,
  walletsDetalhes,
  parceiros,
  onRefresh,
}: ConciliacaoSaldosProps) {
  const [confirmDialog, setConfirmDialog] = useState(false);
  const [selectedTransaction, setSelectedTransaction] = useState<any>(null);
  const [valorConfirmado, setValorConfirmado] = useState("");
  const [observacoes, setObservacoes] = useState("");
  const [saving, setSaving] = useState(false);

  // Filtrar transações crypto pendentes de confirmação
  const pendingTransactions = useMemo(() => {
    return transacoes.filter(
      (t) =>
        t.status === "pendente" &&
        t.tipo_moeda === "CRYPTO" &&
        (t.tipo_transacao === "DEPOSITO" || t.tipo_transacao === "SAQUE")
    );
  }, [transacoes]);

  const formatCurrency = (value: number, currency: string = "USD") => {
    const symbols: Record<string, string> = {
      USD: "$",
      BRL: "R$",
      EUR: "€",
    };
    return `${symbols[currency] || currency} ${value.toFixed(2)}`;
  };

  const handleOpenConfirm = (transaction: any) => {
    setSelectedTransaction(transaction);
    setValorConfirmado(transaction.valor_usd?.toFixed(2) || transaction.valor?.toFixed(2) || "");
    setObservacoes("");
    setConfirmDialog(true);
  };

  const handleConfirm = async () => {
    if (!selectedTransaction) return;

    const valorReal = parseFloat(valorConfirmado);
    if (isNaN(valorReal) || valorReal < 0) {
      toast.error("Informe um valor válido");
      return;
    }

    setSaving(true);
    try {
      const valorNominal = selectedTransaction.valor_usd || selectedTransaction.valor || 0;
      const diferenca = valorReal - valorNominal;
      const hasDiferenca = Math.abs(diferenca) > 0.01;

      // Atualizar transação para confirmada
      const { error: updateError } = await supabase
        .from("cash_ledger")
        .update({
          status: "confirmado",
          cotacao_implicita: hasDiferenca ? (selectedTransaction.qtd_coin / valorReal) : null,
          descricao: observacoes 
            ? `${selectedTransaction.descricao || ""} | Obs: ${observacoes}` 
            : selectedTransaction.descricao,
        })
        .eq("id", selectedTransaction.id);

      if (updateError) throw updateError;

      // Se houve diferença, registrar como ajuste cambial
      if (hasDiferenca) {
        // Para depósito: se creditou menos, é prejuízo
        // Para saque: se recebeu menos, é prejuízo
        const tipoAjuste = diferenca > 0 ? "GANHO_CAMBIAL" : "PERDA_CAMBIAL";
        
        toast.success(`Conciliação confirmada! ${tipoAjuste === "PERDA_CAMBIAL" ? "Perda" : "Ganho"} cambial: ${formatCurrency(Math.abs(diferenca))}`);
      } else {
        toast.success("Conciliação confirmada sem diferença");
      }

      setConfirmDialog(false);
      setSelectedTransaction(null);
      onRefresh();
    } catch (error: any) {
      console.error("Erro ao confirmar conciliação:", error);
      toast.error("Erro ao confirmar: " + error.message);
    } finally {
      setSaving(false);
    }
  };

  const getBookmakerName = (id: string) => bookmakers[id]?.nome || "Bookmaker";
  
  const getWalletInfo = (id: string) => {
    const wallet = walletsDetalhes.find(w => w.id === id);
    if (!wallet) return "Wallet";
    const parceiroNome = parceiros[wallet.parceiro_id] || "";
    return `${wallet.exchange?.replace(/-/g, ' ').toUpperCase() || 'WALLET'} (${parceiroNome})`;
  };

  if (pendingTransactions.length === 0) {
    return (
      <div className="text-center py-12">
        <CheckCircle2 className="h-12 w-12 text-emerald-500 mx-auto mb-4" />
        <h3 className="text-lg font-semibold mb-2">Tudo Conciliado!</h3>
        <p className="text-muted-foreground">
          Não há transações crypto pendentes de confirmação.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="font-semibold flex items-center gap-2">
            <RefreshCcw className="h-4 w-4" />
            Conciliação de Saldos Crypto
          </h3>
          <p className="text-sm text-muted-foreground">
            Confirme se os valores creditados/recebidos correspondem ao esperado
          </p>
        </div>
        <Badge variant="outline" className="bg-amber-500/10 text-amber-400 border-amber-500/30">
          <Clock className="h-3 w-3 mr-1" />
          {pendingTransactions.length} pendente{pendingTransactions.length > 1 ? "s" : ""}
        </Badge>
      </div>

      {/* Lista de pendentes */}
      <div className="space-y-3">
        {pendingTransactions.map((t) => {
          const isDeposito = t.tipo_transacao === "DEPOSITO";
          const valorNominal = t.valor_usd || t.valor || 0;
          
          return (
            <div
              key={t.id}
              className="flex items-center justify-between p-4 rounded-lg border border-border/50 bg-card/30 hover:bg-card/50 transition-colors"
            >
              <div className="flex items-center gap-4">
                {/* Tipo Badge */}
                <Badge
                  className={
                    isDeposito
                      ? "bg-amber-500/20 text-amber-400 border-amber-500/30"
                      : "bg-purple-500/20 text-purple-400 border-purple-500/30"
                  }
                >
                  {isDeposito ? "Depósito" : "Saque"}
                </Badge>

                {/* Fluxo */}
                <div className="flex items-center gap-2 text-sm">
                  <div className="flex items-center gap-1">
                    <Wallet className="h-4 w-4 text-muted-foreground" />
                    <span>{t.origem_wallet_id ? getWalletInfo(t.origem_wallet_id) : "Wallet"}</span>
                  </div>
                  <ArrowRight className="h-4 w-4 text-muted-foreground" />
                  <div className="flex items-center gap-1">
                    <Building2 className="h-4 w-4 text-muted-foreground" />
                    <span>{t.destino_bookmaker_id ? getBookmakerName(t.destino_bookmaker_id) : "Bookmaker"}</span>
                  </div>
                </div>

                {/* Valores */}
                <div className="text-sm">
                  <div className="font-mono">
                    {t.qtd_coin?.toFixed(4)} {t.coin}
                  </div>
                  <div className="text-muted-foreground">
                    ≈ {formatCurrency(valorNominal)}
                  </div>
                </div>

                {/* Data */}
                <div className="text-xs text-muted-foreground">
                  {format(new Date(t.data_transacao), "dd/MM/yyyy HH:mm", { locale: ptBR })}
                </div>
              </div>

              <Button
                size="sm"
                variant="outline"
                className="gap-2"
                onClick={() => handleOpenConfirm(t)}
              >
                <CheckCircle2 className="h-4 w-4" />
                Confirmar
              </Button>
            </div>
          );
        })}
      </div>

      {/* Dialog de Confirmação */}
      <Dialog open={confirmDialog} onOpenChange={setConfirmDialog}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <RefreshCcw className="h-5 w-5 text-primary" />
              Confirmar Conciliação
            </DialogTitle>
            <DialogDescription>
              Informe o valor real que foi{" "}
              {selectedTransaction?.tipo_transacao === "DEPOSITO" ? "creditado na casa" : "recebido na wallet"}
            </DialogDescription>
          </DialogHeader>

          {selectedTransaction && (
            <div className="space-y-4 py-4">
              {/* Resumo da transação */}
              <div className="p-3 rounded-lg bg-muted/50 space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Quantidade enviada:</span>
                  <span className="font-mono font-medium">
                    {selectedTransaction.qtd_coin?.toFixed(6)} {selectedTransaction.coin}
                  </span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Valor nominal (API):</span>
                  <span className="font-medium">
                    {formatCurrency(selectedTransaction.valor_usd || selectedTransaction.valor || 0)}
                  </span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Destino:</span>
                  <span>
                    {selectedTransaction.destino_bookmaker_id 
                      ? getBookmakerName(selectedTransaction.destino_bookmaker_id)
                      : selectedTransaction.origem_bookmaker_id
                        ? getBookmakerName(selectedTransaction.origem_bookmaker_id)
                        : "N/A"}
                  </span>
                </div>
              </div>

              {/* Input valor real */}
              <div className="space-y-2">
                <Label htmlFor="valorReal">
                  Valor real {selectedTransaction.tipo_transacao === "DEPOSITO" ? "creditado" : "recebido"} (USD)
                </Label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">$</span>
                  <Input
                    id="valorReal"
                    type="number"
                    step="0.01"
                    value={valorConfirmado}
                    onChange={(e) => setValorConfirmado(e.target.value)}
                    className="pl-7"
                    placeholder="0.00"
                  />
                </div>
                
                {/* Indicador de diferença */}
                {valorConfirmado && (
                  <div className="flex items-center gap-2 text-sm">
                    {(() => {
                      const valorNominal = selectedTransaction.valor_usd || selectedTransaction.valor || 0;
                      const valorReal = parseFloat(valorConfirmado) || 0;
                      const diferenca = valorReal - valorNominal;
                      
                      if (Math.abs(diferenca) < 0.01) {
                        return (
                          <span className="text-emerald-400 flex items-center gap-1">
                            <CheckCircle2 className="h-4 w-4" />
                            Valores conferem
                          </span>
                        );
                      }
                      
                      return diferenca > 0 ? (
                        <span className="text-emerald-400 flex items-center gap-1">
                          <TrendingUp className="h-4 w-4" />
                          Ganho cambial: +{formatCurrency(diferenca)}
                        </span>
                      ) : (
                        <span className="text-amber-400 flex items-center gap-1">
                          <TrendingDown className="h-4 w-4" />
                          Perda cambial: {formatCurrency(diferenca)}
                        </span>
                      );
                    })()}
                  </div>
                )}
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
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmDialog(false)} disabled={saving}>
              Cancelar
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
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
