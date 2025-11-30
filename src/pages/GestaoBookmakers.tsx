import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { Plus, Search, Eye, EyeOff, Edit, Trash2, TrendingUp, TrendingDown, DollarSign, BookOpen, Wallet, LayoutGrid, List, User, Building, ShieldAlert } from "lucide-react";
import BookmakerDialog from "@/components/bookmakers/BookmakerDialog";
import TransacaoDialog from "@/components/bookmakers/TransacaoDialog";
import HistoricoTransacoes from "@/components/bookmakers/HistoricoTransacoes";
import CatalogoBookmakers from "@/components/bookmakers/CatalogoBookmakers";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

interface Bookmaker {
  id: string;
  nome: string;
  url: string | null;
  login_username: string;
  login_password_encrypted: string;
  saldo_atual: number;
  moeda: string;
  status: string;
  created_at: string;
  parceiro_id: string | null;
  bookmaker_catalogo_id: string | null;
}

export default function GestaoBookmakers() {
  const [bookmakers, setBookmakers] = useState<Bookmaker[]>([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState("todos");
  const [parceiroFilter, setParceiroFilter] = useState("todos");
  const [bookmakerFilter, setBookmakerFilter] = useState("todos");
  const [showCredentials, setShowCredentials] = useState(false);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [transacaoDialogOpen, setTransacaoDialogOpen] = useState(false);
  const [historicoDialogOpen, setHistoricoDialogOpen] = useState(false);
  const [editingBookmaker, setEditingBookmaker] = useState<any | null>(null);
  const [selectedBookmaker, setSelectedBookmaker] = useState<Bookmaker | null>(null);
  const [viewMode, setViewMode] = useState<"cards" | "list">("cards");
  const [parceiros, setParceiros] = useState<Array<{ id: string; nome: string }>>([]);
  const [bookmakersCatalogo, setBookmakersCatalogo] = useState<Array<{ id: string; nome: string }>>([]);
  const [showCredentialsDialog, setShowCredentialsDialog] = useState(false);
  const [credentialsBookmaker, setCredentialsBookmaker] = useState<Bookmaker | null>(null);
  const navigate = useNavigate();
  const { toast } = useToast();

  useEffect(() => {
    checkAuth();
    fetchBookmakers();
    fetchParceiros();
    fetchBookmakersCatalogo();
  }, []);

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
          parceiros!inner(nome)
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

  const fetchParceiros = async () => {
    try {
      const { data, error } = await supabase
        .from("parceiros")
        .select("id, nome")
        .eq("status", "ativo")
        .order("nome");

      if (error) throw error;
      setParceiros(data || []);
    } catch (error: any) {
      console.error("Erro ao carregar parceiros:", error);
    }
  };

  const fetchBookmakersCatalogo = async () => {
    try {
      const { data, error } = await supabase
        .from("bookmakers_catalogo")
        .select("id, nome")
        .order("nome");

      if (error) throw error;
      setBookmakersCatalogo(data || []);
    } catch (error: any) {
      console.error("Erro ao carregar catálogo:", error);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Tem certeza que deseja excluir este bookmaker? Todas as transações também serão removidas.")) return;

    try {
      const { error } = await supabase
        .from("bookmakers")
        .delete()
        .eq("id", id);

      if (error) throw error;

      toast({
        title: "Bookmaker excluído",
        description: "O bookmaker foi removido com sucesso.",
      });
      fetchBookmakers();
    } catch (error: any) {
      toast({
        title: "Erro ao excluir bookmaker",
        description: error.message,
        variant: "destructive",
      });
    }
  };

  const handleEdit = async (bookmaker: Bookmaker) => {
    // Fetch full bookmaker data including encrypted password
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

    setEditingBookmaker(data);
    setDialogOpen(true);
  };

  const handleAddTransaction = (bookmaker: Bookmaker) => {
    setSelectedBookmaker(bookmaker);
    setTransacaoDialogOpen(true);
  };

  const handleViewHistory = (bookmaker: Bookmaker) => {
    setSelectedBookmaker(bookmaker);
    setHistoricoDialogOpen(true);
  };

  const handleViewCredentials = (bookmaker: Bookmaker) => {
    setCredentialsBookmaker(bookmaker);
    setShowCredentialsDialog(true);
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

  const handleToggleLimitada = async (bookmaker: Bookmaker) => {
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
      USDT: "₮",
      BTC: "₿",
      ETH: "Ξ",
    };
    return `${currencySymbols[currency] || ""} ${value.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
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
    ativos: bookmakers.filter((b) => b.status === "ativo").length,
    saldoTotal: bookmakers.reduce((acc, b) => {
      if (b.moeda === "BRL") return acc + Number(b.saldo_atual);
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
    <div className="min-h-screen bg-background">
      <div className="container mx-auto px-4 py-8">
        <div className="flex justify-between items-center mb-8">
          <div>
            <h1 className="text-4xl font-bold">Gestão de Bookmakers</h1>
            <p className="text-muted-foreground mt-2">
              Bookmakers disponíveis e vínculos gerenciados
            </p>
          </div>
        </div>

        <Tabs defaultValue="catalogo" className="space-y-6">
          <TabsList className="grid w-full max-w-md grid-cols-2">
            <TabsTrigger value="catalogo" className="flex items-center gap-2">
              <BookOpen className="h-4 w-4" />
              Bookmakers
            </TabsTrigger>
            <TabsTrigger value="contas" className="flex items-center gap-2">
              <Wallet className="h-4 w-4" />
              Vínculos
            </TabsTrigger>
          </TabsList>

          <TabsContent value="catalogo">
            <CatalogoBookmakers />
          </TabsContent>

          <TabsContent value="contas" className="space-y-6">

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
                Saldo Total (BRL)
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold text-primary">
                {formatCurrency(stats.saldoTotal, "BRL")}
              </div>
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
              <Select value={parceiroFilter} onValueChange={setParceiroFilter}>
                <SelectTrigger className="w-[180px]">
                  <SelectValue placeholder="Todos parceiros" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="todos">
                    <div className="flex items-center gap-2">
                      <User className="h-4 w-4" />
                      Todos parceiros
                    </div>
                  </SelectItem>
                  {parceiros.map((parceiro) => (
                    <SelectItem key={parceiro.id} value={parceiro.id}>
                      {parceiro.nome}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={bookmakerFilter} onValueChange={setBookmakerFilter}>
                <SelectTrigger className="w-[180px]">
                  <SelectValue placeholder="Todas bookmakers" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="todos">
                    <div className="flex items-center gap-2">
                      <Building className="h-4 w-4" />
                      Todas bookmakers
                    </div>
                  </SelectItem>
                  {bookmakersCatalogo.map((bookmaker) => (
                    <SelectItem key={bookmaker.id} value={bookmaker.id}>
                      {bookmaker.nome}
                    </SelectItem>
                  ))}
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
              <Button onClick={() => setDialogOpen(true)}>
                <Plus className="mr-2 h-4 w-4" />
                Novo Vínculo
              </Button>
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
                        <CardTitle className="text-xl">{bookmaker.nome}</CardTitle>
                        {hasCredentials(bookmaker) && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleViewCredentials(bookmaker)}
                            className="h-7 w-7 p-0"
                          >
                            <Eye className="h-4 w-4" />
                          </Button>
                        )}
                      </div>
                      {bookmaker.url && (
                        <a
                          href={bookmaker.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-xs text-primary hover:underline"
                        >
                          {bookmaker.url}
                        </a>
                      )}
                    </div>
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
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    <div className="p-3 bg-muted rounded-lg">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-sm font-medium">Saldo Disponível</span>
                        <Badge variant="outline">{bookmaker.moeda}</Badge>
                      </div>
                      <div className="text-2xl font-bold">
                        {formatCurrency(Number(bookmaker.saldo_atual), bookmaker.moeda)}
                      </div>
                    </div>

                    <div className="text-sm space-y-1 pt-2 border-t">
                      <p className="text-muted-foreground">
                        <span className="font-medium">Usuário:</span>{" "}
                        {maskCredentials(bookmaker.login_username)}
                      </p>
                    </div>

                    <div className="flex gap-2 pt-2">
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
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => handleToggleLimitada(bookmaker)}
                              className={bookmaker.status === "limitada" ? "text-warning" : ""}
                            >
                              <ShieldAlert className="h-4 w-4" />
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>
                            <p>{bookmaker.status === "limitada" ? "Marcar como Ativo" : "Marcar como Limitada"}</p>
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    </div>

                    <div className="flex gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        className="flex-1"
                        onClick={() => handleEdit(bookmaker)}
                      >
                        <Edit className="mr-1 h-4 w-4" />
                        Editar
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        className="flex-1 text-red-600 hover:text-red-700"
                        onClick={() => handleDelete(bookmaker.id)}
                      >
                        <Trash2 className="mr-1 h-4 w-4" />
                        Excluir
                      </Button>
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
                            <div className="flex items-center gap-3">
                              <div className="flex-1">
                                <div className="flex items-center gap-3 mb-2">
                                  <h3 className="font-medium text-base">{bookmaker.nome}</h3>
                                  {hasCredentials(bookmaker) && (
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      onClick={() => handleViewCredentials(bookmaker)}
                                      className="h-7 w-7 p-0"
                                    >
                                      <Eye className="h-4 w-4" />
                                    </Button>
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
                                </div>
                                <div className="flex items-center gap-4 text-sm text-muted-foreground">
                                  <span>
                                    <span className="font-medium">Usuário:</span>{" "}
                                    {maskCredentials(bookmaker.login_username)}
                                  </span>
                                  <span className="text-lg font-bold text-foreground">
                                    {formatCurrency(Number(bookmaker.saldo_atual), bookmaker.moeda)}
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
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => handleToggleLimitada(bookmaker)}
                                    className={bookmaker.status === "limitada" ? "text-warning" : ""}
                                  >
                                    <ShieldAlert className="h-4 w-4" />
                                  </Button>
                                </TooltipTrigger>
                                <TooltipContent>
                                  <p>{bookmaker.status === "limitada" ? "Marcar como Ativo" : "Marcar como Limitada"}</p>
                                </TooltipContent>
                              </Tooltip>
                            </TooltipProvider>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleEdit(bookmaker)}
                            >
                              <Edit className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleDelete(bookmaker.id)}
                              className="text-red-600 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-950"
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
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

      {/* Credentials Dialog */}
      {credentialsBookmaker && (
        <div
          className={`fixed inset-0 z-50 flex items-center justify-center ${showCredentialsDialog ? 'visible' : 'hidden'}`}
          onClick={() => setShowCredentialsDialog(false)}
        >
          <div className="fixed inset-0 bg-black/50" />
          <Card className="relative z-50 w-full max-w-md mx-4" onClick={(e) => e.stopPropagation()}>
            <CardHeader>
              <CardTitle>Credenciais - {credentialsBookmaker.nome}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <label className="text-sm font-medium text-muted-foreground">Usuário</label>
                <p className="text-base font-mono mt-1">{credentialsBookmaker.login_username}</p>
              </div>
              <div>
                <label className="text-sm font-medium text-muted-foreground">Senha</label>
                <p className="text-base font-mono mt-1">{decryptPassword(credentialsBookmaker.login_password_encrypted)}</p>
              </div>
              <Button 
                onClick={() => setShowCredentialsDialog(false)} 
                className="w-full"
              >
                Fechar
              </Button>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
