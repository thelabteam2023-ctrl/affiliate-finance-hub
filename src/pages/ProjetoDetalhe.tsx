import { useState, useEffect, useMemo, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent } from "@/components/ui/tabs";
import { ResponsiveTabsList, TabItem } from "@/components/ui/responsive-tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { KpiBreakdownTooltip, CountBreakdownTooltip } from "@/components/ui/kpi-breakdown-tooltip";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { useProjetoResultado } from "@/hooks/useProjetoResultado";
import { useKpiBreakdowns } from "@/hooks/useKpiBreakdowns";
import { useProjectFavorites } from "@/hooks/useProjectFavorites";
import { useProjectModules } from "@/hooks/useProjectModules";
import { useProjectTabPreference } from "@/hooks/useProjectTabPreference";
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
  HelpCircle,
  AlertTriangle,
  Percent,
  Gift,
  Star,
  Settings2,
  ChevronDown,
  ArrowLeftRight,
  Sparkles,
  Zap,
  Puzzle,
  ShieldAlert
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
import { ProjetoPromocoesTab } from "@/components/projeto-detalhe/ProjetoPromocoesTab";
import { ProjetoCiclosTab } from "@/components/projeto-detalhe/ProjetoCiclosTab";
import { ProjetoSurebetTab } from "@/components/projeto-detalhe/ProjetoSurebetTab";
import { ProjetoValueBetTab } from "@/components/projeto-detalhe/ProjetoValueBetTab";
import { ProjetoDuploGreenTab } from "@/components/projeto-detalhe/ProjetoDuploGreenTab";
import { ProjetoBonusArea } from "@/components/projeto-detalhe/bonus";
import { ProjetoCashbackTab } from "@/components/projeto-detalhe/ProjetoCashbackTab";
import { SaldoOperavelCard } from "@/components/projeto-detalhe/SaldoOperavelCard";
import { ProjetoGestaoTab } from "@/components/projeto-detalhe/ProjetoGestaoTab";
import { ProjetoDialog } from "@/components/projetos/ProjetoDialog";
import { GlobalActionsBar } from "@/components/projeto-detalhe/GlobalActionsBar";
import { ModuleActivationDialog } from "@/components/projeto-detalhe/ModuleActivationDialog";
import { LimitationSection } from "@/components/projeto-detalhe/limitation/LimitationSection";
import { SetDefaultTabButton } from "@/components/projeto-detalhe/SetDefaultTabButton";
import { useActionAccess } from "@/hooks/useModuleAccess";
import { getOperationalDateRangeForQuery } from "@/utils/dateUtils";
// REMOVIDO: OperationalFiltersProvider - filtros agora são isolados por aba

