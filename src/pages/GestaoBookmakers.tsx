import { useState, useEffect, useCallback, useMemo } from "react";
import { useTabWorkspace } from "@/hooks/useTabWorkspace";
import { useWorkspaceChangeListener } from "@/hooks/useWorkspaceCacheClear";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { PageHeader } from "@/components/PageHeader";
import { Plus, Search, IdCard, Eye, EyeOff, Edit, Trash2, TrendingUp, TrendingDown, DollarSign, BookOpen, Wallet, LayoutGrid, List, User, Building, ShieldAlert, Copy, Check, FolderOpen, Filter, UserCheck, UserX, Users, History, Ban, Clock } from "lucide-react";
import { BookmakerHistoricoDialog } from "@/components/bookmakers/BookmakerHistoricoDialog";
import BookmakerDialog from "@/components/bookmakers/BookmakerDialog";
import TransacaoDialog from "@/components/bookmakers/TransacaoDialog";
import HistoricoTransacoes from "@/components/bookmakers/HistoricoTransacoes";
import CatalogoBookmakers from "@/components/bookmakers/CatalogoBookmakers";
import AccessGroupsManager from "@/components/bookmakers/AccessGroupsManager";
import { useAuth } from "@/hooks/useAuth";
import { useBookmakerUsageStatus, canDeleteBookmaker } from "@/hooks/useBookmakerUsageStatus";
import { BookmakerUsageBadge } from "@/components/bookmakers/BookmakerUsageBadge";
import { useActionAccess } from "@/hooks/useModuleAccess";
import { useWithdrawalLeadTime, formatLeadTimeDays } from "@/hooks/useWithdrawalLeadTime";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

interface Bookmaker {
  id: string;
  nome: string;
  url: string | null;
  login_username: string;
  login_password_encrypted: string;
  saldo_atual: number;
  saldo_usd: number;
  moeda: string;
  status: string;
  created_at: string;
  parceiro_id: string | null;
  bookmaker_catalogo_id: string | null;
  parceiros?: {
    nome: string;
  };
  bookmakers_catalogo?: {
    logo_url: string | null;
    nome: string;
  };
}

