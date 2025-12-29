import { useState, useEffect } from "react";
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
  ShieldCheck,
  ShieldAlert,
  AlertCircle,
  ChevronDown,
  ChevronUp,
  IdCard,
  Copy,
  Check,
  RefreshCw,
} from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from "@/components/ui/tooltip";
import { useToast } from "@/hooks/use-toast";

interface BookmakerVinculado {
  id: string;
  nome: string;
  saldo_atual: number;
  saldo_usd: number;
  status: string;
  moeda: string;
  login_username: string;
  login_password_encrypted: string;
  bookmaker_catalogo_id: string | null;
  logo_url?: string;
}

interface BookmakerCatalogo {
  id: string;
  nome: string;
  logo_url: string | null;
  status: string;
}

interface BookmakersData {
  vinculados: BookmakerVinculado[];
  disponiveis: BookmakerCatalogo[];
}

interface ParceiroBookmakersTabProps {
  parceiroId: string;
  showSensitiveData: boolean;
  diasRestantes?: number | null;
  onCreateVinculo?: (parceiroId: string, bookmakerId: string) => void;
  onDataChange?: () => void;
}

/*
 * ARQUITETURA: Tab de Bookmakers
 * 
 * Este componente APENAS retorna conteúdo.
 * O layout (altura, scroll) é controlado pelo container pai (TabViewport).
 */
