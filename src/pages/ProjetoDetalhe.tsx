import { useState, useEffect, useMemo, useRef, useLayoutEffect, useCallback } from "react";
import { useTopBar } from "@/contexts/TopBarContext";
import { useParams, useNavigate, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
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
import { useProjectRealtimeSync } from "@/hooks/useProjectRealtimeSync";
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
  Plus,
  Archive,
  MoreVertical,
  Activity,
  CalendarDays,
  BarChart3,
  CalendarRange,
  Crosshair,
} from "lucide-react";
import { useProjetoCurrency } from "@/hooks/useProjetoCurrency";
import { useCotacoes } from "@/hooks/useCotacoes";
import { VolumeKPI } from "@/components/kpis/VolumeKPI"; // kept for potential future use
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { differenceInDays } from "date-fns";
import { ProjetoDashboardTab } from "@/components/projeto-detalhe/ProjetoDashboardTab";
import { FinancialMetricsPopover } from "@/components/projeto-detalhe/FinancialMetricsPopover";
import { ProjetoApostasTab } from "@/components/projeto-detalhe/ProjetoApostasTab";
import { ProjetoVinculosTab } from "@/components/projeto-detalhe/ProjetoVinculosTab";
import { ProjetoIncidentesTab } from "@/components/projeto-detalhe/ProjetoIncidentesTab";
import { ProjetoPromocoesTab } from "@/components/projeto-detalhe/ProjetoPromocoesTab";
import { ProjetoCiclosTab } from "@/components/projeto-detalhe/ProjetoCiclosTab";
import { ProjetoSurebetTab } from "@/components/projeto-detalhe/ProjetoSurebetTab";
import { ProjetoValueBetTab } from "@/components/projeto-detalhe/ProjetoValueBetTab";
import { ProjetoDuploGreenTab } from "@/components/projeto-detalhe/ProjetoDuploGreenTab";
import { ProjetoPunterTab } from "@/components/projeto-detalhe/ProjetoPunterTab";
import { ProjetoBonusArea } from "@/components/projeto-detalhe/bonus";
import { ProjetoCashbackTab } from "@/components/projeto-detalhe/ProjetoCashbackTab";
import { SaldoOperavelCard } from "@/components/projeto-detalhe/SaldoOperavelCard";
import { ProjetoGestaoTab } from "@/components/projeto-detalhe/ProjetoGestaoTab";
import { ProjetoPlanejamentoTab } from "@/components/projeto-detalhe/ProjetoPlanejamentoTab";
import { ShareLinkDialog } from "@/components/shared/ShareLinkDialog";

import { ProjetoDialog } from "@/components/projetos/ProjetoDialog";
import { GlobalActionsBar } from "@/components/projeto-detalhe/GlobalActionsBar";
import { ModuleActivationDialog } from "@/components/projeto-detalhe/ModuleActivationDialog";
// LimitationSection now rendered inside ProjetoIncidentesTab
import { SetDefaultTabButton } from "@/components/projeto-detalhe/SetDefaultTabButton";
import { useActionAccess } from "@/hooks/useModuleAccess";
import { getOperationalDateRangeForQuery, getTodayCivilDate } from "@/utils/dateUtils";
import { useInvalidateAfterMutation } from "@/hooks/useInvalidateAfterMutation";
// REMOVIDO: OperationalFiltersProvider - filtros agora são isolados por aba

// Icon map for dynamic modules
const MODULE_ICON_MAP: Record<string, React.ElementType> = {
  ArrowLeftRight,
  Sparkles,
  Zap,
  Gift,
  Coins,
  Puzzle,
  Crosshair,
};

interface Projeto {
  id: string;
  nome: string;
  descricao: string | null;
  status: string;
  tipo_projeto: string;
  data_inicio: string | null;
  data_fim_prevista: string | null;
  data_fim_real: string | null;
  orcamento_inicial: number | null;
  observacoes: string | null;
  tem_investimento_crypto: boolean;
  conciliado: boolean;
  modelo_absorcao_taxas: string;
  investidor_id: string | null;
  is_broker: boolean;
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
  const [entregaAtiva, setEntregaAtiva] = useState<{ data_inicio: string | null; data_fim_prevista: string | null } | null>(null);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [archiving, setArchiving] = useState(false);
  
