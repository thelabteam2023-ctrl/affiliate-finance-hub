import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Building2, Search, Plus, ShieldCheck, ShieldAlert, AlertCircle, ChevronDown, ChevronUp, IdCard, Copy, Check } from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from "@/components/ui/tooltip";
import { useToast } from "@/hooks/use-toast";

interface BookmakerVinculado {
  id: string;
  nome: string;
  saldo_atual: number;
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

interface ParceiroBookmakersTabProps {
  parceiroId: string;
  showSensitiveData: boolean;
  diasRestantes?: number | null;
  onCreateVinculo?: (parceiroId: string, bookmakerId: string) => void;
  onDataChange?: () => void;
}

export function ParceiroBookmakersTab({ 
  parceiroId, 
  showSensitiveData, 
  diasRestantes, 
  onCreateVinculo, 
  onDataChange
}: ParceiroBookmakersTabProps) {
  const [bookmakersVinculados, setBookmakersVinculados] = useState<BookmakerVinculado[]>([]);
  const [bookmakersDisponiveis, setBookmakersDisponiveis] = useState<BookmakerCatalogo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchVinculados, setSearchVinculados] = useState("");
  const [searchDisponiveis, setSearchDisponiveis] = useState("");
  const [editingStatus, setEditingStatus] = useState<string | null>(null);
  const [showAllVinculados, setShowAllVinculados] = useState(false);
  const [copiedField, setCopiedField] = useState<string | null>(null);
  const [credentialsPopoverOpen, setCredentialsPopoverOpen] = useState<string | null>(null);
  const { toast } = useToast();

  useEffect(() => {
    fetchData();
  }, [parceiroId]);

  const fetchData = async () => {
    setLoading(true);
    setError(null);

    try {
      // Buscar bookmakers vinculados
      const { data: vinculadosData, error: vinculadosError } = await supabase
        .from("bookmakers")
        .select("id, nome, saldo_atual, status, moeda, login_username, login_password_encrypted, bookmaker_catalogo_id")
        .eq("parceiro_id", parceiroId);

      if (vinculadosError) throw vinculadosError;

      // Buscar logos do catálogo
      const catalogoIds = vinculadosData
        ?.filter(b => b.bookmaker_catalogo_id)
        .map(b => b.bookmaker_catalogo_id as string) || [];

      let logosMap = new Map<string, string>();
      if (catalogoIds.length > 0) {
        const { data: catalogoData } = await supabase
          .from("bookmakers_catalogo")
          .select("id, logo_url")
          .in("id", catalogoIds);
        catalogoData?.forEach((c) => {
          if (c.logo_url) logosMap.set(c.id, c.logo_url);
        });
      }

      const vinculadosComLogo = vinculadosData?.map(b => ({
        ...b,
        logo_url: b.bookmaker_catalogo_id ? logosMap.get(b.bookmaker_catalogo_id) : undefined,
      })) || [];

      setBookmakersVinculados(vinculadosComLogo);

      // Buscar catálogo disponível
      const { data: catalogoData, error: catalogoError } = await supabase
        .from("bookmakers_catalogo")
        .select("id, nome, logo_url, status")
        .eq("status", "REGULAMENTADA");

      if (catalogoError) throw catalogoError;

      // Filtrar casas já vinculadas
      const vinculadosCatalogoIds = new Set(
        vinculadosData?.map(b => b.bookmaker_catalogo_id).filter(Boolean) || []
      );

      const disponiveis = catalogoData?.filter(
        c => !vinculadosCatalogoIds.has(c.id)
      ) || [];

      setBookmakersDisponiveis(disponiveis);
    } catch (err: any) {
      console.error("Erro ao carregar bookmakers:", err);
      setError(err.message || "Erro ao carregar dados");
    } finally {
      setLoading(false);
    }
  };

