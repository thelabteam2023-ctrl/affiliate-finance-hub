import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
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
import ParceiroSelect from "@/components/parceiros/ParceiroSelect";
import BookmakerSelect from "@/components/bookmakers/BookmakerSelect";
import { Loader2 } from "lucide-react";

interface CaixaTransacaoDialogProps {
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

interface ContaBancaria {
  id: string;
  banco: string;
  titular: string;
  parceiro_id: string;
}

interface WalletCrypto {
  id: string;
  exchange: string;
  endereco: string;
  parceiro_id: string;
}

export function CaixaTransacaoDialog({
  open,
  onClose,
  onSuccess,
}: CaixaTransacaoDialogProps) {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);

  // Form state
  const [tipoTransacao, setTipoTransacao] = useState<string>("");
  const [tipoMoeda, setTipoMoeda] = useState<string>("FIAT");
  const [moeda, setMoeda] = useState<string>("BRL");
  const [coin, setCoin] = useState<string>("");
  const [valor, setValor] = useState<string>("");
  const [qtdCoin, setQtdCoin] = useState<string>("");
  const [cotacao, setCotacao] = useState<string>("");
  const [descricao, setDescricao] = useState<string>("");

  // Origin/Destination state
  const [origemTipo, setOrigemTipo] = useState<string>("");
  const [origemParceiroId, setOrigemParceiroId] = useState<string>("");
  const [origemContaId, setOrigemContaId] = useState<string>("");
  const [origemWalletId, setOrigemWalletId] = useState<string>("");
  const [origemBookmakerId, setOrigemBookmakerId] = useState<string>("");

  const [destinoTipo, setDestinoTipo] = useState<string>("");
  const [destinoParceiroId, setDestinoParceiroId] = useState<string>("");
  const [destinoContaId, setDestinoContaId] = useState<string>("");
  const [destinoWalletId, setDestinoWalletId] = useState<string>("");
  const [destinoBookmakerId, setDestinoBookmakerId] = useState<string>("");

  // Data for selects
  const [contasBancarias, setContasBancarias] = useState<ContaBancaria[]>([]);
  const [walletsCrypto, setWalletsCrypto] = useState<WalletCrypto[]>([]);

  useEffect(() => {
    if (open) {
      fetchAccountsAndWallets();
    }
  }, [open]);

  useEffect(() => {
    // Reset origin/destination when transaction type changes
    setOrigemTipo("");
    setOrigemParceiroId("");
    setOrigemContaId("");
    setOrigemWalletId("");
    setOrigemBookmakerId("");
    setDestinoTipo("");
    setDestinoParceiroId("");
    setDestinoContaId("");
    setDestinoWalletId("");
    setDestinoBookmakerId("");

    // Set defaults based on transaction type
    if (tipoTransacao === "APORTE_FINANCEIRO") {
      setDestinoTipo("CAIXA_OPERACIONAL");
    } else if (tipoTransacao === "DEPOSITO") {
      setOrigemTipo("CAIXA_OPERACIONAL");
      setDestinoTipo("BOOKMAKER");
    } else if (tipoTransacao === "SAQUE") {
      setOrigemTipo("BOOKMAKER");
      setDestinoTipo("CAIXA_OPERACIONAL");
    }
  }, [tipoTransacao]);

  const fetchAccountsAndWallets = async () => {
    try {
      const { data: contas } = await supabase
        .from("contas_bancarias")
        .select("id, banco, titular, parceiro_id")
        .order("banco");

      const { data: wallets } = await supabase
        .from("wallets_crypto")
        .select("id, exchange, endereco, parceiro_id")
        .order("exchange");

      setContasBancarias(contas || []);
      setWalletsCrypto(wallets || []);
    } catch (error) {
      console.error("Erro ao carregar contas e wallets:", error);
    }
  };

  const resetForm = () => {
    setTipoTransacao("");
    setTipoMoeda("FIAT");
    setMoeda("BRL");
    setCoin("");
    setValor("");
    setQtdCoin("");
    setCotacao("");
    setDescricao("");
    setOrigemTipo("");
    setOrigemParceiroId("");
    setOrigemContaId("");
    setOrigemWalletId("");
    setOrigemBookmakerId("");
    setDestinoTipo("");
    setDestinoParceiroId("");
    setDestinoContaId("");
    setDestinoWalletId("");
    setDestinoBookmakerId("");
  };

