import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { TrendingUp, Plus, Bitcoin, Copy, Check, ArrowRightLeft } from "lucide-react";
import { SwapCryptoDialog } from "./SwapCryptoDialog";
import { useToast } from "@/hooks/use-toast";
import { formatCurrencyValue } from "@/types/currency";
import { ExchangeSelect } from "@/components/parceiros/ExchangeSelect";
import { RedeSelect } from "@/components/parceiros/RedeSelect";
import { MoedaMultiSelect } from "@/components/parceiros/MoedaMultiSelect";

interface WalletInfo {
  wallet_id: string;
  label?: string | null;
  exchange: string | null;
  endereco: string;
  network: string;
  moedas: string[];
  coins: Array<{ coin: string; saldo_coin: number; saldo_usd: number }>;
  totalUsd: number;
}

interface ExposicaoCryptoCardProps {
  caixaParceiroId: string | null;
  cryptoPrices: Record<string, number>;
  getCryptoUSDValue: (coin: string, saldoCoin: number, saldoUsd: number) => number;
  formatCurrency: (value: number, currency: string) => string;
  onDataChanged: () => void;
}

export function ExposicaoCryptoCard({
  caixaParceiroId,
  cryptoPrices,
  getCryptoUSDValue,
  formatCurrency,
  onDataChanged,
}: ExposicaoCryptoCardProps) {
  const { toast } = useToast();
  const [wallets, setWallets] = useState<WalletInfo[]>([]);
  const [addWalletOpen, setAddWalletOpen] = useState(false);
  const [swapOpen, setSwapOpen] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const [novaWallet, setNovaWallet] = useState({
    label: "", exchange: "", endereco: "", rede_id: "", network: "TRC20", moeda: [] as string[], observacoes: "",
  });

  const fetchWallets = useCallback(async () => {
    if (!caixaParceiroId) return;
    const [walletsViewRes, walletsDetailRes] = await Promise.all([
      supabase.from("v_saldo_parceiro_wallets").select("*").eq("parceiro_id", caixaParceiroId),
      supabase.from("wallets_crypto").select("id, label, exchange, endereco, network, moeda").eq("parceiro_id", caixaParceiroId),
    ]);

    const detailMap = new Map((walletsDetailRes.data || []).map((d: any) => [d.id, d]));
    const grouped: Record<string, WalletInfo> = {};

    (walletsViewRes.data || []).forEach((w: any) => {
      const detail = detailMap.get(w.wallet_id);
      if (!grouped[w.wallet_id]) {
        grouped[w.wallet_id] = {
          wallet_id: w.wallet_id,
          label: detail?.label,
          exchange: detail?.exchange || w.exchange,
          endereco: detail?.endereco || w.endereco,
          network: detail?.network || "",
          moedas: Array.isArray(detail?.moeda) ? detail.moeda : [],
          coins: [],
          totalUsd: 0,
        };
      }
      if (w.coin) {
        grouped[w.wallet_id].coins.push({ coin: w.coin, saldo_coin: w.saldo_coin || 0, saldo_usd: w.saldo_usd || 0 });
        grouped[w.wallet_id].totalUsd += (w.saldo_usd || 0);
      }
    });

    (walletsDetailRes.data || []).forEach((d: any) => {
      if (!grouped[d.id]) {
        grouped[d.id] = {
          wallet_id: d.id, label: d.label, exchange: d.exchange, endereco: d.endereco,
          network: d.network || "", moedas: Array.isArray(d.moeda) ? d.moeda : [],
          coins: [], totalUsd: 0,
        };
      }
    });

    setWallets(Object.values(grouped));
  }, [caixaParceiroId]);

  useEffect(() => { fetchWallets(); }, [fetchWallets]);

  useEffect(() => {
    const handler = () => fetchWallets();
    window.addEventListener("lovable:caixa-data-changed", handler);
    return () => window.removeEventListener("lovable:caixa-data-changed", handler);
  }, [fetchWallets]);

  const copyToClipboard = async (text: string, id: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedId(id);
      setTimeout(() => setCopiedId(null), 2000);
    } catch { /* ignore */ }
  };

  const resetWalletForm = () => {
    setNovaWallet({ label: "", exchange: "", endereco: "", rede_id: "", network: "TRC20", moeda: [], observacoes: "" });
  };

  const handleAddWallet = async () => {
    if (!caixaParceiroId || !novaWallet.endereco) {
      toast({ title: "Preencha o endereço da wallet", variant: "destructive" });
      return;
    }
    try {
      let networkName = novaWallet.network;
      if (novaWallet.rede_id) {
        const { data: redeData } = await supabase
          .from("redes_crypto").select("nome").eq("id", novaWallet.rede_id).single();
        networkName = redeData?.nome || novaWallet.network;
      }
      const { error } = await supabase.from("wallets_crypto").insert({
        parceiro_id: caixaParceiroId,
        label: novaWallet.label || null,
        endereco: novaWallet.endereco,
        network: networkName,
        rede_id: novaWallet.rede_id || null,
        exchange: novaWallet.exchange || null,
        moeda: novaWallet.moeda.length > 0 ? novaWallet.moeda : null,
        observacoes_encrypted: novaWallet.observacoes || null,
      });
      if (error) throw error;
      toast({ title: "Wallet adicionada" });
      setAddWalletOpen(false);
      resetWalletForm();
      fetchWallets();
      onDataChanged();
    } catch (err: any) {
      toast({ title: "Erro ao adicionar wallet", description: err.message, variant: "destructive" });
    }
  };

  // Aggregate coins across all wallets
  const coinMap: Record<string, { saldo_coin: number; saldo_usd: number; wallets: WalletInfo[] }> = {};
  wallets.forEach(w => w.coins.forEach(c => {
    if (!coinMap[c.coin]) coinMap[c.coin] = { saldo_coin: 0, saldo_usd: 0, wallets: [] };
    coinMap[c.coin].saldo_coin += c.saldo_coin;
    coinMap[c.coin].saldo_usd += c.saldo_usd;
    if (!coinMap[c.coin].wallets.find(ww => ww.wallet_id === w.wallet_id)) {
      coinMap[c.coin].wallets.push(w);
    }
  }));

  const coinEntries = Object.entries(coinMap);
  const totalUSD = coinEntries.reduce((acc, [coin, v]) => acc + getCryptoUSDValue(coin, v.saldo_coin, v.saldo_usd), 0);

  return (
    <>
      <Card className="bg-card/50 backdrop-blur border-border/50">
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <div className="flex items-center gap-2">
            <CardTitle className="text-sm font-medium">Caixa Crypto (USD)</CardTitle>
            {wallets.length > 0 && (
              <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-4">
                {wallets.length}
              </Badge>
            )}
          </div>
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6 rounded-full hover:bg-blue-500/20"
              onClick={() => setSwapOpen(true)}
              title="Swap entre moedas"
            >
              <ArrowRightLeft className="h-3.5 w-3.5 text-muted-foreground hover:text-blue-400 transition-colors" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6 rounded-full hover:bg-blue-500/20"
              onClick={() => setAddWalletOpen(true)}
              title="Adicionar wallet"
            >
              <Plus className="h-3.5 w-3.5 text-muted-foreground hover:text-blue-400 transition-colors" />
            </Button>
            <TrendingUp className="h-4 w-4 text-blue-500" />
          </div>
        </CardHeader>
        <CardContent className="space-y-2">
          {/* Total */}
          <div className="flex items-center gap-2">
            <span className="text-2xl font-bold text-blue-400">
              {formatCurrency(totalUSD, "USD")}
            </span>
          </div>

          {/* Per-coin rows — clickable to see wallet details */}
          {coinEntries.length > 0 && (
            <div className="space-y-0.5">
              {coinEntries.map(([coin, { saldo_coin, saldo_usd, wallets: coinWallets }]) => {
                const price = cryptoPrices[coin];
                const usdValue = getCryptoUSDValue(coin, saldo_coin, saldo_usd);
                return (
                  <Popover key={coin}>
                    <PopoverTrigger asChild>
                      <button className="w-full flex items-center justify-between text-xs p-1.5 rounded-md hover:bg-muted/30 transition-colors cursor-pointer group">
                        <div className="flex items-center gap-1.5">
                          <span className="font-medium group-hover:text-foreground transition-colors">{coin}</span>
                          {price && (
                            <span className="text-[10px] text-blue-400/70">
                              ${price.toFixed(price < 1 ? 6 : 2)}
                            </span>
                          )}
                        </div>
                        <div className="text-right">
                          <span className="font-mono">{saldo_coin.toFixed(saldo_coin < 1 ? 8 : 2)}</span>
                          <span className="text-muted-foreground ml-1.5">≈ {formatCurrency(usdValue, "USD")}</span>
                        </div>
                      </button>
                    </PopoverTrigger>
                    <PopoverContent side="bottom" align="end" className="w-[420px] p-0">
                      <div className="px-5 py-4 border-b border-border">
                        <p className="text-base font-semibold">Wallets com {coin}</p>
                        <p className="text-sm text-muted-foreground">{coinWallets.length} wallet(s)</p>
                      </div>
                      <div className="p-4 space-y-4 max-h-80 overflow-y-auto">
                        {coinWallets.map((wallet, wIdx) => {
                          const walletCoin = wallet.coins.find(c => c.coin === coin);
                          return (
                            <div key={wallet.wallet_id} className="space-y-3">
                              {/* Header: exchange + saldo */}
                              <div className="flex items-start justify-between gap-3">
                                <div className="flex items-start gap-2.5 min-w-0">
                                  <Bitcoin className="h-5 w-5 text-muted-foreground shrink-0 mt-0.5" />
                                  <div className="min-w-0">
                                    <p className="text-sm font-semibold">
                                      {(wallet.label || wallet.exchange || "Wallet").replace(/-/g, " ").toUpperCase()}
                                    </p>
                                    {wallet.network && (
                                      <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-5 uppercase font-medium mt-1">
                                        {wallet.network}
                                      </Badge>
                                    )}
                                  </div>
                                </div>
                                <span className="text-base font-bold text-blue-400 font-mono shrink-0">
                                  {walletCoin ? walletCoin.saldo_coin.toFixed(walletCoin.saldo_coin < 1 ? 8 : 2) : "0"} {coin}
                                </span>
                              </div>

                              {/* Address as mini-card */}
                              <div
                                className="ml-7 flex items-center justify-between px-3 py-2 rounded-md bg-muted/30 border border-border/40 cursor-pointer hover:bg-muted/50 transition-colors group"
                                onClick={(e) => { e.stopPropagation(); copyToClipboard(wallet.endereco, `w-${wallet.wallet_id}-${coin}`); }}
                              >
                                <span className="text-sm font-mono text-muted-foreground group-hover:text-foreground transition-colors truncate">
                                  {wallet.endereco}
                                </span>
                                {copiedId === `w-${wallet.wallet_id}-${coin}`
                                  ? <Check className="h-3.5 w-3.5 text-primary shrink-0 ml-2" />
                                  : <Copy className="h-3.5 w-3.5 text-muted-foreground/50 group-hover:text-muted-foreground shrink-0 ml-2 transition-colors" />
                                }
                              </div>

                              {/* Divider */}
                              {wIdx < coinWallets.length - 1 && (
                                <div className="border-b border-border/30" />
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </PopoverContent>
                  </Popover>
                );
              })}
            </div>
          )}

          {/* Empty state */}
          {wallets.length === 0 && coinEntries.length === 0 && (
            <div className="text-sm text-muted-foreground italic">Nenhuma exposição crypto</div>
          )}

          {wallets.length === 0 && caixaParceiroId && (
            <Button
              variant="ghost"
              size="sm"
              className="w-full text-xs text-muted-foreground gap-1.5 h-8"
              onClick={() => setAddWalletOpen(true)}
            >
              <Plus className="h-3 w-3" />
              Adicionar wallet
            </Button>
          )}
        </CardContent>
      </Card>

      {/* Dialog: Adicionar Wallet */}
      <Dialog open={addWalletOpen} onOpenChange={(open) => { setAddWalletOpen(open); if (!open) resetWalletForm(); }}>
        <DialogContent className="sm:max-w-lg bg-background">
          <DialogHeader>
            <DialogTitle>Adicionar Wallet</DialogTitle>
            <DialogDescription>Cadastre uma carteira cripto da empresa.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <MoedaMultiSelect moedas={novaWallet.moeda} onChange={(moedas) => setNovaWallet({ ...novaWallet, moeda: moedas })} />
            <div className="space-y-1.5">
              <Label className="text-xs">Apelido da Wallet <span className="text-muted-foreground/60">(opc.)</span></Label>
              <Input value={novaWallet.label} onChange={(e) => setNovaWallet({ ...novaWallet, label: e.target.value })} placeholder="Ex: Carteira Binance VIP" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Exchange/Wallet <span className="text-muted-foreground/60">(opc.)</span></Label>
              <ExchangeSelect value={novaWallet.exchange} onValueChange={(value) => setNovaWallet({ ...novaWallet, exchange: value })} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Network *</Label>
              <RedeSelect value={novaWallet.rede_id} onValueChange={(value) => setNovaWallet({ ...novaWallet, rede_id: value })} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Endereço *</Label>
              <Input value={novaWallet.endereco} onChange={(e) => setNovaWallet({ ...novaWallet, endereco: e.target.value })} placeholder="Endereço da wallet" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Observações <span className="text-muted-foreground/60">(opc.)</span></Label>
              <Textarea value={novaWallet.observacoes} onChange={(e) => setNovaWallet({ ...novaWallet, observacoes: e.target.value })} rows={2} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddWalletOpen(false)}>Cancelar</Button>
            <Button onClick={handleAddWallet}>Adicionar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Swap Dialog */}
      <SwapCryptoDialog
        open={swapOpen}
        onClose={() => setSwapOpen(false)}
        onSuccess={() => { fetchWallets(); onDataChanged(); }}
        caixaParceiroId={caixaParceiroId}
      />
    </>
  );
}