  const handleToggleStatus = async (bookmakerId: string, currentStatus: string) => {
    setEditingStatus(bookmakerId);
    const newStatus = currentStatus === "ativo" ? "limitada" : "ativo";
    
    try {
      const { error } = await supabase
        .from("bookmakers")
        .update({ status: newStatus })
        .eq("id", bookmakerId);

      if (error) throw error;

      toast({
        title: "Status atualizado",
        description: `Status alterado para ${newStatus.toUpperCase()}`,
      });

      // Recarregar dados e notificar parent
      fetchData();
      onDataChange?.();
    } catch (error: any) {
      toast({
        title: "Erro ao atualizar status",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setEditingStatus(null);
    }
  };

  const handleCreateVinculo = (bookmakerId: string) => {
    if (onCreateVinculo) {
      onCreateVinculo(parceiroId, bookmakerId);
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

  const maskUsername = (username: string) => {
    if (showSensitiveData) return username;
    return "••••••";
  };

  const decryptPassword = (encrypted: string) => {
    if (!encrypted) return "";
    try {
      return atob(encrypted);
    } catch {
      return encrypted;
    }
  };

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

  const hasCredentials = (bm: BookmakerVinculado) => {
    return bm.login_username && bm.login_username.trim();
  };

  if (loading) {
    return (
      <div className="grid grid-cols-2 gap-3 p-2">
        <div className="space-y-2">
          {[...Array(3)].map((_, i) => (
            <Skeleton key={i} className="h-14" />
          ))}
        </div>
        <div className="space-y-2">
          {[...Array(3)].map((_, i) => (
            <Skeleton key={i} className="h-14" />
          ))}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-destructive">
        <AlertCircle className="h-8 w-8 mb-2 opacity-50" />
        <p className="text-sm">Erro ao carregar bookmakers</p>
      </div>
    );
  }

  // Filtrar e ordenar bookmakers vinculados por saldo
  const filteredVinculados = bookmakersVinculados
    .filter((b) => b.nome.toLowerCase().includes(searchVinculados.toLowerCase()))
    .sort((a, b) => b.saldo_atual - a.saldo_atual);

  const displayedVinculados = showAllVinculados ? filteredVinculados : filteredVinculados.slice(0, 6);
  const hasMoreVinculados = filteredVinculados.length > 6;

  const filteredDisponiveis = bookmakersDisponiveis.filter((b) =>
    b.nome.toLowerCase().includes(searchDisponiveis.toLowerCase())
  );

  return (
    <TooltipProvider>
      <div className="grid grid-cols-2 gap-3 p-2">
        {/* Coluna: Casas Vinculadas */}
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <Building2 className="h-4 w-4 text-primary" />
            <h4 className="text-sm font-medium">Casas Vinculadas</h4>
            <Badge variant="secondary" className="text-xs ml-auto">
              {bookmakersVinculados.length}
            </Badge>
          </div>

          <div className="relative">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              placeholder="Buscar..."
              value={searchVinculados}
              onChange={(e) => setSearchVinculados(e.target.value)}
              className="pl-7 h-8 text-xs"
            />
          </div>

          <ScrollArea className="h-[300px]">
            <div className="space-y-1.5">
              {displayedVinculados.length === 0 ? (
                <div className="text-center py-6 text-muted-foreground text-xs">
                  <AlertCircle className="h-6 w-6 mx-auto mb-1 opacity-30" />
                  Nenhuma casa vinculada
                </div>
              ) : (
                displayedVinculados.map((bm) => (
                  <div
                    key={bm.id}
                    className="flex items-center gap-2 p-2 border border-border rounded-lg hover:bg-muted/20"
                  >
                    {bm.logo_url ? (
                      <img
                        src={bm.logo_url}
                        alt={bm.nome}
                        className="h-10 w-10 rounded object-contain bg-white p-0.5 shrink-0"
                      />
                    ) : (
                      <div className="h-10 w-10 rounded bg-muted flex items-center justify-center shrink-0">
                        <Building2 className="h-5 w-5 text-muted-foreground" />
                      </div>
                    )}
                    
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5">
                        <p className="text-xs font-medium truncate">{bm.nome}</p>
                        {hasCredentials(bm) && (
                          <Popover
                            open={credentialsPopoverOpen === bm.id}
                            onOpenChange={(open) => setCredentialsPopoverOpen(open ? bm.id : null)}
                          >
                            <PopoverTrigger asChild>
                              <button
                                type="button"
                                className="h-6 w-6 p-0.5 shrink-0 rounded hover:bg-muted/50 transition-colors cursor-pointer flex items-center justify-center"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setCredentialsPopoverOpen(credentialsPopoverOpen === bm.id ? null : bm.id);
                                }}
                              >
                                <IdCard className="h-5 w-5 text-muted-foreground hover:text-foreground" />
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
                                      onClick={() => copyToClipboard(bm.login_username, "Usuário")}
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
                                      {showSensitiveData ? decryptPassword(bm.login_password_encrypted) : "••••••"}
                                    </code>
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      onClick={() => copyToClipboard(decryptPassword(bm.login_password_encrypted), "Senha")}
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
                      <div className="flex items-center gap-1.5">
                        <span className="text-[10px] text-muted-foreground truncate">
                          {maskUsername(bm.login_username)}
                        </span>
                        <span className="text-[10px] text-muted-foreground">•</span>
                        <span className="text-[10px] font-medium">
                          {maskCurrency(bm.saldo_atual)}
                        </span>
                      </div>
                    </div>

                    <Popover>
                      <PopoverTrigger asChild>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-6 px-1.5"
                          disabled={editingStatus === bm.id}
                        >
                          {bm.status === "ativo" ? (
                            <ShieldCheck className="h-4 w-4 text-success" />
                          ) : (
                            <ShieldAlert className="h-4 w-4 text-warning" />
                          )}
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-3" align="end">
                        <div className="space-y-2">
                          <p className="text-xs text-muted-foreground">
                            Alterar status para{" "}
                            <span className="font-semibold">
                              {bm.status === "ativo" ? "LIMITADA" : "ATIVO"}
                            </span>
                            ?
                          </p>
                          <div className="flex gap-2">
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-7 text-xs"
                              onClick={(e) => {
                                const popover = e.currentTarget.closest('[data-radix-popper-content-wrapper]');
                                if (popover) {
                                  const trigger = document.querySelector(`[aria-expanded="true"]`) as HTMLButtonElement;
                                  trigger?.click();
                                }
                              }}
                            >
                              Cancelar
                            </Button>
                            <Button
                              size="sm"
                              className="h-7 text-xs"
                              onClick={() => handleToggleStatus(bm.id, bm.status)}
                            >
                              Confirmar
                            </Button>
                          </div>
                        </div>
                      </PopoverContent>
                    </Popover>
                  </div>
                ))
              )}

              {hasMoreVinculados && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="w-full h-7 text-xs"
                  onClick={() => setShowAllVinculados(!showAllVinculados)}
                >
                  {showAllVinculados ? (
                    <>
                      <ChevronUp className="h-3 w-3 mr-1" />
                      Ver menos
                    </>
                  ) : (
                    <>
                      <ChevronDown className="h-3 w-3 mr-1" />
                      Ver mais ({filteredVinculados.length - 6})
                    </>
                  )}
                </Button>
              )}
            </div>
          </ScrollArea>
        </div>

        {/* Coluna: Casas Disponíveis */}
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <Plus className="h-4 w-4 text-primary" />
            <h4 className="text-sm font-medium">Casas Disponíveis</h4>
            <Badge variant="secondary" className="text-xs ml-auto">
              {bookmakersDisponiveis.length}
            </Badge>
          </div>

          <div className="relative">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              placeholder="Buscar..."
              value={searchDisponiveis}
              onChange={(e) => setSearchDisponiveis(e.target.value)}
              className="pl-7 h-8 text-xs"
            />
          </div>

          <ScrollArea className="h-[300px]">
            <div className="space-y-1.5">
              {filteredDisponiveis.length === 0 ? (
                <div className="text-center py-6 text-muted-foreground text-xs">
                  <AlertCircle className="h-6 w-6 mx-auto mb-1 opacity-30" />
                  Nenhuma casa disponível
                </div>
              ) : (
                filteredDisponiveis.map((bm) => (
                  <div
                    key={bm.id}
                    className="flex items-center gap-2 p-2 border border-border rounded-lg hover:bg-muted/20"
                  >
                    {bm.logo_url ? (
                      <img
                        src={bm.logo_url}
                        alt={bm.nome}
                        className="h-10 w-10 rounded object-contain bg-white p-0.5 shrink-0"
                      />
                    ) : (
                      <div className="h-10 w-10 rounded bg-muted flex items-center justify-center shrink-0">
                        <Building2 className="h-5 w-5 text-muted-foreground" />
                      </div>
                    )}
                    
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium truncate">{bm.nome}</p>
                    </div>

                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-6 w-6 p-0"
                          onClick={() => handleCreateVinculo(bm.id)}
                        >
                          <Plus className="h-4 w-4" />
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>
                        <p>Vincular casa</p>
                      </TooltipContent>
                    </Tooltip>
                  </div>
                ))
              )}
            </div>
          </ScrollArea>
        </div>
      </div>
    </TooltipProvider>
  );
}
