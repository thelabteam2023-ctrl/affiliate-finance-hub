import { useState, useEffect, useRef, useCallback, memo } from "react";
import { getCurrencySymbol } from "@/types/currency";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Building2,
  Search,
  Plus,
  Minus,
  ShieldCheck,
  ShieldAlert,
  AlertCircle,
  ChevronDown,
  ChevronUp,
  IdCard,
  Copy,
  Check,
  RefreshCw,
  History,
  Pencil,
  DollarSign,
  AlertTriangle,
} from "lucide-react";
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
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from "@/components/ui/tooltip";
import { useToast } from "@/hooks/use-toast";
import { BookmakerHistoricoDialog } from "@/components/bookmakers/BookmakerHistoricoDialog";
import {
  getGlobalBookmakersCache,
  BookmakersData,
  BookmakerVinculado,
  BookmakerCatalogo,
} from "@/hooks/useParceiroTabsCache";
import { usePasswordDecryption } from "@/hooks/usePasswordDecryption";
import { LazyPasswordField } from "./LazyPasswordField";
interface ParceiroBookmakersTabProps {
  parceiroId: string;
  showSensitiveData: boolean;
  diasRestantes?: number | null;
  onCreateVinculo?: (parceiroId: string, bookmakerId: string) => void;
  onDataChange?: () => void;
  refreshKey?: number;
  onNewTransacao?: (bookmakerId: string, bookmakerNome: string, moeda: string, saldoAtual: number, saldoUsd: number, tipo: "deposito" | "retirada") => void;
  onEditVinculo?: (bookmakerId: string) => void;
}

/**
 * ARQUITETURA: Tab de Bookmakers com Cache
 * 
 * Este componente usa um cache global (LRU) para evitar refetch ao alternar entre abas.
 * Os dados só são recarregados quando:
 * - O parceiroId muda
 * - O usuário clica em "Atualizar" explicitamente
 * - O cache expira (TTL de 5 minutos)
 * - Ocorre uma mutação (onDataChange)
 * 
 * O layout (altura, scroll) é controlado pelo container pai (TabViewport).
 */
