import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Wallet, Plus, Landmark, Copy, Check } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { formatCurrencyValue } from "@/types/currency";
import { BancoSelect } from "@/components/parceiros/BancoSelect";
import { PixKeyInput } from "@/components/parceiros/PixKeyInput";

interface ContaFiat {
  id: string;
  banco: string;
  titular: string;
  moeda: string;
  saldo: number;
  pix_key?: string | null;
  pix_keys?: Array<{ tipo: string; chave: string }> | null;
}

interface SaldosFiatCardProps {
  caixaParceiroId: string | null;
  formatCurrency: (value: number, currency: string) => string;
  onDataChanged: () => void;
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

export function SaldosFiatCard({ caixaParceiroId, formatCurrency, onDataChanged }: SaldosFiatCardProps) {
  const { toast } = useToast();
  const [contas, setContas] = useState<ContaFiat[]>([]);
  const [addContaOpen, setAddContaOpen] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const [novaConta, setNovaConta] = useState({
    banco_id: "", banco_nome: "", agencia: "", conta: "",
    tipo_conta: "corrente", titular: "", pix_keys: [] as { tipo: string; chave: string }[],
    moeda: "BRL", observacoes: "",
  });

  const fetchContas = useCallback(async () => {
    if (!caixaParceiroId) return;
    const [viewRes, detailRes] = await Promise.all([
      supabase.from("v_saldo_parceiro_contas").select("*").eq("parceiro_id", caixaParceiroId),
      supabase.from("contas_bancarias").select("id, pix_key, pix_keys").eq("parceiro_id", caixaParceiroId),
    ]);
    const pixMap = new Map((detailRes.data || []).map((d: any) => [d.id, d]));
    const merged = (viewRes.data || []).map((c: any) => {
      const pix = pixMap.get(c.conta_id);
      return { ...c, id: c.conta_id, pix_key: pix?.pix_key || null, pix_keys: pix?.pix_keys || null };
    });
    setContas(merged as ContaFiat[]);
  }, [caixaParceiroId]);

  useEffect(() => { fetchContas(); }, [fetchContas]);

  useEffect(() => {
    const handler = () => fetchContas();
    window.addEventListener("lovable:caixa-data-changed", handler);
    return () => window.removeEventListener("lovable:caixa-data-changed", handler);
  }, [fetchContas]);

  const copyToClipboard = async (text: string, id: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedId(id);
      setTimeout(() => setCopiedId(null), 2000);
    } catch { /* ignore */ }
  };

  const resetContaForm = () => {
    setNovaConta({
      banco_id: "", banco_nome: "", agencia: "", conta: "",
      tipo_conta: "corrente", titular: "", pix_keys: [], moeda: "BRL", observacoes: "",
    });
  };

