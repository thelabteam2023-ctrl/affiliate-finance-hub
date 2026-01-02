import { useState, useMemo, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
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
  HelpCircle,
  History,
} from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth";
import { useWorkspace } from "@/hooks/useWorkspace";
import { updateBookmakerBalance } from "@/lib/bookmakerBalanceHelper";

interface ConciliacaoSaldosProps {
  transacoes: any[];
  bookmakers: { [key: string]: { nome: string; status: string } };
  wallets: { [key: string]: string };
  walletsDetalhes: Array<{ id: string; exchange: string; endereco: string; network: string; parceiro_id: string }>;
  parceiros: { [key: string]: string };
  onRefresh: () => void;
}

interface ExchangeAdjustmentSummary {
  totalGanhos: number;
  totalPerdas: number;
  saldoLiquido: number;
  totalConciliacoes: number;
}

export function ConciliacaoSaldos({
  transacoes,
  bookmakers,
  wallets,
  walletsDetalhes,
  parceiros,
  onRefresh,
}: ConciliacaoSaldosProps) {
  const { user } = useAuth();
  const { workspace } = useWorkspace();
  
  const [confirmDialog, setConfirmDialog] = useState(false);
  const [selectedTransaction, setSelectedTransaction] = useState<any>(null);
  const [valorConfirmado, setValorConfirmado] = useState("");
  const [observacoes, setObservacoes] = useState("");
  const [saving, setSaving] = useState(false);
  
  // Resumo de ajustes cambiais
  const [adjustmentSummary, setAdjustmentSummary] = useState<ExchangeAdjustmentSummary>({
    totalGanhos: 0,
    totalPerdas: 0,
    saldoLiquido: 0,
    totalConciliacoes: 0,
  });
  const [loadingSummary, setLoadingSummary] = useState(true);

  // Carregar resumo de ajustes cambiais
  useEffect(() => {
    const loadSummary = async () => {
      if (!workspace?.id) return;
      
      setLoadingSummary(true);
      try {
        const { data, error } = await supabase
          .from("exchange_adjustments")
          .select("diferenca, tipo_ajuste")
          .eq("workspace_id", workspace.id);
        
        if (error) throw error;
        
        let totalGanhos = 0;
        let totalPerdas = 0;
        
        data?.forEach((adj) => {
          if (adj.tipo_ajuste === "GANHO_CAMBIAL") {
            totalGanhos += adj.diferenca || 0;
          } else if (adj.tipo_ajuste === "PERDA_CAMBIAL") {
            totalPerdas += Math.abs(adj.diferenca || 0);
          }
        });
        
        setAdjustmentSummary({
          totalGanhos,
          totalPerdas,
          saldoLiquido: totalGanhos - totalPerdas,
          totalConciliacoes: data?.length || 0,
        });
      } catch (error) {
        console.error("Erro ao carregar resumo de ajustes:", error);
      } finally {
        setLoadingSummary(false);
      }
    };
    
    loadSummary();
  }, [workspace?.id, transacoes]);

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
    if (!selectedTransaction || !user?.id || !workspace?.id) return;

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

      // 1. Atualizar transação - MANTER valor/valor_usd (contábil), adicionar valor_confirmado (operacional)
      const { error: updateError } = await supabase
        .from("cash_ledger")
        .update({
          status: "confirmado",
          valor_confirmado: valorReal, // Novo campo: valor REAL para fins operacionais
          cotacao_implicita: hasDiferenca ? (selectedTransaction.qtd_coin / valorReal) : null,
          descricao: observacoes 
            ? `${selectedTransaction.descricao || ""} | Obs: ${observacoes}` 
            : selectedTransaction.descricao,
        })
        .eq("id", selectedTransaction.id);

      if (updateError) throw updateError;

      // 2. Se houve diferença, registrar ajuste cambial
      if (hasDiferenca) {
        const tipoAjuste = diferenca > 0 ? "GANHO_CAMBIAL" : "PERDA_CAMBIAL";
        const bookmakerId = selectedTransaction.tipo_transacao === "DEPOSITO" 
          ? selectedTransaction.destino_bookmaker_id 
          : selectedTransaction.origem_bookmaker_id;
        
        const { error: adjError } = await supabase
          .from("exchange_adjustments")
          .insert({
            workspace_id: workspace.id,
            user_id: user.id,
            cash_ledger_id: selectedTransaction.id,
            bookmaker_id: bookmakerId,
            wallet_id: selectedTransaction.origem_wallet_id || selectedTransaction.destino_wallet_id,
            tipo: selectedTransaction.tipo_transacao,
            valor_nominal: valorNominal,
            valor_confirmado: valorReal,
            diferenca: diferenca,
            tipo_ajuste: tipoAjuste,
            coin: selectedTransaction.coin,
            qtd_coin: selectedTransaction.qtd_coin,
            observacoes: observacoes || null,
          });
        
        if (adjError) {
          console.error("Erro ao registrar ajuste cambial:", adjError);
          // Não bloquear fluxo por erro no registro do ajuste
        }
      }

      // 3. Ajustar saldo da bookmaker com o VALOR REAL (não o nominal)
      // Para DEPÓSITO: adicionar o valor REAL ao saldo da bookmaker
      // Para SAQUE: subtrair o valor REAL do saldo da bookmaker
      // Nota: o trigger atualizar_saldo_bookmaker_caixa() usa o valor_usd (nominal)
      // Precisamos ajustar a DIFERENÇA para que o saldo final reflita o valor real
      if (hasDiferenca) {
        const bookmakerId = selectedTransaction.tipo_transacao === "DEPOSITO" 
          ? selectedTransaction.destino_bookmaker_id 
          : selectedTransaction.origem_bookmaker_id;
        
        if (bookmakerId) {
          // A diferença é: valorReal - valorNominal
          // Se positiva = ganho (adicionar mais), se negativa = perda (subtrair)
          // Para DEPÓSITO: trigger já adicionou valorNominal, precisamos adicionar a diferença
          // Para SAQUE: trigger já subtraiu valorNominal, precisamos subtrair a diferença
          const deltaAjuste = selectedTransaction.tipo_transacao === "DEPOSITO" ? diferenca : -diferenca;
          
          await updateBookmakerBalance(bookmakerId, deltaAjuste);
        }
      }

      if (hasDiferenca) {
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

  return (
    <div className="space-y-6">
      {/* Header com tooltip explicativo */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <RefreshCcw className="h-5 w-5 text-primary" />
          <h3 className="font-semibold">Conciliação de Saldos Crypto</h3>
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <button className="text-muted-foreground hover:text-foreground transition-colors">
                  <HelpCircle className="h-4 w-4" />
                </button>
              </TooltipTrigger>
              <TooltipContent side="right" className="max-w-xs">
                <p className="text-sm">
                  <strong>Conciliação</strong> valida se o valor real creditado/recebido corresponde ao esperado.
                </p>
                <ul className="text-xs mt-2 space-y-1 text-muted-foreground">
                  <li>• <strong>Valor nominal:</strong> usado para fins contábeis (caixa/financeiro)</li>
                  <li>• <strong>Valor confirmado:</strong> usado para saldo operacional (bookmaker)</li>
                </ul>
                <p className="text-xs mt-2 text-muted-foreground">
                  Diferenças são registradas como ajustes cambiais para análise.
                </p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>
        {pendingTransactions.length > 0 && (
          <Badge variant="outline" className="bg-amber-500/10 text-amber-400 border-amber-500/30">
            <Clock className="h-3 w-3 mr-1" />
            {pendingTransactions.length} pendente{pendingTransactions.length > 1 ? "s" : ""}
          </Badge>
        )}
      </div>

      {/* Resumo de Ajustes Cambiais */}
      {!loadingSummary && adjustmentSummary.totalConciliacoes > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
          <Card className="bg-emerald-500/5 border-emerald-500/20">
            <CardContent className="p-4">
              <div className="flex items-center gap-2">
                <TrendingUp className="h-4 w-4 text-emerald-400" />
                <span className="text-xs text-muted-foreground">Ganhos Cambiais</span>
              </div>
              <p className="text-lg font-semibold text-emerald-400 mt-1">
                +{formatCurrency(adjustmentSummary.totalGanhos)}
              </p>
            </CardContent>
          </Card>
          
          <Card className="bg-red-500/5 border-red-500/20">
            <CardContent className="p-4">
              <div className="flex items-center gap-2">
                <TrendingDown className="h-4 w-4 text-red-400" />
                <span className="text-xs text-muted-foreground">Perdas Cambiais</span>
              </div>
              <p className="text-lg font-semibold text-red-400 mt-1">
                -{formatCurrency(adjustmentSummary.totalPerdas)}
              </p>
            </CardContent>
          </Card>
          
          <Card className={`${adjustmentSummary.saldoLiquido >= 0 ? 'bg-primary/5 border-primary/20' : 'bg-amber-500/5 border-amber-500/20'}`}>
            <CardContent className="p-4">
              <div className="flex items-center gap-2">
                <RefreshCcw className="h-4 w-4 text-primary" />
                <span className="text-xs text-muted-foreground">Saldo Líquido</span>
              </div>
              <p className={`text-lg font-semibold mt-1 ${adjustmentSummary.saldoLiquido >= 0 ? 'text-primary' : 'text-amber-400'}`}>
                {adjustmentSummary.saldoLiquido >= 0 ? '+' : ''}{formatCurrency(adjustmentSummary.saldoLiquido)}
              </p>
            </CardContent>
          </Card>
          
          <Card className="bg-muted/30 border-muted/50">
            <CardContent className="p-4">
              <div className="flex items-center gap-2">
                <History className="h-4 w-4 text-muted-foreground" />
                <span className="text-xs text-muted-foreground">Total Conciliações</span>
              </div>
              <p className="text-lg font-semibold mt-1">
                {adjustmentSummary.totalConciliacoes}
              </p>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Estado vazio */}
      {pendingTransactions.length === 0 ? (
        <div className="text-center py-12">
          <CheckCircle2 className="h-12 w-12 text-emerald-500 mx-auto mb-4" />
          <h3 className="text-lg font-semibold mb-2">Tudo Conciliado!</h3>
          <p className="text-muted-foreground">
            Não há transações crypto pendentes de confirmação.
          </p>
        </div>
      ) : (
        <>
          <p className="text-sm text-muted-foreground">
            Confirme se os valores creditados/recebidos correspondem ao esperado
          </p>
          
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
                  <div className="flex items-center gap-4 flex-wrap">
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
        </>
      )}

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
                  <span className="text-muted-foreground">Valor nominal (contábil):</span>
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
