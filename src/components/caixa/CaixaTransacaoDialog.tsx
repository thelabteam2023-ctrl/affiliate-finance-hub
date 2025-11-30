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
      return null; // Origem é sempre CAIXA_OPERACIONAL
    }

    if (tipoTransacao === "SAQUE") {
      return (
        <div className="space-y-2">
          <Label>Bookmaker de Origem</Label>
          <BookmakerSelect
            value={origemBookmakerId}
            onValueChange={setOrigemBookmakerId}
          />
        </div>
      );
    }

    if (tipoTransacao === "TRANSFERENCIA") {
      return (
        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Tipo de Origem</Label>
            <Select value={origemTipo} onValueChange={setOrigemTipo}>
              <SelectTrigger>
                <SelectValue placeholder="Selecione" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="CAIXA_OPERACIONAL">Caixa Operacional</SelectItem>
                <SelectItem value="PARCEIRO_CONTA">Conta Bancária do Parceiro</SelectItem>
                <SelectItem value="PARCEIRO_WALLET">Wallet Crypto do Parceiro</SelectItem>
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
                  <Label>Conta Bancária</Label>
                  <Select value={origemContaId} onValueChange={setOrigemContaId}>
                    <SelectTrigger>
                      <SelectValue placeholder="Selecione a conta" />
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
                  <Label>Wallet Crypto</Label>
                  <Select value={origemWalletId} onValueChange={setOrigemWalletId}>
                    <SelectTrigger>
                      <SelectValue placeholder="Selecione a wallet" />
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
        </div>
      );
    }

    return null;
  };

  const renderDestinoFields = () => {
    if (tipoTransacao === "APORTE_FINANCEIRO" || tipoTransacao === "SAQUE") {
      return null; // Destino é sempre CAIXA_OPERACIONAL
    }

    if (tipoTransacao === "DEPOSITO") {
      return (
        <div className="space-y-2">
          <Label>Bookmaker de Destino</Label>
          <BookmakerSelect
            value={destinoBookmakerId}
            onValueChange={setDestinoBookmakerId}
          />
        </div>
      );
    }

    if (tipoTransacao === "TRANSFERENCIA") {
      return (
        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Tipo de Destino</Label>
            <Select value={destinoTipo} onValueChange={setDestinoTipo}>
              <SelectTrigger>
                <SelectValue placeholder="Selecione" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="CAIXA_OPERACIONAL">Caixa Operacional</SelectItem>
                <SelectItem value="PARCEIRO_CONTA">Conta Bancária do Parceiro</SelectItem>
                <SelectItem value="PARCEIRO_WALLET">Wallet Crypto do Parceiro</SelectItem>
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
                  <Label>Conta Bancária</Label>
                  <Select value={destinoContaId} onValueChange={setDestinoContaId}>
                    <SelectTrigger>
                      <SelectValue placeholder="Selecione a conta" />
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
                  <Label>Wallet Crypto</Label>
                  <Select value={destinoWalletId} onValueChange={setDestinoWalletId}>
                    <SelectTrigger>
                      <SelectValue placeholder="Selecione a wallet" />
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
        </div>
      );
    }

    return null;
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Nova Transação</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Tipo de Transação *</Label>
            <Select value={tipoTransacao} onValueChange={setTipoTransacao}>
              <SelectTrigger>
                <SelectValue placeholder="Selecione o tipo" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="APORTE_FINANCEIRO">Aporte Financeiro</SelectItem>
                <SelectItem value="TRANSFERENCIA">Transferência</SelectItem>
                <SelectItem value="DEPOSITO">Depósito (para Bookmaker)</SelectItem>
                <SelectItem value="SAQUE">Saque (de Bookmaker)</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Tipo de Moeda *</Label>
              <Select value={tipoMoeda} onValueChange={setTipoMoeda}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="FIAT">FIAT (Moeda Corrente)</SelectItem>
                  <SelectItem value="CRYPTO">CRYPTO (Criptomoeda)</SelectItem>
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
                    <SelectItem value="BRL">BRL - Real Brasileiro</SelectItem>
                    <SelectItem value="USD">USD - Dólar Americano</SelectItem>
                    <SelectItem value="EUR">EUR - Euro</SelectItem>
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
                    <SelectItem value="BTC">BTC - Bitcoin</SelectItem>
                    <SelectItem value="ETH">ETH - Ethereum</SelectItem>
                    <SelectItem value="USDT">USDT - Tether</SelectItem>
                    <SelectItem value="USDC">USDC - USD Coin</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Valor {tipoMoeda === "CRYPTO" ? "USD" : moeda} *</Label>
              <Input
                type="number"
                step="0.01"
                value={valor}
                onChange={(e) => setValor(e.target.value)}
                placeholder="0.00"
              />
            </div>

            {tipoMoeda === "CRYPTO" && (
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
            )}
          </div>

          {tipoMoeda === "CRYPTO" && (
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
          )}

          {renderOrigemFields()}
          {renderDestinoFields()}

          <div className="space-y-2">
            <Label>Descrição</Label>
            <Textarea
              value={descricao}
              onChange={(e) => setDescricao(e.target.value)}
              placeholder="Observações sobre a transação"
              rows={3}
            />
          </div>

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
