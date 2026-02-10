import { useState, useCallback, useMemo, memo, useEffect, useRef } from "react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ParceiroFinanceiroConsolidado, saldosToEntries } from "@/hooks/useParceiroFinanceiroConsolidado";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { TrendingUp, TrendingDown, ArrowDownToLine, ArrowUpFromLine, Target, Building2, User, Wallet, AlertCircle, Eye, EyeOff, History, BarChart3, IdCard, Edit, Trash2, Copy, Check, Calendar, RefreshCw, CircleDashed, CircleCheck, Lock, Search, Pencil, Plus, Minus } from "lucide-react";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
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
  parceiroCache
}: ParceiroDetalhesPanelProps) {
  const data = parceiroCache.resumoData;
  const loading = parceiroCache.resumoLoading;
  const error = parceiroCache.resumoError;
  
  const { toast } = useToast();
  const [copiedField, setCopiedField] = useState<string | null>(null);
  const [credentialsPopoverOpen, setCredentialsPopoverOpen] = useState<string | null>(null);
  const [historicoDialog, setHistoricoDialog] = useState<{ open: boolean; bookmakerId: string; bookmakerNome: string; logoUrl: string | null }>({ open: false, bookmakerId: "", bookmakerNome: "", logoUrl: null });
  const [filtroMoeda, setFiltroMoeda] = useState<string>("todas");
  const [buscaCasa, setBuscaCasa] = useState("");
  const { canEdit, canDelete } = useActionAccess();
  const { convertToBRL, dataSource, isUsingFallback, rates } = useCotacoes();

  // Reset currency filter when partner changes to prevent filtering with a currency
  // that may not exist for the new partner
  useEffect(() => {
    setFiltroMoeda("todas");
    setBuscaCasa("");
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
  const saldoEntries = useMemo(() => 
    data ? saldosToEntries(data.saldo_por_moeda) : [], 
    [data?.saldo_por_moeda]
  );
  const resultadoEntries = useMemo(() => 
    data ? saldosToEntries(data.resultado_por_moeda) : [], 
    [data?.resultado_por_moeda]
  );
  
  const hasLucro = useMemo(() => resultadoEntries.some(e => e.value > 0), [resultadoEntries]);
  const hasPrejuizo = useMemo(() => resultadoEntries.some(e => e.value < 0), [resultadoEntries]);
  
  // Contagem baseada no status REAL da conta (não no bloqueio por parceiro)
  const bookmarkersAtivos = useMemo(() => 
    data?.bookmakers.filter(b => b.status === "ativo").length ?? 0, 
    [data?.bookmakers]
  );
  const bookmakersLimitados = useMemo(() => 
    data?.bookmakers.filter(b => b.status === "limitada").length ?? 0, 
    [data?.bookmakers]
  );
  const bookmakersEncerrados = useMemo(() => 
    data?.bookmakers.filter(b => b.status === "encerrada").length ?? 0, 
    [data?.bookmakers]
  );

  // IDs dos bookmakers para buscar status de uso
  const bookmakerIds = useMemo(() => 
    data?.bookmakers.map(b => b.bookmaker_id) ?? [], 
    [data?.bookmakers]
  );
  const { usageMap } = useBookmakerUsageStatus(bookmakerIds);

  // Lista de moedas únicas para o filtro
  const moedasDisponiveis = useMemo(() => {
    if (!data?.bookmakers) return [];
    const moedas = new Set(data.bookmakers.map(b => b.moeda || "BRL"));
    return Array.from(moedas).sort();
  }, [data?.bookmakers]);

  // Bookmakers filtrados por moeda e busca
  const bookmakersFiltradosMoeda = useMemo(() => {
    if (!data?.bookmakers) return [];
    if (filtroMoeda === "todas") return data.bookmakers;
    return data.bookmakers.filter(b => (b.moeda || "BRL") === filtroMoeda);
  }, [data?.bookmakers, filtroMoeda]);

  const bookmakersFiltrados = useMemo(() => {
    if (!buscaCasa.trim()) return bookmakersFiltradosMoeda;
    const termo = buscaCasa.trim().toLowerCase();
    return bookmakersFiltradosMoeda.filter(b => 
      b.bookmaker_nome.toLowerCase().includes(termo)
    );
  }, [bookmakersFiltradosMoeda, buscaCasa]);

  // KPIs filtrados por moeda - recalcula com base nos bookmakers filtrados
  // Quando "todas", consolida em BRL e mantém breakdown por moeda original
  const kpisFiltrados = useMemo(() => {
    if (filtroMoeda === "todas") {
      // Calcular totais consolidados em BRL
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
        saldo: saldoEntries,
        saldoBRL: consolidarEmBRL(saldoEntries),
        resultado: resultadoEntries,
        resultadoBRL: consolidarEmBRL(resultadoEntries),
        apostas: data?.qtd_apostas_total ?? 0,
        isConsolidado: true,
      };
    }
    
    // Agregar valores apenas dos bookmakers da moeda selecionada
    let depositadoTotal = 0;
    let sacadoTotal = 0;
    let saldoTotal = 0;
    let resultadoTotal = 0;
    let apostasTotal = 0;
    
    bookmakersFiltradosMoeda.forEach(bm => {
      depositadoTotal += bm.total_depositado ?? 0;
      sacadoTotal += bm.total_sacado ?? 0;
      saldoTotal += bm.saldo_atual ?? 0;
      resultadoTotal += bm.lucro_prejuizo ?? 0;
      apostasTotal += bm.qtd_apostas ?? 0;
    });
    
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
  }, [filtroMoeda, bookmakersFiltradosMoeda, depositadoEntries, sacadoEntries, saldoEntries, resultadoEntries, data?.qtd_apostas_total, convertToBRL]);

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

  const decryptPassword = (encrypted: string) => {
    if (!encrypted) return "";
    try {
      return atob(encrypted);
    } catch {
      return encrypted;
    }
  };

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
        
        {/* PartnerHeader: fixo, não cresce */}
        <div className="shrink-0 flex items-center gap-3 p-4 pb-2 border-b border-border">
          <div 
            className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10 cursor-pointer hover:bg-primary/20 transition-colors"
            onClick={onViewParceiro}
          >
            <User className="h-5 w-5 text-primary" />
          </div>
          <div 
            className="flex-1 min-w-0 cursor-pointer group"
            onClick={onViewParceiro}
          >
            <div className="flex items-center gap-2">
              <h2 className="text-lg font-semibold truncate group-hover:text-primary transition-colors">{data.parceiro_nome}</h2>
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
            </div>
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <span>{data.bookmakers.length} casa{data.bookmakers.length !== 1 ? "s" : ""} vinculada{data.bookmakers.length !== 1 ? "s" : ""}</span>
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
                    {diasRestantes} dias restantes
                  </span>
                </>
              )}
            </div>
          </div>
          <div className="flex items-center gap-1.5">
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="outline"
                  size="icon"
                  onClick={() => parceiroCache.refreshCurrent()}
                  disabled={loading}
                  className="shrink-0 h-8 w-8"
                >
                  <RefreshCw className={cn("h-4 w-4", loading && "animate-spin")} />
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                <p>Atualizar dados</p>
              </TooltipContent>
            </Tooltip>
            {onEditParceiro && canEdit('parceiros', 'parceiros.edit') && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={onEditParceiro}
                    className="shrink-0 h-8 w-8"
                  >
                    <Edit className="h-4 w-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  <p>Editar parceiro</p>
                </TooltipContent>
              </Tooltip>
            )}
            {onDeleteParceiro && canDelete('parceiros', 'parceiros.delete') && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={onDeleteParceiro}
                    className="shrink-0 h-8 w-8 text-destructive hover:text-destructive"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  <p>Excluir parceiro</p>
                </TooltipContent>
              </Tooltip>
            )}
            {onToggleSensitiveData && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={onToggleSensitiveData}
                    className="shrink-0 h-8 w-8"
                  >
                    {showSensitiveData ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  <p>{showSensitiveData ? "Ocultar dados sensíveis" : "Mostrar dados sensíveis"}</p>
                </TooltipContent>
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
                {/* KPIs principais - 5 colunas: Depositado → Sacado → SALDO → Resultado → Apostas */}
                <div className="grid gap-2 grid-cols-2 lg:grid-cols-5">
                  {/* Depositado */}
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

                  {/* Sacado */}
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

                  {/* SALDO ATUAL - Destaque principal */}
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

                  {/* Resultado */}
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
                    dataSource={dataSource}
                    isUsingFallback={isUsingFallback}
                    rates={ratesMap}
                  />

                  {/* Apostas */}
                  <div className="flex items-start gap-2 p-2.5 rounded-lg bg-muted/30 border border-border">
                    <Target className="h-4 w-4 text-primary shrink-0 mt-0.5" />
                    <div className="min-w-0 flex-1">
                      <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Apostas</p>
                      <p className="text-sm font-semibold">{kpisFiltrados.apostas.toLocaleString("pt-BR")}</p>
                    </div>
                  </div>
                </div>

                {/* Info secundária: apenas casas ativas/limitadas */}
                <div className="flex flex-wrap gap-3 text-xs">
                  <div className="flex items-center gap-1.5 px-2 py-1 rounded bg-muted/30">
                    <Building2 className="h-3 w-3 text-success" />
                    <span className="text-muted-foreground">Ativas:</span>
                    <span className="font-medium text-success">{bookmarkersAtivos}</span>
                  </div>
                  <div className="flex items-center gap-1.5 px-2 py-1 rounded bg-muted/30">
                    <AlertCircle className="h-3 w-3 text-warning" />
                    <span className="text-muted-foreground">Limitadas:</span>
                    <span className="font-medium text-warning">{bookmakersLimitados}</span>
                  </div>
                </div>
              </div>

              {/* Card Desempenho por Casa - ocupa espaço restante com scroll interno */}
              <div className="flex-1 min-h-0 mt-3 border border-border rounded-lg flex flex-col">
                  {/* Header do card com filtro de moeda e busca */}
                  <div className="px-3 py-2 bg-muted/30 border-b border-border flex items-center justify-between gap-2">
                    <h3 className="text-xs font-medium flex items-center gap-1.5 shrink-0">
                      <Building2 className="h-3.5 w-3.5 text-primary" />
                      Desempenho por Casa ({bookmakersFiltradosMoeda.length}{filtroMoeda !== "todas" ? `/${data.bookmakers.length}` : ""})
                    </h3>
                    <div className="flex items-center gap-2">
                      <div className="relative">
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
                      {moedasDisponiveis.length > 1 && (
                        <Select value={filtroMoeda} onValueChange={setFiltroMoeda}>
                          <SelectTrigger className="h-6 w-[80px] text-[10px] px-2 py-0">
                            <SelectValue placeholder="Moeda" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="todas" className="text-xs">Todas</SelectItem>
                            {moedasDisponiveis.map(moeda => (
                              <SelectItem key={moeda} value={moeda} className="text-xs">{moeda}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      )}
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
                      {/* Header da tabela */}
                      <div className="grid grid-cols-7 gap-2 px-3 py-1.5 text-[10px] font-medium text-muted-foreground uppercase tracking-wide bg-muted/30 border-b border-border">
                        <div className="col-span-2">Casa</div>
                        <div className="text-center"></div>
                        <div className="text-right">Dep.</div>
                        <div className="text-right">Saq.</div>
                        <div className="text-right">Result.</div>
                        <div className="text-right">Apost.</div>
                      </div>

                      {/* Lista de bookmakers - único elemento rolável */}
                      <div className="flex-1 min-h-0 overflow-y-auto divide-y divide-border">
                        {bookmakersFiltrados.map((bm) => (
                          <ContextMenu key={bm.bookmaker_id}>
                            <ContextMenuTrigger asChild>
                              <div
                                className="grid grid-cols-7 gap-2 px-3 py-2 hover:bg-muted/20 transition-colors items-center cursor-context-menu"
                              >
                            <div className="col-span-2 flex items-center gap-2 min-w-0">
                              {bm.logo_url ? (
                                <img
                                  src={bm.logo_url}
                                  alt={bm.bookmaker_nome}
                                  className="h-10 w-10 rounded object-contain bg-white p-0.5 shrink-0"
                                />
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
                                      onOpenChange={(open) =>
                                        setCredentialsPopoverOpen(open ? bm.bookmaker_id : null)
                                      }
                                    >
                                      <PopoverTrigger asChild>
                                        <button
                                          type="button"
                                          className="h-5 w-5 p-0.5 shrink-0 rounded hover:bg-muted/50 transition-colors cursor-pointer flex items-center justify-center"
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            setCredentialsPopoverOpen(
                                              credentialsPopoverOpen === bm.bookmaker_id
                                                ? null
                                                : bm.bookmaker_id
                                            );
                                          }}
                                        >
                                          <IdCard className="h-4 w-4 text-muted-foreground hover:text-foreground" />
                                        </button>
                                      </PopoverTrigger>
                                      <PopoverContent className="w-52 p-2" align="start">
                                        <div className="space-y-2">
                                          <div>
                                            <label className="text-[10px] text-muted-foreground">Usuário</label>
                                            <div className="flex items-center gap-1 mt-0.5">
                                              <code className="flex-1 text-xs bg-muted px-1.5 py-0.5 rounded truncate">
                                                {showSensitiveData ? bm.login_username : "••••••"}
                                              </code>
                                              <Button
                                                variant="ghost"
                                                size="sm"
                                                onClick={() =>
                                                  bm.login_username &&
                                                  copyToClipboard(bm.login_username, "Usuário")
                                                }
                                                className="h-6 w-6 p-0 shrink-0"
                                              >
                                                {copiedField === "Usuário" ? (
                                                  <Check className="h-3 w-3 text-success" />
                                                ) : (
                                                  <Copy className="h-3 w-3" />
                                                )}
                                              </Button>
                                            </div>
                                          </div>
                                          <div>
                                            <label className="text-[10px] text-muted-foreground">Senha</label>
                                            <div className="flex items-center gap-1 mt-0.5">
                                              <code className="flex-1 text-xs bg-muted px-1.5 py-0.5 rounded truncate">
                                                {showSensitiveData && bm.login_password_encrypted
                                                  ? decryptPassword(bm.login_password_encrypted)
                                                  : "••••••"}
                                              </code>
                                              <Button
                                                variant="ghost"
                                                size="sm"
                                                onClick={() =>
                                                  bm.login_password_encrypted &&
                                                  copyToClipboard(
                                                    decryptPassword(bm.login_password_encrypted),
                                                    "Senha"
                                                  )
                                                }
                                                className="h-6 w-6 p-0 shrink-0"
                                              >
                                                {copiedField === "Senha" ? (
                                                  <Check className="h-3 w-3 text-success" />
                                                ) : (
                                                  <Copy className="h-3 w-3" />
                                                )}
                                              </Button>
                                            </div>
                                          </div>
                                        </div>
                                      </PopoverContent>
                                    </Popover>
                                  )}
                                </div>
                                <div className="flex items-center gap-1 flex-wrap">
                                  {/* Badge de status REAL da conta */}
                                  <Badge
                                    variant="outline"
                                    className={cn(
                                      "text-[9px] px-1 py-0 h-4",
                                      bm.status === "ativo"
                                        ? "border-success/50 text-success"
                                        : bm.status === "limitada"
                                          ? "border-warning/50 text-warning"
                                          : bm.status === "encerrada"
                                            ? "border-destructive/50 text-destructive"
                                            : "border-muted-foreground/50 text-muted-foreground"
                                    )}
                                  >
                                    {bm.status === "ativo" 
                                      ? "Ativa" 
                                      : bm.status === "limitada"
                                        ? "Limitada"
                                        : bm.status === "encerrada"
                                          ? "Encerrada"
                                          : bm.status}
                                  </Badge>
                                  {/* Badge de bloqueio quando parceiro está inativo */}
                                  {parceiroStatus === "inativo" && (
                                    <Tooltip>
                                      <TooltipTrigger asChild>
                                        <Badge
                                          variant="outline"
                                          className="text-[9px] px-1 py-0 h-4 border-destructive/50 text-destructive"
                                        >
                                          <Lock className="h-2.5 w-2.5 mr-0.5" />
                                          Bloq.
                                        </Badge>
                                      </TooltipTrigger>
                                      <TooltipContent side="top" className="max-w-[200px]">
                                        <p className="text-xs">Parceiro inativo. Operações financeiras bloqueadas.</p>
                                      </TooltipContent>
                                    </Tooltip>
                                  )}
                                  <Badge
                                    variant="outline"
                                    className={cn(
                                      "text-[9px] px-1 py-0 h-4",
                                      bm.moeda === "USD" || bm.moeda === "USDT"
                                        ? "border-cyan-500/50 text-cyan-400"
                                        : bm.moeda === "EUR"
                                          ? "border-yellow-500/50 text-yellow-400"
                                          : bm.moeda === "GBP"
                                            ? "border-purple-500/50 text-purple-400"
                                            : "border-emerald-500/50 text-emerald-400"
                                    )}
                                  >
                                    {bm.moeda || "BRL"}
                                  </Badge>
                                </div>
                              </div>
                            </div>
                            {/* Botão Histórico de Projetos - com cor semântica */}
                            <div className="flex justify-center">
                              {(() => {
                                const usage = usageMap[bm.bookmaker_id];
                                const config = usage ? getUsageCategoryConfig(usage.category) : null;
                                const IconComponent = usage?.category === "ATIVA" 
                                  ? CircleCheck 
                                  : usage?.category === "JA_USADA" 
                                    ? History 
                                    : CircleDashed;
                                const iconColorClass = config?.iconColor || "text-muted-foreground";
                                
                                return (
                                  <Tooltip>
                                    <TooltipTrigger asChild>
                                      <Button
                                        variant="ghost"
                                        size="sm"
                                        className="h-7 w-7 p-0"
                                        onClick={() => setHistoricoDialog({
                                          open: true,
                                          bookmakerId: bm.bookmaker_id,
                                          bookmakerNome: bm.bookmaker_nome,
                                          logoUrl: bm.logo_url
                                        })}
                                      >
                                        <IconComponent className={cn("h-4 w-4", iconColorClass, "hover:opacity-80")} />
                                      </Button>
                                    </TooltipTrigger>
                                    <TooltipContent>
                                      <p className="text-xs">
                                        {usage?.category === "ATIVA" && usage.projetoAtivoNome 
                                          ? `Projeto: ${usage.projetoAtivoNome}`
                                          : config?.tooltip || "Ver histórico"
                                        }
                                      </p>
                                    </TooltipContent>
                                  </Tooltip>
                                );
                              })()}
                            </div>
                            {/* Depósito - sempre na moeda nativa da casa */}
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <div className="text-right">
                                  <MoneyDisplay
                                    value={bm.total_depositado}
                                    currency={bm.moeda || "BRL"}
                                    size="sm"
                                    masked={!showSensitiveData}
                                  />
                                </div>
                              </TooltipTrigger>
                              {showSensitiveData && bm.total_depositado > 0 && (
                                <TooltipContent side="top" className="text-xs">
                                  <p className="font-medium">Total depositado</p>
                                  <p>{formatMoneyValue(bm.total_depositado, bm.moeda || "BRL")}</p>
                                </TooltipContent>
                              )}
                            </Tooltip>
                            {/* Saque - sempre na moeda nativa da casa */}
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <div className="text-right">
                                  <MoneyDisplay
                                    value={bm.total_sacado}
                                    currency={bm.moeda || "BRL"}
                                    size="sm"
                                    masked={!showSensitiveData}
                                  />
                                </div>
                              </TooltipTrigger>
                              {showSensitiveData && bm.total_sacado > 0 && (
                                <TooltipContent side="top" className="text-xs">
                                  <p className="font-medium">Total sacado</p>
                                  <p>{formatMoneyValue(bm.total_sacado, bm.moeda || "BRL")}</p>
                                </TooltipContent>
                              )}
                            </Tooltip>
                            {/* Resultado - sempre na moeda nativa da casa */}
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <div className="text-right">
                                  <MoneyDisplay
                                    value={bm.lucro_prejuizo}
                                    currency={bm.moeda || "BRL"}
                                    size="sm"
                                    variant="auto"
                                    masked={!showSensitiveData}
                                  />
                                </div>
                              </TooltipTrigger>
                              {showSensitiveData && bm.lucro_prejuizo !== 0 && (
                                <TooltipContent side="top" className="text-xs">
                                  <p className="font-medium">Resultado</p>
                                  <p>{formatMoneyValue(bm.lucro_prejuizo, bm.moeda || "BRL")}</p>
                                </TooltipContent>
                              )}
                            </Tooltip>
                            <div className="text-right text-sm font-medium text-muted-foreground">
                              {bm.qtd_apostas.toLocaleString("pt-BR")}
                            </div>
                              </div>
                            </ContextMenuTrigger>
                            <ContextMenuContent>
                              <ContextMenuItem
                                onClick={() => onEditVinculo?.(bm.bookmaker_id)}
                                className="gap-2"
                              >
                                <Pencil className="h-4 w-4" />
                                Editar vínculo
                              </ContextMenuItem>
                              <ContextMenuItem
                                onClick={() => onNewTransacao?.(bm.bookmaker_id, bm.bookmaker_nome, bm.moeda || "BRL", bm.saldo_atual ?? 0, 0, "deposito")}
                                className="gap-2"
                              >
                                <Plus className="h-4 w-4 text-success" />
                                Depósito
                              </ContextMenuItem>
                              <ContextMenuItem
                                onClick={() => onNewTransacao?.(bm.bookmaker_id, bm.bookmaker_nome, bm.moeda || "BRL", bm.saldo_atual ?? 0, 0, "retirada")}
                                className="gap-2"
                              >
                                <Minus className="h-4 w-4 text-destructive" />
                                Saque
                              </ContextMenuItem>
                            </ContextMenuContent>
                          </ContextMenu>
                        ))}
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
      />
    </>
  );
});
