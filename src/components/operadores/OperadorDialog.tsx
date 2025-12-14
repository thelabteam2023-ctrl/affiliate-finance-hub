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
  Clock,
  CheckCircle,
  AlertCircle,
  Plus,
  Wallet,
  Gift,
  Banknote,
  ArrowUpDown,
  ReceiptText
} from "lucide-react";
import { PagamentoOperadorDialog } from "./PagamentoOperadorDialog";
import { VincularProjetoDialog } from "./VincularProjetoDialog";

interface Operador {
  id?: string;
  nome: string;
  cpf: string;
  email?: string | null;
  telefone?: string | null;
  status: string;
  tipo_contrato: string;
  data_admissao: string;
  data_nascimento?: string | null;
  data_desligamento?: string | null;
  observacoes?: string | null;
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

interface PagamentoOperador {
  id: string;
  tipo_pagamento: string;
  valor: number;
  moeda: string;
  data_pagamento: string;
  descricao: string | null;
  status: string;
  projeto_nome?: string | null;
}

interface OperadorDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  operador: Operador | null;
  mode: "view" | "edit" | "create";
  onSuccess: () => void;
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
  const [pagamentos, setPagamentos] = useState<PagamentoOperador[]>([]);
  const [cpfError, setCpfError] = useState<string | null>(null);
  const [pagamentoDialogOpen, setPagamentoDialogOpen] = useState(false);
  const [vincularProjetoDialogOpen, setVincularProjetoDialogOpen] = useState(false);
  const [selectedPagamentoEdit, setSelectedPagamentoEdit] = useState<PagamentoOperador | null>(null);
  
  const [formData, setFormData] = useState<Operador>({
    nome: "",
    cpf: "",
    email: null,
    telefone: null,
    status: "ATIVO",
    tipo_contrato: "CLT",
    data_admissao: new Date().toISOString().split("T")[0],
    data_nascimento: null,
    data_desligamento: null,
    observacoes: null,
  });

  const fetchOperadorCompleto = async (operadorId: string) => {
    const { data, error } = await supabase
      .from("operadores")
      .select("*")
      .eq("id", operadorId)
      .single();

    if (!error && data) {
      setFormData({
        id: data.id,
        nome: data.nome,
        cpf: data.cpf,
        email: data.email || null,
        telefone: data.telefone || null,
        status: data.status,
        tipo_contrato: data.tipo_contrato,
        data_admissao: data.data_admissao,
        data_nascimento: data.data_nascimento || null,
        data_desligamento: data.data_desligamento || null,
        observacoes: data.observacoes || null,
      });
    }
  };

  useEffect(() => {
    if (open) {
      if (operador && mode !== "create") {
        // Fetch complete operator data from the table (view doesn't have all fields)
        if (operador.id) {
          fetchOperadorCompleto(operador.id);
          fetchProjetosOperador(operador.id);
          fetchPagamentosOperador(operador.id);
        }
      } else {
        setFormData({
          nome: "",
          cpf: "",
          email: null,
          telefone: null,
          status: "ATIVO",
          tipo_contrato: "CLT",
          data_admissao: new Date().toISOString().split("T")[0],
          data_nascimento: null,
          data_desligamento: null,
          observacoes: null,
        });
        setProjetos([]);
        setPagamentos([]);
      }
      setActiveTab("dados");
      setCpfError(null);
    }
  }, [open, operador, mode]);

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
        tipo_pagamento,
        valor,
        moeda,
        data_pagamento,
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

  const validateCPFUnique = async (cpf: string) => {
    if (!cpf || cpf.length < 11) return;
    
    const cleanCPF = cpf.replace(/\D/g, "");
    if (!validateCPF(cleanCPF)) {
      setCpfError("CPF inválido");
      return;
    }

    const { data: session } = await supabase.auth.getSession();
    if (!session.session) return;

    let query = supabase
      .from("operadores")
      .select("id")
      .eq("cpf", cleanCPF)
      .eq("user_id", session.session.user.id);

    if (operador?.id) {
      query = query.neq("id", operador.id);
    }

    const { data } = await query;
    if (data && data.length > 0) {
      setCpfError("CPF já cadastrado");
    } else {
      setCpfError(null);
    }
  };

