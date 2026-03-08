import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useWorkspace } from "@/hooks/useWorkspace";
import { useCotacoes } from "@/hooks/useCotacoes";
import { useToast } from "@/hooks/use-toast";
import { dispatchCaixaDataChanged } from "@/hooks/useInvalidateCaixaData";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ArrowRightLeft, Loader2, ArrowDown } from "lucide-react";

const MOEDAS_CRYPTO = [
  { value: "USDT", label: "Tether (USDT)" },
  { value: "USDC", label: "USD Coin (USDC)" },
  { value: "BTC", label: "Bitcoin (BTC)" },
  { value: "ETH", label: "Ethereum (ETH)" },
  { value: "BNB", label: "Binance Coin (BNB)" },
  { value: "TRX", label: "Tron (TRX)" },
  { value: "SOL", label: "Solana (SOL)" },
  { value: "MATIC", label: "Polygon (MATIC)" },
  { value: "ADA", label: "Cardano (ADA)" },
  { value: "XRP", label: "Ripple (XRP)" },
  { value: "LTC", label: "Litecoin (LTC)" },
  { value: "AVAX", label: "Avalanche (AVAX)" },
  { value: "LINK", label: "Chainlink (LINK)" },
  { value: "DOT", label: "Polkadot (DOT)" },
  { value: "UNI", label: "Uniswap (UNI)" },
];

interface WalletOption {
  id: string;
  exchange: string | null;
  endereco: string;
  parceiro_id: string;
  moedas: string[];
  network: string | null;
}

interface CoinBalance {
  wallet_id: string;
  coin: string;
  saldo_coin: number;
  saldo_usd: number;
}

interface SwapCryptoDialogProps {
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
  caixaParceiroId: string | null;
}

