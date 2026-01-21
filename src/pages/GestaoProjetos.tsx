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
import { useCotacoes } from "@/hooks/useCotacoes";
import { ProjectFinancialDisplay } from "@/components/projetos/ProjectFinancialDisplay";

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
  
  // COTAÇÃO CENTRALIZADA - Usa PTAX do BCB, nunca hardcoded
  const { cotacaoUSD, loading: loadingCotacao } = useCotacoes();
  const USD_TO_BRL = cotacaoUSD || 5.37; // Fallback apenas para renderização inicial

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
      const [saldosRpcResult, apostasResult, operadoresResult, perdasResult, girosGratisResult, cashbackManualResult, bookmakersCountResult] = await Promise.all([
        // USAR RPC CANÔNICA para saldo operável (inclui real + freebet + bonus - em_aposta)
        supabase.rpc("get_saldo_operavel_por_projeto", { p_projeto_ids: finalProjetoIds }),
        
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
          .eq("status", "CONFIRMADA"),
        
        // Giros grátis confirmados por projeto (valor_retorno é o lucro do giro)
        // Inclui dados da bookmaker para saber a moeda correta
        supabase
          .from("giros_gratis")
          .select("projeto_id, valor_retorno, bookmaker_id, bookmakers!inner(moeda)")
          .in("projeto_id", finalProjetoIds)
          .eq("status", "confirmado"),
        
        // Cashback manual por projeto (lançamentos manuais)
        supabase
          .from("cashback_manual")
          .select("projeto_id, valor, moeda_operacao, valor_brl_referencia")
          .in("projeto_id", finalProjetoIds),
        
        // Contagem de bookmakers e saldo irrecuperável por projeto
        supabase
          .from("bookmakers")
          .select("id, projeto_id, saldo_irrecuperavel, moeda")
          .in("projeto_id", finalProjetoIds)
          .eq("status", "ativo")
      ]);
      
      // COTAÇÃO CENTRALIZADA - Usa PTAX do BCB obtida via hook
      // NUNCA usar valores hardcoded conforme regra do sistema
      const USD_TO_BRL = cotacaoUSD;
      
      // Mapear saldos da RPC canônica por projeto
      const bookmakersByProjeto: Record<string, { 
        saldo: number; 
        saldoBRL: number;
        saldoUSD: number;
        count: number; 
        irrecuperavel: number 
      }> = {};
      
      // Processar resultado da RPC canônica
      (saldosRpcResult.data || []).forEach((row: any) => {
        const projetoId = row.projeto_id;
        const saldoBRL = Number(row.saldo_operavel_brl) || 0;
        const saldoUSD = Number(row.saldo_operavel_usd) || 0;
        // Converter USD para BRL para total consolidado
        const saldoConsolidado = saldoBRL + (saldoUSD * USD_TO_BRL);
        
        bookmakersByProjeto[projetoId] = {
          saldo: saldoConsolidado,
          saldoBRL: saldoBRL,
          saldoUSD: saldoUSD,
          count: Number(row.total_bookmakers) || 0,
          irrecuperavel: 0 // Será preenchido abaixo
        };
      });
      
      // Agregar saldo irrecuperável separadamente
      (bookmakersCountResult.data || []).forEach((bk: any) => {
        if (!bk.projeto_id) return;
        const irrecuperavel = Number(bk.saldo_irrecuperavel) || 0;
        const moeda = bk.moeda || 'BRL';
        
        if (!bookmakersByProjeto[bk.projeto_id]) {
          bookmakersByProjeto[bk.projeto_id] = { saldo: 0, saldoBRL: 0, saldoUSD: 0, count: 0, irrecuperavel: 0 };
        }
        
        if (moeda === 'USD') {
          bookmakersByProjeto[bk.projeto_id].irrecuperavel += irrecuperavel * USD_TO_BRL;
        } else {
          bookmakersByProjeto[bk.projeto_id].irrecuperavel += irrecuperavel;
        }
      });
      
      // Criar mapa de moeda por bookmaker_id para conversão dos giros grátis
      const bookmakerMoedaMap: Record<string, string> = {};
      (bookmakersCountResult.data || []).forEach((bk: any) => {
        if (bk.id) {
          bookmakerMoedaMap[bk.id] = bk.moeda || 'BRL';
        }
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
        if (moeda === 'USD' || moeda === 'USDT' || moeda === 'USDC') {
          lucroByProjeto[ap.projeto_id].USD += lucroOriginal;
          // Para total consolidado, usar BRL referência se existir, senão converter
          const valorBRL = ap.lucro_prejuizo_brl_referencia ?? (lucroOriginal * USD_TO_BRL);
          lucroByProjeto[ap.projeto_id].total += valorBRL;
        } else {
          lucroByProjeto[ap.projeto_id].BRL += lucroOriginal;
          lucroByProjeto[ap.projeto_id].total += lucroOriginal;
        }
      });
      
      // Agregar lucro de giros grátis confirmados por projeto
      // CORREÇÃO: Usar moeda da bookmaker para conversão correta
      (girosGratisResult.data || []).forEach((giro: any) => {
        if (!giro.projeto_id) return;
        if (!lucroByProjeto[giro.projeto_id]) {
          lucroByProjeto[giro.projeto_id] = { total: 0, BRL: 0, USD: 0 };
        }
        
        const valorRetorno = giro.valor_retorno || 0;
        // Buscar moeda da bookmaker via join (bookmakers.moeda)
        const moedaBookmaker = giro.bookmakers?.moeda || bookmakerMoedaMap[giro.bookmaker_id] || 'BRL';
        
        // Acumular por moeda da bookmaker
        if (moedaBookmaker === 'USD' || moedaBookmaker === 'USDT' || moedaBookmaker === 'USDC') {
          lucroByProjeto[giro.projeto_id].USD += valorRetorno;
          lucroByProjeto[giro.projeto_id].total += valorRetorno * USD_TO_BRL;
        } else {
          lucroByProjeto[giro.projeto_id].BRL += valorRetorno;
          lucroByProjeto[giro.projeto_id].total += valorRetorno;
        }
      });
      
      // Agregar lucro de cashback manual por projeto
      // CRÍTICO: Sempre converter via PTAX em tempo real para consistência
      // NÃO usar valor_brl_referencia pois pode ter sido gravado com cotação incorreta
      (cashbackManualResult.data || []).forEach((cb: any) => {
        if (!cb.projeto_id) return;
        if (!lucroByProjeto[cb.projeto_id]) {
          lucroByProjeto[cb.projeto_id] = { total: 0, BRL: 0, USD: 0 };
        }
        
        const valor = cb.valor || 0;
        const moeda = cb.moeda_operacao || 'BRL';
        
        // Acumular por moeda original
        if (moeda === 'USD' || moeda === 'USDT' || moeda === 'USDC') {
          lucroByProjeto[cb.projeto_id].USD += valor;
          // SEMPRE converter via PTAX atual (não usar valor_brl_referencia do banco)
          lucroByProjeto[cb.projeto_id].total += valor * USD_TO_BRL;
        } else {
          lucroByProjeto[cb.projeto_id].BRL += valor;
          lucroByProjeto[cb.projeto_id].total += valor;
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
  }, [user, isOperator, cotacaoUSD]);

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
    <div className="flex-1 flex flex-col min-h-0 w-full max-w-full overflow-x-hidden p-4 md:p-6 lg:p-8 space-y-4">
      <PageHeader
        title="Projetos"
        description="Gerencie seus projetos e acompanhe o progresso"
        pagePath="/projetos"
        pageIcon="FolderKanban"
        actions={
          canCreate('projetos', 'projetos.create') && (
            <Button onClick={() => handleOpenDialog(null, "create")}>
              <Plus className="mr-2 h-4 w-4" />
              <span className="hidden sm:inline">Novo Projeto</span>
              <span className="sm:hidden">Novo</span>
            </Button>
          )
        }
      />

      {/* Filtros - Card com contenção */}
      <Card className="flex-shrink-0 overflow-hidden">
        <CardContent className="p-4 md:pt-6 md:p-6">
          <div className="flex flex-col gap-3 md:flex-row md:gap-4">
            <div className="relative flex-1 min-w-0">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Buscar por nome..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10 w-full"
              />
            </div>
            
            <div className="flex gap-2 flex-shrink-0">
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-full sm:w-[140px] md:w-[180px]">
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
              <div className="flex gap-1 flex-shrink-0">
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
          </div>
        </CardContent>
      </Card>

      {/* Lista de Projetos - Área flexível */}
      <div className="flex-1 min-h-0">
        {loading ? (
          <div className="grid gap-3 md:gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {[1, 2, 3, 4].map((i) => (
              <Card key={i} className="overflow-hidden">
                <CardContent className="p-4 md:pt-6">
                  <Skeleton className="h-24 w-full" />
                </CardContent>
              </Card>
            ))}
          </div>
        ) : filteredProjetos.length === 0 ? (
          <Card className="overflow-hidden">
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
          <div className="grid gap-3 md:gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {filteredProjetos.map((projeto) => (
              <Card 
                key={projeto.id} 
                className="cursor-pointer hover:border-primary/50 transition-colors overflow-hidden flex flex-col"
                style={{ contain: "layout paint" }}
                onClick={() => navigate(`/projeto/${projeto.id}`)}
              >
                <CardHeader className="pb-2 flex-shrink-0">
                  <div className="flex items-start justify-between gap-2 min-w-0">
                    <div className="flex items-center gap-2 md:gap-3 min-w-0 flex-1">
                      <div className="h-8 w-8 md:h-10 md:w-10 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                        <FolderKanban className="h-4 w-4 md:h-5 md:w-5 text-primary" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <CardTitle className="text-sm md:text-base truncate">{projeto.nome}</CardTitle>
                        {projeto.descricao && (
                          <p className="text-xs md:text-sm text-muted-foreground line-clamp-1">
                            {projeto.descricao}
                          </p>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5 flex-shrink-0">
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
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setProjetoParaVisualizar(projeto);
                              setVisualizarOperadoresOpen(true);
                            }}
                            className="p-1 rounded hover:bg-muted transition-colors"
                          >
                            <Eye className="h-4 w-4 text-muted-foreground hover:text-primary" />
                          </button>
                        </TooltipTrigger>
                        <TooltipContent>Ver Operadores</TooltipContent>
                      </Tooltip>
                      <Badge className={`${getStatusColor(projeto.status)} text-xs`}>
                        {getStatusLabel(projeto.status)}
                      </Badge>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="flex-1 min-h-0">
                  <div className="space-y-2 md:space-y-3">
                    {projeto.data_inicio && (
                      <div className="flex items-center gap-2 text-xs md:text-sm text-muted-foreground">
                        <Calendar className="h-3.5 w-3.5 md:h-4 md:w-4 flex-shrink-0" />
                        <span className="truncate">
                          Início: {format(new Date(projeto.data_inicio), "dd/MM/yyyy", { locale: ptBR })}
                        </span>
                      </div>
                    )}
                    <div className="flex items-center gap-2 text-xs md:text-sm text-muted-foreground">
                      <Users className="h-3.5 w-3.5 md:h-4 md:w-4 flex-shrink-0" />
                      <span className="truncate">{projeto.operadores_ativos || 0} operador(es) • {projeto.total_bookmakers || 0} bookmaker(s)</span>
                    </div>
                  
                  <div className="pt-2 border-t space-y-3">
                    {/* Saldo Bookmakers - Novo design com hierarquia clara */}
                    <ProjectFinancialDisplay
                      type="saldo"
                      breakdown={{
                        BRL: projeto.saldo_bookmakers_by_moeda?.BRL || 0,
                        USD: projeto.saldo_bookmakers_by_moeda?.USD || 0,
                      }}
                      totalConsolidado={projeto.saldo_bookmakers || 0}
                      cotacaoPTAX={USD_TO_BRL}
                      isMultiCurrency={(projeto.saldo_bookmakers_by_moeda?.USD || 0) > 0}
                    />
                    
                    {/* Lucro - Mesmo padrão do Saldo */}
                    {(() => {
                      const lucroOperacional = (projeto.lucro_operacional || 0) - (projeto.perdas_confirmadas || 0);
                      const hasUSD = (projeto.lucro_by_moeda?.USD || 0) !== 0;
                      
                      return (
                        <ProjectFinancialDisplay
                          type="lucro"
                          breakdown={{
                            BRL: projeto.lucro_by_moeda?.BRL || 0,
                            USD: projeto.lucro_by_moeda?.USD || 0,
                          }}
                          totalConsolidado={lucroOperacional}
                          cotacaoPTAX={USD_TO_BRL}
                          isMultiCurrency={hasUSD}
                        />
                      );
                    })()}
                  </div>
                </div>
                  <div className="flex items-center justify-end gap-2 mt-3 md:mt-4 pt-3 md:pt-4 border-t">
                    {canEdit('projetos', 'projetos.edit') && (
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button 
                            variant="outline" 
                            size="icon"
                            className="h-8 w-8 md:h-9 md:w-9"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleOpenDialog(projeto, "edit");
                            }}
                          >
                            <Edit className="h-4 w-4" />
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent>Editar Projeto</TooltipContent>
                      </Tooltip>
                    )}
                    {canDelete('projetos', 'projetos.delete') && (
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button 
                            variant="outline" 
                            size="icon"
                            className="h-8 w-8 md:h-9 md:w-9 text-destructive hover:text-destructive hover:bg-destructive/10"
                            onClick={(e) => {
                              e.stopPropagation();
                              setProjetoToDelete(projeto);
                              setDeleteDialogOpen(true);
                            }}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent>Excluir Projeto</TooltipContent>
                      </Tooltip>
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
      </div>

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
