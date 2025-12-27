import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { SearchInput } from "@/components/ui/search-input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { IndicadorDialog } from "@/components/indicadores/IndicadorDialog";
import { IndicadorCard } from "@/components/indicadores/IndicadorCard";
import { Users, UserPlus, UserX, LayoutGrid, List, DollarSign } from "lucide-react";
import { useActionAccess } from "@/hooks/useModuleAccess";

interface IndicadorPerformance {
  indicador_id: string;
  user_id: string;
  nome: string;
  cpf: string;
  status: string;
  telefone: string | null;
  email: string | null;
  total_parceiros_indicados: number;
  parcerias_ativas: number;
  parcerias_encerradas: number;
  total_comissoes: number;
  total_bonus: number;
}

interface IndicadorAcordo {
  id: string;
  indicador_id: string;
  orcamento_por_parceiro: number;
  meta_parceiros: number | null;
  valor_bonus: number | null;
  ativo: boolean;
}

export function IndicadoresTab() {
  const { toast } = useToast();
  const [indicadores, setIndicadores] = useState<IndicadorPerformance[]>([]);
  const [acordos, setAcordos] = useState<IndicadorAcordo[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("todos");
  const [viewMode, setViewMode] = useState<"cards" | "list">("cards");
  
  const [dialogOpen, setDialogOpen] = useState(false);
  const [selectedIndicador, setSelectedIndicador] = useState<IndicadorPerformance | null>(null);
  const [isViewMode, setIsViewMode] = useState(false);
  
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [indicadorToDelete, setIndicadorToDelete] = useState<IndicadorPerformance | null>(null);
  const { canCreate, canEdit, canDelete } = useActionAccess();

  useEffect(() => {
    fetchIndicadores();
  }, []);

  const fetchIndicadores = async () => {
    try {
      setLoading(true);
      const [indicadoresRes, acordosRes] = await Promise.all([
        supabase.from("v_indicador_performance").select("*"),
        supabase.from("indicador_acordos").select("*").eq("ativo", true),
      ]);

      if (indicadoresRes.error) throw indicadoresRes.error;
      setIndicadores(indicadoresRes.data || []);
      setAcordos(acordosRes.data || []);
    } catch (error: any) {
      toast({
        title: "Erro ao carregar indicadores",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const getAcordo = (indicadorId: string) => {
    return acordos.find((a) => a.indicador_id === indicadorId);
  };

  const handleEdit = (indicador: IndicadorPerformance) => {
    setSelectedIndicador(indicador);
    setIsViewMode(false);
    setDialogOpen(true);
  };

  const handleView = (indicador: IndicadorPerformance) => {
    setSelectedIndicador(indicador);
    setIsViewMode(true);
    setDialogOpen(true);
  };

  const handleDeleteClick = (indicador: IndicadorPerformance) => {
    setIndicadorToDelete(indicador);
    setDeleteDialogOpen(true);
  };

  const handleDelete = async () => {
    if (!indicadorToDelete) return;

    try {
      const { error } = await supabase
        .from("indicadores_referral")
        .delete()
        .eq("id", indicadorToDelete.indicador_id);

      if (error) throw error;

      toast({
        title: "Indicador excluído",
        description: "O indicador foi removido com sucesso.",
      });
      fetchIndicadores();
    } catch (error: any) {
      toast({
        title: "Erro ao excluir",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setDeleteDialogOpen(false);
      setIndicadorToDelete(null);
    }
  };

  const handleDialogClose = () => {
    setDialogOpen(false);
    setSelectedIndicador(null);
    setIsViewMode(false);
    fetchIndicadores();
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

  const filteredIndicadores = indicadores.filter((ind) => {
    const matchesSearch = ind.nome.toLowerCase().includes(searchTerm.toLowerCase()) ||
      ind.cpf.includes(searchTerm);
    const matchesStatus = statusFilter === "todos" || ind.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  const stats = {
    total: indicadores.length,
    ativos: indicadores.filter((i) => i.status === "ATIVO").length,
    totalComissoes: indicadores.reduce((acc, i) => acc + (i.total_comissoes || 0) + (i.total_bonus || 0), 0),
    totalParceiros: indicadores.reduce((acc, i) => acc + (i.total_parceiros_indicados || 0), 0),
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
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.total}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Ativos</CardTitle>
            <UserPlus className="h-4 w-4 text-emerald-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-emerald-500">{stats.ativos}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Parceiros Indicados</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.totalParceiros}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Pago</CardTitle>
            <DollarSign className="h-4 w-4 text-primary" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-primary">{formatCurrency(stats.totalComissoes)}</div>
          </CardContent>
        </Card>
      </div>

      {/* Toolbar */}
      <div className="flex flex-col md:flex-row gap-4 items-center">
        <div className="flex-1 w-full md:max-w-sm">
          <SearchInput
            placeholder="Buscar por nome ou CPF..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            onAdd={canCreate('captacao', 'captacao.indicadores.create') ? () => {
              setSelectedIndicador(null);
              setIsViewMode(false);
              setDialogOpen(true);
            } : undefined}
            addButtonLabel="Novo Indicador"
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
      {filteredIndicadores.length === 0 ? (
        <Card className="p-12 text-center">
          <UserX className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
          <h3 className="text-lg font-semibold mb-2">Nenhum indicador encontrado</h3>
          <p className="text-muted-foreground mb-4">
            {searchTerm || statusFilter !== "todos"
              ? "Tente ajustar os filtros de busca"
              : "Comece cadastrando seu primeiro indicador"}
          </p>
          {canCreate('captacao', 'captacao.indicadores.create') && (
            <Button onClick={() => {
              setSelectedIndicador(null);
              setIsViewMode(false);
              setDialogOpen(true);
            }}>
              <UserPlus className="h-4 w-4 mr-2" />
              Novo Indicador
            </Button>
          )}
        </Card>
      ) : viewMode === "cards" ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredIndicadores.map((indicador) => {
            const acordo = getAcordo(indicador.indicador_id);
            return (
              <IndicadorCard
                key={indicador.indicador_id}
                indicador={indicador}
                onView={() => handleView(indicador)}
                onEdit={() => handleEdit(indicador)}
                onDelete={() => handleDeleteClick(indicador)}
                formatCurrency={formatCurrency}
                getStatusBadge={getStatusBadge}
              />
            );
          })}
        </div>
      ) : (
        <div className="space-y-2">
          {filteredIndicadores.map((indicador) => {
            const acordo = getAcordo(indicador.indicador_id);
            return (
              <Card key={indicador.indicador_id} className="p-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center">
                      <Users className="h-5 w-5 text-primary" />
                    </div>
                    <div>
                      <div className="font-semibold">{indicador.nome}</div>
                      <div className="text-sm text-muted-foreground">
                        {indicador.total_parceiros_indicados} parceiros indicados
                        {acordo && ` • Orçamento: ${formatCurrency(acordo.orcamento_por_parceiro)}/parceiro`}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-4">
                    <div className="text-right">
                      <div className="font-semibold text-emerald-500">
                        {formatCurrency(indicador.total_comissoes + indicador.total_bonus)}
                      </div>
                      <div className="text-sm text-muted-foreground">Total recebido</div>
                    </div>
                    {getStatusBadge(indicador.status)}
                    <div className="flex gap-1">
                      <Button variant="ghost" size="sm" onClick={() => handleView(indicador)}>
                        Ver
                      </Button>
                      <Button variant="ghost" size="sm" onClick={() => handleEdit(indicador)}>
                        Editar
                      </Button>
                      <Button variant="ghost" size="sm" onClick={() => handleDeleteClick(indicador)}>
                        Excluir
                      </Button>
                    </div>
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {/* Dialogs */}
      <IndicadorDialog
        open={dialogOpen}
        onOpenChange={handleDialogClose}
        indicador={selectedIndicador}
        isViewMode={isViewMode}
      />

      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirmar exclusão</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja excluir o indicador "{indicadorToDelete?.nome}"?
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