export function SwapCryptoDialog({ open, onClose, onSuccess, caixaParceiroId }: SwapCryptoDialogProps) {
  const { toast } = useToast();
  const { workspaceId } = useWorkspace();
  const { cotacaoUSD, cryptoPrices } = useCotacoes(["USDT", "USDC", "BTC", "ETH", "BNB", "TRX", "SOL"]);

  const [loading, setLoading] = useState(false);
  const [wallets, setWallets] = useState<WalletOption[]>([]);
  const [balances, setBalances] = useState<CoinBalance[]>([]);
  const [parceiroNome, setParceiroNome] = useState<string>("");

  // Form state
  const [walletId, setWalletId] = useState("");
  const [coinOrigem, setCoinOrigem] = useState("");
  const [coinDestino, setCoinDestino] = useState("");
  const [qtdEnviada, setQtdEnviada] = useState("");
  const [qtdRecebida, setQtdRecebida] = useState("");

  // Derived
  const selectedWallet = wallets.find(w => w.id === walletId);
  const availableCoins = selectedWallet?.moedas || [];
  const saldoOrigem = balances.find(b => b.wallet_id === walletId && b.coin === coinOrigem);

  const fetchWalletsAndBalances = useCallback(async () => {
    if (!caixaParceiroId) return;
    const [walletsRes, balancesRes, parceiroRes] = await Promise.all([
      supabase.from("wallets_crypto").select("id, exchange, endereco, parceiro_id, moeda, network").eq("parceiro_id", caixaParceiroId),
      supabase.from("v_saldo_parceiro_wallets").select("wallet_id, coin, saldo_coin, saldo_usd").eq("parceiro_id", caixaParceiroId),
      supabase.from("parceiros").select("nome").eq("id", caixaParceiroId).single(),
    ]);
    setParceiroNome(parceiroRes.data?.nome || "");
    setWallets((walletsRes.data || []).map((w: any) => ({
      id: w.id,
      exchange: w.exchange,
      endereco: w.endereco,
      parceiro_id: w.parceiro_id,
      moedas: Array.isArray(w.moeda) ? w.moeda : [],
      network: w.network,
    })));
    setBalances((balancesRes.data || []).map((b: any) => ({
      wallet_id: b.wallet_id,
      coin: b.coin,
      saldo_coin: b.saldo_coin || 0,
      saldo_usd: b.saldo_usd || 0,
    })));
  }, [caixaParceiroId]);

  useEffect(() => {
    if (open) {
      fetchWalletsAndBalances();
      resetForm();
    }
  }, [open, fetchWalletsAndBalances]);

  const resetForm = () => {
    setWalletId("");
    setCoinOrigem("");
    setCoinDestino("");
    setQtdEnviada("");
    setQtdRecebida("");
  };

  // Calculate USD estimates
  const qtdEnviadaNum = parseFloat(qtdEnviada) || 0;
  const qtdRecebidaNum = parseFloat(qtdRecebida) || 0;
  const precoOrigem = cryptoPrices[coinOrigem] || 1;
  const precoDestino = cryptoPrices[coinDestino] || 1;
  const usdEnviado = qtdEnviadaNum * precoOrigem;
  const usdRecebido = qtdRecebidaNum * precoDestino;
  const spreadUsd = usdRecebido - usdEnviado;
  const spreadPct = usdEnviado > 0 ? ((spreadUsd / usdEnviado) * 100) : 0;

  const canSubmit = walletId && coinOrigem && coinDestino && coinOrigem !== coinDestino
    && qtdEnviadaNum > 0 && qtdRecebidaNum > 0
    && (saldoOrigem ? qtdEnviadaNum <= saldoOrigem.saldo_coin : true);

  const handleSwap = async () => {
    if (!canSubmit || !workspaceId || !caixaParceiroId) return;
    setLoading(true);

    try {
      const { data: userData } = await supabase.auth.getUser();
      if (!userData?.user) throw new Error("Usuário não autenticado");

      const now = new Date().toISOString();
      const dataTransacao = now.split("T")[0];

      // SWAP_OUT: Débito da moeda origem
      const swapOutData: any = {
        user_id: userData.user.id,
        workspace_id: workspaceId,
        tipo_transacao: "SWAP_OUT",
        tipo_moeda: "CRYPTO",
        moeda: "USD",
        valor: usdEnviado,
        coin: coinOrigem,
        qtd_coin: qtdEnviadaNum,
        valor_usd: usdEnviado,
        valor_usd_referencia: usdEnviado,
        cotacao: precoOrigem,
        cotacao_origem_usd: precoOrigem,
        cotacao_snapshot_at: now,
        data_transacao: dataTransacao,
        status: "CONFIRMADO",
        transit_status: "CONFIRMED",
        impacta_caixa_operacional: true,
        descricao: `Swap ${coinOrigem} → ${coinDestino}`,
        origem_wallet_id: walletId,
        origem_parceiro_id: caixaParceiroId,
        moeda_origem: coinOrigem,
        valor_origem: qtdEnviadaNum,
        moeda_destino: coinDestino,
        valor_destino: qtdRecebidaNum,
        cotacao_implicita: qtdRecebidaNum / qtdEnviadaNum,
      };

      const { data: outResult, error: outError } = await supabase
        .from("cash_ledger")
        .insert([swapOutData])
        .select("id")
        .single();

      if (outError) throw outError;

      // SWAP_IN: Crédito da moeda destino (vinculado ao SWAP_OUT)
      const swapInData: any = {
        user_id: userData.user.id,
        workspace_id: workspaceId,
        tipo_transacao: "SWAP_IN",
        tipo_moeda: "CRYPTO",
        moeda: "USD",
        valor: usdRecebido,
        coin: coinDestino,
        qtd_coin: qtdRecebidaNum,
        valor_usd: usdRecebido,
        valor_usd_referencia: usdRecebido,
        cotacao: precoDestino,
        cotacao_destino_usd: precoDestino,
        cotacao_snapshot_at: now,
        data_transacao: dataTransacao,
        status: "CONFIRMADO",
        transit_status: "CONFIRMED",
        impacta_caixa_operacional: true,
        descricao: `Swap ${coinOrigem} → ${coinDestino}`,
        destino_wallet_id: walletId,
        destino_parceiro_id: caixaParceiroId,
        referencia_transacao_id: outResult.id,
        moeda_origem: coinOrigem,
        valor_origem: qtdEnviadaNum,
        moeda_destino: coinDestino,
        valor_destino: qtdRecebidaNum,
        cotacao_implicita: qtdRecebidaNum / qtdEnviadaNum,
      };

      const { error: inError } = await supabase
        .from("cash_ledger")
        .insert([swapInData]);

      if (inError) throw inError;

      toast({
        title: "Swap registrado!",
        description: `${qtdEnviadaNum} ${coinOrigem} → ${qtdRecebidaNum} ${coinDestino}`,
      });

      dispatchCaixaDataChanged();
      setTimeout(() => dispatchCaixaDataChanged(), 600);
      onSuccess();
      onClose();
    } catch (error: any) {
      console.error("[SwapCryptoDialog] Erro:", error);
      toast({
        title: "Erro ao registrar swap",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="sm:max-w-md bg-background">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ArrowRightLeft className="h-5 w-5 text-blue-400" />
            Swap Crypto
          </DialogTitle>
          <DialogDescription>
            Troque entre moedas na mesma wallet. Informe o valor enviado e o valor recebido.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Wallet Selection - Rich cards */}
          <div className="space-y-1.5">
            <Label className="text-xs">Wallet</Label>
            {parceiroNome && (
              <p className="text-[11px] text-primary uppercase tracking-wider mb-1">
                {parceiroNome}
              </p>
            )}
            <div className="space-y-2 max-h-[200px] overflow-y-auto">
              {wallets.map(w => {
                const walletBalances = balances.filter(b => b.wallet_id === w.id);
                const isSelected = walletId === w.id;
                const exchangeName = (w.exchange || w.network || "Wallet").split(/[-\s]/).map(s => s.charAt(0).toUpperCase() + s.slice(1)).join(' ').toUpperCase();
                const truncAddr = `${w.endereco.slice(0, 6)}...${w.endereco.slice(-4)}`;

                return (
                  <button
                    key={w.id}
                    type="button"
                    onClick={() => { setWalletId(w.id); setCoinOrigem(""); setCoinDestino(""); }}
                    className={`w-full text-left rounded-lg border p-3 transition-colors ${
                      isSelected 
                        ? "border-primary bg-primary/10" 
                        : "border-border/50 bg-muted/20 hover:border-border hover:bg-muted/40"
                    }`}
                  >
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="font-semibold text-sm text-foreground">{exchangeName}</span>
                      <div className="flex gap-1">
                        {w.moedas.map(coin => (
                          <Badge key={coin} variant="outline" className="text-[10px] px-1.5 py-0 h-5">
                            {coin}
                          </Badge>
                        ))}
                      </div>
                    </div>
                    <p className="text-xs font-mono text-muted-foreground">{truncAddr}</p>
                    {walletBalances.length > 0 && (
                      <div className="flex flex-wrap gap-x-3 gap-y-0.5 mt-1.5">
                        {walletBalances.map(b => (
                          <span key={b.coin} className="text-[11px] text-foreground">
                            {b.coin} {b.saldo_coin.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                            <span className="text-muted-foreground ml-1">≈ R$ {(b.saldo_usd * (cotacaoUSD || 1)).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                          </span>
                        ))}
                      </div>
                    )}
                  </button>
                );
              })}
              {wallets.length === 0 && (
                <p className="text-xs text-muted-foreground text-center py-4">Nenhuma wallet encontrada</p>
              )}
            </div>
          </div>

          {/* Moeda Origem */}
          {walletId && (
            <div className="space-y-3 rounded-lg border border-border/50 p-3 bg-muted/20">
              <div className="flex items-center gap-2">
                <Badge variant="outline" className="text-[10px] uppercase">Envio</Badge>
                <span className="text-xs text-muted-foreground">O que você está trocando</span>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-xs">Moeda</Label>
                  <Select value={coinOrigem} onValueChange={(v) => { setCoinOrigem(v); if (v === coinDestino) setCoinDestino(""); }}>
                    <SelectTrigger>
                      <SelectValue placeholder="Moeda" />
                    </SelectTrigger>
                    <SelectContent>
                      {availableCoins.map(c => {
                        const info = MOEDAS_CRYPTO.find(m => m.value === c);
                        return (
                          <SelectItem key={c} value={c}>
                            {info?.label || c}
                          </SelectItem>
                        );
                      })}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Quantidade enviada</Label>
                  <Input
                    type="number"
                    step="0.00000001"
                    value={qtdEnviada}
                    onChange={(e) => setQtdEnviada(e.target.value)}
                    placeholder="0.00"
                  />
                </div>
              </div>
              {coinOrigem && saldoOrigem && (
                <div className="flex items-center justify-between text-[11px] text-muted-foreground px-1">
                  <span>Saldo: {saldoOrigem.saldo_coin.toFixed(saldoOrigem.saldo_coin < 1 ? 8 : 2)} {coinOrigem}</span>
                  {qtdEnviadaNum > 0 && (
                    <span>≈ ${usdEnviado.toFixed(2)} USD</span>
                  )}
                </div>
              )}
              {saldoOrigem && qtdEnviadaNum > saldoOrigem.saldo_coin && (
                <div className="text-[11px] text-destructive px-1">
                  ⚠ Saldo insuficiente
                </div>
              )}
            </div>
          )}

          {/* Arrow divider */}
          {coinOrigem && (
            <div className="flex justify-center">
              <div className="rounded-full border border-border/50 bg-muted/30 p-1.5">
                <ArrowDown className="h-4 w-4 text-blue-400" />
              </div>
            </div>
          )}

          {/* Moeda Destino */}
          {coinOrigem && (
            <div className="space-y-3 rounded-lg border border-border/50 p-3 bg-muted/20">
              <div className="flex items-center gap-2">
                <Badge variant="outline" className="text-[10px] uppercase text-emerald-400 border-emerald-400/30">Recebido</Badge>
                <span className="text-xs text-muted-foreground">O que você recebeu</span>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-xs">Moeda</Label>
                  <Select value={coinDestino} onValueChange={setCoinDestino}>
                    <SelectTrigger>
                      <SelectValue placeholder="Moeda" />
                    </SelectTrigger>
                    <SelectContent>
                      {availableCoins.filter(c => c !== coinOrigem).map(c => {
                        const info = MOEDAS_CRYPTO.find(m => m.value === c);
                        return (
                          <SelectItem key={c} value={c}>
                            {info?.label || c}
                          </SelectItem>
                        );
                      })}
                      {/* Allow any crypto, not just wallet's registered coins */}
                      {MOEDAS_CRYPTO.filter(m => m.value !== coinOrigem && !availableCoins.includes(m.value)).map(m => (
                        <SelectItem key={m.value} value={m.value}>
                          {m.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Quantidade recebida</Label>
                  <Input
                    type="number"
                    step="0.00000001"
                    value={qtdRecebida}
                    onChange={(e) => setQtdRecebida(e.target.value)}
                    placeholder="0.00"
                  />
                </div>
              </div>
              {coinDestino && qtdRecebidaNum > 0 && (
                <div className="flex items-center justify-between text-[11px] text-muted-foreground px-1">
                  <span>≈ ${usdRecebido.toFixed(2)} USD</span>
                  <span className={spreadUsd >= 0 ? "text-emerald-400" : "text-destructive"}>
                    Spread: {spreadPct >= 0 ? "+" : ""}{spreadPct.toFixed(2)}% ({spreadUsd >= 0 ? "+" : ""}${spreadUsd.toFixed(2)})
                  </span>
                </div>
              )}
            </div>
          )}

          {/* Resumo */}
          {canSubmit && (
            <div className="rounded-lg border border-blue-500/20 bg-blue-500/5 p-3 text-center space-y-1">
              <div className="text-sm font-medium">
                {qtdEnviadaNum} {coinOrigem} → {qtdRecebidaNum} {coinDestino}
              </div>
              <div className="text-[11px] text-muted-foreground">
                Taxa implícita: 1 {coinOrigem} = {(qtdRecebidaNum / qtdEnviadaNum).toFixed(6)} {coinDestino}
              </div>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={loading}>
            Cancelar
          </Button>
          <Button onClick={handleSwap} disabled={!canSubmit || loading}>
            {loading ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Registrando...
              </>
            ) : (
              <>
                <ArrowRightLeft className="h-4 w-4 mr-2" />
                Confirmar Swap
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