  const handleSave = async () => {
    if (!formData.nome.trim()) {
      toast.error("Nome é obrigatório");
      return;
    }
    if (!formData.cpf || cpfError) {
      toast.error(cpfError || "CPF inválido");
      return;
    }

    setLoading(true);
    try {
      const { data: session } = await supabase.auth.getSession();
      if (!session.session) {
        toast.error("Usuário não autenticado");
        return;
      }

      const cleanCPF = formData.cpf.replace(/\D/g, "");
      const payload = {
        nome: formData.nome.trim(),
        cpf: cleanCPF,
        email: formData.email || null,
        telefone: formData.telefone || null,
        status: formData.status,
        tipo_contrato: formData.tipo_contrato,
        data_admissao: formData.data_admissao,
        data_nascimento: formData.data_nascimento || null,
        data_desligamento: formData.data_desligamento || null,
        observacoes: formData.observacoes || null,
        user_id: session.session.user.id,
      };

      if (mode === "create") {
        const { error } = await supabase.from("operadores").insert(payload);
        if (error) throw error;
        toast.success("Operador criado com sucesso");
      } else {
        const { error } = await supabase
          .from("operadores")
          .update(payload)
          .eq("id", operador!.id);
        if (error) throw error;
        toast.success("Operador atualizado com sucesso");
      }

      onSuccess();
      onOpenChange(false);
    } catch (error: any) {
      if (error.code === "23505") {
        toast.error("CPF já cadastrado para outro operador");
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

  // Breakdown por tipo de pagamento
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

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh]">
        <DialogHeader>
          <DialogTitle>
            {mode === "create" 
              ? "Novo Operador" 
              : mode === "edit" 
                ? "Editar Operador" 
                : "Detalhes do Operador"}
          </DialogTitle>
        </DialogHeader>

        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="dados">
              <User className="h-4 w-4 mr-2" />
              Dados
            </TabsTrigger>
            <TabsTrigger value="projetos" disabled={mode === "create"}>
              <FolderKanban className="h-4 w-4 mr-2" />
              Projetos
            </TabsTrigger>
            <TabsTrigger value="financeiro" disabled={mode === "create"}>
              <DollarSign className="h-4 w-4 mr-2" />
              Financeiro
            </TabsTrigger>
          </TabsList>

          <ScrollArea className="h-[500px] mt-4">
            <TabsContent value="dados" className="space-y-4 px-1">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Nome *</Label>
                  <Input
                    value={formData.nome}
                    onChange={(e) => setFormData({ ...formData, nome: e.target.value.toUpperCase() })}
                    disabled={isViewMode}
                    placeholder="Nome completo"
                    className="uppercase"
                  />
                </div>
                <div className="space-y-2">
                  <Label>CPF *</Label>
                  <Input
                    value={formatCPF(formData.cpf)}
                    onChange={(e) => {
                      const value = e.target.value.replace(/\D/g, "").slice(0, 11);
                      setFormData({ ...formData, cpf: value });
                      validateCPFUnique(value);
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
                  <Label>Email</Label>
                  <Input
                    type="email"
                    value={formData.email || ""}
                    onChange={(e) => setFormData({ ...formData, email: e.target.value || null })}
                    disabled={isViewMode}
                    placeholder="email@exemplo.com"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Telefone</Label>
                  <Input
                    value={formData.telefone || ""}
                    onChange={(e) => setFormData({ ...formData, telefone: e.target.value || null })}
                    disabled={isViewMode}
                    placeholder="(00) 00000-0000"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Data de Nascimento</Label>
                  <DatePicker
                    value={formData.data_nascimento || ""}
                    onChange={(date) => setFormData({ ...formData, data_nascimento: date })}
                    disabled={isViewMode}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Data de Admissão *</Label>
                  <DatePicker
                    value={formData.data_admissao}
                    onChange={(date) => setFormData({ ...formData, data_admissao: date })}
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
                      <SelectItem value="ATIVO">Ativo</SelectItem>
                      <SelectItem value="INATIVO">Inativo</SelectItem>
                      <SelectItem value="BLOQUEADO">Bloqueado</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {formData.status !== "ATIVO" && (
                <div className="space-y-2">
                  <Label>Data de Desligamento</Label>
                  <DatePicker
                    value={formData.data_desligamento || ""}
                    onChange={(date) => setFormData({ ...formData, data_desligamento: date })}
                    disabled={isViewMode}
                  />
                </div>
              )}

              <div className="space-y-2">
                <Label>Observações</Label>
                <Textarea
                  value={formData.observacoes || ""}
                  onChange={(e) => setFormData({ ...formData, observacoes: e.target.value || null })}
                  disabled={isViewMode}
                  placeholder="Observações sobre o operador..."
                  rows={3}
                />
              </div>
            </TabsContent>

            <TabsContent value="projetos" className="space-y-4 px-1">
              {/* Botão Vincular Projeto */}
              <div className="flex justify-end">
                <Button 
                  onClick={() => setVincularProjetoDialogOpen(true)}
                  size="sm"
                >
                  <Plus className="h-4 w-4 mr-2" />
                  Vincular Projeto
                </Button>
              </div>

              {projetos.length === 0 ? (
                <Card>
                  <CardContent className="pt-6">
                    <div className="text-center py-8">
                      <FolderKanban className="mx-auto h-12 w-12 text-muted-foreground/50" />
                      <p className="mt-4 text-muted-foreground">
                        Nenhum projeto vinculado a este operador
                      </p>
                    </div>
                  </CardContent>
                </Card>
              ) : (
                <div className="space-y-3">
                  {projetos.map((projeto) => (
                    <Card key={projeto.id}>
                      <CardContent className="pt-4">
                        <div className="flex items-center justify-between">
                          <div>
                            <p className="font-medium">{projeto.projeto_nome}</p>
                            {projeto.funcao && (
                              <p className="text-sm text-muted-foreground">{projeto.funcao}</p>
                            )}
                          </div>
                          <Badge 
                            className={
                              projeto.status === "ATIVO" 
                                ? "bg-emerald-500/20 text-emerald-400" 
                                : "bg-gray-500/20 text-gray-400"
                            }
                          >
                            {projeto.status}
                          </Badge>
                        </div>
                        
                        {/* Modelo de Pagamento */}
                        <div className="mt-3 p-2 bg-muted/30 rounded-md">
                          <div className="flex items-center justify-between">
                            <span className="text-xs text-muted-foreground">Modelo:</span>
                            <span className="text-sm font-medium">
                              {MODELOS_PAGAMENTO_LABELS[projeto.modelo_pagamento] || projeto.modelo_pagamento}
                            </span>
                          </div>
                          <div className="flex items-center gap-4 mt-1">
                            {projeto.valor_fixo > 0 && (
                              <div className="flex items-center gap-1">
                                <span className="text-xs text-muted-foreground">Fixo:</span>
                                <span className="text-sm">{formatCurrency(projeto.valor_fixo)}</span>
                              </div>
                            )}
                            {projeto.percentual > 0 && (
                              <div className="flex items-center gap-1">
                                <span className="text-xs text-muted-foreground">%:</span>
                                <span className="text-sm">{projeto.percentual}%</span>
                                <span className="text-xs text-muted-foreground">
                                  ({BASES_CALCULO_LABELS[projeto.base_calculo] || projeto.base_calculo})
                                </span>
                              </div>
                            )}
                          </div>
                        </div>

                        <div className="flex items-center gap-4 mt-2 text-sm text-muted-foreground">
                          <div className="flex items-center gap-1">
                            <Calendar className="h-3 w-3" />
                            <span>
                              {format(new Date(projeto.data_entrada), "dd/MM/yyyy", { locale: ptBR })}
                            </span>
                          </div>
                          {projeto.data_saida && (
                            <span>
                              até {format(new Date(projeto.data_saida), "dd/MM/yyyy", { locale: ptBR })}
                            </span>
                          )}
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}
            </TabsContent>

            <TabsContent value="financeiro" className="space-y-4 px-1">
              {/* Botão Novo Pagamento */}
              <div className="flex justify-end">
                <Button 
                  onClick={() => setPagamentoDialogOpen(true)}
                  size="sm"
                >
                  <Plus className="h-4 w-4 mr-2" />
                  Novo Pagamento
                </Button>
              </div>

              {/* Resumo Financeiro */}
              <div className="grid grid-cols-3 gap-4">
                <Card>
                  <CardContent className="pt-4">
                    <div className="flex items-center gap-2">
                      <CheckCircle className="h-4 w-4 text-emerald-500" />
                      <span className="text-sm text-muted-foreground">Pagos</span>
                    </div>
                    <p className="text-xl font-bold text-emerald-500 mt-1">
                      {formatCurrency(
                        pagamentos
                          .filter((p) => p.status === "CONFIRMADO")
                          .reduce((acc, p) => acc + p.valor, 0)
                      )}
                    </p>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="pt-4">
                    <div className="flex items-center gap-2">
                      <Clock className="h-4 w-4 text-yellow-500" />
                      <span className="text-sm text-muted-foreground">Pendentes</span>
                    </div>
                    <p className="text-xl font-bold text-yellow-500 mt-1">
                      {formatCurrency(
                        pagamentos
                          .filter((p) => p.status === "PENDENTE")
                          .reduce((acc, p) => acc + p.valor, 0)
                      )}
                    </p>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="pt-4">
                    <div className="flex items-center gap-2">
                      <AlertCircle className="h-4 w-4 text-muted-foreground" />
                      <span className="text-sm text-muted-foreground">Total</span>
                    </div>
                    <p className="text-xl font-bold mt-1">
                      {formatCurrency(
                        pagamentos
                          .filter((p) => p.status !== "CANCELADO")
                          .reduce((acc, p) => acc + p.valor, 0)
                      )}
                    </p>
                  </CardContent>
                </Card>
              </div>

              {/* Breakdown por Tipo */}
              {Object.keys(breakdown).length > 0 && (
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-medium text-muted-foreground">
                      Distribuição por Tipo
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-2 gap-2">
                      {Object.entries(breakdown).map(([tipo, valor]) => (
                        <div key={tipo} className="flex items-center justify-between p-2 bg-muted/30 rounded">
                          <div className="flex items-center gap-2">
                            {getTipoPagamentoIcon(tipo)}
                            <span className="text-sm">{getTipoPagamentoLabel(tipo)}</span>
                          </div>
                          <span className="text-sm font-medium">{formatCurrency(valor)}</span>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* Lista de Pagamentos */}
              {pagamentos.length === 0 ? (
                <Card>
                  <CardContent className="pt-6">
                    <div className="text-center py-8">
                      <DollarSign className="mx-auto h-12 w-12 text-muted-foreground/50" />
                      <p className="mt-4 text-muted-foreground">
                        Nenhum pagamento registrado
                      </p>
                      <Button 
                        variant="outline" 
                        size="sm" 
                        className="mt-4"
                        onClick={() => setPagamentoDialogOpen(true)}
                      >
                        <Plus className="h-4 w-4 mr-2" />
                        Registrar Pagamento
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ) : (
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">Histórico de Pagamentos</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-2">
                      {pagamentos.map((pagamento) => (
                        <div 
                          key={pagamento.id}
                          className="flex items-center justify-between p-3 bg-muted/50 rounded-lg"
                        >
                          <div className="flex items-center gap-3">
                            <div className="p-2 bg-muted rounded-md">
                              {getTipoPagamentoIcon(pagamento.tipo_pagamento)}
                            </div>
                            <div>
                              <p className="font-medium">
                                {getTipoPagamentoLabel(pagamento.tipo_pagamento)}
                              </p>
                              <p className="text-sm text-muted-foreground">
                                {format(new Date(pagamento.data_pagamento), "dd/MM/yyyy", { locale: ptBR })}
                                {pagamento.projeto_nome && ` • ${pagamento.projeto_nome}`}
                              </p>
                              {pagamento.descricao && (
                                <p className="text-sm text-muted-foreground mt-1">
                                  {pagamento.descricao}
                                </p>
                              )}
                            </div>
                          </div>
                          <div className="flex items-center gap-3">
                            <div className="text-right">
                              <p className="font-semibold">{formatCurrency(pagamento.valor)}</p>
                              <Badge className={getStatusPagamentoColor(pagamento.status)}>
                                {pagamento.status}
                              </Badge>
                            </div>
                            {pagamento.status === "PENDENTE" && (
                              <Button
                                size="sm"
                                onClick={() => {
                                  setSelectedPagamentoEdit(pagamento);
                                  setPagamentoDialogOpen(true);
                                }}
                              >
                                <DollarSign className="h-3 w-3 mr-1" />
                                Pagar
                              </Button>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
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
              {loading ? "Salvando..." : mode === "create" ? "Criar Operador" : "Salvar Alterações"}
            </Button>
          </div>
        )}
      </DialogContent>

      {/* Dialog para novo/editar pagamento */}
      <PagamentoOperadorDialog
        open={pagamentoDialogOpen}
        onOpenChange={(open) => {
          setPagamentoDialogOpen(open);
          if (!open) setSelectedPagamentoEdit(null);
        }}
        defaultOperadorId={operador?.id}
        pagamento={selectedPagamentoEdit ? {
          id: selectedPagamentoEdit.id,
          operador_id: operador?.id || "",
          projeto_id: null,
          tipo_pagamento: selectedPagamentoEdit.tipo_pagamento,
          valor: selectedPagamentoEdit.valor,
          moeda: selectedPagamentoEdit.moeda,
          data_pagamento: selectedPagamentoEdit.data_pagamento,
          data_competencia: null,
          descricao: selectedPagamentoEdit.descricao,
          status: selectedPagamentoEdit.status,
        } : undefined}
        onSuccess={() => {
          if (operador?.id) {
            fetchPagamentosOperador(operador.id);
          }
          setSelectedPagamentoEdit(null);
        }}
      />

      {/* Dialog para vincular projeto */}
      {operador?.id && (
        <VincularProjetoDialog
          open={vincularProjetoDialogOpen}
          onOpenChange={setVincularProjetoDialogOpen}
          operadorId={operador.id}
          onSuccess={() => {
            fetchProjetosOperador(operador.id!);
          }}
        />
      )}
    </Dialog>
  );
}