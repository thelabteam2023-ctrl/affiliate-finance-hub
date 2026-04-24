import { useState, useCallback, useMemo, memo, useEffect, useRef, Fragment } from "react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ParceiroFinanceiroConsolidado, saldosToEntries } from "@/hooks/useParceiroFinanceiroConsolidado";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { TrendingUp, TrendingDown, ArrowDownToLine, ArrowUpFromLine, Target, Building2, User, Wallet, AlertCircle, Eye, EyeOff, History, BarChart3, IdCard, Edit, Trash2, Copy, Check, Calendar, RefreshCw, CircleDashed, CircleCheck, Lock, Search, Pencil, Plus, Minus, FolderKanban, Loader2, AlertTriangle, DollarSign, ArrowUpDown, ArrowUp, ArrowDown, ChevronDown } from "lucide-react";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
  ContextMenuSeparator,
  ContextMenuSub,
  ContextMenuSubTrigger,
  ContextMenuSubContent,
} from "@/components/ui/context-menu";
import { supabase } from "@/integrations/supabase/client";
import { useWorkspace } from "@/hooks/useWorkspace";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { cn } from "@/lib/utils";
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from "@/components/ui/tooltip";
import { ParceiroMovimentacoesTab } from "./ParceiroMovimentacoesTab";
import { BookmakerHistoricoDialog } from "@/components/bookmakers/BookmakerHistoricoDialog";
import { ParceiroBookmakersTab } from "./ParceiroBookmakersTab";
import { useToast } from "@/hooks/use-toast";
import { TabKey } from "@/hooks/useParceiroFinanceiroCache";
import { useActionAccess } from "@/hooks/useModuleAccess";
import { MoneyDisplay, formatMoneyValue } from "@/components/ui/money-display";
import { NativeCurrencyKpi } from "@/components/ui/native-currency-kpi";
import { useBookmakerUsageStatus, getUsageCategoryConfig } from "@/hooks/useBookmakerUsageStatus";
import { useCotacoes } from "@/hooks/useCotacoes";
import { ParceiroKpiCard } from "./ParceiroKpiCard";
import { RegistrarPerdaRapidaDialog } from "./RegistrarPerdaRapidaDialog";
import { usePasswordDecryption } from "@/hooks/usePasswordDecryption";
import { LazyPasswordField } from "./LazyPasswordField";

interface ParceiroCache {
  resumoData: ParceiroFinanceiroConsolidado | null;
  resumoLoading: boolean;
  resumoError: string | null;
  changeTab: (tab: TabKey) => void;
  invalidateCache: (parceiroId: string) => void;
  refreshCurrent: () => void;
}

interface ParceiroDetalhesPanelProps {
  parceiroId: string | null;
  showSensitiveData?: boolean;
  onToggleSensitiveData?: () => void;
  onCreateVinculo?: (parceiroId: string, bookmakerId: string) => void;
  onEditVinculo?: (bookmakerId: string) => void;
  onNewTransacao?: (bookmakerId: string, bookmakerNome: string, moeda: string, saldoAtual: number, saldoUsd: number, tipo: "deposito" | "retirada") => void;
  onViewParceiro?: () => void;
  onEditParceiro?: () => void;
  onDeleteParceiro?: () => void;
  parceiroStatus?: string;
  hasParceria?: boolean;
  diasRestantes?: number | null;
  parceiroCache: ParceiroCache;
  bookmakerRefreshKey?: number;
  saldoBanco?: number;
  saldoCrypto?: number;
}

const clampSaldoVisual = (value: number | null | undefined) => Math.max(0, Number(value ?? 0));

// Mobile Progressive KPIs component
interface MobileProgressiveKpisProps {
  kpisFiltrados: any;
  showSensitiveData: boolean;
  hasLucroFiltrado: boolean;
  hasPrejuizoFiltrado: boolean;
  dataSource: import("@/contexts/ExchangeRatesContext").DataSource;
  isUsingFallback: boolean;
  ratesMap: Record<string, number>;
}

function MobileProgressiveKpis({ kpisFiltrados, showSensitiveData, hasLucroFiltrado, hasPrejuizoFiltrado, dataSource, isUsingFallback, ratesMap }: MobileProgressiveKpisProps) {
  const [expanded, setExpanded] = useState(() => {
    try { return localStorage.getItem("parceiro-kpis-expanded") === "true"; } catch { return false; }
  });

  const toggleExpanded = () => {
    const next = !expanded;
    setExpanded(next);
    try { localStorage.setItem("parceiro-kpis-expanded", String(next)); } catch {}
  };

  return (
    <div className="lg:hidden space-y-1.5">
      {/* Row 1: Saldo Atual + Resultado Financeiro */}
      <div className="grid gap-1.5 grid-cols-2">
        <ParceiroKpiCard
          icon={<Wallet className="h-4 w-4 text-primary" />}
          label="Saldo Atual"
          entries={kpisFiltrados.saldo}
          consolidadoBRL={kpisFiltrados.saldoBRL}
          showBreakdown={kpisFiltrados.isConsolidado}
          masked={!showSensitiveData}
          cardClassName="border-primary/30"
          dataSource={dataSource}
          isUsingFallback={isUsingFallback}
          rates={ratesMap}
        />
        <ParceiroKpiCard
          icon={
            showSensitiveData ? (
              hasLucroFiltrado && !hasPrejuizoFiltrado ? (
                <TrendingUp className="h-4 w-4 text-success" />
              ) : (
                <TrendingDown className="h-4 w-4 text-destructive" />
              )
            ) : (
              <TrendingUp className="h-4 w-4 text-muted-foreground" />
            )
          }
          label="Resultado"
          entries={kpisFiltrados.resultado}
          consolidadoBRL={kpisFiltrados.resultadoBRL}
          showBreakdown={kpisFiltrados.isConsolidado}
          masked={!showSensitiveData}
          variant="auto"
          cardClassName="bg-primary/5 border-primary/20 ring-1 ring-primary/10"
          labelClassName="font-medium"
          dataSource={dataSource}
          isUsingFallback={isUsingFallback}
          rates={ratesMap}
        />
      </div>

      {/* Row 2: Apostas + Expand toggle */}
      <div className="grid gap-1.5 grid-cols-2">
        <div className="flex items-center gap-2 px-2.5 py-2 rounded-lg bg-muted/30 border border-border">
          <Target className="h-4 w-4 text-muted-foreground shrink-0" />
          <div className="min-w-0">
            <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Apostas</p>
            <p className="text-sm font-semibold">{kpisFiltrados.apostas.toLocaleString("pt-BR")}</p>
          </div>
        </div>
        <button
          onClick={toggleExpanded}
          className="flex items-center justify-center gap-1.5 rounded-lg border border-dashed border-border text-xs text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors active:scale-[0.98]"
        >
          <ChevronDown className={cn("h-3.5 w-3.5 transition-transform duration-200", expanded && "rotate-180")} />
          {expanded ? "Ocultar" : "+ Ver mais"}
        </button>
      </div>

      {/* Expandable: Depositado + Sacado */}
      {expanded && (
        <div className="grid gap-1.5 grid-cols-2 animate-in slide-in-from-top-2 duration-200">
          <ParceiroKpiCard
            icon={<ArrowDownToLine className="h-4 w-4 text-destructive" />}
            label="Depositado"
            entries={kpisFiltrados.depositado}
            consolidadoBRL={kpisFiltrados.depositadoBRL}
            showBreakdown={kpisFiltrados.isConsolidado}
            masked={!showSensitiveData}
            dataSource={dataSource}
            isUsingFallback={isUsingFallback}
            rates={ratesMap}
          />
          <ParceiroKpiCard
            icon={<ArrowUpFromLine className="h-4 w-4 text-success" />}
            label="Sacado"
            entries={kpisFiltrados.sacado}
            consolidadoBRL={kpisFiltrados.sacadoBRL}
            showBreakdown={kpisFiltrados.isConsolidado}
            masked={!showSensitiveData}
            dataSource={dataSource}
            isUsingFallback={isUsingFallback}
            rates={ratesMap}
          />
        </div>
      )}
    </div>
  );
}


interface MobileBookmakerCardProps {
  bm: any;
  showSensitiveData: boolean;
  parceiroStatus?: string;
  formatMoneyValue: (value: number, currency: string) => string;
  clampSaldoVisual: (value: number | null | undefined) => number;
  usageCategory?: string;
  usageTooltip: string;
  onHistorico: () => void;
  onDeposito: () => void;
  onSaque: () => void;
}