export default function GestaoBookmakers() {
  // SEGURANÇA: workspaceId como dependência para isolamento multi-tenant
  const { workspaceId } = useTabWorkspace();
  
  const [bookmakers, setBookmakers] = useState<Bookmaker[]>([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState("todos");
  const [parceiroFilter, setParceiroFilter] = useState("todos");
  const [parceiroStatusFilter, setParceiroStatusFilter] = useState<"todos" | "ativo" | "inativo">("todos");
  const [bookmakerFilter, setBookmakerFilter] = useState("todos");
  const [showCredentials, setShowCredentials] = useState(false);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [transacaoDialogOpen, setTransacaoDialogOpen] = useState(false);
  const [historicoDialogOpen, setHistoricoDialogOpen] = useState(false);
  const [editingBookmaker, setEditingBookmaker] = useState<any | null>(null);
  const [selectedBookmaker, setSelectedBookmaker] = useState<Bookmaker | null>(null);
  const [viewMode, setViewMode] = useState<"cards" | "list">("cards");
  const [parceiros, setParceiros] = useState<Array<{ id: string; nome: string; status: string }>>([]);
  const [bookmakersCatalogo, setBookmakersCatalogo] = useState<Array<{ id: string; nome: string }>>([]);
  const [copiedField, setCopiedField] = useState<string | null>(null);
  const [limitadaPopoverOpen, setLimitadaPopoverOpen] = useState<string | null>(null);
  const [credentialsPopoverOpen, setCredentialsPopoverOpen] = useState<string | null>(null);
  const [historicoProjetoDialog, setHistoricoProjetoDialog] = useState<{ open: boolean; bookmaker: Bookmaker | null }>({ open: false, bookmaker: null });
  const navigate = useNavigate();
  const { toast } = useToast();
  const { isSystemOwner } = useAuth();
  const { canCreate, canEdit, canDelete } = useActionAccess();

  // Hook para obter status de uso de cada bookmaker
  const bookmakerIds = useMemo(() => bookmakers.map((b) => b.id), [bookmakers]);
  const { usageMap, refetch: refetchUsage } = useBookmakerUsageStatus(bookmakerIds);

  // Hook para obter tempo médio de saque por bookmaker (catálogo — agrega TODOS os usuários do workspace)
  const catalogoIds = useMemo(() => {
    const ids = bookmakers.map((b) => b.bookmaker_catalogo_id).filter(Boolean) as string[];
    return [...new Set(ids)];
  }, [bookmakers]);
  const { leadTimes } = useWithdrawalLeadTime(catalogoIds);

  // SEGURANÇA: Refetch quando workspace muda
  useEffect(() => {
    if (workspaceId) {
      checkAuth();
      fetchBookmakers();
      fetchParceiros();
      fetchBookmakersCatalogo();
    }
  }, [workspaceId]);

  // Listener para reset de estados locais na troca de workspace
  useWorkspaceChangeListener(useCallback(() => {
    console.log("[GestaoBookmakers] Workspace changed - resetting local state");
    setBookmakers([]);
    setParceiros([]);
    setBookmakersCatalogo([]);
    setSelectedBookmaker(null);
    setEditingBookmaker(null);
    setLoading(true);
  }, []));

  const checkAuth = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      navigate("/auth");
    }
  };

  const fetchBookmakers = async () => {
    try {
      const { data, error } = await supabase
        .from("bookmakers")
        .select(`
          *,
          parceiros!inner(nome),
          bookmakers_catalogo(logo_url, nome)
        `)
        .order("created_at", { ascending: false });

      if (error) throw error;
      setBookmakers(data || []);
    } catch (error: any) {
      toast({
        title: "Erro ao carregar bookmakers",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const fetchParceiros = async (statusFilter: "todos" | "ativo" | "inativo" = "todos") => {
    try {
      let query = supabase
        .from("parceiros")
        .select("id, nome, status")
        .order("nome");

      // Aplicar filtro de status no backend
      if (statusFilter !== "todos") {
        query = query.eq("status", statusFilter);
      }

      const { data, error } = await query;

      if (error) throw error;
      setParceiros(data || []);
    } catch (error: any) {
      console.error("Erro ao carregar parceiros:", error);
    }
  };

  // Recarregar parceiros quando o filtro de status muda
  useEffect(() => {
    fetchParceiros(parceiroStatusFilter);
    // Reset do parceiro selecionado quando muda o filtro de status
    setParceiroFilter("todos");
  }, [parceiroStatusFilter]);

  // Busca apenas bookmakers que o usuário possui registradas no workspace (para aba Vínculos)
  const fetchBookmakersCatalogo = async () => {
    try {
      // Buscar bookmaker_catalogo_ids distintos da tabela bookmakers do workspace
      const { data: userBookmakers, error: userError } = await supabase
        .from("bookmakers")
        .select("bookmaker_catalogo_id, bookmakers_catalogo(id, nome)")
        .not("bookmaker_catalogo_id", "is", null);

      if (userError) throw userError;

      // Extrair bookmakers únicas do catálogo que o usuário possui
      const uniqueBookmakers = new Map<string, { id: string; nome: string }>();
      userBookmakers?.forEach((bm) => {
        if (bm.bookmakers_catalogo && bm.bookmaker_catalogo_id) {
          const catalogo = bm.bookmakers_catalogo as { id: string; nome: string };
          if (!uniqueBookmakers.has(catalogo.id)) {
            uniqueBookmakers.set(catalogo.id, {
              id: catalogo.id,
              nome: catalogo.nome,
            });
          }
        }
      });

      // Converter para array e ordenar por nome
      const catalogoList = Array.from(uniqueBookmakers.values()).sort((a, b) =>
        a.nome.localeCompare(b.nome)
      );

      setBookmakersCatalogo(catalogoList);
    } catch (error: any) {
      console.error("Erro ao carregar bookmakers do projeto:", error);
    }
  };

  const handleDelete = async (id: string) => {
    // Verificar se pode excluir baseado no status de uso
    const usage = usageMap[id];
    const { canDelete: canDeleteBm, reason } = canDeleteBookmaker(usage);
    
    if (!canDeleteBm) {
      toast({
        title: "Exclusão bloqueada",
        description: reason,
        variant: "destructive",
      });
      return;
    }

    if (!confirm("Tem certeza que deseja excluir este vínculo? Esta ação é irreversível.")) return;

    try {
      const { error } = await supabase
        .from("bookmakers")
        .delete()
        .eq("id", id);

      if (error) throw error;

      toast({
        title: "Vínculo excluído",
        description: "O vínculo foi removido com sucesso.",
      });
      fetchBookmakers();
    } catch (error: any) {
      toast({
        title: "Erro ao excluir vínculo",
        description: error.message,
        variant: "destructive",
      });
    }
  };

  const handleEdit = async (bookmaker: Bookmaker) => {
    // Fetch full bookmaker data including encrypted password and ensure parceiro_id is present
    const { data, error } = await supabase
      .from("bookmakers")
      .select("*")
      .eq("id", bookmaker.id)
      .single();

    if (error) {
      toast({
        title: "Erro ao carregar dados",
        description: error.message,
        variant: "destructive",
      });
      return;
    }

    // CRÍTICO: Verificar se parceiro_id está presente antes de abrir o dialog
    if (!data.parceiro_id) {
      toast({
        title: "Erro de dados",
        description: "Este vínculo não possui um parceiro associado.",
        variant: "destructive",
      });
      return;
    }

    setEditingBookmaker(data);
    setDialogOpen(true);
  };

  const handleAddTransaction = (bookmaker: Bookmaker) => {
    // Navegar para Caixa Operacional para escolher tipo de transação
    navigate("/caixa", { state: { openDialog: true } });
  };

  const handleViewHistory = (bookmaker: Bookmaker) => {
    setSelectedBookmaker(bookmaker);
    setHistoricoDialogOpen(true);
  };


  const decryptPassword = (encrypted: string) => {
    try {
      return atob(encrypted);
    } catch {
      return encrypted;
    }
  };

  const hasCredentials = (bookmaker: Bookmaker) => {
    return bookmaker.login_username && bookmaker.login_password_encrypted;
  };

  const handleDialogClose = () => {
    setDialogOpen(false);
    setEditingBookmaker(null);
    fetchBookmakers();
  };

  const handleTransacaoDialogClose = () => {
    setTransacaoDialogOpen(false);
    setSelectedBookmaker(null);
    fetchBookmakers();
  };

  const confirmToggleLimitada = async (bookmaker: Bookmaker) => {
    try {
      const newStatus = bookmaker.status === "limitada" ? "ativo" : "limitada";
      
      const { error } = await supabase
        .from("bookmakers")
        .update({ status: newStatus })
        .eq("id", bookmaker.id);

      if (error) throw error;

      toast({
        title: "Status atualizado",
        description: `Vínculo marcado como ${newStatus === "limitada" ? "Limitada" : "Ativo"}.`,
      });
      
      setLimitadaPopoverOpen(null);
      fetchBookmakers();
    } catch (error: any) {
      toast({
        title: "Erro ao atualizar status",
        description: error.message,
        variant: "destructive",
      });
    }
  };

  const maskCredentials = (text: string) => {
    if (showCredentials) return text;
    return "••••••••";
  };

  const formatCurrency = (value: number, currency: string) => {
    const currencySymbols: Record<string, string> = {
      BRL: "R$",
      USD: "$",
      EUR: "€",
      GBP: "£",
      USDT: "₮",
      BTC: "₿",
      ETH: "Ξ",
    };
    return `${currencySymbols[currency] || ""} ${value.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  };

  // Retorna o saldo principal baseado na moeda operacional do bookmaker
  // REGRA: saldo_atual é a fonte canônica para TODAS as moedas (saldo_usd é deprecated)
  const getBookmakerDisplayBalance = (bookmaker: Bookmaker) => {
    const moeda = bookmaker.moeda || "BRL";
    return { value: bookmaker.saldo_atual, currency: moeda };
  };

  const copyToClipboard = (text: string, field: string) => {
    navigator.clipboard.writeText(text);
    setCopiedField(field);
    toast({
      title: `${field} copiado!`,
      description: "O valor foi copiado para a área de transferência.",
    });
    setTimeout(() => setCopiedField(null), 2000);
  };

  const filteredBookmakers = bookmakers.filter((bookmaker) => {
    const matchesSearch =
      bookmaker.nome.toLowerCase().includes(searchTerm.toLowerCase()) ||
      bookmaker.login_username.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesStatus =
      statusFilter === "todos" || bookmaker.status === statusFilter;
    const matchesParceiro =
      parceiroFilter === "todos" || bookmaker.parceiro_id === parceiroFilter;
    const matchesBookmaker =
      bookmakerFilter === "todos" || bookmaker.bookmaker_catalogo_id === bookmakerFilter;
    return matchesSearch && matchesStatus && matchesParceiro && matchesBookmaker;
  });

  const stats = {
    total: bookmakers.length,
    ativos: bookmakers.filter((b) => b.status === "ativo" || b.status === "ATIVO").length,
    // Saldos totais por moeda - usa saldo_atual (canonical) para todas as moedas
    saldoTotalBrl: bookmakers.reduce((acc, b) => {
      if (b.moeda === "BRL") return acc + Number(b.saldo_atual || 0);
      return acc;
    }, 0),
    saldoTotalUsd: bookmakers.reduce((acc, b) => {
      // saldo_atual é canonical para TODAS as moedas (saldo_usd é legado/deprecated)
      if (b.moeda === "USD") return acc + Number(b.saldo_atual || 0);
      return acc;
    }, 0),
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-muted-foreground">Carregando...</div>
      </div>
    );
  }

  return (
    <div className="h-screen flex flex-col bg-background">
      <div className="container mx-auto px-4 py-8 flex flex-col flex-1 min-h-0">
        <PageHeader
          title="Gestão de Bookmakers"
          description="Bookmakers disponíveis e vínculos gerenciados"
          pagePath="/bookmakers"
          pageIcon="Building2"
          className="mb-8 shrink-0"
        />

        <Tabs defaultValue="contas" className="flex flex-col flex-1 min-h-0">
          <TabsList className={`grid w-full max-w-md shrink-0 ${isSystemOwner ? 'grid-cols-3' : 'grid-cols-2'}`}>
            <TabsTrigger value="contas" className="flex items-center gap-2">
              <Wallet className="h-4 w-4" />
              Vínculos
            </TabsTrigger>
            <TabsTrigger value="catalogo" className="flex items-center gap-2">
              <BookOpen className="h-4 w-4" />
              Bookmakers
            </TabsTrigger>
            {isSystemOwner && (
              <TabsTrigger value="grupos" className="flex items-center gap-2">
                <FolderOpen className="h-4 w-4" />
                Grupos
              </TabsTrigger>
            )}
          </TabsList>

          <TabsContent value="catalogo" className="flex-1 min-h-0 overflow-y-auto mt-6">
            <CatalogoBookmakers />
          </TabsContent>

          {isSystemOwner && (
            <TabsContent value="grupos" className="flex-1 min-h-0 overflow-y-auto mt-6">
              <AccessGroupsManager />
            </TabsContent>
          )}

          <TabsContent value="contas" className="flex-1 min-h-0 overflow-y-auto mt-6 space-y-6">

            {/* Stats Cards */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Total de Bookmakers
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold">{stats.total}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Ativos
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold text-green-600">{stats.ativos}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Saldo Total
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xl font-semibold text-primary">
                  {formatCurrency(stats.saldoTotalBrl, "BRL")}
                </span>
                <Badge variant="outline" className="text-green-600 border-green-600">BRL</Badge>
              </div>
              {stats.saldoTotalUsd > 0 && (
                <div className="flex items-center justify-between pt-2 border-t border-border/50">
                  <span className="text-xl font-semibold text-blue-400">
                    {formatCurrency(stats.saldoTotalUsd, "USD")}
                  </span>
                  <Badge variant="outline" className="text-blue-400 border-blue-400">USD</Badge>
                </div>
              )}
            </CardContent>
              </Card>
            </div>

            {/* Toolbar */}
            <Card className="mb-6">
          <CardContent className="pt-6">
            <div className="flex flex-col md:flex-row gap-4">
              <div className="flex-1 relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground h-4 w-4" />
                <Input
                  placeholder="Buscar por nome ou usuário..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10"
                />
              </div>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-[140px]">
                  <SelectValue placeholder="Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="todos">Todos os status</SelectItem>
                  <SelectItem value="ativo">Ativo</SelectItem>
                  <SelectItem value="limitada">Limitada</SelectItem>
                </SelectContent>
              </Select>
              {/* Filtro de Status do Parceiro */}
              <Select value={parceiroStatusFilter} onValueChange={(value: "todos" | "ativo" | "inativo") => setParceiroStatusFilter(value)}>
                <SelectTrigger className="w-[130px]">
                  <SelectValue placeholder="Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="todos">
                    <div className="flex items-center gap-2">
                      <Users className="h-4 w-4" />
                      Todos
                    </div>
                  </SelectItem>
                  <SelectItem value="ativo">
                    <div className="flex items-center gap-2">
                      <UserCheck className="h-4 w-4 text-green-500" />
                      Ativos
                    </div>
                  </SelectItem>
                  <SelectItem value="inativo">
                    <div className="flex items-center gap-2">
                      <UserX className="h-4 w-4 text-muted-foreground" />
                      Inativos
                    </div>
                  </SelectItem>
                </SelectContent>
              </Select>

              {/* Select de Parceiros */}
              <Select 
                value={parceiroFilter} 
                onValueChange={setParceiroFilter}
                disabled={parceiros.length === 0}
              >
                <SelectTrigger className="w-[180px]">
                  <SelectValue placeholder={parceiros.length === 0 ? "Nenhum parceiro" : "Parceiro"} />
                </SelectTrigger>
                <SelectContent>
                  {parceiros.length === 0 ? (
                    <div className="px-2 py-4 text-center text-sm text-muted-foreground">
                      <p>Nenhum parceiro encontrado</p>
                      {parceiroStatusFilter === "inativo" ? (
                        <Button
                          variant="link"
                          size="sm"
                          className="mt-2 text-primary"
                          onClick={() => navigate("/parceiros")}
                        >
                          <UserCheck className="h-3 w-3 mr-1" />
                          Ativar parceiro
                        </Button>
                      ) : (
                        <Button
                          variant="link"
                          size="sm"
                          className="mt-2 text-primary"
                          onClick={() => navigate("/parceiros")}
                        >
                          <Plus className="h-3 w-3 mr-1" />
                          Criar parceiro
                        </Button>
                      )}
                    </div>
                  ) : (
                    <>
                      <SelectItem value="todos">
                        <div className="flex items-center gap-2">
                          <User className="h-4 w-4" />
                          Todos os parceiros
                        </div>
                      </SelectItem>
                      {parceiros.map((parceiro) => (
                        <SelectItem key={parceiro.id} value={parceiro.id}>
                          {parceiro.nome}
                        </SelectItem>
                      ))}
                    </>
                  )}
                </SelectContent>
              </Select>
              <Select 
                value={bookmakerFilter} 
                onValueChange={setBookmakerFilter}
                disabled={bookmakersCatalogo.length === 0}
              >
                <SelectTrigger className="w-[200px]">
                  <SelectValue placeholder={bookmakersCatalogo.length === 0 ? "Nenhuma bookmaker" : "Bookmakers do projeto"} />
                </SelectTrigger>
                <SelectContent>
                  {bookmakersCatalogo.length === 0 ? (
                    <div className="px-2 py-4 text-center text-sm text-muted-foreground">
                      <p>Nenhuma bookmaker registrada neste projeto</p>
                      <Button
                        variant="link"
                        size="sm"
                        className="mt-2 text-primary"
                        onClick={() => setDialogOpen(true)}
                      >
                        <Plus className="h-3 w-3 mr-1" />
                        Cadastrar nova bookmaker
                      </Button>
                    </div>
                  ) : (
                    <>
                      <SelectItem value="todos">
                        <div className="flex items-center gap-2">
                          <Building className="h-4 w-4" />
                          Bookmakers do projeto
                        </div>
                      </SelectItem>
                      {bookmakersCatalogo.map((bookmaker) => (
                        <SelectItem key={bookmaker.id} value={bookmaker.id}>
                          {bookmaker.nome}
                        </SelectItem>
                      ))}
                    </>
                  )}
                </SelectContent>
              </Select>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="icon"
                  onClick={() => setViewMode(viewMode === "cards" ? "list" : "cards")}
                >
                  {viewMode === "cards" ? <List className="h-4 w-4" /> : <LayoutGrid className="h-4 w-4" />}
                </Button>
                <Button
                  variant="outline"
                  size="icon"
                  onClick={() => setShowCredentials(!showCredentials)}
                >
                  {showCredentials ? (
                    <EyeOff className="h-4 w-4" />
                  ) : (
                    <Eye className="h-4 w-4" />
                  )}
                </Button>
              </div>
              {canCreate('bookmakers', 'bookmakers.accounts.create') && (
                <Button onClick={() => setDialogOpen(true)}>
                  <Plus className="mr-2 h-4 w-4" />
                  Novo Vínculo
                </Button>
              )}
            </div>
              </CardContent>
            </Card>

            {/* Bookmakers Display */}
            {filteredBookmakers.length === 0 ? (
              <Card>
                <CardContent className="py-12 text-center">
                  <p className="text-muted-foreground">
                    Nenhum vínculo encontrado. Clique em "+ Novo Vínculo" para adicionar.
                  </p>
                </CardContent>
              </Card>
            ) : viewMode === "cards" ? (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {filteredBookmakers.map((bookmaker) => (
              <Card key={bookmaker.id} className="hover:shadow-lg transition-shadow">
                <CardHeader>
                  <div className="flex justify-between items-start">
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        {bookmaker.bookmakers_catalogo?.logo_url ? (
                          <img 
                            src={bookmaker.bookmakers_catalogo.logo_url} 
                            alt={bookmaker.nome}
                            className="w-10 h-10 rounded object-contain bg-white/5 p-1"
                          />
                        ) : (
                          <div className="w-10 h-10 rounded bg-muted flex items-center justify-center">
                            <Building className="h-5 w-5 text-muted-foreground" />
                          </div>
                        )}
                        <CardTitle className="text-xl">{bookmaker.nome}</CardTitle>
                        {hasCredentials(bookmaker) && (
                          <Popover 
                            open={credentialsPopoverOpen === bookmaker.id} 
                            onOpenChange={(open) => setCredentialsPopoverOpen(open ? bookmaker.id : null)}
                          >
                            <PopoverTrigger asChild>
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-7 w-7 p-0"
                              >
                                <IdCard className="h-4 w-4" />
                              </Button>
                            </PopoverTrigger>
                            <PopoverContent className="w-52 p-2" align="start">
                              <div className="space-y-2">
                                <div>
                                  <label className="text-[10px] text-muted-foreground">Usuário</label>
                                  <div className="flex items-center gap-1 mt-0.5">
                                    <code className="flex-1 text-xs bg-muted px-1.5 py-0.5 rounded truncate">
                                      {bookmaker.login_username}
                                    </code>
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      onClick={() => copyToClipboard(bookmaker.login_username, "Usuário")}
                                      className="h-6 w-6 p-0 shrink-0"
                                    >
                                      {copiedField === "Usuário" ? (
                                        <Check className="h-3 w-3 text-green-500" />
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
                                      {decryptPassword(bookmaker.login_password_encrypted)}
                                    </code>
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      onClick={() => copyToClipboard(decryptPassword(bookmaker.login_password_encrypted), "Senha")}
                                      className="h-6 w-6 p-0 shrink-0"
                                    >
                                      {copiedField === "Senha" ? (
                                        <Check className="h-3 w-3 text-green-500" />
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
                      <div className="flex items-center gap-2 mt-1">
                        <User className="h-3.5 w-3.5 text-muted-foreground" />
                        <span className="text-sm text-muted-foreground">
                          {bookmaker.parceiros?.nome || "Não definido"}
                        </span>
                      </div>
                    </div>
                    <div className="flex flex-col items-end gap-1.5">
                      <Badge
                        variant={
                          bookmaker.status === "ativo"
                            ? "default"
                            : bookmaker.status === "inativo"
                            ? "secondary"
                            : "destructive"
                        }
                      >
                        {bookmaker.status}
                      </Badge>
                      <BookmakerUsageBadge
                        usage={usageMap[bookmaker.id]}
                        compact
                        onClick={() => setHistoricoProjetoDialog({ open: true, bookmaker })}
                      />
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    <div className="p-3 bg-muted rounded-lg">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-sm font-medium">Saldo Disponível</span>
                        <Badge variant="outline" className={
                          bookmaker.moeda === "USD" ? "text-cyan-400 border-cyan-400/30" :
                          bookmaker.moeda === "EUR" ? "text-amber-400 border-amber-400/30" :
                          bookmaker.moeda === "GBP" ? "text-purple-400 border-purple-400/30" :
                          "text-muted-foreground"
                        }>
                          {bookmaker.moeda || "BRL"}
                        </Badge>
                      </div>
                      <div className="space-y-2">
                        {/* Exibir saldo na moeda operacional */}
                        {(() => {
                          const balance = getBookmakerDisplayBalance(bookmaker);
                          const colorClass = 
                            balance.currency === "USD" ? "text-cyan-400" :
                            balance.currency === "EUR" ? "text-amber-400" :
                            balance.currency === "GBP" ? "text-purple-400" :
                            "";
                          
                          if (Number(balance.value) > 0) {
                            return (
                              <div className="flex items-center gap-2">
                                <span className={`text-2xl font-bold ${colorClass}`}>
                                  {formatCurrency(Number(balance.value), balance.currency)}
                                </span>
                              </div>
                            );
                          }
                          return (
                            <div className="text-2xl font-bold text-muted-foreground">
                              {formatCurrency(0, balance.currency)}
                            </div>
                          );
                        })()}
                      </div>
                    </div>

                    {/* Tempo médio de saque (catálogo — todos os usuários do workspace) */}
                    {bookmaker.bookmaker_catalogo_id && leadTimes[bookmaker.bookmaker_catalogo_id] && (
                      <div className="flex items-center gap-2 px-3 py-1.5 bg-muted/50 rounded-md">
                        <Clock className="h-3.5 w-3.5 text-muted-foreground" />
                        <span className="text-xs text-muted-foreground">Saque:</span>
                        <span className="text-xs font-medium">
                          {formatLeadTimeDays(leadTimes[bookmaker.bookmaker_catalogo_id].avg_days)}
                        </span>
                        <span className="text-[10px] text-muted-foreground ml-auto">
                          ({leadTimes[bookmaker.bookmaker_catalogo_id].total_saques} {leadTimes[bookmaker.bookmaker_catalogo_id].total_saques === 1 ? 'saque' : 'saques'})
                        </span>
                      </div>
                    )}

                    <div className="flex gap-2 pt-2 border-t">
                      <Button
                        variant="outline"
                        size="sm"
                        className="flex-1"
                        onClick={() => handleAddTransaction(bookmaker)}
                      >
                        <DollarSign className="mr-1 h-4 w-4" />
                        Transação
                      </Button>
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Popover 
                              open={limitadaPopoverOpen === bookmaker.id} 
                              onOpenChange={(open) => setLimitadaPopoverOpen(open ? bookmaker.id : null)}
                            >
                              <PopoverTrigger asChild>
                                <Button
                                  variant="outline"
                                  size="sm"
                                  className={bookmaker.status === "limitada" ? "text-warning" : ""}
                                >
                                  <ShieldAlert className="h-4 w-4" />
                                </Button>
                              </PopoverTrigger>
                              <PopoverContent className="w-64 p-3" align="start">
                                <div className="space-y-2">
                                  <p className="text-sm font-medium">
                                    {bookmaker.status === "limitada" ? "Remover limitação?" : "Confirmar limitação?"}
                                  </p>
                                  <p className="text-xs text-muted-foreground">
                                    {bookmaker.status === "limitada"
                                      ? "Marcar como Ativa novamente?"
                                      : "Confirma que foi limitada?"}
                                  </p>
                                  <div className="flex gap-2 pt-2">
                                    <Button
                                      variant="outline"
                                      size="sm"
                                      className="flex-1 h-8"
                                      onClick={() => setLimitadaPopoverOpen(null)}
                                    >
                                      Cancelar
                                    </Button>
                                    <Button
                                      size="sm"
                                      className="flex-1 h-8 bg-emerald-600 hover:bg-emerald-700"
                                      onClick={() => confirmToggleLimitada(bookmaker)}
                                    >
                                      Confirmar
                                    </Button>
                                  </div>
                                </div>
                              </PopoverContent>
                            </Popover>
                          </TooltipTrigger>
                        </Tooltip>
                      </TooltipProvider>
                    </div>

                    <div className="flex gap-2">
                      {canEdit('bookmakers', 'bookmakers.accounts.edit') && (
                        <Button
                          variant="outline"
                          size="sm"
                          className="flex-1"
                          onClick={() => handleEdit(bookmaker)}
                        >
                          <Edit className="mr-1 h-4 w-4" />
                          Editar
                        </Button>
                      )}
                      {canDelete('bookmakers', 'bookmakers.accounts.delete') && (() => {
                        const usage = usageMap[bookmaker.id];
                        const { canDelete: canDeleteBm } = canDeleteBookmaker(usage);
                        return (
                          <Button
                            variant="outline"
                            size="sm"
                            className={`flex-1 ${canDeleteBm ? "text-destructive hover:text-destructive" : "text-muted-foreground cursor-not-allowed"}`}
                            onClick={() => handleDelete(bookmaker.id)}
                            disabled={!canDeleteBm}
                          >
                            {canDeleteBm ? <Trash2 className="mr-1 h-4 w-4" /> : <Ban className="mr-1 h-4 w-4" />}
                            {canDeleteBm ? "Excluir" : "Protegida"}
                          </Button>
                        );
                      })()}
                    </div>
                  </div>
                </CardContent>
              </Card>
                ))}
              </div>
            ) : (
              <Card>
                <CardContent className="p-0">
                  <div className="space-y-1">
                    {filteredBookmakers.map((bookmaker, index) => (
                      <div
                        key={bookmaker.id}
                        className={`p-4 hover:bg-accent/5 transition-colors ${
                          index !== filteredBookmakers.length - 1 ? "border-b border-border/50" : ""
                        }`}
                      >
                          <div className="flex items-center justify-between gap-4">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-start gap-3">
                              {bookmaker.bookmakers_catalogo?.logo_url ? (
                                <img 
                                  src={bookmaker.bookmakers_catalogo.logo_url} 
                                  alt={bookmaker.nome}
                                  className="w-8 h-8 rounded object-contain bg-white/5 p-1 shrink-0"
                                />
                              ) : (
                                <div className="w-8 h-8 rounded bg-muted flex items-center justify-center shrink-0">
                                  <Building className="h-4 w-4 text-muted-foreground" />
                                </div>
                              )}
                              <div className="flex-1">
                                <div className="flex items-center gap-3 mb-2">
                                  <h3 className="font-medium text-base">{bookmaker.nome}</h3>
                                   {hasCredentials(bookmaker) && (
                                    <Popover 
                                      open={credentialsPopoverOpen === bookmaker.id} 
                                      onOpenChange={(open) => setCredentialsPopoverOpen(open ? bookmaker.id : null)}
                                    >
                                      <PopoverTrigger asChild>
                                        <Button
                                          variant="ghost"
                                          size="sm"
                                          className="h-7 w-7 p-0"
                                        >
                                          <IdCard className="h-4 w-4" />
                                        </Button>
                                      </PopoverTrigger>
                                       <PopoverContent className="w-52 p-2" align="start">
                                        <div className="space-y-2">
                                          <div>
                                            <label className="text-[10px] text-muted-foreground">Usuário</label>
                                            <div className="flex items-center gap-1 mt-0.5">
                                              <code className="flex-1 text-xs bg-muted px-1.5 py-0.5 rounded truncate">
                                                {bookmaker.login_username}
                                              </code>
                                              <Button
                                                variant="ghost"
                                                size="sm"
                                                onClick={() => copyToClipboard(bookmaker.login_username, "Usuário")}
                                                className="h-6 w-6 p-0 shrink-0"
                                              >
                                                {copiedField === "Usuário" ? (
                                                  <Check className="h-3 w-3 text-green-500" />
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
                                                {decryptPassword(bookmaker.login_password_encrypted)}
                                              </code>
                                              <Button
                                                variant="ghost"
                                                size="sm"
                                                onClick={() => copyToClipboard(decryptPassword(bookmaker.login_password_encrypted), "Senha")}
                                                className="h-6 w-6 p-0 shrink-0"
                                              >
                                                {copiedField === "Senha" ? (
                                                  <Check className="h-3 w-3 text-green-500" />
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
                                  <Badge
                                    variant={
                                      bookmaker.status === "ativo"
                                        ? "default"
                                        : bookmaker.status === "inativo"
                                        ? "secondary"
                                        : "destructive"
                                    }
                                  >
                                    {bookmaker.status}
                                  </Badge>
                                  <Badge variant="outline">{bookmaker.moeda}</Badge>
                                  <BookmakerUsageBadge
                                    usage={usageMap[bookmaker.id]}
                                    compact
                                    onClick={() => setHistoricoProjetoDialog({ open: true, bookmaker })}
                                  />
                                </div>
                                <div className="flex items-center gap-4 text-sm text-muted-foreground">
                                  <span className="flex items-center gap-1.5">
                                    <User className="h-3.5 w-3.5" />
                                    <span className="font-medium">Parceiro:</span>{" "}
                                    {bookmaker.parceiros?.nome || "Não definido"}
                                  </span>
                                  <span className="text-lg font-bold text-foreground">
                                    {Number(bookmaker.saldo_atual) > 0 && `R$ ${Number(bookmaker.saldo_atual).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`}
                                    {Number(bookmaker.saldo_usd || 0) > 0 && (
                                      <span className={Number(bookmaker.saldo_atual) > 0 ? "ml-2 text-cyan-400" : "text-cyan-400"}>
                                        $ {Number(bookmaker.saldo_usd).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                                      </span>
                                    )}
                                    {Number(bookmaker.saldo_atual) === 0 && Number(bookmaker.saldo_usd || 0) === 0 && "R$ 0,00"}
                                  </span>
                                </div>
                              </div>
                            </div>
                          </div>
                          <div className="flex gap-2">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleAddTransaction(bookmaker)}
                            >
                              <DollarSign className="h-4 w-4" />
                            </Button>
                            <TooltipProvider>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <Popover 
                                    open={limitadaPopoverOpen === bookmaker.id} 
                                    onOpenChange={(open) => setLimitadaPopoverOpen(open ? bookmaker.id : null)}
                                  >
                                    <PopoverTrigger asChild>
                                      <Button
                                        variant="ghost"
                                        size="sm"
                                        className={bookmaker.status === "limitada" ? "text-warning" : ""}
                                      >
                                        <ShieldAlert className="h-4 w-4" />
                                      </Button>
                                    </PopoverTrigger>
                                    <PopoverContent className="w-64 p-3" align="start">
                                      <div className="space-y-2">
                                        <p className="text-sm font-medium">
                                          {bookmaker.status === "limitada" ? "Remover limitação?" : "Confirmar limitação?"}
                                        </p>
                                        <p className="text-xs text-muted-foreground">
                                          {bookmaker.status === "limitada"
                                            ? "Marcar como Ativa novamente?"
                                            : "Confirma que foi limitada?"}
                                        </p>
                                        <div className="flex gap-2 pt-2">
                                          <Button
                                            variant="outline"
                                            size="sm"
                                            className="flex-1 h-8"
                                            onClick={() => setLimitadaPopoverOpen(null)}
                                          >
                                            Cancelar
                                          </Button>
                                          <Button
                                            size="sm"
                                            className="flex-1 h-8 bg-emerald-600 hover:bg-emerald-700"
                                            onClick={() => confirmToggleLimitada(bookmaker)}
                                          >
                                            Confirmar
                                          </Button>
                                        </div>
                                      </div>
                                    </PopoverContent>
                                  </Popover>
                                </TooltipTrigger>
                              </Tooltip>
                            </TooltipProvider>
                            {canEdit('bookmakers', 'bookmakers.accounts.edit') && (
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => handleEdit(bookmaker)}
                              >
                                <Edit className="h-4 w-4" />
                              </Button>
                            )}
                            {canDelete('bookmakers', 'bookmakers.accounts.delete') && (() => {
                              const usage = usageMap[bookmaker.id];
                              const { canDelete: canDeleteBm } = canDeleteBookmaker(usage);
                              return (
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => handleDelete(bookmaker.id)}
                                  disabled={!canDeleteBm}
                                  className={canDeleteBm ? "text-destructive hover:text-destructive hover:bg-destructive/10" : "text-muted-foreground cursor-not-allowed"}
                                >
                                  {canDeleteBm ? <Trash2 className="h-4 w-4" /> : <Ban className="h-4 w-4" />}
                                </Button>
                              );
                            })()}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}
          </TabsContent>
        </Tabs>
      </div>

      <BookmakerDialog
        open={dialogOpen}
        onClose={handleDialogClose}
        bookmaker={editingBookmaker}
      />

      {selectedBookmaker && (
        <>
          <TransacaoDialog
            open={transacaoDialogOpen}
            onClose={handleTransacaoDialogClose}
            bookmaker={selectedBookmaker}
          />
          <HistoricoTransacoes
            open={historicoDialogOpen}
            onClose={() => setHistoricoDialogOpen(false)}
            bookmaker={selectedBookmaker}
          />
        </>
      )}


    </div>
  );
}
