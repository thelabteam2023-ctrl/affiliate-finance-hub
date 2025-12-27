import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { PageHeader } from "@/components/PageHeader";
import { 
  Search, 
  User, 
  Calendar, 
  Briefcase, 
  DollarSign,
  LayoutGrid,
  List,
  Edit,
  Eye,
  BarChart3,
  Users,
  UserPlus,
  AlertTriangle
} from "lucide-react";
import { OperadorDialog } from "@/components/operadores/OperadorDialog";
import { OperadorDashboard } from "@/components/operadores/OperadorDashboard";
import { InviteMemberDialog } from "@/components/workspace/InviteMemberDialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { useWorkspace } from "@/hooks/useWorkspace";
import { useActionAccess } from "@/hooks/useModuleAccess";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

interface OperadorWorkspace {
  workspace_member_id: string;
  workspace_id: string;
  user_id: string;
  role: string;
  is_active: boolean;
  joined_at: string | null;
  profile_id: string;
  email: string | null;
  nome: string | null;
  cpf: string | null;
  telefone: string | null;
  data_nascimento: string | null;
  tipo_contrato: string | null;
  data_admissao: string | null;
  data_desligamento: string | null;
  observacoes: string | null;
  operador_id: string | null;
  projetos_ativos: number;
  total_pago: number;
  total_pendente: number;
}

interface LegacyOperador {
  id: string;
  nome: string;
  cpf: string;
  email: string | null;
  status: string;
  tipo_contrato: string;
  data_admissao: string;
}

