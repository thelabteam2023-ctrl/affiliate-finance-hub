import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { useProjetoResultado } from "@/hooks/useProjetoResultado";
import { useProjectFavorites } from "@/hooks/useProjectFavorites";
import { 
  ArrowLeft, 
  FolderKanban, 
  LayoutDashboard,
  Target,
  Link2,
  DollarSign,
  TrendingUp,
  TrendingDown,
  Clock,
  Edit,
  Coins,
  AlertTriangle,
  Percent,
  Gift,
  Star,
  Settings2,
  ChevronDown,
  ArrowLeftRight,
  Sparkles,
  Zap
} from "lucide-react";
import { useProjetoCurrency } from "@/hooks/useProjetoCurrency";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { differenceInDays } from "date-fns";
import { ProjetoDashboardTab } from "@/components/projeto-detalhe/ProjetoDashboardTab";
import { ProjetoApostasTab } from "@/components/projeto-detalhe/ProjetoApostasTab";
import { ProjetoVinculosTab } from "@/components/projeto-detalhe/ProjetoVinculosTab";
import { ProjetoPerdasTab } from "@/components/projeto-detalhe/ProjetoPerdasTab";
import { ProjetoFreebetsTab } from "@/components/projeto-detalhe/ProjetoFreebetsTab";
import { ProjetoCiclosTab } from "@/components/projeto-detalhe/ProjetoCiclosTab";
import { ProjetoSurebetTab } from "@/components/projeto-detalhe/ProjetoSurebetTab";
import { ProjetoValueBetTab } from "@/components/projeto-detalhe/ProjetoValueBetTab";
import { ProjetoDuploGreenTab } from "@/components/projeto-detalhe/ProjetoDuploGreenTab";
import { ProjetoBonusArea } from "@/components/projeto-detalhe/bonus";
import { ProjetoDialog } from "@/components/projetos/ProjetoDialog";
import { GlobalActionsBar } from "@/components/projeto-detalhe/GlobalActionsBar";
import { useActionAccess } from "@/hooks/useModuleAccess";

interface Projeto {
  id: string;
  nome: string;
  descricao: string | null;
  status: string;
  data_inicio: string | null;
  data_fim_prevista: string | null;
  data_fim_real: string | null;
  orcamento_inicial: number | null;
  observacoes: string | null;
  tem_investimento_crypto: boolean;
  conciliado: boolean;
  modelo_absorcao_taxas: string;
}

interface ProjetoResumo {
  operadores_ativos: number;
  total_gasto_operadores: number;
}

interface ApostasResumo {
  total_apostas: number;
  apostas_pendentes: number;
  greens: number;
  reds: number;
  voids: number;
  meio_greens: number;
  meio_reds: number;
  total_stake: number;
  lucro_total: number;
  roi_percentual: number;
}

// Tipo removido - cada aba gerencia seu próprio filtro de período