function MobileBookmakerCard({ bm, showSensitiveData, parceiroStatus, formatMoneyValue, clampSaldoVisual, onDeposito, onSaque }: MobileBookmakerCardProps) {
  const [expanded, setExpanded] = useState(false);
  const moeda = bm.moeda || "BRL";
  const resultado = bm.lucro_prejuizo ?? 0;
  const saldoAtual = clampSaldoVisual(bm.saldo_atual);

  return (
    <div 
      className="border border-border rounded-lg overflow-hidden bg-card transition-shadow hover:shadow-sm"
      onClick={() => setExpanded(!expanded)}
    >
      {/* Main card content */}
      <div className="p-3 flex items-center gap-3">
        {bm.logo_url ? (
          <img src={bm.logo_url} alt={bm.bookmaker_nome} className="h-9 w-9 rounded object-contain shrink-0" />
        ) : (
          <div className="h-9 w-9 rounded bg-muted flex items-center justify-center shrink-0">
            <Building2 className="h-4 w-4 text-muted-foreground" />
          </div>
        )}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5">
            <p className="text-sm font-medium truncate">{bm.bookmaker_nome}</p>
            <Badge variant="outline" className={cn("text-[9px] px-1 py-0 h-4 shrink-0", bm.status === "ativo" ? "border-success/50 text-success" : bm.status === "limitada" ? "border-warning/50 text-warning" : "border-destructive/50 text-destructive")}>
              {bm.status === "ativo" ? "Ativa" : bm.status === "limitada" ? "Limitada" : "Encerrada"}
            </Badge>
            <Badge variant="outline" className="text-[9px] px-1 py-0 h-4 shrink-0 border-muted-foreground/30 text-muted-foreground">
              {moeda}
            </Badge>
          </div>
          {/* Saldo atual destaque */}
          <div className="flex items-center justify-between mt-1">
            <span className="text-[10px] text-muted-foreground">Saldo Atual</span>
            <span className="text-sm font-bold font-mono text-foreground">
              {showSensitiveData ? formatMoneyValue(saldoAtual, moeda) : "••••"}
            </span>
          </div>
        </div>
        <ChevronDown className={cn("h-4 w-4 text-muted-foreground shrink-0 transition-transform", expanded && "rotate-180")} />
      </div>

      {/* Expanded details */}
      {expanded && (
        <div className="px-3 pb-3 pt-0 border-t border-border/50 space-y-2 animate-in slide-in-from-top-1 duration-200">
          {/* Key metrics grid — 2x2 vertical pattern */}
          <div className="grid grid-cols-2 gap-2 pt-2">
            <div className="px-2.5 py-2 rounded-lg bg-muted/30 border border-border">
              <p className="text-[11px] text-muted-foreground leading-none mb-1">Resultado</p>
              <p className={cn("text-[15px] font-semibold font-mono tabular-nums leading-tight", resultado >= 0 ? "text-success" : "text-destructive")}>
                {showSensitiveData ? formatMoneyValue(resultado, moeda) : "••••"}
              </p>
            </div>
            <div className="px-2.5 py-2 rounded-lg bg-muted/30 border border-border">
              <p className="text-[11px] text-muted-foreground leading-none mb-1">Depositado</p>
              <p className="text-[15px] font-semibold font-mono tabular-nums leading-tight text-destructive/80">
                {showSensitiveData ? formatMoneyValue(bm.total_depositado ?? 0, moeda) : "••••"}
              </p>
            </div>
            <div className="px-2.5 py-2 rounded-lg bg-muted/30 border border-border">
              <p className="text-[11px] text-muted-foreground leading-none mb-1">Sacado</p>
              <p className="text-[15px] font-semibold font-mono tabular-nums leading-tight text-success/80">
                {showSensitiveData ? formatMoneyValue(bm.total_sacado ?? 0, moeda) : "••••"}
              </p>
            </div>
            <div className="px-2.5 py-2 rounded-lg bg-muted/30 border border-border">
              <p className="text-[11px] text-muted-foreground leading-none mb-1">Apostas</p>
              <p className="text-[15px] font-semibold tabular-nums leading-tight text-foreground">
                {(bm.qtd_apostas ?? 0).toLocaleString("pt-BR")}
              </p>
            </div>
          </div>
          {/* Quick actions */}
          <div className="flex gap-2 pt-1">
            <Button variant="outline" size="sm" className="flex-1 h-8 text-xs gap-1" onClick={(e) => { e.stopPropagation(); onDeposito(); }}>
              <Plus className="h-3 w-3 text-success" /> Depósito
            </Button>
            <Button variant="outline" size="sm" className="flex-1 h-8 text-xs gap-1" onClick={(e) => { e.stopPropagation(); onSaque(); }}>
              <Minus className="h-3 w-3 text-destructive" /> Saque
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

// Memoizado para evitar re-renders desnecessários quando o parent re-renderiza
// (ex: abertura/fechamento de modais)
export const ParceiroDetalhesPanel = memo(function ParceiroDetalhesPanel({ 
  parceiroId, 
  showSensitiveData = false,
  onToggleSensitiveData,
  onCreateVinculo,
  onEditVinculo,
  onNewTransacao,
  onViewParceiro,
  onEditParceiro,
  onDeleteParceiro,
  parceiroStatus,
  hasParceria,
  diasRestantes,
  parceiroCache,
  bookmakerRefreshKey,
  saldoBanco = 0,
  saldoCrypto = 0,
}: ParceiroDetalhesPanelProps) {
  const data = parceiroCache.resumoData;
  const loading = parceiroCache.resumoLoading;
  const error = parceiroCache.resumoError;
  
  const { toast } = useToast();
  const { requestDecrypt, isDecrypted, getCached } = usePasswordDecryption();
  const [copiedField, setCopiedField] = useState<string | null>(null);
  const [credentialsPopoverOpen, setCredentialsPopoverOpen] = useState<string | null>(null);
  const [historicoDialog, setHistoricoDialog] = useState<{ open: boolean; bookmakerId: string; bookmakerNome: string; logoUrl: string | null; status: string }>({ open: false, bookmakerId: "", bookmakerNome: "", logoUrl: null, status: "ativo" });
  const [filtroMoeda, setFiltroMoeda] = useState<string>("todas");
  const [buscaCasa, setBuscaCasa] = useState("");
  const [filtroStatus, setFiltroStatus] = useState<string | null>(null);
  const [filtroRegulamentacao, setFiltroRegulamentacao] = useState<string>("todas");
  const [perdaDialog, setPerdaDialog] = useState<{ open: boolean; bookmakerId: string; bookmakerNome: string; moeda: string; saldoAtual: number } | null>(null);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [sortColumn, setSortColumn] = useState<"dep" | "saq" | "saldo" | "resultado" | "apostas" | null>(null);
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("desc");
  const { canEdit, canDelete } = useActionAccess();
  const { convertToBRL, dataSource, isUsingFallback, rates } = useCotacoes();
  const { workspaceId } = useWorkspace();
  const queryClient = useQueryClient();

  // Fetch projects for "Vincular a projeto" submenu
  const { data: projetos } = useQuery({
    queryKey: ["projetos-list-for-link", workspaceId],
    queryFn: async () => {
      if (!workspaceId) return [];
      const { data } = await supabase
        .from("projetos")
        .select("id, nome")
        .eq("workspace_id", workspaceId)
        .in("status", ["PLANEJADO", "EM_ANDAMENTO"])
        .order("nome");
      return data || [];
    },
    enabled: !!workspaceId,
    staleTime: 60_000,
  });

  const handleVincularProjeto = useCallback(async (bookmakerId: string, projetoId: string, projetoNome: string) => {
    // Check if bookmaker is already linked to a project
    const { data: current } = await supabase
      .from("bookmakers")
      .select("projeto_id, saldo_atual, moeda, workspace_id")
      .eq("id", bookmakerId)
      .single();
    if (current?.projeto_id) {
      toast({ title: "Casa já vinculada", description: "Desvincule do projeto atual antes de vincular a outro.", variant: "destructive" });
      return;
    }
    const { error } = await supabase
      .from("bookmakers")
      .update({ projeto_id: projetoId })
      .eq("id", bookmakerId);
    if (error) {
      toast({ title: "Erro ao vincular projeto", description: error.message, variant: "destructive" });
    } else {
      // executeLink cuida de: atribuir órfãs + DEPOSITO_VIRTUAL
      if (current && current.workspace_id) {
        const { data: userData } = await supabase.auth.getUser();
        if (userData.user) {
          const { executeLink } = await import("@/lib/projetoTransitionService");
          await executeLink({
            bookmakerId,
            projetoId,
            workspaceId: current.workspace_id,
            userId: userData.user.id,
            saldoAtual: current.saldo_atual || 0,
            moeda: current.moeda || 'BRL',
          });
        }
      }

      toast({ title: "Projeto vinculado", description: `Casa vinculada ao projeto "${projetoNome}"` });
      queryClient.invalidateQueries({ queryKey: ["parceiro-financeiro"] });
    }
  }, [toast, queryClient]);

  const handleDesvincularProjeto = useCallback(async (bookmakerId: string, projetoNome: string) => {
    try {
      const { data: userData } = await supabase.auth.getUser();
      if (!userData.user) {
        toast({ title: "Erro", description: "Usuário não autenticado", variant: "destructive" });
        return;
      }

      const { preCheckUnlink, executeUnlink } = await import("@/lib/projetoTransitionService");
      const check = await preCheckUnlink(bookmakerId);

      if (!check.projetoId) {
        toast({ title: "Erro", description: "Casa não está vinculada a nenhum projeto", variant: "destructive" });
        return;
      }

      // Bug fix: Use "ativo" as default status for unlink from partner panel
      // The RPC will handle estado_conta preservation
      await executeUnlink({
        bookmakerId,
        projetoId: check.projetoId,
        workspaceId: check.workspaceId,
        userId: userData.user.id,
        statusFinal: "ativo",
        saldoVirtualEfetivo: check.saldoVirtualEfetivo,
        moeda: check.moeda,
      });
      // Nota: Parceiro panel não tem contexto de investidor, usa default (false)

      if (check.warnings.length > 0) {
        toast({ title: "Desvinculado com avisos", description: check.warnings.join('; ') });
      } else {
        toast({ title: "Projeto desvinculado", description: `Casa desvinculada do projeto "${projetoNome}"` });
      }
      queryClient.invalidateQueries({ queryKey: ["parceiro-financeiro"] });
    } catch (err: any) {
      toast({ title: "Erro ao desvincular", description: err.message, variant: "destructive" });
    }
  }, [toast, queryClient]);

  // Reset currency filter when partner changes to prevent filtering with a currency
  // that may not exist for the new partner
  useEffect(() => {
    setFiltroMoeda("todas");
    setBuscaCasa("");
    setFiltroStatus(null);
    setFiltroRegulamentacao("todas");
  }, [parceiroId]);
  
  // Converter rates para um mapa simples de moeda → cotação em BRL
  const ratesMap: Record<string, number> = {
    USD: rates.USDBRL,
    EUR: rates.EURBRL,
    GBP: rates.GBPBRL,
    MYR: rates.MYRBRL,
    MXN: rates.MXNBRL,
    ARS: rates.ARSBRL,
    COP: rates.COPBRL,
    USDT: rates.USDBRL, // Stablecoins = USD
    USDC: rates.USDBRL,
  };


  // Mover hooks useMemo ANTES de qualquer early return
  const depositadoEntries = useMemo(() => 
    data ? saldosToEntries(data.depositado_por_moeda) : [], 
    [data?.depositado_por_moeda]
  );
  const sacadoEntries = useMemo(() => 
    data ? saldosToEntries(data.sacado_por_moeda) : [], 
    [data?.sacado_por_moeda]
  );
  const saldoEntriesVisual = useMemo(() => {
    if (!data?.bookmakers) return [];

    const saldosPorMoeda: Record<string, number> = {};
    data.bookmakers.forEach((bm) => {
      const moeda = bm.moeda || "BRL";
      saldosPorMoeda[moeda] = (saldosPorMoeda[moeda] || 0) + clampSaldoVisual(bm.saldo_atual);
    });

    return Object.entries(saldosPorMoeda)
      .filter(([, value]) => value !== 0)
      .map(([currency, value]) => ({ currency, value }));
  }, [data?.bookmakers]);
  const resultadoEntries = useMemo(() => 
    data ? saldosToEntries(data.resultado_por_moeda) : [], 
    [data?.resultado_por_moeda]
  );
  
  const hasLucro = useMemo(() => resultadoEntries.some(e => e.value > 0), [resultadoEntries]);
  const hasPrejuizo = useMemo(() => resultadoEntries.some(e => e.value < 0), [resultadoEntries]);
  
  // Base filtrada por moeda e regulamentação (sem filtro de status) para contagem dos badges
  const bookmakersFiltradosPorMoeda = useMemo(() => {
    if (!data?.bookmakers) return [];
    let filtered = data.bookmakers;
    if (filtroMoeda !== "todas") {
      filtered = filtered.filter(b => (b.moeda || "BRL") === filtroMoeda);
    }
    if (filtroRegulamentacao !== "todas") {
      filtered = filtered.filter(b => (b.catalogo_status || "REGULAMENTADA") === filtroRegulamentacao);
    }
    return filtered;
  }, [data?.bookmakers, filtroMoeda, filtroRegulamentacao]);

  // Contagem baseada no status REAL da conta, respeitando filtro de moeda
  const bookmarkersAtivos = useMemo(() => 
    bookmakersFiltradosPorMoeda.filter(b => b.status === "ativo").length, 
    [bookmakersFiltradosPorMoeda]
  );
  const bookmakersLimitados = useMemo(() => 
    bookmakersFiltradosPorMoeda.filter(b => b.status === "limitada").length, 
    [bookmakersFiltradosPorMoeda]
  );
  const bookmakersEncerrados = useMemo(() => 
    bookmakersFiltradosPorMoeda.filter(b => b.status === "encerrada").length, 
    [bookmakersFiltradosPorMoeda]
  );

  // IDs dos bookmakers para buscar status de uso
  const bookmakerIds = useMemo(() => 
    data?.bookmakers.map(b => b.bookmaker_id) ?? [], 
    [data?.bookmakers]
  );
  const { usageMap, refetch: refetchUsageMap } = useBookmakerUsageStatus(bookmakerIds);

  // Lista de moedas únicas para o filtro
  const moedasDisponiveis = useMemo(() => {
    if (!data?.bookmakers) return [];
    const moedas = new Set(data.bookmakers.map(b => b.moeda || "BRL"));
    return Array.from(moedas).sort();
  }, [data?.bookmakers]);

  // Bookmakers filtrados por moeda, status, regulamentação e busca
  const bookmakersFiltradosMoeda = useMemo(() => {
    if (!data?.bookmakers) return [];
    let filtered = data.bookmakers;
    if (filtroMoeda !== "todas") {
      filtered = filtered.filter(b => (b.moeda || "BRL") === filtroMoeda);
    }
    if (filtroStatus) {
      filtered = filtered.filter(b => b.status === filtroStatus);
    }
    if (filtroRegulamentacao !== "todas") {
      filtered = filtered.filter(b => (b.catalogo_status || "REGULAMENTADA") === filtroRegulamentacao);
    }
    return filtered;
  }, [data?.bookmakers, filtroMoeda, filtroStatus, filtroRegulamentacao]);

  const bookmakersFiltrados = useMemo(() => {
    if (!buscaCasa.trim()) return bookmakersFiltradosMoeda;
    const termo = buscaCasa.trim().toLowerCase();
    return bookmakersFiltradosMoeda.filter(b => 
      b.bookmaker_nome.toLowerCase().includes(termo) ||
      (b.instance_identifier || '').toLowerCase().includes(termo)
    );
  }, [bookmakersFiltradosMoeda, buscaCasa]);

  // Sort handler
  const handleSort = useCallback((col: typeof sortColumn) => {
    if (sortColumn === col) {
      setSortDirection(prev => prev === "desc" ? "asc" : "desc");
    } else {
      setSortColumn(col);
      setSortDirection("desc");
    }
  }, [sortColumn]);

  // Sorted bookmakers
  const bookmakersSorted = useMemo(() => {
    if (!sortColumn) return bookmakersFiltrados;
    const keyMap = { dep: "total_depositado", saq: "total_sacado", saldo: "saldo_atual", resultado: "lucro_prejuizo", apostas: "qtd_apostas" } as const;
    const key = keyMap[sortColumn];
    return [...bookmakersFiltrados].sort((a, b) => {
      const va = sortColumn === "saldo" ? clampSaldoVisual((a as any)[key]) : ((a as any)[key] ?? 0);
      const vb = sortColumn === "saldo" ? clampSaldoVisual((b as any)[key]) : ((b as any)[key] ?? 0);
      return sortDirection === "desc" ? vb - va : va - vb;
    });
  }, [bookmakersFiltrados, sortColumn, sortDirection]);

  // Determina se há algum filtro dimensional ativo (status ou regulamentação)
  const hasActiveFilter = !!filtroStatus || filtroRegulamentacao !== "todas";
  
  // KPIs filtrados - recalcula com base nos bookmakers filtrados
  // Quando há filtro dimensional ativo, SEMPRE agrega dos bookmakers filtrados
  const kpisFiltrados = useMemo(() => {
    if (filtroMoeda === "todas" && !hasActiveFilter) {
      // Sem filtro algum: usar dados consolidados originais
      const consolidarEmBRL = (entries: { currency: string; value: number }[]): number => {
        return entries.reduce((total, e) => {
          return total + convertToBRL(e.value, e.currency);
        }, 0);
      };

      return {
        depositado: depositadoEntries,
        depositadoBRL: consolidarEmBRL(depositadoEntries),
        sacado: sacadoEntries,
        sacadoBRL: consolidarEmBRL(sacadoEntries),
        saldo: saldoEntriesVisual,
        saldoBRL: consolidarEmBRL(saldoEntriesVisual),
        resultado: resultadoEntries,
        resultadoBRL: consolidarEmBRL(resultadoEntries),
        apostas: data?.qtd_apostas_total ?? 0,
        isConsolidado: true,
      };
    }
    
    // Há algum filtro ativo: agregar dos bookmakers filtrados
    const consolidarEmBRL = (entries: { currency: string; value: number }[]): number => {
      return entries.reduce((total, e) => {
        return total + convertToBRL(e.value, e.currency);
      }, 0);
    };

    let depositadoTotal = 0;
    let sacadoTotal = 0;
    let saldoTotal = 0;
    let resultadoTotal = 0;
    let apostasTotal = 0;
    
    // Agregar por moeda para breakdown
    const depPorMoeda: Record<string, number> = {};
    const saqPorMoeda: Record<string, number> = {};
    const salPorMoeda: Record<string, number> = {};
    const resPorMoeda: Record<string, number> = {};
    
    bookmakersFiltradosMoeda.forEach(bm => {
      const moeda = bm.moeda || "BRL";
      depositadoTotal += bm.total_depositado ?? 0;
      sacadoTotal += bm.total_sacado ?? 0;
      saldoTotal += clampSaldoVisual(bm.saldo_atual);
      resultadoTotal += bm.lucro_prejuizo ?? 0;
      apostasTotal += bm.qtd_apostas ?? 0;
      
      depPorMoeda[moeda] = (depPorMoeda[moeda] || 0) + (bm.total_depositado ?? 0);
      saqPorMoeda[moeda] = (saqPorMoeda[moeda] || 0) + (bm.total_sacado ?? 0);
      salPorMoeda[moeda] = (salPorMoeda[moeda] || 0) + clampSaldoVisual(bm.saldo_atual);
      resPorMoeda[moeda] = (resPorMoeda[moeda] || 0) + (bm.lucro_prejuizo ?? 0);
    });
    
    const toEntries = (map: Record<string, number>) => 
      Object.entries(map).filter(([, v]) => v !== 0).map(([currency, value]) => ({ currency, value }));
    
    if (filtroMoeda !== "todas") {
      // Moeda específica selecionada
      return {
        depositado: [{ currency: filtroMoeda, value: depositadoTotal }],
        depositadoBRL: undefined,
        sacado: [{ currency: filtroMoeda, value: sacadoTotal }],
        sacadoBRL: undefined,
        saldo: [{ currency: filtroMoeda, value: saldoTotal }],
        saldoBRL: undefined,
        resultado: [{ currency: filtroMoeda, value: resultadoTotal }],
        resultadoBRL: undefined,
        apostas: apostasTotal,
        isConsolidado: false,
      };
    }
    
    // Moeda "todas" mas com filtro dimensional: consolidar em BRL com breakdown
    const depEntries = toEntries(depPorMoeda);
    const saqEntries = toEntries(saqPorMoeda);
    const salEntries = toEntries(salPorMoeda);
    const resEntries = toEntries(resPorMoeda);
    
    return {
      depositado: depEntries,
      depositadoBRL: consolidarEmBRL(depEntries),
      sacado: saqEntries,
      sacadoBRL: consolidarEmBRL(saqEntries),
      saldo: salEntries,
      saldoBRL: consolidarEmBRL(salEntries),
      resultado: resEntries,
      resultadoBRL: consolidarEmBRL(resEntries),
      apostas: apostasTotal,
      isConsolidado: true,
    };
  }, [filtroMoeda, hasActiveFilter, bookmakersFiltradosMoeda, depositadoEntries, sacadoEntries, saldoEntriesVisual, resultadoEntries, data?.qtd_apostas_total, convertToBRL]);

  // Determinar lucro/prejuízo baseado nos KPIs filtrados
  const hasLucroFiltrado = useMemo(() => kpisFiltrados.resultado.some(e => e.value > 0), [kpisFiltrados.resultado]);
  const hasPrejuizoFiltrado = useMemo(() => kpisFiltrados.resultado.some(e => e.value < 0), [kpisFiltrados.resultado]);

  const handleBookmakersDataChange = useCallback(() => {
    if (parceiroId) {
      parceiroCache.invalidateCache(parceiroId);
    }
  }, [parceiroId, parceiroCache.invalidateCache]);

  const copyToClipboard = async (text: string, field: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedField(field);
      toast({
        title: "Copiado!",
        description: `${field} copiado para a área de transferência`,
      });
      setTimeout(() => setCopiedField(null), 2000);
    } catch (error) {
      toast({
        title: "Erro ao copiar",
        variant: "destructive",
      });
    }
  };

  // resolvePassword removed — now using LazyPasswordField component

  const isUSDMoeda = (moeda: string) => moeda === "USD" || moeda === "USDT";

  const formatCurrency = (value: number, moeda: string = "BRL") => {
    const symbol = isUSDMoeda(moeda) ? "$" : "R$";
    const formatted = new Intl.NumberFormat("pt-BR", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(value);
    return `${symbol} ${formatted}`;
  };

  // Estado vazio - sem parceiro selecionado
  if (!parceiroId) {
    return (
      <div className="h-full flex flex-col items-center justify-center text-muted-foreground">
        <User className="h-12 w-12 mb-3 opacity-30" />
        <p className="text-sm font-medium">Selecione um parceiro</p>
        <p className="text-xs">Escolha um parceiro na lista</p>
      </div>
    );
  }

  // Estado de loading
  if (loading) {
    return (
      <div className="h-full flex flex-col p-4 space-y-3">
        <div className="grid gap-2 grid-cols-2 lg:grid-cols-4">
          {[...Array(4)].map((_, i) => (
            <Skeleton key={i} className="h-14" />
          ))}
        </div>
        <Skeleton className="flex-1" />
      </div>
    );
  }

  // Estado de erro
  if (error || !data) {
    return (
      <div className="h-full flex flex-col items-center justify-center text-destructive text-sm gap-3">
        <AlertCircle className="h-6 w-6" />
        <p>Erro ao carregar dados</p>
        <Button variant="outline" size="sm" onClick={() => parceiroCache.refreshCurrent()}>
          <RefreshCw className="h-3 w-3 mr-2" />
          Tentar novamente
        </Button>
      </div>
    );
  }



  return (
    <>
    <TooltipProvider>
      {/* MainPanel: flex-col, altura 100%, sem scroll próprio */}
      <div className="h-full flex flex-col">
        
        {/* PartnerHeader: mobile-optimized */}
        <div className="shrink-0 p-4 pb-2 border-b border-border">
          {/* Linha 1: Nome + Status */}
          <div className="flex items-center gap-2 mb-1">
            <div 
              className="flex h-9 w-9 md:h-10 md:w-10 items-center justify-center rounded-full bg-primary/10 cursor-pointer hover:bg-primary/20 transition-colors shrink-0"
              onClick={onViewParceiro}
            >
              <User className="h-4 w-4 md:h-5 md:w-5 text-primary" />
            </div>
            <div className="flex-1 min-w-0 cursor-pointer group" onClick={onViewParceiro}>
              <h2 className="text-base md:text-lg font-semibold truncate group-hover:text-primary transition-colors">{data.parceiro_nome}</h2>
            </div>
            <Badge
              variant="outline"
              className={cn(
                "text-[10px] px-1.5 py-0 h-5 shrink-0",
                parceiroStatus === "ativo"
                  ? "border-success/50 text-success"
                  : "border-muted-foreground/50 text-muted-foreground"
              )}
            >
              {parceiroStatus === "ativo" ? "Ativo" : "Inativo"}
            </Badge>
            {/* Mobile: overflow menu for actions */}
            <Popover open={mobileMenuOpen} onOpenChange={setMobileMenuOpen}>
              <PopoverTrigger asChild>
                <Button variant="ghost" size="icon" className="shrink-0 h-8 w-8 md:hidden">
                  <CircleDashed className="h-4 w-4" />
                </Button>
              </PopoverTrigger>
              <PopoverContent align="end" className="w-44 p-1.5 md:hidden">
                <div className="flex flex-col gap-0.5">
                  <button
                    onClick={() => { parceiroCache.refreshCurrent(); toast({ title: "Atualizando dados..." }); setMobileMenuOpen(false); }}
                    className="flex items-center gap-2 px-3 py-2 rounded-md text-sm hover:bg-muted transition-colors w-full text-left"
                  >
                    <RefreshCw className="h-4 w-4" />
                    Atualizar
                  </button>
                  {onToggleSensitiveData && (
                    <button
                      onClick={() => { onToggleSensitiveData(); setMobileMenuOpen(false); }}
                      className="flex items-center gap-2 px-3 py-2 rounded-md text-sm hover:bg-muted transition-colors w-full text-left"
                    >
                      {showSensitiveData ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      {showSensitiveData ? "Ocultar valores" : "Mostrar valores"}
                    </button>
                  )}
                  {onEditParceiro && canEdit('parceiros', 'parceiros.edit') && (
                    <button
                      onClick={() => { onEditParceiro(); setMobileMenuOpen(false); }}
                      className="flex items-center gap-2 px-3 py-2 rounded-md text-sm hover:bg-muted transition-colors w-full text-left"
                    >
                      <Edit className="h-4 w-4" />
                      Editar
                    </button>
                  )}
                  {onDeleteParceiro && canDelete('parceiros', 'parceiros.delete') && (
                    <button
                      onClick={() => { onDeleteParceiro(); setMobileMenuOpen(false); }}
                      className="flex items-center gap-2 px-3 py-2 rounded-md text-sm hover:bg-muted transition-colors w-full text-left text-destructive"
                    >
                      <Trash2 className="h-4 w-4" />
                      Excluir
                    </button>
                  )}
                </div>
              </PopoverContent>
            </Popover>
          </div>

          {/* Linha 2: Métricas resumidas */}
          <div className="flex items-center gap-2 text-xs text-muted-foreground ml-11 md:ml-12 flex-wrap">
            <span>{data.bookmakers.length} casa{data.bookmakers.length !== 1 ? "s" : ""}</span>
            {hasParceria && diasRestantes !== null && diasRestantes !== undefined && (
              <>
                <span>•</span>
                <span className={cn(
                  "flex items-center gap-1 font-medium",
                  diasRestantes >= 31 ? "text-emerald-500" :
                  diasRestantes >= 16 ? "text-lime-500" :
                  diasRestantes >= 8 ? "text-yellow-500" :
                  "text-red-500"
                )}>
                  <Calendar className="h-3 w-3" />
                  {diasRestantes} dias
                </span>
              </>
            )}
            {(saldoBanco !== 0 || saldoCrypto !== 0) && (
              <>
                <span>•</span>
                <Popover>
                  <PopoverTrigger asChild>
                    <button 
                      className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors cursor-pointer rounded px-1.5 py-0.5 hover:bg-muted/50"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <DollarSign className="h-3 w-3" />
                      <span>Saldos</span>
                    </button>
                  </PopoverTrigger>
                  <PopoverContent side="bottom" align="start" className="w-64 p-3">
                    <div className="space-y-3">
                      <p className="text-xs font-semibold text-foreground">Saldos do Parceiro</p>
                      {saldoBanco !== 0 && (
                        <div className="flex items-center justify-between">
                          <span className="text-xs text-muted-foreground flex items-center gap-1.5">
                            <Building2 className="h-3.5 w-3.5" />
                            Contas Bancárias
                          </span>
                          <span className={cn("text-sm font-medium font-mono", saldoBanco < 0 && "text-destructive")}>
                            R$ {saldoBanco.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
                          </span>
                        </div>
                      )}
                      {saldoCrypto !== 0 && (
                        <div className="flex items-center justify-between">
                          <span className="text-xs text-muted-foreground flex items-center gap-1.5">
                            <Wallet className="h-3.5 w-3.5" />
                            Wallets Crypto
                          </span>
                          <span className={cn("text-sm font-medium font-mono", saldoCrypto < 0 && "text-destructive")}>
                            $ {saldoCrypto.toLocaleString("en-US", { minimumFractionDigits: 2 })}
                          </span>
                        </div>
                      )}
                      {saldoBanco !== 0 && saldoCrypto !== 0 && (
                        <div className="border-t pt-2 space-y-1.5">
                          <div className="flex items-center justify-between">
                            <span className="text-xs font-medium text-muted-foreground">Patrimônio externo</span>
                            <span className="text-sm font-bold text-primary font-mono">
                              R$ {(saldoBanco + convertToBRL(saldoCrypto, "USD")).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
                            </span>
                          </div>
                          <p className="text-[10px] text-muted-foreground">
                            Cotação USD: R$ {rates.USDBRL.toFixed(4)}
                          </p>
                        </div>
                      )}
                    </div>
                  </PopoverContent>
                </Popover>
              </>
            )}
          </div>

          {/* Desktop: action buttons row (hidden on mobile) */}
          <div className="hidden md:flex items-center gap-1.5 mt-2 ml-12">
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="outline"
                  size="icon"
                  onClick={() => {
                    parceiroCache.refreshCurrent();
                    toast({ title: "Atualizando dados...", description: "Os dados do parceiro estão sendo recarregados." });
                  }}
                  disabled={loading}
                  className="shrink-0 h-8 w-8"
                >
                  <RefreshCw className={cn("h-4 w-4", loading && "animate-spin")} />
                </Button>
              </TooltipTrigger>
              <TooltipContent><p>Atualizar dados</p></TooltipContent>
            </Tooltip>
            {onEditParceiro && canEdit('parceiros', 'parceiros.edit') && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button variant="outline" size="icon" onClick={onEditParceiro} className="shrink-0 h-8 w-8">
                    <Edit className="h-4 w-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent><p>Editar parceiro</p></TooltipContent>
              </Tooltip>
            )}
            {onDeleteParceiro && canDelete('parceiros', 'parceiros.delete') && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button variant="outline" size="icon" onClick={onDeleteParceiro} className="shrink-0 h-8 w-8 text-destructive hover:text-destructive">
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent><p>Excluir parceiro</p></TooltipContent>
              </Tooltip>
            )}
            {onToggleSensitiveData && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button variant="outline" size="icon" onClick={onToggleSensitiveData} className="shrink-0 h-8 w-8">
                    {showSensitiveData ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </Button>
                </TooltipTrigger>
                <TooltipContent><p>{showSensitiveData ? "Ocultar dados sensíveis" : "Mostrar dados sensíveis"}</p></TooltipContent>
              </Tooltip>
            )}
          </div>
        </div>

        {/* Tabs container: flex-1 para ocupar espaço restante, min-h-0 para permitir shrink */}
        <Tabs
          defaultValue="resumo"
          className="flex-1 min-h-0 flex flex-col"
          onValueChange={(value) => parceiroCache.changeTab(value as TabKey)}
        >
          {/* PartnerTabs: fixo */}
          <div className="shrink-0 px-4 pt-2">
            <TabsList className="grid w-full grid-cols-3 h-8">
              <TabsTrigger value="resumo" className="text-xs gap-1">
                <BarChart3 className="h-3 w-3" />
                Resumo
              </TabsTrigger>
              <TabsTrigger value="movimentacoes" className="text-xs gap-1">
                <History className="h-3 w-3" />
                Movimentações
              </TabsTrigger>
              <TabsTrigger value="bookmakers" className="text-xs gap-1">
                <Building2 className="h-3 w-3" />
                Bookmakers
              </TabsTrigger>
            </TabsList>
          </div>

          {/* TabViewport: flex-1 min-h-0 relative - área delimitada para conteúdo */}
          {/* Cada TabsContent usa absolute positioning para ocupar espaço definido */}
          <div className="flex-1 min-h-0 relative">
            {/* Aba Resumo - SEM scroll externo, flex-col para hierarquia */}
            <TabsContent 
              value="resumo" 
              className="absolute inset-0 mt-0 p-4 flex flex-col data-[state=inactive]:hidden"
            >
              {/* Alerta quando parceiro está inativo */}
              {parceiroStatus === "inativo" && (
                <div className="shrink-0 mb-3 flex items-center gap-2 p-2.5 rounded-lg bg-destructive/10 border border-destructive/30 text-destructive">
                  <Lock className="h-4 w-4 shrink-0" />
                  <div className="text-xs">
                    <span className="font-medium">Parceiro Inativo</span>
                    <span className="text-destructive/80"> — Operações financeiras bloqueadas. O status real das contas está preservado.</span>
                  </div>
                </div>
              )}

              {/* Conteúdo fixo: KPIs e Info */}
              <div className="shrink-0 space-y-3">
                {/* KPIs - Desktop: 5 cols | Mobile: 3 primary + expandable */}
                {/* Desktop layout */}
                <div className="hidden lg:grid gap-2 grid-cols-5">
                  <ParceiroKpiCard
                    icon={<ArrowDownToLine className="h-4 w-4 text-destructive" />}
                    label="Depositado"
                    entries={kpisFiltrados.depositado}
                    consolidadoBRL={kpisFiltrados.depositadoBRL}
                    showBreakdown={kpisFiltrados.isConsolidado}
                    masked={!showSensitiveData}
                    dataSource={dataSource}
                    isUsingFallback={isUsingFallback}
                    rates={ratesMap}
                  />
                  <ParceiroKpiCard
                    icon={<ArrowUpFromLine className="h-4 w-4 text-success" />}
                    label="Sacado"
                    entries={kpisFiltrados.sacado}
                    consolidadoBRL={kpisFiltrados.sacadoBRL}
                    showBreakdown={kpisFiltrados.isConsolidado}
                    masked={!showSensitiveData}
                    dataSource={dataSource}
                    isUsingFallback={isUsingFallback}
                    rates={ratesMap}
                  />
                  <ParceiroKpiCard
                    icon={<Wallet className="h-4 w-4 text-primary" />}
                    label="💰 Saldo Atual"
                    entries={kpisFiltrados.saldo}
                    consolidadoBRL={kpisFiltrados.saldoBRL}
                    showBreakdown={kpisFiltrados.isConsolidado}
                    masked={!showSensitiveData}
                    cardClassName="bg-primary/10 border-primary/30 ring-1 ring-primary/20"
                    labelClassName="text-primary/80 font-medium"
                    dataSource={dataSource}
                    isUsingFallback={isUsingFallback}
                    rates={ratesMap}
                  />
                  <ParceiroKpiCard
                    icon={
                      showSensitiveData ? (
                        hasLucroFiltrado && !hasPrejuizoFiltrado ? (
                          <TrendingUp className="h-4 w-4 text-success" />
                        ) : (
                          <TrendingDown className="h-4 w-4 text-destructive" />
                        )
                      ) : (
                        <TrendingUp className="h-4 w-4 text-muted-foreground" />
                      )
                    }
                    label="Resultado Financeiro"
                    entries={kpisFiltrados.resultado}
                    consolidadoBRL={kpisFiltrados.resultadoBRL}
                    showBreakdown={kpisFiltrados.isConsolidado}
                    masked={!showSensitiveData}
                    variant="auto"
                    dataSource={dataSource}
                    isUsingFallback={isUsingFallback}
                    rates={ratesMap}
                  />
                  <div className="flex items-start gap-2 p-2.5 rounded-lg bg-muted/30 border border-border">
                    <Target className="h-4 w-4 text-primary shrink-0 mt-0.5" />
                    <div className="min-w-0 flex-1">
                      <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Apostas</p>
                      <p className="text-sm font-semibold">{kpisFiltrados.apostas.toLocaleString("pt-BR")}</p>
                    </div>
                  </div>
                </div>

                {/* Mobile layout: Progressive KPIs */}
                <MobileProgressiveKpis
                  kpisFiltrados={kpisFiltrados}
                  showSensitiveData={showSensitiveData}
                  hasLucroFiltrado={hasLucroFiltrado}
                  hasPrejuizoFiltrado={hasPrejuizoFiltrado}
                  dataSource={dataSource}
                  isUsingFallback={isUsingFallback}
                  ratesMap={ratesMap}
                />

                {/* Info secundária: apenas casas ativas/limitadas */}
                <div className="flex flex-wrap gap-3 text-xs">
                  <button
                    onClick={() => setFiltroStatus(filtroStatus === "ativo" ? null : "ativo")}
                    className={cn(
                      "flex items-center gap-1.5 px-2 py-1 rounded transition-colors",
                      filtroStatus === "ativo" 
                        ? "bg-success/20 ring-1 ring-success/50" 
                        : "bg-muted/30 hover:bg-muted/50"
                    )}
                  >
                    <Building2 className="h-3 w-3 text-success" />
                    <span className="text-muted-foreground">Ativas:</span>
                    <span className="font-medium text-success">{bookmarkersAtivos}</span>
                  </button>
                  <button
                    onClick={() => setFiltroStatus(filtroStatus === "limitada" ? null : "limitada")}
                    className={cn(
                      "flex items-center gap-1.5 px-2 py-1 rounded transition-colors",
                      filtroStatus === "limitada" 
                        ? "bg-warning/20 ring-1 ring-warning/50" 
                        : "bg-muted/30 hover:bg-muted/50"
                    )}
                  >
                    <AlertCircle className="h-3 w-3 text-warning" />
                    <span className="text-muted-foreground">Limitadas:</span>
                    <span className="font-medium text-warning">{bookmakersLimitados}</span>
                  </button>
                  {bookmakersEncerrados > 0 && (
                    <button
                      onClick={() => setFiltroStatus(filtroStatus === "encerrada" ? null : "encerrada")}
                      className={cn(
                        "flex items-center gap-1.5 px-2 py-1 rounded transition-colors",
                        filtroStatus === "encerrada" 
                          ? "bg-destructive/20 ring-1 ring-destructive/50" 
                          : "bg-muted/30 hover:bg-muted/50"
                      )}
                    >
                      <AlertCircle className="h-3 w-3 text-destructive" />
                      <span className="text-muted-foreground">Encerradas:</span>
                      <span className="font-medium text-destructive">{bookmakersEncerrados}</span>
                    </button>
                  )}
                  {filtroStatus && (
                    <button
                      onClick={() => setFiltroStatus(null)}
                      className="flex items-center gap-1 px-2 py-1 rounded bg-muted/30 hover:bg-muted/50 transition-colors text-muted-foreground"
                    >
                      <span className="text-[10px]">✕ Limpar filtro</span>
                    </button>
                  )}
                </div>
              </div>

              {/* Card Desempenho por Casa - ocupa espaço restante com scroll interno */}
              <div className="flex-1 min-h-0 mt-3 border border-border rounded-lg flex flex-col">
                  {/* Header do card com filtro de moeda e busca */}
                  <div className="px-3 py-2 bg-muted/30 border-b border-border flex flex-col gap-2">
                    {/* Row 1: Title + Desktop search */}
                    <div className="flex items-center justify-between gap-2">
                      <h3 className="text-xs font-medium flex items-center gap-1.5 shrink-0">
                        <Building2 className="h-3.5 w-3.5 text-primary" />
                        Desempenho por Casa ({bookmakersFiltradosMoeda.length}{filtroMoeda !== "todas" ? `/${data.bookmakers.length}` : ""})
                      </h3>
                      {/* Desktop: search inline */}
                      <div className="hidden md:flex items-center gap-2">
                        <div className="relative shrink-0">
                          <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3 w-3 text-muted-foreground pointer-events-none" />
                          <input
                            type="text"
                            value={buscaCasa}
                            onChange={(e) => setBuscaCasa(e.target.value)}
                            onKeyDown={(e) => { if (e.key === "Escape") setBuscaCasa(""); }}
                            placeholder="Buscar casa…"
                            className="h-6 w-[130px] rounded border border-border/50 bg-background/50 pl-6 pr-2 text-[10px] placeholder:text-muted-foreground/60 focus:outline-none focus:border-border transition-colors"
                          />
                        </div>
                        <div className="flex items-center gap-1 rounded-md border border-border/50 bg-background/50 p-0.5 shrink-0">
                          <button
                            onClick={() => setFiltroMoeda("todas")}
                            className={cn(
                              "h-5 px-2 rounded text-[10px] font-medium tracking-wide transition-colors uppercase",
                              filtroMoeda === "todas" && filtroRegulamentacao === "todas"
                                ? "bg-primary text-primary-foreground"
                                : filtroMoeda === "todas"
                                  ? "bg-muted text-foreground"
                                  : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
                            )}
                          >
                            Todas
                          </button>
                          {moedasDisponiveis.slice(0, 4).map(moeda => (
                            <button
                              key={moeda}
                              onClick={() => setFiltroMoeda(filtroMoeda === moeda ? "todas" : moeda)}
                              className={cn(
                                "h-5 px-2 rounded text-[10px] font-medium tracking-wide transition-colors",
                                filtroMoeda === moeda
                                  ? "bg-primary text-primary-foreground"
                                  : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
                              )}
                            >
                              {moeda}
                            </button>
                          ))}
                          {moedasDisponiveis.length > 4 && (
                            <Popover>
                              <PopoverTrigger asChild>
                                <button
                                  className={cn(
                                    "h-5 px-2 rounded text-[10px] font-medium tracking-wide transition-colors",
                                    moedasDisponiveis.slice(4).includes(filtroMoeda)
                                      ? "bg-primary text-primary-foreground"
                                      : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
                                  )}
                                >
                                  +{moedasDisponiveis.length - 4}
                                </button>
                              </PopoverTrigger>
                              <PopoverContent className="w-auto p-1.5 flex flex-col gap-0.5" align="end">
                                {moedasDisponiveis.slice(4).map(moeda => (
                                  <button
                                    key={moeda}
                                    onClick={() => setFiltroMoeda(filtroMoeda === moeda ? "todas" : moeda)}
                                    className={cn(
                                      "h-6 px-3 rounded text-[11px] font-medium tracking-wide transition-colors text-left",
                                      filtroMoeda === moeda
                                        ? "bg-primary text-primary-foreground"
                                        : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
                                    )}
                                  >
                                    {moeda}
                                  </button>
                                ))}
                              </PopoverContent>
                            </Popover>
                          )}
                          <div className="w-px h-3.5 bg-border/60 mx-0.5" />
                          <button
                            onClick={() => setFiltroRegulamentacao(filtroRegulamentacao === "REGULAMENTADA" ? "todas" : "REGULAMENTADA")}
                            className={cn(
                              "h-5 px-2 rounded text-[10px] font-medium tracking-wide transition-colors uppercase",
                              filtroRegulamentacao === "REGULAMENTADA"
                                ? "bg-success/80 text-success-foreground"
                                : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
                            )}
                          >
                            Regulamentada
                          </button>
                          <button
                            onClick={() => setFiltroRegulamentacao(filtroRegulamentacao === "NAO_REGULAMENTADA" ? "todas" : "NAO_REGULAMENTADA")}
                            className={cn(
                              "h-5 px-2 rounded text-[10px] font-medium tracking-wide transition-colors uppercase",
                              filtroRegulamentacao === "NAO_REGULAMENTADA"
                                ? "bg-warning/80 text-warning-foreground"
                                : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
                            )}
                          >
                            Não Regulamentada
                          </button>
                        </div>
                      </div>
                    </div>

                    {/* Mobile: Full-width search */}
                    <div className="md:hidden">
                      <div className="relative w-full">
                        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
                        <input
                          type="text"
                          value={buscaCasa}
                          onChange={(e) => setBuscaCasa(e.target.value)}
                          onKeyDown={(e) => { if (e.key === "Escape") setBuscaCasa(""); }}
                          placeholder="Buscar casa..."
                          className="h-8 w-full rounded-md border border-border/50 bg-background/50 pl-8 pr-3 text-xs placeholder:text-muted-foreground/60 focus:outline-none focus:ring-1 focus:ring-ring transition-colors"
                        />
                      </div>
                    </div>

                    {/* Mobile: Horizontal scrollable currency chips */}
                    <div className="md:hidden flex items-center gap-1.5 overflow-x-auto scrollbar-none -mx-1 px-1 pb-0.5">
                      <button
                        onClick={() => setFiltroMoeda("todas")}
                        className={cn(
                          "shrink-0 h-7 px-3 rounded-full text-[11px] font-medium tracking-wide transition-all active:scale-95",
                          filtroMoeda === "todas"
                            ? "bg-primary text-primary-foreground shadow-sm"
                            : "bg-muted/50 text-muted-foreground hover:bg-muted"
                        )}
                      >
                        Todas
                      </button>
                      {moedasDisponiveis.map(moeda => (
                        <button
                          key={moeda}
                          onClick={() => setFiltroMoeda(filtroMoeda === moeda ? "todas" : moeda)}
                          className={cn(
                            "shrink-0 h-7 px-3 rounded-full text-[11px] font-medium tracking-wide transition-all active:scale-95",
                            filtroMoeda === moeda
                              ? "bg-primary text-primary-foreground shadow-sm"
                              : "bg-muted/50 text-muted-foreground hover:bg-muted"
                          )}
                        >
                          {moeda}
                        </button>
                      ))}
                    </div>
                  </div>

                  {bookmakersFiltrados.length === 0 ? (
                    <div className="text-center py-6 text-muted-foreground text-xs">
                      {data.bookmakers.length === 0 
                        ? "Nenhuma casa vinculada" 
                        : buscaCasa.trim() 
                          ? "Nenhuma casa encontrada"
                          : "Nenhuma casa com esta moeda"}
                    </div>
                  ) : (
                    <>
                      {buscaCasa.trim() && (
                        <div className="px-3 py-1 text-[10px] text-muted-foreground bg-muted/20 border-b border-border">
                          Mostrando {bookmakersFiltrados.length} de {bookmakersFiltradosMoeda.length} casas
                        </div>
                      )}

                      {/* DESKTOP: Table view */}
                      <div className="hidden md:flex md:flex-col md:flex-1 md:min-h-0">
                        {/* Header da tabela - sortable columns */}
                        <div className="grid grid-cols-8 gap-2 px-3 py-1.5 text-[10px] font-medium text-muted-foreground uppercase tracking-wide bg-muted/30 border-b border-border">
                          <div className="col-span-2">Casa</div>
                          <div className="text-center"></div>
                          {([
                            { key: "dep", label: "Dep." },
                            { key: "saq", label: "Saq." },
                            { key: "saldo", label: "Saldo" },
                            { key: "resultado", label: "Result. Fin." },
                            { key: "apostas", label: "Apost." },
                          ] as const).map(col => (
                            <button
                              key={col.key}
                              onClick={() => handleSort(col.key)}
                              className="text-right flex items-center justify-end gap-0.5 hover:text-foreground transition-colors cursor-pointer"
                            >
                              <span>{col.label}</span>
                              {sortColumn === col.key ? (
                                sortDirection === "desc" 
                                  ? <ArrowDown className="h-2.5 w-2.5 text-primary" /> 
                                  : <ArrowUp className="h-2.5 w-2.5 text-primary" />
                              ) : (
                                <ArrowUpDown className="h-2.5 w-2.5 opacity-30" />
                              )}
                            </button>
                          ))}
                        </div>

                        {/* Lista de bookmakers - desktop table */}
                        <div className="flex-1 min-h-0 overflow-y-auto divide-y divide-border">
                          {bookmakersSorted.map((bm) => (
                            <ContextMenu key={bm.bookmaker_id}>
                              <ContextMenuTrigger asChild>
                                <div className="grid grid-cols-8 gap-2 px-3 py-2 hover:bg-muted/20 transition-colors items-center cursor-context-menu">
                                  <div className="col-span-2 flex items-center gap-2 min-w-0">
                                    {bm.logo_url ? (
                                      <img src={bm.logo_url} alt={bm.bookmaker_nome} className="h-10 w-10 rounded object-contain p-0.5 shrink-0" />
                                    ) : (
                                      <div className="h-10 w-10 rounded bg-muted flex items-center justify-center shrink-0">
                                        <Building2 className="h-5 w-5 text-muted-foreground" />
                                      </div>
                                    )}
                                    <div className="min-w-0">
                                      <div className="flex items-center gap-1.5">
                                        <p className="text-xs font-medium truncate">{bm.bookmaker_nome}</p>
                                        {bm.has_credentials && (
                                          <Popover
                                            open={credentialsPopoverOpen === bm.bookmaker_id}
                                            onOpenChange={(open) => setCredentialsPopoverOpen(open ? bm.bookmaker_id : null)}
                                          >
                                            <PopoverTrigger asChild>
                                              <button
                                                type="button"
                                                className="h-5 w-5 p-0.5 shrink-0 rounded hover:bg-muted/50 transition-colors cursor-pointer flex items-center justify-center"
                                                onClick={(e) => { e.stopPropagation(); setCredentialsPopoverOpen(credentialsPopoverOpen === bm.bookmaker_id ? null : bm.bookmaker_id); }}
                                              >
                                                <IdCard className="h-4 w-4 text-muted-foreground hover:text-foreground" />
                                              </button>
                                            </PopoverTrigger>
                                            <PopoverContent className="w-52 p-2" align="start">
                                              <div className="space-y-2">
                                                <div>
                                                  <label className="text-[10px] text-muted-foreground">Usuário</label>
                                                  <div className="flex items-center gap-1 mt-0.5">
                                                    <code className="flex-1 text-xs bg-muted px-1.5 py-0.5 rounded truncate">{showSensitiveData ? bm.login_username : "••••••"}</code>
                                                    <Button variant="ghost" size="sm" onClick={() => bm.login_username && copyToClipboard(bm.login_username, "Usuário")} className="h-6 w-6 p-0 shrink-0">
                                                      {copiedField === "Usuário" ? <Check className="h-3 w-3 text-success" /> : <Copy className="h-3 w-3" />}
                                                    </Button>
                                                  </div>
                                                </div>
                                                <div>
                                                  <label className="text-[10px] text-muted-foreground">Senha</label>
                                                  <LazyPasswordField cacheKey={`parceiro-detalhes:${bm.bookmaker_id}`} encrypted={bm.login_password_encrypted} parentMasked={!showSensitiveData} requestDecrypt={requestDecrypt} isDecrypted={isDecrypted} getCached={getCached} />
                                                </div>
                                              </div>
                                            </PopoverContent>
                                          </Popover>
                                        )}
                                      </div>
                                      <div className="flex items-center gap-1 flex-wrap">
                                        <Badge variant="outline" className={cn("text-[9px] px-1 py-0 h-4", bm.status === "ativo" ? "border-success/50 text-success" : bm.status === "limitada" ? "border-warning/50 text-warning" : bm.status === "encerrada" ? "border-destructive/50 text-destructive" : "border-muted-foreground/50 text-muted-foreground")}>
                                          {bm.status === "ativo" ? "Ativa" : bm.status === "limitada" ? "Limitada" : bm.status === "encerrada" ? "Encerrada" : bm.status}
                                        </Badge>
                                        {parceiroStatus === "inativo" && (
                                          <Tooltip>
                                            <TooltipTrigger asChild>
                                              <Badge variant="outline" className="text-[9px] px-1 py-0 h-4 border-destructive/50 text-destructive">
                                                <Lock className="h-2.5 w-2.5 mr-0.5" />Bloq.
                                              </Badge>
                                            </TooltipTrigger>
                                            <TooltipContent side="top" className="max-w-[200px]"><p className="text-xs">Parceiro inativo. Operações financeiras bloqueadas.</p></TooltipContent>
                                          </Tooltip>
                                        )}
                                        <Badge variant="outline" className={cn("text-[9px] px-1 py-0 h-4", bm.moeda === "USD" || bm.moeda === "USDT" ? "border-cyan-500/50 text-cyan-400" : bm.moeda === "EUR" ? "border-yellow-500/50 text-yellow-400" : bm.moeda === "GBP" ? "border-purple-500/50 text-purple-400" : "border-emerald-500/50 text-emerald-400")}>
                                          {bm.moeda || "BRL"}
                                        </Badge>
                                      </div>
                                    </div>
                                  </div>
                                  {/* Botão Histórico de Projetos */}
                                  <div className="flex justify-center">
                                    {(() => {
                                      const usage = usageMap[bm.bookmaker_id];
                                      const config = usage ? getUsageCategoryConfig(usage.category) : null;
                                      const IconComponent = usage?.category === "ATIVA" ? CircleCheck : usage?.category === "JA_USADA" ? History : CircleDashed;
                                      const iconColorClass = config?.iconColor || "text-muted-foreground";
                                      return (
                                        <Tooltip>
                                          <TooltipTrigger asChild>
                                            <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => setHistoricoDialog({ open: true, bookmakerId: bm.bookmaker_id, bookmakerNome: bm.bookmaker_nome, logoUrl: bm.logo_url, status: bm.status })}>
                                              <IconComponent className={cn("h-4 w-4", iconColorClass, "hover:opacity-80")} />
                                            </Button>
                                          </TooltipTrigger>
                                          <TooltipContent>
                                            <p className="text-xs">{usage?.category === "ATIVA" && usage.projetoAtivoNome ? `Projeto: ${usage.projetoAtivoNome}` : config?.tooltip || "Ver histórico"}</p>
                                          </TooltipContent>
                                        </Tooltip>
                                      );
                                    })()}
                                  </div>
                                  <Tooltip><TooltipTrigger asChild><div className="text-right"><MoneyDisplay value={bm.total_depositado} currency={bm.moeda || "BRL"} size="sm" masked={!showSensitiveData} /></div></TooltipTrigger>{showSensitiveData && bm.total_depositado > 0 && <TooltipContent side="top" className="text-xs"><p className="font-medium">Total depositado</p><p>{formatMoneyValue(bm.total_depositado, bm.moeda || "BRL")}</p></TooltipContent>}</Tooltip>
                                  <Tooltip><TooltipTrigger asChild><div className="text-right"><MoneyDisplay value={bm.total_sacado} currency={bm.moeda || "BRL"} size="sm" masked={!showSensitiveData} /></div></TooltipTrigger>{showSensitiveData && bm.total_sacado > 0 && <TooltipContent side="top" className="text-xs"><p className="font-medium">Total sacado</p><p>{formatMoneyValue(bm.total_sacado, bm.moeda || "BRL")}</p></TooltipContent>}</Tooltip>
                                  <Tooltip><TooltipTrigger asChild><div className="text-right"><MoneyDisplay value={clampSaldoVisual(bm.saldo_atual)} currency={bm.moeda || "BRL"} size="sm" masked={!showSensitiveData} /></div></TooltipTrigger>{showSensitiveData && <TooltipContent side="top" className="text-xs space-y-1"><p className="font-medium">Saldo atual na casa</p><p>{formatMoneyValue(clampSaldoVisual(bm.saldo_atual), bm.moeda || "BRL")}</p></TooltipContent>}</Tooltip>
                                  <Tooltip>
                                    <TooltipTrigger asChild>
                                      <div className="text-right"><MoneyDisplay value={bm.lucro_prejuizo} currency={bm.moeda || "BRL"} size="sm" variant="auto" masked={!showSensitiveData} /></div>
                                    </TooltipTrigger>
                                    {showSensitiveData && (
                                      <TooltipContent side="top" className="text-xs">
                                        <p className="font-semibold mb-1.5">Resultado Financeiro Real</p>
                                        <div className="space-y-1 min-w-[200px]">
                                          <div className="flex justify-between gap-4"><span className="text-muted-foreground">Saques</span><span className="text-success">{formatMoneyValue(bm.total_sacado, bm.moeda || "BRL")}</span></div>
                                          <div className="flex justify-between gap-4"><span className="text-muted-foreground">+ Saldo Atual</span><span>{formatMoneyValue(clampSaldoVisual(bm.saldo_atual), bm.moeda || "BRL")}</span></div>
                                          <div className="flex justify-between gap-4"><span className="text-muted-foreground">− Depósitos</span><span className="text-destructive">{formatMoneyValue(bm.total_depositado, bm.moeda || "BRL")}</span></div>
                                          <div className="border-t border-border pt-1 flex justify-between gap-4 font-medium"><span>= Resultado</span><span className={bm.lucro_prejuizo >= 0 ? "text-success" : "text-destructive"}>{formatMoneyValue(bm.lucro_prejuizo, bm.moeda || "BRL")}</span></div>
                                        </div>
                                        {bm.resultado_operacional !== 0 && (
                                          <div className="mt-2 pt-1.5 border-t border-border/50 space-y-0.5 text-muted-foreground">
                                            <p className="text-[10px] font-medium">Performance Operacional</p>
                                            {bm.resultado_apostas !== 0 && <p className="text-[10px]">Apostas: {formatMoneyValue(bm.resultado_apostas, bm.moeda || "BRL")}</p>}
                                            {bm.resultado_giros !== 0 && <p className="text-[10px]">Giros: {formatMoneyValue(bm.resultado_giros, bm.moeda || "BRL")}</p>}
                                            {bm.resultado_cashback !== 0 && <p className="text-[10px]">Cashback: {formatMoneyValue(bm.resultado_cashback, bm.moeda || "BRL")}</p>}
                                            {bm.resultado_bonus !== 0 && <p className="text-[10px]">Bônus: {formatMoneyValue(bm.resultado_bonus, bm.moeda || "BRL")}</p>}
                                            <p className="text-[10px] font-medium">Total Op: <span className={bm.resultado_operacional >= 0 ? "text-success" : "text-destructive"}>{formatMoneyValue(bm.resultado_operacional, bm.moeda || "BRL")}</span></p>
                                          </div>
                                        )}
                                      </TooltipContent>
                                    )}
                                  </Tooltip>
                                  <div className="text-right text-sm font-medium text-muted-foreground">{bm.qtd_apostas.toLocaleString("pt-BR")}</div>
                                </div>
                              </ContextMenuTrigger>
                              <ContextMenuContent>
                                <ContextMenuSub>
                                  <ContextMenuSubTrigger className="gap-2"><DollarSign className="h-4 w-4" />Financeiro</ContextMenuSubTrigger>
                                  <ContextMenuSubContent className="min-w-[180px]">
                                    <ContextMenuItem onClick={() => onNewTransacao?.(bm.bookmaker_id, bm.bookmaker_nome, bm.moeda || "BRL", bm.saldo_atual ?? 0, 0, "deposito")} className="gap-2"><Plus className="h-4 w-4 text-success" />Depósito</ContextMenuItem>
                                    <ContextMenuItem onClick={() => onNewTransacao?.(bm.bookmaker_id, bm.bookmaker_nome, bm.moeda || "BRL", bm.saldo_atual ?? 0, 0, "retirada")} className="gap-2"><Minus className="h-4 w-4 text-destructive" />Saque</ContextMenuItem>
                                    <ContextMenuSeparator />
                                    <ContextMenuItem onClick={() => setPerdaDialog({ open: true, bookmakerId: bm.bookmaker_id, bookmakerNome: bm.bookmaker_nome, moeda: bm.moeda || "BRL", saldoAtual: bm.saldo_atual ?? 0 })} className="gap-2 text-destructive focus:text-destructive"><AlertTriangle className="h-4 w-4" />Registrar perda</ContextMenuItem>
                                  </ContextMenuSubContent>
                                </ContextMenuSub>
                                <ContextMenuSeparator />
                                {(() => {
                                  const usage = usageMap[bm.bookmaker_id];
                                  const isLinked = usage?.isActiveInProject || (bm.projetos && bm.projetos.length > 0);
                                  const projetoNome = usage?.projetoAtivoNome || projetos?.find(p => bm.projetos?.includes(p.id))?.nome || "atual";
                                  if (isLinked) {
                                    return (<ContextMenuItem onClick={() => handleDesvincularProjeto(bm.bookmaker_id, projetoNome)} className="gap-2 text-destructive focus:text-destructive"><FolderKanban className="h-4 w-4" />Desvincular do projeto {projetoNome}</ContextMenuItem>);
                                  }
                                  return (
                                    <ContextMenuSub>
                                      <ContextMenuSubTrigger className="gap-2"><FolderKanban className="h-4 w-4" />Vincular a projeto</ContextMenuSubTrigger>
                                      <ContextMenuSubContent className="min-w-[180px]">
                                        {projetos && projetos.length > 0 ? projetos.map((proj) => (<ContextMenuItem key={proj.id} onClick={() => handleVincularProjeto(bm.bookmaker_id, proj.id, proj.nome)} className="gap-2"><FolderKanban className="h-3.5 w-3.5 text-muted-foreground" />{proj.nome}</ContextMenuItem>)) : (<ContextMenuItem disabled className="text-muted-foreground text-xs">Nenhum projeto disponível</ContextMenuItem>)}
                                      </ContextMenuSubContent>
                                    </ContextMenuSub>
                                  );
                                })()}
                                <ContextMenuSeparator />
                                <ContextMenuItem onClick={() => onEditVinculo?.(bm.bookmaker_id)} className="gap-2"><Pencil className="h-4 w-4" />Editar vínculo</ContextMenuItem>
                              </ContextMenuContent>
                            </ContextMenu>
                          ))}
                        </div>
                      </div>

                      {/* MOBILE: Card view */}
                      <div className="md:hidden flex-1 min-h-0 overflow-y-auto p-2 space-y-2">
                        {bookmakersSorted.map((bm) => {
                          const usage = usageMap[bm.bookmaker_id];
                          const config = usage ? getUsageCategoryConfig(usage.category) : null;
                          return (
                            <MobileBookmakerCard
                              key={bm.bookmaker_id}
                              bm={bm}
                              showSensitiveData={showSensitiveData}
                              parceiroStatus={parceiroStatus}
                              formatMoneyValue={formatMoneyValue}
                              clampSaldoVisual={clampSaldoVisual}
                              usageCategory={usage?.category}
                              usageTooltip={usage?.category === "ATIVA" && usage.projetoAtivoNome ? `Projeto: ${usage.projetoAtivoNome}` : config?.tooltip || "Ver histórico"}
                              onHistorico={() => setHistoricoDialog({ open: true, bookmakerId: bm.bookmaker_id, bookmakerNome: bm.bookmaker_nome, logoUrl: bm.logo_url, status: bm.status })}
                              onDeposito={() => onNewTransacao?.(bm.bookmaker_id, bm.bookmaker_nome, bm.moeda || "BRL", bm.saldo_atual ?? 0, 0, "deposito")}
                              onSaque={() => onNewTransacao?.(bm.bookmaker_id, bm.bookmaker_nome, bm.moeda || "BRL", bm.saldo_atual ?? 0, 0, "retirada")}
                            />
                          );
                        })}
                      </div>
                    </>
                  )}
                </div>
            </TabsContent>

            {/* Aba Movimentações */}
            <TabsContent 
              value="movimentacoes" 
              className="absolute inset-0 mt-0 p-4 overflow-y-auto data-[state=inactive]:hidden"
            >
              <ParceiroMovimentacoesTab 
                parceiroId={parceiroId} 
                showSensitiveData={showSensitiveData}
              />
            </TabsContent>

            {/* Aba Bookmakers */}
            <TabsContent 
              value="bookmakers" 
              className="absolute inset-0 mt-0 p-4 overflow-y-auto data-[state=inactive]:hidden"
            >
              <ParceiroBookmakersTab
                parceiroId={parceiroId}
                showSensitiveData={showSensitiveData}
                diasRestantes={diasRestantes}
                onCreateVinculo={onCreateVinculo}
                onDataChange={handleBookmakersDataChange}
                refreshKey={bookmakerRefreshKey}
                onNewTransacao={onNewTransacao}
                onEditVinculo={onEditVinculo}
                projetos={projetos || []}
                onVincularProjeto={handleVincularProjeto}
                onDesvincularProjeto={handleDesvincularProjeto}
              />
            </TabsContent>
          </div>
        </Tabs>
      </div>
    </TooltipProvider>

      {/* Dialog de Histórico de Projetos */}
      <BookmakerHistoricoDialog
        open={historicoDialog.open}
        onOpenChange={(open) => setHistoricoDialog(prev => ({ ...prev, open }))}
        bookmakerId={historicoDialog.bookmakerId}
        bookmakerNome={historicoDialog.bookmakerNome}
        logoUrl={historicoDialog.logoUrl}
        bookmakerStatus={historicoDialog.status}
      />

      {/* Dialog de Perda Rápida */}
      {perdaDialog && (
        <RegistrarPerdaRapidaDialog
          open={perdaDialog.open}
          onOpenChange={(open) => { if (!open) setPerdaDialog(null); }}
          bookmakerId={perdaDialog.bookmakerId}
          bookmakerNome={perdaDialog.bookmakerNome}
          moeda={perdaDialog.moeda}
          saldoAtual={perdaDialog.saldoAtual}
          onSuccess={() => {
            parceiroCache.refreshCurrent();
            queryClient.invalidateQueries({ queryKey: ["bookmakers"] });
          }}
        />
      )}
    </>
  );
});