  const handleAddConta = async () => {
    if (!caixaParceiroId) {
      console.error("[SaldosFiatCard] caixaParceiroId is null — cannot create bank account without Caixa Operacional partner");
      toast({ title: "Erro de configuração", description: "Parceiro do Caixa Operacional não encontrado. Recarregue a página.", variant: "destructive" });
      return;
    }
    if (!novaConta.titular.trim()) {
      toast({ title: "Preencha os campos obrigatórios", description: "O campo Titular é obrigatório.", variant: "destructive" });
      return;
    }
    try {
      let bancoNome = novaConta.banco_nome;
      if (novaConta.banco_id && !bancoNome) {
        const { data: bancoData } = await supabase
          .from("bancos").select("nome").eq("id", novaConta.banco_id).single();
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
      onDataChanged();
    } catch (err: any) {
      toast({ title: "Erro ao adicionar conta", description: err.message, variant: "destructive" });
    }
  };

  // Aggregate totals by currency
  const saldosPorMoeda = contas.reduce<Record<string, { saldo: number; contas: ContaFiat[] }>>((acc, c) => {
    const m = c.moeda || "BRL";
    if (!acc[m]) acc[m] = { saldo: 0, contas: [] };
    acc[m].saldo += (c.saldo || 0);
    acc[m].contas.push(c);
    return acc;
  }, {});

  const saldoEntries = Object.entries(saldosPorMoeda);

  return (
    <>
      <Card className="bg-card/50 backdrop-blur border-border/50">
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <div className="flex items-center gap-2">
            <CardTitle className="text-sm font-medium">Caixa FIAT</CardTitle>
            {contas.length > 0 && (
              <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-4">
                {contas.length}
              </Badge>
            )}
          </div>
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6 rounded-full hover:bg-primary/20"
              onClick={() => setAddContaOpen(true)}
              title="Adicionar conta bancária"
            >
              <Plus className="h-3.5 w-3.5 text-muted-foreground hover:text-primary transition-colors" />
            </Button>
            <Wallet className="h-4 w-4 text-emerald-500" />
          </div>
        </CardHeader>
        <CardContent className="space-y-2">
          {/* Totals by currency — clickable to see bank details */}
          {saldoEntries.filter(([, v]) => v.saldo !== 0 || v.contas.length > 0).map(([moeda, { saldo, contas: contasMoeda }]) => (
            <Popover key={moeda}>
              <PopoverTrigger asChild>
                <button className="w-full flex items-center justify-between p-2 rounded-md hover:bg-muted/30 transition-colors cursor-pointer group">
                  <span className="text-sm text-muted-foreground group-hover:text-foreground transition-colors">{moeda}</span>
                  <span className="text-lg font-bold text-emerald-400">
                    {formatCurrency(saldo, moeda)}
                  </span>
                </button>
              </PopoverTrigger>
              <PopoverContent side="bottom" align="end" className="w-[420px] p-0">
                <div className="px-5 py-4 border-b border-border">
                  <p className="text-base font-semibold">Contas em {moeda}</p>
                  <p className="text-sm text-muted-foreground">{contasMoeda.length} conta(s) bancária(s)</p>
                </div>
                <div className="p-4 space-y-4 max-h-80 overflow-y-auto">
                  {contasMoeda.map((conta) => (
                    <div key={conta.id} className="space-y-3">
                      {/* Header: banco + saldo */}
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex items-start gap-2.5 min-w-0">
                          <Landmark className="h-5 w-5 text-muted-foreground shrink-0 mt-0.5" />
                          <div className="min-w-0">
                            <p className="text-sm font-semibold truncate">{conta.banco}</p>
                            <p className="text-xs text-muted-foreground">{conta.titular}</p>
                          </div>
                        </div>
                        <span className="text-base font-bold text-emerald-400 shrink-0">
                          {formatCurrencyValue(conta.saldo || 0, conta.moeda as any)}
                        </span>
                      </div>

                      {/* PIX keys as mini-cards */}
                      {((conta.pix_keys && conta.pix_keys.length > 0) || conta.pix_key) && (
                        <div className="ml-7 space-y-1.5">
                          {conta.pix_keys && conta.pix_keys.length > 0 && conta.pix_keys.map((pk, idx) => (
                            <div
                              key={`pix-arr-${conta.id}-${idx}`}
                              className="flex items-center justify-between px-3 py-2 rounded-md bg-muted/30 border border-border/40 cursor-pointer hover:bg-muted/50 transition-colors group"
                              onClick={(e) => { e.stopPropagation(); copyToClipboard(pk.chave, `pix-${conta.id}-${idx}`); }}
                            >
                              <div className="flex items-center gap-2 min-w-0">
                                <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-5 shrink-0 uppercase font-medium">
                                  {pk.tipo}
                                </Badge>
                                <span className="text-sm font-mono text-muted-foreground group-hover:text-foreground transition-colors truncate">
                                  {pk.chave}
                                </span>
                              </div>
                              {copiedId === `pix-${conta.id}-${idx}`
                                ? <Check className="h-3.5 w-3.5 text-primary shrink-0" />
                                : <Copy className="h-3.5 w-3.5 text-muted-foreground/50 group-hover:text-muted-foreground shrink-0 transition-colors" />
                              }
                            </div>
                          ))}
                          {(!conta.pix_keys || conta.pix_keys.length === 0) && conta.pix_key && (
                            <div
                              className="flex items-center justify-between px-3 py-2 rounded-md bg-muted/30 border border-border/40 cursor-pointer hover:bg-muted/50 transition-colors group"
                              onClick={(e) => { e.stopPropagation(); copyToClipboard(conta.pix_key!, `pix-${conta.id}`); }}
                            >
                              <div className="flex items-center gap-2 min-w-0">
                                <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-5 shrink-0 uppercase font-medium">
                                  PIX
                                </Badge>
                                <span className="text-sm font-mono text-muted-foreground group-hover:text-foreground transition-colors truncate">
                                  {conta.pix_key}
                                </span>
                              </div>
                              {copiedId === `pix-${conta.id}`
                                ? <Check className="h-3.5 w-3.5 text-primary shrink-0" />
                                : <Copy className="h-3.5 w-3.5 text-muted-foreground/50 group-hover:text-muted-foreground shrink-0 transition-colors" />
                              }
                            </div>
                          )}
                        </div>
                      )}

                      {/* Divider between accounts */}
                      {contasMoeda.indexOf(conta) < contasMoeda.length - 1 && (
                        <div className="border-b border-border/30" />
                      )}
                    </div>
                  ))}
                </div>
              </PopoverContent>
            </Popover>
          ))}

          {saldoEntries.length === 0 && (
            <div className="text-sm text-muted-foreground italic">Nenhum saldo FIAT</div>
          )}

          {/* Empty state with create CTA */}
          {contas.length === 0 && caixaParceiroId && (
            <Button
              variant="ghost"
              size="sm"
              className="w-full text-xs text-muted-foreground gap-1.5 h-8"
              onClick={() => setAddContaOpen(true)}
            >
              <Plus className="h-3 w-3" />
              Adicionar conta bancária
            </Button>
          )}
        </CardContent>
      </Card>

      {/* Dialog: Adicionar Conta Bancária */}
      <Dialog open={addContaOpen} onOpenChange={(open) => { setAddContaOpen(open); if (!open) resetContaForm(); }}>
        <DialogContent className="sm:max-w-lg bg-background">
          <DialogHeader>
            <DialogTitle>Adicionar Conta Bancária</DialogTitle>
            <DialogDescription>Cadastre uma conta bancária da empresa.</DialogDescription>
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
                  <SelectTrigger><SelectValue placeholder="Moeda" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="BRL">BRL - Real</SelectItem>
                    <SelectItem value="USD">USD - Dólar</SelectItem>
                    <SelectItem value="EUR">EUR - Euro</SelectItem>
                    <SelectItem value="GBP">GBP - Libra</SelectItem>
                    <SelectItem value="MXN">MXN - Peso MX</SelectItem>
                    <SelectItem value="MYR">MYR - Ringgit</SelectItem>
                    <SelectItem value="ARS">ARS - Peso AR</SelectItem>
                    <SelectItem value="COP">COP - Peso CO</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs">Agência <span className="text-muted-foreground/60">(opc.)</span></Label>
                <Input value={formatAgencia(novaConta.agencia)} onChange={(e) => setNovaConta({ ...novaConta, agencia: e.target.value })} placeholder="0000-0" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Conta <span className="text-muted-foreground/60">(opc.)</span></Label>
                <Input value={formatConta(novaConta.conta)} onChange={(e) => setNovaConta({ ...novaConta, conta: e.target.value })} placeholder="00000-0" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Tipo *</Label>
                <Select value={novaConta.tipo_conta} onValueChange={(v) => setNovaConta({ ...novaConta, tipo_conta: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
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
              <Input value={novaConta.titular} onChange={(e) => setNovaConta({ ...novaConta, titular: e.target.value.toUpperCase() })} placeholder="Nome do titular" className="uppercase" />
            </div>
            <PixKeyInput keys={novaConta.pix_keys} onChange={(keys) => setNovaConta({ ...novaConta, pix_keys: keys })} />
            <div className="space-y-1.5">
              <Label className="text-xs">Observações <span className="text-muted-foreground/60">(opc.)</span></Label>
              <Textarea value={novaConta.observacoes} onChange={(e) => setNovaConta({ ...novaConta, observacoes: e.target.value })} rows={2} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddContaOpen(false)}>Cancelar</Button>
            <Button onClick={handleAddConta}>Adicionar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
