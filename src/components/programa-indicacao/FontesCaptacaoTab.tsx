import { useState, useEffect, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { SearchInput } from "@/components/ui/search-input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
import { IndicadorDialog } from "@/components/indicadores/IndicadorDialog";
import { FornecedorDialog } from "@/components/fornecedores/FornecedorDialog";
import { IndicadorCard } from "@/components/indicadores/IndicadorCard";
import {
  Users,
  UserPlus,
  Truck,
  LayoutGrid,
  List,
  DollarSign,
  TrendingUp,
  ArrowUpRight,
  ArrowDownRight,
  Minus,
  Target,
} from "lucide-react";
import { useActionAccess } from "@/hooks/useModuleAccess";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";

type TipoFonte = "INDICADOR" | "FORNECEDOR";

interface IndicadorPerformance {
  indicador_id: string;
  user_id: string;
  nome: string;
  cpf: string;
  status: string;
  telefone: string | null;
  email: string | null;
  total_parceiros_indicados: number;
  parcerias_ativas: number;
  parcerias_encerradas: number;
  total_comissoes: number;
  total_bonus: number;
}

interface IndicadorAcordo {
  id: string;
  indicador_id: string;
  orcamento_por_parceiro: number;
  meta_parceiros: number | null;
  valor_bonus: number | null;
  ativo: boolean;
}

interface Fornecedor {
  id: string;
  user_id: string;
  nome: string;
  documento: string | null;
  tipo_documento: string;
  telefone: string | null;
  email: string | null;
  status: string;
  observacoes: string | null;
  total_parceiros?: number;
  total_pago?: number;
}

// Unified type for display
interface FonteCaptacao {
  id: string;
  tipo: TipoFonte;
  nome: string;
  documento: string;
  status: string;
  telefone: string | null;
  email: string | null;
  totalParceiros: number;
  totalPago: number;
  // Indicador-specific
  parcerias_ativas?: number;
  total_comissoes?: number;
  total_bonus?: number;
  // Original data for dialogs
  originalData: IndicadorPerformance | Fornecedor;
}

export function FontesCaptacaoTab() {
  const { toast } = useToast();
  const [tipoFonte, setTipoFonte] = useState<TipoFonte>("INDICADOR");
  const [loading, setLoading] = useState(true);
  
  // Data
  const [indicadores, setIndicadores] = useState<IndicadorPerformance[]>([]);
  const [acordos, setAcordos] = useState<IndicadorAcordo[]>([]);
  const [fornecedores, setFornecedores] = useState<Fornecedor[]>([]);
  
  // UI state
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("todos");
  const [viewMode, setViewMode] = useState<"cards" | "list">("cards");
  
  // Dialogs
  const [indicadorDialogOpen, setIndicadorDialogOpen] = useState(false);
  const [fornecedorDialogOpen, setFornecedorDialogOpen] = useState(false);
  const [selectedIndicador, setSelectedIndicador] = useState<IndicadorPerformance | null>(null);
  const [selectedFornecedor, setSelectedFornecedor] = useState<Fornecedor | null>(null);
  const [isViewMode, setIsViewMode] = useState(false);
  
  // Delete
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [fonteToDelete, setFonteToDelete] = useState<FonteCaptacao | null>(null);
  
  const { canCreate, canEdit, canDelete } = useActionAccess();

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      setLoading(true);
      
      const [indicadoresRes, acordosRes, fornecedoresRes, parceriasRes] = await Promise.all([
        supabase.from("v_indicador_performance").select("*"),
        supabase.from("indicador_acordos").select("*").eq("ativo", true),
        supabase.from("fornecedores").select("*").order("nome"),
        supabase.from("parcerias").select("fornecedor_id, valor_fornecedor").eq("origem_tipo", "FORNECEDOR"),
      ]);

      if (indicadoresRes.error) throw indicadoresRes.error;
      setIndicadores(indicadoresRes.data || []);
      setAcordos(acordosRes.data || []);

      // Calculate fornecedor stats
      const fornecedoresWithStats = (fornecedoresRes.data || []).map((f) => {
        const parceriasFornecedor = (parceriasRes.data || []).filter((p) => p.fornecedor_id === f.id);
        return {
          ...f,
          total_parceiros: parceriasFornecedor.length,
          total_pago: parceriasFornecedor.reduce((acc, p) => acc + (p.valor_fornecedor || 0), 0),
        };
      });
      setFornecedores(fornecedoresWithStats);
    } catch (error: any) {
      toast({
        title: "Erro ao carregar dados",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  // Transform to unified FonteCaptacao
  const fontesCaptacao = useMemo((): FonteCaptacao[] => {
    if (tipoFonte === "INDICADOR") {
      return indicadores.map((ind) => ({
        id: ind.indicador_id,
        tipo: "INDICADOR" as TipoFonte,
        nome: ind.nome,
        documento: ind.cpf,
        status: ind.status,
        telefone: ind.telefone,
        email: ind.email,
        totalParceiros: ind.total_parceiros_indicados,
        totalPago: ind.total_comissoes + ind.total_bonus,
        parcerias_ativas: ind.parcerias_ativas,
        total_comissoes: ind.total_comissoes,
        total_bonus: ind.total_bonus,
        originalData: ind,
      }));
    } else {
      return fornecedores.map((f) => ({
        id: f.id,
        tipo: "FORNECEDOR" as TipoFonte,
        nome: f.nome,
        documento: f.documento || "",
        status: f.status,
        telefone: f.telefone,
        email: f.email,
        totalParceiros: f.total_parceiros || 0,
        totalPago: f.total_pago || 0,
        originalData: f,
      }));
    }
  }, [tipoFonte, indicadores, fornecedores]);

  // Filtered list
  const filteredFontes = fontesCaptacao.filter((f) => {
    const matchesSearch =
      f.nome.toLowerCase().includes(searchTerm.toLowerCase()) ||
      f.documento.includes(searchTerm);
    const matchesStatus = statusFilter === "todos" || f.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  // Comparative stats
  const statsIndicadores = {
    total: indicadores.length,
    ativos: indicadores.filter((i) => i.status === "ATIVO").length,
    parceiros: indicadores.reduce((acc, i) => acc + i.total_parceiros_indicados, 0),
    pago: indicadores.reduce((acc, i) => acc + i.total_comissoes + i.total_bonus, 0),
  };

  const statsFornecedores = {
    total: fornecedores.length,
    ativos: fornecedores.filter((f) => f.status === "ATIVO").length,
    parceiros: fornecedores.reduce((acc, f) => acc + (f.total_parceiros || 0), 0),
    pago: fornecedores.reduce((acc, f) => acc + (f.total_pago || 0), 0),
  };

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat("pt-BR", {
      style: "currency",
      currency: "BRL",
    }).format(value);
  };

  const getStatusBadge = (status: string) => {
    const config: Record<string, { label: string; variant: "default" | "destructive" | "outline" }> = {
      ATIVO: { label: "Ativo", variant: "default" },
      INATIVO: { label: "Inativo", variant: "destructive" },
    };
    const c = config[status] || { label: status, variant: "outline" };
    return <Badge variant={c.variant}>{c.label}</Badge>;
  };

  const getAcordo = (indicadorId: string) => acordos.find((a) => a.indicador_id === indicadorId);

  // Handlers
  const handleAdd = () => {
    if (tipoFonte === "INDICADOR") {
      setSelectedIndicador(null);
      setIsViewMode(false);
      setIndicadorDialogOpen(true);
    } else {
      setSelectedFornecedor(null);
      setIsViewMode(false);
      setFornecedorDialogOpen(true);
    }
  };

  const handleView = (fonte: FonteCaptacao) => {
    setIsViewMode(true);
    if (fonte.tipo === "INDICADOR") {
      setSelectedIndicador(fonte.originalData as IndicadorPerformance);
      setIndicadorDialogOpen(true);
    } else {
      setSelectedFornecedor(fonte.originalData as Fornecedor);
      setFornecedorDialogOpen(true);
    }
  };

  const handleEdit = (fonte: FonteCaptacao) => {
    setIsViewMode(false);
    if (fonte.tipo === "INDICADOR") {
      setSelectedIndicador(fonte.originalData as IndicadorPerformance);
      setIndicadorDialogOpen(true);
    } else {
      setSelectedFornecedor(fonte.originalData as Fornecedor);
      setFornecedorDialogOpen(true);
    }
  };

  const handleDeleteClick = (fonte: FonteCaptacao) => {
    setFonteToDelete(fonte);
    setDeleteDialogOpen(true);
  };

  const handleDelete = async () => {
    if (!fonteToDelete) return;

    try {
      const table = fonteToDelete.tipo === "INDICADOR" ? "indicadores_referral" : "fornecedores";
      const { error } = await supabase.from(table).delete().eq("id", fonteToDelete.id);

      if (error) throw error;

      toast({
        title: `${fonteToDelete.tipo === "INDICADOR" ? "Indicador" : "Fornecedor"} excluído`,
        description: "Registro removido com sucesso.",
      });
      fetchData();
    } catch (error: any) {
      toast({
        title: "Erro ao excluir",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setDeleteDialogOpen(false);
      setFonteToDelete(null);
    }
  };

  const handleDialogClose = () => {
    setIndicadorDialogOpen(false);
    setFornecedorDialogOpen(false);
    setSelectedIndicador(null);
    setSelectedFornecedor(null);
    setIsViewMode(false);
    fetchData();
  };

  // Permission checks
  const canAdd = tipoFonte === "INDICADOR" 
    ? canCreate('captacao', 'captacao.indicadores.create')
    : canCreate('captacao', 'captacao.fornecedores.create');

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Comparative Overview Card */}
      <Card className="bg-gradient-to-br from-muted/30 to-muted/10 border-dashed">
        <CardContent className="pt-6">
          <div className="grid grid-cols-2 gap-6">
            {/* Indicadores Summary */}
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <div className="h-8 w-8 rounded-full bg-emerald-500/10 flex items-center justify-center">
                  <UserPlus className="h-4 w-4 text-emerald-500" />
                </div>
                <div>
                  <p className="text-sm font-medium">Indicadores</p>
                  <p className="text-xs text-muted-foreground">{statsIndicadores.ativos} ativos de {statsIndicadores.total}</p>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div>
                  <p className="text-muted-foreground text-xs">Parceiros</p>
                  <p className="font-semibold">{statsIndicadores.parceiros}</p>
                </div>
                <div>
                  <p className="text-muted-foreground text-xs">Investido</p>
                  <p className="font-semibold text-emerald-500">{formatCurrency(statsIndicadores.pago)}</p>
                </div>
              </div>
            </div>

            {/* Fornecedores Summary */}
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <div className="h-8 w-8 rounded-full bg-blue-500/10 flex items-center justify-center">
                  <Truck className="h-4 w-4 text-blue-500" />
                </div>
                <div>
                  <p className="text-sm font-medium">Fornecedores</p>
                  <p className="text-xs text-muted-foreground">{statsFornecedores.ativos} ativos de {statsFornecedores.total}</p>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div>
                  <p className="text-muted-foreground text-xs">Parceiros</p>
                  <p className="font-semibold">{statsFornecedores.parceiros}</p>
                </div>
                <div>
                  <p className="text-muted-foreground text-xs">Investido</p>
                  <p className="font-semibold text-blue-500">{formatCurrency(statsFornecedores.pago)}</p>
                </div>
              </div>
            </div>
          </div>

          {/* Comparison bar */}
          <div className="mt-4 pt-4 border-t border-dashed">
            <div className="flex items-center justify-between text-xs text-muted-foreground mb-2">
              <span>Distribuição de Parceiros</span>
              <span>
                {statsIndicadores.parceiros + statsFornecedores.parceiros} total
              </span>
            </div>
            <div className="h-2 rounded-full bg-muted overflow-hidden flex">
              {statsIndicadores.parceiros + statsFornecedores.parceiros > 0 && (
                <>
                  <div 
                    className="h-full bg-emerald-500 transition-all"
                    style={{ 
                      width: `${(statsIndicadores.parceiros / (statsIndicadores.parceiros + statsFornecedores.parceiros)) * 100}%` 
                    }}
                  />
                  <div 
                    className="h-full bg-blue-500 transition-all"
                    style={{ 
                      width: `${(statsFornecedores.parceiros / (statsIndicadores.parceiros + statsFornecedores.parceiros)) * 100}%` 
                    }}
                  />
                </>
              )}
            </div>
            <div className="flex justify-between mt-1 text-xs">
              <span className="text-emerald-500">
                {statsIndicadores.parceiros > 0 
                  ? `${((statsIndicadores.parceiros / (statsIndicadores.parceiros + statsFornecedores.parceiros)) * 100).toFixed(0)}%` 
                  : "0%"} Indicadores
              </span>
              <span className="text-blue-500">
                {statsFornecedores.parceiros > 0 
                  ? `${((statsFornecedores.parceiros / (statsIndicadores.parceiros + statsFornecedores.parceiros)) * 100).toFixed(0)}%` 
                  : "0%"} Fornecedores
              </span>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Type Selector */}
      <Tabs value={tipoFonte} onValueChange={(v) => setTipoFonte(v as TipoFonte)} className="w-full">
        <TabsList className="grid w-full max-w-md grid-cols-2">
          <TabsTrigger value="INDICADOR" className="gap-2">
            <UserPlus className="h-4 w-4" />
            Indicadores
            <Badge variant="secondary" className="ml-1 h-5 px-1.5">
              {statsIndicadores.total}
            </Badge>
          </TabsTrigger>
          <TabsTrigger value="FORNECEDOR" className="gap-2">
            <Truck className="h-4 w-4" />
            Fornecedores
            <Badge variant="secondary" className="ml-1 h-5 px-1.5">
              {statsFornecedores.total}
            </Badge>
          </TabsTrigger>
        </TabsList>
      </Tabs>

      {/* KPIs for current type */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total</CardTitle>
            {tipoFonte === "INDICADOR" ? (
              <UserPlus className="h-4 w-4 text-muted-foreground" />
            ) : (
              <Truck className="h-4 w-4 text-muted-foreground" />
            )}
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {tipoFonte === "INDICADOR" ? statsIndicadores.total : statsFornecedores.total}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Ativos</CardTitle>
            {tipoFonte === "INDICADOR" ? (
              <UserPlus className="h-4 w-4 text-emerald-500" />
            ) : (
              <Truck className="h-4 w-4 text-emerald-500" />
            )}
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-emerald-500">
              {tipoFonte === "INDICADOR" ? statsIndicadores.ativos : statsFornecedores.ativos}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">
              Parceiros {tipoFonte === "INDICADOR" ? "Indicados" : "Comprados"}
            </CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {tipoFonte === "INDICADOR" ? statsIndicadores.parceiros : statsFornecedores.parceiros}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Pago</CardTitle>
            <DollarSign className={`h-4 w-4 ${tipoFonte === "INDICADOR" ? "text-emerald-500" : "text-blue-500"}`} />
          </CardHeader>
          <CardContent>
            <div className={`text-2xl font-bold ${tipoFonte === "INDICADOR" ? "text-emerald-500" : "text-blue-500"}`}>
              {formatCurrency(tipoFonte === "INDICADOR" ? statsIndicadores.pago : statsFornecedores.pago)}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Toolbar */}
      <div className="flex flex-col md:flex-row gap-4 items-center">
        <div className="flex-1 w-full md:max-w-sm">
          <SearchInput
            placeholder={`Buscar ${tipoFonte === "INDICADOR" ? "indicador" : "fornecedor"}...`}
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            onAdd={canAdd ? handleAdd : undefined}
            addButtonLabel={tipoFonte === "INDICADOR" ? "Novo Indicador" : "Novo Fornecedor"}
          />
        </div>

        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="Filtrar por status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Todos os status</SelectItem>
            <SelectItem value="ATIVO">Ativo</SelectItem>
            <SelectItem value="INATIVO">Inativo</SelectItem>
          </SelectContent>
        </Select>

        <div className="flex gap-1">
          <Button
            variant={viewMode === "cards" ? "default" : "outline"}
            size="icon"
            onClick={() => setViewMode("cards")}
          >
            <LayoutGrid className="h-4 w-4" />
          </Button>
          <Button
            variant={viewMode === "list" ? "default" : "outline"}
            size="icon"
            onClick={() => setViewMode("list")}
          >
            <List className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Content */}
      {filteredFontes.length === 0 ? (
        <Card className="p-12 text-center">
          {tipoFonte === "INDICADOR" ? (
            <UserPlus className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
          ) : (
            <Truck className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
          )}
          <h3 className="text-lg font-semibold mb-2">
            Nenhum {tipoFonte === "INDICADOR" ? "indicador" : "fornecedor"} encontrado
          </h3>
          <p className="text-muted-foreground mb-4">
            {searchTerm || statusFilter !== "todos"
              ? "Tente ajustar os filtros de busca"
              : `Comece cadastrando ${tipoFonte === "INDICADOR" ? "seu primeiro indicador" : "seu primeiro fornecedor"}`}
          </p>
          {canAdd && (
            <Button onClick={handleAdd}>
              {tipoFonte === "INDICADOR" ? (
                <>
                  <UserPlus className="h-4 w-4 mr-2" />
                  Novo Indicador
                </>
              ) : (
                <>
                  <Truck className="h-4 w-4 mr-2" />
                  Novo Fornecedor
                </>
              )}
            </Button>
          )}
        </Card>
      ) : viewMode === "cards" ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredFontes.map((fonte) => {
            if (fonte.tipo === "INDICADOR") {
              const acordo = getAcordo(fonte.id);
              return (
                <IndicadorCard
                  key={fonte.id}
                  indicador={fonte.originalData as IndicadorPerformance}
                  onView={() => handleView(fonte)}
                  onEdit={() => handleEdit(fonte)}
                  onDelete={() => handleDeleteClick(fonte)}
                  formatCurrency={formatCurrency}
                  getStatusBadge={getStatusBadge}
                />
              );
            } else {
              const fornecedor = fonte.originalData as Fornecedor;
              return (
                <Card
                  key={fonte.id}
                  className="cursor-pointer hover:border-primary/50 transition-colors"
                  onClick={() => handleView(fonte)}
                >
                  <CardContent className="pt-6">
                    <div className="flex items-start justify-between">
                      <div className="flex items-center gap-3">
                        <div className="h-10 w-10 rounded-full bg-blue-500/10 flex items-center justify-center">
                          <Truck className="h-5 w-5 text-blue-500" />
                        </div>
                        <div>
                          <h3 className="font-semibold">{fonte.nome}</h3>
                          <p className="text-sm text-muted-foreground">
                            {fornecedor.tipo_documento}: {fonte.documento || "N/A"}
                          </p>
                        </div>
                      </div>
                      {getStatusBadge(fonte.status)}
                    </div>

                    <div className="mt-4 grid grid-cols-2 gap-4">
                      <div>
                        <p className="text-sm text-muted-foreground">Parceiros</p>
                        <p className="font-semibold">{fonte.totalParceiros}</p>
                      </div>
                      <div>
                        <p className="text-sm text-muted-foreground">Total Pago</p>
                        <p className="font-semibold text-blue-500">{formatCurrency(fonte.totalPago)}</p>
                      </div>
                    </div>

                    <div className="mt-4 flex gap-2" onClick={(e) => e.stopPropagation()}>
                      <Button variant="outline" size="sm" className="flex-1" onClick={() => handleEdit(fonte)}>
                        Editar
                      </Button>
                      <Button variant="outline" size="sm" className="flex-1" onClick={() => handleDeleteClick(fonte)}>
                        Excluir
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              );
            }
          })}
        </div>
      ) : (
        <div className="space-y-2">
          {filteredFontes.map((fonte) => (
            <Card key={fonte.id} className="p-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <div className={`h-10 w-10 rounded-full flex items-center justify-center ${
                    fonte.tipo === "INDICADOR" ? "bg-emerald-500/10" : "bg-blue-500/10"
                  }`}>
                    {fonte.tipo === "INDICADOR" ? (
                      <UserPlus className="h-5 w-5 text-emerald-500" />
                    ) : (
                      <Truck className="h-5 w-5 text-blue-500" />
                    )}
                  </div>
                  <div>
                    <div className="font-semibold">{fonte.nome}</div>
                    <div className="text-sm text-muted-foreground">
                      {fonte.totalParceiros} parceiros
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-4">
                  <div className="text-right">
                    <div className={`font-semibold ${fonte.tipo === "INDICADOR" ? "text-emerald-500" : "text-blue-500"}`}>
                      {formatCurrency(fonte.totalPago)}
                    </div>
                    <div className="text-sm text-muted-foreground">Total pago</div>
                  </div>
                  {getStatusBadge(fonte.status)}
                  <div className="flex gap-1">
                    <Button variant="ghost" size="sm" onClick={() => handleView(fonte)}>
                      Ver
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => handleEdit(fonte)}>
                      Editar
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => handleDeleteClick(fonte)}>
                      Excluir
                    </Button>
                  </div>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      {/* Dialogs */}
      <IndicadorDialog
        open={indicadorDialogOpen}
        onOpenChange={handleDialogClose}
        indicador={selectedIndicador}
        isViewMode={isViewMode}
      />

      <FornecedorDialog
        open={fornecedorDialogOpen}
        onOpenChange={handleDialogClose}
        fornecedor={selectedFornecedor}
        isViewMode={isViewMode}
      />

      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirmar exclusão</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja excluir "{fonteToDelete?.nome}"?
              Esta ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground">
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
