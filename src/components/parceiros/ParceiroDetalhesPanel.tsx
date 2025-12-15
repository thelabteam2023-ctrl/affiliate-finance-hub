import { useState } from "react";
import { useParceiroFinanceiroConsolidado } from "@/hooks/useParceiroFinanceiroConsolidado";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { TrendingUp, TrendingDown, ArrowDownToLine, ArrowUpFromLine, Target, Building2, User, Wallet, AlertCircle, Eye, EyeOff, History, BarChart3, IdCard, Edit, Trash2, Hourglass, Copy, Check } from "lucide-react";
import { cn } from "@/lib/utils";
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from "@/components/ui/tooltip";
import { ParceiroMovimentacoesTab } from "./ParceiroMovimentacoesTab";
import { ParceiroBookmakersTab } from "./ParceiroBookmakersTab";
import { useToast } from "@/hooks/use-toast";

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
  diasRestantes
}: ParceiroDetalhesPanelProps) {
  const { data, loading, error } = useParceiroFinanceiroConsolidado(parceiroId);
  const { toast } = useToast();
  const [copiedField, setCopiedField] = useState<string | null>(null);
  const [credentialsPopoverOpen, setCredentialsPopoverOpen] = useState<string | null>(null);

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

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat("pt-BR", {
      style: "currency",
      currency: "BRL",
    }).format(value);
  };

  const maskCurrency = (value: number) => {
    if (showSensitiveData) return formatCurrency(value);
    return "R$ ••••";
  };

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
      <div className="flex items-center justify-center h-full text-destructive text-sm">
        <AlertCircle className="h-4 w-4 mr-2" />
        Erro ao carregar dados
      </div>
    );
  }

  const totalSaldoBookmakers = data.bookmakers.reduce((sum, b) => sum + b.saldo_atual, 0);
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
              {hasParceria && diasRestantes !== null && diasRestantes !== undefined && (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Hourglass className="h-4 w-4 text-warning shrink-0 cursor-help" />
                  </TooltipTrigger>
                  <TooltipContent>
                    <p className="text-xs font-medium">{diasRestantes} dias restantes de parceria</p>
                  </TooltipContent>
                </Tooltip>
              )}
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
            <p className="text-xs text-muted-foreground">
              {data.bookmakers.length} casa{data.bookmakers.length !== 1 ? "s" : ""} vinculada{data.bookmakers.length !== 1 ? "s" : ""}
            </p>
          </div>
          <div className="flex items-center gap-1.5">
            {onEditParceiro && (
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
            {onDeleteParceiro && (
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
        <Tabs defaultValue="resumo" className="flex-1 flex flex-col">
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
                {/* KPIs compactos - 4 colunas */}
                <div className="grid gap-2 grid-cols-2 lg:grid-cols-4">
                  <div className="flex items-center gap-2 p-2.5 rounded-lg bg-muted/30 border border-border">
                    <ArrowDownToLine className="h-4 w-4 text-blue-500 shrink-0" />
                    <div className="min-w-0">
                      <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Depositado</p>
                      <p className="text-sm font-semibold truncate">{maskCurrency(data.total_depositado)}</p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 p-2.5 rounded-lg bg-muted/30 border border-border">
                    <ArrowUpFromLine className="h-4 w-4 text-green-500 shrink-0" />
                    <div className="min-w-0">
                      <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Sacado</p>
                      <p className="text-sm font-semibold truncate">{maskCurrency(data.total_sacado)}</p>
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
                      <p className={cn(
                        "text-sm font-semibold truncate",
                        showSensitiveData 
                          ? (data.lucro_prejuizo >= 0 ? "text-success" : "text-destructive")
                          : "text-muted-foreground"
                      )}>
                        {maskCurrency(data.lucro_prejuizo)}
                      </p>
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
                    <span className={cn(
                      "font-medium",
                      showSensitiveData ? "text-primary" : "text-muted-foreground"
                    )}>
                      {maskCurrency(totalSaldoBookmakers)}
                    </span>
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
                <div className="border border-border rounded-lg overflow-hidden">
                  <div className="px-3 py-2 bg-muted/30 border-b border-border">
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
                    <div className="divide-y divide-border">
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
                                className="h-8 w-8 rounded object-contain bg-white p-0.5 shrink-0"
                              />
                            ) : (
                              <div className="h-8 w-8 rounded bg-muted flex items-center justify-center shrink-0">
                                <Building2 className="h-4 w-4 text-muted-foreground" />
                              </div>
                            )}
                            <div className="min-w-0 flex-1">
                              <p className="font-medium text-xs truncate">{bm.bookmaker_nome}</p>
                              <div className="flex items-center gap-1.5">
                                <Badge
                                  variant="outline"
                                  className={cn(
                                    "text-[9px] px-1 py-0 h-4",
                                    bm.status === "ativo"
                                      ? "border-success/50 text-success"
                                      : bm.status === "limitada"
                                      ? "border-warning/50 text-warning"
                                      : "border-muted-foreground/50 text-muted-foreground"
                                  )}
                                >
                                  {bm.status}
                                </Badge>
                                {bm.has_credentials && bm.login_username && (
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
                                    <PopoverContent className="w-52 p-2 bg-popover border border-border z-50" align="start">
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
                                              onClick={() => copyToClipboard(bm.login_username || "", "Usuário")}
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
                                              {showSensitiveData ? decryptPassword(bm.login_password_encrypted || "") : "••••••"}
                                            </code>
                                            <Button
                                              variant="ghost"
                                              size="sm"
                                              onClick={() => copyToClipboard(decryptPassword(bm.login_password_encrypted || ""), "Senha")}
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
                            </div>
                          </div>
                          <div className="text-right text-xs tabular-nums">
                            {maskCurrency(bm.total_depositado)}
                          </div>
                          <div className="text-right text-xs tabular-nums">
                            {maskCurrency(bm.total_sacado)}
                          </div>
                          <div className={cn(
                            "text-right text-xs font-medium tabular-nums",
                            showSensitiveData 
                              ? (bm.lucro_prejuizo >= 0 ? "text-success" : "text-destructive")
                              : "text-muted-foreground"
                          )}>
                            {maskCurrency(bm.lucro_prejuizo)}
                          </div>
                          <div className="text-right text-xs text-muted-foreground tabular-nums">
                            {bm.qtd_apostas.toLocaleString("pt-BR")}
                          </div>
                        </div>
                      ))}

                      {/* Totais */}
                      <div className="grid grid-cols-6 gap-2 px-3 py-2 bg-muted/30 font-medium text-xs">
                        <div className="col-span-2">Total</div>
                        <div className="text-right tabular-nums">{maskCurrency(data.total_depositado)}</div>
                        <div className="text-right tabular-nums">{maskCurrency(data.total_sacado)}</div>
                        <div className={cn(
                          "text-right tabular-nums",
                          showSensitiveData 
                            ? (data.lucro_prejuizo >= 0 ? "text-success" : "text-destructive")
                            : "text-muted-foreground"
                        )}>
                          {maskCurrency(data.lucro_prejuizo)}
                        </div>
                        <div className="text-right tabular-nums">{data.qtd_apostas_total.toLocaleString("pt-BR")}</div>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </ScrollArea>
          </TabsContent>

          {/* Aba Movimentações */}
          <TabsContent value="movimentacoes" className="flex-1 mt-0">
            <ParceiroMovimentacoesTab 
              parceiroId={parceiroId} 
              showSensitiveData={showSensitiveData} 
            />
          </TabsContent>

          {/* Aba Bookmakers */}
          <TabsContent value="bookmakers" className="flex-1 mt-0">
            <ParceiroBookmakersTab 
              parceiroId={parceiroId} 
              showSensitiveData={showSensitiveData}
              diasRestantes={diasRestantes}
              onCreateVinculo={onCreateVinculo}
            />
          </TabsContent>
        </Tabs>
      </div>
    </TooltipProvider>
  );
}
