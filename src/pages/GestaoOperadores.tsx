import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import { 
  Plus, 
  Search, 
  User, 
  Calendar, 
  Briefcase, 
  DollarSign,
  LayoutGrid,
  List,
  Edit,
  Eye
} from "lucide-react";
import { OperadorDialog } from "@/components/operadores/OperadorDialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

interface Operador {
  id: string;
  operador_id?: string;
  nome: string;
  cpf: string;
  email?: string | null;
  telefone?: string | null;
  status: string;
  tipo_contrato: string;
  data_admissao: string;
  projetos_ativos?: number;
  total_pago?: number;
  total_pendente?: number;
}

export default function GestaoOperadores() {
  const [operadores, setOperadores] = useState<Operador[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [contratoFilter, setContratoFilter] = useState<string>("all");
  const [viewMode, setViewMode] = useState<"cards" | "list">("cards");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [selectedOperador, setSelectedOperador] = useState<Operador | null>(null);
  const [dialogMode, setDialogMode] = useState<"view" | "edit" | "create">("create");

  useEffect(() => {
    fetchOperadores();
  }, []);

  const fetchOperadores = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from("v_operador_performance")
        .select("*");

      if (error) throw error;
      // Map operador_id to id for consistency
      const mapped = (data || []).map((op: any) => ({
        ...op,
        id: op.operador_id || op.id,
      }));
      setOperadores(mapped);
    } catch (error: any) {
      toast.error("Erro ao carregar operadores: " + error.message);
    } finally {
      setLoading(false);
    }
  };

  const filteredOperadores = operadores.filter((op) => {
    const matchesSearch = 
      op.nome.toLowerCase().includes(searchTerm.toLowerCase()) ||
      op.cpf.includes(searchTerm);
    const matchesStatus = statusFilter === "all" || op.status === statusFilter;
    const matchesContrato = contratoFilter === "all" || op.tipo_contrato === contratoFilter;
    return matchesSearch && matchesStatus && matchesContrato;
  });

  const handleOpenDialog = (operador: Operador | null, mode: "view" | "edit" | "create") => {
    setSelectedOperador(operador);
    setDialogMode(mode);
    setDialogOpen(true);
  };

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat("pt-BR", {
      style: "currency",
      currency: "BRL",
    }).format(value);
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case "ATIVO": return "bg-emerald-500/20 text-emerald-400 border-emerald-500/30";
      case "INATIVO": return "bg-gray-500/20 text-gray-400 border-gray-500/30";
      case "BLOQUEADO": return "bg-red-500/20 text-red-400 border-red-500/30";
      default: return "bg-gray-500/20 text-gray-400 border-gray-500/30";
    }
  };

  const getContratoLabel = (tipo: string) => {
    switch (tipo) {
      case "CLT": return "CLT";
      case "PJ": return "PJ";
      case "AUTONOMO": return "Autônomo";
      case "FREELANCER": return "Freelancer";
      default: return tipo;
    }
  };

  return (
    <div className="flex-1 space-y-4 p-4 md:p-8 pt-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">Operadores</h2>
          <p className="text-muted-foreground">
            Gerencie seus operadores e acompanhe o desempenho
          </p>
        </div>
        <Button onClick={() => handleOpenDialog(null, "create")}>
          <Plus className="mr-2 h-4 w-4" />
          Novo Operador
        </Button>
      </div>

      {/* Filtros */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-col md:flex-row gap-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Buscar por nome ou CPF..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10"
              />
            </div>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos Status</SelectItem>
                <SelectItem value="ATIVO">Ativo</SelectItem>
                <SelectItem value="INATIVO">Inativo</SelectItem>
                <SelectItem value="BLOQUEADO">Bloqueado</SelectItem>
              </SelectContent>
            </Select>
            <Select value={contratoFilter} onValueChange={setContratoFilter}>
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="Contrato" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos Contratos</SelectItem>
                <SelectItem value="CLT">CLT</SelectItem>
                <SelectItem value="PJ">PJ</SelectItem>
                <SelectItem value="AUTONOMO">Autônomo</SelectItem>
                <SelectItem value="FREELANCER">Freelancer</SelectItem>
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
        </CardContent>
      </Card>

      {/* Lista de Operadores */}
      {loading ? (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3].map((i) => (
            <Card key={i}>
              <CardContent className="pt-6">
                <Skeleton className="h-24 w-full" />
              </CardContent>
            </Card>
          ))}
        </div>
      ) : filteredOperadores.length === 0 ? (
        <Card>
          <CardContent className="pt-6">
            <div className="text-center py-10">
              <User className="mx-auto h-12 w-12 text-muted-foreground/50" />
              <h3 className="mt-4 text-lg font-semibold">Nenhum operador encontrado</h3>
              <p className="text-muted-foreground">
                {searchTerm || statusFilter !== "all" || contratoFilter !== "all"
                  ? "Tente ajustar os filtros"
                  : "Comece cadastrando seu primeiro operador"}
              </p>
            </div>
          </CardContent>
        </Card>
      ) : viewMode === "cards" ? (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {filteredOperadores.map((operador) => (
            <Card 
              key={operador.id} 
              className="cursor-pointer hover:border-primary/50 transition-colors"
              onClick={() => handleOpenDialog(operador, "view")}
            >
              <CardHeader className="pb-2">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center">
                      <User className="h-5 w-5 text-primary" />
                    </div>
                    <div>
                      <CardTitle className="text-base">{operador.nome}</CardTitle>
                      <p className="text-sm text-muted-foreground">{operador.cpf}</p>
                    </div>
                  </div>
                  <Badge className={getStatusColor(operador.status)}>
                    {operador.status}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Briefcase className="h-4 w-4" />
                    <span>{getContratoLabel(operador.tipo_contrato)}</span>
                  </div>
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Calendar className="h-4 w-4" />
                    <span>
                      Desde {format(new Date(operador.data_admissao), "dd/MM/yyyy", { locale: ptBR })}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 text-sm">
                    <DollarSign className="h-4 w-4 text-emerald-500" />
                    <span className="text-emerald-500">
                      {formatCurrency(operador.total_pago || 0)} pagos
                    </span>
                  </div>
                  {(operador.projetos_ativos || 0) > 0 && (
                    <Badge variant="outline" className="mt-2">
                      {operador.projetos_ativos} projeto(s) ativo(s)
                    </Badge>
                  )}
                </div>
                <div className="flex gap-2 mt-4 pt-4 border-t">
                  <Button 
                    variant="outline" 
                    size="sm" 
                    className="flex-1"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleOpenDialog(operador, "view");
                    }}
                  >
                    <Eye className="h-4 w-4 mr-1" />
                    Ver
                  </Button>
                  <Button 
                    variant="outline" 
                    size="sm" 
                    className="flex-1"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleOpenDialog(operador, "edit");
                    }}
                  >
                    <Edit className="h-4 w-4 mr-1" />
                    Editar
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        <Card>
          <ScrollArea className="h-[600px]">
            <div className="divide-y">
              {filteredOperadores.map((operador) => (
                <div
                  key={operador.id}
                  className="flex items-center justify-between p-4 hover:bg-muted/50 cursor-pointer"
                  onClick={() => handleOpenDialog(operador, "view")}
                >
                  <div className="flex items-center gap-4">
                    <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center">
                      <User className="h-5 w-5 text-primary" />
                    </div>
                    <div>
                      <p className="font-medium">{operador.nome}</p>
                      <p className="text-sm text-muted-foreground">{operador.cpf}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-4">
                    <div className="text-right">
                      <p className="text-sm text-muted-foreground">
                        {getContratoLabel(operador.tipo_contrato)}
                      </p>
                      <p className="text-sm text-emerald-500">
                        {formatCurrency(operador.total_pago || 0)}
                      </p>
                    </div>
                    <Badge className={getStatusColor(operador.status)}>
                      {operador.status}
                    </Badge>
                    <div className="flex gap-1">
                      <Button 
                        variant="ghost" 
                        size="icon"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleOpenDialog(operador, "view");
                        }}
                      >
                        <Eye className="h-4 w-4" />
                      </Button>
                      <Button 
                        variant="ghost" 
                        size="icon"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleOpenDialog(operador, "edit");
                        }}
                      >
                        <Edit className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </ScrollArea>
        </Card>
      )}

      <OperadorDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        operador={selectedOperador}
        mode={dialogMode}
        onSuccess={fetchOperadores}
      />
    </div>
  );
}