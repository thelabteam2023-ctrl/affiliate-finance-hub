import { useState, useEffect, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { dispatchCaixaDataChanged } from "@/hooks/useInvalidateCaixaData";
import { usePermissions } from "@/contexts/PermissionsContext";
import { useWorkspace } from "@/hooks/useWorkspace";
import { useExchangeRates } from "@/contexts/ExchangeRatesContext";
import { FIAT_CURRENCIES, CRYPTO_CURRENCIES, getCurrencySymbol } from "@/types/currency";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Loader2, AlertTriangle, Scale, TrendingUp, TrendingDown, Minus, Info } from "lucide-react";

interface ReconciliacaoDialogProps {
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

type TipoEntidade = "BOOKMAKER" | "CONTA_BANCARIA" | "WALLET";

interface Bookmaker {
  id: string;
  nome: string;
  saldo_atual: number;
  moeda: string;
  parceiro_id: string | null;
  parceiro_nome?: string;
  reconciled_at?: string | null;
}

interface ContaBancaria {
  id: string;
  banco: string;
  titular: string;
  parceiro_id: string;
  moeda: string;
  saldo_sistema?: number;
  reconciled_at?: string | null;
}

interface WalletCrypto {
  id: string;
  exchange: string;
  endereco: string;
  parceiro_id: string;
  parceiro_nome?: string;
  moeda: string[];
  reconciled_at?: string | null;
}

export function ReconciliacaoDialog({
  open,
  onClose,
  onSuccess,
}: ReconciliacaoDialogProps) {
  const { toast } = useToast();
  const { isOwnerOrAdmin, isSystemOwner } = usePermissions();
  const { workspaceId } = useWorkspace();
  const { getRate, lastUpdate } = useExchangeRates();

  const [loading, setLoading] = useState(false);
  const [fetchingData, setFetchingData] = useState(false);

  const [tipoEntidade, setTipoEntidade] = useState<TipoEntidade>("BOOKMAKER");
  const [entidadeId, setEntidadeId] = useState<string>("");
  const [moeda, setMoeda] = useState<string>("BRL");
  const [saldoReal, setSaldoReal] = useState<string>("");
  const [saldoRealDisplay, setSaldoRealDisplay] = useState<string>("");
  const [motivo, setMotivo] = useState<string>("Reconciliação Desenvolvimento");

  const [bookmakers, setBookmakers] = useState<Bookmaker[]>([]);
  const [contas, setContas] = useState<ContaBancaria[]>([]);
  const [wallets, setWallets] = useState<WalletCrypto[]>([]);
  const [saldosContas, setSaldosContas] = useState<Record<string, number>>({});
  const [saldosWallets, setSaldosWallets] = useState<Record<string, Record<string, number>>>({});

  const canAccess = isOwnerOrAdmin || isSystemOwner;

  // Saldo atual do sistema para a entidade selecionada
  const saldoSistema = useMemo(() => {
    if (tipoEntidade === "BOOKMAKER" && entidadeId) {
      const bk = bookmakers.find(b => b.id === entidadeId);
      return bk?.saldo_atual ?? 0;
    }
    if (tipoEntidade === "CONTA_BANCARIA" && entidadeId) {
      return saldosContas[entidadeId] ?? 0;
    }
    if (tipoEntidade === "WALLET" && entidadeId && moeda) {
      return saldosWallets[entidadeId]?.[moeda] ?? 0;
    }
    return 0;
  }, [tipoEntidade, entidadeId, moeda, bookmakers, saldosContas, saldosWallets]);

  // Diferença calculada
  const diferenca = useMemo(() => {
    const real = parseFloat(saldoReal) || 0;
    return real - saldoSistema;
  }, [saldoReal, saldoSistema]);

  // Moedas disponíveis
  const moedasDisponiveis = useMemo(() => {
    if (tipoEntidade === "BOOKMAKER" && entidadeId) {
      const bk = bookmakers.find(b => b.id === entidadeId);
      if (bk) {
        const info = [...FIAT_CURRENCIES, ...CRYPTO_CURRENCIES].find(c => c.value === bk.moeda);
        return [{ value: bk.moeda, label: info ? `${bk.moeda} - ${info.label}` : bk.moeda, symbol: getCurrencySymbol(bk.moeda) }];
      }
    }
    if (tipoEntidade === "CONTA_BANCARIA" && entidadeId) {
      const conta = contas.find(c => c.id === entidadeId);
      if (conta) {
        const info = FIAT_CURRENCIES.find(c => c.value === conta.moeda);
        return [{ value: conta.moeda, label: info ? `${conta.moeda} - ${info.label}` : conta.moeda, symbol: getCurrencySymbol(conta.moeda) }];
      }
    }
    if (tipoEntidade === "WALLET" && entidadeId) {
      const wallet = wallets.find(w => w.id === entidadeId);
      if (wallet) {
        return wallet.moeda.map(m => {
          const info = CRYPTO_CURRENCIES.find(c => c.value === m);
          return { value: m, label: info ? `${m} - ${info.label}` : m, symbol: getCurrencySymbol(m) };
        });
      }
    }
    return [{ value: "BRL", label: "BRL - Real Brasileiro", symbol: "R$" }];
  }, [tipoEntidade, entidadeId, bookmakers, contas, wallets]);

  useEffect(() => {
    if (moedasDisponiveis.length === 1 && moeda !== moedasDisponiveis[0].value) {
      setMoeda(moedasDisponiveis[0].value);
    } else if (!moedasDisponiveis.find(m => m.value === moeda)) {
      setMoeda(moedasDisponiveis[0].value);
    }
  }, [moedasDisponiveis, moeda]);

  useEffect(() => {
    if (open) fetchData();
  }, [open]);

  useEffect(() => {
    setEntidadeId("");
    setSaldoReal("");
    setSaldoRealDisplay("");
    setMoeda("BRL");
  }, [tipoEntidade]);

  useEffect(() => {
    setSaldoReal("");
    setSaldoRealDisplay("");
  }, [entidadeId]);

  const fetchData = async () => {
    setFetchingData(true);
    try {
      const [bookmakersRes, contasRes, walletsRes, saldosContasRes, saldosWalletsRes] = await Promise.all([
        supabase.from("bookmakers").select(`id, nome, saldo_atual, moeda, parceiro_id, reconciled_at, parceiros!inner(nome, status)`).in("status", ["ativo", "limitada"]).eq("parceiros.status", "ativo").order("nome"),
        supabase.from("contas_bancarias").select(`id, banco, titular, parceiro_id, moeda, reconciled_at, parceiros!inner(status)`).eq("parceiros.status", "ativo").order("banco"),
        supabase.from("wallets_crypto").select(`id, exchange, endereco, parceiro_id, moeda, reconciled_at, parceiros!inner(nome, status)`).eq("parceiros.status", "ativo").order("exchange"),
        supabase.from("v_saldo_parceiro_contas").select("conta_id, saldo"),
        supabase.from("v_saldo_parceiro_wallets").select("wallet_id, coin, saldo_coin"),
      ]);

      setBookmakers((bookmakersRes.data || []).map((bk: any) => ({
        id: bk.id, nome: bk.nome, saldo_atual: bk.saldo_atual || 0,
        moeda: bk.moeda || "BRL", parceiro_id: bk.parceiro_id,
        parceiro_nome: bk.parceiros?.nome, reconciled_at: bk.reconciled_at,
      })));

      setContas((contasRes.data || []).map((c: any) => ({
        id: c.id, banco: c.banco, titular: c.titular,
        parceiro_id: c.parceiro_id, moeda: c.moeda || "BRL",
        reconciled_at: c.reconciled_at,
      })));

      setWallets((walletsRes.data || []).map((w: any) => ({
        id: w.id, exchange: w.exchange, endereco: w.endereco,
        parceiro_id: w.parceiro_id, parceiro_nome: w.parceiros?.nome,
        moeda: Array.isArray(w.moeda) ? w.moeda : ["USDT"],
        reconciled_at: w.reconciled_at,
      })));

      // Map saldos contas
      const saldosMap: Record<string, number> = {};
      (saldosContasRes.data || []).forEach((s: any) => {
        saldosMap[s.conta_id] = s.saldo || 0;
      });
      setSaldosContas(saldosMap);

      // Map saldos wallets (by wallet_id + coin)
      const walletsMap: Record<string, Record<string, number>> = {};
      (saldosWalletsRes.data || []).forEach((s: any) => {
        if (!walletsMap[s.wallet_id]) walletsMap[s.wallet_id] = {};
        walletsMap[s.wallet_id][s.coin] = s.saldo_coin || 0;
      });
      setSaldosWallets(walletsMap);
    } catch (error) {
      console.error("Erro ao carregar dados:", error);
    } finally {
      setFetchingData(false);
    }
  };

  const formatCurrencyInput = (value: string): string => {
    const numericValue = value.replace(/[^\d]/g, "");
    if (!numericValue) return "";
    const numberValue = parseInt(numericValue, 10) / 100;
    return numberValue.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  };

  const handleSaldoRealChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const formatted = formatCurrencyInput(e.target.value);
    setSaldoRealDisplay(formatted);
    const numericValue = formatted.replace(/\./g, "").replace(",", ".");
    setSaldoReal(numericValue);
  };

