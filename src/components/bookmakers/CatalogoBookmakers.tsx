import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Plus, Search, Edit, Trash2, ExternalLink, Filter, X, Gift, Shield } from "lucide-react";
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

  const handleDelete = async (id: string) => {
    if (!confirm("Tem certeza que deseja excluir esta casa do catálogo?")) return;

    try {
      const { error } = await supabase
        .from("bookmakers_catalogo")
        .delete()
        .eq("id", id);

      if (error) throw error;

      toast({
        title: "Casa excluída",
        description: "A casa foi removida do catálogo com sucesso.",
      });
      fetchBookmakers();
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
                  <select
                    value={statusFilter}
                    onChange={(e) => setStatusFilter(e.target.value)}
                    className="w-full px-3 py-2 text-sm border rounded-md bg-popover text-foreground hover:bg-accent/10 transition-colors focus:ring-2 focus:ring-primary/20 focus:outline-none"
                  >
                    <option value="todos">Todos</option>
                    <option value="REGULAMENTADA">Regulamentada</option>
                    <option value="NAO_REGULAMENTADA">Não Regulamentada</option>
                  </select>
                </div>

                <div>
                  <label className="text-xs font-medium text-muted-foreground mb-2 block">
                    Status Operacional
                  </label>
                  <select
                    value={operacionalFilter}
                    onChange={(e) => setOperacionalFilter(e.target.value)}
                    className="w-full px-3 py-2 text-sm border rounded-md bg-popover text-foreground hover:bg-accent/10 transition-colors focus:ring-2 focus:ring-primary/20 focus:outline-none"
                  >
                    <option value="todos">Todos</option>
                    <option value="ATIVA">Ativa</option>
                    <option value="INATIVA">Inativa</option>
                  </select>
                </div>

                <div>
                  <label className="text-xs font-medium text-muted-foreground mb-2 block">
                    Tipo de Verificação
                  </label>
                  <select
                    value={verificacaoFilter}
                    onChange={(e) => setVerificacaoFilter(e.target.value)}
                    className="w-full px-3 py-2 text-sm border rounded-md bg-popover text-foreground hover:bg-accent/10 transition-colors focus:ring-2 focus:ring-primary/20 focus:outline-none"
                  >
                    <option value="todos">Todos</option>
                    <option value="OBRIGATORIA">Obrigatória</option>
                    <option value="QUANDO_SOLICITADO">Quando Solicitado</option>
                    <option value="NAO_REQUERIDA">Não Requerida</option>
                  </select>
                </div>

                <div>
                  <label className="text-xs font-medium text-muted-foreground mb-2 block">
                    Presença de Bônus
                  </label>
                  <select
                    value={bonusFilter}
                    onChange={(e) => setBonusFilter(e.target.value)}
                    className="w-full px-3 py-2 text-sm border rounded-md bg-popover text-foreground hover:bg-accent/10 transition-colors focus:ring-2 focus:ring-primary/20 focus:outline-none"
                  >
                    <option value="todos">Todos</option>
                    <option value="com_bonus">Com Bônus</option>
                    <option value="sem_bonus">Sem Bônus</option>
                  </select>
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
          <div className="flex items-center justify-between px-1">
            <p className="text-sm text-muted-foreground">
              {filteredBookmakers.length === bookmakers.length 
                ? `${bookmakers.length} bookmaker${bookmakers.length !== 1 ? 's' : ''} no catálogo`
                : `${filteredBookmakers.length} de ${bookmakers.length} bookmaker${bookmakers.length !== 1 ? 's' : ''}`}
            </p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
            {filteredBookmakers.map((bookmaker) => (
              <Card key={bookmaker.id} className="hover:shadow-lg transition-shadow relative">
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1">
                      {bookmaker.logo_url ? (
                        <img
                          src={bookmaker.logo_url}
                          alt={bookmaker.nome}
                          className="h-12 w-auto object-contain mb-2"
                          onError={(e) => {
                            e.currentTarget.style.display = 'none';
                          }}
                        />
                      ) : null}
                      <CardTitle className="text-lg">{bookmaker.nome}</CardTitle>
                    </div>
                    
                    {/* Ícones no canto superior direito */}
                    <TooltipProvider>
                      <div className="flex gap-1.5">
                        {bookmaker.status === "REGULAMENTADA" && (
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <div className="p-1.5 rounded-md bg-emerald-500/10 border border-emerald-500/20">
                                <Shield className="h-4 w-4 text-emerald-500" />
                              </div>
                            </TooltipTrigger>
                            <TooltipContent>
                              <p>Casa Regulamentada</p>
                            </TooltipContent>
                          </Tooltip>
                        )}
                        
                        {bookmaker.bonus_enabled && (
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <div className="p-1.5 rounded-md bg-primary/10 border border-primary/20">
                                <Gift className="h-4 w-4 text-primary" />
                              </div>
                            </TooltipTrigger>
                            <TooltipContent>
                              <p>Possui Bônus {bookmaker.multibonus_enabled ? "Múltiplos" : "Simples"}</p>
                            </TooltipContent>
                          </Tooltip>
                        )}
                      </div>
                    </TooltipProvider>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-sm text-muted-foreground">Operacional:</span>
                        <Badge variant={bookmaker.operacional === "ATIVA" ? "default" : "destructive"}>
                          {bookmaker.operacional === "ATIVA" ? "Ativa" : "Inativa"}
                        </Badge>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-sm text-muted-foreground">Verificação:</span>
                        <Badge variant="outline">
                          {bookmaker.verificacao === "OBRIGATORIA" 
                            ? "Obrigatória" 
                            : bookmaker.verificacao === "QUANDO_SOLICITADO"
                            ? "Quando Solicitado"
                            : "Não Requerida"}
                        </Badge>
                      </div>
                    </div>

                    {bookmaker.links_json && Array.isArray(bookmaker.links_json) && bookmaker.links_json.length > 0 && (
                      <div className="pt-2 border-t space-y-1">
                        {bookmaker.links_json.slice(0, 2).map((link: any, index: number) => (
                          <a
                            key={index}
                            href={link.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-xs text-primary hover:text-primary/80 transition-colors flex items-center gap-1.5 group"
                          >
                            <ExternalLink className="h-3 w-3 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-transform" />
                            <span>{link.referencia || "Site Oficial"}</span>
                          </a>
                        ))}
                        {bookmaker.links_json.length > 2 && (
                          <p className="text-xs text-muted-foreground">
                            +{bookmaker.links_json.length - 2} link{bookmaker.links_json.length - 2 > 1 ? 's' : ''}
                          </p>
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
        </>
      )}

      <BookmakerCatalogoDialog
        open={dialogOpen}
        onClose={handleDialogClose}
        bookmaker={editingBookmaker}
      />
    </div>
  );
}
