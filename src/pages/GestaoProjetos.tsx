import { useState, useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import { PageHeader } from "@/components/PageHeader";
import { 
  Plus, 
  Search, 
  FolderKanban, 
  Calendar, 
  Users, 
  Wallet,
  TrendingUp,
  TrendingDown,
  Receipt,
  LayoutGrid,
  List,
  Edit,
  ExternalLink,
  Trash2,
  Eye,
  Star
} from "lucide-react";
import { VisualizarOperadoresDialog } from "@/components/projetos/VisualizarOperadoresDialog";
import { ProjetoDialog } from "@/components/projetos/ProjetoDialog";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { useProjectFavorites } from "@/hooks/useProjectFavorites";

interface Projeto {
  id: string;
  projeto_id?: string;
  nome: string;
  descricao?: string | null;
  status: string;
  data_inicio: string | null;
  data_fim_prevista: string | null;
  orcamento_inicial: number;
  operadores_ativos?: number;
  total_gasto_operadores?: number;
  saldo_bookmakers?: number;
  saldo_irrecuperavel?: number;
  total_depositado?: number;
  total_sacado?: number;
  total_bookmakers?: number;
  perdas_confirmadas?: number;
  lucro_operacional?: number;
}

export default function GestaoProjetos() {
  const navigate = useNavigate();
  const [projetos, setProjetos] = useState<Projeto[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [viewMode, setViewMode] = useState<"cards" | "list">("cards");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [selectedProjeto, setSelectedProjeto] = useState<Projeto | null>(null);
  const [dialogMode, setDialogMode] = useState<"view" | "edit" | "create">("create");
  const [dialogInitialTab, setDialogInitialTab] = useState<string | undefined>(undefined);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [projetoToDelete, setProjetoToDelete] = useState<Projeto | null>(null);
  const [visualizarOperadoresOpen, setVisualizarOperadoresOpen] = useState(false);
  const [projetoParaVisualizar, setProjetoParaVisualizar] = useState<Projeto | null>(null);
  const [showFavoritesOnly, setShowFavoritesOnly] = useState(false);

  const { isFavorite, toggleFavorite, count: favoritesCount, getFavoriteIds } = useProjectFavorites();

  useEffect(() => {
    fetchProjetos();
  }, []);

  const fetchProjetos = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from("v_projeto_resumo")
        .select("*");

      if (error) throw error;
      // Map projeto_id to id for consistency
      const mapped = (data || []).map((proj: any) => ({
        ...proj,
        id: proj.projeto_id || proj.id,
        descricao: proj.descricao || null,
      }));
      setProjetos(mapped);
    } catch (error: any) {
      toast.error("Erro ao carregar projetos: " + error.message);
    } finally {
      setLoading(false);
    }
  };

  const handleToggleFavorite = async (e: React.MouseEvent, projectId: string) => {
    e.stopPropagation();
    const success = await toggleFavorite(projectId);
    if (!success) {
      toast.error("Não foi possível atualizar favorito");
    }
  };

  // Sort and filter projects: favorites first, then by name
  const sortedAndFilteredProjetos = useMemo(() => {
    const favoriteIds = getFavoriteIds();
    
    // Filter first
    const filtered = projetos.filter((proj) => {
      const matchesSearch = proj.nome.toLowerCase().includes(searchTerm.toLowerCase());
      const matchesStatus = statusFilter === "all" || proj.status === statusFilter;
      const matchesFavoriteFilter = showFavoritesOnly ? favoriteIds.includes(proj.id) : true;
      return matchesSearch && matchesStatus && matchesFavoriteFilter;
    });

    // Sort: favorites first, then by name
    return filtered.sort((a, b) => {
      const aIsFav = favoriteIds.includes(a.id);
      const bIsFav = favoriteIds.includes(b.id);
      
      if (aIsFav && !bIsFav) return -1;
      if (!aIsFav && bIsFav) return 1;
      
      // Within same category, sort by name
      return a.nome.localeCompare(b.nome);
    });
  }, [projetos, searchTerm, statusFilter, showFavoritesOnly, getFavoriteIds]);

  const handleOpenDialog = (projeto: Projeto | null, mode: "view" | "edit" | "create", initialTab?: string) => {
    setSelectedProjeto(projeto);
    setDialogMode(mode);
    setDialogInitialTab(initialTab);
    setDialogOpen(true);
  };

  // Callback para reabrir o dialog em modo edição após criar projeto
  const handleCreatedOpenEdit = async (projetoId: string, initialTab?: string) => {
    // Buscar projeto recém-criado
    const { data } = await supabase
      .from("projetos")
      .select("*")
      .eq("id", projetoId)
      .single();
    
    if (data) {
      const proj: Projeto = {
        id: data.id,
        nome: data.nome,
        descricao: data.descricao,
        status: data.status,
        data_inicio: data.data_inicio,
        data_fim_prevista: data.data_fim_prevista,
        orcamento_inicial: data.orcamento_inicial || 0,
      };
      handleOpenDialog(proj, "edit", initialTab);
    }
  };

  const handleDeleteProjeto = async () => {
    if (!projetoToDelete) return;
    
    try {
      const { error } = await supabase
        .from("projetos")
        .delete()
        .eq("id", projetoToDelete.id);
      
      if (error) throw error;
      
      toast.success("Projeto excluído com sucesso");
      fetchProjetos();
    } catch (error: any) {
      toast.error("Erro ao excluir projeto: " + error.message);
    } finally {
      setDeleteDialogOpen(false);
      setProjetoToDelete(null);
    }
  };

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat("pt-BR", {
      style: "currency",
      currency: "BRL",
    }).format(value);
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case "PLANEJADO": return "bg-blue-500/20 text-blue-400 border-blue-500/30";
      case "EM_ANDAMENTO": return "bg-emerald-500/20 text-emerald-400 border-emerald-500/30";
      case "PAUSADO": return "bg-yellow-500/20 text-yellow-400 border-yellow-500/30";
      case "FINALIZADO": return "bg-gray-500/20 text-gray-400 border-gray-500/30";
      default: return "bg-gray-500/20 text-gray-400 border-gray-500/30";
    }
  };

  const getStatusLabel = (status: string) => {
    switch (status) {
      case "PLANEJADO": return "Planejado";
      case "EM_ANDAMENTO": return "Em Andamento";
      case "PAUSADO": return "Pausado";
      case "FINALIZADO": return "Finalizado";
      default: return status;
    }
  };

  return (
    <div className="flex-1 space-y-4 p-4 md:p-8 pt-6">
      <PageHeader
        title="Projetos"
        description="Gerencie seus projetos e acompanhe o progresso"
        pagePath="/projetos"
        pageIcon="FolderKanban"
        actions={
          <Button onClick={() => handleOpenDialog(null, "create")}>
            <Plus className="mr-2 h-4 w-4" />
            Novo Projeto
          </Button>
        }
      />

      {/* Filtros */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-col md:flex-row gap-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Buscar por nome..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10"
              />
            </div>
            
            {/* Favorites filter */}
            <div className="flex items-center gap-2 px-3 py-1.5 border rounded-md bg-card">
              <Switch
                id="filter-favorites"
                checked={showFavoritesOnly}
                onCheckedChange={setShowFavoritesOnly}
              />
              <Label htmlFor="filter-favorites" className="text-sm cursor-pointer flex items-center gap-1">
                <Star className="h-3.5 w-3.5 text-amber-400" />
                Favoritos ({favoritesCount})
              </Label>
            </div>
            
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos Status</SelectItem>
                <SelectItem value="PLANEJADO">Planejado</SelectItem>
                <SelectItem value="EM_ANDAMENTO">Em Andamento</SelectItem>
                <SelectItem value="PAUSADO">Pausado</SelectItem>
                <SelectItem value="FINALIZADO">Finalizado</SelectItem>
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
        </CardContent>
      </Card>

      {/* Lista de Projetos */}
      {loading ? (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3].map((i) => (
            <Card key={i}>
              <CardContent className="pt-6">
                <Skeleton className="h-24 w-full" />
              </CardContent>
            </Card>
          ))}
        </div>
      ) : sortedAndFilteredProjetos.length === 0 ? (
        <Card>
          <CardContent className="pt-6">
            <div className="text-center py-10">
              <FolderKanban className="mx-auto h-12 w-12 text-muted-foreground/50" />
              <h3 className="mt-4 text-lg font-semibold">Nenhum projeto encontrado</h3>
              <p className="text-muted-foreground">
                {searchTerm || statusFilter !== "all"
                  ? "Tente ajustar os filtros"
                  : "Comece criando seu primeiro projeto"}
              </p>
            </div>
          </CardContent>
        </Card>
      ) : viewMode === "cards" ? (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {sortedAndFilteredProjetos.map((projeto) => (
            <Card 
              key={projeto.id} 
              className="cursor-pointer hover:border-primary/50 transition-colors"
              onClick={() => navigate(`/projeto/${projeto.id}`)}
            >
              <CardHeader className="pb-2">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center">
                      <FolderKanban className="h-5 w-5 text-primary" />
                    </div>
                    <div>
                      <CardTitle className="text-base">{projeto.nome}</CardTitle>
                      {projeto.descricao && (
                        <p className="text-sm text-muted-foreground line-clamp-1">
                          {projeto.descricao}
                        </p>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8"
                            onClick={(e) => handleToggleFavorite(e, projeto.id)}
                          >
                            <Star 
                              className={`h-4 w-4 transition-colors ${
                                isFavorite(projeto.id) 
                                  ? "fill-amber-400 text-amber-400" 
                                  : "text-muted-foreground hover:text-amber-400"
                              }`} 
                            />
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent>
                          <p>{isFavorite(projeto.id) ? "Remover dos favoritos" : "Favoritar projeto"}</p>
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                    <Badge className={getStatusColor(projeto.status)}>
                      {getStatusLabel(projeto.status)}
                    </Badge>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {projeto.data_inicio && (
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <Calendar className="h-4 w-4" />
                      <span>
                        Início: {format(new Date(projeto.data_inicio), "dd/MM/yyyy", { locale: ptBR })}
                      </span>
                    </div>
                  )}
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Users className="h-4 w-4" />
                    <span>{projeto.operadores_ativos || 0} operador(es) • {projeto.total_bookmakers || 0} bookmaker(s)</span>
                  </div>
                  
                  <div className="pt-2 border-t space-y-2">
                    <div className="flex items-center justify-between text-sm">
                      <div className="flex items-center gap-2 text-muted-foreground">
                        <Wallet className="h-4 w-4" />
                        <span>Saldo Bookmakers</span>
                      </div>
                      <span className="font-medium">{formatCurrency(projeto.saldo_bookmakers || 0)}</span>
                    </div>
                    
                    {(() => {
                      // Lucro operacional = soma de lucro_prejuizo das apostas LIQUIDADAS - perdas confirmadas
                      const lucroOperacional = (projeto.lucro_operacional || 0) - (projeto.perdas_confirmadas || 0);
                      const isPositive = lucroOperacional >= 0;
                      return (
                        <div className="flex items-center justify-between text-sm">
                          <div className="flex items-center gap-2 text-muted-foreground">
                            {isPositive ? (
                              <TrendingUp className="h-4 w-4 text-emerald-500" />
                            ) : (
                              <TrendingDown className="h-4 w-4 text-red-500" />
                            )}
                            <span>Lucro</span>
                          </div>
                          <span className={`font-medium ${isPositive ? 'text-emerald-500' : 'text-red-500'}`}>
                            {isPositive ? '+' : ''}{formatCurrency(lucroOperacional)}
                          </span>
                        </div>
                      );
                    })()}
                    
                    <div className="flex items-center justify-between text-sm">
                      <div className="flex items-center gap-2 text-muted-foreground">
                        <Receipt className="h-4 w-4" />
                        <span>Gastos Operadores</span>
                      </div>
                      <span className="font-medium text-amber-500">{formatCurrency(projeto.total_gasto_operadores || 0)}</span>
                    </div>
                  </div>
                </div>
                <div className="flex gap-2 mt-4 pt-4 border-t">
                  <Button 
                    variant="outline" 
                    size="sm" 
                    className="flex-1"
                    onClick={(e) => {
                      e.stopPropagation();
                      navigate(`/projeto/${projeto.id}`);
                    }}
                  >
                    <ExternalLink className="h-4 w-4 mr-1" />
                    Abrir
                  </Button>
                  <Button 
                    variant="outline" 
                    size="sm" 
                    className="flex-1"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleOpenDialog(projeto, "edit");
                    }}
                  >
                    <Edit className="h-4 w-4 mr-1" />
                    Editar
                  </Button>
                  <Button 
                    variant="outline" 
                    size="icon"
                    title="Ver Operadores"
                    onClick={(e) => {
                      e.stopPropagation();
                      setProjetoParaVisualizar(projeto);
                      setVisualizarOperadoresOpen(true);
                    }}
                  >
                    <Eye className="h-4 w-4" />
                  </Button>
                  <Button 
                    variant="outline" 
                    size="icon"
                    className="text-destructive hover:text-destructive hover:bg-destructive/10"
                    onClick={(e) => {
                      e.stopPropagation();
                      setProjetoToDelete(projeto);
                      setDeleteDialogOpen(true);
                    }}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        <Card>
          <ScrollArea className="h-[600px]">
            <div className="divide-y">
              {sortedAndFilteredProjetos.map((projeto) => (
                <div
                  key={projeto.id}
                  className="flex items-center justify-between p-4 hover:bg-muted/50 cursor-pointer"
                  onClick={() => navigate(`/projeto/${projeto.id}`)}
                >
                  <div className="flex items-center gap-4">
                    <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center">
                      <FolderKanban className="h-5 w-5 text-primary" />
                    </div>
                    <div>
                      <p className="font-medium">{projeto.nome}</p>
                      {projeto.descricao && (
                        <p className="text-sm text-muted-foreground line-clamp-1">
                          {projeto.descricao}
                        </p>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-6">
                    <div className="text-right">
                      <p className="text-xs text-muted-foreground">Saldo Bookmakers</p>
                      <p className="text-sm font-medium">{formatCurrency(projeto.saldo_bookmakers || 0)}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-xs text-muted-foreground">Lucro</p>
                      {(() => {
                        const lucroOperacional = (projeto.lucro_operacional || 0) - (projeto.perdas_confirmadas || 0);
                        const isPositive = lucroOperacional >= 0;
                        return (
                          <p className={`text-sm font-medium ${isPositive ? 'text-emerald-500' : 'text-red-500'}`}>
                            {isPositive ? '+' : ''}{formatCurrency(lucroOperacional)}
                          </p>
                        );
                      })()}
                    </div>
                    <div className="text-right">
                      <p className="text-xs text-muted-foreground">Operadores</p>
                      <p className="text-sm">{projeto.operadores_ativos || 0}</p>
                    </div>
                    <Badge className={getStatusColor(projeto.status)}>
                      {getStatusLabel(projeto.status)}
                    </Badge>
                    <div className="flex gap-1">
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button 
                              variant="ghost" 
                              size="icon"
                              onClick={(e) => handleToggleFavorite(e, projeto.id)}
                            >
                              <Star 
                                className={`h-4 w-4 transition-colors ${
                                  isFavorite(projeto.id) 
                                    ? "fill-amber-400 text-amber-400" 
                                    : "text-muted-foreground hover:text-amber-400"
                                }`} 
                              />
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>
                            <p>{isFavorite(projeto.id) ? "Remover dos favoritos" : "Favoritar projeto"}</p>
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                      <Button 
                        variant="ghost" 
                        size="icon"
                        onClick={(e) => {
                          e.stopPropagation();
                          navigate(`/projeto/${projeto.id}`);
                        }}
                      >
                        <ExternalLink className="h-4 w-4" />
                      </Button>
                      <Button 
                        variant="ghost" 
                        size="icon"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleOpenDialog(projeto, "edit");
                        }}
                      >
                        <Edit className="h-4 w-4" />
                      </Button>
                      <Button 
                        variant="ghost" 
                        size="icon"
                        title="Ver Operadores"
                        onClick={(e) => {
                          e.stopPropagation();
                          setProjetoParaVisualizar(projeto);
                          setVisualizarOperadoresOpen(true);
                        }}
                      >
                        <Eye className="h-4 w-4" />
                      </Button>
                      <Button 
                        variant="ghost" 
                        size="icon"
                        className="text-destructive hover:text-destructive hover:bg-destructive/10"
                        onClick={(e) => {
                          e.stopPropagation();
                          setProjetoToDelete(projeto);
                          setDeleteDialogOpen(true);
                        }}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </ScrollArea>
        </Card>
      )}

      <ProjetoDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        projeto={selectedProjeto}
        mode={dialogMode}
        onSuccess={fetchProjetos}
        onCreatedOpenEdit={handleCreatedOpenEdit}
        initialTab={dialogInitialTab}
      />

      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir projeto?</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja excluir o projeto "{projetoToDelete?.nome}"? 
              Esta ação não pode ser desfeita e todos os dados relacionados serão perdidos.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={handleDeleteProjeto}
            >
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {projetoParaVisualizar && (
        <VisualizarOperadoresDialog
          open={visualizarOperadoresOpen}
          onOpenChange={setVisualizarOperadoresOpen}
          projetoId={projetoParaVisualizar.id}
          projetoNome={projetoParaVisualizar.nome}
        />
      )}
    </div>
  );
}