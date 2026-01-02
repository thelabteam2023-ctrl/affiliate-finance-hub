import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
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
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useProjectFavorites } from "@/hooks/useProjectFavorites";
import { VisualizarOperadoresDialog } from "@/components/projetos/VisualizarOperadoresDialog";
import { ProjetoDialog } from "@/components/projetos/ProjetoDialog";
import { ProjetoDeleteDialog } from "@/components/projetos/ProjetoDeleteDialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { useActionAccess } from "@/hooks/useModuleAccess";

interface SaldoByMoeda {
  BRL: number;
  USD: number;
}

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
  saldo_bookmakers_by_moeda?: SaldoByMoeda;
  saldo_irrecuperavel?: number;
  total_depositado?: number;
  total_sacado?: number;
  total_bookmakers?: number;
  perdas_confirmadas?: number;
  lucro_operacional?: number;
  lucro_by_moeda?: SaldoByMoeda;
}

export default function GestaoProjetos() {
  const navigate = useNavigate();
  const { user, role } = useAuth();
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
  const { isFavorite, toggleFavorite } = useProjectFavorites();
  const { canCreate, canEdit, canDelete } = useActionAccess();

  // Check if user is operator (should only see linked projects)
  const isOperator = role === 'operator';

  const fetchProjetos = useCallback(async () => {
    if (!user) return;
    
    try {
      setLoading(true);
      
      let projetoIds: string[] = [];
      
      // If operator, first get only their linked projects
      if (isOperator) {
        // Find operator record linked to this auth user
        const { data: operadorData } = await supabase
          .from("operadores")
          .select("id")
          .eq("auth_user_id", user.id)
          .single();
        
        if (operadorData) {
          // Get projects linked to this operator
          const { data: vinculos } = await supabase
            .from("operador_projetos")
            .select("projeto_id")
            .eq("operador_id", operadorData.id)
            .eq("status", "ATIVO");
          
          projetoIds = (vinculos || []).map(v => v.projeto_id);
          
          if (projetoIds.length === 0) {
            setProjetos([]);
            return;
          }
        } else {
          // Operator has no operador record
          setProjetos([]);
          return;
        }
      }
      
      // Build projects query
      let projetosQuery = supabase.from("projetos").select("*");
      
      // If operator, filter only linked projects
      if (isOperator && projetoIds.length > 0) {
        projetosQuery = projetosQuery.in("id", projetoIds);
      }
      
      const { data: projetosData, error: projetosError } = await projetosQuery;

      if (projetosError) throw projetosError;
      
      if (!projetosData || projetosData.length === 0) {
        setProjetos([]);
        return;
      }
      
      const finalProjetoIds = projetosData.map(p => p.id);
      
      // Buscar dados agregados em paralelo
      const [bookmarkersResult, apostasResult, operadoresResult, perdasResult] = await Promise.all([
        // Bookmakers por projeto (incluindo saldo_freebet e moeda para conversão)
        supabase
          .from("bookmakers")
          .select("projeto_id, saldo_atual, saldo_freebet, saldo_irrecuperavel, moeda")
          .in("projeto_id", finalProjetoIds),
        
        // Apostas liquidadas por projeto (incluindo referência BRL para multi-moeda)
        supabase
          .from("apostas_unificada")
          .select("projeto_id, lucro_prejuizo, lucro_prejuizo_brl_referencia, moeda_operacao")
          .in("projeto_id", finalProjetoIds)
          .eq("status", "LIQUIDADA"),
        
        // Operadores ativos por projeto
        supabase
          .from("operador_projetos")
          .select("projeto_id, id")
          .in("projeto_id", finalProjetoIds)
          .eq("status", "ATIVO"),
        
        // Perdas confirmadas por projeto
        supabase
          .from("projeto_perdas")
          .select("projeto_id, valor")
          .in("projeto_id", finalProjetoIds)
          .eq("status", "CONFIRMADA")
      ]);
      
      // Taxa de conversão USD->BRL aproximada (idealmente vir de uma API ou cache)
      const USD_TO_BRL = 6.1;
      
      // Agregar dados de bookmakers por projeto COM BREAKDOWN POR MOEDA
      const bookmakersByProjeto: Record<string, { 
        saldo: number; 
        saldoBRL: number;
        saldoUSD: number;
        count: number; 
        irrecuperavel: number 
      }> = {};
      
      (bookmarkersResult.data || []).forEach((bk: any) => {
        if (!bk.projeto_id) return;
        if (!bookmakersByProjeto[bk.projeto_id]) {
          bookmakersByProjeto[bk.projeto_id] = { saldo: 0, saldoBRL: 0, saldoUSD: 0, count: 0, irrecuperavel: 0 };
        }
        
        // Soma saldo_atual + saldo_freebet
        const saldoTotal = (bk.saldo_atual || 0) + (bk.saldo_freebet || 0);
        const irrecuperavel = bk.saldo_irrecuperavel || 0;
        const moeda = bk.moeda || 'BRL';
        
        // Acumular por moeda
        if (moeda === 'USD') {
          bookmakersByProjeto[bk.projeto_id].saldoUSD += saldoTotal;
          // Converter para BRL para total consolidado
          bookmakersByProjeto[bk.projeto_id].saldo += saldoTotal * USD_TO_BRL;
          bookmakersByProjeto[bk.projeto_id].irrecuperavel += irrecuperavel * USD_TO_BRL;
        } else {
          bookmakersByProjeto[bk.projeto_id].saldoBRL += saldoTotal;
          bookmakersByProjeto[bk.projeto_id].saldo += saldoTotal;
          bookmakersByProjeto[bk.projeto_id].irrecuperavel += irrecuperavel;
        }
        bookmakersByProjeto[bk.projeto_id].count += 1;
      });
      
      // Agregar lucro de apostas por projeto COM BREAKDOWN POR MOEDA
      const lucroByProjeto: Record<string, { total: number; BRL: number; USD: number }> = {};
      (apostasResult.data || []).forEach((ap: any) => {
        if (!ap.projeto_id) return;
        if (!lucroByProjeto[ap.projeto_id]) {
          lucroByProjeto[ap.projeto_id] = { total: 0, BRL: 0, USD: 0 };
        }
        
        const lucroOriginal = ap.lucro_prejuizo || 0;
        const moeda = ap.moeda_operacao || 'BRL';
        
        // Acumular por moeda original
        if (moeda === 'USD') {
          lucroByProjeto[ap.projeto_id].USD += lucroOriginal;
          // Para total consolidado, usar BRL referência se existir, senão converter
          const valorBRL = ap.lucro_prejuizo_brl_referencia ?? (lucroOriginal * USD_TO_BRL);
          lucroByProjeto[ap.projeto_id].total += valorBRL;
        } else {
          lucroByProjeto[ap.projeto_id].BRL += lucroOriginal;
          lucroByProjeto[ap.projeto_id].total += lucroOriginal;
        }
      });
      
      // Agregar operadores ativos por projeto
      const operadoresByProjeto: Record<string, number> = {};
      (operadoresResult.data || []).forEach((op: any) => {
        if (!op.projeto_id) return;
        operadoresByProjeto[op.projeto_id] = (operadoresByProjeto[op.projeto_id] || 0) + 1;
      });
      
      // Agregar perdas confirmadas por projeto
      const perdasByProjeto: Record<string, number> = {};
      (perdasResult.data || []).forEach((pd: any) => {
        if (!pd.projeto_id) return;
        perdasByProjeto[pd.projeto_id] = (perdasByProjeto[pd.projeto_id] || 0) + (pd.valor || 0);
      });
      
      // Map to Projeto interface com dados agregados
      const mapped = projetosData.map((proj: any) => ({
        id: proj.id,
        nome: proj.nome,
        descricao: proj.descricao || null,
        status: proj.status,
        data_inicio: proj.data_inicio,
        data_fim_prevista: proj.data_fim_prevista,
        orcamento_inicial: proj.orcamento_inicial || 0,
        saldo_bookmakers: bookmakersByProjeto[proj.id]?.saldo || 0,
        saldo_bookmakers_by_moeda: {
          BRL: bookmakersByProjeto[proj.id]?.saldoBRL || 0,
          USD: bookmakersByProjeto[proj.id]?.saldoUSD || 0,
        },
        saldo_irrecuperavel: bookmakersByProjeto[proj.id]?.irrecuperavel || 0,
        total_bookmakers: bookmakersByProjeto[proj.id]?.count || 0,
        lucro_operacional: lucroByProjeto[proj.id]?.total || 0,
        lucro_by_moeda: {
          BRL: lucroByProjeto[proj.id]?.BRL || 0,
          USD: lucroByProjeto[proj.id]?.USD || 0,
        },
        operadores_ativos: operadoresByProjeto[proj.id] || 0,
        perdas_confirmadas: perdasByProjeto[proj.id] || 0,
      }));
      
      setProjetos(mapped);
    } catch (error: any) {
      toast.error("Erro ao carregar projetos: " + error.message);
    } finally {
      setLoading(false);
    }
  }, [user, isOperator]);

  useEffect(() => {
    fetchProjetos();
  }, [fetchProjetos]);

  const filteredProjetos = projetos.filter((proj) => {
    const matchesSearch = proj.nome.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesStatus = statusFilter === "all" || proj.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

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

  const handleDeleteSuccess = () => {
    fetchProjetos();
    setProjetoToDelete(null);
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
      case "ARQUIVADO": return "bg-purple-500/20 text-purple-400 border-purple-500/30";
      default: return "bg-gray-500/20 text-gray-400 border-gray-500/30";
    }
  };

  const getStatusLabel = (status: string) => {
    switch (status) {
      case "PLANEJADO": return "Planejado";
      case "EM_ANDAMENTO": return "Em Andamento";
      case "PAUSADO": return "Pausado";
      case "FINALIZADO": return "Finalizado";
      case "ARQUIVADO": return "Arquivado";
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
          canCreate('projetos', 'projetos.create') && (
            <Button onClick={() => handleOpenDialog(null, "create")}>
              <Plus className="mr-2 h-4 w-4" />
              Novo Projeto
            </Button>
          )
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
                <SelectItem value="ARQUIVADO">Arquivado</SelectItem>
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
      ) : filteredProjetos.length === 0 ? (
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
          {filteredProjetos.map((projeto) => (
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
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            toggleFavorite(projeto.id);
                          }}
                          className="p-1 rounded hover:bg-muted transition-colors"
                        >
                          <Star
                            className={`h-4 w-4 ${
                              isFavorite(projeto.id)
                                ? "fill-yellow-400 text-yellow-400"
                                : "text-muted-foreground hover:text-yellow-400"
                            }`}
                          />
                        </button>
                      </TooltipTrigger>
                      <TooltipContent>
                        {isFavorite(projeto.id) ? "Remover dos atalhos" : "Adicionar aos atalhos"}
                      </TooltipContent>
                    </Tooltip>
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
                    {/* Saldo Bookmakers com breakdown por moeda */}
                    <div className="flex items-center justify-between text-sm">
                      <div className="flex items-center gap-2 text-muted-foreground">
                        <Wallet className="h-4 w-4" />
                        <span>Saldo Bookmakers</span>
                      </div>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <span className="font-medium cursor-help">
                            {formatCurrency(projeto.saldo_bookmakers || 0)}
                          </span>
                        </TooltipTrigger>
                        <TooltipContent side="left" className="text-xs">
                          <div className="space-y-1">
                            {(projeto.saldo_bookmakers_by_moeda?.BRL || 0) > 0 && (
                              <div>BRL: {formatCurrency(projeto.saldo_bookmakers_by_moeda?.BRL || 0)}</div>
                            )}
                            {(projeto.saldo_bookmakers_by_moeda?.USD || 0) > 0 && (
                              <div>USD: ${(projeto.saldo_bookmakers_by_moeda?.USD || 0).toFixed(2)}</div>
                            )}
                            {(projeto.saldo_bookmakers_by_moeda?.USD || 0) > 0 && (
                              <div className="text-muted-foreground pt-1 border-t">
                                Total consolidado em BRL (PTAX)
                              </div>
                            )}
                          </div>
                        </TooltipContent>
                      </Tooltip>
                    </div>
                    
                    {/* Mostrar breakdown visual se houver USD */}
                    {(projeto.saldo_bookmakers_by_moeda?.USD || 0) > 0 && (
                      <div className="flex items-center justify-end gap-2 text-xs text-muted-foreground -mt-1">
                        <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                          R$ {(projeto.saldo_bookmakers_by_moeda?.BRL || 0).toFixed(0)}
                        </Badge>
                        <span>+</span>
                        <Badge variant="outline" className="text-[10px] px-1.5 py-0 border-emerald-500/30 text-emerald-400">
                          $ {(projeto.saldo_bookmakers_by_moeda?.USD || 0).toFixed(2)}
                        </Badge>
                      </div>
                    )}
                    
                    {(() => {
                      // Lucro operacional = soma de lucro_prejuizo das apostas LIQUIDADAS - perdas confirmadas
                      const lucroOperacional = (projeto.lucro_operacional || 0) - (projeto.perdas_confirmadas || 0);
                      const isPositive = lucroOperacional >= 0;
                      const hasUSD = (projeto.lucro_by_moeda?.USD || 0) !== 0;
                      
                      return (
                        <>
                          <div className="flex items-center justify-between text-sm">
                            <div className="flex items-center gap-2 text-muted-foreground">
                              {isPositive ? (
                                <TrendingUp className="h-4 w-4 text-emerald-500" />
                              ) : (
                                <TrendingDown className="h-4 w-4 text-red-500" />
                              )}
                              <span>Lucro</span>
                            </div>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <span className={`font-medium cursor-help ${isPositive ? 'text-emerald-500' : 'text-red-500'}`}>
                                  {isPositive ? '+' : ''}{formatCurrency(lucroOperacional)}
                                </span>
                              </TooltipTrigger>
                              <TooltipContent side="left" className="text-xs">
                                <div className="space-y-1">
                                  {(projeto.lucro_by_moeda?.BRL || 0) !== 0 && (
                                    <div>BRL: {formatCurrency(projeto.lucro_by_moeda?.BRL || 0)}</div>
                                  )}
                                  {hasUSD && (
                                    <div>USD: ${(projeto.lucro_by_moeda?.USD || 0).toFixed(2)}</div>
                                  )}
                                  {hasUSD && (
                                    <div className="text-muted-foreground pt-1 border-t">
                                      Total consolidado em BRL (PTAX)
                                    </div>
                                  )}
                                </div>
                              </TooltipContent>
                            </Tooltip>
                          </div>
                          
                          {/* Breakdown visual de lucro se houver USD */}
                          {hasUSD && (
                            <div className="flex items-center justify-end gap-2 text-xs text-muted-foreground -mt-1">
                              <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                                R$ {(projeto.lucro_by_moeda?.BRL || 0).toFixed(0)}
                              </Badge>
                              <span>+</span>
                              <Badge variant="outline" className="text-[10px] px-1.5 py-0 border-emerald-500/30 text-emerald-400">
                                $ {(projeto.lucro_by_moeda?.USD || 0).toFixed(2)}
                              </Badge>
                            </div>
                          )}
                        </>
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
                  {canEdit('projetos', 'projetos.edit') && (
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
                  )}
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
                  {canDelete('projetos', 'projetos.delete') && (
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
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        <Card>
          <ScrollArea className="h-[600px]">
            <div className="divide-y">
              {filteredProjetos.map((projeto) => (
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
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            toggleFavorite(projeto.id);
                          }}
                          className="p-1 rounded hover:bg-muted transition-colors"
                        >
                          <Star
                            className={`h-4 w-4 ${
                              isFavorite(projeto.id)
                                ? "fill-yellow-400 text-yellow-400"
                                : "text-muted-foreground hover:text-yellow-400"
                            }`}
                          />
                        </button>
                      </TooltipTrigger>
                      <TooltipContent>
                        {isFavorite(projeto.id) ? "Remover dos atalhos" : "Adicionar aos atalhos"}
                      </TooltipContent>
                    </Tooltip>
                    <Badge className={getStatusColor(projeto.status)}>
                      {getStatusLabel(projeto.status)}
                    </Badge>
                    <div className="flex gap-1">
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
                      {canEdit('projetos', 'projetos.edit') && (
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
                      )}
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
                      {canDelete('projetos', 'projetos.delete') && (
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
                      )}
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

      <ProjetoDeleteDialog
        open={deleteDialogOpen}
        onOpenChange={setDeleteDialogOpen}
        projeto={projetoToDelete}
        onSuccess={handleDeleteSuccess}
      />

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
