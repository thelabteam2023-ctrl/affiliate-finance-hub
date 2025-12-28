import { useState, useCallback } from "react";
import { ParceiroFinanceiroConsolidado } from "@/hooks/useParceiroFinanceiroConsolidado";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { TrendingUp, TrendingDown, ArrowDownToLine, ArrowUpFromLine, Target, Building2, User, Wallet, AlertCircle, Eye, EyeOff, History, BarChart3, IdCard, Edit, Trash2, Copy, Check, Calendar, RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils";
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from "@/components/ui/tooltip";
import { ParceiroMovimentacoesTab } from "./ParceiroMovimentacoesTab";
import { ParceiroBookmakersTab } from "./ParceiroBookmakersTab";
import { useToast } from "@/hooks/use-toast";
import { TabKey } from "@/hooks/useParceiroFinanceiroCache";
import { useActionAccess } from "@/hooks/useModuleAccess";
import { MoneyDisplay, MultiCurrencyDisplay, formatMoneyValue } from "@/components/ui/money-display";

interface ParceiroCache {
  // Resumo only
  resumoData: ParceiroFinanceiroConsolidado | null;
  resumoLoading: boolean;
  resumoError: string | null;
  
  // Actions
  changeTab: (tab: TabKey) => void;
  invalidateCache: (parceiroId: string) => void;
  refreshCurrent: () => void;
}

interface ParceiroDetalhesPanelProps {
  parceiroId: string | null;
  showSensitiveData?: boolean;
  onToggleSensitiveData?: () => void;
  onCreateVinculo?: (parceiroId: string, bookmakerId: string) => void;
  onEditParceiro?: () => void;
  onDeleteParceiro?: () => void;
  parceiroStatus?: string;
  hasParceria?: boolean;
  diasRestantes?: number | null;
  parceiroCache: ParceiroCache;
}

export function ParceiroDetalhesPanel({ 
  parceiroId, 
  showSensitiveData = false,
  onToggleSensitiveData,
  onCreateVinculo,
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
  const { canEdit, canDelete } = useActionAccess();

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

  const maskCurrency = (value: number, moeda: string = "BRL") => {
    if (showSensitiveData) return formatCurrency(value, moeda);
    return isUSDMoeda(moeda) ? "$ ••••" : "R$ ••••";
  };

  // Formatar com badge de moeda para maior clareza
  const formatCurrencyWithBadge = (value: number, moeda: string = "BRL") => {
    const isUSD = isUSDMoeda(moeda);
    const symbol = isUSD ? "$" : "R$";
    const formatted = new Intl.NumberFormat("pt-BR", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(value);
    return { formatted: `${symbol} ${formatted}`, isUSD, moeda };
  };

  // Verifica se há valores em USD
  const hasUSD = data ? (data.total_depositado_usd > 0 || data.total_sacado_usd > 0 || data.lucro_prejuizo_usd !== 0) : false;

  if (!parceiroId) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-muted-foreground">
        <User className="h-12 w-12 mb-3 opacity-30" />
        <p className="text-sm font-medium">Selecione um parceiro</p>
        <p className="text-xs">Escolha um parceiro na lista</p>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="p-4 space-y-3">
        <div className="grid gap-2 grid-cols-2 lg:grid-cols-4">
          {[...Array(4)].map((_, i) => (
            <Skeleton key={i} className="h-14" />
          ))}
        </div>
        <Skeleton className="h-[300px]" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-destructive text-sm gap-3">
        <AlertCircle className="h-6 w-6" />
        <p>Erro ao carregar dados</p>
        <Button variant="outline" size="sm" onClick={() => parceiroCache.refreshCurrent()}>
          <RefreshCw className="h-3 w-3 mr-2" />
          Tentar novamente
        </Button>
      </div>
    );
  }

  const totalSaldoBRL = data.bookmakers.reduce((sum, b) => sum + b.saldo_brl, 0);
  const totalSaldoUSD = data.bookmakers.reduce((sum, b) => sum + b.saldo_usd, 0);
  const totalSaldoBookmakers = totalSaldoBRL + totalSaldoUSD; // Legacy
  const bookmarkersAtivos = data.bookmakers.filter(b => b.status === "ativo").length;
  const bookmakersLimitados = data.bookmakers.filter(b => b.status === "limitada").length;

  return (
    <TooltipProvider>
      <div className="h-full flex flex-col">
        {/* Header compacto */}
        <div className="flex items-center gap-3 p-4 pb-2 border-b border-border">
          <div 
            className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10 cursor-pointer hover:bg-primary/20 transition-colors"
            onClick={onEditParceiro}
          >
            <User className="h-5 w-5 text-primary" />
          </div>
          <div 
            className="flex-1 min-w-0 cursor-pointer group"
            onClick={onEditParceiro}
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

        {/* Tabs */}
        <Tabs defaultValue="resumo" className="flex-1 flex flex-col" onValueChange={(value) => parceiroCache.changeTab(value as TabKey)}>
          <div className="px-4 pt-2">
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

          {/* Aba Resumo */}
          <TabsContent value="resumo" className="flex-1 mt-0">
            <ScrollArea className="h-full">
              <div className="p-4 space-y-3">
                {/* KPIs compactos - 4 colunas - PADRONIZADO */}
                <div className="grid gap-2 grid-cols-2 lg:grid-cols-4">
                  <div className="flex items-center gap-2 p-2.5 rounded-lg bg-muted/30 border border-border">
                    <ArrowDownToLine className="h-4 w-4 text-blue-500 shrink-0" />
                    <div className="min-w-0">
                      <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Depositado</p>
                      <MultiCurrencyDisplay
                        valueBRL={data.total_depositado_brl}
                        valueUSD={data.total_depositado_usd}
                        size="sm"
                        masked={!showSensitiveData}
                        showDashOnZero
                      />
                    </div>
                  </div>

                  <div className="flex items-center gap-2 p-2.5 rounded-lg bg-muted/30 border border-border">
                    <ArrowUpFromLine className="h-4 w-4 text-green-500 shrink-0" />
                    <div className="min-w-0">
                      <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Sacado</p>
                      <MultiCurrencyDisplay
                        valueBRL={data.total_sacado_brl}
                        valueUSD={data.total_sacado_usd}
                        size="sm"
                        masked={!showSensitiveData}
                        showDashOnZero
                      />
                    </div>
                  </div>

                  <div className="flex items-center gap-2 p-2.5 rounded-lg bg-muted/30 border border-border">
                    {showSensitiveData ? (
                      data.lucro_prejuizo >= 0 ? (
                        <TrendingUp className="h-4 w-4 text-success shrink-0" />
                      ) : (
                        <TrendingDown className="h-4 w-4 text-destructive shrink-0" />
                      )
                    ) : (
                      <TrendingUp className="h-4 w-4 text-muted-foreground shrink-0" />
                    )}
                    <div className="min-w-0">
                      <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Resultado</p>
                      <MultiCurrencyDisplay
                        valueBRL={data.lucro_prejuizo_brl}
                        valueUSD={data.lucro_prejuizo_usd}
                        size="sm"
                        variant="auto"
                        masked={!showSensitiveData}
                        showDashOnZero
                      />
                    </div>
                  </div>

                  <div className="flex items-center gap-2 p-2.5 rounded-lg bg-muted/30 border border-border">
                    <Target className="h-4 w-4 text-purple-500 shrink-0" />
                    <div className="min-w-0">
                      <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Apostas</p>
                      <p className="text-sm font-semibold">{data.qtd_apostas_total.toLocaleString("pt-BR")}</p>
                    </div>
                  </div>
                </div>

                {/* Info secundária inline */}
                <div className="flex flex-wrap gap-3 text-xs">
                  <div className="flex items-center gap-1.5 px-2 py-1 rounded bg-muted/30">
                    <Wallet className="h-3 w-3 text-primary" />
                    <span className="text-muted-foreground">Saldo:</span>
                    <MultiCurrencyDisplay
                      valueBRL={totalSaldoBRL}
                      valueUSD={totalSaldoUSD}
                      size="xs"
                      masked={!showSensitiveData}
                      stacked={false}
                    />
                  </div>
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

                {/* Tabela por Casa de Apostas */}
                <div className="border border-border rounded-lg overflow-hidden flex flex-col max-h-[400px]">
                  <div className="px-3 py-2 bg-muted/30 border-b border-border shrink-0">
                    <h3 className="text-xs font-medium flex items-center gap-1.5">
                      <Building2 className="h-3.5 w-3.5 text-primary" />
                      Desempenho por Casa
                    </h3>
                  </div>
                  
                  {data.bookmakers.length === 0 ? (
                    <div className="text-center py-6 text-muted-foreground text-xs">
                      Nenhuma casa vinculada
                    </div>
                  ) : (
                    <div className="divide-y divide-border flex-1 overflow-y-auto">
                      {/* Header */}
                      <div className="grid grid-cols-6 gap-2 px-3 py-1.5 text-[10px] font-medium text-muted-foreground uppercase tracking-wide bg-muted/20">
                        <div className="col-span-2">Casa</div>
                        <div className="text-right">Dep.</div>
                        <div className="text-right">Saq.</div>
                        <div className="text-right">Result.</div>
                        <div className="text-right">Apost.</div>
                      </div>

                      {/* Rows */}
                      {data.bookmakers.map((bm) => (
                        <div
                          key={bm.bookmaker_id}
                          className="grid grid-cols-6 gap-2 px-3 py-2 hover:bg-muted/20 transition-colors items-center"
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
                                    onOpenChange={(open) => setCredentialsPopoverOpen(open ? bm.bookmaker_id : null)}
                                  >
                                    <PopoverTrigger asChild>
                                      <button
                                        type="button"
                                        className="h-5 w-5 p-0.5 shrink-0 rounded hover:bg-muted/50 transition-colors cursor-pointer flex items-center justify-center"
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          setCredentialsPopoverOpen(credentialsPopoverOpen === bm.bookmaker_id ? null : bm.bookmaker_id);
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
                                              onClick={() => bm.login_username && copyToClipboard(bm.login_username, "Usuário")}
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
                                              {showSensitiveData && bm.login_password_encrypted ? decryptPassword(bm.login_password_encrypted) : "••••••"}
                                            </code>
                                            <Button
                                              variant="ghost"
                                              size="sm"
                                              onClick={() => bm.login_password_encrypted && copyToClipboard(decryptPassword(bm.login_password_encrypted), "Senha")}
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
                                <Badge
                                  variant="outline"
                                  className={cn(
                                    "text-[9px] px-1 py-0 h-4",
                                    bm.status === "ativo"
                                      ? "border-success/50 text-success"
                                      : "border-warning/50 text-warning"
                                  )}
                                >
                                  {bm.status === "ativo" ? "Ativa" : "Limitada"}
                                </Badge>
                                {/* Badge de moeda baseado em bm.moeda - SEMPRE EXIBIDO */}
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
                          {/* Depósito - PADRONIZADO */}
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <div className="text-right">
                                <MoneyDisplay
                                  value={bm.moeda === "USD" || bm.moeda === "USDT" ? bm.total_depositado_usd : bm.total_depositado}
                                  currency={bm.moeda || "BRL"}
                                  size="sm"
                                  masked={!showSensitiveData}
                                />
                              </div>
                            </TooltipTrigger>
                            {showSensitiveData && (bm.total_depositado > 0 || bm.total_depositado_usd > 0) && (
                              <TooltipContent side="top" className="text-xs">
                                <p className="font-medium">Total depositado</p>
                                {bm.total_depositado > 0 && <p>BRL: {formatMoneyValue(bm.total_depositado, "BRL")}</p>}
                                {bm.total_depositado_usd > 0 && <p className="text-cyan-400">USD: {formatMoneyValue(bm.total_depositado_usd, "USD")}</p>}
                              </TooltipContent>
                            )}
                          </Tooltip>
                          {/* Saque - PADRONIZADO */}
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <div className="text-right">
                                <MoneyDisplay
                                  value={bm.moeda === "USD" || bm.moeda === "USDT" ? bm.total_sacado_usd : bm.total_sacado}
                                  currency={bm.moeda || "BRL"}
                                  size="sm"
                                  masked={!showSensitiveData}
                                />
                              </div>
                            </TooltipTrigger>
                            {showSensitiveData && (bm.total_sacado > 0 || bm.total_sacado_usd > 0) && (
                              <TooltipContent side="top" className="text-xs">
                                <p className="font-medium">Total sacado</p>
                                {bm.total_sacado > 0 && <p>BRL: {formatMoneyValue(bm.total_sacado, "BRL")}</p>}
                                {bm.total_sacado_usd > 0 && <p className="text-cyan-400">USD: {formatMoneyValue(bm.total_sacado_usd, "USD")}</p>}
                              </TooltipContent>
                            )}
                          </Tooltip>
                          {/* Resultado - PADRONIZADO */}
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <div className="text-right">
                                <MoneyDisplay
                                  value={bm.moeda === "USD" || bm.moeda === "USDT" ? bm.lucro_prejuizo_usd : bm.lucro_prejuizo}
                                  currency={bm.moeda || "BRL"}
                                  size="sm"
                                  variant="auto"
                                  masked={!showSensitiveData}
                                />
                              </div>
                            </TooltipTrigger>
                            {showSensitiveData && (bm.lucro_prejuizo !== 0 || bm.lucro_prejuizo_usd !== 0) && (
                              <TooltipContent side="top" className="text-xs">
                                <p className="font-medium">Resultado</p>
                                {bm.lucro_prejuizo !== 0 && <p>BRL: {formatMoneyValue(bm.lucro_prejuizo, "BRL")}</p>}
                                {bm.lucro_prejuizo_usd !== 0 && <p className="text-cyan-400">USD: {formatMoneyValue(bm.lucro_prejuizo_usd, "USD")}</p>}
                              </TooltipContent>
                            )}
                          </Tooltip>
                          <div className="text-right text-sm font-medium text-muted-foreground">
                            {bm.qtd_apostas.toLocaleString("pt-BR")}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </ScrollArea>
          </TabsContent>

          {/* Aba Movimentações - fetches its own data */}
          <TabsContent value="movimentacoes" className="flex-1 mt-0">
            <ParceiroMovimentacoesTab 
              parceiroId={parceiroId} 
              showSensitiveData={showSensitiveData}
            />
          </TabsContent>

          {/* Aba Bookmakers - fetches its own data */}
          <TabsContent value="bookmakers" className="flex-1 mt-0">
            <ParceiroBookmakersTab
              parceiroId={parceiroId}
              showSensitiveData={showSensitiveData}
              diasRestantes={diasRestantes}
              onCreateVinculo={onCreateVinculo}
              onDataChange={handleBookmakersDataChange}
            />
          </TabsContent>
        </Tabs>
      </div>
    </TooltipProvider>
  );
}
