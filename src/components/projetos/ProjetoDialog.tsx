import { useState, useEffect, useCallback } from "react";
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
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
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
  UserCheck,
  Handshake
} from "lucide-react";
import { VincularOperadorDialog } from "@/components/projetos/VincularOperadorDialog";
import { ProjetoConciliacaoDialog } from "@/components/projetos/ProjetoConciliacaoDialog";
import { InvestidorSelect } from "@/components/investidores/InvestidorSelect";
import { ProjetoAcordoSection, AcordoData } from "@/components/projetos/ProjetoAcordoSection";

type TipoProjeto = 'INTERNO' | 'EXCLUSIVO_INVESTIDOR';

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
  tipo_projeto?: TipoProjeto;
  investidor_id?: string | null;
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
  const [conciliacaoDialogOpen, setConciliacaoDialogOpen] = useState(false);
  const [temConciliacao, setTemConciliacao] = useState(false);
  const [acordoData, setAcordoData] = useState<AcordoData | null>(null);
  
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
    tipo_projeto: "INTERNO",
    investidor_id: null,
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
          tem_investimento_crypto: projeto.tem_investimento_crypto || false,
          conciliado: projeto.conciliado || false,
          modelo_absorcao_taxas: projeto.modelo_absorcao_taxas || "EMPRESA_100",
          tipo_projeto: (projeto as any).tipo_projeto || "INTERNO",
          investidor_id: (projeto as any).investidor_id || null,
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
          tipo_projeto: "INTERNO",
          investidor_id: null,
        });
        setOperadores([]);
        setTemConciliacao(false);
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

    // Validar investidor obrigatório para projeto exclusivo
    if (formData.tipo_projeto === "EXCLUSIVO_INVESTIDOR" && !formData.investidor_id) {
      toast.error("Selecione um investidor para projetos exclusivos");
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
        tipo_projeto: formData.tipo_projeto || "INTERNO",
        investidor_id: formData.tipo_projeto === "EXCLUSIVO_INVESTIDOR" ? formData.investidor_id : null,
        user_id: session.session.user.id,
      };

      if (mode === "create") {
        const { data: newProjeto, error } = await supabase.from("projetos").insert(payload).select("id").single();
        if (error) throw error;
        
        // Create projeto_acordos if it's an exclusive investor project
        if (payload.tipo_projeto === "EXCLUSIVO_INVESTIDOR" && acordoData && newProjeto) {
          const acordoPayload = {
            user_id: session.session.user.id,
            projeto_id: newProjeto.id,
            investidor_id: payload.investidor_id,
            base_calculo: acordoData.base_calculo,
            percentual_investidor: acordoData.percentual_investidor,
            percentual_empresa: acordoData.percentual_empresa,
            deduzir_custos_operador: acordoData.deduzir_custos_operador,
            percentual_prejuizo_investidor: acordoData.percentual_prejuizo_investidor,
            observacoes: acordoData.observacoes,
            ativo: true,
          };
          
          const { error: acordoError } = await supabase.from("projeto_acordos").insert(acordoPayload);
          if (acordoError) throw acordoError;
        }
        
        toast.success("Projeto criado com sucesso");
      } else {
        const { error } = await supabase
          .from("projetos")
          .update(payload)
          .eq("id", projeto!.id);
        if (error) throw error;
        
        // Update or create projeto_acordos if it's an exclusive investor project
        if (payload.tipo_projeto === "EXCLUSIVO_INVESTIDOR" && acordoData) {
          const acordoPayload = {
            user_id: session.session.user.id,
            projeto_id: projeto!.id,
            investidor_id: payload.investidor_id,
            base_calculo: acordoData.base_calculo,
            percentual_investidor: acordoData.percentual_investidor,
            percentual_empresa: acordoData.percentual_empresa,
            deduzir_custos_operador: acordoData.deduzir_custos_operador,
            percentual_prejuizo_investidor: acordoData.percentual_prejuizo_investidor,
            observacoes: acordoData.observacoes,
            ativo: true,
          };
          
          if (acordoData.id) {
            // Update existing
            const { error: acordoError } = await supabase
              .from("projeto_acordos")
              .update(acordoPayload)
              .eq("id", acordoData.id);
            if (acordoError) throw acordoError;
          } else {
            // Create new
            const { error: acordoError } = await supabase.from("projeto_acordos").insert(acordoPayload);
            if (acordoError) throw acordoError;
          }
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

  const isViewMode = mode === "view";
  const precisaConciliacao = formData.tem_investimento_crypto && !formData.conciliado;

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
            <TabsList className={`grid w-full ${formData.tipo_projeto === "EXCLUSIVO_INVESTIDOR" ? "grid-cols-3" : "grid-cols-2"}`}>
              <TabsTrigger value="dados">
                <FolderKanban className="h-4 w-4 mr-2" />
                Dados
              </TabsTrigger>
              {formData.tipo_projeto === "EXCLUSIVO_INVESTIDOR" && (
                <TabsTrigger value="acordo">
                  <Handshake className="h-4 w-4 mr-2" />
                  Acordo
                </TabsTrigger>
              )}
              <TabsTrigger value="operadores" disabled={mode === "create"}>
                <Users className="h-4 w-4 mr-2" />
                Operadores
              </TabsTrigger>
            </TabsList>

            <ScrollArea className="h-[500px] mt-4">
              <TabsContent value="dados" className="space-y-4 px-1">
                {/* Tipo de Projeto */}
                <Card className={formData.tipo_projeto === "EXCLUSIVO_INVESTIDOR" ? "border-primary/30 bg-primary/5" : ""}>
                  <CardContent className="pt-4 space-y-4">
                    <div className="space-y-2">
                      <Label className="flex items-center gap-2">
                        <UserCheck className="h-4 w-4" />
                        Tipo de Projeto *
                      </Label>
                      <Select
                        value={formData.tipo_projeto}
                        onValueChange={(value: TipoProjeto) => {
                          setFormData({ 
                            ...formData, 
                            tipo_projeto: value,
                            investidor_id: value === "INTERNO" ? null : formData.investidor_id
                          });
                        }}
                        disabled={isViewMode || mode === "edit"}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="INTERNO">
                            <div className="flex flex-col">
                              <span>Projeto Interno</span>
                              <span className="text-xs text-muted-foreground">Capital próprio da empresa</span>
                            </div>
                          </SelectItem>
                          <SelectItem value="EXCLUSIVO_INVESTIDOR">
                            <div className="flex flex-col">
                              <span>Projeto Exclusivo de Investidor</span>
                              <span className="text-xs text-muted-foreground">Capital isolado de terceiro</span>
                            </div>
                          </SelectItem>
                        </SelectContent>
                      </Select>
                      {mode === "edit" && (
                        <p className="text-xs text-muted-foreground">
                          O tipo de projeto não pode ser alterado após criação
                        </p>
                      )}
                    </div>

                    {formData.tipo_projeto === "EXCLUSIVO_INVESTIDOR" && (
                      <div className="space-y-2">
                        <Label>Investidor *</Label>
                        <InvestidorSelect
                          value={formData.investidor_id || ""}
                          onValueChange={(value) => setFormData({ ...formData, investidor_id: value })}
                          disabled={isViewMode}
                        />
                        <p className="text-xs text-muted-foreground">
                          As bookmakers deste projeto serão exclusivas e o lucro calculado isoladamente
                        </p>
                      </div>
                    )}
                  </CardContent>
                </Card>

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

                        {mode !== "create" && (
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

              {/* Tab: Acordo (only for exclusive investor projects) */}
              {formData.tipo_projeto === "EXCLUSIVO_INVESTIDOR" && (
                <TabsContent value="acordo" className="space-y-4 px-1">
                  <ProjetoAcordoSection
                    projetoId={projeto?.id || "new"}
                    investidorId={formData.investidor_id}
                    isViewMode={isViewMode}
                    onAcordoChange={setAcordoData}
                    onVincularOperador={projeto?.id ? () => setVincularDialogOpen(true) : undefined}
                  />
                </TabsContent>
              )}

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
              {/* Em modo criação com investidor exclusivo, na aba dados, botão avança para acordo */}
              {mode === "create" && formData.tipo_projeto === "EXCLUSIVO_INVESTIDOR" && activeTab === "dados" ? (
                <Button 
                  onClick={() => setActiveTab("acordo")}
                  disabled={!formData.nome.trim() || !formData.investidor_id}
                >
                  Próximo: Acordo
                </Button>
              ) : (
                <Button 
                  onClick={handleSave} 
                  disabled={loading || (formData.status === "FINALIZADO" && precisaConciliacao)}
                >
                  {loading ? "Salvando..." : mode === "create" ? "Criar Projeto" : "Salvar Alterações"}
                </Button>
              )}
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
    </>
  );
}