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
import { validateCPF, formatCPF } from "@/lib/validators";
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
  User, 
  Calendar, 
  Briefcase, 
  DollarSign, 
  FolderKanban,
  Plus,
  Wallet,
  Gift,
  Banknote,
  ArrowUpDown,
  ReceiptText,
  Mail,
  Phone
} from "lucide-react";
import { PagamentoOperadorDialog } from "./PagamentoOperadorDialog";
import { VincularProjetoDialog } from "./VincularProjetoDialog";

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

interface OperadorProjeto {
  id: string;
  projeto_id: string;
  projeto_nome: string;
  data_entrada: string;
  data_saida: string | null;
  status: string;
  funcao: string | null;
  modelo_pagamento: string;
  valor_fixo: number;
  percentual: number;
  base_calculo: string;
}

const MODELOS_PAGAMENTO_LABELS: Record<string, string> = {
  FIXO_MENSAL: "Fixo Mensal",
  PORCENTAGEM: "Porcentagem",
  HIBRIDO: "Híbrido",
  POR_ENTREGA: "Por Entrega",
  COMISSAO_ESCALONADA: "Comissão Escalonada",
};

const BASES_CALCULO_LABELS: Record<string, string> = {
  LUCRO_PROJETO: "Lucro do Projeto",
  FATURAMENTO_PROJETO: "Faturamento do Projeto",
  RESULTADO_OPERACAO: "Resultado da Operação",
};

interface PagamentoOperadorDisplay {
  id: string;
  tipo_pagamento: string;
  valor: number;
  moeda: string;
  data_pagamento: string;
  descricao: string | null;
  status: string;
  projeto_nome?: string | null;
  operador_id: string;
  projeto_id: string | null;
  data_competencia: string | null;
}

interface OperadorDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  operador: OperadorWorkspace | null;
  mode: "view" | "edit";
  onSuccess: () => void;
}

interface ProfileFormData {
  full_name: string;
  cpf: string;
  telefone: string;
  data_nascimento: string | null;
  tipo_contrato: string;
  data_admissao: string | null;
  data_desligamento: string | null;
  observacoes_operador: string;
}