  const getEntidadeNome = (): string => {
    if (tipoEntidade === "BOOKMAKER") {
      const bk = bookmakers.find(b => b.id === entidadeId);
      return bk ? `${bk.nome}${bk.parceiro_nome ? ` (${bk.parceiro_nome})` : ""}` : "";
    }
    if (tipoEntidade === "CONTA_BANCARIA") {
      const conta = contas.find(c => c.id === entidadeId);
      return conta ? `${conta.banco} - ${conta.titular}` : "";
    }
    if (tipoEntidade === "WALLET") {
      const wallet = wallets.find(w => w.id === entidadeId);
      return wallet ? `${wallet.exchange} - ${wallet.endereco.slice(0, 10)}...` : "";
    }
    return "";
  };

  const canSubmit = (): boolean => {
    if (!entidadeId) return false;
    if (!saldoReal) return false;
    if (Math.abs(diferenca) < 0.01) return false;
    if (!motivo.trim()) return false;
    return true;
  };

  const handleSubmit = async () => {
    if (!canSubmit()) return;

    setLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Usuário não autenticado");
      if (!workspaceId) throw new Error("Workspace não encontrado");

      const valorAjuste = Math.abs(diferenca);
      const direcao = diferenca > 0 ? "ENTRADA" : "SAIDA";
      const isCrypto = CRYPTO_CURRENCIES.some(c => c.value === moeda);
      const cotacaoSnapshot = moeda !== "BRL" ? getRate(moeda) : null;
      const cotacaoSnapshotAt = moeda !== "BRL" ? new Date().toISOString() : null;
      const valorBrlRef = moeda !== "BRL" ? valorAjuste * (getRate(moeda) || 1) : null;

      const transactionData: Record<string, any> = {
        user_id: user.id,
        workspace_id: workspaceId,
        tipo_transacao: "AJUSTE_RECONCILIACAO",
        tipo_moeda: isCrypto ? "CRYPTO" : "FIAT",
        moeda,
        valor: valorAjuste,
        descricao: `[RECONCILIAÇÃO ${direcao}] ${motivo} | Saldo sistema: ${saldoSistema.toFixed(2)} → Saldo real: ${(parseFloat(saldoReal) || 0).toFixed(2)} | Diferença: ${diferenca.toFixed(2)}`,
        status: "CONFIRMADO",
        data_transacao: new Date().toISOString().split("T")[0],
        impacta_caixa_operacional: false,
        ajuste_motivo: motivo.trim(),
        ajuste_direcao: direcao,
        cotacao: cotacaoSnapshot,
        cotacao_snapshot_at: cotacaoSnapshotAt,
        valor_usd_referencia: valorBrlRef,
        auditoria_metadata: {
          tipo_reconciliacao: "RECONCILIACAO_DESENVOLVIMENTO",
          saldo_sistema_anterior: saldoSistema,
          saldo_real_informado: parseFloat(saldoReal) || 0,
          diferenca,
          entidade_tipo: tipoEntidade,
          entidade_id: entidadeId,
          entidade_nome: getEntidadeNome(),
          moeda,
          registrado_em: new Date().toISOString(),
          user_agent: navigator.userAgent,
        },
      };

      // Definir origem/destino
      if (direcao === "ENTRADA") {
        transactionData.origem_tipo = "CAIXA_OPERACIONAL";
        switch (tipoEntidade) {
          case "BOOKMAKER":
            transactionData.destino_tipo = "BOOKMAKER";
            transactionData.destino_bookmaker_id = entidadeId;
            transactionData.valor_destino = valorAjuste;
            transactionData.moeda_destino = moeda;
            break;
          case "CONTA_BANCARIA":
            transactionData.destino_tipo = "PARCEIRO_CONTA";
            transactionData.destino_conta_bancaria_id = entidadeId;
            transactionData.valor_destino = valorAjuste;
            transactionData.moeda_destino = moeda;
            break;
          case "WALLET":
            transactionData.destino_tipo = "PARCEIRO_WALLET";
            transactionData.destino_wallet_id = entidadeId;
            transactionData.valor_destino = valorAjuste;
            transactionData.moeda_destino = moeda;
            break;
        }
      } else {
        transactionData.destino_tipo = "CAIXA_OPERACIONAL";
        switch (tipoEntidade) {
          case "BOOKMAKER":
            transactionData.origem_tipo = "BOOKMAKER";
            transactionData.origem_bookmaker_id = entidadeId;
            transactionData.valor_origem = valorAjuste;
            transactionData.moeda_origem = moeda;
            break;
          case "CONTA_BANCARIA":
            transactionData.origem_tipo = "PARCEIRO_CONTA";
            transactionData.origem_conta_bancaria_id = entidadeId;
            transactionData.valor_origem = valorAjuste;
            transactionData.moeda_origem = moeda;
            break;
          case "WALLET":
            transactionData.origem_tipo = "PARCEIRO_WALLET";
            transactionData.origem_wallet_id = entidadeId;
            transactionData.valor_origem = valorAjuste;
            transactionData.moeda_origem = moeda;
            break;
        }
      }

      const { error } = await supabase.from("cash_ledger").insert([transactionData] as any);
      if (error) throw error;

      toast({
        title: "Reconciliação registrada",
        description: `Ajuste de ${getCurrencySymbol(moeda)} ${valorAjuste.toFixed(2)} (${direcao === "ENTRADA" ? "+" : "-"}) em ${getEntidadeNome()} registrado com sucesso.`,
      });

      handleClose();
      dispatchCaixaDataChanged();
      onSuccess();
    } catch (error: any) {
      console.error("Erro ao registrar reconciliação:", error);
      toast({
        title: "Erro ao registrar reconciliação",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleClose = () => {
    setTipoEntidade("BOOKMAKER");
    setEntidadeId("");
    setMoeda("BRL");
    setSaldoReal("");
    setSaldoRealDisplay("");
    setMotivo("Reconciliação Desenvolvimento");
    onClose();
  };

  if (!canAccess) {
    return (
      <Dialog open={open} onOpenChange={handleClose}>
        <DialogContent>
          <DialogHeader><DialogTitle>Acesso Negado</DialogTitle></DialogHeader>
          <Alert variant="destructive">
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription>Apenas administradores podem realizar reconciliações.</AlertDescription>
          </Alert>
        </DialogContent>
      </Dialog>
    );
  }

  const currencySymbol = getCurrencySymbol(moeda);
  const entidadeReconciledAt = (() => {
    if (tipoEntidade === "BOOKMAKER") return bookmakers.find(b => b.id === entidadeId)?.reconciled_at;
    if (tipoEntidade === "CONTA_BANCARIA") return contas.find(c => c.id === entidadeId)?.reconciled_at;
    if (tipoEntidade === "WALLET") return wallets.find(w => w.id === entidadeId)?.reconciled_at;
    return null;
  })();

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Scale className="h-5 w-5 text-primary" />
            Reconciliação de Saldo
          </DialogTitle>
          <DialogDescription>
            Informe o saldo real observado. O sistema calculará a diferença e criará um lançamento auditável.
          </DialogDescription>
        </DialogHeader>

        <Alert className="border-primary/30 bg-primary/5">
          <Info className="h-4 w-4 text-primary" />
          <AlertDescription className="text-xs text-muted-foreground">
            Este lançamento é do tipo <strong>AJUSTE_RECONCILIACAO</strong>, distinto de ajustes operacionais comuns.
            Será rastreável em auditorias e relatórios separadamente.
          </AlertDescription>
        </Alert>

        {fetchingData ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className="space-y-4">
            {/* Tipo de entidade */}
            <div className="space-y-2">
              <Label>Tipo de Entidade</Label>
              <Select value={tipoEntidade} onValueChange={(v) => setTipoEntidade(v as TipoEntidade)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="BOOKMAKER">Bookmaker</SelectItem>
                  <SelectItem value="CONTA_BANCARIA">Conta Bancária</SelectItem>
                  <SelectItem value="WALLET">Wallet Crypto</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Seleção de entidade */}
            <div className="space-y-2">
              <Label>
                {tipoEntidade === "BOOKMAKER" ? "Bookmaker" : tipoEntidade === "CONTA_BANCARIA" ? "Conta Bancária" : "Wallet"}
              </Label>
              <Select value={entidadeId} onValueChange={setEntidadeId}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecione..." />
                </SelectTrigger>
                <SelectContent>
                  {tipoEntidade === "BOOKMAKER" && bookmakers.map((bk) => (
                    <SelectItem key={bk.id} value={bk.id}>
                      <div className="flex items-center gap-2">
                        <span>{bk.nome}</span>
                        <Badge variant="secondary" className="text-xs">{bk.moeda}</Badge>
                        <span className="text-muted-foreground text-xs">
                          ({getCurrencySymbol(bk.moeda)} {bk.saldo_atual.toFixed(2)})
                        </span>
                        {bk.parceiro_nome && <span className="text-muted-foreground text-xs">• {bk.parceiro_nome}</span>}
                      </div>
                    </SelectItem>
                  ))}
                  {tipoEntidade === "CONTA_BANCARIA" && contas.map((conta) => (
                    <SelectItem key={conta.id} value={conta.id}>
                      <div className="flex items-center gap-2">
                        <span>{conta.banco} - {conta.titular}</span>
                        <Badge variant="secondary" className="text-xs">{conta.moeda}</Badge>
                        <span className="text-muted-foreground text-xs">
                          ({getCurrencySymbol(conta.moeda)} {(saldosContas[conta.id] || 0).toFixed(2)})
                        </span>
                      </div>
                    </SelectItem>
                  ))}
                  {tipoEntidade === "WALLET" && wallets.map((wallet) => (
                    <SelectItem key={wallet.id} value={wallet.id}>
                      <div className="flex flex-col gap-0.5">
                        <div className="flex items-center gap-2">
                          <span className="font-medium uppercase">{wallet.exchange}</span>
                          <div className="flex gap-1">
                            {wallet.moeda.slice(0, 3).map((m) => (
                              <Badge key={m} variant="secondary" className="text-[10px] px-1.5 py-0">{m}</Badge>
                            ))}
                            {wallet.moeda.length > 3 && (
                              <Badge variant="outline" className="text-[10px] px-1.5 py-0">+{wallet.moeda.length - 3}</Badge>
                            )}
                          </div>
                        </div>
                        <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
                          {wallet.parceiro_nome && <span>{wallet.parceiro_nome}</span>}
                          {wallet.parceiro_nome && <span>•</span>}
                          <span className="font-mono">{wallet.endereco.slice(0, 6)}...{wallet.endereco.slice(-4)}</span>
                        </div>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Moeda (para wallets com múltiplas) */}
            {tipoEntidade === "WALLET" && moedasDisponiveis.length > 1 && (
              <div className="space-y-2">
                <Label>Moeda</Label>
                <Select value={moeda} onValueChange={setMoeda}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {moedasDisponiveis.map((m) => (
                      <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {/* Saldo atual do sistema */}
            {entidadeId && (
              <div className="rounded-lg border border-border/50 bg-muted/30 p-3 space-y-2">
                <div className="flex justify-between items-center">
                  <span className="text-sm text-muted-foreground">Saldo no Sistema</span>
                  <span className="font-mono font-semibold">
                    {currencySymbol} {saldoSistema.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </span>
                </div>
                {entidadeReconciledAt && (
                  <div className="flex items-center gap-1 text-xs text-muted-foreground">
                    <Badge variant="outline" className="text-xs">
                      Última reconciliação: {new Date(entidadeReconciledAt).toLocaleDateString("pt-BR")}
                    </Badge>
                  </div>
                )}
              </div>
            )}

            {/* Saldo Real Observado */}
            <div className="space-y-2">
              <Label>Saldo Real Observado *</Label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">
                  {currencySymbol}
                </span>
                <Input
                  value={saldoRealDisplay}
                  onChange={handleSaldoRealChange}
                  placeholder="0,00"
                  className="pl-10"
                />
              </div>
            </div>

            {/* Diferença calculada */}
            {saldoReal && entidadeId && (
              <div className={`rounded-lg border p-3 ${
                Math.abs(diferenca) < 0.01
                  ? "border-muted bg-muted/20"
                  : diferenca > 0
                    ? "border-primary/30 bg-primary/5"
                    : "border-destructive/30 bg-destructive/5"
              }`}>
                <div className="flex justify-between items-center">
                  <span className="text-sm font-medium">Diferença Calculada</span>
                  <div className="flex items-center gap-2">
                    {Math.abs(diferenca) < 0.01 ? (
                      <Minus className="h-4 w-4 text-muted-foreground" />
                    ) : diferenca > 0 ? (
                      <TrendingUp className="h-4 w-4 text-primary" />
                    ) : (
                      <TrendingDown className="h-4 w-4 text-destructive" />
                    )}
                    <span className={`font-mono font-bold ${
                      Math.abs(diferenca) < 0.01 ? "text-muted-foreground" : diferenca > 0 ? "text-primary" : "text-destructive"
                    }`}>
                      {diferenca > 0 ? "+" : ""}{currencySymbol} {diferenca.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </span>
                  </div>
                </div>
                {Math.abs(diferenca) >= 0.01 && (
                  <p className="text-xs text-muted-foreground mt-1">
                    Será criado um lançamento de <strong>{diferenca > 0 ? "ENTRADA" : "SAÍDA"}</strong> de{" "}
                    <strong>{currencySymbol} {Math.abs(diferenca).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong>
                  </p>
                )}
                {Math.abs(diferenca) < 0.01 && (
                  <p className="text-xs text-muted-foreground mt-1">Saldo já está correto. Nenhum ajuste necessário.</p>
                )}
              </div>
            )}

            {/* Motivo */}
            <div className="space-y-2">
              <Label>Justificativa *</Label>
              <Textarea
                value={motivo}
                onChange={(e) => setMotivo(e.target.value)}
                placeholder="Descreva o motivo da reconciliação..."
                rows={2}
              />
            </div>

            {/* Actions */}
            <div className="flex justify-end gap-2 pt-4">
              <Button variant="outline" onClick={handleClose} disabled={loading}>
                Cancelar
              </Button>
              <Button onClick={handleSubmit} disabled={loading || !canSubmit()}>
                {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Registrar Reconciliação
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
