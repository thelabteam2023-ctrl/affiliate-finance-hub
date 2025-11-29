import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { Plus, Search, LogOut, Eye, EyeOff, Edit, Trash2, LayoutGrid, List } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import Header from "@/components/Header";
import ParceiroDialog from "@/components/parceiros/ParceiroDialog";
import { formatCPF, maskCPFPartial, maskEmail } from "@/lib/validators";

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
  const [viewMode, setViewMode] = useState(false);
  const [viewType, setViewType] = useState<"cards" | "list">("cards");
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [parceiroToDelete, setParceiroToDelete] = useState<string | null>(null);
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

  const handleDeleteClick = (id: string) => {
    setParceiroToDelete(id);
    setDeleteDialogOpen(true);
  };

  const handleDelete = async () => {
    if (!parceiroToDelete) return;

    try {
      const { error } = await supabase
        .from("parceiros")
        .delete()
        .eq("id", parceiroToDelete);

      if (error) throw error;

      toast({
        title: "Parceiro excluído",
        description: "O parceiro foi removido com sucesso.",
      });
      fetchParceiros();
      setDeleteDialogOpen(false);
      setParceiroToDelete(null);
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
    setViewMode(false);
    setDialogOpen(true);
  };

  const handleView = (parceiro: Parceiro) => {
    setEditingParceiro(parceiro);
    setViewMode(true);
    setDialogOpen(true);
  };

  const handleDialogClose = () => {
    setDialogOpen(false);
    setEditingParceiro(null);
    setViewMode(false);
    fetchParceiros();
  };

  const maskCPF = (cpf: string) => {
    if (showCPF) return formatCPF(cpf);
    return maskCPFPartial(cpf);
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
    <TooltipProvider>
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
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-[200px]">
                  <SelectValue placeholder="Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="todos">Todos os status</SelectItem>
                  <SelectItem value="ativo">Ativos</SelectItem>
                  <SelectItem value="inativo">Inativos</SelectItem>
                </SelectContent>
               </Select>
               <Tooltip>
                 <TooltipTrigger asChild>
                   <Button
                     variant="outline"
                     size="icon"
                     onClick={() => setShowCPF(!showCPF)}
                     className="shrink-0"
                   >
                     {showCPF ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                   </Button>
                 </TooltipTrigger>
                 <TooltipContent>
                   <p>Visualizar dados sensíveis</p>
                 </TooltipContent>
               </Tooltip>
               <Tooltip>
                 <TooltipTrigger asChild>
                   <Button
                     variant="outline"
                     size="icon"
                     onClick={() => setViewType(viewType === "cards" ? "list" : "cards")}
                   >
                     {viewType === "cards" ? <List className="h-4 w-4" /> : <LayoutGrid className="h-4 w-4" />}
                   </Button>
                 </TooltipTrigger>
                 <TooltipContent>
                   <p>{viewType === "cards" ? "Visualizar como lista" : "Visualizar como cards"}</p>
                 </TooltipContent>
               </Tooltip>
               <Tooltip>
                 <TooltipTrigger asChild>
                   <Button
                     size="icon"
                     onClick={() => setDialogOpen(true)}
                     className="shrink-0"
                   >
                     <Plus className="h-4 w-4" />
                   </Button>
                 </TooltipTrigger>
                 <TooltipContent>
                   <p>Novo Parceiro</p>
                 </TooltipContent>
               </Tooltip>
            </div>
          </CardContent>
        </Card>

        {/* Parceiros View */}
        {filteredParceiros.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center">
              <p className="text-muted-foreground">
                Nenhum parceiro encontrado. Clique em "Novo Parceiro" para adicionar.
              </p>
            </CardContent>
          </Card>
        ) : viewType === "cards" ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {filteredParceiros.map((parceiro) => (
              <Card key={parceiro.id} className="hover:shadow-lg transition-shadow relative">
                <CardHeader>
                  <div className="flex justify-between items-start gap-3">
                    <div 
                      className="flex items-center gap-3 flex-1 cursor-pointer group"
                      onClick={() => handleView(parceiro)}
                      title="Clique para ver detalhes completos"
                    >
                      <div className="relative w-12 h-12 rounded-full bg-gradient-to-br from-primary/20 to-primary/5 flex items-center justify-center overflow-hidden border-2 border-primary/30 group-hover:border-primary/60 transition-all">
                        <span className="text-lg font-bold text-primary">
                          {parceiro.nome.charAt(0).toUpperCase()}
                        </span>
                      </div>
                      <div>
                        <CardTitle className="text-base group-hover:text-primary transition-colors">{parceiro.nome}</CardTitle>
                        {parceiro.email && (
                          <p className="text-sm text-muted-foreground mt-1">
                            <span className="font-medium">Email:</span> {showCPF ? parceiro.email : maskEmail(parceiro.email)}
                          </p>
                        )}
                        <p className="text-sm text-muted-foreground mt-0.5 font-mono">
                          <span className="font-medium">CPF:</span> {maskCPF(parceiro.cpf)}
                        </p>
                      </div>
                    </div>
                    <Badge
                      variant={parceiro.status === "ativo" ? "default" : "secondary"}
                    >
                      {parceiro.status.toUpperCase()}
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2 text-sm pt-2 border-t mt-2">
                    <p className="text-muted-foreground">
                      <span className="font-medium">Contas Bancárias:</span>{" "}
                      {parceiro.contas_bancarias?.length || 0}
                    </p>
                    <p className="text-muted-foreground">
                      <span className="font-medium">Wallets Crypto:</span>{" "}
                      {parceiro.wallets_crypto?.length || 0}
                    </p>
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
                      onClick={() => handleDeleteClick(parceiro.id)}
                    >
                      <Trash2 className="mr-1 h-4 w-4" />
                      Excluir
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        ) : (
          <Card>
            <CardContent className="p-0">
              <div className="divide-y divide-border">
                {filteredParceiros.map((parceiro) => (
                  <div key={parceiro.id} className="p-4 hover:bg-accent/50 transition-colors">
                    <div className="flex items-center gap-4">
                      <div 
                        className="flex-1 cursor-pointer"
                        onClick={() => handleView(parceiro)}
                      >
                        <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-full bg-gradient-to-br from-primary/20 to-primary/5 flex items-center justify-center border-2 border-primary/30">
                          <span className="text-sm font-bold text-primary">
                            {parceiro.nome.charAt(0).toUpperCase()}
                          </span>
                        </div>
                          <div className="flex-1">
                            <div className="flex items-center gap-2">
                              <h3 className="font-semibold text-base">{parceiro.nome}</h3>
                              <Badge variant={parceiro.status === "ativo" ? "default" : "secondary"} className="text-xs">
                                {parceiro.status}
                              </Badge>
                            </div>
                            <div className="flex flex-col gap-0.5 mt-1 text-sm text-muted-foreground">
                              {parceiro.email && (
                                <span className="truncate max-w-[300px]">
                                  <span className="font-medium">Email:</span> {showCPF ? parceiro.email : maskEmail(parceiro.email)}
                                </span>
                              )}
                              <span className="font-mono">
                                <span className="font-medium">CPF:</span> {maskCPF(parceiro.cpf)}
                              </span>
                            </div>
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 text-sm text-muted-foreground">
                        <div className="text-center px-3 py-2 bg-accent rounded-lg">
                          <div className="font-bold text-foreground">{parceiro.contas_bancarias?.length || 0}</div>
                          <div className="text-xs">Contas</div>
                        </div>
                        <div className="text-center px-3 py-2 bg-accent rounded-lg">
                          <div className="font-bold text-foreground">{parceiro.wallets_crypto?.length || 0}</div>
                          <div className="text-xs">Wallets</div>
                        </div>
                      </div>
                      <div className="flex gap-2">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleEdit(parceiro)}
                        >
                          <Edit className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleDeleteClick(parceiro.id)}
                          className="text-red-600 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-950"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}
      </div>

        <ParceiroDialog
          open={dialogOpen}
          onClose={handleDialogClose}
          parceiro={editingParceiro}
          viewMode={viewMode}
        />

        <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Tem certeza que deseja excluir este parceiro?</AlertDialogTitle>
              <AlertDialogDescription>
                Esta ação não pode ser desfeita. Todos os dados associados a este parceiro,
                incluindo contas bancárias e wallets, serão permanentemente removidos.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancelar</AlertDialogCancel>
              <AlertDialogAction
                onClick={handleDelete}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              >
                Excluir
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </TooltipProvider>
  );
}