export default function GestaoOperadores() {
  const { workspace } = useWorkspace();
  const { canCreate, canEdit } = useActionAccess();
  const [operadores, setOperadores] = useState<OperadorWorkspace[]>([]);
  const [legacyOperadores, setLegacyOperadores] = useState<LegacyOperador[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [contratoFilter, setContratoFilter] = useState<string>("all");
  const [viewMode, setViewMode] = useState<"cards" | "list">("cards");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [inviteDialogOpen, setInviteDialogOpen] = useState(false);
  const [selectedOperador, setSelectedOperador] = useState<OperadorWorkspace | null>(null);
  const [dialogMode, setDialogMode] = useState<"view" | "edit">("view");
  const [activeTab, setActiveTab] = useState("lista");

  useEffect(() => {
    if (workspace?.id) {
      fetchOperadores();
      fetchLegacyOperadores();
    }
  }, [workspace?.id]);

  const fetchOperadores = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from("v_operadores_workspace")
        .select("*")
        .eq("workspace_id", workspace?.id);

      if (error) throw error;
      setOperadores(data || []);
    } catch (error: any) {
      toast.error("Erro ao carregar operadores: " + error.message);
    } finally {
      setLoading(false);
    }
  };

  const fetchLegacyOperadores = async () => {
    try {
      // Buscar operadores legados (sem auth_user_id vinculado)
      const { data, error } = await supabase
        .from("operadores")
        .select("id, nome, cpf, email, status, tipo_contrato, data_admissao")
        .is("auth_user_id", null)
        .eq("workspace_id", workspace?.id);

      if (error) throw error;
      setLegacyOperadores(data || []);
    } catch (error: any) {
      console.error("Erro ao carregar operadores legados:", error);
    }
  };

  const filteredOperadores = operadores.filter((op) => {
    const nome = op.nome || "";
    const cpf = op.cpf || "";
    const matchesSearch = 
      nome.toLowerCase().includes(searchTerm.toLowerCase()) ||
      cpf.includes(searchTerm);
    const matchesContrato = contratoFilter === "all" || op.tipo_contrato === contratoFilter;
    return matchesSearch && matchesContrato;
  });

  const handleOpenDialog = (operador: OperadorWorkspace, mode: "view" | "edit") => {
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

  const getContratoLabel = (tipo: string | null) => {
    if (!tipo) return "Não definido";
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
      <PageHeader
        title="Operadores"
        description="Gerencie os operadores vinculados ao workspace"
        pagePath="/operadores"
        pageIcon="Briefcase"
        actions={
          canCreate('operadores', 'operadores.create') && (
            <Button onClick={() => setInviteDialogOpen(true)}>
              <UserPlus className="mr-2 h-4 w-4" />
              Convidar Operador
            </Button>
          )
        }
      />

      {/* Alerta de operadores legados pendentes de migração */}
      {legacyOperadores.length > 0 && (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Operadores pendentes de migração</AlertTitle>
          <AlertDescription>
            Existem {legacyOperadores.length} operador(es) cadastrados no modelo antigo que precisam ser migrados. 
            Convide-os como usuários do workspace para vincular seus dados.
            <div className="mt-2 flex flex-wrap gap-2">
              {legacyOperadores.slice(0, 5).map((op) => (
                <Badge key={op.id} variant="outline" className="text-destructive border-destructive">
                  {op.nome}
                </Badge>
              ))}
              {legacyOperadores.length > 5 && (
                <Badge variant="outline">+{legacyOperadores.length - 5} mais</Badge>
              )}
            </div>
          </AlertDescription>
        </Alert>
      )}

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="lista" className="flex items-center gap-2">
            <Users className="h-4 w-4" />
            Lista
          </TabsTrigger>
          <TabsTrigger value="dashboard" className="flex items-center gap-2">
            <BarChart3 className="h-4 w-4" />
            Dashboard
          </TabsTrigger>
        </TabsList>

        <TabsContent value="lista" className="space-y-4">
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
                    {searchTerm || contratoFilter !== "all"
                      ? "Tente ajustar os filtros"
                      : "Convide um membro com função de Operador via Workspace"}
                  </p>
                  <Button 
                    className="mt-4" 
                    onClick={() => setInviteDialogOpen(true)}
                  >
                    <UserPlus className="mr-2 h-4 w-4" />
                    Convidar Operador
                  </Button>
                </div>
              </CardContent>
            </Card>
          ) : viewMode === "cards" ? (
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {filteredOperadores.map((operador) => (
                <Card 
                  key={operador.workspace_member_id} 
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
                          <CardTitle className="text-base">{operador.nome || "Sem nome"}</CardTitle>
                          <p className="text-sm text-muted-foreground">{operador.email}</p>
                        </div>
                      </div>
                      <Badge className="bg-emerald-500/20 text-emerald-400 border-emerald-500/30">
                        ATIVO
                      </Badge>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-3">
                      <div className="flex items-center gap-2 text-sm text-muted-foreground">
                        <Briefcase className="h-4 w-4" />
                        <span>{getContratoLabel(operador.tipo_contrato)}</span>
                      </div>
                      {operador.data_admissao && (
                        <div className="flex items-center gap-2 text-sm text-muted-foreground">
                          <Calendar className="h-4 w-4" />
                          <span>
                            Desde {format(new Date(operador.data_admissao), "dd/MM/yyyy", { locale: ptBR })}
                          </span>
                        </div>
                      )}
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
                      {canEdit('operadores', 'operadores.edit') && (
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
                      )}
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
                      key={operador.workspace_member_id}
                      className="flex items-center justify-between p-4 hover:bg-muted/50 cursor-pointer"
                      onClick={() => handleOpenDialog(operador, "view")}
                    >
                      <div className="flex items-center gap-4">
                        <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center">
                          <User className="h-5 w-5 text-primary" />
                        </div>
                        <div>
                          <p className="font-medium">{operador.nome || "Sem nome"}</p>
                          <p className="text-sm text-muted-foreground">{operador.email}</p>
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
                        <Badge className="bg-emerald-500/20 text-emerald-400 border-emerald-500/30">
                          ATIVO
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
                          {canEdit('operadores', 'operadores.edit') && (
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
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </ScrollArea>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="dashboard">
          <OperadorDashboard />
        </TabsContent>
      </Tabs>

      {/* Dialog de detalhes/edição do operador */}
      <OperadorDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        operador={selectedOperador}
        mode={dialogMode}
        onSuccess={fetchOperadores}
      />

      {/* Dialog para convidar novo operador */}
      {workspace?.id && (
        <InviteMemberDialog
          open={inviteDialogOpen}
          onOpenChange={setInviteDialogOpen}
          workspaceId={workspace.id}
          onMemberInvited={() => {
            fetchOperadores();
            setInviteDialogOpen(false);
          }}
        />
      )}
    </div>
  );
}