export const ParceiroBookmakersTab = memo(function ParceiroBookmakersTab({ 
  parceiroId, 
  showSensitiveData, 
  onCreateVinculo, 
  onDataChange,
  refreshKey,
  onNewTransacao,
  onEditVinculo,
}: ParceiroBookmakersTabProps) {
  const [data, setData] = useState<BookmakersData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [searchVinculados, setSearchVinculados] = useState("");
  const [searchDisponiveis, setSearchDisponiveis] = useState("");
  const [editingStatus, setEditingStatus] = useState<string | null>(null);
  const [showAllVinculados, setShowAllVinculados] = useState(false);
  const [copiedField, setCopiedField] = useState<string | null>(null);
  const [credentialsPopoverOpen, setCredentialsPopoverOpen] = useState<string | null>(null);
  const [historicoDialog, setHistoricoDialog] = useState<{ open: boolean; bookmaker: BookmakerVinculado | null }>({ open: false, bookmaker: null });
  const { toast } = useToast();
  const { requestDecrypt, isDecrypted, getCached } = usePasswordDecryption();

  // Referências para controle de cache
  const lastFetchedIdRef = useRef<string | null>(null);
  const isFetchingRef = useRef(false);
  const isMountedRef = useRef(true);

  const fetchData = useCallback(async (forceRefresh = false) => {
    if (!parceiroId) return;
    
    if (isFetchingRef.current) return;
    
    const cache = getGlobalBookmakersCache();
    
    // Verificar cache primeiro
    if (!forceRefresh) {
      const cached = cache.get(parceiroId);
      if (cached) {
        setData(cached);
        setLoading(false);
        setError(null);
        lastFetchedIdRef.current = parceiroId;
        return;
      }
    }
    
    // Evitar refetch desnecessário
    if (!forceRefresh && lastFetchedIdRef.current === parceiroId && data) {
      return;
    }
    
    isFetchingRef.current = true;
    setLoading(true);
    setError(null);

    try {
      // Usando apenas saldo_atual como fonte única (já normalizado no banco)
      const { data: vinculadosData, error: vinculadosError } = await supabase
        .from("bookmakers")
        .select("id, nome, saldo_atual, status, moeda, login_username, login_password_encrypted, bookmaker_catalogo_id, instance_identifier")
        .eq("parceiro_id", parceiroId);

      if (vinculadosError) throw vinculadosError;

      const catalogoIds = vinculadosData?.filter((b) => b.bookmaker_catalogo_id).map((b) => b.bookmaker_catalogo_id as string) || [];

      const logosMap = new Map<string, string>();
      if (catalogoIds.length > 0) {
        const { data: catalogoData } = await supabase.from("bookmakers_catalogo").select("id, logo_url").in("id", catalogoIds);
        catalogoData?.forEach((c) => { if (c.logo_url) logosMap.set(c.id, c.logo_url); });
      }

      const vinculadosComLogo = vinculadosData?.map((b) => ({
        ...b,
        logo_url: b.bookmaker_catalogo_id ? logosMap.get(b.bookmaker_catalogo_id) : undefined,
      })) || [];

      const { data: catalogoData, error: catalogoError } = await supabase.from("bookmakers_catalogo").select("id, nome, logo_url, status").order("nome");
      if (catalogoError) throw catalogoError;

      // MULTI-CONTA: Não filtramos mais casas já vinculadas
      // Um parceiro pode ter múltiplas contas da mesma bookmaker
      // Todas as casas do catálogo estão disponíveis para criar nova instância
      const disponiveis = catalogoData || [];

      const newData: BookmakersData = { 
        vinculados: vinculadosComLogo, 
        disponiveis 
      };

      // Salvar no cache global
      cache.set(parceiroId, newData);
      lastFetchedIdRef.current = parceiroId;
      
      if (isMountedRef.current) {
        setData(newData);
      }
    } catch (err: any) {
      console.error("Erro ao carregar bookmakers:", err);
      if (isMountedRef.current) {
        setError(err.message || "Erro ao carregar dados");
      }
    } finally {
      if (isMountedRef.current) {
        setLoading(false);
      }
      isFetchingRef.current = false;
    }
  }, [parceiroId, data]);

  // Effect: Carregar dados quando parceiroId muda ou refreshKey incrementa
  useEffect(() => {
    isMountedRef.current = true;
    
    const cache = getGlobalBookmakersCache();
    const cached = cache.get(parceiroId);
    
    if (cached) {
      if (lastFetchedIdRef.current !== parceiroId) {
        setData(cached);
        lastFetchedIdRef.current = parceiroId;
      }
    } else {
      // Cache foi invalidado ou parceiroId mudou - recarregar
      lastFetchedIdRef.current = null;
      fetchData(true);
    }
    
    return () => {
      isMountedRef.current = false;
    };
  }, [parceiroId, refreshKey]);

  const handleRefresh = useCallback(() => {
    fetchData(true);
  }, [fetchData]);

  const handleToggleStatus = async (bookmakerId: string, currentStatus: string) => {
    setEditingStatus(bookmakerId);
    const newStatus = currentStatus === "ativo" ? "limitada" : "ativo";

    try {
      const { error } = await supabase.from("bookmakers").update({ status: newStatus }).eq("id", bookmakerId);
      if (error) throw error;
      toast({ title: "Status atualizado", description: `Status alterado para ${newStatus.toUpperCase()}` });
      
      // Invalidar cache e recarregar
      const cache = getGlobalBookmakersCache();
      cache.delete(parceiroId);
      lastFetchedIdRef.current = null;
      fetchData(true);
      onDataChange?.();
    } catch (error: any) {
      toast({ title: "Erro ao atualizar status", description: error.message, variant: "destructive" });
    } finally {
      setEditingStatus(null);
    }
  };

  const handleCreateVinculo = (bookmakerId: string) => { onCreateVinculo?.(parceiroId, bookmakerId); };

  // Usar saldo_atual para todas as moedas (normalizado no banco)
  const getSaldoCorreto = (bm: BookmakerVinculado) => bm.saldo_atual || 0;

  const formatCurrencyLocal = (value: number, moeda: string = "BRL") => {
    const symbol = getCurrencySymbol(moeda);
    return new Intl.NumberFormat("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value).replace(/^/, `${symbol} `);
  };

  const maskCurrency = (value: number, moeda: string = "BRL") => showSensitiveData ? formatCurrencyLocal(value, moeda) : `${getCurrencySymbol(moeda)} ••••`;

  // resolvePassword removed — now using LazyPasswordField component
  const copyToClipboard = async (text: string, field: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedField(field);
      toast({ title: "Copiado!", description: `${field} copiado para a área de transferência` });
      setTimeout(() => setCopiedField(null), 2000);
    } catch { toast({ title: "Erro ao copiar", variant: "destructive" }); }
  };

  const hasCredentials = (bm: BookmakerVinculado) => bm.login_username && bm.login_username.trim();

  // LOADING (apenas no primeiro carregamento)
  if (loading && !data) {
    return (
      <div className="h-full flex flex-col gap-3 p-1">
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-2">{[...Array(3)].map((_, i) => <Skeleton key={i} className="h-14" />)}</div>
          <div className="space-y-2">{[...Array(3)].map((_, i) => <Skeleton key={i} className="h-14" />)}</div>
        </div>
      </div>
    );
  }

  // ERROR
  if (error && !data) {
    return (
      <div className="h-full flex flex-col items-center justify-center text-destructive gap-3">
        <AlertCircle className="h-8 w-8 opacity-50" />
        <p className="text-sm">Erro ao carregar bookmakers</p>
        <Button variant="outline" size="sm" onClick={handleRefresh}><RefreshCw className="h-3 w-3 mr-2" />Tentar novamente</Button>
      </div>
    );
  }

  const bookmakersVinculados = data?.vinculados || [];
  const bookmakersDisponiveis = data?.disponiveis || [];
  const filteredVinculados = bookmakersVinculados.filter((b) => b.nome.toLowerCase().includes(searchVinculados.toLowerCase())).sort((a, b) => getSaldoCorreto(b) - getSaldoCorreto(a));
  const displayedVinculados = showAllVinculados ? filteredVinculados : filteredVinculados.slice(0, 6);
  const hasMoreVinculados = filteredVinculados.length > 6;
  const filteredDisponiveis = bookmakersDisponiveis.filter((b) => b.nome.toLowerCase().includes(searchDisponiveis.toLowerCase()));

  // CONTENT: h-full flex-col, SEM scroll global, cada lista com scroll próprio
  return (
    <TooltipProvider>
      <div className="h-full flex flex-col gap-3">
        {/* Container de colunas - flex-1 para ocupar espaço restante */}
        <div className="flex-1 min-h-0 grid grid-cols-2 gap-3">
          
          {/* Card: Casas Vinculadas */}
          <div className="flex flex-col border border-border rounded-lg overflow-hidden">
            {/* Header do card - fixo */}
            <div className="shrink-0 p-3 bg-muted/30 border-b border-border space-y-2">
              <div className="flex items-center gap-2">
                <Building2 className="h-4 w-4 text-primary" />
                <h4 className="text-sm font-medium">Casas Vinculadas</h4>
                <Badge variant="secondary" className="text-xs ml-auto">{bookmakersVinculados.length}</Badge>
              </div>
              <div className="relative">
                <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                <Input placeholder="Buscar..." value={searchVinculados} onChange={(e) => setSearchVinculados(e.target.value)} className="pl-7 h-8 text-xs" />
              </div>
            </div>
            {/* Lista de Casas Vinculadas - scroll independente */}
            <div className="flex-1 min-h-0 overflow-y-auto p-2 space-y-1.5">
              {displayedVinculados.length === 0 ? (
                <div className="text-center py-6 text-muted-foreground text-xs"><AlertCircle className="h-6 w-6 mx-auto mb-1 opacity-30" />Nenhuma casa vinculada</div>
              ) : displayedVinculados.map((bm) => (
                <ContextMenu key={bm.id}>
                  <ContextMenuTrigger asChild>
                    <div className="flex items-center gap-2 p-2 border border-border rounded-lg hover:bg-muted/20 cursor-context-menu">
                      {bm.logo_url ? <img src={bm.logo_url} alt={bm.nome} className="h-10 w-10 rounded object-contain p-0.5 shrink-0" /> : <div className="h-10 w-10 rounded bg-muted flex items-center justify-center shrink-0"><Building2 className="h-5 w-5 text-muted-foreground" /></div>}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5">
                          <p className="text-xs font-medium truncate">{bm.nome}</p>
                          {bm.instance_identifier && (
                            <Badge variant="outline" className="text-[8px] px-1 py-0 h-3.5 border-primary/50 text-primary">
                              {bm.instance_identifier}
                            </Badge>
                          )}
                          {hasCredentials(bm) && (
                            <Popover open={credentialsPopoverOpen === bm.id} onOpenChange={(open) => setCredentialsPopoverOpen(open ? bm.id : null)}>
                              <PopoverTrigger asChild><button type="button" className="h-6 w-6 p-0.5 shrink-0 rounded hover:bg-muted/50 transition-colors cursor-pointer flex items-center justify-center" onClick={(e) => { e.stopPropagation(); setCredentialsPopoverOpen(credentialsPopoverOpen === bm.id ? null : bm.id); }}><IdCard className="h-5 w-5 text-muted-foreground hover:text-foreground" /></button></PopoverTrigger>
                              <PopoverContent className="w-52 p-2" align="start">
                                <div className="space-y-2">
                                  <div><label className="text-[10px] text-muted-foreground">Usuário</label><div className="flex items-center gap-1 mt-0.5"><code className="flex-1 text-xs bg-muted px-1.5 py-0.5 rounded truncate">{showSensitiveData ? bm.login_username : "••••••"}</code><Button variant="ghost" size="sm" onClick={() => copyToClipboard(bm.login_username, "Usuário")} className="h-6 w-6 p-0 shrink-0">{copiedField === "Usuário" ? <Check className="h-3 w-3 text-success" /> : <Copy className="h-3 w-3" />}</Button></div></div>
                                  <div><label className="text-[10px] text-muted-foreground">Senha</label><LazyPasswordField cacheKey={`parceiro-bookmakers:${bm.id}`} encrypted={bm.login_password_encrypted} parentMasked={!showSensitiveData} requestDecrypt={requestDecrypt} isDecrypted={isDecrypted} getCached={getCached} /></div>
                                </div>
                              </PopoverContent>
                            </Popover>
                          )}
                        </div>
                        <div className="flex items-center gap-1.5">
                          <Badge variant="outline" className={`text-[8px] px-1 py-0 h-3.5 ${bm.moeda === "BRL" ? "border-emerald-500/50 text-emerald-500" : "border-amber-500/50 text-amber-500"}`}>{bm.moeda || "BRL"}</Badge>
                          <span className="text-[10px] font-medium">{maskCurrency(getSaldoCorreto(bm), bm.moeda)}</span>
                        </div>
                      </div>
                      {/* Botão Histórico */}
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-6 px-1.5"
                            onClick={() => setHistoricoDialog({ open: true, bookmaker: bm })}
                          >
                            <History className="h-4 w-4 text-muted-foreground hover:text-foreground" />
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent>
                          <p>Ver histórico de projetos</p>
                        </TooltipContent>
                      </Tooltip>
                      {/* Botão Status */}
                      <Popover>
                        <PopoverTrigger asChild><Button variant="ghost" size="sm" className="h-6 px-1.5" disabled={editingStatus === bm.id}>{bm.status === "ativo" ? <ShieldCheck className="h-4 w-4 text-success" /> : <ShieldAlert className="h-4 w-4 text-warning" />}</Button></PopoverTrigger>
                        <PopoverContent className="w-auto p-3" align="end">
                          <div className="space-y-2">
                            <p className="text-xs text-muted-foreground">Alterar status para <span className="font-semibold">{bm.status === "ativo" ? "LIMITADA" : "ATIVO"}</span>?</p>
                            <div className="flex gap-2">
                              <Button size="sm" variant="outline" className="h-7 text-xs" onClick={(e) => { const trigger = document.querySelector(`[aria-expanded="true"]`) as HTMLButtonElement; trigger?.click(); }}>Cancelar</Button>
                              <Button size="sm" className="h-7 text-xs" onClick={() => handleToggleStatus(bm.id, bm.status)} disabled={editingStatus === bm.id}>Confirmar</Button>
                            </div>
                          </div>
                        </PopoverContent>
                      </Popover>
                    </div>
                  </ContextMenuTrigger>
                  <ContextMenuContent>
                    <ContextMenuSub>
                      <ContextMenuSubTrigger className="gap-2">
                        <DollarSign className="h-4 w-4" />
                        Financeiro
                      </ContextMenuSubTrigger>
                      <ContextMenuSubContent className="min-w-[180px]">
                        <ContextMenuItem
                          onClick={() => onNewTransacao?.(bm.id, bm.nome, bm.moeda || "BRL", getSaldoCorreto(bm), 0, "deposito")}
                          className="gap-2"
                        >
                          <Plus className="h-4 w-4 text-success" />
                          Depósito
                        </ContextMenuItem>
                        <ContextMenuItem
                          onClick={() => onNewTransacao?.(bm.id, bm.nome, bm.moeda || "BRL", getSaldoCorreto(bm), 0, "retirada")}
                          className="gap-2"
                        >
                          <Minus className="h-4 w-4 text-destructive" />
                          Saque
                        </ContextMenuItem>
                      </ContextMenuSubContent>
                    </ContextMenuSub>
                    <ContextMenuSeparator />
                    <ContextMenuItem
                      onClick={() => onEditVinculo?.(bm.id)}
                      className="gap-2"
                    >
                      <Pencil className="h-4 w-4" />
                      Editar vínculo
                    </ContextMenuItem>
                  </ContextMenuContent>
                </ContextMenu>
              ))}
              {hasMoreVinculados && !showAllVinculados && <Button variant="ghost" size="sm" className="w-full h-7 text-xs text-muted-foreground" onClick={() => setShowAllVinculados(true)}><ChevronDown className="h-3 w-3 mr-1" />Ver mais ({filteredVinculados.length - 6})</Button>}
              {showAllVinculados && hasMoreVinculados && <Button variant="ghost" size="sm" className="w-full h-7 text-xs text-muted-foreground" onClick={() => setShowAllVinculados(false)}><ChevronUp className="h-3 w-3 mr-1" />Ver menos</Button>}
            </div>
          </div>

          {/* Card: Casas Disponíveis */}
          <div className="flex flex-col border border-border rounded-lg overflow-hidden">
            {/* Header do card - fixo */}
            <div className="shrink-0 p-3 bg-muted/30 border-b border-border space-y-2">
              <div className="flex items-center gap-2">
                <Plus className="h-4 w-4 text-muted-foreground" />
                <h4 className="text-sm font-medium">Casas Disponíveis</h4>
                <Badge variant="outline" className="text-xs ml-auto">{bookmakersDisponiveis.length}</Badge>
              </div>
              <div className="relative">
                <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                <Input placeholder="Buscar casa..." value={searchDisponiveis} onChange={(e) => setSearchDisponiveis(e.target.value)} className="pl-7 h-8 text-xs" />
              </div>
            </div>
            {/* Lista de Casas Disponíveis - scroll independente */}
            <div className="flex-1 min-h-0 overflow-y-auto p-2 space-y-1.5">
              {filteredDisponiveis.length === 0 ? (
                <div className="text-center py-6 text-muted-foreground text-xs"><AlertCircle className="h-6 w-6 mx-auto mb-1 opacity-30" />Nenhuma casa disponível</div>
              ) : filteredDisponiveis.map((bm) => (
                <div key={bm.id} className="flex items-center gap-2 p-2 border border-border rounded-lg hover:bg-muted/20">
                  {bm.logo_url ? <img src={bm.logo_url} alt={bm.nome} className="h-10 w-10 rounded object-contain p-0.5 shrink-0" /> : <div className="h-10 w-10 rounded bg-muted flex items-center justify-center shrink-0"><Building2 className="h-5 w-5 text-muted-foreground" /></div>}
                  <div className="flex-1 min-w-0"><p className="text-xs font-medium truncate">{bm.nome}</p></div>
                  <Tooltip><TooltipTrigger asChild><Button variant="outline" size="sm" className="h-7 px-2" onClick={() => handleCreateVinculo(bm.id)}><Plus className="h-3.5 w-3.5" /></Button></TooltipTrigger><TooltipContent><p>Vincular casa</p></TooltipContent></Tooltip>
                </div>
              ))}
            </div>
          </div>

        </div>

        {/* Dialog de Histórico */}
        <BookmakerHistoricoDialog
          open={historicoDialog.open}
          onOpenChange={(open) => setHistoricoDialog({ open, bookmaker: open ? historicoDialog.bookmaker : null })}
          bookmakerId={historicoDialog.bookmaker?.id || ""}
          bookmakerNome={historicoDialog.bookmaker?.nome || ""}
          logoUrl={historicoDialog.bookmaker?.logo_url || null}
        />
      </div>
    </TooltipProvider>
  );
});