export function OperadorDialog({
  open,
  onOpenChange,
  operador,
  mode,
  onSuccess,
}: OperadorDialogProps) {
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState("dados");
  const [projetos, setProjetos] = useState<OperadorProjeto[]>([]);
  const [pagamentos, setPagamentos] = useState<PagamentoOperadorDisplay[]>([]);
  const [cpfError, setCpfError] = useState<string | null>(null);
  const [pagamentoDialogOpen, setPagamentoDialogOpen] = useState(false);
  const [vincularProjetoDialogOpen, setVincularProjetoDialogOpen] = useState(false);
  const [selectedPagamentoEdit, setSelectedPagamentoEdit] = useState<PagamentoOperadorDisplay | null>(null);
  
  const [formData, setFormData] = useState<ProfileFormData>({
    full_name: "",
    cpf: "",
    telefone: "",
    data_nascimento: null,
    tipo_contrato: "FREELANCER",
    data_admissao: null,
    data_desligamento: null,
    observacoes_operador: "",
  });

  useEffect(() => {
    if (open && operador) {
      setFormData({
        full_name: operador.nome || "",
        cpf: operador.cpf || "",
        telefone: operador.telefone || "",
        data_nascimento: operador.data_nascimento || null,
        tipo_contrato: operador.tipo_contrato || "FREELANCER",
        data_admissao: operador.data_admissao || null,
        data_desligamento: operador.data_desligamento || null,
        observacoes_operador: operador.observacoes || "",
      });
      
      if (operador.operador_id) {
        fetchProjetosOperador(operador.operador_id);
        fetchPagamentosOperador(operador.operador_id);
      } else {
        setProjetos([]);
        setPagamentos([]);
      }
      
      setActiveTab("dados");
      setCpfError(null);
    }
  }, [open, operador]);

  const fetchProjetosOperador = async (operadorId: string) => {
    const { data, error } = await supabase
      .from("operador_projetos")
      .select(`
        id,
        projeto_id,
        data_entrada,
        data_saida,
        status,
        funcao,
        modelo_pagamento,
        valor_fixo,
        percentual,
        base_calculo,
        projetos!inner(nome)
      `)
      .eq("operador_id", operadorId)
      .order("data_entrada", { ascending: false });

    if (!error && data) {
      setProjetos(
        data.map((p: any) => ({
          id: p.id,
          projeto_id: p.projeto_id,
          projeto_nome: p.projetos?.nome || "N/A",
          data_entrada: p.data_entrada,
          data_saida: p.data_saida,
          status: p.status,
          funcao: p.funcao,
          modelo_pagamento: p.modelo_pagamento,
          valor_fixo: p.valor_fixo || 0,
          percentual: p.percentual || 0,
          base_calculo: p.base_calculo,
        }))
      );
    }
  };

  const fetchPagamentosOperador = async (operadorId: string) => {
    const { data, error } = await supabase
      .from("pagamentos_operador")
      .select(`
        id,
        operador_id,
        projeto_id,
        tipo_pagamento,
        valor,
        moeda,
        data_pagamento,
        data_competencia,
        descricao,
        status,
        projetos(nome)
      `)
      .eq("operador_id", operadorId)
      .order("data_pagamento", { ascending: false });

    if (!error && data) {
      setPagamentos(
        data.map((p: any) => ({
          ...p,
          projeto_nome: p.projetos?.nome || null,
        }))
      );
    }
  };

  const validateCPFInput = async (cpf: string) => {
    if (!cpf || cpf.length < 11) return;
    
    const cleanCPF = cpf.replace(/\D/g, "");
    if (!validateCPF(cleanCPF)) {
      setCpfError("CPF inválido");
      return;
    }

    // Check uniqueness in profiles (excluding current user)
    const { data } = await supabase
      .from("profiles")
      .select("id")
      .eq("cpf", cleanCPF)
      .neq("id", operador?.profile_id || "");

    if (data && data.length > 0) {
      setCpfError("CPF já cadastrado");
    } else {
      setCpfError(null);
    }
  };

  const handleSave = async () => {
    if (!operador) return;
    
    if (!formData.full_name.trim()) {
      toast.error("Nome é obrigatório");
      return;
    }
    if (formData.cpf && cpfError) {
      toast.error(cpfError);
      return;
    }

    setLoading(true);
    try {
      const cleanCPF = formData.cpf ? formData.cpf.replace(/\D/g, "") : null;
      
      // Update profile with operator data
      const { error } = await supabase
        .from("profiles")
        .update({
          full_name: formData.full_name.trim(),
          cpf: cleanCPF,
          telefone: formData.telefone || null,
          data_nascimento: formData.data_nascimento || null,
          tipo_contrato: formData.tipo_contrato,
          data_admissao: formData.data_admissao || null,
          data_desligamento: formData.data_desligamento || null,
          observacoes_operador: formData.observacoes_operador || null,
        })
        .eq("id", operador.profile_id);

      if (error) throw error;
      
      toast.success("Dados do operador atualizados");
      onSuccess();
      onOpenChange(false);
    } catch (error: any) {
      if (error.code === "23505") {
        toast.error("CPF já cadastrado para outro usuário");
      } else {
        toast.error("Erro ao salvar: " + error.message);
      }
    } finally {
      setLoading(false);
    }
  };

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat("pt-BR", {
      style: "currency",
      currency: "BRL",
    }).format(value);
  };

  const getTipoPagamentoLabel = (tipo: string) => {
    const labels: Record<string, string> = {
      SALARIO: "Salário",
      COMISSAO: "Comissão",
      BONUS: "Bônus",
      ADIANTAMENTO: "Adiantamento",
      REEMBOLSO: "Reembolso",
      OUTROS: "Outros",
    };
    return labels[tipo] || tipo;
  };

  const getStatusPagamentoColor = (status: string) => {
    switch (status) {
      case "CONFIRMADO": return "bg-emerald-500/20 text-emerald-400";
      case "PENDENTE": return "bg-yellow-500/20 text-yellow-400";
      case "CANCELADO": return "bg-red-500/20 text-red-400";
      default: return "bg-gray-500/20 text-gray-400";
    }
  };

  const getTipoPagamentoIcon = (tipo: string) => {
    switch (tipo) {
      case "SALARIO": return <Wallet className="h-4 w-4" />;
      case "COMISSAO": return <DollarSign className="h-4 w-4" />;
      case "BONUS": return <Gift className="h-4 w-4" />;
      case "ADIANTAMENTO": return <ArrowUpDown className="h-4 w-4" />;
      case "REEMBOLSO": return <ReceiptText className="h-4 w-4" />;
      default: return <Banknote className="h-4 w-4" />;
    }
  };

  const getBreakdownByTipo = () => {
    const breakdown: Record<string, number> = {};
    pagamentos
      .filter(p => p.status === "CONFIRMADO")
      .forEach(p => {
        breakdown[p.tipo_pagamento] = (breakdown[p.tipo_pagamento] || 0) + p.valor;
      });
    return breakdown;
  };

  const breakdown = getBreakdownByTipo();
  const isViewMode = mode === "view";

  if (!operador) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh]">
        <DialogHeader>
          <DialogTitle>
            {mode === "edit" ? "Editar Operador" : "Detalhes do Operador"}
          </DialogTitle>
        </DialogHeader>

        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="dados">
              <User className="h-4 w-4 mr-2" />
              Dados
            </TabsTrigger>
            <TabsTrigger value="projetos">
              <FolderKanban className="h-4 w-4 mr-2" />
              Projetos
            </TabsTrigger>
            <TabsTrigger value="financeiro">
              <DollarSign className="h-4 w-4 mr-2" />
              Financeiro
            </TabsTrigger>
          </TabsList>

          <ScrollArea className="h-[500px] mt-4">
            <TabsContent value="dados" className="space-y-4 px-1">
              {/* Email (readonly) */}
              <div className="space-y-2">
                <Label className="flex items-center gap-2">
                  <Mail className="h-4 w-4" />
                  Email
                </Label>
                <Input
                  value={operador.email || ""}
                  disabled
                  className="bg-muted"
                />
                <p className="text-xs text-muted-foreground">
                  O email é vinculado à conta do usuário e não pode ser alterado aqui
                </p>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Nome Completo *</Label>
                  <Input
                    value={formData.full_name}
                    onChange={(e) => setFormData({ ...formData, full_name: e.target.value.toUpperCase() })}
                    disabled={isViewMode}
                    placeholder="Nome completo"
                    className="uppercase"
                  />
                </div>
                <div className="space-y-2">
                  <Label>CPF</Label>
                  <Input
                    value={formatCPF(formData.cpf)}
                    onChange={(e) => {
                      const value = e.target.value.replace(/\D/g, "").slice(0, 11);
                      setFormData({ ...formData, cpf: value });
                      validateCPFInput(value);
                    }}
                    disabled={isViewMode}
                    placeholder="000.000.000-00"
                    className={cpfError ? "border-red-500" : ""}
                  />
                  {cpfError && <p className="text-sm text-red-500">{cpfError}</p>}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label className="flex items-center gap-2">
                    <Phone className="h-4 w-4" />
                    Telefone
                  </Label>
                  <Input
                    value={formData.telefone}
                    onChange={(e) => setFormData({ ...formData, telefone: e.target.value })}
                    disabled={isViewMode}
                    placeholder="(00) 00000-0000"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Data de Nascimento</Label>
                  <DatePicker
                    value={formData.data_nascimento || ""}
                    onChange={(date) => setFormData({ ...formData, data_nascimento: date })}
                    disabled={isViewMode}
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Tipo de Contrato</Label>
                  <Select
                    value={formData.tipo_contrato}
                    onValueChange={(value) => setFormData({ ...formData, tipo_contrato: value })}
                    disabled={isViewMode}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="CLT">CLT</SelectItem>
                      <SelectItem value="PJ">PJ</SelectItem>
                      <SelectItem value="AUTONOMO">Autônomo</SelectItem>
                      <SelectItem value="FREELANCER">Freelancer</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Data de Admissão</Label>
                  <DatePicker
                    value={formData.data_admissao || ""}
                    onChange={(date) => setFormData({ ...formData, data_admissao: date })}
                    disabled={isViewMode}
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label>Observações</Label>
                <Textarea
                  value={formData.observacoes_operador}
                  onChange={(e) => setFormData({ ...formData, observacoes_operador: e.target.value })}
                  disabled={isViewMode}
                  placeholder="Observações sobre o operador..."
                  rows={3}
                />
              </div>

              {!isViewMode && (
                <div className="flex justify-end gap-2 pt-4">
                  <Button variant="outline" onClick={() => onOpenChange(false)}>
                    Cancelar
                  </Button>
                  <Button onClick={handleSave} disabled={loading}>
                    {loading ? "Salvando..." : "Salvar"}
                  </Button>
                </div>
              )}
            </TabsContent>

            <TabsContent value="projetos" className="space-y-4 px-1">
              <div className="flex justify-between items-center">
                <h3 className="font-semibold">Projetos Vinculados</h3>
                {operador.operador_id && (
                  <Button 
                    size="sm" 
                    onClick={() => setVincularProjetoDialogOpen(true)}
                  >
                    <Plus className="h-4 w-4 mr-1" />
                    Vincular Projeto
                  </Button>
                )}
              </div>

              {!operador.operador_id ? (
                <Card>
                  <CardContent className="py-8 text-center">
                    <FolderKanban className="mx-auto h-12 w-12 text-muted-foreground/50" />
                    <p className="mt-4 text-muted-foreground">
                      Este operador ainda não possui um registro de operador vinculado.
                      Vincule-o a um projeto para criar o registro automaticamente.
                    </p>
                  </CardContent>
                </Card>
              ) : projetos.length === 0 ? (
                <Card>
                  <CardContent className="py-8 text-center">
                    <FolderKanban className="mx-auto h-12 w-12 text-muted-foreground/50" />
                    <p className="mt-4 text-muted-foreground">
                      Nenhum projeto vinculado
                    </p>
                  </CardContent>
                </Card>
              ) : (
                <div className="space-y-3">
                  {projetos.map((projeto) => (
                    <Card key={projeto.id}>
                      <CardContent className="py-4">
                        <div className="flex items-center justify-between">
                          <div>
                            <p className="font-medium">{projeto.projeto_nome}</p>
                            <div className="flex items-center gap-4 mt-1 text-sm text-muted-foreground">
                              <span className="flex items-center gap-1">
                                <Calendar className="h-3 w-3" />
                                {format(new Date(projeto.data_entrada), "dd/MM/yyyy", { locale: ptBR })}
                              </span>
                              <span>{MODELOS_PAGAMENTO_LABELS[projeto.modelo_pagamento] || projeto.modelo_pagamento}</span>
                            </div>
                          </div>
                          <Badge className={
                            projeto.status === "ATIVO" 
                              ? "bg-emerald-500/20 text-emerald-400" 
                              : "bg-gray-500/20 text-gray-400"
                          }>
                            {projeto.status}
                          </Badge>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}
            </TabsContent>

            <TabsContent value="financeiro" className="space-y-4 px-1">
              {/* Resumo Financeiro */}
              <div className="grid grid-cols-3 gap-4">
                <Card>
                  <CardContent className="pt-4">
                    <p className="text-sm text-muted-foreground">Total Pago</p>
                    <p className="text-2xl font-bold text-emerald-500">
                      {formatCurrency(operador.total_pago || 0)}
                    </p>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="pt-4">
                    <p className="text-sm text-muted-foreground">Pendente</p>
                    <p className="text-2xl font-bold text-yellow-500">
                      {formatCurrency(operador.total_pendente || 0)}
                    </p>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="pt-4">
                    <p className="text-sm text-muted-foreground">Projetos Ativos</p>
                    <p className="text-2xl font-bold">{operador.projetos_ativos || 0}</p>
                  </CardContent>
                </Card>
              </div>

              {/* Breakdown por tipo */}
              {Object.keys(breakdown).length > 0 && (
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm">Distribuição por Tipo</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-2 gap-2">
                      {Object.entries(breakdown).map(([tipo, valor]) => (
                        <div key={tipo} className="flex items-center justify-between p-2 bg-muted/50 rounded">
                          <div className="flex items-center gap-2">
                            {getTipoPagamentoIcon(tipo)}
                            <span className="text-sm">{getTipoPagamentoLabel(tipo)}</span>
                          </div>
                          <span className="font-medium">{formatCurrency(valor)}</span>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* Histórico de Pagamentos */}
              <div className="flex justify-between items-center">
                <h3 className="font-semibold">Histórico de Pagamentos</h3>
                {operador.operador_id && (
                  <Button 
                    size="sm" 
                    onClick={() => {
                      setSelectedPagamentoEdit(null);
                      setPagamentoDialogOpen(true);
                    }}
                  >
                    <Plus className="h-4 w-4 mr-1" />
                    Novo Pagamento
                  </Button>
                )}
              </div>

              {pagamentos.length === 0 ? (
                <Card>
                  <CardContent className="py-8 text-center">
                    <DollarSign className="mx-auto h-12 w-12 text-muted-foreground/50" />
                    <p className="mt-4 text-muted-foreground">
                      Nenhum pagamento registrado
                    </p>
                  </CardContent>
                </Card>
              ) : (
                <div className="space-y-2">
                  {pagamentos.map((pagamento) => (
                    <Card 
                      key={pagamento.id} 
                      className="cursor-pointer hover:border-primary/50 transition-colors"
                      onClick={() => {
                        setSelectedPagamentoEdit(pagamento);
                        setPagamentoDialogOpen(true);
                      }}
                    >
                      <CardContent className="py-3">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-3">
                            <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center">
                              {getTipoPagamentoIcon(pagamento.tipo_pagamento)}
                            </div>
                            <div>
                              <p className="font-medium">{getTipoPagamentoLabel(pagamento.tipo_pagamento)}</p>
                              <p className="text-sm text-muted-foreground">
                                {format(new Date(pagamento.data_pagamento), "dd/MM/yyyy", { locale: ptBR })}
                                {pagamento.projeto_nome && ` • ${pagamento.projeto_nome}`}
                              </p>
                            </div>
                          </div>
                          <div className="flex items-center gap-3">
                            <span className="font-bold">{formatCurrency(pagamento.valor)}</span>
                            <Badge className={getStatusPagamentoColor(pagamento.status)}>
                              {pagamento.status}
                            </Badge>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}
            </TabsContent>
          </ScrollArea>
        </Tabs>
      </DialogContent>

      {/* Dialogs auxiliares */}
      {operador.operador_id && (
        <>
          <PagamentoOperadorDialog
            open={pagamentoDialogOpen}
            onOpenChange={setPagamentoDialogOpen}
            defaultOperadorId={operador.operador_id}
            pagamento={selectedPagamentoEdit ? {
              id: selectedPagamentoEdit.id,
              operador_id: selectedPagamentoEdit.operador_id,
              projeto_id: selectedPagamentoEdit.projeto_id,
              tipo_pagamento: selectedPagamentoEdit.tipo_pagamento,
              valor: selectedPagamentoEdit.valor,
              moeda: selectedPagamentoEdit.moeda,
              data_pagamento: selectedPagamentoEdit.data_pagamento,
              data_competencia: selectedPagamentoEdit.data_competencia,
              descricao: selectedPagamentoEdit.descricao,
              status: selectedPagamentoEdit.status,
            } : undefined}
            onSuccess={() => {
              fetchPagamentosOperador(operador.operador_id!);
              onSuccess();
            }}
          />
          <VincularProjetoDialog
            open={vincularProjetoDialogOpen}
            onOpenChange={setVincularProjetoDialogOpen}
            operadorId={operador.operador_id}
            onSuccess={() => fetchProjetosOperador(operador.operador_id!)}
          />
        </>
      )}
    </Dialog>
  );
}
