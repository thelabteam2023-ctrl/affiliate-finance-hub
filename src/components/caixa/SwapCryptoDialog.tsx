import { useState, useEffect, useCallback, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useWorkspace } from "@/hooks/useWorkspace";
import { useCotacoes } from "@/hooks/useCotacoes";
import { useToast } from "@/hooks/use-toast";
import { useInvalidateCaixaData, dispatchCaixaDataChanged } from "@/hooks/useInvalidateCaixaData";
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
import { ArrowRightLeft, Loader2, ArrowDown, AlertTriangle, Plus } from "lucide-react";
import { RedeSelect } from "@/components/parceiros/RedeSelect";

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
  rede_id: string | null;
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
  const invalidateCaixa = useInvalidateCaixaData();

  const [loading, setLoading] = useState(false);
  const [wallets, setWallets] = useState<WalletOption[]>([]);
  const [balances, setBalances] = useState<CoinBalance[]>([]);
  const [parceiroNome, setParceiroNome] = useState<string>("");

  // Form state - Origem
  const [walletOrigemId, setWalletOrigemId] = useState("");
  const [coinOrigem, setCoinOrigem] = useState("");
  const [qtdEnviada, setQtdEnviada] = useState("");

  // Form state - Destino
  const [destinoMode, setDestinoMode] = useState<"same" | "other">("same");
  const [walletDestinoId, setWalletDestinoId] = useState("");
  const [coinDestino, setCoinDestino] = useState("");
  const [qtdRecebida, setQtdRecebida] = useState("");
  
  // Auto-create destination wallet fields
  const [novaRedeId, setNovaRedeId] = useState("");
  const [novaRedeName, setNovaRedeName] = useState("");

  // Derived
  const selectedOrigemWallet = wallets.find(w => w.id === walletOrigemId);
  const availableCoinsOrigem = selectedOrigemWallet?.moedas || [];
  const saldoOrigem = balances.find(b => b.wallet_id === walletOrigemId && b.coin === coinOrigem);

  // Wallets available for destination (exclude origin wallet)
  const destinoWallets = useMemo(() => 
    wallets.filter(w => w.id !== walletOrigemId), 
    [wallets, walletOrigemId]
  );

  const selectedDestinoWallet = wallets.find(w => w.id === walletDestinoId);

  const fetchWalletsAndBalances = useCallback(async () => {
    if (!caixaParceiroId) return;
    const [walletsRes, balancesRes, parceiroRes] = await Promise.all([
      supabase.from("wallets_crypto").select("id, exchange, endereco, parceiro_id, moeda, network, rede_id").eq("parceiro_id", caixaParceiroId),
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
      rede_id: w.rede_id,
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
    setWalletOrigemId("");
    setCoinOrigem("");
    setCoinDestino("");
    setQtdEnviada("");
    setQtdRecebida("");
    setDestinoMode("same");
    setWalletDestinoId("");
    setNovaRedeId("");
    setNovaRedeName("");
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

  // Determine effective destination wallet
  const effectiveDestinoWalletId = destinoMode === "same" ? walletOrigemId : walletDestinoId;
  const needsNewWallet = destinoMode === "other" && walletDestinoId === "__new__";

  const canSubmit = walletOrigemId && coinOrigem && coinDestino
    && qtdEnviadaNum > 0 && qtdRecebidaNum > 0
    && (saldoOrigem ? qtdEnviadaNum <= saldoOrigem.saldo_coin : true)
    && (destinoMode === "same" || walletDestinoId)
    && (!needsNewWallet || novaRedeId);

  const handleSwap = async () => {
    if (!canSubmit || !workspaceId || !caixaParceiroId) return;
    setLoading(true);

    try {
      const { data: userData } = await supabase.auth.getUser();
      if (!userData?.user) throw new Error("Usuário não autenticado");

      const now = new Date().toISOString();
      const dataTransacao = now.split("T")[0];

      // Resolve destination wallet ID
      let finalDestinoWalletId = effectiveDestinoWalletId;

      if (needsNewWallet) {
        // Auto-create destination wallet
        // Get rede name
        let networkName = novaRedeName;
        if (!networkName && novaRedeId) {
          const { data: redeData } = await supabase
            .from("redes_crypto")
            .select("nome")
            .eq("id", novaRedeId)
            .single();
          networkName = redeData?.nome || "";
        }

        // Use same exchange/address from origin wallet
        const origemWallet = selectedOrigemWallet;
        if (!origemWallet) throw new Error("Wallet de origem não encontrada");

        const { data: newWallet, error: walletError } = await supabase
          .from("wallets_crypto")
          .insert({
            parceiro_id: caixaParceiroId,
            exchange: origemWallet.exchange,
            endereco: origemWallet.endereco,
            network: networkName,
            rede_id: novaRedeId,
            moeda: [coinDestino],
            workspace_id: workspaceId,
            user_id: userData.user.id,
          })
          .select("id")
          .single();

        if (walletError) throw walletError;
        finalDestinoWalletId = newWallet.id;

        toast({
          title: "Wallet criada",
          description: `Nova wallet ${networkName} criada automaticamente para receber ${coinDestino}.`,
        });
      } else if (destinoMode === "other" && selectedDestinoWallet) {
        // Ensure the destination wallet has the coin in its moeda array
        const destWallet = selectedDestinoWallet;
        if (!destWallet.moedas.includes(coinDestino)) {
          const updatedMoedas = [...destWallet.moedas, coinDestino];
          await supabase
            .from("wallets_crypto")
            .update({ moeda: updatedMoedas })
            .eq("id", destWallet.id);
        }
      } else if (destinoMode === "same" && selectedOrigemWallet) {
        // Ensure origin wallet has the destination coin
        if (!selectedOrigemWallet.moedas.includes(coinDestino)) {
          const updatedMoedas = [...selectedOrigemWallet.moedas, coinDestino];
          await supabase
            .from("wallets_crypto")
            .update({ moeda: updatedMoedas })
            .eq("id", selectedOrigemWallet.id);
        }
      }

      // SWAP_OUT: Débito da moeda origem
      // REGRA: valor USD = preço da moeda ENVIADA × quantidade enviada
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
        origem_wallet_id: walletOrigemId,
        origem_tipo: "PARCEIRO_WALLET",
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

      // SWAP_IN: Crédito da moeda destino (na wallet de destino)
      // REGRA CRÍTICA: valor USD deve ser IGUAL ao SWAP_OUT (swap é zero-sum para capital)
      // O campo qtd_coin registra a quantidade real de coins recebida,
      // mas o valor econômico (USD) não muda — é a mesma quantia convertida.
      const swapInData: any = {
        user_id: userData.user.id,
        workspace_id: workspaceId,
        tipo_transacao: "SWAP_IN",
        tipo_moeda: "CRYPTO",
        moeda: "USD",
        valor: usdEnviado, // IGUAL ao SWAP_OUT — swap não cria nem destrói valor
        coin: coinDestino,
        qtd_coin: qtdRecebidaNum,
        valor_usd: usdEnviado, // IGUAL ao SWAP_OUT
        valor_usd_referencia: usdEnviado, // IGUAL ao SWAP_OUT
        cotacao: precoDestino,
        cotacao_destino_usd: precoDestino,
        cotacao_snapshot_at: now,
        data_transacao: dataTransacao,
        status: "CONFIRMADO",
        transit_status: "CONFIRMED",
        impacta_caixa_operacional: true,
        descricao: `Swap ${coinOrigem} → ${coinDestino}`,
        destino_wallet_id: finalDestinoWalletId,
        destino_tipo: "PARCEIRO_WALLET",
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

      await invalidateCaixa({ only: ["saldosCrypto", "saldoWalletsParceiros"] });
      dispatchCaixaDataChanged();
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

  const formatExchangeName = (w: WalletOption) => {
    return (w.exchange || w.network || "Wallet")
      .split(/[-\s]/)
      .map(s => s.charAt(0).toUpperCase() + s.slice(1))
      .join(' ')
      .toUpperCase();
  };

  const truncAddr = (addr: string) => `${addr.slice(0, 6)}...${addr.slice(-4)}`;

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="sm:max-w-lg bg-background max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ArrowRightLeft className="h-5 w-5 text-primary" />
            Swap Crypto
          </DialogTitle>
          <DialogDescription>
            Troque entre moedas e redes. Informe o valor enviado e o valor recebido.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* ═══ ORIGEM ═══ */}
          <div className="space-y-1.5">
            <Label className="text-xs font-semibold uppercase tracking-wider">Wallet de Origem</Label>
            {parceiroNome && (
              <p className="text-[11px] text-primary uppercase tracking-wider">
                {parceiroNome}
              </p>
            )}
            <div className="space-y-2 max-h-[180px] overflow-y-auto">
              {wallets.map(w => {
                const walletBalances = balances.filter(b => b.wallet_id === w.id);
                const isSelected = walletOrigemId === w.id;

                return (
                  <button
                    key={w.id}
                    type="button"
                    onClick={() => {
                      setWalletOrigemId(w.id);
                      setCoinOrigem("");
                      setCoinDestino("");
                      setWalletDestinoId("");
                    }}
                    className={`w-full text-left rounded-lg border p-3 transition-colors ${
                      isSelected 
                        ? "border-primary bg-primary/10" 
                        : "border-border/50 bg-muted/20 hover:border-border hover:bg-muted/40"
                    }`}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span className="font-semibold text-sm text-foreground">{formatExchangeName(w)}</span>
                      <div className="flex gap-1">
                        {w.moedas.map(coin => (
                          <Badge key={coin} variant="outline" className="text-[10px] px-1.5 py-0 h-5">
                            {coin}
                          </Badge>
                        ))}
                      </div>
                    </div>
                    <p className="text-xs font-mono text-muted-foreground">
                      {truncAddr(w.endereco)}
                      {w.network && <span className="ml-2 text-[10px] uppercase text-muted-foreground/70">({w.network})</span>}
                    </p>
                    {walletBalances.length > 0 && (
                      <div className="flex flex-col gap-0.5 mt-1.5">
                        {walletBalances.map(b => (
                          <span key={b.coin} className="text-[11px] text-foreground">
                            {b.coin} {b.saldo_coin.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                            <span className="text-muted-foreground ml-1">
                              ≈ R$ {(b.saldo_usd * (cotacaoUSD || 1)).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                            </span>
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

          {/* ═══ ENVIO ═══ */}
          {walletOrigemId && (
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
                      {availableCoinsOrigem.map(c => {
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
                <ArrowDown className="h-4 w-4 text-primary" />
              </div>
            </div>
          )}

          {/* ═══ DESTINO ═══ */}
          {coinOrigem && (
            <div className="space-y-3 rounded-lg border border-border/50 p-3 bg-muted/20">
              <div className="flex items-center gap-2">
                <Badge variant="outline" className="text-[10px] uppercase text-emerald-500 border-emerald-500/30">Recebido</Badge>
                <span className="text-xs text-muted-foreground">O que você recebeu</span>
              </div>

              {/* Destino: mesma wallet ou outra */}
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant={destinoMode === "same" ? "default" : "outline"}
                  size="sm"
                  className="text-xs h-7"
                  onClick={() => { setDestinoMode("same"); setWalletDestinoId(""); }}
                >
                  Mesma wallet
                </Button>
                <Button
                  type="button"
                  variant={destinoMode === "other" ? "default" : "outline"}
                  size="sm"
                  className="text-xs h-7"
                  onClick={() => setDestinoMode("other")}
                >
                  Outra wallet/rede
                </Button>
              </div>

              {/* Select destination wallet */}
              {destinoMode === "other" && (
                <div className="space-y-2">
                  <Label className="text-xs">Wallet de destino</Label>
                  <Select value={walletDestinoId} onValueChange={setWalletDestinoId}>
                    <SelectTrigger>
                      <SelectValue placeholder="Selecione a wallet de destino" />
                    </SelectTrigger>
                    <SelectContent>
                      {destinoWallets.map(w => (
                        <SelectItem key={w.id} value={w.id}>
                          <div className="flex items-center gap-2">
                            <span className="font-medium">{formatExchangeName(w)}</span>
                            <span className="text-muted-foreground text-xs font-mono">{truncAddr(w.endereco)}</span>
                            {w.network && (
                              <Badge variant="outline" className="text-[9px] px-1 py-0 h-4 uppercase">
                                {w.network}
                              </Badge>
                            )}
                          </div>
                        </SelectItem>
                      ))}
                      <SelectItem value="__new__">
                        <div className="flex items-center gap-2 text-primary">
                          <Plus className="h-3 w-3" />
                          <span>Criar nova wallet (outra rede)</span>
                        </div>
                      </SelectItem>
                    </SelectContent>
                  </Select>

                  {/* New wallet: select network */}
                  {needsNewWallet && (
                    <div className="space-y-2 p-2 rounded-md border border-dashed border-primary/30 bg-primary/5">
                      <div className="flex items-center gap-2">
                        <AlertTriangle className="h-3.5 w-3.5 text-primary" />
                        <span className="text-xs text-foreground">
                          Nova wallet será criada com o mesmo endereço da origem
                        </span>
                      </div>
                      <div className="space-y-1.5">
                        <Label className="text-xs">Rede de destino *</Label>
                        <RedeSelect
                          value={novaRedeId}
                          onValueChange={(v) => {
                            setNovaRedeId(v);
                          }}
                        />
                      </div>
                    </div>
                  )}
                </div>
              )}

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-xs">Moeda</Label>
                  <Select value={coinDestino} onValueChange={setCoinDestino}>
                    <SelectTrigger>
                      <SelectValue placeholder="Moeda" />
                    </SelectTrigger>
                    <SelectContent>
                      {/* All crypto options except origin coin */}
                      {MOEDAS_CRYPTO.filter(m => m.value !== coinOrigem).map(m => (
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
                  <span className={spreadUsd >= 0 ? "text-emerald-500" : "text-destructive"}>
                    Spread: {spreadPct >= 0 ? "+" : ""}{spreadPct.toFixed(2)}% ({spreadUsd >= 0 ? "+" : ""}${spreadUsd.toFixed(2)})
                  </span>
                </div>
              )}
            </div>
          )}

          {/* ═══ RESUMO ═══ */}
          {canSubmit && (
            <div className="rounded-lg border border-primary/20 bg-primary/5 p-3 text-center space-y-1">
              <div className="text-sm font-medium">
                {qtdEnviadaNum} {coinOrigem} → {qtdRecebidaNum} {coinDestino}
              </div>
              <div className="text-[11px] text-muted-foreground">
                Taxa implícita: 1 {coinOrigem} = {(qtdRecebidaNum / qtdEnviadaNum).toFixed(6)} {coinDestino}
              </div>
              {destinoMode === "other" && (
                <div className="text-[11px] text-muted-foreground">
                  {needsNewWallet
                    ? `↗ Nova wallet será criada na rede selecionada`
                    : `↗ Destino: ${selectedDestinoWallet ? formatExchangeName(selectedDestinoWallet) : ""} (${selectedDestinoWallet?.network || ""})`
                  }
                </div>
              )}
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
