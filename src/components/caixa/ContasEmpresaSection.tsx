import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Building2, Wallet, Plus, RefreshCw, Landmark, Bitcoin } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { formatCurrencyValue, getCurrencySymbol } from "@/types/currency";
import { FIAT_CURRENCIES } from "@/types/currency";
import { useExchangeRates } from "@/contexts/ExchangeRatesContext";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";

interface ContaBancaria {
  id: string;
  banco: string;
  agencia: string | null;
  conta: string | null;
  tipo_conta: string;
  titular: string;
  pix_key: string | null;
  moeda: string;
  saldo: number;
}

interface WalletCrypto {
  id: string;
  exchange: string | null;
  endereco: string;
  network: string;
  coin: string;
  saldo_coin: number;
  saldo_usd: number;
}

interface ContasEmpresaSectionProps {
  caixaParceiroId: string | null;
  onDataChanged?: () => void;
}

export function ContasEmpresaSection({ caixaParceiroId, onDataChanged }: ContasEmpresaSectionProps) {
  const { toast } = useToast();
  const { convertToBRL } = useExchangeRates();
  const [contas, setContas] = useState<ContaBancaria[]>([]);
  const [wallets, setWallets] = useState<WalletCrypto[]>([]);
  const [loading, setLoading] = useState(false);
  const [addContaOpen, setAddContaOpen] = useState(false);
  const [addWalletOpen, setAddWalletOpen] = useState(false);

  // Form state - Conta Bancária
  const [novaConta, setNovaConta] = useState({
    banco: "",
    agencia: "",
    conta: "",
    tipo_conta: "CORRENTE",
    titular: "",
    pix_key: "",
    moeda: "BRL",
  });

  // Form state - Wallet
  const [novaWallet, setNovaWallet] = useState({
    exchange: "",
    endereco: "",
    network: "TRC20",
  });

  const fetchContas = async () => {
    if (!caixaParceiroId) return;
    setLoading(true);
    try {
      // Fetch bank accounts
      const { data: contasData } = await supabase
        .from("v_saldo_parceiro_contas")
        .select("*")
        .eq("parceiro_id", caixaParceiroId);

      // Fetch wallets
      const { data: walletsData } = await supabase
        .from("v_saldo_parceiro_wallets")
        .select("*")
        .eq("parceiro_id", caixaParceiroId);

      setContas((contasData || []) as unknown as ContaBancaria[]);
      setWallets((walletsData || []) as unknown as WalletCrypto[]);
    } catch (err: any) {
      console.error("Erro ao buscar contas da empresa:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchContas();
  }, [caixaParceiroId]);

  const handleAddConta = async () => {
    if (!caixaParceiroId || !novaConta.banco || !novaConta.titular) {
      toast({ title: "Preencha banco e titular", variant: "destructive" });
      return;
    }

    try {
      const { error } = await supabase.from("contas_bancarias").insert({
        parceiro_id: caixaParceiroId,
        banco: novaConta.banco,
        agencia: novaConta.agencia || null,
        conta: novaConta.conta || null,
        tipo_conta: novaConta.tipo_conta,
        titular: novaConta.titular,
        pix_key: novaConta.pix_key || null,
        moeda: novaConta.moeda,
      });

      if (error) throw error;

      toast({ title: "Conta bancária adicionada" });
      setAddContaOpen(false);
      setNovaConta({ banco: "", agencia: "", conta: "", tipo_conta: "CORRENTE", titular: "", pix_key: "", moeda: "BRL" });
      fetchContas();
      onDataChanged?.();
    } catch (err: any) {
      toast({ title: "Erro ao adicionar conta", description: err.message, variant: "destructive" });
    }
  };

  const handleAddWallet = async () => {
    if (!caixaParceiroId || !novaWallet.endereco || !novaWallet.network) {
      toast({ title: "Preencha endereço e rede", variant: "destructive" });
      return;
    }

    try {
      const { error } = await supabase.from("wallets_crypto").insert({
        parceiro_id: caixaParceiroId,
        endereco: novaWallet.endereco,
        network: novaWallet.network,
        exchange: novaWallet.exchange || null,
      });

      if (error) throw error;

      toast({ title: "Wallet adicionada" });
      setAddWalletOpen(false);
      setNovaWallet({ exchange: "", endereco: "", network: "TRC20" });
      fetchContas();
      onDataChanged?.();
    } catch (err: any) {
      toast({ title: "Erro ao adicionar wallet", description: err.message, variant: "destructive" });
    }
  };

  if (!caixaParceiroId) return null;

  const hasContas = contas.length > 0;
  const hasWallets = wallets.length > 0;
  const isEmpty = !hasContas && !hasWallets;

  return (
    <Card className="bg-card/50 backdrop-blur border-border/50">
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
        <div className="flex items-center gap-2">
          <Building2 className="h-4 w-4 text-primary" />
          <CardTitle className="text-sm font-medium">Contas da Empresa</CardTitle>
          <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-4">
            {contas.length + wallets.length}
          </Badge>
        </div>
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            onClick={fetchContas}
            disabled={loading}
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {isEmpty ? (
          <div className="text-center py-6 space-y-3">
            <p className="text-sm text-muted-foreground">
              Nenhuma conta bancária ou wallet cadastrada para a empresa.
            </p>
            <div className="flex items-center justify-center gap-2">
              <Button variant="outline" size="sm" onClick={() => setAddContaOpen(true)} className="gap-1.5">
                <Landmark className="h-3.5 w-3.5" />
                Adicionar Banco
              </Button>
              <Button variant="outline" size="sm" onClick={() => setAddWalletOpen(true)} className="gap-1.5">
                <Bitcoin className="h-3.5 w-3.5" />
                Adicionar Wallet
              </Button>
            </div>
          </div>
        ) : (
          <Tabs defaultValue="bancos" className="w-full">
            <div className="flex items-center justify-between mb-3">
              <TabsList className="h-8">
                <TabsTrigger value="bancos" className="text-xs h-6 px-3 gap-1">
                  <Landmark className="h-3 w-3" />
                  Bancos ({contas.length})
                </TabsTrigger>
                <TabsTrigger value="wallets" className="text-xs h-6 px-3 gap-1">
                  <Bitcoin className="h-3 w-3" />
                  Wallets ({wallets.length})
                </TabsTrigger>
              </TabsList>
              <div className="flex gap-1">
                <Button variant="ghost" size="sm" className="h-7 text-xs gap-1" onClick={() => setAddContaOpen(true)}>
                  <Plus className="h-3 w-3" />
                  Banco
                </Button>
                <Button variant="ghost" size="sm" className="h-7 text-xs gap-1" onClick={() => setAddWalletOpen(true)}>
                  <Plus className="h-3 w-3" />
                  Wallet
                </Button>
              </div>
            </div>

            <TabsContent value="bancos" className="mt-0">
              {contas.length === 0 ? (
                <p className="text-xs text-muted-foreground text-center py-4">Nenhuma conta bancária</p>
              ) : (
                <div className="space-y-2">
                  {contas.map((conta) => (
                    <div
                      key={conta.id}
                      className="flex items-center justify-between p-2.5 rounded-lg bg-muted/30 border border-border/30"
                    >
                      <div className="flex items-center gap-2.5">
                        <div className="h-8 w-8 rounded-md bg-primary/10 flex items-center justify-center">
                          <Landmark className="h-4 w-4 text-primary" />
                        </div>
                        <div>
                          <p className="text-sm font-medium">{conta.banco}</p>
                          <p className="text-[11px] text-muted-foreground">{conta.titular}</p>
                        </div>
                      </div>
                      <div className="text-right">
                        <p className="text-sm font-semibold">
                          {getCurrencySymbol(conta.moeda)} {formatCurrencyValue(conta.saldo || 0, conta.moeda as any)}
                        </p>
                        <p className="text-[10px] text-muted-foreground">{conta.moeda}</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </TabsContent>

            <TabsContent value="wallets" className="mt-0">
              {wallets.length === 0 ? (
                <p className="text-xs text-muted-foreground text-center py-4">Nenhuma wallet cadastrada</p>
              ) : (
                <div className="space-y-2">
                  {wallets.map((wallet) => (
                    <div
                      key={wallet.id}
                      className="flex items-center justify-between p-2.5 rounded-lg bg-muted/30 border border-border/30"
                    >
                      <div className="flex items-center gap-2.5">
                        <div className="h-8 w-8 rounded-md bg-orange-500/10 flex items-center justify-center">
                          <Bitcoin className="h-4 w-4 text-orange-500" />
                        </div>
                        <div>
                          <p className="text-sm font-medium">
                            {wallet.exchange?.replace(/-/g, " ").toUpperCase() || "Wallet"}
                          </p>
                          <p className="text-[11px] text-muted-foreground font-mono">
                            {wallet.endereco.slice(0, 8)}...{wallet.endereco.slice(-6)} ({wallet.network})
                          </p>
                        </div>
                      </div>
                      <div className="text-right">
                        <p className="text-sm font-semibold">
                          {(wallet.saldo_coin || 0).toFixed(2)} {wallet.coin}
                        </p>
                        <p className="text-[10px] text-muted-foreground">
                          ≈ ${formatCurrencyValue(wallet.saldo_usd || 0)}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </TabsContent>
          </Tabs>
        )}
      </CardContent>

      {/* Dialog: Adicionar Conta Bancária */}
      <Dialog open={addContaOpen} onOpenChange={setAddContaOpen}>
        <DialogContent className="sm:max-w-md bg-background">
          <DialogHeader>
            <DialogTitle>Adicionar Conta Bancária da Empresa</DialogTitle>
            <DialogDescription>
              Cadastre uma conta bancária própria da operação.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs">Banco *</Label>
                <Input
                  value={novaConta.banco}
                  onChange={(e) => setNovaConta({ ...novaConta, banco: e.target.value })}
                  placeholder="Ex: Nubank"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Titular *</Label>
                <Input
                  value={novaConta.titular}
                  onChange={(e) => setNovaConta({ ...novaConta, titular: e.target.value })}
                  placeholder="Nome do titular"
                />
              </div>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs">Agência</Label>
                <Input
                  value={novaConta.agencia}
                  onChange={(e) => setNovaConta({ ...novaConta, agencia: e.target.value })}
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Conta</Label>
                <Input
                  value={novaConta.conta}
                  onChange={(e) => setNovaConta({ ...novaConta, conta: e.target.value })}
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Moeda</Label>
                <Select value={novaConta.moeda} onValueChange={(v) => setNovaConta({ ...novaConta, moeda: v })}>
                  <SelectTrigger className="h-9">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {FIAT_CURRENCIES.map((c) => (
                      <SelectItem key={c.value} value={c.value}>
                        {c.value}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Chave PIX</Label>
              <Input
                value={novaConta.pix_key}
                onChange={(e) => setNovaConta({ ...novaConta, pix_key: e.target.value })}
                placeholder="CPF, e-mail, telefone ou chave aleatória"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddContaOpen(false)}>Cancelar</Button>
            <Button onClick={handleAddConta}>Adicionar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog: Adicionar Wallet */}
      <Dialog open={addWalletOpen} onOpenChange={setAddWalletOpen}>
        <DialogContent className="sm:max-w-md bg-background">
          <DialogHeader>
            <DialogTitle>Adicionar Wallet da Empresa</DialogTitle>
            <DialogDescription>
              Cadastre uma carteira cripto própria da operação.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label className="text-xs">Exchange</Label>
              <Input
                value={novaWallet.exchange}
                onChange={(e) => setNovaWallet({ ...novaWallet, exchange: e.target.value })}
                placeholder="Ex: Binance, Bybit"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Endereço *</Label>
              <Input
                value={novaWallet.endereco}
                onChange={(e) => setNovaWallet({ ...novaWallet, endereco: e.target.value })}
                placeholder="Endereço da wallet"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Rede</Label>
              <Select value={novaWallet.network} onValueChange={(v) => setNovaWallet({ ...novaWallet, network: v })}>
                <SelectTrigger className="h-9">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="TRC20">TRC20</SelectItem>
                  <SelectItem value="ERC20">ERC20</SelectItem>
                  <SelectItem value="BEP20">BEP20</SelectItem>
                  <SelectItem value="SOL">Solana</SelectItem>
                  <SelectItem value="MATIC">Polygon</SelectItem>
                  <SelectItem value="BTC">Bitcoin</SelectItem>
                  <SelectItem value="ARBITRUM">Arbitrum</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddWalletOpen(false)}>Cancelar</Button>
            <Button onClick={handleAddWallet}>Adicionar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