export default function ProjetoDetalhe() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [projeto, setProjeto] = useState<Projeto | null>(null);
  const [resumo, setResumo] = useState<ProjetoResumo | null>(null);
  const [apostasResumo, setApostasResumo] = useState<ApostasResumo | null>(null);
  const [loading, setLoading] = useState(true);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  
  // Project favorites
  const { isFavorite, toggleFavorite } = useProjectFavorites();
  const { canEdit } = useActionAccess();
  
  // Hook de formatação de moeda do projeto
  const { formatCurrency } = useProjetoCurrency(id);
  
  // KPIs sempre mostram dados completos (sem filtro de período - cada aba usa seu próprio)
  const [activeTab, setActiveTab] = useState("apostas");
  
  // Refresh trigger - incrementado toda vez que uma aposta/bonus é criado
  const [refreshTrigger, setRefreshTrigger] = useState(0);
  
  // KPIs should only show on performance tabs
  const showKpis = ["visao-geral", "apostas", "perdas", "ciclos"].includes(activeTab);
  
  // Função centralizada para disparar refresh em todas as abas
  const triggerGlobalRefresh = () => {
    setRefreshTrigger(prev => prev + 1);
    fetchApostasResumo();
    refreshResultado();
  };

  // KPIs sempre mostram dados completos do projeto (sem filtro de período no nível da página)
  // Cada aba tem seu próprio filtro interno (padrão Bônus/Freebets)
  const getDateRangeFromFilter = (): { start: Date | null; end: Date | null } => {
    // Sempre retorna todo o período para KPIs de resumo
    return { start: null, end: null };
  };

  // Get date range for resultado hook
  const { start: dataInicio, end: dataFim } = getDateRangeFromFilter();
  
  // FONTE ÚNICA DE VERDADE: Hook centralizado para resultado do projeto
  const { resultado: projetoResultado, refresh: refreshResultado } = useProjetoResultado({
    projetoId: id || '',
    dataInicio,
    dataFim,
  });

  useEffect(() => {
    if (id) {
      fetchProjeto();
    }
  }, [id]);

  // Refetch KPIs apenas quando projeto mudar (sem dependência de filtro de período)
  // As abas usam seus próprios filtros internos
  
  const fetchApostasResumo = async () => {
    try {
      const { start, end } = getDateRangeFromFilter();
      
      // Build query for apostas_unificada (all types combined)
      let query = supabase
        .from("apostas_unificada")
        .select("stake, lucro_prejuizo, status, resultado")
        .eq("projeto_id", id);
      
      if (start) {
        query = query.gte("data_aposta", start.toISOString());
      }
      if (end) {
        query = query.lte("data_aposta", end.toISOString());
      }
      
      const { data: todasApostas, error } = await query;
      
      if (error) throw error;
      
      // Calculate summary from all apostas
      const summary: ApostasResumo = {
        total_apostas: (todasApostas || []).length,
        apostas_pendentes: (todasApostas || []).filter(a => a.status === "PENDENTE").length,
        greens: (todasApostas || []).filter(a => a.resultado === "GREEN").length,
        reds: (todasApostas || []).filter(a => a.resultado === "RED").length,
        voids: (todasApostas || []).filter(a => a.resultado === "VOID").length,
        meio_greens: (todasApostas || []).filter(a => a.resultado === "MEIO_GREEN" || a.resultado === "HALF").length,
        meio_reds: (todasApostas || []).filter(a => a.resultado === "MEIO_RED").length,
        total_stake: (todasApostas || []).reduce((acc, a) => acc + Number(a.stake || 0), 0),
        lucro_total: (todasApostas || []).reduce((acc, a) => acc + Number(a.lucro_prejuizo || 0), 0),
        roi_percentual: 0
      };
      
      // Calculate ROI
      if (summary.total_stake > 0) {
        summary.roi_percentual = (summary.lucro_total / summary.total_stake) * 100;
      }
      
      setApostasResumo(summary);
    } catch (error: any) {
      console.error("Erro ao carregar resumo de apostas:", error.message);
    }
  };

  const fetchProjeto = async () => {
    try {
      setLoading(true);
      
      // Fetch project details
      const { data: projetoData, error: projetoError } = await supabase
        .from("projetos")
        .select("*")
        .eq("id", id)
        .maybeSingle();

      if (projetoError) throw projetoError;
      if (!projetoData) {
        toast.error("Projeto não encontrado");
        navigate("/projetos");
        return;
      }

      setProjeto(projetoData);

      // Fetch operator count from operador_projetos
      const { data: opData } = await supabase
        .from("operador_projetos")
        .select("id")
        .eq("projeto_id", id)
        .eq("status", "ATIVO");

      const operadoresAtivos = opData?.length || 0;

      // Fetch total paid to operators
      const { data: pagamentosData } = await supabase
        .from("cash_ledger")
        .select("valor")
        .eq("tipo_transacao", "PAGAMENTO_OPERADOR");

      const totalGastoOperadores = pagamentosData?.reduce((acc, p) => acc + Number(p.valor || 0), 0) || 0;

      setResumo({
        operadores_ativos: operadoresAtivos,
        total_gasto_operadores: totalGastoOperadores,
      });

      // Fetch apostas summary (will use period filter)
      await fetchApostasResumo();

    } catch (error: any) {
      toast.error("Erro ao carregar projeto: " + error.message);
    } finally {
      setLoading(false);
    }
  };

  // Funções de período removidas - cada aba usa seu próprio StandardTimeFilter interno

  // formatCurrency agora vem do useProjetoCurrency

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

  const getDiasAtivos = () => {
    if (!projeto?.data_inicio) return 0;
    const inicio = new Date(projeto.data_inicio);
    const fim = projeto.data_fim_real ? new Date(projeto.data_fim_real) : new Date();
    return differenceInDays(fim, inicio);
  };

  if (loading) {
    return (
      <div className="flex-1 space-y-4 p-4 md:p-8 pt-6">
        <Skeleton className="h-10 w-64" />
        <div className="grid gap-4 md:grid-cols-4">
          {[1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-32" />
          ))}
        </div>
        <Skeleton className="h-96" />
      </div>
    );
  }

  if (!projeto) {
    return null;
  }

  return (
    <div className="flex-1 space-y-4 p-4 md:p-8 pt-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => navigate("/projetos")}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div className="flex items-center gap-3">
            <div className="h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center">
              <FolderKanban className="h-6 w-6 text-primary" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-2xl font-bold tracking-tight">{projeto.nome}</h2>
                <Badge className={getStatusColor(projeto.status)}>
                  {getStatusLabel(projeto.status)}
                </Badge>
                {projeto.data_inicio && (
                  <span className="text-sm text-muted-foreground flex items-center gap-1">
                    <Clock className="h-3 w-3" />
                    {getDiasAtivos()} dias
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2 mt-1">
                {projeto.descricao && (
                  <p className="text-muted-foreground">{projeto.descricao}</p>
                )}
              </div>
              {projeto.tem_investimento_crypto && (
                <div className="flex items-center gap-2 mt-1">
                  <Badge className="bg-orange-500/20 text-orange-400 border-orange-500/30">
                    <Coins className="h-3 w-3 mr-1" />
                    Crypto
                  </Badge>
                  <Badge className={projeto.conciliado ? "bg-emerald-500/20 text-emerald-400" : "bg-amber-500/20 text-amber-400"}>
                    {projeto.conciliado ? "Conciliado" : "Pendente"}
                  </Badge>
                </div>
              )}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button 
                  variant="outline" 
                  size="icon"
                  onClick={() => {
                    if (id) toggleFavorite(id);
                  }}
                >
                  <Star 
                    className={`h-4 w-4 transition-colors ${
                      id && isFavorite(id) 
                        ? "fill-amber-400 text-amber-400" 
                        : "text-muted-foreground hover:text-amber-400"
                    }`} 
                  />
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                <p>{id && isFavorite(id) ? "Remover dos atalhos" : "Adicionar aos atalhos"}</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
          {canEdit('projetos', 'projetos.edit') && (
            <Button variant="outline" onClick={() => setEditDialogOpen(true)}>
              <Edit className="mr-2 h-4 w-4" />
              Editar Projeto
            </Button>
          )}
        </div>
      </div>

      {/* Filtro de período removido - cada aba usa seu próprio StandardTimeFilter interno (padrão Bônus/Freebets) */}

      {/* KPIs Resumo - Only show on performance tabs */}
      {showKpis && (
      <div className="grid gap-4 md:grid-cols-4">
        {/* Apostas */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Apostas</CardTitle>
            <Target className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{apostasResumo?.total_apostas || 0}</div>
            <div className="flex flex-wrap gap-x-2 gap-y-1 text-xs">
              <span className="text-emerald-500">{apostasResumo?.greens || 0} G</span>
              <span className="text-red-500">{apostasResumo?.reds || 0} R</span>
              <span className="text-lime-400">{apostasResumo?.meio_greens || 0} ½G</span>
              <span className="text-orange-400">{apostasResumo?.meio_reds || 0} ½R</span>
              <span className="text-gray-400">{apostasResumo?.voids || 0} V</span>
            </div>
          </CardContent>
        </Card>

        {/* Volume em Apostas */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Volume</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatCurrency(projetoResultado?.totalStaked || 0)}</div>
            <p className="text-xs text-muted-foreground">
              Total apostado
            </p>
          </CardContent>
        </Card>

        {/* Resultado - FONTE ÚNICA DE VERDADE (usa projetoResultado.netProfit) */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">
              {(projetoResultado?.netProfit || 0) >= 0 ? "Lucro" : "Prejuízo"}
            </CardTitle>
            {(projetoResultado?.netProfit || 0) >= 0 ? (
              <TrendingUp className="h-4 w-4 text-emerald-500" />
            ) : (
              <TrendingDown className="h-4 w-4 text-red-500" />
            )}
          </CardHeader>
          <CardContent>
            <div className={`text-2xl font-bold ${(projetoResultado?.netProfit || 0) >= 0 ? 'text-emerald-500' : 'text-red-500'}`}>
              {formatCurrency(Math.abs(projetoResultado?.netProfit || 0))}
            </div>
            <p className="text-xs text-muted-foreground">
              {projetoResultado?.operationalLossesConfirmed ? (
                <>Bruto: {formatCurrency(projetoResultado.grossProfitFromBets)} - Perdas: {formatCurrency(projetoResultado.operationalLossesConfirmed)}</>
              ) : (
                "Resultado do período"
              )}
            </p>
          </CardContent>
        </Card>

        {/* ROI - FONTE ÚNICA DE VERDADE */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">ROI</CardTitle>
            <Percent className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className={`text-2xl font-bold ${(projetoResultado?.roi || 0) >= 0 ? 'text-emerald-500' : 'text-red-500'}`}>
              {(projetoResultado?.roi || 0).toFixed(2)}%
            </div>
            <p className="text-xs text-muted-foreground">
              Retorno sobre investimento
            </p>
          </CardContent>
        </Card>
      </div>
      )}

      {/* Tabs */}
      <Tabs defaultValue="apostas" value={activeTab} onValueChange={setActiveTab} className="space-y-4">
        <TabsList className="flex-wrap">
          {/* Camada 1 - Operação (sempre visível) */}
          <TabsTrigger value="visao-geral" className="flex items-center gap-2">
            <LayoutDashboard className="h-4 w-4" />
            Visão Geral
          </TabsTrigger>
          <TabsTrigger value="apostas" className="flex items-center gap-2">
            <Target className="h-4 w-4" />
            Apostas Livres
          </TabsTrigger>
          <TabsTrigger value="freebets" className="flex items-center gap-2">
            <Gift className="h-4 w-4" />
            Freebets
          </TabsTrigger>
          <TabsTrigger value="bonus" className="flex items-center gap-2">
            <Coins className="h-4 w-4" />
            Bônus
          </TabsTrigger>
          <TabsTrigger value="surebet" className="flex items-center gap-2">
            <ArrowLeftRight className="h-4 w-4" />
            Surebet
          </TabsTrigger>
          <TabsTrigger value="valuebet" className="flex items-center gap-2">
            <Sparkles className="h-4 w-4" />
            ValueBet
          </TabsTrigger>
          <TabsTrigger value="duplogreen" className="flex items-center gap-2">
            <Zap className="h-4 w-4" />
            Duplo Green
          </TabsTrigger>
          <TabsTrigger value="vinculos" className="flex items-center gap-2">
            <Link2 className="h-4 w-4" />
            Vínculos
          </TabsTrigger>
          
          {/* Camada 2 - Gestão (dropdown) */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                className={cn(
                  "inline-flex items-center justify-center whitespace-nowrap rounded-sm px-3 py-1.5 text-sm font-medium ring-offset-background transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50",
                  ["ciclos", "perdas"].includes(activeTab)
                    ? "bg-background text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                <Settings2 className="h-4 w-4 mr-2" />
                Gestão
                <ChevronDown className="h-3 w-3 ml-1" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="min-w-[140px]">
              <DropdownMenuItem 
                onClick={() => setActiveTab("ciclos")}
                className={cn(
                  "flex items-center gap-2 cursor-pointer",
                  activeTab === "ciclos" && "bg-accent"
                )}
              >
                <Clock className="h-4 w-4" />
                Ciclos
              </DropdownMenuItem>
              <DropdownMenuItem 
                onClick={() => setActiveTab("perdas")}
                className={cn(
                  "flex items-center gap-2 cursor-pointer",
                  activeTab === "perdas" && "bg-accent"
                )}
              >
                <AlertTriangle className="h-4 w-4" />
                Perdas
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </TabsList>

        {/* Action Bar - Logo abaixo das abas */}
        <div className="flex items-center gap-3 pt-2 pb-1 border-b border-border/50">
          <GlobalActionsBar 
            projetoId={id!}
            activeTab={activeTab}
            onApostaCreated={triggerGlobalRefresh}
            onBonusCreated={triggerGlobalRefresh}
            onNavigateToTab={setActiveTab}
          />
        </div>

        <TabsContent value="visao-geral">
          <ProjetoDashboardTab 
            projetoId={id!} 
          />
        </TabsContent>

        <TabsContent value="apostas">
          <ProjetoApostasTab 
            projetoId={id!} 
            onDataChange={triggerGlobalRefresh}
            refreshTrigger={refreshTrigger}
            formatCurrency={formatCurrency}
          />
        </TabsContent>

        <TabsContent value="freebets">
          <ProjetoFreebetsTab 
            projetoId={id!} 
            refreshTrigger={refreshTrigger}
            onDataChange={triggerGlobalRefresh}
            formatCurrency={formatCurrency}
          />
        </TabsContent>

        <TabsContent value="bonus">
          <ProjetoBonusArea 
            projetoId={id!} 
            refreshTrigger={refreshTrigger}
          />
        </TabsContent>

        <TabsContent value="surebet">
          <ProjetoSurebetTab 
            projetoId={id!} 
            onDataChange={triggerGlobalRefresh}
            refreshTrigger={refreshTrigger}
          />
        </TabsContent>

        <TabsContent value="valuebet">
          <ProjetoValueBetTab 
            projetoId={id!} 
            onDataChange={triggerGlobalRefresh}
            refreshTrigger={refreshTrigger}
          />
        </TabsContent>

        <TabsContent value="duplogreen">
          <ProjetoDuploGreenTab 
            projetoId={id!} 
            onDataChange={triggerGlobalRefresh}
            refreshTrigger={refreshTrigger}
          />
        </TabsContent>

        <TabsContent value="vinculos">
          <ProjetoVinculosTab projetoId={id!} />
        </TabsContent>

        <TabsContent value="ciclos">
          <ProjetoCiclosTab projetoId={id!} formatCurrency={formatCurrency} />
        </TabsContent>

        <TabsContent value="perdas">
          <ProjetoPerdasTab projetoId={id!} onDataChange={triggerGlobalRefresh} formatCurrency={formatCurrency} />
        </TabsContent>

      </Tabs>

      {/* Edit Dialog */}
      <ProjetoDialog
        open={editDialogOpen}
        onOpenChange={setEditDialogOpen}
        projeto={{
          id: projeto.id,
          nome: projeto.nome,
          descricao: projeto.descricao,
          status: projeto.status,
          data_inicio: projeto.data_inicio,
          data_fim_prevista: projeto.data_fim_prevista,
          orcamento_inicial: projeto.orcamento_inicial || 0,
          tem_investimento_crypto: projeto.tem_investimento_crypto,
          conciliado: projeto.conciliado,
          modelo_absorcao_taxas: projeto.modelo_absorcao_taxas,
        }}
        mode="edit"
        onSuccess={fetchProjeto}
      />
    </div>
  );
}