import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useWorkspace } from "@/hooks/useWorkspace";
import { cn } from "@/lib/utils";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
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
  Calendar,
  UserPlus,
  Coins,
  Calculator,
  AlertTriangle,
  CheckCircle2,
  FileText,
  Pencil,
  Briefcase,
  Percent,
  Info,
  DollarSign,
  Puzzle
} from "lucide-react";
import { CurrencyConsolidationSettings } from "@/components/projeto-detalhe/CurrencyConsolidationSettings";
import { VincularOperadorDialog } from "@/components/projetos/VincularOperadorDialog";
import { EditarAcordoOperadorDialog } from "@/components/projetos/EditarAcordoOperadorDialog";
import { ProjetoConciliacaoDialog } from "@/components/projetos/ProjetoConciliacaoDialog";
import { ConfirmacaoSenhaDialog } from "@/components/ui/confirmacao-senha-dialog";
import { InvestidorSelect } from "@/components/investidores/InvestidorSelect";
import { ProjectPostCreateWizard } from "@/components/projetos/ProjectPostCreateWizard";
import { ProjectModulesStep } from "@/components/projetos/ProjectModulesStep";
import { ProjectCreationWizard } from "@/components/projetos/wizard/ProjectCreationWizard";
import { ProjectEditWizard } from "@/components/projetos/wizard/ProjectEditWizard";

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
  tem_investimento_crypto?: boolean;
  conciliado?: boolean;
  modelo_absorcao_taxas?: string;
  investidor_id?: string | null;
  percentual_investidor?: number;
  base_calculo_investidor?: string;
}

const MODELOS_ABSORCAO = [
  { value: "EMPRESA_100", label: "Empresa absorve 100%", description: "Taxas são custo operacional da empresa" },
  { value: "OPERADOR_100", label: "Operador absorve 100%", description: "Taxas deduzidas do lucro antes de calcular comissão" },
  { value: "PROPORCIONAL", label: "Divisão proporcional (50/50)", description: "Taxas divididas igualmente entre empresa e operador" },
];

interface OperadorVinculado {
  id: string;
  operador_id: string;
  operador_nome: string;
  data_entrada: string;
  data_saida: string | null;
  status: string;
  funcao: string | null;
  modelo_pagamento: string | null;
  valor_fixo: number | null;
  percentual: number | null;
  base_calculo: string | null;
  frequencia_conciliacao: string | null;
  dias_intervalo_conciliacao: number | null;
  resumo_acordo: string | null;
}

interface ProjetoDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projeto: Projeto | null;
  mode: "view" | "edit" | "create";
  onSuccess: () => void;
  onCreatedOpenEdit?: (projetoId: string, initialTab?: string) => void;
  initialTab?: string;
}

