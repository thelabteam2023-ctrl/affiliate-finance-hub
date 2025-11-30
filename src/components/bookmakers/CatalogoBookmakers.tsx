import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Search, Edit, Trash2, ExternalLink, Filter, X, Gift, ShieldCheck, AlertTriangle, LayoutGrid, List, Info } from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import BookmakerCatalogoDialog from "./BookmakerCatalogoDialog";

interface BookmakerCatalogo {
  id: string;
  nome: string;
  logo_url: string | null;
  status: string;
  operacional: string;
  verificacao: string;
  links_json: any;
  bonus_enabled: boolean;
  multibonus_enabled: boolean;
  bonus_simples_json: any;
  bonus_multiplos_json: any;
  observacoes: string | null;
}

export default function CatalogoBookmakers() {
  const [bookmakers, setBookmakers] = useState<BookmakerCatalogo[]>([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState("todos");
  const [operacionalFilter, setOperacionalFilter] = useState("todos");
  const [verificacaoFilter, setVerificacaoFilter] = useState("todos");
  const [bonusFilter, setBonusFilter] = useState("todos");
  const [showFilters, setShowFilters] = useState(false);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingBookmaker, setEditingBookmaker] = useState<BookmakerCatalogo | null>(null);
  const [bonusDialogOpen, setBonusDialogOpen] = useState(false);
  const [selectedBonusBookmaker, setSelectedBonusBookmaker] = useState<BookmakerCatalogo | null>(null);
  const [observacoesDialogOpen, setObservacoesDialogOpen] = useState(false);
  const [selectedObservacoesBookmaker, setSelectedObservacoesBookmaker] = useState<BookmakerCatalogo | null>(null);
  const [viewType, setViewType] = useState<"cards" | "list">("cards");
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [bookmakerToDelete, setBookmakerToDelete] = useState<string | null>(null);
  const { toast } = useToast();

  useEffect(() => {
    fetchBookmakers();
  }, []);

  const fetchBookmakers = async () => {
    try {
      const { data, error } = await supabase
        .from("bookmakers_catalogo")
        .select("*")
        .order("nome", { ascending: true });

      if (error) throw error;
      setBookmakers(data || []);
    } catch (error: any) {
      toast({
        title: "Erro ao carregar catálogo",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteClick = (id: string) => {
    setBookmakerToDelete(id);
    setDeleteDialogOpen(true);
  };

  const handleDelete = async () => {
    if (!bookmakerToDelete) return;

    try {
      const { error } = await supabase
        .from("bookmakers_catalogo")
        .delete()
        .eq("id", bookmakerToDelete);

      if (error) throw error;

      toast({
        title: "Casa excluída",
        description: "A casa foi removida do catálogo com sucesso.",
      });
      fetchBookmakers();
      setDeleteDialogOpen(false);
      setBookmakerToDelete(null);
    } catch (error: any) {
      toast({
        title: "Erro ao excluir casa",
        description: error.message,
        variant: "destructive",
      });
    }
  };

  const handleEdit = (bookmaker: BookmakerCatalogo) => {
    setEditingBookmaker(bookmaker);
    setDialogOpen(true);
  };

  const handleDialogClose = () => {
    setDialogOpen(false);
    setEditingBookmaker(null);
    fetchBookmakers();
  };

  const handleBonusClick = (bookmaker: BookmakerCatalogo) => {
    setSelectedBonusBookmaker(bookmaker);
    setBonusDialogOpen(true);
  };

  const handleObservacoesClick = (bookmaker: BookmakerCatalogo) => {
    setSelectedObservacoesBookmaker(bookmaker);
    setObservacoesDialogOpen(true);
  };

  const formatCurrency = (moeda: string) => {
    const currencies: { [key: string]: string } = {
      BRL: "R$",
      USD: "$",
      EUR: "€",
      USDT: "USDT",
      BTC: "BTC",
    };
    return currencies[moeda] || moeda;
  };

  const formatRolloverBase = (rolloverBase: string) => {
    const bases: { [key: string]: string } = {
      "DEPOSITO_BONUS": "Depósito + Bônus",
      "APENAS_BONUS": "Apenas Bônus",
      "DEPOSITO": "Depósito",
    };
    return bases[rolloverBase] || rolloverBase;
  };

  const clearAllFilters = () => {
    setSearchTerm("");
    setStatusFilter("todos");
    setOperacionalFilter("todos");
    setVerificacaoFilter("todos");
    setBonusFilter("todos");
  };

  const hasActiveFilters = 
    searchTerm !== "" || 
    statusFilter !== "todos" || 
    operacionalFilter !== "todos" || 
    verificacaoFilter !== "todos" || 
    bonusFilter !== "todos";

  const filteredBookmakers = bookmakers.filter((bookmaker) => {
    const matchesSearch = bookmaker.nome.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesStatus = statusFilter === "todos" || bookmaker.status === statusFilter;
    const matchesOperacional = operacionalFilter === "todos" || bookmaker.operacional === operacionalFilter;
    const matchesVerificacao = verificacaoFilter === "todos" || bookmaker.verificacao === verificacaoFilter;
    const matchesBonus = 
      bonusFilter === "todos" || 
      (bonusFilter === "com_bonus" && bookmaker.bonus_enabled) ||
      (bonusFilter === "sem_bonus" && !bookmaker.bonus_enabled);

    return matchesSearch && matchesStatus && matchesOperacional && matchesVerificacao && matchesBonus;
  });

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="text-muted-foreground">Carregando catálogo...</div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Toolbar */}
      <Card>
        <CardContent className="pt-6 space-y-4">
          <div className="flex flex-col md:flex-row gap-4">
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground h-4 w-4" />
              <Input
                placeholder="Buscar casa de apostas..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10"
              />
            </div>
            <Button
              variant={showFilters ? "default" : "outline"}
              onClick={() => setShowFilters(!showFilters)}
            >
              <Filter className="mr-2 h-4 w-4" />
              Filtros {hasActiveFilters && `(${[statusFilter, operacionalFilter, verificacaoFilter, bonusFilter].filter(f => f !== "todos").length})`}
            </Button>
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={() => setViewType(viewType === "cards" ? "list" : "cards")}
                  >
                    {viewType === "cards" ? <List className="h-4 w-4" /> : <LayoutGrid className="h-4 w-4" />}
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  <p>{viewType === "cards" ? "Visualizar como lista" : "Visualizar como cards"}</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
            <Button onClick={() => setDialogOpen(true)}>
              <Plus className="mr-2 h-4 w-4" />
              Bookmaker
            </Button>
          </div>

          {showFilters && (
            <div className="pt-4 border-t space-y-4 animate-in fade-in slide-in-from-top-2 duration-300">
              <div className="flex items-center justify-between mb-2">
                <h4 className="text-sm font-semibold">Filtros Avançados</h4>
                {hasActiveFilters && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={clearAllFilters}
                  >
                    <X className="mr-1 h-4 w-4" />
                    Limpar Filtros
                  </Button>
                )}
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                <div>
                  <label className="text-xs font-medium text-muted-foreground mb-2 block">
                    Status Regulatório
                  </label>
                  <Select value={statusFilter} onValueChange={setStatusFilter}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="todos">Todos</SelectItem>
                      <SelectItem value="REGULAMENTADA">Regulamentada</SelectItem>
                      <SelectItem value="NAO_REGULAMENTADA">Não Regulamentada</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <label className="text-xs font-medium text-muted-foreground mb-2 block">
                    Status Operacional
                  </label>
                  <Select value={operacionalFilter} onValueChange={setOperacionalFilter}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="todos">Todos</SelectItem>
                      <SelectItem value="ATIVA">Ativa</SelectItem>
                      <SelectItem value="INATIVA">Inativa</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <label className="text-xs font-medium text-muted-foreground mb-2 block">
                    Tipo de Verificação
                  </label>
                  <Select value={verificacaoFilter} onValueChange={setVerificacaoFilter}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="todos">Todos</SelectItem>
                      <SelectItem value="OBRIGATORIA">Obrigatória</SelectItem>
                      <SelectItem value="QUANDO_SOLICITADO">Quando Solicitado</SelectItem>
                      <SelectItem value="NAO_REQUERIDA">Não Requerida</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <label className="text-xs font-medium text-muted-foreground mb-2 block">
                    Presença de Bônus
                  </label>
                  <Select value={bonusFilter} onValueChange={setBonusFilter}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="todos">Todos</SelectItem>
                      <SelectItem value="com_bonus">Com Bônus</SelectItem>
                      <SelectItem value="sem_bonus">Sem Bônus</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {hasActiveFilters && (
                <div className="flex items-center gap-2 pt-2">
                  <span className="text-xs text-muted-foreground">Filtros ativos:</span>
                  <div className="flex flex-wrap gap-2">
                    {searchTerm && (
                      <Badge variant="secondary" className="text-xs">
                        Busca: {searchTerm}
                      </Badge>
                    )}
                    {statusFilter !== "todos" && (
                      <Badge variant="secondary" className="text-xs">
                        Status: {statusFilter === "REGULAMENTADA" ? "Regulamentada" : "Não Regulamentada"}
                      </Badge>
                    )}
                    {operacionalFilter !== "todos" && (
                      <Badge variant="secondary" className="text-xs">
                        Operacional: {operacionalFilter}
                      </Badge>
                    )}
                    {verificacaoFilter !== "todos" && (
                      <Badge variant="secondary" className="text-xs">
                        Verificação: {verificacaoFilter === "OBRIGATORIA" ? "Obrigatória" : verificacaoFilter === "QUANDO_SOLICITADO" ? "Quando Solicitado" : "Não Requerida"}
                      </Badge>
                    )}
                    {bonusFilter !== "todos" && (
                      <Badge variant="secondary" className="text-xs">
                        {bonusFilter === "com_bonus" ? "Com Bônus" : "Sem Bônus"}
                      </Badge>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Bookmakers Grid */}
      {filteredBookmakers.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <p className="text-muted-foreground">
              {hasActiveFilters 
                ? "Nenhuma casa encontrada com os filtros aplicados. Tente ajustar os critérios de busca."
                : "Nenhuma casa encontrada no catálogo."}
            </p>
            {hasActiveFilters && (
              <Button
                variant="outline"
                size="sm"
                className="mt-4"
                onClick={clearAllFilters}
              >
                <X className="mr-2 h-4 w-4" />
                Limpar Filtros
              </Button>
            )}
          </CardContent>
        </Card>
      ) : (
        <>
          <div className="flex items-center justify-between px-1 mb-4">
            <p className="text-sm text-muted-foreground">
              {filteredBookmakers.length === bookmakers.length 
                ? `${bookmakers.length} bookmaker${bookmakers.length !== 1 ? 's' : ''} no catálogo`
                : `${filteredBookmakers.length} de ${bookmakers.length} bookmaker${bookmakers.length !== 1 ? 's' : ''}`}
            </p>
          </div>
          
          {viewType === "cards" ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
              {filteredBookmakers.map((bookmaker) => (
                <Card 
                  key={bookmaker.id} 
                  className={`hover:shadow-lg transition-shadow relative border-2 ${
                    bookmaker.operacional === "ATIVA" 
                      ? "border-emerald-500/50" 
                      : "border-warning/50"
                  }`}
                >
                  <CardHeader className="pb-3">
                    <div className="space-y-3">
                      {/* Nome com ícone de verificação colado */}
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-1.5">
                          <CardTitle className="text-sm font-semibold">
                            {bookmaker.nome}
                          </CardTitle>
                          <TooltipProvider>
                            {bookmaker.status === "REGULAMENTADA" ? (
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <div className="cursor-default">
                                    <ShieldCheck className="h-4 w-4 text-emerald-500" />
                                  </div>
                                </TooltipTrigger>
                                <TooltipContent>
                                  <p className="uppercase">{bookmaker.status}</p>
                                </TooltipContent>
                              </Tooltip>
                            ) : (
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <div className="cursor-default">
                                    <AlertTriangle className="h-4 w-4 text-amber-500" />
                                  </div>
                                </TooltipTrigger>
                                <TooltipContent>
                                  <p className="uppercase">{bookmaker.status}</p>
                                </TooltipContent>
                              </Tooltip>
                            )}
                          </TooltipProvider>
                      </div>
                      
                      <div className="flex items-center gap-1.5">
                        {bookmaker.bonus_enabled && (
                          <TooltipProvider>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <button
                                  onClick={() => handleBonusClick(bookmaker)}
                                  className="text-emerald-500 hover:text-emerald-400 transition-colors"
                                >
                                  <Gift className="h-5 w-5" />
                                </button>
                              </TooltipTrigger>
                              <TooltipContent>
                                <p>Ver bônus disponíveis</p>
                              </TooltipContent>
                            </Tooltip>
                          </TooltipProvider>
                        )}
                        
                        {bookmaker.observacoes && bookmaker.observacoes.trim() !== "" && (
                          <TooltipProvider>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <button
                                  onClick={() => handleObservacoesClick(bookmaker)}
                                  className="h-5 w-5 rounded-full bg-white/20 hover:bg-white/30 flex items-center justify-center text-white transition-colors"
                                >
                                  <Info className="h-3.5 w-3.5" />
                                </button>
                              </TooltipTrigger>
                              <TooltipContent>
                                <p>Ver observações</p>
                              </TooltipContent>
                            </Tooltip>
                          </TooltipProvider>
                        )}
                      </div>
                    </div>
                      
                      {/* Imagem à esquerda */}
                      <div className="flex items-start justify-start">
                        <div className="h-20 w-20 flex-shrink-0">
                          {bookmaker.logo_url ? (
                            <img
                              src={bookmaker.logo_url}
                              alt={bookmaker.nome}
                              className="h-full w-full object-contain"
                              onError={(e) => {
                                const target = e.currentTarget;
                                target.style.display = 'none';
                                const parent = target.parentElement;
                                if (parent) {
                                  parent.innerHTML = `<div class="h-20 w-20 rounded-full bg-primary/10 flex items-center justify-center">
                                    <span class="text-sm font-bold text-primary">${bookmaker.nome.substring(0, 2).toUpperCase()}</span>
                                  </div>`;
                                }
                              }}
                            />
                          ) : (
                            <div className="h-20 w-20 rounded-full bg-primary/10 flex items-center justify-center">
                              <span className="text-sm font-bold text-primary">
                                {bookmaker.nome.substring(0, 2).toUpperCase()}
                              </span>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-3">
                      <div className="space-y-2">
                        <div className="flex items-center gap-2">
                          <span className="text-sm text-muted-foreground">Verificação:</span>
                          <span className={`font-medium uppercase ${
                            bookmaker.verificacao === "OBRIGATORIA" 
                              ? "text-red-500 text-[10px]" 
                              : bookmaker.verificacao === "QUANDO_SOLICITADO"
                              ? "text-amber-500 text-[10px]"
                              : "text-emerald-500 text-[10px]"
                          }`}>
                            {bookmaker.verificacao === "OBRIGATORIA" 
                              ? "OBRIGATÓRIA" 
                              : bookmaker.verificacao === "QUANDO_SOLICITADO"
                              ? "QUANDO SOLICITADO"
                              : "NÃO REQUERIDA"}
                          </span>
                        </div>
                      </div>

                      {bookmaker.links_json && Array.isArray(bookmaker.links_json) && bookmaker.links_json.length > 0 && (
                        <div className="pt-2 border-t flex items-center gap-2 flex-wrap">
                          {bookmaker.links_json.slice(0, 2).map((link: any, index: number) => (
                            <a
                              key={index}
                              href={link.url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-xs text-primary hover:text-primary/80 transition-colors flex items-center gap-1.5 group uppercase"
                            >
                              <ExternalLink className="h-3 w-3 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-transform" />
                              <span>{link.referencia === "PADRÃO" || !link.referencia ? "SITE OFICIAL" : link.referencia}</span>
                            </a>
                          ))}
                          {bookmaker.links_json.length > 2 && (
                            <span className="text-xs text-muted-foreground">
                              +{bookmaker.links_json.length - 2} link{bookmaker.links_json.length - 2 > 1 ? 's' : ''}
                            </span>
                          )}
                        </div>
                      )}

                      <div className="flex gap-2 pt-2">
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
                          onClick={() => handleDeleteClick(bookmaker.id)}
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
                <div className="divide-y divide-border">
                  {filteredBookmakers.map((bookmaker) => (
                    <div 
                      key={bookmaker.id} 
                      className={`p-4 transition-colors ${
                        bookmaker.operacional === "INATIVA" 
                          ? "bg-warning/5 hover:bg-warning/10" 
                          : "hover:bg-accent/50"
                      }`}
                    >
                      <div className="flex items-center gap-4">
                        <div className="flex-1 flex items-center gap-3">
                          <div className="h-16 w-16 flex-shrink-0 flex items-center justify-center">
                            {bookmaker.logo_url ? (
                              <img
                                src={bookmaker.logo_url}
                                alt={bookmaker.nome}
                                className="h-full w-full object-contain"
                                onError={(e) => {
                                  const target = e.currentTarget;
                                  target.style.display = 'none';
                                  const parent = target.parentElement;
                                  if (parent) {
                                    parent.innerHTML = `<div class="h-16 w-16 rounded-full bg-primary/10 flex items-center justify-center">
                                      <span class="text-sm font-bold text-primary">${bookmaker.nome.substring(0, 2).toUpperCase()}</span>
                                    </div>`;
                                  }
                                }}
                              />
                            ) : (
                              <div className="h-16 w-16 rounded-full bg-primary/10 flex items-center justify-center">
                                <span className="text-sm font-bold text-primary">
                                  {bookmaker.nome.substring(0, 2).toUpperCase()}
                                </span>
                              </div>
                            )}
                          </div>
                          <div className="flex-1">
                            <div className="flex items-center gap-2 mb-1">
                              <h3 className="font-semibold text-base">{bookmaker.nome}</h3>
                              <TooltipProvider>
                                {bookmaker.status === "REGULAMENTADA" ? (
                                  <Tooltip>
                                    <TooltipTrigger asChild>
                                      <div className="cursor-default">
                                        <ShieldCheck className="h-4 w-4 text-emerald-500" />
                                      </div>
                                    </TooltipTrigger>
                                    <TooltipContent>
                                      <p>REGULAMENTADA</p>
                                    </TooltipContent>
                                  </Tooltip>
                                ) : (
                                  <Tooltip>
                                    <TooltipTrigger asChild>
                                      <div className="cursor-default">
                                        <AlertTriangle className="h-4 w-4 text-amber-500" />
                                      </div>
                                    </TooltipTrigger>
                                    <TooltipContent>
                                      <p>NÃO REGULAMENTADA</p>
                                    </TooltipContent>
                                  </Tooltip>
                                )}
                              </TooltipProvider>
                              {bookmaker.bonus_enabled && (
                                <TooltipProvider>
                                  <Tooltip>
                                    <TooltipTrigger asChild>
                                      <button
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          handleBonusClick(bookmaker);
                                        }}
                                        className="cursor-pointer hover:scale-110 transition-transform"
                                      >
                                        <Gift className="h-4 w-4 text-primary" />
                                      </button>
                                    </TooltipTrigger>
                                    <TooltipContent>
                                      <p>Ver Detalhes do Bônus</p>
                                    </TooltipContent>
                                  </Tooltip>
                                </TooltipProvider>
                              )}
                              {bookmaker.observacoes && bookmaker.observacoes.trim() !== "" && (
                                <TooltipProvider>
                                  <Tooltip>
                                    <TooltipTrigger asChild>
                                      <button
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          handleObservacoesClick(bookmaker);
                                        }}
                                        className="h-4 w-4 rounded-full bg-white/20 hover:bg-white/30 flex items-center justify-center text-white transition-colors cursor-pointer hover:scale-110"
                                      >
                                        <Info className="h-3 w-3" />
                                      </button>
                                    </TooltipTrigger>
                                    <TooltipContent>
                                      <p>Ver observações</p>
                                    </TooltipContent>
                                  </Tooltip>
                                </TooltipProvider>
                              )}
                            </div>
                            <div className="flex flex-col gap-1 text-sm text-muted-foreground">
                              <div className="flex items-center gap-2">
                                <span className="font-medium">Verificação:</span>
                                <span className={`font-medium uppercase ${
                                  bookmaker.verificacao === "OBRIGATORIA" 
                                    ? "text-red-500 text-[10px]" 
                                    : bookmaker.verificacao === "QUANDO_SOLICITADO"
                                    ? "text-amber-500 text-[10px]"
                                    : "text-emerald-500 text-[10px]"
                                }`}>
                                  {bookmaker.verificacao === "OBRIGATORIA" 
                                    ? "OBRIGATÓRIA" 
                                    : bookmaker.verificacao === "QUANDO_SOLICITADO"
                                    ? "QUANDO SOLICITADO"
                                    : "NÃO REQUERIDA"}
                                </span>
                              </div>
                              {bookmaker.links_json && Array.isArray(bookmaker.links_json) && bookmaker.links_json.length > 0 && (
                                <div className="flex items-center gap-2 text-xs flex-wrap">
                                  <span className="font-medium">Links:</span>
                                  {bookmaker.links_json.map((link: any, index: number) => (
                                    <span key={index} className="flex items-center gap-2">
                                       <a
                                         href={link.url}
                                         target="_blank"
                                         rel="noopener noreferrer"
                                         className="text-primary hover:text-primary/80 transition-colors flex items-center gap-1 group uppercase"
                                       >
                                         <ExternalLink className="h-3 w-3 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-transform" />
                                         <span>{link.referencia === "PADRÃO" || !link.referencia ? "SITE OFICIAL" : link.referencia}</span>
                                       </a>
                                      {index < bookmaker.links_json.length - 1 && (
                                        <span className="text-border">|</span>
                                      )}
                                    </span>
                                  ))}
                                </div>
                              )}
                            </div>
                          </div>
                        </div>
                        <div className="flex gap-2">
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
                            onClick={() => handleDeleteClick(bookmaker.id)}
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
        </>
      )}

      <BookmakerCatalogoDialog
        open={dialogOpen}
        onClose={handleDialogClose}
        bookmaker={editingBookmaker}
      />

      {/* Dialog de Detalhes do Bônus */}
      <Dialog open={bonusDialogOpen} onOpenChange={setBonusDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Gift className="h-5 w-5 text-primary" />
              Detalhes do Bônus - {selectedBonusBookmaker?.nome}
            </DialogTitle>
          </DialogHeader>

          {selectedBonusBookmaker && (
            <div className="space-y-6 py-4">
              {selectedBonusBookmaker.bonus_multiplos_json && Array.isArray(selectedBonusBookmaker.bonus_multiplos_json) && selectedBonusBookmaker.bonus_multiplos_json.length > 0 ? (
                <div className="space-y-4">
                  <h3 className="text-lg font-semibold text-primary">Bônus Disponíveis</h3>
                  {selectedBonusBookmaker.bonus_multiplos_json.map((bonus: any, index: number) => (
                    <div key={index} className="space-y-3 p-4 rounded-lg bg-accent/20 border border-accent/30">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <Badge variant="default" className="text-sm">
                            {bonus.tipoBônus === "BOAS_VINDAS" ? "BOAS-VINDAS" : 
                             bonus.tipoBônus === "CASHBACK" ? "CASHBACK" : 
                             bonus.tipoBônus === "FREE_BET" ? "FREE BET" : bonus.tipoBônus}
                          </Badge>
                          <Badge variant="outline">{bonus.percent}%</Badge>
                        </div>
                      </div>
                      <div className="grid grid-cols-2 gap-3 text-sm">
                        <div>
                          <p className="text-muted-foreground">Valor Máximo</p>
                          <p className="font-medium">
                            {formatCurrency(bonus.moeda)} {bonus.valorMax}
                          </p>
                        </div>
                        <div>
                          <p className="text-muted-foreground">Odd Mínima</p>
                          <p className="font-medium">{bonus.oddMin}</p>
                        </div>
                        <div>
                          <p className="text-muted-foreground">Prazo</p>
                          <p className="font-medium">{bonus.prazo} dias</p>
                        </div>
                        <div className="col-span-2">
                          <p className="text-muted-foreground">Rollover</p>
                          <p className="font-medium">
                            {bonus.rolloverVezes}x sobre {formatRolloverBase(bonus.rolloverBase)}
                          </p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground text-center py-8">
                  Nenhum bônus configurado
                </p>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Dialog de Observações */}
      <Dialog open={observacoesDialogOpen} onOpenChange={setObservacoesDialogOpen}>
        <DialogContent className="max-w-2xl">
          {selectedObservacoesBookmaker && (
            <div className="space-y-4">
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <Info className="h-5 w-5 text-primary" />
                  Observações - {selectedObservacoesBookmaker.nome}
                </DialogTitle>
              </DialogHeader>
              <div className="p-4 rounded-lg bg-muted/30 border border-border">
                <p className="text-sm whitespace-pre-wrap leading-relaxed">
                  {selectedObservacoesBookmaker.observacoes}
                </p>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Tem certeza que deseja excluir esta casa do catálogo?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta ação não pode ser desfeita. A casa será permanentemente removida do catálogo.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
