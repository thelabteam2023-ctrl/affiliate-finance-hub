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
import { Plus, Search, Edit, Trash2, LogOut, LayoutGrid, List } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";

interface Banco {
  id: string;
  codigo: string;
  nome: string;
  is_system: boolean;
}

export default function GestaoBancos() {
  const [bancos, setBancos] = useState<Banco[]>([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingBanco, setEditingBanco] = useState<Banco | null>(null);
  const [codigo, setCodigo] = useState("");
  const [nome, setNome] = useState("");
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
    setDialogOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Usuário não autenticado");

      if (editingBanco) {
        const { error } = await supabase
          .from("bancos")
          .update({ codigo, nome })
          .eq("id", editingBanco.id);

        if (error) throw error;
        toast({ title: "Banco atualizado com sucesso" });
      } else {
        if (!workspaceId) throw new Error("Workspace não definido");
        const { error } = await supabase.from("bancos").insert({
          codigo,
          nome,
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
    fetchBancos();
  };

  const filteredBancos = bancos.filter(
    (banco) =>
      banco.nome.toLowerCase().includes(searchTerm.toLowerCase()) ||
      banco.codigo.includes(searchTerm)
  );

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
                    {banco.is_system && (
                      <Badge variant="secondary">Sistema</Badge>
                    )}
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
                        className="flex-1 text-red-600 hover:text-red-700"
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
                            className="text-red-600 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-950"
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
            <div>
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