  // Project favorites
  const { isFavorite, toggleFavorite } = useProjectFavorites();
  const { canEdit } = useActionAccess();
  const { setContent: setTopBarContent } = useTopBar();
  
  // Project modules - dynamic menu
  const { activeModules, isModuleActive, activateModule, refresh: refreshModules, loading: modulesLoading, error: modulesError } = useProjectModules(id);

  // Realtime: sincroniza automaticamente alterações feitas por outros usuários no mesmo projeto
  useProjectRealtimeSync(id);
  
  // Module activation dialog state
  const [moduleActivationDialog, setModuleActivationDialog] = useState<{
    open: boolean;
    moduleId: string;
    targetTab: string;
  }>({ open: false, moduleId: "", targetTab: "" });
  
  // Hook de formatação de moeda do projeto
  const { formatCurrency, formatChartAxis, convertToConsolidation, convertToConsolidationOficial, cotacaoOficialUSD } = useProjetoCurrency(id);
  const { getRate, lastUpdate: rateLastUpdate } = useCotacoes();
  const invalidateAfterMutation = useInvalidateAfterMutation();
  
  // Project tab preference (página inicial por projeto)
  const { defaultTab, loading: tabPreferenceLoading, isDefaultTab } = useProjectTabPreference(id);
  // Track which project ID had its default tab applied (prevents stale application)
  const appliedDefaultTabForProject = useRef<string | null>(null);
  const lastProjectId = useRef<string | undefined>(undefined);
  
  // Persist active tab in URL search params so refresh keeps current tab
  const [searchParams, setSearchParams] = useSearchParams();
  const tabFromUrl = searchParams.get("tab");
  
  // KPIs sempre mostram dados completos (sem filtro de período - cada aba usa seu próprio)
  const [activeTab, setActiveTabState] = useState(tabFromUrl || "apostas");
  
  // Wrapper that also syncs to URL
  const setActiveTab = useCallback((tab: string) => {
    setActiveTabState(tab);
    setSearchParams(prev => {
      const next = new URLSearchParams(prev);
      next.set("tab", tab);
      return next;
    }, { replace: true });
  }, [setSearchParams]);
  
