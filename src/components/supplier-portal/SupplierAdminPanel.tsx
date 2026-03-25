import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
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
  Building2, Users, Clock, CheckCircle2, XCircle
} from "lucide-react";
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

  // Form state - Novo Fornecedor
  const [nome, setNome] = useState("");
  const [contato, setContato] = useState("");
  const [observacoes, setObservacoes] = useState("");

  // Form state - Alocação
  const [valorAlocacao, setValorAlocacao] = useState("");
  const [valorSugerido, setValorSugerido] = useState("");
  const [descricaoAlocacao, setDescricaoAlocacao] = useState("");

  // Form state - Link
  const [ttlHours, setTtlHours] = useState("72");
  const [linkLabel, setLinkLabel] = useState("");

  // Fetch suppliers
  const { data: suppliers = [] } = useQuery({
    queryKey: ["admin-suppliers", workspaceId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("supplier_profiles")
        .select("*, supplier_alocacoes(valor, status, created_at), supplier_access_tokens(id, expires_at, revoked_at, use_count, last_used_at, label)")
        .eq("parent_workspace_id", workspaceId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data || [];
    },
  });

  // Create supplier
  const createSupplierMutation = useMutation({
    mutationFn: async () => {
      if (!nome.trim()) throw new Error("Nome é obrigatório");
      if (!user?.id) throw new Error("Usuário não autenticado");

      // 1. Create workspace for supplier
      const { data: ws, error: wsError } = await supabase
        .from("workspaces")
        .insert({
          name: `Fornecedor: ${nome}`,
          owner_id: user.id,
          parent_workspace_id: workspaceId,
          tipo: "fornecedor",
        })
        .select("id")
        .single();

      if (wsError) throw wsError;

      // 2. Create supplier profile
      const { error: spError } = await supabase.from("supplier_profiles").insert({
        workspace_id: ws.id,
        parent_workspace_id: workspaceId,
        nome,
        contato: contato || null,
        observacoes: observacoes || null,
        created_by: user.id,
      });

      if (spError) throw spError;
    },
    onSuccess: () => {
      toast.success("Fornecedor criado");
      queryClient.invalidateQueries({ queryKey: ["admin-suppliers"] });
      setNome("");
      setContato("");
      setObservacoes("");
      setNovoFornecedorOpen(false);
    },
    onError: (e: any) => toast.error(e.message),
  });

  // Allocate capital
  const allocateMutation = useMutation({
    mutationFn: async () => {
      if (!selectedSupplier || !valorAlocacao) throw new Error("Dados incompletos");
      const numVal = parseFloat(valorAlocacao);
      if (!numVal || numVal <= 0) throw new Error("Valor inválido");

      // 1. Create allocation record
      const { error: alErr } = await supabase.from("supplier_alocacoes").insert({
        parent_workspace_id: workspaceId,
        supplier_workspace_id: selectedSupplier.workspace_id,
        valor: numVal,
        valor_sugerido_deposito: valorSugerido ? parseFloat(valorSugerido) : null,
        descricao: descricaoAlocacao || null,
        created_by: user!.id,
      });
      if (alErr) throw alErr;

      // 2. Record in ledger
      const { data, error } = await supabase.rpc("supplier_ledger_insert", {
        p_supplier_workspace_id: selectedSupplier.workspace_id,
        p_bookmaker_account_id: null,
        p_tipo: "ALOCACAO",
        p_direcao: "CREDIT",
        p_valor: numVal,
        p_descricao: descricaoAlocacao || `Alocação de capital: ${formatCurrency(numVal)}`,
        p_created_by: `ADMIN:${user!.id}`,
        p_idempotency_key: `ALOC_${selectedSupplier.workspace_id}_${Date.now()}`,
      });
      if (error) throw error;
      const result = data as any;
      if (!result?.success) throw new Error(result?.error || "Erro no ledger");
    },
    onSuccess: () => {
      toast.success("Capital alocado com sucesso");
      queryClient.invalidateQueries({ queryKey: ["admin-suppliers"] });
      setValorAlocacao("");
      setValorSugerido("");
      setDescricaoAlocacao("");
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
              <Card key={supplier.id} className="hover:border-primary/20 transition-colors">
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
            );
          })}
        </div>
      )}

      {/* Dialog: Novo Fornecedor */}
      <Dialog open={novoFornecedorOpen} onOpenChange={setNovoFornecedorOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Novo Fornecedor</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
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
          <DialogFooter>
            <Button variant="outline" onClick={() => setNovoFornecedorOpen(false)}>Cancelar</Button>
            <Button onClick={() => createSupplierMutation.mutate()} disabled={!nome.trim() || createSupplierMutation.isPending}>
              {createSupplierMutation.isPending ? "Criando..." : "Criar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog: Alocar Capital */}
      <Dialog open={alocacaoOpen} onOpenChange={setAlocacaoOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Alocar Capital - {selectedSupplier?.nome}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Valor (R$) *</Label>
              <Input type="number" step="0.01" value={valorAlocacao} onChange={e => setValorAlocacao(e.target.value)} placeholder="10000.00" />
            </div>
            <div>
              <Label>Valor Sugerido por Depósito</Label>
              <Input type="number" step="0.01" value={valorSugerido} onChange={e => setValorSugerido(e.target.value)} placeholder="1000.00 (opcional)" />
              <p className="text-xs text-muted-foreground mt-1">O fornecedor verá essa sugestão ao fazer depósitos</p>
            </div>
            <div>
              <Label>Descrição</Label>
              <Textarea value={descricaoAlocacao} onChange={e => setDescricaoAlocacao(e.target.value)} rows={2} placeholder="Motivo da alocação" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAlocacaoOpen(false)}>Cancelar</Button>
            <Button onClick={() => allocateMutation.mutate()} disabled={!valorAlocacao || allocateMutation.isPending}>
              {allocateMutation.isPending ? "Alocando..." : "Alocar Capital"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog: Gerar Link */}
      <Dialog open={linkOpen} onOpenChange={setLinkOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Gerar Link de Acesso - {selectedSupplier?.nome}</DialogTitle>
          </DialogHeader>

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
    </div>
  );
}
