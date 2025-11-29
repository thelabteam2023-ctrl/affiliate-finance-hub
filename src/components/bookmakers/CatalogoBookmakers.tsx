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
import { Plus, Search, Edit, Trash2, ExternalLink, Filter, X, Gift, ShieldCheck, AlertTriangle } from "lucide-react";
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

  const handleBonusClick = (bookmaker: BookmakerCatalogo) => {
    setSelectedBonusBookmaker(bookmaker);
    setBonusDialogOpen(true);
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
          <div className="flex items-center justify-between px-1">
            <p className="text-sm text-muted-foreground">
              {filteredBookmakers.length === bookmakers.length 
                ? `${bookmakers.length} bookmaker${bookmakers.length !== 1 ? 's' : ''} no catálogo`
                : `${filteredBookmakers.length} de ${bookmakers.length} bookmaker${bookmakers.length !== 1 ? 's' : ''}`}
            </p>
          </div>
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
                  {/* Logo, Nome, Ícone de Verificação e Gift - tudo na mesma linha */}
                  <div className="flex items-center gap-3">
                    {/* Logo 14x14 */}
                    {bookmaker.logo_url && (
                      <img
                        src={bookmaker.logo_url}
                        alt={bookmaker.nome}
                        className="h-14 w-14 object-contain flex-shrink-0"
                        onError={(e) => {
                          e.currentTarget.style.display = 'none';
                        }}
                      />
                    )}
                    
                    {/* Nome com fonte menor */}
                    <CardTitle className="text-sm font-semibold truncate">
                      {bookmaker.nome}
                    </CardTitle>
                    
                    {/* Ícone de verificação à direita do nome */}
                    <TooltipProvider>
                      {bookmaker.status === "REGULAMENTADA" ? (
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <div className="cursor-default flex-shrink-0">
                              <ShieldCheck className="h-5 w-5 text-emerald-500" />
                            </div>
                          </TooltipTrigger>
                          <TooltipContent>
                            <p>REGULAMENTADA</p>
                          </TooltipContent>
                        </Tooltip>
                      ) : (
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <div className="cursor-default flex-shrink-0">
                              <AlertTriangle className="h-5 w-5 text-amber-500" />
                            </div>
                          </TooltipTrigger>
                          <TooltipContent>
                            <p>NÃO REGULAMENTADA</p>
                          </TooltipContent>
                        </Tooltip>
                      )}
                    </TooltipProvider>
                    
                    {/* Ícone de Gift no final da linha */}
                    {bookmaker.bonus_enabled && (
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                handleBonusClick(bookmaker);
                              }}
                              className="cursor-pointer hover:scale-110 transition-transform flex-shrink-0 ml-auto"
                            >
                              <Gift className="h-5 w-5 text-primary" />
                            </button>
                          </TooltipTrigger>
                          <TooltipContent>
                            <p>Ver Detalhes do Bônus</p>
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    )}
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    <div className="space-y-2">
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
              {/* Bônus Simples */}
              {!selectedBonusBookmaker.multibonus_enabled && selectedBonusBookmaker.bonus_simples_json && (
                <div className="space-y-4">
                  <h3 className="text-lg font-semibold text-primary">Bônus Simples</h3>
                  <div className="grid grid-cols-2 gap-4 p-4 rounded-lg bg-accent/20 border border-accent/30">
                    <div>
                      <p className="text-sm text-muted-foreground">Percentual</p>
                      <p className="text-lg font-semibold">{selectedBonusBookmaker.bonus_simples_json.percent}%</p>
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">Valor Máximo</p>
                      <p className="text-lg font-semibold">
                        {formatCurrency(selectedBonusBookmaker.bonus_simples_json.moeda)} {selectedBonusBookmaker.bonus_simples_json.valorMax}
                      </p>
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">Odd Mínima</p>
                      <p className="text-lg font-semibold">{selectedBonusBookmaker.bonus_simples_json.oddMin}</p>
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">Tipo</p>
                      <Badge variant="secondary">{selectedBonusBookmaker.bonus_simples_json.tipo}</Badge>
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">Rollover</p>
                      <p className="text-lg font-semibold">
                        {selectedBonusBookmaker.bonus_simples_json.rolloverVezes}x sobre {formatRolloverBase(selectedBonusBookmaker.bonus_simples_json.rolloverBase)}
                      </p>
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">Prazo</p>
                      <p className="text-lg font-semibold">{selectedBonusBookmaker.bonus_simples_json.prazo} dias</p>
                    </div>
                  </div>
                </div>
              )}

              {/* Bônus Múltiplos */}
              {selectedBonusBookmaker.multibonus_enabled && selectedBonusBookmaker.bonus_multiplos_json && Array.isArray(selectedBonusBookmaker.bonus_multiplos_json) && (
                <div className="space-y-4">
                  <h3 className="text-lg font-semibold text-primary">Bônus Múltiplos</h3>
                  {selectedBonusBookmaker.bonus_multiplos_json.map((bonus: any, index: number) => (
                    <div key={index} className="space-y-3 p-4 rounded-lg bg-accent/20 border border-accent/30">
                      <div className="flex items-center justify-between">
                        <h4 className="font-semibold">{index + 1}º Depósito</h4>
                        <Badge variant="default">{bonus.percent}%</Badge>
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
                          <p className="text-muted-foreground">Tipo</p>
                          <Badge variant="outline" className="text-xs">{bonus.tipo}</Badge>
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
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