export function ProjetoDialog({
  open,
  onOpenChange,
  projeto,
  mode,
  onSuccess,
  onCreatedOpenEdit,
  initialTab,
}: ProjetoDialogProps) {
  const { workspaceId } = useWorkspace();
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState(initialTab || "dados");
  const [operadores, setOperadores] = useState<OperadorVinculado[]>([]);
  const [vincularDialogOpen, setVincularDialogOpen] = useState(false);
  const [editarAcordoDialogOpen, setEditarAcordoDialogOpen] = useState(false);
  const [selectedOperadorVinculado, setSelectedOperadorVinculado] = useState<OperadorVinculado | null>(null);
  const [conciliacaoDialogOpen, setConciliacaoDialogOpen] = useState(false);
  const [temConciliacao, setTemConciliacao] = useState(false);
  const [showVincularPrompt, setShowVincularPrompt] = useState(false);
  const [novoprojetoId, setNovoProjetoId] = useState<string | null>(null);
  const [novoProjetoNome, setNovoProjetoNome] = useState<string>("");
  const [confirmacaoDialogOpen, setConfirmacaoDialogOpen] = useState(false);
  const [operadorParaDesvincular, setOperadorParaDesvincular] = useState<string | null>(null);
  const [selectedModules, setSelectedModules] = useState<string[]>([]);
  
  const [formData, setFormData] = useState<Projeto>({
    nome: "",
    descricao: null,
    status: "PLANEJADO",
    data_inicio: null,
    data_fim_prevista: null,
    data_fim_real: null,
    orcamento_inicial: 0,
    observacoes: null,
    tem_investimento_crypto: false,
    conciliado: false,
    modelo_absorcao_taxas: "EMPRESA_100",
    investidor_id: null,
    percentual_investidor: 0,
    base_calculo_investidor: "LUCRO_LIQUIDO",
  });

  useEffect(() => {
    if (open) {
      if (projeto && mode !== "create") {
        // Buscar dados completos do projeto diretamente da tabela
        fetchProjetoCompleto(projeto.id!).then((projetoCompleto) => {
          if (projetoCompleto) {
            setFormData({
              ...projeto,
              descricao: projetoCompleto.descricao || null,
              data_inicio: projetoCompleto.data_inicio || null,
              data_fim_prevista: projetoCompleto.data_fim_prevista || null,
              data_fim_real: projetoCompleto.data_fim_real || null,
              observacoes: projetoCompleto.observacoes || null,
              tem_investimento_crypto: projetoCompleto.tem_investimento_crypto || false,
              conciliado: projetoCompleto.conciliado || false,
              modelo_absorcao_taxas: projetoCompleto.modelo_absorcao_taxas || "EMPRESA_100",
              investidor_id: projetoCompleto.investidor_id || null,
              percentual_investidor: projetoCompleto.percentual_investidor || 0,
              base_calculo_investidor: projetoCompleto.base_calculo_investidor || "LUCRO_LIQUIDO",
            });
          } else {
            // Fallback se não conseguir buscar
            setFormData({
              ...projeto,
              descricao: projeto.descricao || null,
              data_inicio: projeto.data_inicio || null,
              data_fim_prevista: projeto.data_fim_prevista || null,
              data_fim_real: projeto.data_fim_real || null,
              observacoes: (projeto as any).observacoes || null,
              tem_investimento_crypto: projeto.tem_investimento_crypto || false,
              conciliado: projeto.conciliado || false,
              modelo_absorcao_taxas: (projeto as any).modelo_absorcao_taxas || "EMPRESA_100",
            });
          }
        });
        if (projeto.id) {
          fetchOperadoresProjeto(projeto.id);
          checkConciliacao(projeto.id);
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
          tem_investimento_crypto: false,
          conciliado: false,
          modelo_absorcao_taxas: "EMPRESA_100",
          investidor_id: null,
          percentual_investidor: 0,
          base_calculo_investidor: "LUCRO_LIQUIDO",
        });
        setOperadores([]);
        setTemConciliacao(false);
        setSelectedModules([]);
      }
      setActiveTab(initialTab || "dados");
    }
  }, [open, projeto, mode, initialTab]);

  // Buscar dados completos do projeto
  const fetchProjetoCompleto = async (projetoId: string) => {
    const { data, error } = await supabase
      .from("projetos")
      .select("*")
      .eq("id", projetoId)
      .single();
    
    if (error) {
      console.error("Erro ao buscar projeto:", error);
      return null;
    }
    return data;
  };

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
        modelo_pagamento,
        valor_fixo,
        percentual,
        base_calculo,
        frequencia_conciliacao,
        dias_intervalo_conciliacao,
        resumo_acordo,
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
          modelo_pagamento: op.modelo_pagamento,
          valor_fixo: op.valor_fixo,
          percentual: op.percentual,
          base_calculo: op.base_calculo,
          frequencia_conciliacao: op.frequencia_conciliacao,
          dias_intervalo_conciliacao: op.dias_intervalo_conciliacao,
          resumo_acordo: op.resumo_acordo,
        }))
      );
    }
  };

  const checkConciliacao = async (projetoId: string) => {
    const { data, error } = await supabase
      .from("projeto_conciliacoes")
      .select("id")
      .eq("projeto_id", projetoId)
      .limit(1);

    if (!error && data) {
      setTemConciliacao(data.length > 0);
    }
  };

  const handleSave = async () => {
    if (!formData.nome.trim()) {
      toast.error("Nome é obrigatório");
      return;
    }

    // Data de início obrigatória para todos os projetos
    if (!formData.data_inicio) {
      toast.error("Data de início é obrigatória");
      return;
    }

    // Validar conciliação obrigatória para projetos crypto ao finalizar
    if (formData.status === "FINALIZADO" && formData.tem_investimento_crypto && !formData.conciliado) {
      toast.error("Projetos com investimento crypto precisam ser conciliados antes de finalizar");
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
        tem_investimento_crypto: formData.tem_investimento_crypto || false,
        modelo_absorcao_taxas: formData.tem_investimento_crypto ? formData.modelo_absorcao_taxas : "EMPRESA_100",
        tipo_projeto: "INTERNO",
        user_id: session.session.user.id,
        workspace_id: workspaceId!,
        investidor_id: formData.investidor_id || null,
        percentual_investidor: formData.percentual_investidor || 0,
        base_calculo_investidor: formData.base_calculo_investidor || "LUCRO_LIQUIDO",
      };

      if (mode === "create") {
        const { data: newProjeto, error } = await supabase.from("projetos").insert(payload).select("id").single();
        if (error) {
          if (error.code === "23505") {
            toast.error("Já existe um projeto ativo com este nome neste workspace");
            return;
          }
          throw error;
        }
        
        // Ativar módulos selecionados
        if (selectedModules.length > 0 && newProjeto?.id) {
          const { data: session } = await supabase.auth.getSession();
          const userId = session.session?.user.id;
          
          const modulesToInsert = selectedModules.map((moduleId, index) => ({
            projeto_id: newProjeto.id,
            module_id: moduleId,
            status: 'active',
            display_order: index + 1,
            activated_by: userId || null,
            workspace_id: workspaceId!,
          }));
          
          const { error: modulesError } = await supabase
            .from("project_modules")
            .insert(modulesToInsert);
          
          if (modulesError) {
            console.error("Erro ao ativar módulos:", modulesError);
            // Não bloqueia a criação do projeto
          }
        }
        
        // Perguntar se deseja vincular operador
        setNovoProjetoId(newProjeto.id);
        setNovoProjetoNome(formData.nome);
        setShowVincularPrompt(true);
        onSuccess();
        onOpenChange(false);
        return;
      } else {
        const { error } = await supabase
          .from("projetos")
          .update(payload)
          .eq("id", projeto!.id);
        if (error) {
          if (error.code === "23505") {
            toast.error("Já existe um projeto ativo com este nome neste workspace");
            return;
          }
          throw error;
        }
        
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

  // Iniciar fluxo de desvinculação com confirmação CAPTCHA
  const iniciarDesvincular = (vinculoId: string) => {
    setOperadorParaDesvincular(vinculoId);
    setConfirmacaoDialogOpen(true);
  };

  // Executar desvinculação após confirmação
  const handleDesvincularOperador = async () => {
    if (!operadorParaDesvincular) return;
    
    try {
      const { error } = await supabase
        .from("operador_projetos")
        .update({ 
          status: "FINALIZADO",
          data_saida: new Date().toISOString().split("T")[0]
        })
        .eq("id", operadorParaDesvincular);

      if (error) throw error;
      toast.success("Operador desvinculado do projeto");
      if (projeto?.id) {
        fetchOperadoresProjeto(projeto.id);
      }
    } catch (error: any) {
      toast.error("Erro ao desvincular: " + error.message);
    } finally {
      setOperadorParaDesvincular(null);
    }
  };

  const isViewMode = mode === "view";
  const precisaConciliacao = formData.tem_investimento_crypto && !formData.conciliado;

  // Use wizard for create mode
  if (mode === "create") {
    return (
      <ProjectCreationWizard
        open={open}
        onOpenChange={onOpenChange}
        onSuccess={(projectId) => {
          onSuccess();
          if (projectId) {
            window.location.href = `/projeto/${projectId}`;
          }
        }}
      />
    );
  }

  // Use edit wizard for edit mode - unified layout with creation wizard
  if (mode === "edit" && projeto?.id) {
    return (
      <ProjectEditWizard
        open={open}
        onOpenChange={onOpenChange}
        projeto={{
          id: projeto.id,
          nome: formData.nome,
          descricao: formData.descricao,
          status: formData.status,
          data_inicio: formData.data_inicio,
          data_fim_prevista: formData.data_fim_prevista,
          data_fim_real: formData.data_fim_real,
          tem_investimento_crypto: formData.tem_investimento_crypto,
          investidor_id: formData.investidor_id,
          percentual_investidor: formData.percentual_investidor,
          base_calculo_investidor: formData.base_calculo_investidor,
          modelo_absorcao_taxas: formData.modelo_absorcao_taxas,
          conciliado: formData.conciliado,
        }}
        onSuccess={onSuccess}
      />
    );
  }

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-3xl max-h-[90vh]">
          <DialogHeader>
            <DialogTitle>
              {mode === "edit" 
                  ? "Editar Projeto" 
                  : "Detalhes do Projeto"}
            </DialogTitle>
          </DialogHeader>

          <Tabs value={activeTab} onValueChange={setActiveTab}>
            <TabsList className="grid w-full grid-cols-3">
              <TabsTrigger value="dados">
                <FolderKanban className="h-4 w-4 mr-2" />
                Dados
              </TabsTrigger>
              <TabsTrigger value="moeda">
                <DollarSign className="h-4 w-4 mr-2" />
                Moeda
              </TabsTrigger>
              <TabsTrigger value="operadores">
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
                      onChange={(e) => setFormData({ ...formData, nome: e.target.value.toUpperCase() })}
                      disabled={isViewMode}
                      placeholder="Nome do projeto"
                      className="uppercase"
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
                    <Label>Data de Início *</Label>
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

                {/* Investimento Crypto */}
                <Card className={formData.tem_investimento_crypto ? "border-orange-500/30" : ""}>
                  <CardContent className="pt-4">
                    <div className="flex items-start gap-3">
                      <Checkbox
                        id="tem_crypto"
                        checked={formData.tem_investimento_crypto}
                        onCheckedChange={(checked) => 
                          setFormData({ ...formData, tem_investimento_crypto: checked as boolean })
                        }
                        disabled={isViewMode}
                      />
                      <div className="space-y-1">
                        <Label htmlFor="tem_crypto" className="flex items-center gap-2 cursor-pointer">
                          <Coins className="h-4 w-4 text-orange-500" />
                          Projeto com Investimento Crypto
                        </Label>
                        <p className="text-xs text-muted-foreground">
                          Ativa a obrigatoriedade de conciliação patrimonial antes de finalizar o projeto
                        </p>
                      </div>
                    </div>

                    {formData.tem_investimento_crypto && (
                      <>
                        {/* Modelo de Absorção de Taxas */}
                        <div className="mt-4 space-y-2">
                          <Label>Modelo de Absorção de Taxas *</Label>
                          <Select
                            value={formData.modelo_absorcao_taxas}
                            onValueChange={(value) => setFormData({ ...formData, modelo_absorcao_taxas: value })}
                            disabled={isViewMode}
                          >
                            <SelectTrigger>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {MODELOS_ABSORCAO.map((modelo) => (
                                <SelectItem key={modelo.value} value={modelo.value}>
                                  {modelo.label}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <p className="text-xs text-muted-foreground">
                            Define quem paga as perdas friccionais (slippage, taxas de conversão)
                          </p>
                        </div>

                        {/* Conciliation status - always show in edit/view mode */}
                        {(
                          <div className={`mt-4 p-3 rounded-lg flex items-center justify-between ${
                            formData.conciliado 
                              ? "bg-emerald-500/10 border border-emerald-500/20" 
                              : "bg-amber-500/10 border border-amber-500/20"
                          }`}>
                            <div className="flex items-center gap-2">
                              {formData.conciliado ? (
                                <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                              ) : (
                                <AlertTriangle className="h-4 w-4 text-amber-500" />
                              )}
                              <span className="text-sm">
                                {formData.conciliado 
                                  ? "Projeto conciliado" 
                                  : "Conciliação pendente"
                                }
                              </span>
                            </div>
                            {!formData.conciliado && !isViewMode && (
                              <Button 
                                size="sm" 
                                variant="outline"
                                onClick={() => setConciliacaoDialogOpen(true)}
                              >
                                <Calculator className="h-4 w-4 mr-2" />
                                Realizar Conciliação
                              </Button>
                            )}
                            {formData.conciliado && (
                              <Badge className="bg-emerald-500/20 text-emerald-400">
                                Conciliado
                              </Badge>
                            )}
                          </div>
                        )}
                      </>
                    )}
                  </CardContent>
                </Card>

                {/* Participação de Investidor */}
                <Card className={formData.investidor_id ? "border-purple-500/30" : ""}>
                  <CardContent className="pt-4">
                    <div className="flex items-center gap-3 mb-4">
                      <Briefcase className="h-5 w-5 text-purple-500" />
                      <div>
                        <Label className="text-base font-medium">Participação de Investidor</Label>
                        <p className="text-xs text-muted-foreground">
                          Opcional: vincule um investidor para dividir lucros
                        </p>
                      </div>
                    </div>

                    <div className="space-y-4">
                      <div className="space-y-2">
                        <Label>Investidor</Label>
                        <InvestidorSelect
                          value={formData.investidor_id || ""}
                          onValueChange={(value) => setFormData({ ...formData, investidor_id: value || null })}
                          disabled={isViewMode}
                        />
                      </div>

                      {formData.investidor_id && (
                        <>
                          <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-2">
                              <Label className="flex items-center gap-1">
                                <Percent className="h-3 w-3" />
                                Percentual de Participação *
                              </Label>
                              <Input
                                type="number"
                                min="0"
                                max="100"
                                step="0.1"
                                value={formData.percentual_investidor || ""}
                                onChange={(e) => setFormData({ 
                                  ...formData, 
                                  percentual_investidor: parseFloat(e.target.value) || 0 
                                })}
                                disabled={isViewMode}
                                placeholder="Ex: 50"
                              />
                            </div>
                            <div className="space-y-2">
                              <Label>Base de Cálculo *</Label>
                              <RadioGroup
                                value={formData.base_calculo_investidor || "LUCRO_LIQUIDO"}
                                onValueChange={(value) => setFormData({ ...formData, base_calculo_investidor: value })}
                                disabled={isViewMode}
                                className="flex flex-col gap-2"
                              >
                                <div className="flex items-center space-x-2">
                                  <RadioGroupItem value="LUCRO_LIQUIDO" id="lucro_liquido" />
                                  <label htmlFor="lucro_liquido" className="text-sm cursor-pointer">
                                    Lucro Líquido
                                  </label>
                                </div>
                                <div className="flex items-center space-x-2">
                                  <RadioGroupItem value="LUCRO_BRUTO" id="lucro_bruto" />
                                  <label htmlFor="lucro_bruto" className="text-sm cursor-pointer">
                                    Lucro Bruto
                                  </label>
                                </div>
                              </RadioGroup>
                            </div>
                          </div>

                          <div className="p-3 rounded-lg bg-purple-500/10 border border-purple-500/20">
                            <div className="flex items-start gap-2">
                              <Info className="h-4 w-4 text-purple-400 mt-0.5 flex-shrink-0" />
                              <p className="text-xs text-muted-foreground">
                                O investidor receberá <strong className="text-purple-400">{formData.percentual_investidor || 0}%</strong> do{" "}
                                <strong className="text-purple-400">
                                  {formData.base_calculo_investidor === "LUCRO_BRUTO" ? "lucro bruto" : "lucro líquido"}
                                </strong>{" "}
                                de cada ciclo fechado deste projeto. A participação será automaticamente calculada e ficará disponível para pagamento.
                              </p>
                            </div>
                          </div>
                        </>
                      )}
                    </div>
                  </CardContent>
                </Card>
              </TabsContent>

              <TabsContent value="moeda" className="space-y-4 px-1">
                {projeto?.id && (
                  <CurrencyConsolidationSettings projetoId={projeto.id} />
                )}
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
                    {operadores.map((operador) => {
                      const getModeloLabel = (modelo: string | null) => {
                        switch (modelo) {
                          case "FIXO_MENSAL": return "Fixo Mensal";
                          case "PORCENTAGEM": return "Porcentagem";
                          case "HIBRIDO": return "Híbrido";
                          case "POR_ENTREGA": return "Por Entrega";
                          case "COMISSAO_ESCALONADA": return "Comissão Escalonada";
                          default: return modelo || "Não definido";
                        }
                      };

                      const formatCurrency = (value: number) => {
                        return new Intl.NumberFormat("pt-BR", {
                          style: "currency",
                          currency: "BRL",
                        }).format(value);
                      };

                      const hasAcordoInfo = operador.modelo_pagamento || operador.valor_fixo || operador.percentual || operador.resumo_acordo;

                      return (
                        <Card key={operador.id}>
                          <CardContent className="pt-4 space-y-3">
                            <div className="flex items-center justify-between">
                              <div>
                                <p className="font-medium">{operador.operador_nome}</p>
                                {operador.funcao && (
                                  <p className="text-sm text-muted-foreground">{operador.funcao}</p>
                                )}
                              </div>
                              <div className="flex items-center gap-2">
                                {!isViewMode && operador.status === "ATIVO" && (
                                  <Tooltip>
                                    <TooltipTrigger asChild>
                                      <Button
                                        variant="ghost"
                                        size="icon"
                                        className="h-8 w-8"
                                        onClick={() => {
                                          setSelectedOperadorVinculado(operador);
                                          setEditarAcordoDialogOpen(true);
                                        }}
                                      >
                                        <Pencil className="h-4 w-4" />
                                      </Button>
                                    </TooltipTrigger>
                                    <TooltipContent>Editar Acordo</TooltipContent>
                                  </Tooltip>
                                )}
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
                                    onClick={() => iniciarDesvincular(operador.id)}
                                  >
                                    Desvincular
                                  </Button>
                                )}
                              </div>
                            </div>
                            
                            <div className="flex items-center gap-4 text-sm text-muted-foreground">
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

                            {/* Referência do Acordo */}
                            {hasAcordoInfo && (
                              <div className="p-3 rounded-lg bg-muted/30 border border-border/50 space-y-2">
                                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                                  <FileText className="h-3 w-3" />
                                  <span className="font-medium">Referência do Acordo</span>
                                </div>
                                
                                <div className="flex flex-wrap gap-2">
                                  {operador.modelo_pagamento && (
                                    <Badge variant="outline" className="text-xs">
                                      {getModeloLabel(operador.modelo_pagamento)}
                                    </Badge>
                                  )}
                                  {operador.valor_fixo && operador.valor_fixo > 0 && (
                                    <Badge variant="outline" className="text-xs text-emerald-400 border-emerald-400/30">
                                      {formatCurrency(operador.valor_fixo)}
                                    </Badge>
                                  )}
                                  {operador.percentual && operador.percentual > 0 && (
                                    <Badge variant="outline" className="text-xs text-emerald-400 border-emerald-400/30">
                                      {operador.percentual}%
                                    </Badge>
                                  )}
                                  {operador.base_calculo && (
                                    <Badge variant="outline" className="text-xs text-blue-400 border-blue-400/30">
                                      Base: {operador.base_calculo === "LUCRO_PROJETO" ? "Lucro" : operador.base_calculo === "FATURAMENTO_PROJETO" ? "Faturamento" : "Resultado Op."}
                                    </Badge>
                                  )}
                                </div>

                                {operador.resumo_acordo && (
                                  <p className="text-xs text-muted-foreground mt-1">
                                    {operador.resumo_acordo}
                                  </p>
                                )}
                              </div>
                            )}
                          </CardContent>
                        </Card>
                      );
                    })}
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
              <Button 
                onClick={handleSave} 
                disabled={loading || (formData.status === "FINALIZADO" && precisaConciliacao)}
              >
                {loading ? "Salvando..." : "Salvar Alterações"}
              </Button>
            </div>
          )}

          {formData.status === "FINALIZADO" && precisaConciliacao && !isViewMode && (
            <p className="text-xs text-amber-500 text-right mt-2">
              ⚠️ Realize a conciliação antes de finalizar o projeto
            </p>
          )}
        </DialogContent>
      </Dialog>

      {projeto?.id && (
        <>
          <VincularOperadorDialog
            open={vincularDialogOpen}
            onOpenChange={setVincularDialogOpen}
            projetoId={projeto.id}
            onSuccess={() => {
              fetchOperadoresProjeto(projeto.id!);
            }}
          />
          <ProjetoConciliacaoDialog
            open={conciliacaoDialogOpen}
            onOpenChange={setConciliacaoDialogOpen}
            projeto={{
              id: projeto.id,
              nome: formData.nome,
              tem_investimento_crypto: formData.tem_investimento_crypto,
            }}
            onSuccess={() => {
              setFormData(prev => ({ ...prev, conciliado: true }));
              setTemConciliacao(true);
              checkConciliacao(projeto.id!);
            }}
          />
        </>
      )}

      {/* Wizard pós-criação do projeto */}
      {novoprojetoId && (
        <ProjectPostCreateWizard
          open={showVincularPrompt}
          onOpenChange={setShowVincularPrompt}
          projectId={novoprojetoId}
          projectName={novoProjetoNome}
          onFinish={() => {
            setShowVincularPrompt(false);
            // Navigate directly to the project page instead of opening edit dialog
            window.location.href = `/projeto/${novoprojetoId}`;
          }}
        />
      )}

      {/* Dialog de Confirmação CAPTCHA para Desvincular */}
      <ConfirmacaoSenhaDialog
        open={confirmacaoDialogOpen}
        onOpenChange={setConfirmacaoDialogOpen}
        onConfirm={handleDesvincularOperador}
        title="Desvincular Operador"
        description="Esta ação finalizará o vínculo do operador com este projeto. Digite o código abaixo para confirmar."
        confirmLabel="Desvincular"
        variant="danger"
      />

      {/* Dialog para Editar Acordo do Operador */}
      <EditarAcordoOperadorDialog
        open={editarAcordoDialogOpen}
        onOpenChange={setEditarAcordoDialogOpen}
        operadorProjeto={selectedOperadorVinculado ? {
          id: selectedOperadorVinculado.id,
          operador_id: selectedOperadorVinculado.operador_id,
          funcao: selectedOperadorVinculado.funcao,
          data_entrada: selectedOperadorVinculado.data_entrada,
          modelo_pagamento: selectedOperadorVinculado.modelo_pagamento || "FIXO_MENSAL",
          valor_fixo: selectedOperadorVinculado.valor_fixo,
          percentual: selectedOperadorVinculado.percentual,
          base_calculo: selectedOperadorVinculado.base_calculo,
          frequencia_conciliacao: selectedOperadorVinculado.frequencia_conciliacao,
          dias_intervalo_conciliacao: selectedOperadorVinculado.dias_intervalo_conciliacao,
          resumo_acordo: selectedOperadorVinculado.resumo_acordo,
          operador: { nome: selectedOperadorVinculado.operador_nome, cpf: "" },
        } : null}
        onSuccess={() => {
          if (projeto?.id) {
            fetchOperadoresProjeto(projeto.id);
          }
        }}
      />
    </>
  );
}
