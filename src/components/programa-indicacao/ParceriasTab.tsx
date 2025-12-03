import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { SearchInput } from "@/components/ui/search-input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { ParceriaDialog } from "@/components/parcerias/ParceriaDialog";
import { ParceriaCard } from "@/components/parcerias/ParceriaCard";
import { Handshake, AlertTriangle, CheckCircle, Clock, XCircle, LayoutGrid, List, Bell, UserPlus, Truck, ArrowRight } from "lucide-react";

interface ParceriaAlerta {
  id: string;
  user_id: string;
  parceiro_id: string;
  indicacao_id: string | null;
  data_inicio: string;
  duracao_dias: number;
  data_fim_prevista: string;
  data_fim_real: string | null;
  valor_comissao_indicador: number;
  comissao_paga: boolean;
  status: string;
  elegivel_renovacao: boolean;
  observacoes: string | null;
  parceiro_nome: string;
  parceiro_cpf: string;
  indicador_nome: string | null;
  dias_restantes: number;
  nivel_alerta: string;
  // New fields
  origem_tipo?: string;
  fornecedor_id?: string | null;
  valor_fornecedor?: number;
  valor_parceiro?: number;
  valor_indicador?: number;
}

export function ParceriasTab() {
  const { toast } = useToast();
  const [parcerias, setParcerias] = useState<ParceriaAlerta[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("todos");
  const [origemFilter, setOrigemFilter] = useState<string>("todos");
  const [viewMode, setViewMode] = useState<"cards" | "list">("cards");
  
  const [dialogOpen, setDialogOpen] = useState(false);
  const [selectedParceria, setSelectedParceria] = useState<ParceriaAlerta | null>(null);
  const [isViewMode, setIsViewMode] = useState(false);
  
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [parceriaToDelete, setParceriaToDelete] = useState<ParceriaAlerta | null>(null);

  useEffect(() => {
    fetchParcerias();
  }, []);

  const fetchParcerias = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from("v_parcerias_alerta")
        .select("*")
        .order("dias_restantes", { ascending: true });

      if (error) throw error;

      // Fetch additional fields from parcerias table
      const { data: parceriasData } = await supabase
        .from("parcerias")
        .select("id, origem_tipo, fornecedor_id, valor_fornecedor, valor_parceiro, valor_indicador");

      // Merge data
      const mergedData = (data || []).map((p) => {
        const parceriaExtra = parceriasData?.find((pe) => pe.id === p.id);
        return {
          ...p,
          origem_tipo: parceriaExtra?.origem_tipo || "INDICADOR",
          fornecedor_id: parceriaExtra?.fornecedor_id,
          valor_fornecedor: parceriaExtra?.valor_fornecedor || 0,
          valor_parceiro: parceriaExtra?.valor_parceiro || 0,
          valor_indicador: parceriaExtra?.valor_indicador || 0,
        };
      });

      setParcerias(mergedData);
    } catch (error: any) {
      toast({
        title: "Erro ao carregar parcerias",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleEdit = (parceria: ParceriaAlerta) => {
    setSelectedParceria(parceria);
    setIsViewMode(false);
    setDialogOpen(true);
  };

  const handleView = (parceria: ParceriaAlerta) => {
    setSelectedParceria(parceria);
    setIsViewMode(true);
    setDialogOpen(true);
  };

  const handleDeleteClick = (parceria: ParceriaAlerta) => {
    setParceriaToDelete(parceria);
    setDeleteDialogOpen(true);
  };

  const handleDelete = async () => {
    if (!parceriaToDelete) return;

    try {
      const { error } = await supabase
        .from("parcerias")
        .delete()
        .eq("id", parceriaToDelete.id);

      if (error) throw error;

      toast({
        title: "Parceria excluída",
        description: "A parceria foi removida com sucesso.",
      });
      fetchParcerias();
    } catch (error: any) {
      toast({
        title: "Erro ao excluir",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setDeleteDialogOpen(false);
      setParceriaToDelete(null);
    }
  };

  const handleDialogClose = () => {
    setDialogOpen(false);
    setSelectedParceria(null);
    setIsViewMode(false);
    fetchParcerias();
  };

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat("pt-BR", {
      style: "currency",
      currency: "BRL",
    }).format(value);
  };

  const getStatusBadge = (status: string) => {
    const statusConfig: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
      ATIVA: { label: "Ativa", variant: "default" },
      EM_ENCERRAMENTO: { label: "Em Encerramento", variant: "outline" },
      ENCERRADA: { label: "Encerrada", variant: "secondary" },
      RENOVADA: { label: "Renovada", variant: "default" },
    };
    const config = statusConfig[status] || { label: status, variant: "outline" };
    return <Badge variant={config.variant}>{config.label}</Badge>;
  };

  const getAlertaBadge = (nivel: string) => {
    const alertaConfig: Record<string, { label: string; className: string }> = {
      VENCIDA: { label: "Vencida", className: "bg-destructive text-destructive-foreground" },
      ALERTA: { label: "Alerta", className: "bg-orange-500 text-white" },
      ATENCAO: { label: "Atenção", className: "bg-yellow-500 text-black" },
      OK: { label: "OK", className: "bg-emerald-500 text-white" },
    };
    const config = alertaConfig[nivel] || { label: nivel, className: "" };
    return <Badge className={config.className}>{config.label}</Badge>;
  };

  const getOrigemBadge = (origem: string) => {
    const origemConfig: Record<string, { label: string; icon: JSX.Element; className: string }> = {
      INDICADOR: { label: "Indicador", icon: <UserPlus className="h-3 w-3" />, className: "bg-primary/10 text-primary border-primary/20" },
      FORNECEDOR: { label: "Fornecedor", icon: <Truck className="h-3 w-3" />, className: "bg-orange-500/10 text-orange-500 border-orange-500/20" },
      DIRETO: { label: "Direto", icon: <ArrowRight className="h-3 w-3" />, className: "bg-muted text-muted-foreground border-border" },
    };
    const config = origemConfig[origem] || origemConfig.DIRETO;
    return (
      <Badge variant="outline" className={config.className}>
        {config.icon}
        <span className="ml-1">{config.label}</span>
      </Badge>
    );
  };

  const filteredParcerias = parcerias.filter((p) => {
    const matchesSearch = p.parceiro_nome.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (p.indicador_nome?.toLowerCase().includes(searchTerm.toLowerCase()) ?? false);
    const matchesStatus = statusFilter === "todos" || p.status === statusFilter;
    const matchesOrigem = origemFilter === "todos" || p.origem_tipo === origemFilter;
    return matchesSearch && matchesStatus && matchesOrigem;
  });

  const stats = {
    total: parcerias.length,
    ativas: parcerias.filter((p) => p.status === "ATIVA").length,
    emEncerramento: parcerias.filter((p) => p.status === "EM_ENCERRAMENTO").length,
    alertas: parcerias.filter((p) => p.nivel_alerta === "ALERTA" || p.nivel_alerta === "VENCIDA").length,
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
      {/* Alerta de Parcerias Vencendo */}
      {stats.alertas > 0 && (
        <Card className="border-orange-500 bg-orange-500/10">
          <CardContent className="flex items-center gap-4 p-4">
            <Bell className="h-6 w-6 text-orange-500" />
            <div>
              <p className="font-semibold text-orange-500">
                {stats.alertas} {stats.alertas === 1 ? "parceria" : "parcerias"} {stats.alertas === 1 ? "precisa" : "precisam"} de atenção
              </p>
              <p className="text-sm text-muted-foreground">
                Verifique as parcerias próximas do vencimento ou já vencidas
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total</CardTitle>
            <Handshake className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.total}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Ativas</CardTitle>
            <CheckCircle className="h-4 w-4 text-emerald-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-emerald-500">{stats.ativas}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Em Encerramento</CardTitle>
            <Clock className="h-4 w-4 text-yellow-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-yellow-500">{stats.emEncerramento}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Com Alertas</CardTitle>
            <AlertTriangle className="h-4 w-4 text-orange-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-orange-500">{stats.alertas}</div>
          </CardContent>
        </Card>
      </div>

      {/* Toolbar */}
      <div className="flex flex-col md:flex-row gap-4 items-center">
        <div className="flex-1 w-full md:max-w-sm">
          <SearchInput
            placeholder="Buscar por parceiro ou indicador..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            onAdd={() => {
              setSelectedParceria(null);
              setIsViewMode(false);
              setDialogOpen(true);
            }}
            addButtonLabel="Nova Parceria"
          />
        </div>

        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Todos os status</SelectItem>
            <SelectItem value="ATIVA">Ativa</SelectItem>
            <SelectItem value="EM_ENCERRAMENTO">Em Encerramento</SelectItem>
            <SelectItem value="ENCERRADA">Encerrada</SelectItem>
            <SelectItem value="RENOVADA">Renovada</SelectItem>
          </SelectContent>
        </Select>

        <Select value={origemFilter} onValueChange={setOrigemFilter}>
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="Origem" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Todas as origens</SelectItem>
            <SelectItem value="INDICADOR">Via Indicador</SelectItem>
            <SelectItem value="FORNECEDOR">Via Fornecedor</SelectItem>
            <SelectItem value="DIRETO">Aquisição Direta</SelectItem>
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
      {filteredParcerias.length === 0 ? (
        <Card className="p-12 text-center">
          <XCircle className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
          <h3 className="text-lg font-semibold mb-2">Nenhuma parceria encontrada</h3>
          <p className="text-muted-foreground mb-4">
            {searchTerm || statusFilter !== "todos" || origemFilter !== "todos"
              ? "Tente ajustar os filtros de busca"
              : "Comece cadastrando sua primeira parceria"}
          </p>
          <Button onClick={() => {
            setSelectedParceria(null);
            setIsViewMode(false);
            setDialogOpen(true);
          }}>
            <Handshake className="h-4 w-4 mr-2" />
            Nova Parceria
          </Button>
        </Card>
      ) : viewMode === "cards" ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredParcerias.map((parceria) => (
            <ParceriaCard
              key={parceria.id}
              parceria={parceria}
              onView={() => handleView(parceria)}
              onEdit={() => handleEdit(parceria)}
              onDelete={() => handleDeleteClick(parceria)}
              formatCurrency={formatCurrency}
              getStatusBadge={getStatusBadge}
              getAlertaBadge={getAlertaBadge}
            />
          ))}
        </div>
      ) : (
        <div className="space-y-2">
          {filteredParcerias.map((parceria) => (
            <Card key={parceria.id} className="p-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center">
                    <Handshake className="h-5 w-5 text-primary" />
                  </div>
                  <div>
                    <div className="font-semibold">{parceria.parceiro_nome}</div>
                    <div className="text-sm text-muted-foreground flex items-center gap-2">
                      {parceria.origem_tipo === "INDICADOR" && parceria.indicador_nome
                        ? `Indicado por: ${parceria.indicador_nome}`
                        : parceria.origem_tipo === "FORNECEDOR"
                        ? "Via Fornecedor"
                        : "Aquisição Direta"}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-4">
                  <div className="text-right">
                    <div className="font-semibold">
                      {parceria.dias_restantes > 0 ? `${parceria.dias_restantes} dias restantes` : "Vencida"}
                    </div>
                    <div className="text-sm text-muted-foreground">
                      Custo: {formatCurrency((parceria.valor_indicador || 0) + (parceria.valor_parceiro || 0) + (parceria.valor_fornecedor || 0))}
                    </div>
                  </div>
                  {getOrigemBadge(parceria.origem_tipo || "DIRETO")}
                  {getStatusBadge(parceria.status)}
                  {getAlertaBadge(parceria.nivel_alerta)}
                  <div className="flex gap-1">
                    <Button variant="ghost" size="sm" onClick={() => handleView(parceria)}>
                      Ver
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => handleEdit(parceria)}>
                      Editar
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => handleDeleteClick(parceria)}>
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
      <ParceriaDialog
        open={dialogOpen}
        onOpenChange={handleDialogClose}
        parceria={selectedParceria}
        isViewMode={isViewMode}
      />

      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirmar exclusão</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja excluir a parceria com "{parceriaToDelete?.parceiro_nome}"?
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
