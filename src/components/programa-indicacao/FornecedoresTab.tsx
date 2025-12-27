import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { SearchInput } from "@/components/ui/search-input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { FornecedorDialog } from "@/components/fornecedores/FornecedorDialog";
import { Truck, Users, DollarSign, LayoutGrid, List, UserX } from "lucide-react";
import { useActionAccess } from "@/hooks/useModuleAccess";

interface Fornecedor {
  id: string;
  user_id: string;
  nome: string;
  documento: string | null;
  tipo_documento: string;
  telefone: string | null;
  email: string | null;
  status: string;
  observacoes: string | null;
  // Calculated fields
  total_parceiros?: number;
  total_pago?: number;
}

export function FornecedoresTab() {
  const { toast } = useToast();
  const [fornecedores, setFornecedores] = useState<Fornecedor[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("todos");
  const [viewMode, setViewMode] = useState<"cards" | "list">("cards");
  
  const [dialogOpen, setDialogOpen] = useState(false);
  const [selectedFornecedor, setSelectedFornecedor] = useState<Fornecedor | null>(null);
  const [isViewMode, setIsViewMode] = useState(false);
  
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [fornecedorToDelete, setFornecedorToDelete] = useState<Fornecedor | null>(null);
  const { canCreate } = useActionAccess();

  useEffect(() => {
    fetchFornecedores();
  }, []);

  const fetchFornecedores = async () => {
    try {
      setLoading(true);
      
      // Fetch fornecedores
      const { data: fornecedoresData, error } = await supabase
        .from("fornecedores")
        .select("*")
        .order("nome");

      if (error) throw error;

      // Fetch parcerias stats per fornecedor
      const { data: parceriasData } = await supabase
        .from("parcerias")
        .select("fornecedor_id, valor_fornecedor")
        .eq("origem_tipo", "FORNECEDOR");

      // Calculate stats
      const fornecedoresWithStats = (fornecedoresData || []).map((f) => {
        const parceriasFornecedor = (parceriasData || []).filter((p) => p.fornecedor_id === f.id);
        return {
          ...f,
          total_parceiros: parceriasFornecedor.length,
          total_pago: parceriasFornecedor.reduce((acc, p) => acc + (p.valor_fornecedor || 0), 0),
        };
      });

      setFornecedores(fornecedoresWithStats);
    } catch (error: any) {
      toast({
        title: "Erro ao carregar fornecedores",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleEdit = (fornecedor: Fornecedor) => {
    setSelectedFornecedor(fornecedor);
    setIsViewMode(false);
    setDialogOpen(true);
  };

  const handleView = (fornecedor: Fornecedor) => {
    setSelectedFornecedor(fornecedor);
    setIsViewMode(true);
    setDialogOpen(true);
  };

  const handleDeleteClick = (fornecedor: Fornecedor) => {
    setFornecedorToDelete(fornecedor);
    setDeleteDialogOpen(true);
  };

  const handleDelete = async () => {
    if (!fornecedorToDelete) return;

    try {
      const { error } = await supabase
        .from("fornecedores")
        .delete()
        .eq("id", fornecedorToDelete.id);

      if (error) throw error;

      toast({
        title: "Fornecedor excluído",
        description: "O fornecedor foi removido com sucesso.",
      });
      fetchFornecedores();
    } catch (error: any) {
      toast({
        title: "Erro ao excluir",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setDeleteDialogOpen(false);
      setFornecedorToDelete(null);
    }
  };

  const handleDialogClose = () => {
    setDialogOpen(false);
    setSelectedFornecedor(null);
    setIsViewMode(false);
    fetchFornecedores();
  };

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat("pt-BR", {
      style: "currency",
      currency: "BRL",
    }).format(value);
  };

  const getStatusBadge = (status: string) => {
    const statusConfig: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
      ATIVO: { label: "Ativo", variant: "default" },
      INATIVO: { label: "Inativo", variant: "destructive" },
    };
    const config = statusConfig[status] || { label: status, variant: "outline" };
    return <Badge variant={config.variant}>{config.label}</Badge>;
  };

  const filteredFornecedores = fornecedores.filter((f) => {
    const matchesSearch = f.nome.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (f.documento?.includes(searchTerm) ?? false);
    const matchesStatus = statusFilter === "todos" || f.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  const stats = {
    total: fornecedores.length,
    ativos: fornecedores.filter((f) => f.status === "ATIVO").length,
    totalParceiros: fornecedores.reduce((acc, f) => acc + (f.total_parceiros || 0), 0),
    totalPago: fornecedores.reduce((acc, f) => acc + (f.total_pago || 0), 0),
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total</CardTitle>
            <Truck className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.total}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Ativos</CardTitle>
            <Truck className="h-4 w-4 text-emerald-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-emerald-500">{stats.ativos}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Parceiros Comprados</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.totalParceiros}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Pago</CardTitle>
            <DollarSign className="h-4 w-4 text-orange-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-orange-500">{formatCurrency(stats.totalPago)}</div>
          </CardContent>
        </Card>
      </div>

      {/* Toolbar */}
      <div className="flex flex-col md:flex-row gap-4 items-center">
        <div className="flex-1 w-full md:max-w-sm">
          <SearchInput
            placeholder="Buscar por nome ou documento..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            onAdd={canCreate('captacao', 'captacao.fornecedores.create') ? () => {
              setSelectedFornecedor(null);
              setIsViewMode(false);
              setDialogOpen(true);
            } : undefined}
            addButtonLabel="Novo Fornecedor"
          />
        </div>

        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="Filtrar por status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Todos os status</SelectItem>
            <SelectItem value="ATIVO">Ativo</SelectItem>
            <SelectItem value="INATIVO">Inativo</SelectItem>
          </SelectContent>
        </Select>

        <div className="flex gap-1">
          <Button
            variant={viewMode === "cards" ? "default" : "outline"}
            size="icon"
            onClick={() => setViewMode("cards")}
          >
            <LayoutGrid className="h-4 w-4" />
          </Button>
          <Button
            variant={viewMode === "list" ? "default" : "outline"}
            size="icon"
            onClick={() => setViewMode("list")}
          >
            <List className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Content */}
      {filteredFornecedores.length === 0 ? (
        <Card className="p-12 text-center">
          <UserX className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
          <h3 className="text-lg font-semibold mb-2">Nenhum fornecedor encontrado</h3>
          <p className="text-muted-foreground mb-4">
            {searchTerm || statusFilter !== "todos"
              ? "Tente ajustar os filtros de busca"
              : "Comece cadastrando seu primeiro fornecedor"}
          </p>
          <Button onClick={() => {
            setSelectedFornecedor(null);
            setIsViewMode(false);
            setDialogOpen(true);
          }}>
            <Truck className="h-4 w-4 mr-2" />
            Novo Fornecedor
          </Button>
        </Card>
      ) : viewMode === "cards" ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredFornecedores.map((fornecedor) => (
            <Card key={fornecedor.id} className="cursor-pointer hover:border-primary/50 transition-colors" onClick={() => handleView(fornecedor)}>
              <CardContent className="pt-6">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    <div className="h-10 w-10 rounded-full bg-orange-500/10 flex items-center justify-center">
                      <Truck className="h-5 w-5 text-orange-500" />
                    </div>
                    <div>
                      <h3 className="font-semibold">{fornecedor.nome}</h3>
                      <p className="text-sm text-muted-foreground">
                        {fornecedor.tipo_documento}: {fornecedor.documento || "N/A"}
                      </p>
                    </div>
                  </div>
                  {getStatusBadge(fornecedor.status)}
                </div>

                <div className="mt-4 grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-sm text-muted-foreground">Parceiros</p>
                    <p className="font-semibold">{fornecedor.total_parceiros || 0}</p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Total Pago</p>
                    <p className="font-semibold text-orange-500">{formatCurrency(fornecedor.total_pago || 0)}</p>
                  </div>
                </div>

                <div className="mt-4 flex gap-2" onClick={(e) => e.stopPropagation()}>
                  <Button variant="outline" size="sm" className="flex-1" onClick={() => handleEdit(fornecedor)}>
                    Editar
                  </Button>
                  <Button variant="outline" size="sm" className="flex-1" onClick={() => handleDeleteClick(fornecedor)}>
                    Excluir
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        <div className="space-y-2">
          {filteredFornecedores.map((fornecedor) => (
            <Card key={fornecedor.id} className="p-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <div className="h-10 w-10 rounded-full bg-orange-500/10 flex items-center justify-center">
                    <Truck className="h-5 w-5 text-orange-500" />
                  </div>
                  <div>
                    <div className="font-semibold">{fornecedor.nome}</div>
                    <div className="text-sm text-muted-foreground">
                      {fornecedor.tipo_documento}: {fornecedor.documento || "N/A"}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-4">
                  <div className="text-right">
                    <div className="font-semibold">{fornecedor.total_parceiros || 0} parceiros</div>
                    <div className="text-sm text-orange-500">{formatCurrency(fornecedor.total_pago || 0)}</div>
                  </div>
                  {getStatusBadge(fornecedor.status)}
                  <div className="flex gap-1">
                    <Button variant="ghost" size="sm" onClick={() => handleView(fornecedor)}>
                      Ver
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => handleEdit(fornecedor)}>
                      Editar
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => handleDeleteClick(fornecedor)}>
                      Excluir
                    </Button>
                  </div>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      {/* Dialogs */}
      <FornecedorDialog
        open={dialogOpen}
        onOpenChange={handleDialogClose}
        fornecedor={selectedFornecedor}
        isViewMode={isViewMode}
      />

      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirmar exclusão</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja excluir o fornecedor "{fornecedorToDelete?.nome}"?
              Esta ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground">
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