export function ParceiroBookmakersTab({ parceiroId, showSensitiveData, onCreateVinculo, onDataChange }: ParceiroBookmakersTabProps) {
  const [data, setData] = useState<BookmakersData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [searchVinculados, setSearchVinculados] = useState("");
  const [searchDisponiveis, setSearchDisponiveis] = useState("");
  const [editingStatus, setEditingStatus] = useState<string | null>(null);
  const [showAllVinculados, setShowAllVinculados] = useState(false);
  const [copiedField, setCopiedField] = useState<string | null>(null);
  const [credentialsPopoverOpen, setCredentialsPopoverOpen] = useState<string | null>(null);
  const { toast } = useToast();

  const fetchData = async () => {
    setLoading(true);
    setError(null);

    try {
      const { data: vinculadosData, error: vinculadosError } = await supabase
        .from("bookmakers")
        .select("id, nome, saldo_atual, saldo_usd, status, moeda, login_username, login_password_encrypted, bookmaker_catalogo_id")
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

      const vinculadosCatalogoIds = new Set(vinculadosData?.map((b) => b.bookmaker_catalogo_id).filter(Boolean) || []);
      const disponiveis = catalogoData?.filter((c) => !vinculadosCatalogoIds.has(c.id)) || [];

      setData({ vinculados: vinculadosComLogo, disponiveis });
    } catch (err: any) {
      console.error("Erro ao carregar bookmakers:", err);
      setError(err.message || "Erro ao carregar dados");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchData(); }, [parceiroId]);

  const handleToggleStatus = async (bookmakerId: string, currentStatus: string) => {
    setEditingStatus(bookmakerId);
    const newStatus = currentStatus === "ativo" ? "limitada" : "ativo";

    try {
      const { error } = await supabase.from("bookmakers").update({ status: newStatus }).eq("id", bookmakerId);
      if (error) throw error;
      toast({ title: "Status atualizado", description: `Status alterado para ${newStatus.toUpperCase()}` });
      fetchData();
      onDataChange?.();
    } catch (error: any) {
      toast({ title: "Erro ao atualizar status", description: error.message, variant: "destructive" });
    } finally {
      setEditingStatus(null);
    }
  };

  const handleCreateVinculo = (bookmakerId: string) => { onCreateVinculo?.(parceiroId, bookmakerId); };

  const isUSDMoeda = (moeda: string) => moeda === "USD" || moeda === "USDT";
  const getSaldoCorreto = (bm: BookmakerVinculado) => isUSDMoeda(bm.moeda) ? bm.saldo_usd || 0 : bm.saldo_atual || 0;

  const formatCurrency = (value: number, moeda: string = "BRL") => {
    const symbol = isUSDMoeda(moeda) ? "$" : "R$";
    return new Intl.NumberFormat("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value).replace(/^/, `${symbol} `);
  };

  const maskCurrency = (value: number, moeda: string = "BRL") => showSensitiveData ? formatCurrency(value, moeda) : (isUSDMoeda(moeda) ? "$ ••••" : "R$ ••••");

  const decryptPassword = (encrypted: string) => { if (!encrypted) return ""; try { return atob(encrypted); } catch { return encrypted; } };

  const copyToClipboard = async (text: string, field: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedField(field);
      toast({ title: "Copiado!", description: `${field} copiado para a área de transferência` });
      setTimeout(() => setCopiedField(null), 2000);
    } catch { toast({ title: "Erro ao copiar", variant: "destructive" }); }
  };

  const hasCredentials = (bm: BookmakerVinculado) => bm.login_username && bm.login_username.trim();

  // LOADING
  if (loading) {
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
  if (error) {
    return (
      <div className="h-full flex flex-col items-center justify-center text-destructive gap-3">
        <AlertCircle className="h-8 w-8 opacity-50" />
        <p className="text-sm">Erro ao carregar bookmakers</p>
        <Button variant="outline" size="sm" onClick={fetchData}><RefreshCw className="h-3 w-3 mr-2" />Tentar novamente</Button>
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
                <div key={bm.id} className="flex items-center gap-2 p-2 border border-border rounded-lg hover:bg-muted/20">
                  {bm.logo_url ? <img src={bm.logo_url} alt={bm.nome} className="h-10 w-10 rounded object-contain bg-white p-0.5 shrink-0" /> : <div className="h-10 w-10 rounded bg-muted flex items-center justify-center shrink-0"><Building2 className="h-5 w-5 text-muted-foreground" /></div>}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                      <p className="text-xs font-medium truncate">{bm.nome}</p>
                      {hasCredentials(bm) && (
                        <Popover open={credentialsPopoverOpen === bm.id} onOpenChange={(open) => setCredentialsPopoverOpen(open ? bm.id : null)}>
                          <PopoverTrigger asChild><button type="button" className="h-6 w-6 p-0.5 shrink-0 rounded hover:bg-muted/50 transition-colors cursor-pointer flex items-center justify-center" onClick={(e) => { e.stopPropagation(); setCredentialsPopoverOpen(credentialsPopoverOpen === bm.id ? null : bm.id); }}><IdCard className="h-5 w-5 text-muted-foreground hover:text-foreground" /></button></PopoverTrigger>
                          <PopoverContent className="w-52 p-2" align="start">
                            <div className="space-y-2">
                              <div><label className="text-[10px] text-muted-foreground">Usuário</label><div className="flex items-center gap-1 mt-0.5"><code className="flex-1 text-xs bg-muted px-1.5 py-0.5 rounded truncate">{showSensitiveData ? bm.login_username : "••••••"}</code><Button variant="ghost" size="sm" onClick={() => copyToClipboard(bm.login_username, "Usuário")} className="h-6 w-6 p-0 shrink-0">{copiedField === "Usuário" ? <Check className="h-3 w-3 text-success" /> : <Copy className="h-3 w-3" />}</Button></div></div>
                              <div><label className="text-[10px] text-muted-foreground">Senha</label><div className="flex items-center gap-1 mt-0.5"><code className="flex-1 text-xs bg-muted px-1.5 py-0.5 rounded truncate">{showSensitiveData ? decryptPassword(bm.login_password_encrypted) : "••••••"}</code><Button variant="ghost" size="sm" onClick={() => copyToClipboard(decryptPassword(bm.login_password_encrypted), "Senha")} className="h-6 w-6 p-0 shrink-0">{copiedField === "Senha" ? <Check className="h-3 w-3 text-success" /> : <Copy className="h-3 w-3" />}</Button></div></div>
                            </div>
                          </PopoverContent>
                        </Popover>
                      )}
                    </div>
                    <div className="flex items-center gap-1.5">
                      <Badge variant="outline" className={`text-[8px] px-1 py-0 h-3.5 ${isUSDMoeda(bm.moeda) ? "border-amber-500/50 text-amber-500" : "border-emerald-500/50 text-emerald-500"}`}>{isUSDMoeda(bm.moeda) ? "USD" : "BRL"}</Badge>
                      <span className="text-[10px] font-medium">{maskCurrency(getSaldoCorreto(bm), bm.moeda)}</span>
                    </div>
                  </div>
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
                  {bm.logo_url ? <img src={bm.logo_url} alt={bm.nome} className="h-10 w-10 rounded object-contain bg-white p-0.5 shrink-0" /> : <div className="h-10 w-10 rounded bg-muted flex items-center justify-center shrink-0"><Building2 className="h-5 w-5 text-muted-foreground" /></div>}
                  <div className="flex-1 min-w-0"><p className="text-xs font-medium truncate">{bm.nome}</p></div>
                  <Tooltip><TooltipTrigger asChild><Button variant="outline" size="sm" className="h-7 px-2" onClick={() => handleCreateVinculo(bm.id)}><Plus className="h-3.5 w-3.5" /></Button></TooltipTrigger><TooltipContent><p>Vincular casa</p></TooltipContent></Tooltip>
                </div>
              ))}
            </div>
          </div>

        </div>
      </div>
    </TooltipProvider>
  );
}
