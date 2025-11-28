import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { Plus, Search, LogOut, Eye, EyeOff, Edit, Trash2 } from "lucide-react";
import Header from "@/components/Header";
import ParceiroDialog from "@/components/parceiros/ParceiroDialog";

interface Parceiro {
  id: string;
  nome: string;
  cpf: string;
  email: string | null;
  telefone: string | null;
  status: string;
  created_at: string;
  contas_bancarias: any[];
  wallets_crypto: any[];
}

export default function GestaoParceiros() {
  const [parceiros, setParceiros] = useState<Parceiro[]>([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState("todos");
  const [showCPF, setShowCPF] = useState(false);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingParceiro, setEditingParceiro] = useState<Parceiro | null>(null);
  const navigate = useNavigate();
  const { toast } = useToast();

  useEffect(() => {
    checkAuth();
    fetchParceiros();
  }, []);

  const checkAuth = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      navigate("/auth");
    }
  };

  const fetchParceiros = async () => {
    try {
      const { data, error } = await supabase
        .from("parceiros")
        .select(`
          *,
          contas_bancarias(*),
          wallets_crypto(*)
        `)
        .order("created_at", { ascending: false });

      if (error) throw error;
      setParceiros(data || []);
    } catch (error: any) {
      toast({
        title: "Erro ao carregar parceiros",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    navigate("/auth");
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Tem certeza que deseja excluir este parceiro?")) return;

    try {
      const { error } = await supabase
        .from("parceiros")
        .delete()
        .eq("id", id);

      if (error) throw error;

      toast({
        title: "Parceiro excluído",
        description: "O parceiro foi removido com sucesso.",
      });
      fetchParceiros();
    } catch (error: any) {
      toast({
        title: "Erro ao excluir parceiro",
        description: error.message,
        variant: "destructive",
      });
    }
  };

  const handleEdit = (parceiro: Parceiro) => {
    setEditingParceiro(parceiro);
    setDialogOpen(true);
  };

  const handleDialogClose = () => {
    setDialogOpen(false);
    setEditingParceiro(null);
    fetchParceiros();
  };

  const maskCPF = (cpf: string) => {
    if (showCPF) return cpf;
    return cpf.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, "***.$2.***-**");
  };

  const filteredParceiros = parceiros.filter((parceiro) => {
    const matchesSearch =
      parceiro.nome.toLowerCase().includes(searchTerm.toLowerCase()) ||
      parceiro.cpf.includes(searchTerm);
    const matchesStatus =
      statusFilter === "todos" || parceiro.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  const stats = {
    total: parceiros.length,
    ativos: parceiros.filter((p) => p.status === "ativo").length,
    inativos: parceiros.filter((p) => p.status === "inativo").length,
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
      <Header />
      
      <div className="container mx-auto px-4 py-8">
        <div className="flex justify-between items-center mb-8">
          <div>
            <h1 className="text-4xl font-bold">Gestão de Parceiros</h1>
            <p className="text-muted-foreground mt-2">
              Gerencie seus parceiros, contas bancárias e wallets crypto
            </p>
          </div>
          <Button onClick={handleLogout} variant="outline">
            <LogOut className="mr-2 h-4 w-4" />
            Sair
          </Button>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Total de Parceiros
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold">{stats.total}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Ativos
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold text-green-600">{stats.ativos}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Inativos
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold text-yellow-600">{stats.inativos}</div>
            </CardContent>
          </Card>
        </div>

        {/* Toolbar */}
        <Card className="mb-6">
          <CardContent className="pt-6">
            <div className="flex flex-col md:flex-row gap-4">
              <div className="flex-1 relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground h-4 w-4" />
                <Input
                  placeholder="Buscar por nome ou CPF..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10"
                />
              </div>
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="px-4 py-2 border rounded-md bg-background"
              >
                <option value="todos">Todos os status</option>
                <option value="ativo">Ativos</option>
                <option value="inativo">Inativos</option>
              </select>
              <Button
                variant="outline"
                onClick={() => setShowCPF(!showCPF)}
              >
                {showCPF ? (
                  <>
                    <EyeOff className="mr-2 h-4 w-4" />
                    Ocultar CPF
                  </>
                ) : (
                  <>
                    <Eye className="mr-2 h-4 w-4" />
                    Mostrar CPF
                  </>
                )}
              </Button>
              <Button onClick={() => setDialogOpen(true)}>
                <Plus className="mr-2 h-4 w-4" />
                Novo Parceiro
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Parceiros Grid */}
        {filteredParceiros.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center">
              <p className="text-muted-foreground">
                Nenhum parceiro encontrado. Clique em "Novo Parceiro" para adicionar.
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {filteredParceiros.map((parceiro) => (
              <Card key={parceiro.id} className="hover:shadow-lg transition-shadow">
                <CardHeader>
                  <div className="flex justify-between items-start">
                    <div>
                      <CardTitle className="text-xl">{parceiro.nome}</CardTitle>
                      <p className="text-sm text-muted-foreground mt-1">
                        CPF: {maskCPF(parceiro.cpf)}
                      </p>
                    </div>
                    <Badge
                      variant={
                        parceiro.status === "ativo"
                          ? "default"
                          : parceiro.status === "inativo"
                          ? "secondary"
                          : "destructive"
                      }
                    >
                      {parceiro.status}
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2 text-sm">
                    {parceiro.email && (
                      <p className="text-muted-foreground">
                        <span className="font-medium">Email:</span> {parceiro.email}
                      </p>
                    )}
                    {parceiro.telefone && (
                      <p className="text-muted-foreground">
                        <span className="font-medium">Telefone:</span> {parceiro.telefone}
                      </p>
                    )}
                    <div className="pt-4 border-t">
                      <p className="text-muted-foreground">
                        <span className="font-medium">Contas Bancárias:</span>{" "}
                        {parceiro.contas_bancarias?.length || 0}
                      </p>
                      <p className="text-muted-foreground">
                        <span className="font-medium">Wallets Crypto:</span>{" "}
                        {parceiro.wallets_crypto?.length || 0}
                      </p>
                    </div>
                  </div>
                  <div className="flex gap-2 mt-4">
                    <Button
                      variant="outline"
                      size="sm"
                      className="flex-1"
                      onClick={() => handleEdit(parceiro)}
                    >
                      <Edit className="mr-1 h-4 w-4" />
                      Editar
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      className="flex-1 text-red-600 hover:text-red-700"
                      onClick={() => handleDelete(parceiro.id)}
                    >
                      <Trash2 className="mr-1 h-4 w-4" />
                      Excluir
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>

      <ParceiroDialog
        open={dialogOpen}
        onClose={handleDialogClose}
        parceiro={editingParceiro}
      />
    </div>
  );
}
