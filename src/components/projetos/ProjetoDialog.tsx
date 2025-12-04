import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { DatePicker } from "@/components/ui/date-picker";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { 
  FolderKanban, 
  Users, 
  DollarSign,
  Calendar,
  Plus,
  UserPlus
} from "lucide-react";
import { VincularOperadorDialog } from "@/components/projetos/VincularOperadorDialog";

interface Projeto {
  id?: string;
  nome: string;
  descricao?: string | null;
  status: string;
  data_inicio: string | null;
  data_fim_prevista: string | null;
  data_fim_real?: string | null;
  orcamento_inicial: number;
  observacoes?: string | null;
}

interface OperadorVinculado {
  id: string;
  operador_id: string;
  operador_nome: string;
  data_entrada: string;
  data_saida: string | null;
  status: string;
  funcao: string | null;
}

interface ProjetoDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projeto: Projeto | null;
  mode: "view" | "edit" | "create";
  onSuccess: () => void;
}

export function ProjetoDialog({
  open,
  onOpenChange,
  projeto,
  mode,
  onSuccess,
}: ProjetoDialogProps) {
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState("dados");
  const [operadores, setOperadores] = useState<OperadorVinculado[]>([]);
  const [vincularDialogOpen, setVincularDialogOpen] = useState(false);
  
  const [formData, setFormData] = useState<Projeto>({
    nome: "",
    descricao: null,
    status: "PLANEJADO",
    data_inicio: null,
    data_fim_prevista: null,
    data_fim_real: null,
    orcamento_inicial: 0,
    observacoes: null,
  });

  useEffect(() => {
    if (open) {
      if (projeto && mode !== "create") {
        setFormData({
          ...projeto,
          descricao: projeto.descricao || null,
          data_inicio: projeto.data_inicio || null,
          data_fim_prevista: projeto.data_fim_prevista || null,
          data_fim_real: projeto.data_fim_real || null,
          observacoes: projeto.observacoes || null,
        });
        if (projeto.id) {
          fetchOperadoresProjeto(projeto.id);
        }
      } else {
        setFormData({
          nome: "",
          descricao: null,
          status: "PLANEJADO",
          data_inicio: null,
          data_fim_prevista: null,
          data_fim_real: null,
          orcamento_inicial: 0,
          observacoes: null,
        });
        setOperadores([]);
      }
      setActiveTab("dados");
    }
  }, [open, projeto, mode]);

  const fetchOperadoresProjeto = async (projetoId: string) => {
    const { data, error } = await supabase
      .from("operador_projetos")
      .select(`
        id,
        operador_id,
        data_entrada,
        data_saida,
        status,
        funcao,
        operadores!inner(nome)
      `)
      .eq("projeto_id", projetoId)
      .order("data_entrada", { ascending: false });

    if (!error && data) {
      setOperadores(
        data.map((op: any) => ({
          id: op.id,
          operador_id: op.operador_id,
          operador_nome: op.operadores?.nome || "N/A",
          data_entrada: op.data_entrada,
          data_saida: op.data_saida,
          status: op.status,
          funcao: op.funcao,
        }))
      );
    }
  };

  const handleSave = async () => {
    if (!formData.nome.trim()) {
      toast.error("Nome é obrigatório");
      return;
    }

    setLoading(true);
    try {
      const { data: session } = await supabase.auth.getSession();
      if (!session.session) {
        toast.error("Usuário não autenticado");
        return;
      }

      const payload = {
        nome: formData.nome.trim(),
        descricao: formData.descricao || null,
        status: formData.status,
        data_inicio: formData.data_inicio || null,
        data_fim_prevista: formData.data_fim_prevista || null,
        data_fim_real: formData.data_fim_real || null,
        orcamento_inicial: formData.orcamento_inicial || 0,
        observacoes: formData.observacoes || null,
        user_id: session.session.user.id,
      };

      if (mode === "create") {
        const { error } = await supabase.from("projetos").insert(payload);
        if (error) throw error;
        toast.success("Projeto criado com sucesso");
      } else {
        const { error } = await supabase
          .from("projetos")
          .update(payload)
          .eq("id", projeto!.id);
        if (error) throw error;
        toast.success("Projeto atualizado com sucesso");
      }

      onSuccess();
      onOpenChange(false);
    } catch (error: any) {
      toast.error("Erro ao salvar: " + error.message);
    } finally {
      setLoading(false);
    }
  };

  const handleDesvincularOperador = async (vinculoId: string) => {
    try {
      const { error } = await supabase
        .from("operador_projetos")
        .update({ 
          status: "FINALIZADO",
          data_saida: new Date().toISOString().split("T")[0]
        })
        .eq("id", vinculoId);

      if (error) throw error;
      toast.success("Operador desvinculado do projeto");
      if (projeto?.id) {
        fetchOperadoresProjeto(projeto.id);
      }
    } catch (error: any) {
      toast.error("Erro ao desvincular: " + error.message);
    }
  };

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat("pt-BR", {
      style: "currency",
      currency: "BRL",
    }).format(value);
  };

  const getStatusLabel = (status: string) => {
    switch (status) {
      case "PLANEJADO": return "Planejado";
      case "EM_ANDAMENTO": return "Em Andamento";
      case "PAUSADO": return "Pausado";
      case "FINALIZADO": return "Finalizado";
      default: return status;
    }
  };

  const isViewMode = mode === "view";

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-3xl max-h-[90vh]">
          <DialogHeader>
            <DialogTitle>
              {mode === "create" 
                ? "Novo Projeto" 
                : mode === "edit" 
                  ? "Editar Projeto" 
                  : "Detalhes do Projeto"}
            </DialogTitle>
          </DialogHeader>

          <Tabs value={activeTab} onValueChange={setActiveTab}>
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="dados">
                <FolderKanban className="h-4 w-4 mr-2" />
                Dados
              </TabsTrigger>
              <TabsTrigger value="operadores" disabled={mode === "create"}>
                <Users className="h-4 w-4 mr-2" />
                Operadores
              </TabsTrigger>
            </TabsList>

            <ScrollArea className="h-[500px] mt-4">
              <TabsContent value="dados" className="space-y-4 px-1">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Nome *</Label>
                    <Input
                      value={formData.nome}
                      onChange={(e) => setFormData({ ...formData, nome: e.target.value })}
                      disabled={isViewMode}
                      placeholder="Nome do projeto"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Status</Label>
                    <Select
                      value={formData.status}
                      onValueChange={(value) => setFormData({ ...formData, status: value })}
                      disabled={isViewMode}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="PLANEJADO">Planejado</SelectItem>
                        <SelectItem value="EM_ANDAMENTO">Em Andamento</SelectItem>
                        <SelectItem value="PAUSADO">Pausado</SelectItem>
                        <SelectItem value="FINALIZADO">Finalizado</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="space-y-2">
                  <Label>Descrição</Label>
                  <Textarea
                    value={formData.descricao || ""}
                    onChange={(e) => setFormData({ ...formData, descricao: e.target.value || null })}
                    disabled={isViewMode}
                    placeholder="Descrição do projeto..."
                    rows={3}
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Data de Início</Label>
                    <DatePicker
                      value={formData.data_inicio || ""}
                      onChange={(date) => setFormData({ ...formData, data_inicio: date })}
                      disabled={isViewMode}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Data de Fim Prevista</Label>
                    <DatePicker
                      value={formData.data_fim_prevista || ""}
                      onChange={(date) => setFormData({ ...formData, data_fim_prevista: date })}
                      disabled={isViewMode}
                    />
                  </div>
                </div>

                {formData.status === "FINALIZADO" && (
                  <div className="space-y-2">
                    <Label>Data de Fim Real</Label>
                    <DatePicker
                      value={formData.data_fim_real || ""}
                      onChange={(date) => setFormData({ ...formData, data_fim_real: date })}
                      disabled={isViewMode}
                    />
                  </div>
                )}

                <div className="space-y-2">
                  <Label>Orçamento Inicial</Label>
                  <Input
                    type="number"
                    value={formData.orcamento_inicial}
                    onChange={(e) => setFormData({ ...formData, orcamento_inicial: parseFloat(e.target.value) || 0 })}
                    disabled={isViewMode}
                    placeholder="0.00"
                  />
                </div>

                <div className="space-y-2">
                  <Label>Observações</Label>
                  <Textarea
                    value={formData.observacoes || ""}
                    onChange={(e) => setFormData({ ...formData, observacoes: e.target.value || null })}
                    disabled={isViewMode}
                    placeholder="Observações sobre o projeto..."
                    rows={3}
                  />
                </div>
              </TabsContent>

              <TabsContent value="operadores" className="space-y-4 px-1">
                <div className="flex justify-between items-center">
                  <h3 className="text-lg font-medium">Operadores Vinculados</h3>
                  {!isViewMode && (
                    <Button 
                      size="sm"
                      onClick={() => setVincularDialogOpen(true)}
                    >
                      <UserPlus className="h-4 w-4 mr-2" />
                      Vincular Operador
                    </Button>
                  )}
                </div>

                {operadores.length === 0 ? (
                  <Card>
                    <CardContent className="pt-6">
                      <div className="text-center py-8">
                        <Users className="mx-auto h-12 w-12 text-muted-foreground/50" />
                        <p className="mt-4 text-muted-foreground">
                          Nenhum operador vinculado a este projeto
                        </p>
                      </div>
                    </CardContent>
                  </Card>
                ) : (
                  <div className="space-y-3">
                    {operadores.map((operador) => (
                      <Card key={operador.id}>
                        <CardContent className="pt-4">
                          <div className="flex items-center justify-between">
                            <div>
                              <p className="font-medium">{operador.operador_nome}</p>
                              {operador.funcao && (
                                <p className="text-sm text-muted-foreground">{operador.funcao}</p>
                              )}
                            </div>
                            <div className="flex items-center gap-2">
                              <Badge 
                                className={
                                  operador.status === "ATIVO" 
                                    ? "bg-emerald-500/20 text-emerald-400" 
                                    : "bg-gray-500/20 text-gray-400"
                                }
                              >
                                {operador.status}
                              </Badge>
                              {!isViewMode && operador.status === "ATIVO" && (
                                <Button 
                                  variant="outline" 
                                  size="sm"
                                  onClick={() => handleDesvincularOperador(operador.id)}
                                >
                                  Desvincular
                                </Button>
                              )}
                            </div>
                          </div>
                          <div className="flex items-center gap-4 mt-2 text-sm text-muted-foreground">
                            <div className="flex items-center gap-1">
                              <Calendar className="h-3 w-3" />
                              <span>
                                Desde {format(new Date(operador.data_entrada), "dd/MM/yyyy", { locale: ptBR })}
                              </span>
                            </div>
                            {operador.data_saida && (
                              <span>
                                até {format(new Date(operador.data_saida), "dd/MM/yyyy", { locale: ptBR })}
                              </span>
                            )}
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                )}
              </TabsContent>
            </ScrollArea>
          </Tabs>

          {!isViewMode && (
            <div className="flex justify-end gap-2 mt-4">
              <Button variant="outline" onClick={() => onOpenChange(false)}>
                Cancelar
              </Button>
              <Button onClick={handleSave} disabled={loading}>
                {loading ? "Salvando..." : mode === "create" ? "Criar Projeto" : "Salvar Alterações"}
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {projeto?.id && (
        <VincularOperadorDialog
          open={vincularDialogOpen}
          onOpenChange={setVincularDialogOpen}
          projetoId={projeto.id}
          onSuccess={() => {
            fetchOperadoresProjeto(projeto.id!);
          }}
        />
      )}
    </>
  );
}