// Icon map for dynamic modules
const MODULE_ICON_MAP: Record<string, React.ElementType> = {
  ArrowLeftRight,
  Sparkles,
  Zap,
  Gift,
  Coins,
  Puzzle,
};

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
  const [entregaAtiva, setEntregaAtiva] = useState<{ data_fim_prevista: string | null } | null>(null);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  
  // Project favorites
  const { isFavorite, toggleFavorite } = useProjectFavorites();
  const { canEdit } = useActionAccess();
  
  // Project modules - dynamic menu
  const { activeModules, isModuleActive, activateModule, refresh: refreshModules, loading: modulesLoading, error: modulesError } = useProjectModules(id);
  
  // Module activation dialog state
  const [moduleActivationDialog, setModuleActivationDialog] = useState<{
    open: boolean;
    moduleId: string;
    targetTab: string;
  }>({ open: false, moduleId: "", targetTab: "" });
  
  // Hook de formatação de moeda do projeto
  const { formatCurrency, formatChartAxis } = useProjetoCurrency(id);
  
  // Project tab preference (página inicial por projeto)
  const { defaultTab, loading: tabPreferenceLoading, isDefaultTab } = useProjectTabPreference(id);
  const hasAppliedDefaultTab = useRef(false);
  
  // KPIs sempre mostram dados completos (sem filtro de período - cada aba usa seu próprio)
  const [activeTab, setActiveTab] = useState("apostas");
  
  // Refresh trigger - incrementado toda vez que uma aposta/bonus é criado
  const [refreshTrigger, setRefreshTrigger] = useState(0);
  
  // KPIs should only show on performance tabs
  const showKpis = ["visao-geral", "apostas", "ciclos"].includes(activeTab);
  
  // Build dynamic tabs based on active modules - with safe fallback
  const dynamicTabs = useMemo(() => {
    // Base tabs that are always visible (these are the "menu padrão")
    // Note: "Gestão" is rendered as a tabGroup dropdown, not a direct tab
    const baseTabs: TabItem[] = [
      { value: "visao-geral", label: "Visão Geral", icon: <LayoutDashboard className="h-3.5 w-3.5 md:h-4 md:w-4" /> },
      { value: "apostas", label: "Todas Apostas", icon: <Target className="h-3.5 w-3.5 md:h-4 md:w-4" /> },
      { value: "vinculos", label: "Vínculos", icon: <Link2 className="h-3.5 w-3.5 md:h-4 md:w-4" /> },
    ];

    // If modules are still loading or there was an error, just show base tabs
    if (modulesLoading || modulesError) {
      return baseTabs;
    }

    // Module tabs - only show if module is active
    const moduleTabs: TabItem[] = [];
    
    // Safe check - only add if isModuleActive function works
    try {
      // Promoções tab appears when EITHER freebets OR giros_gratis is active
      const hasPromocoes = isModuleActive("freebets") || isModuleActive("giros_gratis");
      if (hasPromocoes) {
        moduleTabs.push({ value: "promocoes", label: "Promoções", icon: <Gift className="h-3.5 w-3.5 md:h-4 md:w-4" /> });
      }
      if (isModuleActive("bonus")) {
        moduleTabs.push({ value: "bonus", label: "Bônus", icon: <Coins className="h-3.5 w-3.5 md:h-4 md:w-4" /> });
      }
      if (isModuleActive("surebet")) {
        moduleTabs.push({ value: "surebet", label: "Surebet", icon: <ArrowLeftRight className="h-3.5 w-3.5 md:h-4 md:w-4" /> });
      }
      if (isModuleActive("valuebet")) {
        moduleTabs.push({ value: "valuebet", label: "ValueBet", icon: <Sparkles className="h-3.5 w-3.5 md:h-4 md:w-4" /> });
      }
      if (isModuleActive("duplogreen")) {
        moduleTabs.push({ value: "duplogreen", label: "Duplo Green", icon: <Zap className="h-3.5 w-3.5 md:h-4 md:w-4" /> });
      }
      if (isModuleActive("cashback")) {
        moduleTabs.push({ value: "cashback", label: "Cashback", icon: <Percent className="h-3.5 w-3.5 md:h-4 md:w-4" /> });
      }
    } catch (e) {
      console.error("Error checking active modules:", e);
    }

    // Insert module tabs between "apostas" and "vinculos"
    // baseTabs: [visao-geral, apostas, vinculos]
    // Result: [visao-geral, apostas, ...moduleTabs, vinculos]
    return [...baseTabs.slice(0, 2), ...moduleTabs, ...baseTabs.slice(2)];
  }, [activeModules, isModuleActive, modulesLoading, modulesError]);

  // Handle tab change with module activation prompt
  const handleTabChange = (tabValue: string) => {
    // Base tabs that are always available (don't need module activation)
    const baseTabs = ["visao-geral", "apostas", "vinculos", "gestao", "modulos", "ciclos", "perdas"];
    
    if (baseTabs.includes(tabValue)) {
      setActiveTab(tabValue);
      return;
    }
    
    // Module tabs - check if active (only if modules are loaded)
    const moduleTabMap: Record<string, string> = {
      promocoes: "freebets",
      bonus: "bonus",
      surebet: "surebet",
      valuebet: "valuebet",
      duplogreen: "duplogreen",
      cashback: "cashback",
    };

    const moduleId = moduleTabMap[tabValue];
    
    // If modules haven't loaded yet, don't try to check activation
    if (modulesLoading || modulesError) {
      // Allow navigation but don't show content (tab content will handle empty state)
      setActiveTab(tabValue);
      return;
    }
    
    if (moduleId && !isModuleActive(moduleId)) {
      // Show activation dialog
      setModuleActivationDialog({ open: true, moduleId, targetTab: tabValue });
      return;
    }

    setActiveTab(tabValue);
  };

  // Map tab keys to their labels for SetDefaultTabButton
  const getTabLabel = (tabKey: string): string => {
    const tabLabels: Record<string, string> = {
      "visao-geral": "Visão Geral",
      "apostas": "Todas Apostas",
      "vinculos": "Vínculos",
      "promocoes": "Promoções",
      "bonus": "Bônus",
      "surebet": "Surebet",
      "valuebet": "ValueBet",
      "duplogreen": "Duplo Green",
      "cashback": "Cashback",
      "modulos": "Módulos",
      "ciclos": "Ciclos",
      "perdas": "Perdas",
    };
    return tabLabels[tabKey] || tabKey;
  };

  // Check if a tab is valid (exists in dynamicTabs or tabGroups)
  const isValidTab = (tabKey: string): boolean => {
    const baseTabs = ["visao-geral", "apostas", "vinculos", "modulos", "ciclos", "perdas"];
    if (baseTabs.includes(tabKey)) return true;
    
    // Check module tabs
    const moduleTabMap: Record<string, string> = {
      promocoes: "freebets",
      bonus: "bonus",
      surebet: "surebet",
      valuebet: "valuebet",
      duplogreen: "duplogreen",
      cashback: "cashback",
    };
    
    const moduleId = moduleTabMap[tabKey];
    if (moduleId && !modulesLoading && !modulesError) {
      return isModuleActive(moduleId);
    }
    
    return false;
  };

  // Apply default tab preference on initial load
  useEffect(() => {
    if (
      !tabPreferenceLoading && 
      !modulesLoading && 
      !hasAppliedDefaultTab.current && 
      defaultTab
    ) {
      hasAppliedDefaultTab.current = true;
      
      // Verify the default tab is still valid (module might have been deactivated)
      if (isValidTab(defaultTab)) {
        setActiveTab(defaultTab);
      } else {
        // Fallback: show toast and use default tab
        toast.info("Página inicial indisponível", {
          description: `"${getTabLabel(defaultTab)}" não está mais disponível. Você pode definir outra página inicial.`,
        });
      }
    }
  }, [defaultTab, tabPreferenceLoading, modulesLoading, modulesError, isModuleActive]);
  
  // Função centralizada para disparar refresh em todas as abas
  const triggerGlobalRefresh = () => {
    setRefreshTrigger(prev => prev + 1);
    fetchApostasResumo();
    refreshResultado();
    refreshBreakdowns();
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

  // Hook para breakdowns dinâmicos dos KPIs por módulo
  const { breakdowns: kpiBreakdowns, refresh: refreshBreakdowns } = useKpiBreakdowns({
    projetoId: id || '',
    dataInicio,
    dataFim,
    moedaConsolidacao: projetoResultado?.moedaConsolidacao || 'BRL',
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
      let apostasQuery = supabase
        .from("apostas_unificada")
        .select("stake, lucro_prejuizo, lucro_prejuizo_brl_referencia, moeda_operacao, status, resultado")
        .eq("projeto_id", id);
      
      // Build query for cashback_manual
      let cashbackQuery = supabase
        .from("cashback_manual")
        .select("valor, moeda_operacao, valor_brl_referencia")
        .eq("projeto_id", id);
      
      // CRÍTICO: Usar getOperationalDateRangeForQuery para garantir timezone operacional (São Paulo)
      if (start && end) {
        const { startUTC, endUTC } = getOperationalDateRangeForQuery(start, end);
        apostasQuery = apostasQuery.gte("data_aposta", startUTC);
        apostasQuery = apostasQuery.lte("data_aposta", endUTC);
        // Cashback usa data (não timestamp), então mantém formato YYYY-MM-DD
        const startDateStr = start.toISOString().split("T")[0];
        const endDateStr = end.toISOString().split("T")[0];
        cashbackQuery = cashbackQuery.gte("data_credito", startDateStr);
        cashbackQuery = cashbackQuery.lte("data_credito", endDateStr);
      } else if (start) {
        const { startUTC } = getOperationalDateRangeForQuery(start, start);
        apostasQuery = apostasQuery.gte("data_aposta", startUTC);
        cashbackQuery = cashbackQuery.gte("data_credito", start.toISOString().split("T")[0]);
      } else if (end) {
        const { endUTC } = getOperationalDateRangeForQuery(end, end);
        apostasQuery = apostasQuery.lte("data_aposta", endUTC);
        cashbackQuery = cashbackQuery.lte("data_credito", end.toISOString().split("T")[0]);
      }
      
      const [apostasResult, cashbackResult] = await Promise.all([
        apostasQuery,
        cashbackQuery
      ]);
      
      if (apostasResult.error) throw apostasResult.error;
      
      const todasApostas = apostasResult.data || [];
      const cashbacks = cashbackResult.data || [];
      
      // Calculate lucro from apostas (com conversão de moeda)
      const lucroApostas = todasApostas.reduce((acc, a) => {
        // Usar valor BRL de referência se disponível, senão usar lucro_prejuizo
        const lucro = a.lucro_prejuizo_brl_referencia ?? Number(a.lucro_prejuizo || 0);
        return acc + lucro;
      }, 0);
      
      // Calculate lucro from cashback manual (é lucro!)
      const lucroCashback = cashbacks.reduce((acc, cb) => {
        // Usar valor BRL de referência se disponível
        const valor = cb.valor_brl_referencia ?? Number(cb.valor || 0);
        return acc + valor;
      }, 0);
      
      // Calculate summary from all apostas
      const summary: ApostasResumo = {
        total_apostas: todasApostas.length,
        apostas_pendentes: todasApostas.filter(a => a.status === "PENDENTE").length,
        greens: todasApostas.filter(a => a.resultado === "GREEN").length,
        reds: todasApostas.filter(a => a.resultado === "RED").length,
        voids: todasApostas.filter(a => a.resultado === "VOID").length,
        meio_greens: todasApostas.filter(a => a.resultado === "MEIO_GREEN" || a.resultado === "HALF").length,
        meio_reds: todasApostas.filter(a => a.resultado === "MEIO_RED").length,
        total_stake: todasApostas.reduce((acc, a) => acc + Number(a.stake || 0), 0),
        lucro_total: lucroApostas + lucroCashback, // Inclui cashback como lucro
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

      // Fetch ciclo ativo (vigente - com data_inicio <= hoje e data_fim_prevista >= hoje)
      const hoje = new Date().toISOString().split('T')[0];
      const { data: cicloData } = await supabase
        .from("projeto_ciclos")
        .select("data_fim_prevista")
        .eq("projeto_id", id)
        .eq("status", "EM_ANDAMENTO")
        .lte("data_inicio", hoje)
        .gte("data_fim_prevista", hoje)
        .order("numero_ciclo", { ascending: false })
        .limit(1)
        .maybeSingle();

      setEntregaAtiva(cicloData);

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

  const getDiasAteFimCiclo = (): number | null => {
    if (!entregaAtiva?.data_fim_prevista) return null;
    const hoje = new Date();
    const fimCiclo = new Date(entregaAtiva.data_fim_prevista);
    return differenceInDays(fimCiclo, hoje);
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
    // Filtros agora são isolados por aba - cada tab usa seu próprio useTabFilters
    <div className="flex-1 flex flex-col min-h-0 w-full max-w-full overflow-x-hidden p-4 md:p-6 lg:p-8 space-y-4">
    {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 flex-shrink-0">
        <div className="flex items-center gap-3 md:gap-4 min-w-0">
          <Button variant="ghost" size="icon" className="flex-shrink-0" onClick={() => navigate("/projetos")}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div className="flex items-center gap-2 md:gap-3 min-w-0">
            <div className="h-10 w-10 md:h-12 md:w-12 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
              <FolderKanban className="h-5 w-5 md:h-6 md:w-6 text-primary" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-lg md:text-2xl font-bold tracking-tight truncate">{projeto.nome}</h2>
                <Badge className={`${getStatusColor(projeto.status)} text-xs`}>
                  {getStatusLabel(projeto.status)}
                </Badge>
                {getDiasAteFimCiclo() !== null && (
                  <span className="text-xs md:text-sm text-muted-foreground flex items-center gap-1">
                    <Clock className="h-3 w-3" />
                    {getDiasAteFimCiclo()} {getDiasAteFimCiclo() === 1 ? 'dia' : 'dias'} até fim do ciclo
                  </span>
                )}
              </div>
              {projeto.descricao && (
                <p className="text-muted-foreground text-sm truncate hidden sm:block">{projeto.descricao}</p>
              )}
              {projeto.tem_investimento_crypto && (
                <Badge className="bg-orange-500/20 text-orange-400 border-orange-500/30 text-xs mt-1">
                  <Coins className="h-3 w-3 mr-1" />
                  Crypto
                </Badge>
              )}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0 self-end sm:self-auto">
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
        <div className="grid gap-3 md:gap-4 grid-cols-2 md:grid-cols-5 flex-shrink-0">
          {/* Saldo Operável - KPI estratégico transversal */}
          <SaldoOperavelCard projetoId={id!} />
          {/* Apostas - Com breakdown por módulo */}
          <CountBreakdownTooltip
            breakdown={kpiBreakdowns?.apostas || null}
            title="Entradas por Módulo"
          >
            <Card className="overflow-hidden cursor-help" style={{ contain: "layout paint" }}>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-1 md:pb-2 p-3 md:p-6">
                <CardTitle className="text-xs md:text-sm font-medium">Apostas</CardTitle>
                <Target className="h-3.5 w-3.5 md:h-4 md:w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent className="p-3 pt-0 md:p-6 md:pt-0">
                <div className="text-lg md:text-2xl font-bold">{apostasResumo?.total_apostas || 0}</div>
                <div className="flex flex-wrap gap-x-1.5 md:gap-x-2 gap-y-0.5 text-[10px] md:text-xs">
                  <span className="text-emerald-500">{apostasResumo?.greens || 0} G</span>
                  <span className="text-red-500">{apostasResumo?.reds || 0} R</span>
                  <span className="text-lime-400">{apostasResumo?.meio_greens || 0} ½G</span>
                  <span className="text-orange-400">{apostasResumo?.meio_reds || 0} ½R</span>
                  <span className="text-gray-400">{apostasResumo?.voids || 0} V</span>
                </div>
              </CardContent>
            </Card>
          </CountBreakdownTooltip>

          {/* Volume em Apostas - Com breakdown por módulo */}
          <KpiBreakdownTooltip
            breakdown={kpiBreakdowns?.volume || null}
            formatValue={formatCurrency}
            title="Volume por Módulo"
          >
            <Card className="overflow-hidden cursor-help" style={{ contain: "layout paint" }}>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-1 md:pb-2 p-3 md:p-6">
                <CardTitle className="text-xs md:text-sm font-medium">Volume</CardTitle>
                <DollarSign className="h-3.5 w-3.5 md:h-4 md:w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent className="p-3 pt-0 md:p-6 md:pt-0">
                <div className="text-lg md:text-2xl font-bold truncate">{formatCurrency(projetoResultado?.totalStaked || 0)}</div>
                <p className="text-[10px] md:text-xs text-muted-foreground">
                  Total apostado
                </p>
              </CardContent>
            </Card>
          </KpiBreakdownTooltip>

          {/* Resultado/Lucro - Com breakdown dinâmico por módulo */}
          <KpiBreakdownTooltip
            breakdown={kpiBreakdowns?.lucro || null}
            formatValue={formatCurrency}
            title="Lucro por Módulo"
          >
            <Card className="overflow-hidden cursor-help" style={{ contain: "layout paint" }}>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-1 md:pb-2 p-3 md:p-6">
                <CardTitle className="text-xs md:text-sm font-medium">
                  {(projetoResultado?.netProfit || 0) >= 0 ? "Lucro" : "Prejuízo"}
                </CardTitle>
                {(projetoResultado?.netProfit || 0) >= 0 ? (
                  <TrendingUp className="h-3.5 w-3.5 md:h-4 md:w-4 text-emerald-500" />
                ) : (
                  <TrendingDown className="h-3.5 w-3.5 md:h-4 md:w-4 text-red-500" />
                )}
              </CardHeader>
              <CardContent className="p-3 pt-0 md:p-6 md:pt-0">
                <div className={`text-lg md:text-2xl font-bold truncate ${(projetoResultado?.netProfit || 0) >= 0 ? 'text-emerald-500' : 'text-red-500'}`}>
                  {formatCurrency(Math.abs(projetoResultado?.netProfit || 0))}
                </div>
                <p className="text-[10px] md:text-xs text-muted-foreground truncate">
                  Resultado consolidado
                </p>
              </CardContent>
            </Card>
          </KpiBreakdownTooltip>

          {/* ROI - Com tooltip explicativo */}
          <TooltipProvider>
            <Tooltip delayDuration={200}>
              <TooltipTrigger asChild>
                <Card className="overflow-hidden cursor-help" style={{ contain: "layout paint" }}>
                  <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-1 md:pb-2 p-3 md:p-6">
                    <CardTitle className="text-xs md:text-sm font-medium">ROI</CardTitle>
                    <Percent className="h-3.5 w-3.5 md:h-4 md:w-4 text-muted-foreground" />
                  </CardHeader>
                  <CardContent className="p-3 pt-0 md:p-6 md:pt-0">
                    <div className={`text-lg md:text-2xl font-bold ${(kpiBreakdowns?.roi?.total || 0) >= 0 ? 'text-emerald-500' : 'text-red-500'}`}>
                      {(kpiBreakdowns?.roi?.total || 0).toFixed(2)}%
                    </div>
                    <p className="text-[10px] md:text-xs text-muted-foreground">
                      Retorno sobre investimento
                    </p>
                  </CardContent>
                </Card>
              </TooltipTrigger>
              <TooltipContent side="bottom" className="max-w-[240px] p-3" sideOffset={8}>
                <div className="space-y-2">
                  <p className="text-xs font-semibold border-b border-border pb-1.5">Cálculo do ROI</p>
                  <div className="space-y-1 text-xs">
                    <div className="flex justify-between gap-3">
                      <span className="text-muted-foreground">Lucro Total:</span>
                      <span className={(kpiBreakdowns?.roi?.lucroTotal || 0) >= 0 ? "text-emerald-500" : "text-red-500"}>
                        {formatCurrency(kpiBreakdowns?.roi?.lucroTotal || 0)}
                      </span>
                    </div>
                    <div className="flex justify-between gap-3">
                      <span className="text-muted-foreground">Volume Total:</span>
                      <span>{formatCurrency(kpiBreakdowns?.roi?.volumeTotal || 0)}</span>
                    </div>
                  </div>
                  <div className="border-t border-border pt-1.5 text-xs">
                    <div className="flex justify-between items-center">
                      <span className="text-muted-foreground">ROI = Lucro ÷ Volume</span>
                      <span className={cn(
                        "font-bold",
                        (kpiBreakdowns?.roi?.total || 0) >= 0 ? "text-emerald-500" : "text-red-500"
                      )}>
                        {(kpiBreakdowns?.roi?.total || 0).toFixed(2)}%
                      </span>
                    </div>
                  </div>
                </div>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>
      )}

      {/* Tabs - Área flexível com contenção */}
      <Tabs defaultValue="apostas" value={activeTab} onValueChange={handleTabChange} className="flex-1 flex flex-col min-h-0 space-y-3 md:space-y-4">
        <div className="flex-shrink-0 overflow-hidden" style={{ contain: "layout" }}>
          <ResponsiveTabsList
            tabs={dynamicTabs}
            tabGroups={[
              {
                label: "Gestão",
                icon: <Settings2 className="h-3.5 w-3.5 md:h-4 md:w-4" />,
                items: [
                  { value: "modulos", label: "Módulos", icon: <Puzzle className="h-4 w-4" /> },
                  { value: "limitacoes", label: "Limitações", icon: <ShieldAlert className="h-4 w-4" /> },
                  { value: "ciclos", label: "Ciclos", icon: <Clock className="h-4 w-4" /> },
                  { value: "perdas", label: "Perdas", icon: <AlertTriangle className="h-4 w-4" /> },
                ],
              },
            ]}
            activeTab={activeTab}
            onTabChange={handleTabChange}
            minVisibleTabs={2}
            extraContent={
              <div className="flex items-center gap-1.5">
                <SetDefaultTabButton
                  projectId={id!}
                  tabKey={activeTab}
                  tabLabel={getTabLabel(activeTab)}
                />
                <GlobalActionsBar 
                  projetoId={id!}
                  activeTab={activeTab}
                  onApostaCreated={triggerGlobalRefresh}
                  onBonusCreated={triggerGlobalRefresh}
                  onNavigateToTab={setActiveTab}
                />
              </div>
            }
          />
        </div>

        {/* Conteúdo das abas com contenção */}
        <div className="flex-1 min-h-0 overflow-hidden">
          <TabsContent value="visao-geral" forceMount className={cn("h-full m-0", activeTab !== "visao-geral" && "hidden")}>
            <ProjetoDashboardTab 
              projetoId={id!} 
            />
          </TabsContent>

          <TabsContent value="apostas" forceMount className={cn("h-full m-0", activeTab !== "apostas" && "hidden")}>
            <ProjetoApostasTab 
              projetoId={id!} 
              onDataChange={triggerGlobalRefresh}
              refreshTrigger={refreshTrigger}
              formatCurrency={formatCurrency}
            />
          </TabsContent>

          <TabsContent value="promocoes" forceMount className={cn("h-full m-0", activeTab !== "promocoes" && "hidden")}>
            <ProjetoPromocoesTab 
              projetoId={id!} 
              refreshTrigger={refreshTrigger}
              onDataChange={triggerGlobalRefresh}
              formatCurrency={formatCurrency}
            />
          </TabsContent>

          <TabsContent value="bonus" forceMount className={cn("h-full m-0", activeTab !== "bonus" && "hidden")}>
            <ProjetoBonusArea 
              projetoId={id!} 
              refreshTrigger={refreshTrigger}
            />
          </TabsContent>

          <TabsContent value="surebet" forceMount className={cn("h-full m-0", activeTab !== "surebet" && "hidden")}>
            <ProjetoSurebetTab 
              projetoId={id!} 
              onDataChange={triggerGlobalRefresh}
              refreshTrigger={refreshTrigger}
            />
          </TabsContent>

          <TabsContent value="valuebet" forceMount className={cn("h-full m-0", activeTab !== "valuebet" && "hidden")}>
            <ProjetoValueBetTab 
              projetoId={id!} 
              onDataChange={triggerGlobalRefresh}
              refreshTrigger={refreshTrigger}
            />
          </TabsContent>

          <TabsContent value="duplogreen" forceMount className={cn("h-full m-0", activeTab !== "duplogreen" && "hidden")}>
            <ProjetoDuploGreenTab 
              projetoId={id!} 
              onDataChange={triggerGlobalRefresh}
              refreshTrigger={refreshTrigger}
            />
          </TabsContent>

          <TabsContent value="cashback" className="h-full m-0">
            <ProjetoCashbackTab projetoId={id!} />
          </TabsContent>

          <TabsContent value="vinculos" className="h-full m-0">
            <ProjetoVinculosTab projetoId={id!} />
          </TabsContent>

          <TabsContent value="modulos" className="h-full m-0">
            <ProjetoGestaoTab projetoId={id!} />
          </TabsContent>

          <TabsContent value="limitacoes" className="h-full m-0">
            <div className="h-full overflow-y-auto py-4 px-1">
              <div className="max-w-5xl mx-auto">
                <LimitationSection projetoId={id!} />
              </div>
            </div>
          </TabsContent>

          <TabsContent value="ciclos" className="h-full m-0">
            <ProjetoCiclosTab projetoId={id!} formatCurrency={formatCurrency} />
          </TabsContent>

          <TabsContent value="perdas" className="h-full m-0">
            <ProjetoPerdasTab projetoId={id!} onDataChange={triggerGlobalRefresh} formatCurrency={formatCurrency} />
          </TabsContent>
        </div>

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

      {/* Module Activation Dialog */}
      <ModuleActivationDialog
        open={moduleActivationDialog.open}
        onOpenChange={(open) => setModuleActivationDialog({ ...moduleActivationDialog, open })}
        moduleId={moduleActivationDialog.moduleId}
        onActivate={async () => {
          const success = await activateModule(moduleActivationDialog.moduleId);
          if (success) {
            await refreshModules();
            setActiveTab(moduleActivationDialog.targetTab);
          }
          return success;
        }}
        onSkip={() => {}}
      />
    </div>
  );
}