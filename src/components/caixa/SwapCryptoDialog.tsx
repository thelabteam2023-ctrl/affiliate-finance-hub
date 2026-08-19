import { useState, useEffect, useCallback, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useWorkspace } from "@/hooks/useWorkspace";
import { useCotacoes } from "@/hooks/useCotacoes";
import { useToast } from "@/hooks/use-toast";
import { useInvalidateCaixaData, dispatchCaixaDataChanged } from "@/hooks/useInvalidateCaixaData";
import { useCaixaFormSync } from "@/hooks/useCaixaFormSync";
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
 import { ArrowRightLeft, Loader2, ArrowDown, AlertTriangle, Plus, Wallet } from "lucide-react";
 import { WalletCryptoSelect } from "@/components/wallets/WalletCryptoSelect";
import { RedeSelect } from "@/components/parceiros/RedeSelect";
import { Checkbox } from "@/components/ui/checkbox";

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
  label: string | null;
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
  const [step, setStep] = useState<"form" | "review">("form");
  const [confirmChecked, setConfirmChecked] = useState(false);

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
      supabase.from("wallets_crypto").select("id, label, exchange, endereco, parceiro_id, moeda, network, rede_id").eq("parceiro_id", caixaParceiroId),
      supabase.from("v_saldo_parceiro_wallets").select("wallet_id, coin, saldo_coin, saldo_usd").eq("parceiro_id", caixaParceiroId),
      supabase.from("parceiros").select("nome").eq("id", caixaParceiroId).single(),
    ]);
    setParceiroNome(parceiroRes.data?.nome || "");
    setWallets((walletsRes.data || []).map((w: any) => ({
      id: w.id,
      label: w.label,
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

  // Mantém wallets/saldos sincronizados com qualquer mutação do Caixa enquanto aberto
  useCaixaFormSync({ open, refresh: fetchWalletsAndBalances });

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
    setStep("form");
    setConfirmChecked(false);
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

  // Carteira efetiva de destino para a tela de revisão
  const destinoWalletReview = needsNewWallet
    ? selectedOrigemWallet
    : destinoMode === "same"
      ? selectedOrigemWallet
      : selectedDestinoWallet;

  const isMesmaCarteira =
    destinoMode === "same" ||
    needsNewWallet ||
    (!!selectedDestinoWallet &&
      !!selectedOrigemWallet &&
      selectedDestinoWallet.endereco === selectedOrigemWallet.endereco);

  const canSubmit = walletOrigemId && coinOrigem && coinDestino
    && qtdEnviadaNum > 0 && qtdRecebidaNum > 0
    && (saldoOrigem ? qtdEnviadaNum <= saldoOrigem.saldo_coin : true)
    && (destinoMode === "same" || walletDestinoId)
    && (!needsNewWallet || novaRedeId);

  const handleSwap = async () => {
    if (!canSubmit) return;
    if (!workspaceId || !caixaParceiroId) {
      toast({
        title: "Contexto indisponível",
        description: !workspaceId
          ? "Workspace não identificado nesta aba. Recarregue a página e tente novamente."
          : "Parceiro do caixa não identificado. Selecione o parceiro antes de registrar o swap.",
        variant: "destructive",
      });
      return;
    }
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

      // Registro ATÔMICO das duas pernas (SWAP_OUT + SWAP_IN) via RPC.
      // As pernas nascem juntas, compartilham swap_operation_id e são revertidas em par.
      const { data: swapResult, error: swapError } = await supabase.rpc(
        "fn_registrar_swap_crypto" as any,
        {
          p_workspace_id: workspaceId,
          p_parceiro_id: caixaParceiroId,
          p_wallet_origem_id: walletOrigemId,
          p_coin_origem: coinOrigem,
          p_qtd_origem: qtdEnviadaNum,
          p_wallet_destino_id: finalDestinoWalletId,
          p_coin_destino: coinDestino,
          p_qtd_destino: qtdRecebidaNum,
          p_preco_origem: precoOrigem,
          p_preco_destino: precoDestino,
          p_metadata: {
            origem_wallet_endereco: selectedOrigemWallet?.endereco || null,
            destino_wallet_endereco:
              (destinoMode === "same" ? selectedOrigemWallet?.endereco : selectedDestinoWallet?.endereco) || null,
            proprietario: parceiroNome || null,
            destino_mode: destinoMode,
            wallet_criada: needsNewWallet,
            registrado_em: now,
          },
        }
      );

      if (swapError) throw swapError;
      const rpcResult = swapResult as unknown as { success: boolean; message?: string };
      if (!rpcResult?.success) throw new Error(rpcResult?.message || "Falha ao registrar swap");

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
    return (w.label || w.exchange || w.network || "Wallet")
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

        <div className={`space-y-4 ${step === "review" ? "hidden" : ""}`}>
          {/* ═══ ORIGEM ═══ */}
           <div className="space-y-1.5">
             <Label className="text-xs font-semibold uppercase tracking-wider">Wallet de Origem</Label>
             <WalletCryptoSelect
               wallets={wallets.map(w => ({
                 ...w,
                 endereco: w.endereco || "",
                 moeda: w.moedas,
               }))}
               value={walletOrigemId}
               onValueChange={(v) => {
                 setWalletOrigemId(v);
                 setCoinOrigem("");
                 setCoinDestino("");
                 setWalletDestinoId("");
               }}
               placeholder="Selecione a wallet de origem"
             />
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

              {/* Destino: mesmo endereço ou outro */}
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant={destinoMode === "same" ? "default" : "outline"}
                  size="sm"
                  className="text-xs h-7"
                  onClick={() => { setDestinoMode("same"); setWalletDestinoId(""); }}
                >
                  Mesmo endereço
                </Button>
                <Button
                  type="button"
                  variant={destinoMode === "other" ? "default" : "outline"}
                  size="sm"
                  className="text-xs h-7"
                  onClick={() => setDestinoMode("other")}
                >
                  Outro endereço/rede
                </Button>
              </div>

              {/* Select destination wallet */}
              {destinoMode === "other" && (
                <div className="space-y-2">
                  <Label className="text-xs">Wallet de destino</Label>
                   <WalletCryptoSelect
                     wallets={destinoWallets.map(w => ({
                       ...w,
                       endereco: w.endereco || "",
                       moeda: w.moedas
                     }))}
                     value={walletDestinoId === "__new__" ? "" : walletDestinoId}
                     onValueChange={setWalletDestinoId}
                     placeholder="Selecione a wallet de destino"
                   />
                   <Select value={walletDestinoId === "__new__" ? "__new__" : ""} onValueChange={(v) => v === "__new__" && setWalletDestinoId("__new__")}>
                     <SelectTrigger className="mt-2 h-8 text-xs border-dashed">
                       <SelectValue placeholder="Ou criar nova..." />
                     </SelectTrigger>
                     <SelectContent>
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

        {/* ═══ REVISÃO E CONFIRMAÇÃO ═══ */}
        {step === "review" && (
          <div className="space-y-4">
            <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Revise seu swap
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-lg border border-border/50 bg-muted/20 p-3 space-y-1">
                <Badge variant="outline" className="text-[10px] uppercase">Origem</Badge>
                <div className="text-xs font-medium">{parceiroNome || "—"}</div>
                <div className="text-[11px] text-muted-foreground">
                  {selectedOrigemWallet ? formatExchangeName(selectedOrigemWallet) : "—"}
                </div>
                <div className="text-[11px] font-mono text-muted-foreground">
                  {selectedOrigemWallet?.endereco ? truncAddr(selectedOrigemWallet.endereco) : "—"}
                </div>
                <div className="pt-1 text-[10px] uppercase tracking-wide text-muted-foreground">
                  Valor debitado
                </div>
                <div className="text-sm font-semibold text-destructive">
                  − {qtdEnviadaNum} {coinOrigem}
                </div>
                <div className="text-[11px] text-muted-foreground">≈ US$ {usdEnviado.toFixed(2)}</div>
              </div>

              <div className="rounded-lg border border-border/50 bg-muted/20 p-3 space-y-1">
                <Badge variant="outline" className="text-[10px] uppercase text-emerald-500 border-emerald-500/30">
                  Destino
                </Badge>
                <div className="text-xs font-medium">{parceiroNome || "—"}</div>
                <div className="text-[11px] text-muted-foreground">
                  {needsNewWallet
                    ? `Nova wallet (${novaRedeName || "rede selecionada"})`
                    : destinoWalletReview
                      ? formatExchangeName(destinoWalletReview)
                      : "—"}
                </div>
                <div className="text-[11px] font-mono text-muted-foreground">
                  {destinoWalletReview?.endereco ? truncAddr(destinoWalletReview.endereco) : "—"}
                </div>
                <div className="pt-1 text-[10px] uppercase tracking-wide text-muted-foreground">
                  Valor creditado
                </div>
                <div className="text-sm font-semibold text-emerald-500">
                  + {qtdRecebidaNum} {coinDestino}
                </div>
                <div className="text-[11px] text-muted-foreground">≈ US$ {usdRecebido.toFixed(2)}</div>
              </div>
            </div>

            <div className="rounded-md border border-border/50 bg-muted/10 p-2.5 text-[11px] space-y-1">
              <div className="font-semibold uppercase tracking-wide text-muted-foreground">
                Detalhes da conversão
              </div>
              <div className="flex justify-between text-muted-foreground">
                <span>Cotação {coinOrigem}</span>
                <span className="font-mono">US$ {precoOrigem.toLocaleString("pt-BR", { maximumFractionDigits: 2 })}</span>
              </div>
              <div className="flex justify-between text-muted-foreground">
                <span>Cotação {coinDestino}</span>
                <span className="font-mono">US$ {precoDestino.toLocaleString("pt-BR", { maximumFractionDigits: 6 })}</span>
              </div>
              <div className="flex justify-between text-muted-foreground">
                <span>Taxa implícita</span>
                <span className="font-mono">
                  1 {coinOrigem} = {(qtdRecebidaNum / qtdEnviadaNum).toFixed(6)} {coinDestino}
                </span>
              </div>
              <div className="flex justify-between text-muted-foreground">
                <span>Valor econômico enviado</span>
                <span className="font-mono">US$ {usdEnviado.toFixed(2)}</span>
              </div>
              <div className="flex justify-between text-muted-foreground">
                <span>Valor econômico recebido</span>
                <span className="font-mono">US$ {usdRecebido.toFixed(2)}</span>
              </div>
              <div className={`flex justify-between font-medium ${spreadUsd < 0 ? "text-amber-600" : "text-emerald-600"}`}>
                <span>Spread / custo da conversão</span>
                <span className="font-mono">
                  {spreadUsd >= 0 ? "+" : "−"} US$ {Math.abs(spreadUsd).toFixed(2)} ({spreadPct.toFixed(2)}%)
                </span>
              </div>
              <div className="pt-1 text-[10px] text-muted-foreground">
                O sistema não cobra taxa própria: a diferença acima é o spread entre o valor enviado e o recebido.
              </div>
            </div>

            {spreadPct < -2 && (
              <div className="flex items-start gap-2 rounded-md border border-amber-500/40 bg-amber-500/10 p-2.5 text-[11px]">
                <AlertTriangle className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 text-amber-600" />
                <span>
                  Esta conversão reduz o valor econômico em US$ {Math.abs(spreadUsd).toFixed(2)} ({spreadPct.toFixed(2)}%).
                  Confirme se os valores estão corretos.
                </span>
              </div>
            )}

            {/* Banner por cenário */}
            {isMesmaCarteira ? (
              <div className="flex items-start gap-2 rounded-md border border-primary/30 bg-primary/5 p-2.5 text-[11px]">
                <Wallet className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 text-primary" />
                <span>
                  <strong>Mesma carteira:</strong> a conversão ocorrerá dentro da própria carteira, sem
                  transferência externa.
                </span>
              </div>
            ) : (
              <div className="flex items-start gap-2 rounded-md border border-amber-500/40 bg-amber-500/10 p-2.5 text-[11px]">
                <AlertTriangle className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 text-amber-600" />
                <span>
                  <strong>Carteira de destino diferente da origem.</strong> Confirme o endereço acima antes de
                  prosseguir — a operação só pode ser desfeita por reversão auditada.
                </span>
              </div>
            )}

            {needsNewWallet && (
              <div className="flex items-start gap-2 rounded-md border border-dashed border-primary/40 bg-primary/5 p-2.5 text-[11px]">
                <Plus className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 text-primary" />
                <span>
                  Será criada uma nova wallet {novaRedeName ? `na rede ${novaRedeName}` : "na rede selecionada"} para
                  receber {coinDestino}, com o mesmo endereço da origem.
                </span>
              </div>
            )}

            <label className="flex items-start gap-2 cursor-pointer text-xs">
              <Checkbox
                checked={confirmChecked}
                onCheckedChange={(v) => setConfirmChecked(v === true)}
                className="mt-0.5"
              />
              <span>Confirmei que a carteira de destino e os valores estão corretos.</span>
            </label>
          </div>
        )}

        <DialogFooter>
          {step === "form" ? (
            <>
              <Button variant="outline" onClick={onClose} disabled={loading}>
                Cancelar
              </Button>
              <Button onClick={() => { setConfirmChecked(false); setStep("review"); }} disabled={!canSubmit || loading}>
                <ArrowRightLeft className="h-4 w-4 mr-2" />
                Revisar Swap
              </Button>
            </>
          ) : (
            <>
              <Button variant="outline" onClick={() => setStep("form")} disabled={loading}>
                Voltar
              </Button>
              <Button onClick={handleSwap} disabled={!canSubmit || !confirmChecked || loading}>
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
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
