import { useState, useEffect, useCallback, useMemo } from "react";
import { cn } from "@/lib/utils";
import { useTabWorkspace } from "@/hooks/useTabWorkspace";
import { useWorkspaceChangeListener } from "@/hooks/useWorkspaceCacheClear";
import { useNavigate, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { useTopBar } from "@/contexts/TopBarContext";
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
  List,
  Edit,
  ExternalLink,
  Trash2,
  Eye,
  Star,
  Kanban,
  Briefcase
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
import { ProjetosKanbanView } from "@/components/projetos/kanban";
import { TIPO_PROJETO_CONFIG, TipoProjeto } from "@/types/projeto";
import { TipoProjetoIcon } from "@/components/projetos/TipoProjetoIcon";
import { fetchProjetosLucroOperacionalKpi } from "@/services/fetchProjetosLucroOperacionalKpi";

type SaldoByMoeda = Record<string, number>;

interface Projeto {
  id: string;
  projeto_id?: string;
  nome: string;
  descricao?: string | null;
  status: string;
  tipo_projeto?: string;
  data_inicio: string | null;
  data_fim_prevista: string | null;
  orcamento_inicial: number;
  operadores_ativos?: number;
  total_gasto_operadores?: number;
  saldo_bookmakers?: number;
  saldo_bookmakers_by_moeda?: SaldoByMoeda;
  saldo_irrecuperavel?: number;
  saldo_irrecuperavel_by_moeda?: SaldoByMoeda;
  total_depositado?: number;
  total_sacado?: number;
  total_bookmakers?: number;
  perdas_confirmadas?: number;
  lucro_operacional?: number;
  lucro_by_moeda?: SaldoByMoeda;
  /** Lucro Realizado = Saques Confirmados - Depósitos Confirmados */
  lucro_realizado?: number;
  display_order?: number;
  investidor_id?: string | null;
  is_broker?: boolean;
  moeda_consolidacao?: string;
}

export default function GestaoProjetos() {
  const navigate = useNavigate();
  const { user, role } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const { setContent: setTopBarContent } = useTopBar();
  
  // SEGURANÇA: workspaceId como dependência para isolamento multi-tenant
  const { workspaceId } = useTabWorkspace();
  
  // Aba ativa: projetos ou broker
  const activeSection = searchParams.get("section") || "projetos";
  const isBrokerSection = activeSection === "broker";
  
  const setActiveSection = (section: string) => {
    setSearchParams(prev => {
      prev.set("section", section);
      return prev;
    });
  };
  
  const [projetos, setProjetos] = useState<Projeto[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("EM_ANDAMENTO");
  const [tipoFilter, setTipoFilter] = useState<string>("all");
  
  // Recuperar preferência de visualização do localStorage
  const [viewMode, setViewMode] = useState<"list" | "kanban">(() => {
    if (typeof window === "undefined") return "kanban";
    const saved = localStorage.getItem("projetos-view-mode");
    // Migrar "cards" para "kanban" automaticamente
    return (saved === "list" || saved === "kanban") ? saved : "kanban";
  });
  
  // Persistir preferência de visualização
  const handleSetViewMode = (mode: "list" | "kanban") => {
    setViewMode(mode);
    localStorage.setItem("projetos-view-mode", mode);
  };
  
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
  
  // COTAÇÃO CENTRALIZADA — usada no cálculo consolidado do lucro operacional e no display
  const { cotacaoUSD, cotacaoEUR, cotacaoGBP, cotacaoMYR, cotacaoMXN, cotacaoARS, cotacaoCOP, loading: loadingCotacao } = useCotacoes();
  
  // Check if user is operator (should only see linked projects)
  const isOperator = role === 'operator';
  
  const USD_TO_BRL_DISPLAY = cotacaoUSD || 5.37;

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
      const [saldosRpcResult, operadoresResult, bookmakersCountResult, depositosResult, saquesResult] = await Promise.all([
        // USAR RPC CANÔNICA para saldo operável (inclui real + freebet + bonus - em_aposta)
        supabase.rpc("get_saldo_operavel_por_projeto", { p_projeto_ids: finalProjetoIds }),
        
        // Operadores ativos por projeto
        supabase
          .from("operador_projetos")
          .select("projeto_id, id")
          .in("projeto_id", finalProjetoIds)
          .eq("status", "ATIVO"),
        
        // Contagem de bookmakers e saldo irrecuperável por projeto
        supabase
          .from("bookmakers")
          .select("id, projeto_id, saldo_irrecuperavel, moeda")
          .in("projeto_id", finalProjetoIds)
          .eq("status", "ativo"),
        
        // Depósitos confirmados por projeto (para Lucro Realizado)
        // INCLUI DEPOSITO_VIRTUAL para paridade com Indicadores Financeiros
        supabase
          .from("cash_ledger")
          .select("projeto_id_snapshot, valor, moeda")
          .eq("status", "CONFIRMADO")
          .in("tipo_transacao", ["DEPOSITO", "DEPOSITO_VIRTUAL"])
          .in("projeto_id_snapshot", finalProjetoIds),
        
        // Saques confirmados por projeto (para Lucro Realizado)
        // INCLUI SAQUE_VIRTUAL para paridade com Indicadores Financeiros
        supabase
          .from("cash_ledger")
          .select("projeto_id_snapshot, valor_confirmado, valor, moeda")
          .eq("status", "CONFIRMADO")
          .in("tipo_transacao", ["SAQUE", "SAQUE_VIRTUAL"])
          .in("projeto_id_snapshot", finalProjetoIds),
      ]);
      
      // ARQUITETURA DAG: Fetch armazena dados BRUTOS por moeda
      // Conversão acontece APENAS no render usando cotação atual
      // Isso quebra o ciclo cotação → fetch → cotação
      
      // Mapear saldos da RPC canônica por projeto - DADOS BRUTOS POR MOEDA
      const bookmakersByProjeto: Record<string, { 
        saldo: number; 
        saldoBRL: number;
        saldoUSD: number;
        count: number; 
        irrecuperavel: number;
        irrecuperavelBRL: number;
        irrecuperavelUSD: number;
      }> = {};
      
      // Processar resultado da RPC canônica - ARMAZENAR APENAS DADOS BRUTOS
      (saldosRpcResult.data || []).forEach((row: any) => {
        const projetoId = row.projeto_id;
        const saldoBRL = Number(row.saldo_operavel_brl) || 0;
        const saldoUSD = Number(row.saldo_operavel_usd) || 0;
        // NÃO converter aqui - deixar para o render
        // saldo será calculado no mapping final usando cotação do render
        
        bookmakersByProjeto[projetoId] = {
          saldo: 0, // Será calculado no mapping final
          saldoBRL: saldoBRL,
          saldoUSD: saldoUSD,
          count: Number(row.total_bookmakers) || 0,
          irrecuperavel: 0, // Será calculado no mapping final
          irrecuperavelBRL: 0,
          irrecuperavelUSD: 0,
        };
      });
      
      // Agregar saldo irrecuperável separadamente - DADOS BRUTOS POR MOEDA
      (bookmakersCountResult.data || []).forEach((bk: any) => {
        if (!bk.projeto_id) return;
        const irrecuperavel = Number(bk.saldo_irrecuperavel) || 0;
        const moeda = bk.moeda || 'BRL';
        
        if (!bookmakersByProjeto[bk.projeto_id]) {
          bookmakersByProjeto[bk.projeto_id] = { 
            saldo: 0, saldoBRL: 0, saldoUSD: 0, 
            count: 0, irrecuperavel: 0, 
            irrecuperavelBRL: 0, irrecuperavelUSD: 0 
          };
        }
        
        // Armazenar por moeda - conversão no render
        if (moeda === 'USD') {
          bookmakersByProjeto[bk.projeto_id].irrecuperavelUSD += irrecuperavel;
        } else {
          bookmakersByProjeto[bk.projeto_id].irrecuperavelBRL += irrecuperavel;
        }
      });
      
      // Agregar lucro operacional por projeto (KPI-COMPATÍVEL):
      // FONTE ÚNICA desta tela: mesmo conjunto de módulos do KPI de Lucro do dashboard
      // Mapa de cotações para moedas não-USD/BRL
      const cotacoesExtra: Record<string, number> = {};
      if (cotacaoEUR > 0.001) cotacoesExtra['EUR'] = cotacaoEUR;
      if (cotacaoGBP > 0.001) cotacoesExtra['GBP'] = cotacaoGBP;
      if (cotacaoMYR > 0.001) cotacoesExtra['MYR'] = cotacaoMYR;
      if (cotacaoMXN > 0.001) cotacoesExtra['MXN'] = cotacaoMXN;
      if (cotacaoARS > 0.001) cotacoesExtra['ARS'] = cotacaoARS;
      if (cotacaoCOP > 0.001) cotacoesExtra['COP'] = cotacaoCOP;

      const lucroKpiByProjeto = await fetchProjetosLucroOperacionalKpi({
        projetoIds: finalProjetoIds,
        cotacaoUSD: USD_TO_BRL_DISPLAY,
        cotacoes: cotacoesExtra,
      });

      const lucroByProjeto: Record<string, Record<string, number>> = {};
      const lucroConsolidadoByProjeto: Record<string, number> = {};

      finalProjetoIds.forEach((projetoId) => {
        const lucroData = lucroKpiByProjeto[projetoId];
        lucroByProjeto[projetoId] = lucroData?.porMoeda || {};
        lucroConsolidadoByProjeto[projetoId] = lucroData?.consolidado || 0;
      });
      
      // Agregar operadores ativos por projeto
      const operadoresByProjeto: Record<string, number> = {};
      (operadoresResult.data || []).forEach((op: any) => {
        if (!op.projeto_id) return;
        operadoresByProjeto[op.projeto_id] = (operadoresByProjeto[op.projeto_id] || 0) + 1;
      });
      
      // Agregar Lucro Realizado por projeto: Saques - Depósitos (fluxo de caixa)
      // COM conversão de moeda para paridade com Indicadores Financeiros
      const convertToConsolidation = (valor: number, moeda: string) => {
        const m = (moeda || 'BRL').toUpperCase();
        if (m === 'USD' || m === 'USDT' || m === 'USDC') return valor * USD_TO_BRL_DISPLAY;
        if (cotacoesExtra[m]) return valor * cotacoesExtra[m];
        return valor;
      };
      
      const lucroRealizadoByProjeto: Record<string, number> = {};
      (depositosResult.data || []).forEach((dep: any) => {
        const pid = dep.projeto_id_snapshot;
        if (!pid) return;
        const valorConvertido = convertToConsolidation(Number(dep.valor) || 0, dep.moeda || 'BRL');
        lucroRealizadoByProjeto[pid] = (lucroRealizadoByProjeto[pid] || 0) - valorConvertido;
      });
      (saquesResult.data || []).forEach((saq: any) => {
        const pid = saq.projeto_id_snapshot;
        if (!pid) return;
        const valorSaque = Number(saq.valor_confirmado ?? saq.valor) || 0;
        const valorConvertido = convertToConsolidation(valorSaque, saq.moeda || 'BRL');
        lucroRealizadoByProjeto[pid] = (lucroRealizadoByProjeto[pid] || 0) + valorConvertido;
      });
      
      // Map to Projeto interface com dados agregados - APENAS DADOS BRUTOS
      // Campos consolidados (saldo_bookmakers, lucro_operacional) serão calculados no render
      const mapped = projetosData.map((proj: any) => {
        const bkData = bookmakersByProjeto[proj.id];
        const lucroData = lucroByProjeto[proj.id];
        
        const moedaConsolidacao = (proj.moeda_consolidacao || 'BRL').toUpperCase();
        // Valores consolidados vêm em BRL do KPI; converter para moeda do projeto
        const lucroOpBRL = lucroConsolidadoByProjeto[proj.id] || 0;
        const lucroRealBRL = lucroRealizadoByProjeto[proj.id] || 0;
        const lucroOpFinal = moedaConsolidacao === 'USD' && USD_TO_BRL_DISPLAY > 0
          ? lucroOpBRL / USD_TO_BRL_DISPLAY
          : lucroOpBRL;
        const lucroRealFinal = moedaConsolidacao === 'USD' && USD_TO_BRL_DISPLAY > 0
          ? lucroRealBRL / USD_TO_BRL_DISPLAY
          : lucroRealBRL;

        return {
          id: proj.id,
          nome: proj.nome,
          descricao: proj.descricao || null,
          status: proj.status,
          data_inicio: proj.data_inicio,
          data_fim_prevista: proj.data_fim_prevista,
          orcamento_inicial: proj.orcamento_inicial || 0,
          saldo_bookmakers: 0,
          saldo_bookmakers_by_moeda: {
            BRL: bkData?.saldoBRL || 0,
            USD: bkData?.saldoUSD || 0,
          },
          saldo_irrecuperavel: 0,
          saldo_irrecuperavel_by_moeda: {
            BRL: bkData?.irrecuperavelBRL || 0,
            USD: bkData?.irrecuperavelUSD || 0,
          },
          total_bookmakers: bkData?.count || 0,
          lucro_operacional: lucroOpFinal,
          lucro_by_moeda: lucroData || {},
          lucro_realizado: lucroRealFinal,
          operadores_ativos: operadoresByProjeto[proj.id] || 0,
          perdas_confirmadas: 0,
          display_order: proj.display_order || 0,
          tipo_projeto: proj.tipo_projeto || 'INTERNO',
          investidor_id: proj.investidor_id || null,
          is_broker: proj.is_broker === true,
          moeda_consolidacao: moedaConsolidacao,
        };
      });
      
      setProjetos(mapped);
    } catch (error: any) {
      toast.error("Erro ao carregar projetos: " + error.message);
    } finally {
      setLoading(false);
    }
  }, [user, isOperator, workspaceId, USD_TO_BRL_DISPLAY, cotacaoEUR, cotacaoGBP, cotacaoMYR, cotacaoMXN, cotacaoARS, cotacaoCOP]);

  // SEGURANÇA: Refetch quando workspace muda
  useEffect(() => {
    if (workspaceId) {
      fetchProjetos();
    }
  }, [fetchProjetos, workspaceId]);

  // Listener para reset de estados locais na troca de workspace
  useWorkspaceChangeListener(useCallback(() => {
    console.log("[GestaoProjetos] Workspace changed - resetting local state");
    setProjetos([]);
    setSelectedProjeto(null);
    setLoading(true);
  }, []));

  // Projetos filtrados por seção (antes do filtro de tipo, para calcular badges)
  const sectionFilteredProjetos = projetos.filter((proj) => {
    const matchesSearch = proj.nome.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesStatus = statusFilter === "all" || proj.status === statusFilter;
    const matchesSection = isBrokerSection 
      ? proj.is_broker === true
      : proj.is_broker !== true;
    return matchesSearch && matchesStatus && matchesSection;
  });

  // Agrupar por tipo para gerar badges dinâmicos
  const tipoCountMap = useMemo(() => {
    const map: Record<string, number> = {};
    sectionFilteredProjetos.forEach((proj) => {
      const tipo = (proj as any).tipo_projeto || 'OUTROS';
      map[tipo] = (map[tipo] || 0) + 1;
    });
    return map;
  }, [sectionFilteredProjetos]);

  const filteredProjetos = sectionFilteredProjetos.filter((proj) => {
    const matchesTipo = tipoFilter === "all" || (proj as any).tipo_projeto === tipoFilter;
    return matchesTipo;
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

  const MOEDA_SYMBOLS: Record<string, string> = {
    BRL: 'R$', USD: '$', EUR: '€', GBP: '£', MYR: 'RM', MXN: 'MX$', ARS: 'AR$', COP: 'COL$',
  };

  const formatCurrencyValue = (value: number, moeda: string = "BRL") => {
    const m = (moeda || "BRL").toUpperCase();
    const symbol = MOEDA_SYMBOLS[m] || m;
    return `${symbol} ${Math.abs(value).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
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

  // Inject title into global TopBar
  useEffect(() => {
    setTopBarContent(
      <Tooltip>
        <TooltipTrigger asChild>
          <div className="flex items-center gap-2 cursor-default">
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary/10">
              <FolderKanban className="h-4 w-4 text-primary" />
            </div>
            <span className="font-semibold text-sm">{isBrokerSection ? "Broker" : "Projetos"}</span>
          </div>
        </TooltipTrigger>
        <TooltipContent side="bottom">
          {isBrokerSection 
            ? "Gerencie projetos de contas recebidas de investidores"
            : "Gerencie seus projetos e acompanhe o progresso"
          }
        </TooltipContent>
      </Tooltip>
    );
    return () => setTopBarContent(null);
  }, [setTopBarContent, isBrokerSection]);

  return (
    <div className="flex-1 flex flex-col min-h-0 w-full max-w-full overflow-x-hidden p-4 md:p-6 lg:p-8 space-y-4">
      {canCreate('projetos', 'projetos.create') && (
        <div className="flex justify-end">
          <Button onClick={() => handleOpenDialog(null, "create")}>
            <Plus className="mr-2 h-4 w-4" />
            <span className="hidden sm:inline">{isBrokerSection ? "Novo Projeto Broker" : "Novo Projeto"}</span>
            <span className="sm:hidden">Novo</span>
          </Button>
        </div>
      )}

      {/* Section Tabs: Projetos | Broker */}
      <div className="flex-shrink-0">
        <Tabs value={activeSection} onValueChange={setActiveSection}>
          <TabsList className="bg-muted/30">
            <TabsTrigger value="projetos" className="gap-2">
              <FolderKanban className="h-4 w-4" />
              Projetos
            </TabsTrigger>
            <TabsTrigger value="broker" className="gap-2">
              <Briefcase className="h-4 w-4" />
              Broker
            </TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

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
            
            <div className="flex gap-2 flex-shrink-0 flex-wrap">
              <Select value={tipoFilter} onValueChange={setTipoFilter}>
                <SelectTrigger className="w-full sm:w-[140px] md:w-[160px]">
                  <SelectValue placeholder="Tipo" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos Tipos</SelectItem>
                  {Object.entries(TIPO_PROJETO_CONFIG).map(([key, config]) => (
                    <SelectItem key={key} value={key}>
                      <div className="flex items-center gap-2">
                        <TipoProjetoIcon lucideIcon={config.lucideIcon} className="h-3.5 w-3.5" />
                        <span>{config.label}</span>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-full sm:w-[140px] md:w-[160px]">
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
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant={viewMode === "kanban" ? "default" : "outline"}
                      size="icon"
                      onClick={() => handleSetViewMode("kanban")}
                    >
                      <Kanban className="h-4 w-4" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Kanban (arrastar para reorganizar)</TooltipContent>
                </Tooltip>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant={viewMode === "list" ? "default" : "outline"}
                      size="icon"
                      onClick={() => handleSetViewMode("list")}
                    >
                      <List className="h-4 w-4" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Visualização em lista</TooltipContent>
                </Tooltip>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Badges dinâmicos de tipo de projeto */}
      {Object.keys(tipoCountMap).length > 0 && (
        <div className="flex flex-wrap gap-2 flex-shrink-0">
          {Object.entries(tipoCountMap)
            .sort(([, a], [, b]) => b - a)
            .map(([tipo, count]) => {
              const config = TIPO_PROJETO_CONFIG[tipo as TipoProjeto];
              if (!config) return null;
              const isActive = tipoFilter === tipo;
              return (
                <button
                  key={tipo}
                  onClick={() => setTipoFilter(isActive ? "all" : tipo)}
                  className={cn(
                    "inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium border transition-all duration-200",
                    isActive
                      ? `${config.color} ring-2 ring-offset-1 ring-offset-background ring-current`
                      : `${config.color} opacity-70 hover:opacity-100`
                  )}
                >
                  <TipoProjetoIcon lucideIcon={config.lucideIcon} className="h-3 w-3" />
                  <span>{config.label}</span>
                  <span className="ml-0.5 px-1.5 py-0.5 rounded-full bg-background/30 text-[10px] font-bold leading-none">
                    {count}
                  </span>
                </button>
              );
            })}
          {tipoFilter !== "all" && (
            <button
              onClick={() => setTipoFilter("all")}
              className="inline-flex items-center gap-1 px-3 py-1.5 rounded-full text-xs font-medium border border-border/50 text-muted-foreground hover:text-foreground hover:border-border transition-colors"
            >
              Limpar filtro
            </button>
          )}
        </div>
      )}

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
        ) : viewMode === "kanban" ? (
          <ProjetosKanbanView
            projetos={filteredProjetos}
            isFavorite={isFavorite}
            toggleFavorite={toggleFavorite}
            onVisualizarOperadores={(projeto) => {
              setProjetoParaVisualizar(projeto);
              setVisualizarOperadoresOpen(true);
            }}
            onEdit={(projeto) => handleOpenDialog(projeto, "edit")}
            onDelete={(projeto) => {
              setProjetoToDelete(projeto);
              setDeleteDialogOpen(true);
            }}
            canEdit={canEdit('projetos', 'projetos.edit')}
            canDelete={canDelete('projetos', 'projetos.delete')}
            isBrokerSection={isBrokerSection}
            onReorder={(reorderedProjetos) => {
              // Atualizar estado local com nova ordem
              setProjetos(prev => 
                prev.map(p => {
                  const updated = reorderedProjetos.find(rp => rp.id === p.id);
                  return updated ? { ...p, display_order: updated.display_order } : p;
                })
              );
            }}
          />
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
                      <p className="text-xs text-muted-foreground">Lucro Operacional</p>
                      {(() => {
                        const lucroOperacional = projeto.lucro_operacional || 0;
                        const isPositive = lucroOperacional >= 0;
                        const moeda = projeto.moeda_consolidacao || 'BRL';
                        return (
                          <p className={`text-sm font-semibold ${isPositive ? 'text-emerald-500' : 'text-red-500'}`}>
                            {isPositive ? '+' : '-'}{formatCurrencyValue(lucroOperacional, moeda)}
                          </p>
                        );
                      })()}
                    </div>
                    <div className="text-right">
                      <p className="text-xs text-muted-foreground">Lucro Realizado</p>
                      {(() => {
                        const lr = projeto.lucro_realizado || 0;
                        const isPositive = lr >= 0;
                        const moeda = projeto.moeda_consolidacao || 'BRL';
                        return (
                          <p className={`text-sm font-medium ${isPositive ? 'text-emerald-500' : 'text-red-500'}`}>
                            {isPositive ? '+' : '-'}{formatCurrencyValue(lr, moeda)}
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
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button 
                            variant="ghost" 
                            size="icon"
                            onClick={(e) => {
                              e.stopPropagation();
                              setProjetoParaVisualizar(projeto);
                              setVisualizarOperadoresOpen(true);
                            }}
                          >
                            <Eye className="h-4 w-4" />
                          </Button>
                        </TooltipTrigger>
                       <TooltipContent side="bottom" className="z-[100]">Ver detalhes</TooltipContent>
                      </Tooltip>
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
        defaultTipoProjeto="INTERNO"
        isBrokerContext={isBrokerSection}
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
