import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { TrendingUp, Plus, Bitcoin, Copy, Check } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { formatCurrencyValue } from "@/types/currency";
import { ExchangeSelect } from "@/components/parceiros/ExchangeSelect";
import { RedeSelect } from "@/components/parceiros/RedeSelect";
import { MoedaMultiSelect } from "@/components/parceiros/MoedaMultiSelect";

interface SaldoCrypto {
  coin: string;
  saldo_coin: number;
  saldo_usd: number;
}

interface WalletInfo {
  wallet_id: string;
  exchange: string | null;
  endereco: string;
  network: string;
  moedas: string[];
  coins: Array<{ coin: string; saldo_coin: number; saldo_usd: number }>;
  totalUsd: number;
}

interface ExposicaoCryptoCardProps {
  caixaParceiroId: string | null;
  saldosCrypto: SaldoCrypto[];
  totalCryptoUSD: number;
  cryptoPrices: Record<string, number>;
  getCryptoUSDValue: (coin: string, saldoCoin: number, saldoUsd: number) => number;
  formatCurrency: (value: number, currency: string) => string;
  onDataChanged: () => void;
}

export function ExposicaoCryptoCard({
  caixaParceiroId,
  saldosCrypto,
  totalCryptoUSD,
  cryptoPrices,
  getCryptoUSDValue,
  formatCurrency,
  onDataChanged,
}: ExposicaoCryptoCardProps) {
  const { toast } = useToast();
  const [wallets, setWallets] = useState<WalletInfo[]>([]);
  const [addWalletOpen, setAddWalletOpen] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const [novaWallet, setNovaWallet] = useState({
    exchange: "",
    endereco: "",
    rede_id: "",
    network: "TRC20",
    moeda: [] as string[],
    observacoes: "",
  });

  const fetchWallets = useCallback(async () => {
    if (!caixaParceiroId) return;
    const [walletsViewRes, walletsDetailRes] = await Promise.all([
      supabase.from("v_saldo_parceiro_wallets").select("*").eq("parceiro_id", caixaParceiroId),
      supabase.from("wallets_crypto").select("id, exchange, endereco, network, moeda").eq("parceiro_id", caixaParceiroId),
    ]);

    const detailMap = new Map((walletsDetailRes.data || []).map((d: any) => [d.id, d]));

    // Group by wallet_id
    const grouped: Record<string, WalletInfo> = {};
    (walletsViewRes.data || []).forEach((w: any) => {
      const detail = detailMap.get(w.wallet_id);
      if (!grouped[w.wallet_id]) {
        grouped[w.wallet_id] = {
          wallet_id: w.wallet_id,
          exchange: detail?.exchange || w.exchange,
          endereco: detail?.endereco || w.endereco,
          network: detail?.network || "",
          moedas: Array.isArray(detail?.moeda) ? detail.moeda : [],
          coins: [],
          totalUsd: 0,
        };
      }
      if (w.coin) {
        grouped[w.wallet_id].coins.push({
          coin: w.coin,
          saldo_coin: w.saldo_coin || 0,
          saldo_usd: w.saldo_usd || 0,
        });
        grouped[w.wallet_id].totalUsd += (w.saldo_usd || 0);
      }
    });

    // Also add wallets with no balance entries
    (walletsDetailRes.data || []).forEach((d: any) => {
      if (!grouped[d.id]) {
        grouped[d.id] = {
          wallet_id: d.id,
          exchange: d.exchange,
          endereco: d.endereco,
          network: d.network || "",
          moedas: Array.isArray(d.moeda) ? d.moeda : [],
          coins: [],
          totalUsd: 0,
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
    setNovaWallet({ exchange: "", endereco: "", rede_id: "", network: "TRC20", moeda: [], observacoes: "" });
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

  return (
    <>
      <Card className="bg-card/50 backdrop-blur border-border/50">
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <div className="flex items-center gap-2">
            <CardTitle className="text-sm font-medium">Exposição Crypto (USD)</CardTitle>
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
              onClick={() => setAddWalletOpen(true)}
              title="Adicionar wallet"
            >
              <Plus className="h-3.5 w-3.5 text-muted-foreground hover:text-blue-400 transition-colors" />
            </Button>
            <TrendingUp className="h-4 w-4 text-blue-500" />
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          {/* Total */}
          <div className="flex items-center gap-2">
            <span className="text-2xl font-bold text-blue-400">
              {formatCurrency(totalCryptoUSD, "USD")}
            </span>
          </div>

          {/* Breakdown por coin */}
          {saldosCrypto.length > 0 && (
            <div className="space-y-1">
              {saldosCrypto.map((saldo) => {
                const price = cryptoPrices[saldo.coin];
                const usdValue = getCryptoUSDValue(saldo.coin, saldo.saldo_coin, saldo.saldo_usd);
                return (
                  <div key={saldo.coin} className="flex items-center justify-between text-xs">
                    <div className="flex items-center gap-1.5">
                      <span className="font-medium">{saldo.coin}</span>
                      {price && (
                        <span className="text-[10px] text-blue-400/70">
                          ${price.toFixed(price < 1 ? 6 : 2)}
                        </span>
                      )}
                    </div>
                    <div className="text-right">
                      <span className="font-mono">{saldo.saldo_coin.toFixed(saldo.saldo_coin < 1 ? 8 : 2)}</span>
                      <span className="text-muted-foreground ml-1.5">≈ {formatCurrency(usdValue, "USD")}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Wallets list */}
          {wallets.length > 0 && (
            <div className="border-t border-border/30 pt-2 space-y-1.5">
              {wallets.map((wallet) => (
                <div
                  key={wallet.wallet_id}
                  className="flex items-center justify-between p-2 rounded-md bg-muted/20 hover:bg-muted/40 transition-colors"
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <Bitcoin className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                    <div className="min-w-0">
                      <p className="text-xs font-medium">
                        {wallet.exchange?.replace(/-/g, " ").toUpperCase() || "Wallet"}
                      </p>
                      <p
                        className="text-[10px] text-muted-foreground font-mono cursor-pointer hover:text-primary transition-colors flex items-center gap-0.5"
                        onClick={() => copyToClipboard(wallet.endereco, `w-${wallet.wallet_id}`)}
                      >
                        {wallet.endereco.slice(0, 8)}...{wallet.endereco.slice(-4)}
                        {copiedId === `w-${wallet.wallet_id}` ? <Check className="h-2.5 w-2.5 text-primary" /> : <Copy className="h-2.5 w-2.5 opacity-40" />}
                      </p>
                      <div className="flex items-center gap-1 mt-0.5">
                        {wallet.network && (
                          <Badge variant="outline" className="text-[9px] px-1 py-0 h-3.5 uppercase">
                            {wallet.network}
                          </Badge>
                        )}
                        {wallet.moedas.map((m) => (
                          <Badge key={m} className="text-[9px] px-1 py-0 h-3.5 bg-primary/20 text-primary border-primary/30">
                            {m}
                          </Badge>
                        ))}
                      </div>
                    </div>
                  </div>
                  <div className="text-right shrink-0 space-y-0.5">
                    {wallet.coins.map((c) => (
                      <p key={c.coin} className="text-xs font-semibold font-mono">
                        {c.saldo_coin.toFixed(2)} <span className="text-[10px] text-muted-foreground">{c.coin}</span>
                      </p>
                    ))}
                    {wallet.coins.length > 0 && (
                      <p className="text-[10px] text-muted-foreground">
                        ≈ {formatCurrencyValue(wallet.totalUsd, "USD" as any)}
                      </p>
                    )}
                    {wallet.coins.length === 0 && (
                      <p className="text-[10px] text-muted-foreground italic">Sem saldo</p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Empty state */}
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
    </>
  );
}
