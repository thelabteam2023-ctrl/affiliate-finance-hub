import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useWorkspace } from "@/hooks/useWorkspace";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { Plus, Search, Edit, Trash2, LogOut, LayoutGrid, List, Percent, DollarSign } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

type TaxaTipo = "percentual" | "fixo" | null;

interface Banco {
  id: string;
  codigo: string;
  nome: string;
  is_system: boolean;
  taxa_deposito_tipo: TaxaTipo;
  taxa_deposito_valor: number | null;
  taxa_saque_tipo: TaxaTipo;
  taxa_saque_valor: number | null;
  taxa_moeda: string | null;
}

const MOEDAS = [
  { value: "BRL", label: "BRL" },
  { value: "USD", label: "USD" },
  { value: "EUR", label: "EUR" },
  { value: "GBP", label: "GBP" },
  { value: "MXN", label: "MXN" },
  { value: "MYR", label: "MYR" },
  { value: "ARS", label: "ARS" },
  { value: "COP", label: "COP" },
];

export default function GestaoBancos() {
  const [bancos, setBancos] = useState<Banco[]>([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingBanco, setEditingBanco] = useState<Banco | null>(null);
  const [codigo, setCodigo] = useState("");
  const [nome, setNome] = useState("");
  // Deposit fee
  const [taxaDepositoTipo, setTaxaDepositoTipo] = useState<string>("");
  const [taxaDepositoValor, setTaxaDepositoValor] = useState("");
  // Withdrawal fee
  const [taxaSaqueTipo, setTaxaSaqueTipo] = useState<string>("");
  const [taxaSaqueValor, setTaxaSaqueValor] = useState("");
  // Currency for fixed fees
  const [taxaMoeda, setTaxaMoeda] = useState("BRL");
  const [saving, setSaving] = useState(false);
  const [viewMode, setViewMode] = useState<"cards" | "list">("cards");
  const navigate = useNavigate();
  const { toast } = useToast();
  const { signOut } = useAuth();
  const { workspaceId } = useWorkspace();

  useEffect(() => {
    checkAuth();
    fetchBancos();
  }, []);

  const checkAuth = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) navigate("/auth");
  };

  const fetchBancos = async () => {
    try {
      const { data, error } = await supabase
        .from("bancos")
        .select("*")
        .order("nome");
      if (error) throw error;
      setBancos(
        (data || []).map((b: any) => ({
          id: b.id,
          codigo: b.codigo,
          nome: b.nome,
          is_system: b.is_system ?? false,
          taxa_deposito_tipo: b.taxa_deposito_tipo as TaxaTipo,
          taxa_deposito_valor: b.taxa_deposito_valor,
          taxa_saque_tipo: b.taxa_saque_tipo as TaxaTipo,
          taxa_saque_valor: b.taxa_saque_valor,
          taxa_moeda: b.taxa_moeda,
        }))
      );
    } catch (error: any) {
      toast({ title: "Erro ao carregar bancos", description: error.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = async () => {
    await signOut();
    navigate("/auth");
  };

  const handleDelete = async (id: string, isSystem: boolean) => {
    if (isSystem) {
      toast({ title: "Ação não permitida", description: "Bancos do sistema não podem ser excluídos.", variant: "destructive" });
      return;
    }
    if (!confirm("Tem certeza que deseja excluir este banco?")) return;
    try {
      const { error } = await supabase.from("bancos").delete().eq("id", id);
      if (error) throw error;
      toast({ title: "Banco excluído", description: "O banco foi removido com sucesso." });
      fetchBancos();
    } catch (error: any) {
      toast({ title: "Erro ao excluir banco", description: error.message, variant: "destructive" });
    }
  };

  const handleEdit = (banco: Banco) => {
    if (banco.is_system) {
      toast({ title: "Ação não permitida", description: "Bancos do sistema não podem ser editados.", variant: "destructive" });
      return;
    }
    setEditingBanco(banco);
    setCodigo(banco.codigo);
    setNome(banco.nome);
    setTaxaDepositoTipo(banco.taxa_deposito_tipo ?? "");
    setTaxaDepositoValor(banco.taxa_deposito_valor != null ? String(banco.taxa_deposito_valor) : "");
    setTaxaSaqueTipo(banco.taxa_saque_tipo ?? "");
    setTaxaSaqueValor(banco.taxa_saque_valor != null ? String(banco.taxa_saque_valor) : "");
    setTaxaMoeda(banco.taxa_moeda ?? "BRL");
    setDialogOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);

    // Validate: if tipo is set, valor must be set too
    if (taxaDepositoTipo && !taxaDepositoValor) {
      toast({ title: "Taxa de depósito incompleta", description: "Informe o valor da taxa de depósito.", variant: "destructive" });
      setSaving(false);
      return;
    }
    if (taxaSaqueTipo && !taxaSaqueValor) {
      toast({ title: "Taxa de saque incompleta", description: "Informe o valor da taxa de saque.", variant: "destructive" });
      setSaving(false);
      return;
    }
    // Validate: se tem valor fixo em qualquer lado, moeda é obrigatória
    const hasFixo = taxaDepositoTipo === "fixo" || taxaSaqueTipo === "fixo";
    if (hasFixo && !taxaMoeda) {
      toast({ title: "Moeda da taxa fixa necessária", description: "Selecione a moeda para taxas com valor fixo.", variant: "destructive" });
      setSaving(false);
      return;
    }

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Usuário não autenticado");

      const payload: any = {
        codigo,
        nome,
        taxa_deposito_tipo: taxaDepositoTipo || null,
        taxa_deposito_valor: taxaDepositoValor ? parseFloat(taxaDepositoValor) : null,
        taxa_saque_tipo: taxaSaqueTipo || null,
        taxa_saque_valor: taxaSaqueValor ? parseFloat(taxaSaqueValor) : null,
        taxa_moeda: hasFixo ? taxaMoeda : null,
      };

      if (editingBanco) {
        const { error } = await supabase.from("bancos").update(payload).eq("id", editingBanco.id);
        if (error) throw error;
        toast({ title: "Banco atualizado com sucesso" });
      } else {
        if (!workspaceId) throw new Error("Workspace não definido");
        const { error } = await supabase.from("bancos").insert({
          ...payload,
          user_id: user.id,
          is_system: false,
          workspace_id: workspaceId,
        });
        if (error) throw error;
        toast({ title: "Banco criado com sucesso" });
      }

      handleDialogClose();
    } catch (error: any) {
      toast({ title: "Erro ao salvar banco", description: error.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const handleDialogClose = () => {
    setDialogOpen(false);
    setEditingBanco(null);
    setCodigo("");
    setNome("");
    setTaxaDepositoTipo("");
    setTaxaDepositoValor("");
    setTaxaSaqueTipo("");
    setTaxaSaqueValor("");
    setTaxaMoeda("BRL");
    fetchBancos();
  };

  const filteredBancos = bancos.filter(
    (banco) =>
      banco.nome.toLowerCase().includes(searchTerm.toLowerCase()) ||
      banco.codigo.includes(searchTerm)
  );

  const formatTaxaLabel = (tipo: TaxaTipo, valor: number | null, moeda: string | null, label: string) => {
    if (!tipo || valor == null) return null;
    if (tipo === "percentual") return `${valor}% ${label}`;
    return `${moeda ?? "BRL"} ${valor} ${label}`;
  };

  const getTaxaBadges = (banco: Banco) => {
    const badges: string[] = [];
    const dep = formatTaxaLabel(banco.taxa_deposito_tipo, banco.taxa_deposito_valor, banco.taxa_moeda, "no depósito");
    const saq = formatTaxaLabel(banco.taxa_saque_tipo, banco.taxa_saque_valor, banco.taxa_moeda, "no saque");
    if (dep) badges.push(dep);
    if (saq) badges.push(saq);
    return badges;
  };

  // Taxa field section component
  const TaxaSection = ({
    label,
    tipo,
    setTipo,
    valor,
    setValor,
  }: {
    label: string;
    tipo: string;
    setTipo: (v: string) => void;
    valor: string;
    setValor: (v: string) => void;
  }) => (
    <div className="space-y-2">
      <p className="text-sm font-medium text-foreground">{label}</p>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label className="text-xs text-muted-foreground">Tipo de cobrança</Label>
          <Select value={tipo} onValueChange={setTipo} disabled={saving}>
            <SelectTrigger>
              <SelectValue placeholder="Sem taxa" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">Sem taxa</SelectItem>
              <SelectItem value="percentual">Percentual (%)</SelectItem>
              <SelectItem value="fixo">Valor fixo</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label className="text-xs text-muted-foreground">
            {tipo === "percentual" ? "Percentual (%)" : tipo === "fixo" ? "Valor fixo" : "Valor"}
          </Label>
          <Input
            type="number"
            step="0.01"
            min="0"
            value={valor}
            onChange={(e) => setValor(e.target.value)}
            placeholder={tipo === "percentual" ? "Ex: 5.00" : "Ex: 5.00"}
            disabled={saving || !tipo || tipo === "none"}
          />
        </div>
      </div>
      {tipo && tipo !== "none" && valor && (
        <p className="text-xs text-muted-foreground">
          Será cobrado{" "}
          {tipo === "percentual"
            ? <><strong>{valor}%</strong> sobre o valor</>
            : <><strong>{taxaMoeda} {valor}</strong> fixo</>
          }{" "}
          {label.toLowerCase()}.
        </p>
      )}
    </div>
  );

  const hasFixo = taxaDepositoTipo === "fixo" || taxaSaqueTipo === "fixo";

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-muted-foreground">Carregando...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto px-4 py-8">
        <div className="flex justify-between items-center mb-8">
          <div>
            <h1 className="text-4xl font-bold">Gestão de Bancos</h1>
            <p className="text-muted-foreground mt-2">
              Gerencie os bancos disponíveis no sistema
            </p>
          </div>
          <Button onClick={handleLogout} variant="outline">
            <LogOut className="mr-2 h-4 w-4" />
            Sair
          </Button>
        </div>

        {/* Toolbar */}
        <Card className="mb-6">
          <CardContent className="pt-6">
            <div className="flex flex-col md:flex-row gap-4">
              <div className="flex-1 relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground h-4 w-4" />
                <Input
                  placeholder="Buscar por nome ou código..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10"
                />
              </div>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="icon"
                  onClick={() => setViewMode(viewMode === "cards" ? "list" : "cards")}
                >
                  {viewMode === "cards" ? <List className="h-4 w-4" /> : <LayoutGrid className="h-4 w-4" />}
                </Button>
                <Button onClick={() => setDialogOpen(true)}>
                  <Plus className="mr-2 h-4 w-4" />
                  Novo Banco
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Bancos Display */}
        {filteredBancos.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center">
              <p className="text-muted-foreground">Nenhum banco encontrado.</p>
            </CardContent>
          </Card>
        ) : viewMode === "cards" ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {filteredBancos.map((banco) => {
              const taxaBadges = getTaxaBadges(banco);
              return (
                <Card key={banco.id} className="hover:shadow-lg transition-shadow">
                  <CardHeader>
                    <div className="flex justify-between items-start">
                      <div>
                        <CardTitle className="text-xl">{banco.nome}</CardTitle>
                        <p className="text-sm text-muted-foreground mt-1">
                          Código: {banco.codigo}
                        </p>
                      </div>
                      <div className="flex flex-col gap-1 items-end">
                        {banco.is_system && (
                          <Badge variant="secondary">Sistema</Badge>
                        )}
                        {taxaBadges.map((badge, i) => (
                          <Badge key={i} variant="outline" className="text-xs gap-1">
                            {banco.taxa_deposito_tipo === "fixo" || banco.taxa_saque_tipo === "fixo"
                              ? <DollarSign className="h-3 w-3" />
                              : <Percent className="h-3 w-3" />
                            }
                            {badge}
                          </Badge>
                        ))}
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent>
                    {!banco.is_system && (
                      <div className="flex gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          className="flex-1"
                          onClick={() => handleEdit(banco)}
                        >
                          <Edit className="mr-1 h-4 w-4" />
                          Editar
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          className="flex-1 text-destructive hover:text-destructive"
                          onClick={() => handleDelete(banco.id, banco.is_system)}
                        >
                          <Trash2 className="mr-1 h-4 w-4" />
                          Excluir
                        </Button>
                      </div>
                    )}
                  </CardContent>
                </Card>
              );
            })}
          </div>
        ) : (
          <Card>
            <CardContent className="p-0">
              <div className="space-y-1">
                {filteredBancos.map((banco, index) => {
                  const taxaBadges = getTaxaBadges(banco);
                  return (
                    <div
                      key={banco.id}
                      className={`p-4 hover:bg-accent/5 transition-colors ${
                        index !== filteredBancos.length - 1 ? "border-b border-border/50" : ""
                      }`}
                    >
                      <div className="flex items-center justify-between gap-4">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-3 flex-wrap">
                            <div>
                              <h3 className="font-medium text-base">{banco.nome}</h3>
                              <p className="text-sm text-muted-foreground">
                                Código: {banco.codigo}
                              </p>
                            </div>
                            {banco.is_system && (
                              <Badge variant="secondary" className="ml-2">
                                Sistema
                              </Badge>
                            )}
                            {taxaBadges.map((badge, i) => (
                              <Badge key={i} variant="outline" className="text-xs gap-1">
                                {banco.taxa_deposito_tipo === "fixo" || banco.taxa_saque_tipo === "fixo"
                                  ? <DollarSign className="h-3 w-3" />
                                  : <Percent className="h-3 w-3" />
                                }
                                {badge}
                              </Badge>
                            ))}
                          </div>
                        </div>
                        {!banco.is_system && (
                          <div className="flex gap-2">
                            <Button variant="ghost" size="sm" onClick={() => handleEdit(banco)}>
                              <Edit className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleDelete(banco.id, banco.is_system)}
                              className="text-destructive hover:text-destructive hover:bg-destructive/10"
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Dialog */}
      <Dialog open={dialogOpen} onOpenChange={handleDialogClose}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>
              {editingBanco ? "Editar Banco" : "Novo Banco"}
            </DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-5">
            {/* Basic info */}
            <div className="grid grid-cols-3 gap-3">
              <div>
                <Label htmlFor="codigo">Código *</Label>
                <Input
                  id="codigo"
                  value={codigo}
                  onChange={(e) => setCodigo(e.target.value)}
                  placeholder="000"
                  required
                  disabled={saving}
                />
              </div>
              <div className="col-span-2">
                <Label htmlFor="nome">Nome *</Label>
                <Input
                  id="nome"
                  value={nome}
                  onChange={(e) => setNome(e.target.value)}
                  placeholder="Nome do banco"
                  required
                  disabled={saving}
                />
              </div>
            </div>

            {/* Fee section */}
            <div className="border border-border rounded-lg p-4 space-y-4">
              <p className="text-sm font-semibold flex items-center gap-2">
                <DollarSign className="h-4 w-4 text-muted-foreground" />
                Taxas de cobrança{" "}
                <span className="text-muted-foreground font-normal">(opcional)</span>
              </p>

              <TaxaSection
                label="Taxa no Depósito (ao receber)"
                tipo={taxaDepositoTipo}
                setTipo={(v) => {
                  setTaxaDepositoTipo(v === "none" ? "" : v);
                  if (v === "none") setTaxaDepositoValor("");
                }}
                valor={taxaDepositoValor}
                setValor={setTaxaDepositoValor}
              />

              <div className="border-t border-border/50" />

              <TaxaSection
                label="Taxa no Saque (ao enviar)"
                tipo={taxaSaqueTipo}
                setTipo={(v) => {
                  setTaxaSaqueTipo(v === "none" ? "" : v);
                  if (v === "none") setTaxaSaqueValor("");
                }}
                valor={taxaSaqueValor}
                setValor={setTaxaSaqueValor}
              />

              {/* Moeda (shown only when there's a fixed fee) */}
              {hasFixo && (
                <div>
                  <Label>Moeda das taxas fixas</Label>
                  <Select value={taxaMoeda} onValueChange={setTaxaMoeda} disabled={saving}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {MOEDAS.map((m) => (
                        <SelectItem key={m.value} value={m.value}>
                          {m.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
            </div>

            <div className="flex justify-end gap-3">
              <Button type="button" variant="outline" onClick={handleDialogClose} disabled={saving}>
                Cancelar
              </Button>
              <Button type="submit" disabled={saving}>
                {saving ? "Salvando..." : "Salvar"}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
