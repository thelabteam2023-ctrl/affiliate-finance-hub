import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Building2, Plus, RefreshCw, Landmark, Bitcoin, Copy, Check } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { formatCurrencyValue, getCurrencySymbol } from "@/types/currency";
import { useExchangeRates } from "@/contexts/ExchangeRatesContext";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { BancoSelect } from "@/components/parceiros/BancoSelect";
import { PixKeyInput } from "@/components/parceiros/PixKeyInput";
import { ExchangeSelect } from "@/components/parceiros/ExchangeSelect";
import { RedeSelect } from "@/components/parceiros/RedeSelect";
import { MoedaMultiSelect } from "@/components/parceiros/MoedaMultiSelect";

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
  label: string | null;
  exchange: string | null;
  endereco: string;
  network: string;
  moedas: string[];
  coin: string;
  saldo_coin: number;
  saldo_usd: number;
}

interface ContasEmpresaSectionProps {
  caixaParceiroId: string | null;
  onDataChanged?: () => void;
}

const formatAgencia = (value: string) => {
  const digits = value.replace(/\D/g, "").slice(0, 5);
  if (digits.length > 4) return `${digits.slice(0, 4)}-${digits.slice(4)}`;
  return digits;
};

const formatConta = (value: string) => {
  const digits = value.replace(/\D/g, "").slice(0, 15);
  if (digits.length > 1) return `${digits.slice(0, -1)}-${digits.slice(-1)}`;
  return digits;
};