  const handleSubmit = async () => {
    try {
      setLoading(true);

      // Validation
      if (!tipoTransacao) {
        toast({
          title: "Erro",
          description: "Selecione o tipo de transação",
          variant: "destructive",
        });
        return;
      }

      if (!valor || parseFloat(valor) <= 0) {
        toast({
          title: "Erro",
          description: "Informe um valor válido",
          variant: "destructive",
        });
        return;
      }

      if (tipoMoeda === "CRYPTO" && (!qtdCoin || parseFloat(qtdCoin) <= 0)) {
        toast({
          title: "Erro",
          description: "Informe a quantidade de crypto",
          variant: "destructive",
        });
        return;
      }

      const { data: userData } = await supabase.auth.getUser();
      if (!userData.user) throw new Error("Usuário não autenticado");

      const transactionData: any = {
        user_id: userData.user.id,
        tipo_transacao: tipoTransacao,
        tipo_moeda: tipoMoeda,
        moeda: tipoMoeda === "FIAT" ? moeda : "USD",
        valor: parseFloat(valor),
        descricao,
        status: "CONFIRMADO",
      };

      // Add crypto-specific fields
      if (tipoMoeda === "CRYPTO") {
        transactionData.coin = coin;
        transactionData.qtd_coin = parseFloat(qtdCoin);
        transactionData.valor_usd = parseFloat(valor);
        if (cotacao) {
          transactionData.cotacao = parseFloat(cotacao);
        }
      }

      // Add origin fields
      if (origemTipo) {
        transactionData.origem_tipo = origemTipo;
        if (origemTipo === "PARCEIRO_CONTA") {
          transactionData.origem_conta_bancaria_id = origemContaId;
          transactionData.origem_parceiro_id = origemParceiroId;
        } else if (origemTipo === "PARCEIRO_WALLET") {
          transactionData.origem_wallet_id = origemWalletId;
          transactionData.origem_parceiro_id = origemParceiroId;
        } else if (origemTipo === "BOOKMAKER") {
          transactionData.origem_bookmaker_id = origemBookmakerId;
        }
      }

      // Add destination fields
      if (destinoTipo) {
        transactionData.destino_tipo = destinoTipo;
        if (destinoTipo === "PARCEIRO_CONTA") {
          transactionData.destino_conta_bancaria_id = destinoContaId;
          transactionData.destino_parceiro_id = destinoParceiroId;
        } else if (destinoTipo === "PARCEIRO_WALLET") {
          transactionData.destino_wallet_id = destinoWalletId;
          transactionData.destino_parceiro_id = destinoParceiroId;
        } else if (destinoTipo === "BOOKMAKER") {
          transactionData.destino_bookmaker_id = destinoBookmakerId;
        }
      }

      const { error } = await supabase.from("cash_ledger").insert([transactionData]);

      if (error) throw error;

      toast({
        title: "Sucesso",
        description: "Transação registrada com sucesso",
      });

      resetForm();
      onSuccess();
    } catch (error: any) {
      console.error("Erro ao registrar transação:", error);
      toast({
        title: "Erro ao registrar transação",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const renderOrigemFields = () => {
    if (tipoTransacao === "APORTE_FINANCEIRO" || tipoTransacao === "DEPOSITO") {
      return (
        <div className="text-sm text-muted-foreground italic">
          {tipoTransacao === "APORTE_FINANCEIRO" ? "Aporte externo" : "Caixa Operacional"}
        </div>
      );
    }

    if (tipoTransacao === "SAQUE") {
      return (
        <div className="space-y-2">
          <Label>Bookmaker</Label>
          <BookmakerSelect
            value={origemBookmakerId}
            onValueChange={setOrigemBookmakerId}
          />
        </div>
      );
    }

    if (tipoTransacao === "TRANSFERENCIA") {
      return (
        <>
          <div className="space-y-2">
            <Label>Tipo</Label>
            <Select value={origemTipo} onValueChange={setOrigemTipo}>
              <SelectTrigger>
                <SelectValue placeholder="Selecione" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="CAIXA_OPERACIONAL">Caixa Operacional</SelectItem>
                <SelectItem value="PARCEIRO_CONTA">Conta Bancária</SelectItem>
                <SelectItem value="PARCEIRO_WALLET">Wallet Crypto</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {origemTipo === "PARCEIRO_CONTA" && (
            <>
              <div className="space-y-2">
                <Label>Parceiro</Label>
                <ParceiroSelect
                  value={origemParceiroId}
                  onValueChange={(value) => {
                    setOrigemParceiroId(value);
                    setOrigemContaId("");
                  }}
                />
              </div>
              {origemParceiroId && (
                <div className="space-y-2">
                  <Label>Conta</Label>
                  <Select value={origemContaId} onValueChange={setOrigemContaId}>
                    <SelectTrigger>
                      <SelectValue placeholder="Selecione" />
                    </SelectTrigger>
                    <SelectContent>
                      {contasBancarias
                        .filter((c) => c.parceiro_id === origemParceiroId)
                        .map((conta) => (
                          <SelectItem key={conta.id} value={conta.id}>
                            {conta.banco} - {conta.titular}
                          </SelectItem>
                        ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
            </>
          )}

          {origemTipo === "PARCEIRO_WALLET" && (
            <>
              <div className="space-y-2">
                <Label>Parceiro</Label>
                <ParceiroSelect
                  value={origemParceiroId}
                  onValueChange={(value) => {
                    setOrigemParceiroId(value);
                    setOrigemWalletId("");
                  }}
                />
              </div>
              {origemParceiroId && (
                <div className="space-y-2">
                  <Label>Wallet</Label>
                  <Select value={origemWalletId} onValueChange={setOrigemWalletId}>
                    <SelectTrigger>
                      <SelectValue placeholder="Selecione" />
                    </SelectTrigger>
                    <SelectContent>
                      {walletsCrypto
                        .filter((w) => w.parceiro_id === origemParceiroId)
                        .map((wallet) => (
                          <SelectItem key={wallet.id} value={wallet.id}>
                            {wallet.exchange} - {wallet.endereco.substring(0, 20)}...
                          </SelectItem>
                        ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
            </>
          )}
        </>
      );
    }

    return null;
  };

  const renderDestinoFields = () => {
    if (tipoTransacao === "APORTE_FINANCEIRO" || tipoTransacao === "SAQUE") {
      return (
        <div className="text-sm text-muted-foreground italic">
          Caixa Operacional
        </div>
      );
    }

    if (tipoTransacao === "DEPOSITO") {
      return (
        <div className="space-y-2">
          <Label>Bookmaker</Label>
          <BookmakerSelect
            value={destinoBookmakerId}
            onValueChange={setDestinoBookmakerId}
          />
        </div>
      );
    }

    if (tipoTransacao === "TRANSFERENCIA") {
      return (
        <>
          <div className="space-y-2">
            <Label>Tipo</Label>
            <Select value={destinoTipo} onValueChange={setDestinoTipo}>
              <SelectTrigger>
                <SelectValue placeholder="Selecione" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="CAIXA_OPERACIONAL">Caixa Operacional</SelectItem>
                <SelectItem value="PARCEIRO_CONTA">Conta Bancária</SelectItem>
                <SelectItem value="PARCEIRO_WALLET">Wallet Crypto</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {destinoTipo === "PARCEIRO_CONTA" && (
            <>
              <div className="space-y-2">
                <Label>Parceiro</Label>
                <ParceiroSelect
                  value={destinoParceiroId}
                  onValueChange={(value) => {
                    setDestinoParceiroId(value);
                    setDestinoContaId("");
                  }}
                />
              </div>
              {destinoParceiroId && (
                <div className="space-y-2">
                  <Label>Conta</Label>
                  <Select value={destinoContaId} onValueChange={setDestinoContaId}>
                    <SelectTrigger>
                      <SelectValue placeholder="Selecione" />
                    </SelectTrigger>
                    <SelectContent>
                      {contasBancarias
                        .filter((c) => c.parceiro_id === destinoParceiroId)
                        .map((conta) => (
                          <SelectItem key={conta.id} value={conta.id}>
                            {conta.banco} - {conta.titular}
                          </SelectItem>
                        ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
            </>
          )}

          {destinoTipo === "PARCEIRO_WALLET" && (
            <>
              <div className="space-y-2">
                <Label>Parceiro</Label>
                <ParceiroSelect
                  value={destinoParceiroId}
                  onValueChange={(value) => {
                    setDestinoParceiroId(value);
                    setDestinoWalletId("");
                  }}
                />
              </div>
              {destinoParceiroId && (
                <div className="space-y-2">
                  <Label>Wallet</Label>
                  <Select value={destinoWalletId} onValueChange={setDestinoWalletId}>
                    <SelectTrigger>
                      <SelectValue placeholder="Selecione" />
                    </SelectTrigger>
                    <SelectContent>
                      {walletsCrypto
                        .filter((w) => w.parceiro_id === destinoParceiroId)
                        .map((wallet) => (
                          <SelectItem key={wallet.id} value={wallet.id}>
                            {wallet.exchange} - {wallet.endereco.substring(0, 20)}...
                          </SelectItem>
                        ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
            </>
          )}
        </>
      );
    }

    return null;
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Nova Transação</DialogTitle>
        </DialogHeader>

        <div className="space-y-6">
          {/* Tipo de Transação */}
          <div className="space-y-2">
            <Label>Tipo de Transação *</Label>
            <Select value={tipoTransacao} onValueChange={setTipoTransacao}>
              <SelectTrigger>
                <SelectValue placeholder="Selecione o tipo" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="APORTE_FINANCEIRO">APORTE FINANCEIRO</SelectItem>
                <SelectItem value="TRANSFERENCIA">TRANSFERÊNCIA</SelectItem>
                <SelectItem value="DEPOSITO">DEPÓSITO (PARA BOOKMAKER)</SelectItem>
                <SelectItem value="SAQUE">SAQUE (DE BOOKMAKER)</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Visual Flow Cards */}
          {tipoTransacao && (
            <div className="flex items-center gap-4 p-4 bg-accent/5 rounded-lg border border-border/50">
              {/* Origem Card */}
              <div className="flex-1 p-4 bg-card rounded-lg border border-border shadow-sm">
                <div className="text-xs text-muted-foreground mb-2">ORIGEM</div>
                <div className="font-medium text-foreground">
                  {tipoTransacao === "APORTE_FINANCEIRO" && "Aporte Externo"}
                  {tipoTransacao === "DEPOSITO" && "Caixa Operacional"}
                  {tipoTransacao === "SAQUE" && origemBookmakerId ? "Bookmaker Selecionado" : "Selecione Bookmaker"}
                  {tipoTransacao === "TRANSFERENCIA" && origemTipo ? (
                    origemTipo === "CAIXA_OPERACIONAL" ? "Caixa Operacional" :
                    origemTipo === "PARCEIRO_CONTA" ? "Conta Bancária" :
                    "Wallet Crypto"
                  ) : tipoTransacao === "TRANSFERENCIA" && "Selecione Origem"}
                </div>
                {valor && parseFloat(valor) > 0 && (
                  <div className="text-xs text-destructive mt-2">
                    - {tipoMoeda === "CRYPTO" ? "USD" : moeda} {parseFloat(valor).toFixed(2)}
                  </div>
                )}
              </div>

              {/* Arrow */}
              <div className="flex flex-col items-center gap-1">
                <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center">
                  <svg className="w-6 h-6 text-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
                  </svg>
                </div>
                {valor && parseFloat(valor) > 0 && (
                  <div className="text-xs font-medium text-primary">
                    {tipoMoeda === "CRYPTO" ? "USD" : moeda} {parseFloat(valor).toFixed(2)}
                  </div>
                )}
              </div>

              {/* Destino Card */}
              <div className="flex-1 p-4 bg-card rounded-lg border border-border shadow-sm">
                <div className="text-xs text-muted-foreground mb-2">DESTINO</div>
                <div className="font-medium text-foreground">
                  {tipoTransacao === "APORTE_FINANCEIRO" && "Caixa Operacional"}
                  {tipoTransacao === "SAQUE" && "Caixa Operacional"}
                  {tipoTransacao === "DEPOSITO" && destinoBookmakerId ? "Bookmaker Selecionado" : "Selecione Bookmaker"}
                  {tipoTransacao === "TRANSFERENCIA" && destinoTipo ? (
                    destinoTipo === "CAIXA_OPERACIONAL" ? "Caixa Operacional" :
                    destinoTipo === "PARCEIRO_CONTA" ? "Conta Bancária" :
                    "Wallet Crypto"
                  ) : tipoTransacao === "TRANSFERENCIA" && "Selecione Destino"}
                </div>
                {valor && parseFloat(valor) > 0 && (
                  <div className="text-xs text-primary mt-2">
                    + {tipoMoeda === "CRYPTO" ? "USD" : moeda} {parseFloat(valor).toFixed(2)}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Origem e Destino em Colunas */}
          {tipoTransacao && (
            <div className="grid grid-cols-2 gap-6">
              {/* Coluna Origem */}
              <div className="space-y-4">
                <div className="text-sm font-medium text-muted-foreground uppercase tracking-wider border-b border-border/50 pb-2">
                  Origem
                </div>
                {renderOrigemFields()}
              </div>

              {/* Coluna Destino */}
              <div className="space-y-4">
                <div className="text-sm font-medium text-muted-foreground uppercase tracking-wider border-b border-border/50 pb-2">
                  Destino
                </div>
                {renderDestinoFields()}
              </div>
            </div>
          )}

          {/* Moeda e Valores */}
          <div className="grid grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label>Tipo de Moeda *</Label>
              <Select value={tipoMoeda} onValueChange={setTipoMoeda}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="FIAT">FIAT</SelectItem>
                  <SelectItem value="CRYPTO">CRYPTO</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {tipoMoeda === "FIAT" ? (
              <div className="space-y-2">
                <Label>Moeda *</Label>
                <Select value={moeda} onValueChange={setMoeda}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="BRL">BRL</SelectItem>
                    <SelectItem value="USD">USD</SelectItem>
                    <SelectItem value="EUR">EUR</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            ) : (
              <div className="space-y-2">
                <Label>Coin *</Label>
                <Select value={coin} onValueChange={setCoin}>
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="BTC">BTC</SelectItem>
                    <SelectItem value="ETH">ETH</SelectItem>
                    <SelectItem value="USDT">USDT</SelectItem>
                    <SelectItem value="USDC">USDC</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}

            <div className="space-y-2">
              <Label>Valor *</Label>
              <Input
                type="number"
                step="0.01"
                value={valor}
                onChange={(e) => setValor(e.target.value)}
                placeholder="0.00"
              />
            </div>
          </div>

          {tipoMoeda === "CRYPTO" && (
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Quantidade {coin} *</Label>
                <Input
                  type="number"
                  step="0.00000001"
                  value={qtdCoin}
                  onChange={(e) => setQtdCoin(e.target.value)}
                  placeholder="0.00000000"
                />
              </div>
              <div className="space-y-2">
                <Label>Cotação (USD/{coin})</Label>
                <Input
                  type="number"
                  step="0.01"
                  value={cotacao}
                  onChange={(e) => setCotacao(e.target.value)}
                  placeholder="0.00"
                />
              </div>
            </div>
          )}

          {/* Descrição */}
          <div className="space-y-2">
            <Label>Descrição</Label>
            <Textarea
              value={descricao}
              onChange={(e) => setDescricao(e.target.value)}
              placeholder="Observações sobre a transação"
              rows={3}
            />
          </div>

          {/* Actions */}
          <div className="flex gap-2 justify-end pt-4">
            <Button variant="outline" onClick={onClose} disabled={loading}>
              Cancelar
            </Button>
            <Button onClick={handleSubmit} disabled={loading}>
              {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Registrar Transação
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
