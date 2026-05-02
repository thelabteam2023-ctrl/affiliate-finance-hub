import { useState, useEffect } from "react";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { 
  Plus, Truck, Link2, Copy, ExternalLink, Wallet,
  Building2, Users, Clock, CheckCircle2, XCircle, AlertTriangle, Zap,
  Search, Check, ClipboardList, RefreshCw, ScrollText
} from "lucide-react";
import { SupplierBookmakerConfigDialog } from "./SupplierBookmakerConfigDialog";
import { SupplierTasksAdmin } from "./SupplierTasksAdmin";
import { SupplierExtratoInline } from "./SupplierExtratoInline";
import { Separator } from "@/components/ui/separator";
import { OrigemPagamentoSelect, OrigemPagamentoData } from "@/components/programa-indicacao/OrigemPagamentoSelect";
import { format } from "date-fns";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { toast } from "sonner";

interface Props {
  workspaceId: string;
}

function formatCurrency(val: number) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(val);
}

export function SupplierAdminPanel({ workspaceId }: Props) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [novoFornecedorOpen, setNovoFornecedorOpen] = useState(false);
  const [alocacaoOpen, setAlocacaoOpen] = useState(false);
  const [linkOpen, setLinkOpen] = useState(false);
  const [selectedSupplier, setSelectedSupplier] = useState<any>(null);
  const [generatedLink, setGeneratedLink] = useState<string | null>(null);
  const [syncingId, setSyncingId] = useState<string | null>(null);
  const [selectedFornecedorId, setSelectedFornecedorId] = useState<string>("new");
  const [supplierSearch, setSupplierSearch] = useState("");
  const [casasConfigOpen, setCasasConfigOpen] = useState(false);
  const [casasConfigSupplier, setCasasConfigSupplier] = useState<any>(null);
  const [tasksSupplier, setTasksSupplier] = useState<any>(null);
  const [extratoSupplierId, setExtratoSupplierId] = useState<string | null>(null);

  // Form state - Novo Fornecedor
  const [nome, setNome] = useState("");
  const [contato, setContato] = useState("");
  const [observacoes, setObservacoes] = useState("");

  // Form state - Alocação
  const [valorAlocacao, setValorAlocacao] = useState("");
  
  const [descricaoAlocacao, setDescricaoAlocacao] = useState("");
  const [origemData, setOrigemData] = useState<OrigemPagamentoData>({
    origemTipo: "CAIXA_OPERACIONAL",
    tipoMoeda: "FIAT",
    moeda: "BRL",
    saldoDisponivel: 0,
  });

  // Form state - Link
  const [ttlHours, setTtlHours] = useState("72");
  const [linkLabel, setLinkLabel] = useState("");

  // Fetch suppliers
  const { data: suppliers = [] } = useQuery({
    queryKey: ["admin-suppliers", workspaceId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("supplier_profiles")
        .select(`
          *,
          parceiros (id)
        `)
        .eq("parent_workspace_id", workspaceId)
        .order("created_at", { ascending: false });
      if (error) throw error;

      const profiles = data || [];
      const wsIds = profiles.map((p: any) => p.workspace_id);

      const [alocRes, tokenRes] = await Promise.all([
        supabase.from("supplier_alocacoes").select("supplier_workspace_id, valor, status, created_at").in("supplier_workspace_id", wsIds),
        supabase.from("supplier_access_tokens").select("supplier_workspace_id, id, expires_at, revoked_at, use_count, last_used_at, label, token_plain").in("supplier_workspace_id", wsIds),
      ]);

      return profiles.map((p: any) => ({
        ...p,
        parceiro_id: (p.parceiros as any)?.[0]?.id,
        supplier_alocacoes: (alocRes.data || []).filter((a: any) => a.supplier_workspace_id === p.workspace_id),
        supplier_access_tokens: (tokenRes.data || []).filter((t: any) => t.supplier_workspace_id === p.workspace_id),
      }));
    },
  });

  // Fetch fornecedores from Captação that don't have a portal profile yet
  const linkedFornecedorIds = suppliers
    .map((s: any) => s.fornecedor_id)
    .filter(Boolean);

  const { data: unlinkedFornecedores = [] } = useQuery({
    queryKey: ["unlinked-fornecedores", workspaceId, linkedFornecedorIds],
    queryFn: async () => {
      let query = supabase
        .from("fornecedores")
        .select("id, nome, documento, status")
        .eq("workspace_id", workspaceId)
        .eq("status", "ATIVO")
        .order("nome");

      if (linkedFornecedorIds.length > 0) {
        // Exclude already linked ones using NOT IN via filter
        const { data } = await query;
        return (data || []).filter(
          (f: any) => !linkedFornecedorIds.includes(f.id)
        );
      }

      const { data } = await query;
      return data || [];
    },
  });

  // Sync a fornecedor from Captação → create workspace + supplier_profile
  // Activate supplier via secure RPC (bypasses RLS)
  const activateSupplierRpc = async (params: {
    nome: string;
    contato?: string | null;
    observacoes?: string | null;
    fornecedor_id?: string | null;
  }) => {
    const { data, error } = await supabase.rpc("activate_supplier_portal", {
      p_parent_workspace_id: workspaceId,
      p_nome: params.nome,
      p_contato: params.contato || null,
      p_observacoes: params.observacoes || null,
      p_fornecedor_id: params.fornecedor_id || null,
    });
    if (error) throw error;
    const result = data as any;
    if (!result?.success) throw new Error(result?.error || "Erro ao ativar fornecedor");
    return result;
  };

  // Create supplier (from existing fornecedor or new)
  const createSupplierMutation = useMutation({
    mutationFn: async () => {
      if (!user?.id) throw new Error("Usuário não autenticado");

      if (selectedFornecedorId !== "new") {
        const found = unlinkedFornecedores.find((f: any) => f.id === selectedFornecedorId);
        if (!found) throw new Error("Fornecedor não encontrado");
        await activateSupplierRpc({
          nome: found.nome,
          contato: found.documento,
          fornecedor_id: found.id,
        });
        return;
      }

      if (!nome.trim()) throw new Error("Nome é obrigatório");
      await activateSupplierRpc({
        nome,
        contato,
        observacoes,
      });
    },
    onSuccess: () => {
      toast.success("Fornecedor ativado no portal");
      queryClient.invalidateQueries({ queryKey: ["admin-suppliers"] });
      queryClient.invalidateQueries({ queryKey: ["unlinked-fornecedores"] });
      setNome("");
      setContato("");
      setObservacoes("");
      setSelectedFornecedorId("new");
      setNovoFornecedorOpen(false);
    },
    onError: (e: any) => toast.error(e.message),
  });

  // Allocate capital - com rastreamento de origem real
  const valorAlocacaoNum = parseFloat(valorAlocacao) || 0;
  const isSaldoInsuficiente = Boolean(origemData.saldoInsuficiente) || (valorAlocacaoNum > 0 && origemData.saldoDisponivel < valorAlocacaoNum);

  const allocateMutation = useMutation({
    mutationFn: async () => {
      if (!selectedSupplier || !valorAlocacao) throw new Error("Dados incompletos");
      const numVal = parseFloat(valorAlocacao);
      if (!numVal || numVal <= 0) throw new Error("Valor inválido");

      const saldoRealInsuficiente = Boolean(origemData.saldoInsuficiente) || (numVal > 0 && origemData.saldoDisponivel < numVal);
      if (saldoRealInsuficiente) {
        throw new Error(`Saldo insuficiente. Disponível: R$ ${origemData.saldoDisponivel.toFixed(2)}`);
      }

      const { data: { user: currentUser } } = await supabase.auth.getUser();
      if (!currentUser) throw new Error("Não autenticado");

      const isCrypto = origemData.tipoMoeda === "CRYPTO";
      const cotacaoUSD = origemData.cotacao || 5.40;
      const coinPriceUSD = origemData.coinPriceUSD || 1;
      const valorUSD = isCrypto ? numVal / cotacaoUSD : null;
      const qtdCoin = isCrypto && valorUSD ? valorUSD / coinPriceUSD : null;

      // Resolver nomes de origem (parceiro/banco/wallet) para metadata rastreável
      let origemParceiroNome: string | null = null;
      let origemBancoNome: string | null = null;
      let origemWalletNome: string | null = null;

      if (origemData.origemParceiroId) {
        const { data: pData } = await supabase
          .from("parceiros")
          .select("nome")
          .eq("id", origemData.origemParceiroId)
          .maybeSingle();
        origemParceiroNome = (pData as any)?.nome || null;
      }
      if (origemData.origemContaBancariaId) {
        const { data: cbData } = await supabase
          .from("contas_bancarias")
          .select("banco")
          .eq("id", origemData.origemContaBancariaId)
          .maybeSingle();
        origemBancoNome = (cbData as any)?.banco || null;
      }
      if (origemData.origemWalletId) {
        const { data: wData } = await supabase
          .from("wallets_crypto")
          .select("nome, exchange")
          .eq("id", origemData.origemWalletId)
          .maybeSingle();
        origemWalletNome = (wData as any)?.nome || (wData as any)?.exchange || null;
      }

      // 1. Debitar da origem via cash_ledger (rastreamento real)
      const { data: cashLedgerInsert, error: ledgerError } = await supabase
        .from("cash_ledger")
        .insert({
          user_id: currentUser.id,
          workspace_id: workspaceId,
          tipo_transacao: "ALOCACAO_FORNECEDOR",
          tipo_moeda: origemData.tipoMoeda,
          moeda: isCrypto ? "BRL" : origemData.moeda,
          valor: numVal,
          coin: origemData.coin || null,
          qtd_coin: qtdCoin,
          valor_usd: valorUSD,
          cotacao: isCrypto ? cotacaoUSD : null,
          origem_tipo: origemData.origemTipo,
          origem_parceiro_id: origemData.origemParceiroId || null,
          origem_conta_bancaria_id: origemData.origemContaBancariaId || null,
          origem_wallet_id: origemData.origemWalletId || null,
          destino_tipo: "FORNECEDOR",
          destino_parceiro_id: selectedSupplier.parceiro_id || null,
          data_transacao: format(new Date(), "yyyy-MM-dd"),
          descricao: descricaoAlocacao || `Alocação de capital para fornecedor ${selectedSupplier.nome}`,
          status: "CONFIRMADO",
        })
        .select("id")
        .single();
      if (ledgerError) throw ledgerError;

      // 2. Create allocation record
      const { error: alErr } = await supabase.from("supplier_alocacoes").insert({
        parent_workspace_id: workspaceId,
        supplier_workspace_id: selectedSupplier.workspace_id,
        valor: numVal,
        valor_sugerido_deposito: null,
        descricao: descricaoAlocacao || null,
        created_by: currentUser.id,
      });
      if (alErr) throw alErr;

      // 3. Credit supplier ledger com metadata de origem rastreável
      const { data, error } = await supabase.rpc("supplier_ledger_insert", {
        p_supplier_workspace_id: selectedSupplier.workspace_id,
        p_bookmaker_account_id: null,
        p_tipo: "ALOCACAO",
        p_direcao: "CREDIT",
        p_valor: numVal,
        p_descricao: descricaoAlocacao || `Alocação de capital: ${formatCurrency(numVal)}`,
        p_metadata: {
          cash_ledger_id: cashLedgerInsert?.id,
          origem_tipo: origemData.origemTipo,
          origem_parceiro_id: origemData.origemParceiroId || null,
          origem_parceiro_nome: origemParceiroNome,
          origem_conta_bancaria_id: origemData.origemContaBancariaId || null,
          origem_banco_nome: origemBancoNome,
          origem_wallet_id: origemData.origemWalletId || null,
          origem_wallet_nome: origemWalletNome,
        },
        p_created_by: `ADMIN:${currentUser.id}`,
        p_idempotency_key: `ALOC_${selectedSupplier.workspace_id}_${Date.now()}`,
      });
      if (error) throw error;
      const result = data as any;
      if (!result?.success) throw new Error(result?.error || "Erro no ledger");
    },
    onSuccess: () => {
      toast.success("Capital alocado com sucesso");
      queryClient.invalidateQueries({ queryKey: ["admin-suppliers"] });
      queryClient.invalidateQueries({ queryKey: ["financeiro-data"] });
      setValorAlocacao("");
      
      setDescricaoAlocacao("");
      setOrigemData({ origemTipo: "CAIXA_OPERACIONAL", tipoMoeda: "FIAT", moeda: "BRL", saldoDisponivel: 0 });
      setAlocacaoOpen(false);
    },
    onError: (e: any) => toast.error(e.message),
  });

  // Generate access link
  const generateLinkMutation = useMutation({
    mutationFn: async () => {
      if (!selectedSupplier) throw new Error("Fornecedor não selecionado");

      const { data: session } = await supabase.auth.getSession();
      const token = session?.session?.access_token;
      if (!token) throw new Error("Não autenticado");

      const projectId = import.meta.env.VITE_SUPABASE_PROJECT_ID;
      const resp = await fetch(
        `https://${projectId}.supabase.co/functions/v1/supplier-auth?action=generate`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
            apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
          },
          body: JSON.stringify({
            supplier_profile_id: selectedSupplier.id,
            supplier_workspace_id: selectedSupplier.workspace_id,
            ttl_hours: parseInt(ttlHours) || 72,
            label: linkLabel || null,
          }),
        }
      );

      const data = await resp.json();
      if (!data.success) throw new Error(data.error || "Erro ao gerar link");

      // Build the production URL
      const origin = window.location.origin.replace("preview--", "");
      const fullUrl = `${origin}/portal/fornecedor?token=${data.token}`;

      return fullUrl;
    },
    onSuccess: (url) => {
      setGeneratedLink(url);
      queryClient.invalidateQueries({ queryKey: ["admin-suppliers"] });
      toast.success("Link gerado com sucesso");
    },
    onError: (e: any) => toast.error(e.message),
  });

  function copyLink() {
    if (generatedLink) {
      navigator.clipboard.writeText(generatedLink);
      toast.success("Link copiado!");
    }
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-foreground flex items-center gap-2">
            <Truck className="h-5 w-5 text-primary" />
            Portal do Fornecedor
          </h2>
          <p className="text-sm text-muted-foreground">
            Gerencie fornecedores, aloque capital e gere links de acesso
          </p>
        </div>
        <Button onClick={() => setNovoFornecedorOpen(true)} className="gap-1.5">
          <Plus className="h-4 w-4" /> Novo Fornecedor
        </Button>
      </div>


      {/* Suppliers list */}
      {suppliers.length === 0 ? (
        <Card>
          <CardContent className="py-16 text-center">
            <Truck className="h-12 w-12 text-muted-foreground/30 mx-auto mb-4" />
            <p className="text-muted-foreground">Nenhum fornecedor cadastrado</p>
            <Button variant="outline" className="mt-4" onClick={() => setNovoFornecedorOpen(true)}>
              Cadastrar primeiro fornecedor
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4">
          {suppliers.map((supplier: any) => {
            const totalAlocado = (supplier.supplier_alocacoes || [])
              .filter((a: any) => a.status === "ATIVO")
              .reduce((s: number, a: any) => s + Number(a.valor), 0);
            const activeTokens = (supplier.supplier_access_tokens || [])
              .filter((t: any) => !t.revoked_at && new Date(t.expires_at) > new Date());

            return (
              <div key={supplier.id} className="space-y-2">
              <Card className="hover:border-primary/20 transition-colors">
                <CardContent className="py-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
                        <Truck className="h-5 w-5 text-primary" />
                      </div>
                      <div>
                        <p className="font-medium text-foreground">{supplier.nome}</p>
                        <p className="text-xs text-muted-foreground">
                          {supplier.contato || "Sem contato"}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-6">
                      {/* KPIs */}
                      <div className="text-right">
                        <p className="text-xs text-muted-foreground">Capital Alocado</p>
                        <p className="text-sm font-semibold">{formatCurrency(totalAlocado)}</p>
                      </div>

                      <div className="text-right">
                        <p className="text-xs text-muted-foreground">Links Ativos</p>
                        <div className="flex items-center gap-1">
                          {activeTokens.length > 0 ? (
                            <Badge variant="outline" className="text-xs gap-1">
                              <CheckCircle2 className="h-3 w-3 text-success" />
                              {activeTokens.length}
                            </Badge>
                          ) : (
                            <Badge variant="outline" className="text-xs gap-1 text-muted-foreground">
                              <XCircle className="h-3 w-3" /> 0
                            </Badge>
                          )}
                        </div>
                      </div>

                      {/* Actions */}
                      <div className="flex items-center gap-1.5">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => setExtratoSupplierId(extratoSupplierId === supplier.workspace_id ? null : supplier.workspace_id)}
                          className="gap-1 text-xs"
                        >
                          <ScrollText className="h-3 w-3" /> Extrato
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => setTasksSupplier(tasksSupplier?.id === supplier.id ? null : supplier)}
                          className="gap-1 text-xs"
                        >
                          <ClipboardList className="h-3 w-3" /> Tarefas
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => {
                            setCasasConfigSupplier(supplier);
                            setCasasConfigOpen(true);
                          }}
                          className="gap-1 text-xs"
                        >
                          <Building2 className="h-3 w-3" /> Casas
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => {
                            setSelectedSupplier(supplier);
                            setAlocacaoOpen(true);
                          }}
                          className="gap-1 text-xs"
                        >
                          <Wallet className="h-3 w-3" /> Alocar
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => {
                            setSelectedSupplier(supplier);
                            setGeneratedLink(null);
                            setLinkOpen(true);
                          }}
                          className="gap-1 text-xs"
                        >
                          <Link2 className="h-3 w-3" /> Gerar Link
                        </Button>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Extrato inline panel */}
              {extratoSupplierId === supplier.workspace_id && (
                <div className="ml-4 border-l-2 border-primary/20 pl-4">
                  <Card className="bg-muted/20">
                    <CardContent className="py-4">
                      <SupplierExtratoInline supplierWorkspaceId={supplier.workspace_id} />
                    </CardContent>
                  </Card>
                </div>
              )}

              {/* Tasks panel for this supplier */}
              {tasksSupplier?.id === supplier.id && (
                <div className="ml-4 border-l-2 border-primary/20 pl-4">
                  <SupplierTasksAdmin
                    supplierWorkspaceId={supplier.workspace_id}
                    supplierNome={supplier.nome}
                    parentWorkspaceId={workspaceId}
                  />
                </div>
              )}
              </div>
            );
          })}
        </div>
      )}

      {/* Dialog: Ativar Fornecedor no Portal */}
      <Dialog open={novoFornecedorOpen} onOpenChange={(open) => {
        setNovoFornecedorOpen(open);
        if (!open) { setSelectedFornecedorId("new"); setNome(""); setContato(""); setObservacoes(""); setSupplierSearch(""); }
      }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Ativar Fornecedor no Portal</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            {/* Search */}
            {unlinkedFornecedores.length > 3 && (
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  value={supplierSearch}
                  onChange={e => setSupplierSearch(e.target.value)}
                  placeholder="Buscar por nome ou CPF..."
                  className="pl-9"
                />
              </div>
            )}

            {/* Supplier list */}
            {unlinkedFornecedores.length > 0 && (
              <>
                <Label className="text-xs text-muted-foreground uppercase tracking-wider">
                  Fornecedores da Captação ({unlinkedFornecedores.length})
                </Label>
                <ScrollArea className="max-h-[220px] -mx-1 px-1">
                  <div className="space-y-1">
                    {unlinkedFornecedores
                      .filter((f: any) => {
                        if (!supplierSearch) return true;
                        const q = supplierSearch.toLowerCase();
                        return f.nome?.toLowerCase().includes(q) || f.documento?.includes(q);
                      })
                      .sort((a: any, b: any) => a.nome.localeCompare(b.nome))
                      .map((f: any) => {
                        const isSelected = selectedFornecedorId === f.id;
                        return (
                          <button
                            key={f.id}
                            type="button"
                            onClick={() => setSelectedFornecedorId(f.id)}
                            className={`w-full flex items-center gap-3 rounded-lg px-3 py-2.5 text-left transition-colors
                              ${isSelected
                                ? "bg-primary/10 ring-1 ring-primary/30"
                                : "hover:bg-muted/50"
                              }`}
                          >
                            <div className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border transition-colors
                              ${isSelected ? "border-primary bg-primary text-primary-foreground" : "border-muted-foreground/30"}`}>
                              {isSelected && <Check className="h-3 w-3" />}
                            </div>
                            <div className="min-w-0 flex-1">
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <p className="text-sm font-semibold text-foreground truncate">
                                    {f.nome}
                                  </p>
                                </TooltipTrigger>
                                {f.nome.length > 30 && (
                                  <TooltipContent side="top">{f.nome}</TooltipContent>
                                )}
                              </Tooltip>
                              {f.documento && (
                                <p className="text-xs text-muted-foreground mt-0.5">{f.documento}</p>
                              )}
                            </div>
                          </button>
                        );
                      })}
                  </div>
                </ScrollArea>
                <Separator />
              </>
            )}

            {/* Create new option */}
            <button
              type="button"
              onClick={() => setSelectedFornecedorId("new")}
              className={`w-full flex items-center gap-3 rounded-lg px-3 py-2.5 text-left transition-colors
                ${selectedFornecedorId === "new"
                  ? "bg-primary/10 ring-1 ring-primary/30"
                  : "hover:bg-muted/50"
                }`}
            >
              <div className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border transition-colors
                ${selectedFornecedorId === "new" ? "border-primary bg-primary text-primary-foreground" : "border-muted-foreground/30"}`}>
                {selectedFornecedorId === "new" ? <Check className="h-3 w-3" /> : <Plus className="h-3 w-3" />}
              </div>
              <p className="text-sm font-medium text-foreground">Criar novo fornecedor</p>
            </button>

            {/* Form fields for new supplier */}
            {selectedFornecedorId === "new" && (
              <div className="space-y-3 pl-8">
                <div>
                  <Label>Nome *</Label>
                  <Input value={nome} onChange={e => setNome(e.target.value)} placeholder="Nome do fornecedor" />
                </div>
                <div>
                  <Label>Contato</Label>
                  <Input value={contato} onChange={e => setContato(e.target.value)} placeholder="Telefone, e-mail, etc." />
                </div>
                <div>
                  <Label>Observações</Label>
                  <Textarea value={observacoes} onChange={e => setObservacoes(e.target.value)} rows={2} />
                </div>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setNovoFornecedorOpen(false)}>Cancelar</Button>
            <Button
              onClick={() => createSupplierMutation.mutate()}
              disabled={(selectedFornecedorId === "new" && !nome.trim()) || createSupplierMutation.isPending}
            >
              {createSupplierMutation.isPending ? "Ativando..." : selectedFornecedorId === "new" ? "Criar e Ativar" : "Ativar no Portal"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog: Alocar Capital */}
      <Dialog open={alocacaoOpen} onOpenChange={setAlocacaoOpen}>
        <DialogContent className="sm:max-w-[500px] max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Wallet className="h-5 w-5 text-emerald-400" />
              Alocar Capital - {selectedSupplier?.nome}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            {/* Origem do Capital */}
            <OrigemPagamentoSelect
              value={origemData}
              onChange={setOrigemData}
              valorPagamento={valorAlocacaoNum}
              disabled={allocateMutation.isPending}
            />

            {/* Valor */}
            <div>
              <Label>Valor ({origemData.moeda}) *</Label>
              <Input type="number" step="0.01" value={valorAlocacao} onChange={e => setValorAlocacao(e.target.value)} placeholder="10000.00" />
            </div>


            {/* Descrição */}
            <div>
              <Label>Descrição</Label>
              <Textarea value={descricaoAlocacao} onChange={e => setDescricaoAlocacao(e.target.value)} rows={2} placeholder="Motivo da alocação" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAlocacaoOpen(false)}>Cancelar</Button>
            <Button
              onClick={() => allocateMutation.mutate()}
              disabled={!valorAlocacao || allocateMutation.isPending || isSaldoInsuficiente}
              title={isSaldoInsuficiente ? "Saldo insuficiente para realizar esta alocação" : undefined}
            >
              {allocateMutation.isPending ? "Alocando..." : "Alocar Capital"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog: Gerar Link */}
      <Dialog open={linkOpen} onOpenChange={setLinkOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Links de Acesso — {selectedSupplier?.nome}</DialogTitle>
          </DialogHeader>

          {/* Active links list */}
          {(() => {
            const activeTokens = (selectedSupplier?.supplier_access_tokens || [])
              .filter((t: any) => !t.revoked_at && new Date(t.expires_at) > new Date())
              .sort((a: any, b: any) => +new Date(a.expires_at) - +new Date(b.expires_at));

            const formatRemaining = (expiresAt: string) => {
              const diffMs = Math.max(0, +new Date(expiresAt) - Date.now());
              const hours = Math.floor(diffMs / 3_600_000);
              const minutes = Math.floor((diffMs % 3_600_000) / 60_000);
              if (hours >= 24) {
                const days = Math.floor(hours / 24);
                const remHours = hours % 24;
                return `${days}d ${remHours}h`;
              }
              return `${hours}h ${minutes}m`;
            };

            return activeTokens.length > 0 ? (
              <div className="space-y-2">
                <p className="text-xs text-muted-foreground font-medium">Links ativos ({activeTokens.length})</p>
                <div className="space-y-1.5 max-h-[200px] overflow-y-auto">
                  {activeTokens.map((token: any) => (
                    <div key={token.id} className="flex items-center justify-between gap-2 py-2 px-3 rounded-md bg-muted/30 border border-border/50">
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-medium text-foreground truncate">
                          {token.label || "Sem rótulo"}
                        </p>
                        <div className="flex items-center gap-2 text-[10px] text-muted-foreground mt-0.5">
                          <span className="flex items-center gap-1">
                            <Clock className="h-2.5 w-2.5" />
                            {formatRemaining(token.expires_at)} restantes
                          </span>
                          {token.use_count > 0 && (
                            <span>{token.use_count}x usado</span>
                          )}
                          {token.last_used_at && (
                            <span>Último: {format(new Date(token.last_used_at), "dd/MM HH:mm")}</span>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-1">
                        {token.token_plain && (
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-7 px-2 text-[10px] gap-1"
                            onClick={() => {
                              const origin = window.location.origin.replace("preview--", "");
                              const url = `${origin}/portal/fornecedor?token=${token.token_plain}`;
                              navigator.clipboard.writeText(url);
                              toast.success("Link copiado!");
                            }}
                          >
                            <Copy className="h-3 w-3" /> Copiar
                          </Button>
                        )}
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-7 px-2 text-[10px] gap-1"
                          onClick={async () => {
                            const hoursStr = prompt("Nova duração em horas (a partir de agora):", "72");
                            if (!hoursStr) return;
                            const hours = parseInt(hoursStr);
                            if (isNaN(hours) || hours <= 0) { toast.error("Valor inválido"); return; }
                            const newExpiry = new Date(Date.now() + hours * 3_600_000).toISOString();
                            const { error } = await supabase
                              .from("supplier_access_tokens")
                              .update({ expires_at: newExpiry })
                              .eq("id", token.id);
                            if (error) { toast.error("Erro ao renovar"); return; }
                            toast.success(`Renovado por ${hours}h`);
                            queryClient.invalidateQueries({ queryKey: ["admin-suppliers"] });
                          }}
                        >
                          <RefreshCw className="h-3 w-3" /> Renovar
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-7 px-2 text-[10px] text-destructive hover:text-destructive gap-1"
                          onClick={async () => {
                            const { error } = await supabase
                              .from("supplier_access_tokens")
                              .update({ revoked_at: new Date().toISOString() })
                              .eq("id", token.id);
                            if (error) { toast.error("Erro ao revogar"); return; }
                            toast.success("Link revogado");
                            queryClient.invalidateQueries({ queryKey: ["admin-suppliers"] });
                          }}
                        >
                          <XCircle className="h-3 w-3" /> Revogar
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
                <div className="border-t border-border pt-3 mt-3" />
              </div>
            ) : null;
          })()}

          {generatedLink ? (
            <div className="space-y-4">
              <div className="bg-muted p-3 rounded-lg">
                <p className="text-xs text-muted-foreground mb-1">Link gerado:</p>
                <p className="text-sm font-mono break-all text-foreground">{generatedLink}</p>
              </div>
              <div className="flex gap-2">
                <Button onClick={copyLink} className="flex-1 gap-1.5">
                  <Copy className="h-4 w-4" /> Copiar Link
                </Button>
                <Button variant="outline" onClick={() => window.open(generatedLink, "_blank")} className="gap-1.5">
                  <ExternalLink className="h-4 w-4" />
                </Button>
              </div>
              <p className="text-xs text-muted-foreground text-center">
                ⚠️ Este link dá acesso ao portal. Compartilhe apenas com o fornecedor.
              </p>
            </div>
          ) : (
            <>
              <div className="space-y-3">
                <p className="text-xs text-muted-foreground">Gerar novo link de acesso</p>
                <div>
                  <Label>Validade (horas)</Label>
                  <Input type="number" value={ttlHours} onChange={e => setTtlHours(e.target.value)} />
                  <p className="text-xs text-muted-foreground mt-1">
                    Padrão: 72h (3 dias). Máximo recomendado: 168h (7 dias).
                  </p>
                </div>
                <div>
                  <Label>Rótulo (opcional)</Label>
                  <Input value={linkLabel} onChange={e => setLinkLabel(e.target.value)} placeholder="Ex: Acesso março 2026" />
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setLinkOpen(false)}>Cancelar</Button>
                <Button onClick={() => generateLinkMutation.mutate()} disabled={generateLinkMutation.isPending}>
                  {generateLinkMutation.isPending ? "Gerando..." : "Gerar Link"}
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
      {/* Dialog: Casas Permitidas */}
      {casasConfigSupplier && (
        <SupplierBookmakerConfigDialog
          open={casasConfigOpen}
          onOpenChange={setCasasConfigOpen}
          supplierWorkspaceId={casasConfigSupplier.workspace_id}
          supplierNome={casasConfigSupplier.nome}
          parentWorkspaceId={workspaceId}
        />
      )}
    </div>
  );
}
