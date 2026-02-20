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
import { Plus, Search, Edit, Trash2, LogOut, LayoutGrid, List, Percent } from "lucide-react";
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

interface Banco {
  id: string;
  codigo: string;
  nome: string;
  is_system: boolean;
  taxa_percentual: number | null;
  taxa_incidencia: string | null;
}

export default function GestaoBancos() {
  const [bancos, setBancos] = useState<Banco[]>([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingBanco, setEditingBanco] = useState<Banco | null>(null);
  const [codigo, setCodigo] = useState("");
  const [nome, setNome] = useState("");
  const [taxaPercentual, setTaxaPercentual] = useState("");
  const [taxaIncidencia, setTaxaIncidencia] = useState<string>("");
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
    if (!session) {
      navigate("/auth");
    }
  };

  const fetchBancos = async () => {
    try {
      const { data, error } = await supabase
        .from("bancos")
        .select("*")
        .order("nome");

      if (error) throw error;
      setBancos(data || []);
    } catch (error: any) {
      toast({
        title: "Erro ao carregar bancos",
        description: error.message,
        variant: "destructive",
      });
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
      toast({
        title: "Ação não permitida",
        description: "Bancos do sistema não podem ser excluídos.",
        variant: "destructive",
      });
      return;
    }

    if (!confirm("Tem certeza que deseja excluir este banco?")) return;

    try {
      const { error } = await supabase.from("bancos").delete().eq("id", id);
      if (error) throw error;

      toast({
        title: "Banco excluído",
        description: "O banco foi removido com sucesso.",
      });
      fetchBancos();
    } catch (error: any) {
      toast({
        title: "Erro ao excluir banco",
        description: error.message,
        variant: "destructive",
      });
    }
  };

  const handleEdit = (banco: Banco) => {
    if (banco.is_system) {
      toast({
        title: "Ação não permitida",
        description: "Bancos do sistema não podem ser editados.",
        variant: "destructive",
      });
      return;
    }
    setEditingBanco(banco);
    setCodigo(banco.codigo);
    setNome(banco.nome);
    setTaxaPercentual(banco.taxa_percentual != null ? String(banco.taxa_percentual) : "");
    setTaxaIncidencia(banco.taxa_incidencia ?? "");
    setDialogOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);

    // Validate: if one taxa field is filled, the other must be too
    const hasTaxa = taxaPercentual !== "";
    const hasIncidencia = taxaIncidencia !== "";
    if (hasTaxa !== hasIncidencia) {
      toast({
        title: "Campos de taxa incompletos",
        description: "Preencha tanto a porcentagem quanto o momento de cobrança, ou deixe ambos em branco.",
        variant: "destructive",
      });
      setSaving(false);
      return;
    }

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Usuário não autenticado");

      const payload: any = {
        codigo,
        nome,
        taxa_percentual: taxaPercentual !== "" ? parseFloat(taxaPercentual) : null,
        taxa_incidencia: hasIncidencia ? taxaIncidencia : null,
      };

      if (editingBanco) {
        const { error } = await supabase
          .from("bancos")
          .update(payload)
          .eq("id", editingBanco.id);

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
      toast({
        title: "Erro ao salvar banco",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  const handleDialogClose = () => {
    setDialogOpen(false);
    setEditingBanco(null);
    setCodigo("");
    setNome("");
    setTaxaPercentual("");
    setTaxaIncidencia("");
    fetchBancos();
  };

  const filteredBancos = bancos.filter(
    (banco) =>
      banco.nome.toLowerCase().includes(searchTerm.toLowerCase()) ||
      banco.codigo.includes(searchTerm)
  );

  const taxaLabel = (banco: Banco) => {
    if (!banco.taxa_percentual) return null;
    const quando = banco.taxa_incidencia === "deposito" ? "no depósito" : "no saque";
    return `${banco.taxa_percentual}% ${quando}`;
  };

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
            {filteredBancos.map((banco) => (
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
                      {taxaLabel(banco) && (
                        <Badge variant="outline" className="text-xs gap-1">
                          <Percent className="h-3 w-3" />
                          {taxaLabel(banco)}
                        </Badge>
                      )}
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
            ))}
          </div>
        ) : (
          <Card>
            <CardContent className="p-0">
              <div className="space-y-1">
                {filteredBancos.map((banco, index) => (
                  <div
                    key={banco.id}
                    className={`p-4 hover:bg-accent/5 transition-colors ${
                      index !== filteredBancos.length - 1 ? "border-b border-border/50" : ""
                    }`}
                  >
                    <div className="flex items-center justify-between gap-4">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-3">
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
                          {taxaLabel(banco) && (
                            <Badge variant="outline" className="text-xs gap-1">
                              <Percent className="h-3 w-3" />
                              {taxaLabel(banco)}
                            </Badge>
                          )}
                        </div>
                      </div>
                      {!banco.is_system && (
                        <div className="flex gap-2">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleEdit(banco)}
                          >
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
                ))}
              </div>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Dialog */}
      <Dialog open={dialogOpen} onOpenChange={handleDialogClose}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {editingBanco ? "Editar Banco" : "Novo Banco"}
            </DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
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

            {/* Taxa section */}
            <div className="border border-border rounded-lg p-4 space-y-3">
              <p className="text-sm font-medium flex items-center gap-2">
                <Percent className="h-4 w-4 text-muted-foreground" />
                Taxa de cobrança <span className="text-muted-foreground font-normal">(opcional)</span>
              </p>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label htmlFor="taxa_percentual">Percentual (%)</Label>
                  <Input
                    id="taxa_percentual"
                    type="number"
                    step="0.01"
                    min="0"
                    max="100"
                    value={taxaPercentual}
                    onChange={(e) => setTaxaPercentual(e.target.value)}
                    placeholder="Ex: 5.00"
                    disabled={saving}
                  />
                </div>
                <div>
                  <Label htmlFor="taxa_incidencia">Quando é cobrada</Label>
                  <Select
                    value={taxaIncidencia}
                    onValueChange={setTaxaIncidencia}
                    disabled={saving}
                  >
                    <SelectTrigger id="taxa_incidencia">
                      <SelectValue placeholder="Selecione..." />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="deposito">Ao receber (depósito)</SelectItem>
                      <SelectItem value="saque">Ao enviar (saque)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              {taxaPercentual && taxaIncidencia && (
                <p className="text-xs text-muted-foreground">
                  Uma taxa de <strong>{taxaPercentual}%</strong> será cobrada{" "}
                  {taxaIncidencia === "deposito" ? "ao receber transações (depósito)" : "ao enviar transações (saque)"}.
                </p>
              )}
            </div>

            <div className="flex justify-end gap-3">
              <Button
                type="button"
                variant="outline"
                onClick={handleDialogClose}
                disabled={saving}
              >
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