  // CRITICAL: Reset state synchronously during render when project ID changes.
  if (id !== lastProjectId.current) {
    lastProjectId.current = id;
    appliedDefaultTabForProject.current = null;
    if (!tabFromUrl) {
      setActiveTabState("apostas");
    }
  }
  
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
      { value: "planejamento", label: "Planejamento", icon: <CalendarRange className="h-3.5 w-3.5 md:h-4 md:w-4" /> },
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
      if (isModuleActive("punter")) {
        moduleTabs.push({ value: "punter", label: "Punter", icon: <Crosshair className="h-3.5 w-3.5 md:h-4 md:w-4" /> });
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
    const baseTabs = ["visao-geral", "apostas", "planejamento", "vinculos", "gestao", "modulos", "ciclos", "incidentes"];
    
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
      "planejamento": "Planejamento",
      "vinculos": "Vínculos",
      "promocoes": "Promoções",
      "bonus": "Bônus",
      "surebet": "Surebet",
      "valuebet": "ValueBet",
      "duplogreen": "Duplo Green",
      "cashback": "Cashback",
      "modulos": "Módulos",
      "ciclos": "Ciclos",
      "incidentes": "Incidentes",
    };
    return tabLabels[tabKey] || tabKey;
  };

  // Check if a tab is valid (exists in dynamicTabs or tabGroups)
  const isValidTab = (tabKey: string): boolean => {
    const baseTabs = ["visao-geral", "apostas", "planejamento", "vinculos", "modulos", "ciclos", "incidentes"];
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

  // Apply default tab preference when project loads or changes
  useEffect(() => {
    if (!id || tabPreferenceLoading || modulesLoading) return;
    
    // Skip if we already applied the default tab for THIS specific project
    if (appliedDefaultTabForProject.current === id) return;
    
    // Mark as applied for this project
    appliedDefaultTabForProject.current = id;
    
    // If URL already has a tab param (e.g. page refresh), respect it over defaultTab
    if (tabFromUrl && isValidTab(tabFromUrl)) {
      setActiveTab(tabFromUrl);
      return;
    }
    
    if (defaultTab) {
      if (isValidTab(defaultTab)) {
        setActiveTab(defaultTab);
      } else {
        setActiveTab("apostas");
        toast.info("Página inicial indisponível", {
          description: `"${getTabLabel(defaultTab)}" não está mais disponível. Você pode definir outra página inicial.`,
        });
      }
    } else {
      setActiveTab("apostas");
    }
  }, [id, defaultTab, tabPreferenceLoading, modulesLoading, modulesError, isModuleActive, tabFromUrl]);
  
  // KPIs sempre mostram dados completos do projeto (sem filtro de período no nível da página)
  // Cada aba tem seu próprio filtro interno (padrão Bônus/Freebets)
  const getDateRangeFromFilter = (): { start: Date | null; end: Date | null } => {
    // Sempre retorna todo o período para KPIs de resumo
    return { start: null, end: null };
  };

  // Get date range for resultado hook
  const { start: dataInicio, end: dataFim } = getDateRangeFromFilter();
  
  // FONTE ÚNICA DE VERDADE: Hook centralizado para resultado do projeto
  // PADRÃO: KPIs operacionais usam Cotação de Trabalho (convergência com aba Bônus/Performance)
  const { resultado: projetoResultado, refresh: refreshResultado } = useProjetoResultado({
    projetoId: id || '',
    dataInicio,
    dataFim,
    convertToConsolidation,
    cotacaoKey: cotacaoOficialUSD,
  });

  // Hook para breakdowns dinâmicos dos KPIs por módulo
  const { breakdowns: kpiBreakdowns, refresh: refreshBreakdowns } = useKpiBreakdowns({
    projetoId: id || '',
    dataInicio,
    dataFim,
    moedaConsolidacao: projetoResultado?.moedaConsolidacao || 'BRL',
    convertToConsolidation,
    convertToConsolidationOficial,
    cotacaoKey: cotacaoOficialUSD,
  });

  // Função centralizada para disparar refresh em todas as abas, incluindo a Visão Geral montada em forceMount.
  const triggerGlobalRefresh = useCallback(() => {
    if (id) {
      void invalidateAfterMutation(id);
    }
    setRefreshTrigger(prev => prev + 1);
    fetchApostasResumo();
    refreshResultado();
    refreshBreakdowns();
  }, [id, invalidateAfterMutation, refreshResultado, refreshBreakdowns]);

  useEffect(() => {
    if (id) {
      fetchProjeto();
    }
  }, [id]);

  const handleArchiveProject = async () => {
    if (!projeto || !id) return;
    
    // Check for active bookmaker links
    const { count } = await supabase
      .from("bookmakers")
      .select("id", { count: "exact", head: true })
      .eq("projeto_id", id)
      .in("status", ["ATIVO", "AGUARDANDO_SAQUE"]);
    
    if (count && count > 0) {
      toast.error(`Não é possível arquivar: ${count} bookmaker(s) ainda vinculado(s) ao projeto.`);
      return;
    }

    const confirmed = window.confirm(
      `Tem certeza que deseja arquivar o projeto "${projeto.nome}"?\n\nO projeto será removido do fluxo operacional e suas participações pendentes serão ignoradas. Esta ação pode ser revertida.`
    );
    if (!confirmed) return;

    setArchiving(true);
    try {
      const { error } = await supabase
        .from("projetos")
        .update({ status: "ARQUIVADO" })
        .eq("id", id);

      if (error) throw error;

      toast.success("Projeto arquivado com sucesso!");
      navigate("/projetos");
    } catch (error: any) {
      toast.error("Erro ao arquivar: " + error.message);
    } finally {
      setArchiving(false);
    }
  };

  // Inject project header into TopBar
  const diasCiclo = entregaAtiva?.data_fim_prevista ? differenceInDays(new Date(entregaAtiva.data_fim_prevista), new Date()) : null;
  useEffect(() => {
    if (!projeto) {
      setTopBarContent(null);
      return;
    }
    setTopBarContent(
      <div className="flex items-center justify-between flex-1 min-w-0 py-1 gap-2">
        {/* LEFT: Project context */}
        <div className="flex items-center gap-2 min-w-0">
          <Button variant="ghost" size="icon" className="flex-shrink-0 h-7 w-7 text-muted-foreground hover:text-foreground" onClick={() => navigate("/projetos")}>
            <ArrowLeft className="h-3.5 w-3.5" />
          </Button>
          <div className="h-7 w-7 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
            <FolderKanban className="h-3.5 w-3.5 text-primary" />
          </div>
          <span className="text-sm font-bold tracking-tight truncate">{projeto.nome}</span>

          <div className="h-4 w-px bg-border flex-shrink-0 hidden sm:block" />

          <div className="flex items-center gap-1.5 flex-shrink-0 hidden sm:flex">
            {diasCiclo !== null && (
              <>
                <span className="text-muted-foreground/40 hidden md:inline">•</span>
                <span className="text-[11px] text-muted-foreground items-center gap-1 hidden md:flex">
                  <Clock className="h-3 w-3" />
                  {diasCiclo} {diasCiclo === 1 ? 'dia' : 'dias'} até o fim do ciclo
                </span>
              </>
            )}
          </div>
        </div>

        {/* RIGHT: Actions */}
        <div className="flex items-center gap-1 flex-shrink-0">
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button 
                  variant="ghost" 
                  size="icon"
                  className="h-7 w-7"
                  onClick={() => { if (id) toggleFavorite(id); }}
                >
                  <Star 
                    className={`h-3.5 w-3.5 transition-colors ${
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
            <>
              <ShareLinkDialog projetoId={id!} projetoNome={projeto.nome} />
              <Button variant="ghost" size="sm" className="h-7 text-xs px-2 text-muted-foreground hover:text-foreground" onClick={() => setEditDialogOpen(true)}>
                <Edit className="mr-1 h-3 w-3" />
                Editar
              </Button>
              {projeto.status !== "ARQUIVADO" && (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground">
                      <MoreVertical className="h-3.5 w-3.5" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem
                      onClick={handleArchiveProject}
                      disabled={archiving}
                      className="text-destructive focus:text-destructive"
                    >
                      <Archive className="h-4 w-4 mr-2" />
                      {archiving ? "Arquivando..." : "Arquivar Projeto"}
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              )}
              {projeto.status === "ARQUIVADO" && (
                <Badge variant="outline" className="text-xs bg-purple-500/10 text-purple-400 border-purple-500/30">
                  Arquivado
                </Badge>
              )}
            </>
          )}
        </div>
      </div>
    );
    return () => setTopBarContent(null);
  }, [projeto, diasCiclo, id, isFavorite, canEdit, editDialogOpen, archiving]);

  // As abas usam seus próprios filtros internos
  
  const fetchApostasResumo = async () => {
    try {
      // ══════════════════════════════════════════════════════════════
      // RPC server-side: elimina truncamento de 1000 linhas do PostgREST
      // Todos os cálculos (contagem, resultados, lucro) são feitos no banco
      // ══════════════════════════════════════════════════════════════
      const { data, error } = await supabase.rpc('get_projeto_apostas_resumo', {
        p_projeto_id: id,
        p_data_inicio: null,
        p_data_fim: null,
      });

      if (error) throw error;
      if (!data) return;

      const rpcResult = data as any;

      const totalStake = Number(rpcResult.total_stake || 0);
      const lucroTotal = Number(rpcResult.lucro_total || 0);

      const summary: ApostasResumo = {
        total_apostas: Number(rpcResult.total_apostas || 0),
        apostas_pendentes: Number(rpcResult.apostas_pendentes || 0),
        greens: Number(rpcResult.greens || 0),
        reds: Number(rpcResult.reds || 0),
        voids: Number(rpcResult.voids || 0),
        meio_greens: Number(rpcResult.meio_greens || 0),
        meio_reds: Number(rpcResult.meio_reds || 0),
        total_stake: totalStake,
        lucro_total: lucroTotal,
        roi_percentual: totalStake > 0 ? (lucroTotal / totalStake) * 100 : 0,
      };

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
      const hoje = getTodayCivilDate();
      const { data: cicloData } = await supabase
        .from("projeto_ciclos")
        .select("data_inicio, data_fim_prevista")
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

      {/* Filtro de período removido - cada aba usa seu próprio StandardTimeFilter interno (padrão Bônus/Freebets) */}

      {/* Summary Bar - KPIs compactos em faixa horizontal */}
      {showKpis && (
        <div className="flex-shrink-0 rounded-lg border border-border/60 bg-card/60 backdrop-blur px-3 py-2.5 sm:px-4">
          <div className="grid grid-cols-3 sm:flex sm:flex-wrap items-stretch sm:items-center justify-center gap-2 sm:gap-4 md:gap-6">
            {/* Saldo Operável — destaque principal */}
            <div className="col-span-2 sm:col-span-1 min-w-0">
              <SaldoOperavelCard projetoId={id!} variant="compact" />
            </div>

            <div className="h-8 w-px bg-border/50 hidden sm:block flex-shrink-0" />

            {/* Apostas */}
            <CountBreakdownTooltip
              breakdown={kpiBreakdowns?.apostas || null}
              title="Entradas por Módulo"
            >
              {(() => {
                // Derive greens/reds/voids from kpiBreakdowns (source of truth)
                const apostasContrib = kpiBreakdowns?.apostas?.contributions?.find(c => c.moduleId === 'apostas');
                const details = apostasContrib?.details || '';
                const gMatch = details.match(/(\d+)G/);
                const rMatch = details.match(/(\d+)R/);
                const vMatch = details.match(/(\d+)V/);
                const greens = gMatch ? Number(gMatch[1]) : 0;
                const reds = rMatch ? Number(rMatch[1]) : 0;
                const voids = vMatch ? Number(vMatch[1]) : 0;
                return (
                  <div className="flex min-h-12 flex-col items-center justify-center rounded-md bg-muted/25 px-2 py-1.5 text-center cursor-help sm:min-h-0 sm:items-start sm:bg-transparent sm:p-0 sm:text-left sm:min-w-[70px]">
                    <span className="text-xs text-muted-foreground leading-tight">Apostas</span>
                    <span className="text-base md:text-lg font-bold leading-tight">{kpiBreakdowns?.apostas?.total || 0}</span>
                    <div className="flex items-center gap-2 text-xs leading-tight mt-0.5">
                      <span className="inline-flex items-center gap-0.5 text-emerald-500 font-semibold">
                        <span className="inline-block w-1.5 h-1.5 rounded-full bg-emerald-500" />
                        {greens}
                      </span>
                      <span className="inline-flex items-center gap-0.5 text-red-500 font-semibold">
                        <span className="inline-block w-1.5 h-1.5 rounded-full bg-red-500" />
                        {reds}
                      </span>
                      <span className="inline-flex items-center gap-0.5 text-muted-foreground font-semibold">
                        <span className="inline-block w-1.5 h-1.5 rounded-full bg-muted-foreground/60" />
                        {voids}
                      </span>
                    </div>
                  </div>
                );
              })()}
            </CountBreakdownTooltip>

            <div className="h-8 w-px bg-border/50 hidden sm:block flex-shrink-0" />

            {/* Volume — com tooltip temporal */}
            <TooltipProvider>
              <Tooltip delayDuration={200}>
                <TooltipTrigger asChild>
                  <div className="flex min-h-12 flex-col items-center justify-center rounded-md bg-muted/25 px-2 py-1.5 text-center cursor-help sm:min-h-0 sm:items-start sm:bg-transparent sm:p-0 sm:text-left sm:min-w-[80px]">
                    <span className="text-xs text-muted-foreground leading-tight">Volume</span>
                    <span className="max-w-full text-sm sm:text-base md:text-lg font-bold leading-tight truncate">
                      {formatCurrency(kpiBreakdowns?.volume?.total || 0)}
                    </span>
                    {kpiBreakdowns?.volumeTemporal && kpiBreakdowns.volumeTemporal.diasAtivos > 0 && (
                      <span className="text-[10px] text-muted-foreground leading-tight">
                        ~{formatCurrency(kpiBreakdowns.volumeTemporal.volumeMedioDiario)}/dia
                      </span>
                    )}
                  </div>
                </TooltipTrigger>
                <TooltipContent side="bottom" className="max-w-[300px] p-3" sideOffset={8}>
                  {kpiBreakdowns?.volumeTemporal && kpiBreakdowns.volumeTemporal.diasAtivos > 0 ? (
                    <div className="space-y-2">
                      <p className="text-xs font-semibold border-b border-border pb-1.5">Performance Temporal</p>
                      <div className="space-y-1.5 text-xs">
                        <div className="flex justify-between gap-4">
                          <span className="text-muted-foreground flex items-center gap-1">
                            <BarChart3 className="h-3 w-3" />Vol. Médio/Dia
                          </span>
                          <span className="font-bold tabular-nums">
                            {formatCurrency(kpiBreakdowns.volumeTemporal.volumeMedioDiario)}
                          </span>
                        </div>
                        <div className="flex justify-between gap-4">
                          <span className="text-muted-foreground flex items-center gap-1">
                            <CalendarDays className="h-3 w-3" />Dias Ativos
                          </span>
                          <span className="font-medium tabular-nums">{kpiBreakdowns.volumeTemporal.diasAtivos}</span>
                        </div>
                        <div className="flex justify-between gap-4">
                          <span className="text-muted-foreground flex items-center gap-1">
                            <Activity className="h-3 w-3" />Dias c/ Operação
                          </span>
                          <span className="font-medium tabular-nums">{kpiBreakdowns.volumeTemporal.diasComOperacao}</span>
                        </div>
                        <div className="flex justify-between gap-4">
                          <span className="text-muted-foreground">Densidade</span>
                          <span className={cn(
                            "font-medium tabular-nums",
                            kpiBreakdowns.volumeTemporal.densidadeOperacional < 0.5 ? "text-yellow-500" : "text-emerald-500"
                          )}>
                            {(kpiBreakdowns.volumeTemporal.densidadeOperacional * 100).toFixed(1)}%
                          </span>
                        </div>
                        <div className="flex justify-between gap-4">
                          <span className="text-muted-foreground">Apostas/Dia</span>
                          <span className="font-medium tabular-nums">
                            {kpiBreakdowns.volumeTemporal.mediaApostasPorDia.toFixed(1)}
                          </span>
                        </div>
                      </div>
                      {kpiBreakdowns.volumeTemporal.densidadeOperacional < 0.5 && (
                        <div className="border-t border-border pt-1.5 mt-1">
                          <p className="text-[10px] text-yellow-500 leading-snug">
                            ⚠ Baixa densidade operacional — menos da metade dos dias teve operação.
                          </p>
                        </div>
                      )}
                      <div className="border-t border-border pt-1.5">
                        <p className="text-[9px] text-muted-foreground/60 leading-snug">
                          Período: {kpiBreakdowns.volumeTemporal.primeiraAposta} → {kpiBreakdowns.volumeTemporal.ultimaAposta}
                        </p>
                      </div>
                    </div>
                  ) : (
                    <p className="text-xs text-muted-foreground">Sem apostas no período</p>
                  )}
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>

            <div className="h-8 w-px bg-border/50 hidden sm:block flex-shrink-0" />

            {/* Lucro/Prejuízo */}
            <KpiBreakdownTooltip
              breakdown={kpiBreakdowns?.lucro || null}
              formatValue={formatCurrency}
              title="Resultado por Estratégia"
            >
              <div className="flex min-h-12 flex-col items-center justify-center rounded-md bg-muted/25 px-2 py-1.5 text-center cursor-help sm:min-h-0 sm:items-start sm:bg-transparent sm:p-0 sm:text-left sm:min-w-[80px]">
                <span className="text-xs text-muted-foreground leading-tight">
                  {(kpiBreakdowns?.lucro?.total || 0) >= 0 ? "Lucro" : "Prejuízo"}
                </span>
                <span className={cn(
                  "max-w-full text-sm sm:text-base md:text-lg font-bold leading-tight truncate",
                  (kpiBreakdowns?.lucro?.total || 0) >= 0 ? 'text-emerald-500' : 'text-red-500'
                )}>
                  {formatCurrency(Math.abs(kpiBreakdowns?.lucro?.total || 0))}
                </span>
              </div>
            </KpiBreakdownTooltip>

            <div className="h-8 w-px bg-border/50 hidden sm:block flex-shrink-0" />

            {/* ROI */}
            <TooltipProvider>
              <Tooltip delayDuration={200}>
                <TooltipTrigger asChild>
                  <div className="flex min-h-12 flex-col items-center justify-center rounded-md bg-muted/25 px-2 py-1.5 text-center cursor-help sm:min-h-0 sm:items-start sm:bg-transparent sm:p-0 sm:text-left sm:min-w-[50px]">
                    <span className="text-xs text-muted-foreground leading-tight">ROI</span>
                    <span className={cn(
                      "text-base md:text-lg font-bold leading-tight",
                      (kpiBreakdowns?.roi?.total || 0) >= 0 ? 'text-emerald-500' : 'text-red-500'
                    )}>
                      {(kpiBreakdowns?.roi?.total || 0).toFixed(2)}%
                    </span>
                  </div>
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
                      <p className="text-muted-foreground/70 mt-1.5 text-[10px] leading-snug">Considera apenas apostas com resultado definido.</p>
                    </div>
                  </div>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>

            {/* + Mais Indicadores */}
            <div className="col-span-3 flex items-center justify-center sm:col-span-1 sm:block">
              <Popover>
                <PopoverTrigger asChild>
                  <button className="flex items-center justify-center h-7 w-7 rounded-md border border-border/50 bg-muted/40 hover:bg-accent transition-colors flex-shrink-0">
                    <Plus className="h-3.5 w-3.5 text-muted-foreground" />
                  </button>
                </PopoverTrigger>
                <PopoverContent side="bottom" align="end" className="p-0 w-auto" sideOffset={8}>
                  <FinancialMetricsPopover projetoId={id!} />
                </PopoverContent>
              </Popover>
            </div>
          </div>
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
                  { value: "incidentes", label: "Incidentes", icon: <AlertTriangle className="h-4 w-4" /> },
                  { value: "ciclos", label: "Ciclos", icon: <Clock className="h-4 w-4" /> },
                ],
              },
            ]}
            activeTab={activeTab}
            onTabChange={handleTabChange}
            minVisibleTabs={2}
            extraContent={
              <SetDefaultTabButton
                projectId={id!}
                tabKey={activeTab}
                tabLabel={getTabLabel(activeTab)}
              />
            }
          />
        </div>

        {/* GlobalActionsBar agora é renderizada dentro de cada aba operacional via actionsSlot */}

        {/* Conteúdo das abas com contenção */}
        <div className="flex-1 min-h-0 overflow-hidden">
          <TabsContent value="visao-geral" forceMount className={cn("h-full m-0", activeTab !== "visao-geral" && "hidden")}>
            <ProjetoDashboardTab 
              projetoId={id!} 
              refreshTrigger={refreshTrigger}
            />
          </TabsContent>

          <TabsContent value="apostas" forceMount className={cn("h-full m-0", activeTab !== "apostas" && "hidden")}>
            <ProjetoApostasTab 
              projetoId={id!} 
              onDataChange={triggerGlobalRefresh}
              refreshTrigger={refreshTrigger}
              formatCurrency={formatCurrency}
              actionsSlot={
                <GlobalActionsBar
                  projetoId={id!}
                  activeTab={activeTab}
                  onApostaCreated={triggerGlobalRefresh}
                  onBonusCreated={triggerGlobalRefresh}
                  onNavigateToTab={setActiveTab}
                />
              }
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
              onDataChange={triggerGlobalRefresh}
              actionsSlot={
                <GlobalActionsBar
                  projetoId={id!}
                  activeTab={activeTab}
                  onApostaCreated={triggerGlobalRefresh}
                  onBonusCreated={triggerGlobalRefresh}
                  onNavigateToTab={setActiveTab}
                />
              }
            />
          </TabsContent>

          <TabsContent value="punter" forceMount className={cn("h-full m-0", activeTab !== "punter" && "hidden")}>
            <ProjetoPunterTab 
              projetoId={id!} 
              onDataChange={triggerGlobalRefresh}
              refreshTrigger={refreshTrigger}
              actionsSlot={
                <GlobalActionsBar
                  projetoId={id!}
                  activeTab={activeTab}
                  onApostaCreated={triggerGlobalRefresh}
                  onBonusCreated={triggerGlobalRefresh}
                  onNavigateToTab={setActiveTab}
                />
              }
            />
          </TabsContent>

          <TabsContent value="surebet" forceMount className={cn("h-full m-0", activeTab !== "surebet" && "hidden")}>
            <ProjetoSurebetTab 
              projetoId={id!} 
              onDataChange={triggerGlobalRefresh}
              refreshTrigger={refreshTrigger}
              actionsSlot={
                <GlobalActionsBar
                  projetoId={id!}
                  activeTab={activeTab}
                  onApostaCreated={triggerGlobalRefresh}
                  onBonusCreated={triggerGlobalRefresh}
                  onNavigateToTab={setActiveTab}
                />
              }
            />
          </TabsContent>

          <TabsContent value="valuebet" forceMount className={cn("h-full m-0", activeTab !== "valuebet" && "hidden")}>
            <ProjetoValueBetTab 
              projetoId={id!} 
              onDataChange={triggerGlobalRefresh}
              refreshTrigger={refreshTrigger}
              actionsSlot={
                <GlobalActionsBar
                  projetoId={id!}
                  activeTab={activeTab}
                  onApostaCreated={triggerGlobalRefresh}
                  onBonusCreated={triggerGlobalRefresh}
                  onNavigateToTab={setActiveTab}
                />
              }
            />
          </TabsContent>

          <TabsContent value="duplogreen" forceMount className={cn("h-full m-0", activeTab !== "duplogreen" && "hidden")}>
            <ProjetoDuploGreenTab 
              projetoId={id!} 
              onDataChange={triggerGlobalRefresh}
              refreshTrigger={refreshTrigger}
              actionsSlot={
                <GlobalActionsBar
                  projetoId={id!}
                  activeTab={activeTab}
                  onApostaCreated={triggerGlobalRefresh}
                  onBonusCreated={triggerGlobalRefresh}
                  onNavigateToTab={setActiveTab}
                />
              }
            />
          </TabsContent>

          <TabsContent value="cashback" className="h-full m-0">
            <ProjetoCashbackTab projetoId={id!} />
          </TabsContent>

          <TabsContent value="planejamento" className="h-full m-0">
            <ProjetoPlanejamentoTab projetoId={id!} refreshTrigger={refreshTrigger} />
          </TabsContent>

          <TabsContent value="vinculos" className="h-full m-0">
            <ProjetoVinculosTab projetoId={id!} tipoProjeto={projeto.tipo_projeto} investidorId={projeto.investidor_id} isBroker={projeto.is_broker} />
          </TabsContent>

          <TabsContent value="modulos" className="h-full m-0">
            <ProjetoGestaoTab projetoId={id!} />
          </TabsContent>

          <TabsContent value="incidentes" className="h-full m-0">
            <ProjetoIncidentesTab projetoId={id!} onDataChange={triggerGlobalRefresh} formatCurrency={formatCurrency} />
          </TabsContent>

          <TabsContent value="ciclos" className="h-full m-0">
            <ProjetoCiclosTab projetoId={id!} formatCurrency={formatCurrency} convertToConsolidation={convertToConsolidationOficial} moedaConsolidacao={projetoResultado?.moedaConsolidacao || 'BRL'} />
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