export function ContasEmpresaSection({ caixaParceiroId, onDataChanged }: ContasEmpresaSectionProps) {
  const { toast } = useToast();
  const { convertToBRL } = useExchangeRates();
  const [contas, setContas] = useState<ContaBancaria[]>([]);
  const [wallets, setWallets] = useState<WalletCrypto[]>([]);
  const [loading, setLoading] = useState(false);
  const [addContaOpen, setAddContaOpen] = useState(false);
  const [addWalletOpen, setAddWalletOpen] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const copyToClipboard = async (text: string, id: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedId(id);
      toast({ title: "Copiado!", description: "Copiado para a área de transferência." });
      setTimeout(() => setCopiedId(null), 2000);
    } catch {
      toast({ title: "Erro ao copiar", variant: "destructive" });
    }
  };

  // Form state - Conta Bancária (same fields as ParceiroDialog)
  const [novaConta, setNovaConta] = useState({
    banco_id: "",
    banco_nome: "",
    agencia: "",
    conta: "",
    tipo_conta: "corrente",
    titular: "",
    pix_keys: [] as { tipo: string; chave: string }[],
    moeda: "BRL",
    observacoes: "",
  });

  // Form state - Wallet (same fields as ParceiroDialog)
  const [novaWallet, setNovaWallet] = useState({
    label: "",
    exchange: "",
    endereco: "",
    rede_id: "",
    network: "TRC20",
    moeda: [] as string[],
    observacoes: "",
  });

  const fetchContas = async () => {
    if (!caixaParceiroId) return;
    setLoading(true);
    try {
      const [contasRes, walletsViewRes, walletsDetailRes] = await Promise.all([
        supabase
          .from("v_saldo_parceiro_contas")
          .select("*")
          .eq("parceiro_id", caixaParceiroId),
        supabase
          .from("v_saldo_parceiro_wallets")
          .select("*")
          .eq("parceiro_id", caixaParceiroId),
        supabase
          .from("wallets_crypto")
          .select("id, label, network, moeda")
          .eq("parceiro_id", caixaParceiroId),
      ]);

      setContas((contasRes.data || []) as unknown as ContaBancaria[]);

      // Merge wallet view (saldos) with wallet details (network, moedas)
      const detailMap = new Map(
        (walletsDetailRes.data || []).map((d: any) => [d.id, d])
      );
      const mergedWallets = (walletsViewRes.data || []).map((w: any) => {
        const detail = detailMap.get(w.wallet_id);
        return {
          ...w,
          id: w.wallet_id,
          label: detail?.label || null,
          network: detail?.network || '',
          moedas: Array.isArray(detail?.moeda) ? detail.moeda : [],
        };
      });
      setWallets(mergedWallets as unknown as WalletCrypto[]);
    } catch (err: any) {
      console.error("Erro ao buscar contas da empresa:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchContas();
  }, [caixaParceiroId]);

  // Auto-refresh when caixa data changes (e.g., after reconciliation adjustments)
  useEffect(() => {
    const handler = () => fetchContas();
    window.addEventListener("lovable:caixa-data-changed", handler);
    return () => window.removeEventListener("lovable:caixa-data-changed", handler);
  }, [caixaParceiroId]);

  const handleAddConta = async () => {
    if (!caixaParceiroId || !novaConta.titular) {
      toast({ title: "Preencha os campos obrigatórios", variant: "destructive" });
      return;
    }

    try {
      // Resolve banco name from banco_id if needed
      let bancoNome = novaConta.banco_nome;
      if (novaConta.banco_id && !bancoNome) {
        const { data: bancoData } = await supabase
          .from("bancos")
          .select("nome")
          .eq("id", novaConta.banco_id)
          .single();
        bancoNome = bancoData?.nome || "";
      }

      const { error } = await supabase.from("contas_bancarias").insert({
        parceiro_id: caixaParceiroId,
        banco: bancoNome,
        banco_id: novaConta.banco_id || null,
        agencia: novaConta.agencia || null,
        conta: novaConta.conta || null,
        tipo_conta: novaConta.tipo_conta,
        titular: novaConta.titular,
        pix_keys: novaConta.pix_keys.length > 0 ? novaConta.pix_keys : null,
        moeda: novaConta.moeda,
        observacoes: novaConta.observacoes || null,
      });

      if (error) throw error;

      toast({ title: "Conta bancária adicionada" });
      setAddContaOpen(false);
      resetContaForm();
      fetchContas();
      onDataChanged?.();
    } catch (err: any) {
      toast({ title: "Erro ao adicionar conta", description: err.message, variant: "destructive" });
    }
  };

  const resetContaForm = () => {
    setNovaConta({
      banco_id: "",
      banco_nome: "",
      agencia: "",
      conta: "",
      tipo_conta: "corrente",
      titular: "",
      pix_keys: [],
      moeda: "BRL",
      observacoes: "",
    });
  };

  const handleAddWallet = async () => {
    if (!caixaParceiroId || !novaWallet.endereco) {
      toast({ title: "Preencha o endereço da wallet", variant: "destructive" });
      return;
    }

    try {
      // Resolve network name from rede_id
      let networkName = novaWallet.network;
      if (novaWallet.rede_id) {
        const { data: redeData } = await supabase
          .from("redes_crypto")
          .select("nome")
          .eq("id", novaWallet.rede_id)
          .single();
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
      fetchContas();
      onDataChanged?.();
    } catch (err: any) {
      toast({ title: "Erro ao adicionar wallet", description: err.message, variant: "destructive" });
    }
  };

  const resetWalletForm = () => {
    setNovaWallet({
      label: "",
      exchange: "",
      endereco: "",
      rede_id: "",
      network: "TRC20",
      moeda: [],
      observacoes: "",
    });
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
                          {conta.pix_key && (
                            <p
                              className="text-[11px] text-muted-foreground font-mono cursor-pointer hover:text-primary transition-colors flex items-center gap-1 mt-0.5"
                              onClick={() => copyToClipboard(conta.pix_key!, `pix-${conta.id}`)}
                              title="Clique para copiar PIX"
                            >
                              PIX: {conta.pix_key.length > 20 ? `${conta.pix_key.slice(0, 10)}...${conta.pix_key.slice(-6)}` : conta.pix_key}
                              {copiedId === `pix-${conta.id}` ? <Check className="h-2.5 w-2.5 text-primary" /> : <Copy className="h-2.5 w-2.5 opacity-50" />}
                            </p>
                          )}
                        </div>
                      </div>
                      <div className="text-right">
                        <p className="text-sm font-semibold">
                           {formatCurrencyValue(conta.saldo || 0, conta.moeda as any)}
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
                  {(() => {
                    // Agrupar wallets pelo endereço para mostrar múltiplos saldos na mesma linha
                    const grouped = wallets.reduce<Record<string, WalletCrypto[]>>((acc, w) => {
                      const key = w.endereco;
                      if (!acc[key]) acc[key] = [];
                      acc[key].push(w);
                      return acc;
                    }, {});

                    return Object.entries(grouped).map(([endereco, group]) => {
                      const first = group[0];
                      // Collect all unique moedas from the group
                      const allMoedas = [...new Set(group.flatMap(w => w.moedas || []))];
                      // Sum total USD across all coins in this wallet
                      const totalUsd = group.reduce((sum, w) => sum + (w.saldo_usd || 0), 0);

                      return (
                        <div
                          key={endereco}
                          className="flex items-center justify-between p-2.5 rounded-lg bg-muted/30 border border-border/30"
                        >
                          <div className="flex items-center gap-2.5">
                            <div className="h-8 w-8 rounded-md bg-primary/10 flex items-center justify-center">
                              <Bitcoin className="h-4 w-4 text-primary" />
                            </div>
                            <div>
                              <p className="text-sm font-medium">
                                {(first.label || first.exchange || "Wallet").replace(/-/g, " ").toUpperCase()}
                              </p>
                              <p
                                className="text-[11px] text-muted-foreground font-mono cursor-pointer hover:text-primary transition-colors flex items-center gap-1"
                                onClick={() => copyToClipboard(first.endereco, `wallet-${endereco}`)}
                                title="Clique para copiar endereço"
                              >
                                {endereco.slice(0, 8)}...{endereco.slice(-6)}
                                {copiedId === `wallet-${endereco}` ? <Check className="h-2.5 w-2.5 text-primary" /> : <Copy className="h-2.5 w-2.5 opacity-50" />}
                              </p>
                              <div className="flex items-center gap-1.5 mt-0.5">
                                {first.network && (
                                  <Badge variant="outline" className="text-[9px] px-1 py-0 h-3.5 uppercase">
                                    {first.network}
                                  </Badge>
                                )}
                                {allMoedas.map((m: string) => (
                                  <Badge key={m} className="text-[9px] px-1 py-0 h-3.5 bg-primary/20 text-primary border-primary/30">
                                    {m}
                                  </Badge>
                                ))}
                              </div>
                            </div>
                          </div>
                          <div className="text-right space-y-0.5">
                            {group.map((w) => (
                              <p key={w.id} className="text-sm font-semibold font-mono">
                                {(w.saldo_coin || 0).toFixed(2)} <span className="text-xs text-muted-foreground">{w.coin}</span>
                              </p>
                            ))}
                            <p className="text-[10px] text-muted-foreground">
                              ≈ {formatCurrencyValue(totalUsd, "USD" as any)}
                            </p>
                          </div>
                        </div>
                      );
                    });
                  })()}
                </div>
              )}
            </TabsContent>
          </Tabs>
        )}
      </CardContent>

      {/* Dialog: Adicionar Conta Bancária */}
      <Dialog open={addContaOpen} onOpenChange={(open) => { setAddContaOpen(open); if (!open) resetContaForm(); }}>
        <DialogContent className="sm:max-w-lg bg-background">
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
                <BancoSelect
                  value={novaConta.banco_id}
                  onValueChange={(value) => setNovaConta({ ...novaConta, banco_id: value })}
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Moeda *</Label>
                <Select value={novaConta.moeda} onValueChange={(v) => setNovaConta({ ...novaConta, moeda: v })}>
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Selecione a moeda" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="BRL">BRL - Real Brasileiro</SelectItem>
                    <SelectItem value="USD">USD - Dólar Americano</SelectItem>
                    <SelectItem value="EUR">EUR - Euro</SelectItem>
                    <SelectItem value="GBP">GBP - Libra Esterlina</SelectItem>
                    <SelectItem value="MXN">MXN - Peso Mexicano</SelectItem>
                    <SelectItem value="MYR">MYR - Ringgit Malaio</SelectItem>
                    <SelectItem value="ARS">ARS - Peso Argentino</SelectItem>
                    <SelectItem value="COP">COP - Peso Colombiano</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs">
                  Agência
                  <span className="text-muted-foreground/60 ml-1">(opcional)</span>
                </Label>
                <Input
                  value={formatAgencia(novaConta.agencia)}
                  onChange={(e) => setNovaConta({ ...novaConta, agencia: e.target.value })}
                  placeholder="0000-0"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">
                  Conta
                  <span className="text-muted-foreground/60 ml-1">(opcional)</span>
                </Label>
                <Input
                  value={formatConta(novaConta.conta)}
                  onChange={(e) => setNovaConta({ ...novaConta, conta: e.target.value })}
                  placeholder="00000-0"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Tipo *</Label>
                <Select value={novaConta.tipo_conta} onValueChange={(v) => setNovaConta({ ...novaConta, tipo_conta: v })}>
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Tipo de conta" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="corrente">Corrente</SelectItem>
                    <SelectItem value="poupanca">Poupança</SelectItem>
                    <SelectItem value="pagamento">Pagamento</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Titular *</Label>
              <Input
                value={novaConta.titular}
                onChange={(e) => setNovaConta({ ...novaConta, titular: e.target.value.toUpperCase() })}
                placeholder="Nome do titular"
                className="uppercase"
              />
            </div>
            <div>
              <PixKeyInput
                keys={novaConta.pix_keys}
                onChange={(keys) => setNovaConta({ ...novaConta, pix_keys: keys })}
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">
                Observações
                <span className="text-muted-foreground/60 ml-1">(opcional)</span>
              </Label>
              <Textarea
                value={novaConta.observacoes}
                onChange={(e) => setNovaConta({ ...novaConta, observacoes: e.target.value })}
                rows={2}
                placeholder="Informações adicionais sobre esta conta"
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
      <Dialog open={addWalletOpen} onOpenChange={(open) => { setAddWalletOpen(open); if (!open) resetWalletForm(); }}>
        <DialogContent className="sm:max-w-lg bg-background">
          <DialogHeader>
            <DialogTitle>Adicionar Wallet da Empresa</DialogTitle>
            <DialogDescription>
              Cadastre uma carteira cripto própria da operação.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <MoedaMultiSelect
                moedas={novaWallet.moeda}
                onChange={(moedas) => setNovaWallet({ ...novaWallet, moeda: moedas })}
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">
                Apelido da Wallet
                <span className="text-muted-foreground/60 ml-1">(ex: Fundo de Reserva 1)</span>
              </Label>
              <Input
                value={novaWallet.label}
                onChange={(e) => setNovaWallet({ ...novaWallet, label: e.target.value })}
                placeholder="Identificação da wallet"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">
                Exchange/Wallet
                <span className="text-muted-foreground/60 ml-1">(opcional)</span>
              </Label>
              <ExchangeSelect
                value={novaWallet.exchange}
                onValueChange={(value) => setNovaWallet({ ...novaWallet, exchange: value })}
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Network *</Label>
              <RedeSelect
                value={novaWallet.rede_id}
                onValueChange={(value) => setNovaWallet({ ...novaWallet, rede_id: value })}
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
              <Label className="text-xs">
                Observações
                <span className="text-muted-foreground/60 ml-1">(opcional)</span>
              </Label>
              <Textarea
                value={novaWallet.observacoes}
                onChange={(e) => setNovaWallet({ ...novaWallet, observacoes: e.target.value })}
                rows={2}
                placeholder="Informações adicionais sobre esta wallet"
              />
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
