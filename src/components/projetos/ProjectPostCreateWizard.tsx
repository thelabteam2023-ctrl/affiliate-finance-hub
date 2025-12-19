import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useWorkspace } from "@/hooks/useWorkspace";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { DatePicker } from "@/components/ui/date-picker";
import { 
  CheckCircle2, 
  Users, 
  Calendar, 
  ChevronRight, 
  ChevronLeft,
  ArrowRight,
  Clock,
  Target,
  Zap,
  ChevronDown,
  ChevronUp,
  FileText,
  User,
  Shield,
  Check,
  Sparkles,
  SkipForward
} from "lucide-react";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { addMonths, addDays } from "date-fns";
import { cn } from "@/lib/utils";

interface ProjectPostCreateWizardProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectId: string;
  projectName: string;
  onFinish: () => void;
}

type WizardStep = "choose" | "linkOperator" | "createCycle" | "done";

interface EligibleUser {
  user_id: string;
  display_name: string;
  email: string | null;
  cpf: string | null;
  role_base: string;
  eligible_by_role: boolean;
  eligible_by_extra: boolean;
  operador_id: string | null;
}

interface OperadorProjeto {
  id: string;
  operador_id: string;
  tipo_gatilho: string;
  meta_volume: number | null;
  periodo_maximo_dias: number;
  metrica_acumuladora: string;
  operador: {
    nome: string;
  };
}

const MODELOS_PAGAMENTO = [
  { value: "FIXO_MENSAL", label: "Fixo Mensal" },
  { value: "PORCENTAGEM", label: "Porcentagem" },
  { value: "HIBRIDO", label: "Híbrido (Fixo + %)" },
  { value: "POR_ENTREGA", label: "Por Entrega" },
  { value: "COMISSAO_ESCALONADA", label: "Comissão Escalonada" },
  { value: "PROPORCIONAL_LUCRO", label: "Proporcional ao Lucro" },
];

const BASES_CALCULO = [
  { value: "LUCRO_PROJETO", label: "Lucro do Projeto" },
  { value: "FATURAMENTO_PROJETO", label: "Faturamento do Projeto" },
  { value: "RESULTADO_OPERACAO", label: "Resultado da Operação" },
];

const ROLE_LABELS: Record<string, string> = {
  owner: "Proprietário",
  admin: "Administrador",
  finance: "Financeiro",
  operator: "Operador",
  viewer: "Visualizador",
};

const TIPOS_GATILHO = [
  { value: "TEMPO", label: "Por Tempo", icon: Clock },
  { value: "VOLUME", label: "Por Volume", icon: Target },
  { value: "HIBRIDO", label: "Híbrido", icon: Zap },
];

const METRICAS = [
  { value: "LUCRO", label: "Lucro Realizado" },
  { value: "VOLUME_APOSTADO", label: "Volume Apostado" },
];

export function ProjectPostCreateWizard({
  open,
  onOpenChange,
  projectId,
  projectName,
  onFinish,
}: ProjectPostCreateWizardProps) {
  const { workspaceId } = useWorkspace();
  
  // Wizard state
  const [step, setStep] = useState<WizardStep>("choose");
  const [hasOperatorLinked, setHasOperatorLinked] = useState(false);
  const [hasCycle, setHasCycle] = useState(false);
  const [loading, setLoading] = useState(false);
  
  // Operator form state
  const [eligibleUsers, setEligibleUsers] = useState<EligibleUser[]>([]);
  const [usersVinculados, setUsersVinculados] = useState<string[]>([]);
  const [acordoExpanded, setAcordoExpanded] = useState(false);
  const [operatorFormData, setOperatorFormData] = useState({
    selected_user_id: "",
    funcao: "",
    data_entrada: new Date().toISOString().split("T")[0],
    resumo_acordo: "",
    modelo_pagamento: "FIXO_MENSAL",
    valor_fixo: "",
    percentual: "",
    base_calculo: "LUCRO_PROJETO",
  });
  
  // Cycle form state
  const [operadoresProjeto, setOperadoresProjeto] = useState<OperadorProjeto[]>([]);
  const [cicloFormData, setCicloFormData] = useState({
    operador_projeto_id: "",
    data_inicio: new Date().toISOString().split("T")[0],
    data_fim_prevista: addMonths(new Date(), 1).toISOString().split("T")[0],
    tipo_gatilho: "TEMPO",
    meta_volume: "",
    metrica_acumuladora: "LUCRO",
    observacoes: "",
  });

  // Fetch project status (operator/cycle)
  const fetchProjectStatus = useCallback(async () => {
    if (!projectId) return;
    
    // Check operators
    const { data: operators } = await supabase
      .from("operador_projetos")
      .select("id")
      .eq("projeto_id", projectId)
      .eq("status", "ATIVO")
      .limit(1);
    
    setHasOperatorLinked((operators?.length || 0) > 0);
    
    // Check cycles
    const { data: cycles } = await supabase
      .from("projeto_ciclos")
      .select("id")
      .eq("projeto_id", projectId)
      .limit(1);
    
    setHasCycle((cycles?.length || 0) > 0);
  }, [projectId]);

  const fetchEligibleUsers = useCallback(async () => {
    if (!workspaceId) return;
    
    const { data, error } = await supabase
      .rpc("get_project_operator_candidates", { _workspace_id: workspaceId });

    if (!error && data) {
      setEligibleUsers(data);
    }
  }, [workspaceId]);

  const fetchUsersVinculados = useCallback(async () => {
    if (!projectId) return;
    
    const { data, error } = await supabase
      .from("operador_projetos")
      .select("operador_id, operadores!inner(auth_user_id)")
      .eq("projeto_id", projectId)
      .eq("status", "ATIVO");

    if (!error && data) {
      const vinculados = data
        .map((d: any) => d.operadores?.auth_user_id)
        .filter(Boolean);
      setUsersVinculados(vinculados);
    }
  }, [projectId]);

  const fetchOperadoresProjeto = useCallback(async () => {
    if (!projectId) return;
    
    const { data, error } = await supabase
      .from("operador_projetos")
      .select(`
        id,
        operador_id,
        tipo_gatilho,
        meta_volume,
        periodo_maximo_dias,
        metrica_acumuladora,
        operador:operadores(nome)
      `)
      .eq("projeto_id", projectId)
      .eq("status", "ATIVO");

    if (!error && data) {
      setOperadoresProjeto(data as any);
    }
  }, [projectId]);

  const fetchCicloData = useCallback(async () => {
    if (!projectId) return;
    
    // Get last cycle or project start date
    const { data: lastCycle } = await supabase
      .from("projeto_ciclos")
      .select("data_fim_prevista")
      .eq("projeto_id", projectId)
      .order("numero_ciclo", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (lastCycle) {
      const novaDataInicio = addDays(new Date(lastCycle.data_fim_prevista), 1);
      const novaDataFim = addMonths(novaDataInicio, 1);
      
      setCicloFormData(prev => ({
        ...prev,
        data_inicio: novaDataInicio.toISOString().split("T")[0],
        data_fim_prevista: novaDataFim.toISOString().split("T")[0],
      }));
    } else {
      const { data: projeto } = await supabase
        .from("projetos")
        .select("data_inicio")
        .eq("id", projectId)
        .maybeSingle();

      if (projeto?.data_inicio) {
        const dataInicio = new Date(projeto.data_inicio);
        const dataFim = addMonths(dataInicio, 1);
        setCicloFormData(prev => ({
          ...prev,
          data_inicio: projeto.data_inicio,
          data_fim_prevista: dataFim.toISOString().split("T")[0],
        }));
      }
    }
  }, [projectId]);

  useEffect(() => {
    if (open && projectId) {
      setStep("choose");
      fetchProjectStatus();
      fetchEligibleUsers();
      fetchUsersVinculados();
      fetchOperadoresProjeto();
      fetchCicloData();
      
      // Reset forms
      setOperatorFormData({
        selected_user_id: "",
        funcao: "",
        data_entrada: new Date().toISOString().split("T")[0],
        resumo_acordo: "",
        modelo_pagamento: "FIXO_MENSAL",
        valor_fixo: "",
        percentual: "",
        base_calculo: "LUCRO_PROJETO",
      });
      setAcordoExpanded(false);
    }
  }, [open, projectId, fetchProjectStatus, fetchEligibleUsers, fetchUsersVinculados, fetchOperadoresProjeto, fetchCicloData]);

  // Refetch after actions
  const refetchAll = async () => {
    await Promise.all([
      fetchProjectStatus(),
      fetchUsersVinculados(),
      fetchOperadoresProjeto(),
      fetchCicloData(),
    ]);
  };

  // Save operator
  const handleSaveOperator = async () => {
    if (!operatorFormData.selected_user_id) {
      toast.error("Selecione um usuário");
      return;
    }

    if (!workspaceId) {
      toast.error("Workspace não identificado");
      return;
    }

    setLoading(true);
    try {
      const { data: session } = await supabase.auth.getSession();
      if (!session.session) {
        toast.error("Usuário não autenticado");
        return;
      }

      // Validate eligibility
      const { data: isEligible, error: eligibleError } = await supabase
        .rpc("validate_operator_eligibility", {
          _user_id: operatorFormData.selected_user_id,
          _workspace_id: workspaceId
        });

      if (eligibleError || !isEligible) {
        toast.error("Usuário não está elegível para vínculo em projetos");
        return;
      }

      // Get or create operator
      const selectedUser = eligibleUsers.find(u => u.user_id === operatorFormData.selected_user_id);
      let operadorId = selectedUser?.operador_id;

      if (!operadorId) {
        const { data: novoOperador, error: opError } = await supabase
          .from("operadores")
          .insert({
            auth_user_id: operatorFormData.selected_user_id,
            workspace_id: workspaceId,
            user_id: session.session.user.id,
            nome: selectedUser?.display_name || "Operador",
            email: selectedUser?.email,
            cpf: selectedUser?.cpf,
            status: "ATIVO",
          })
          .select("id")
          .single();

        if (opError) {
          toast.error("Erro ao criar registro de operador");
          return;
        }
        operadorId = novoOperador.id;
      }

      // Create link
      const insertData = {
        operador_id: operadorId,
        projeto_id: projectId,
        funcao: operatorFormData.funcao || null,
        data_entrada: operatorFormData.data_entrada,
        status: "ATIVO",
        user_id: session.session.user.id,
        resumo_acordo: operatorFormData.resumo_acordo || null,
        modelo_pagamento: operatorFormData.modelo_pagamento,
        valor_fixo: operatorFormData.valor_fixo ? parseFloat(operatorFormData.valor_fixo) : 0,
        percentual: operatorFormData.percentual ? parseFloat(operatorFormData.percentual) : 0,
        base_calculo: operatorFormData.base_calculo,
      };

      const { error } = await supabase.from("operador_projetos").insert(insertData);

      if (error) throw error;
      
      toast.success("Operador vinculado com sucesso!");
      await refetchAll();
      
      // Reset form for another operator
      setOperatorFormData({
        selected_user_id: "",
        funcao: "",
        data_entrada: new Date().toISOString().split("T")[0],
        resumo_acordo: "",
        modelo_pagamento: "FIXO_MENSAL",
        valor_fixo: "",
        percentual: "",
        base_calculo: "LUCRO_PROJETO",
      });
    } catch (error: any) {
      if (error.code === "23505") {
        toast.error("Este usuário já está vinculado ao projeto");
      } else {
        toast.error("Erro ao vincular: " + error.message);
      }
    } finally {
      setLoading(false);
    }
  };

  // Save cycle
  const handleSaveCycle = async () => {
    if (!cicloFormData.data_inicio || !cicloFormData.data_fim_prevista) {
      toast.error("Preencha as datas do ciclo");
      return;
    }

    if (cicloFormData.tipo_gatilho === "VOLUME" || cicloFormData.tipo_gatilho === "HIBRIDO") {
      if (!cicloFormData.meta_volume) {
        toast.error("Informe a meta para este tipo de ciclo");
        return;
      }
    }

    if (new Date(cicloFormData.data_fim_prevista) <= new Date(cicloFormData.data_inicio)) {
      toast.error("Data fim deve ser posterior à data início");
      return;
    }

    setLoading(true);
    try {
      const { data: session } = await supabase.auth.getSession();
      if (!session.session) {
        toast.error("Usuário não autenticado");
        return;
      }

      // Get next cycle number
      const { data: lastCycle } = await supabase
        .from("projeto_ciclos")
        .select("numero_ciclo")
        .eq("projeto_id", projectId)
        .order("numero_ciclo", { ascending: false })
        .limit(1)
        .maybeSingle();

      const proximoNumero = (lastCycle?.numero_ciclo || 0) + 1;

      const cicloData = {
        data_inicio: cicloFormData.data_inicio,
        data_fim_prevista: cicloFormData.data_fim_prevista,
        tipo_gatilho: cicloFormData.tipo_gatilho,
        meta_volume: cicloFormData.meta_volume ? parseFloat(cicloFormData.meta_volume) : null,
        metrica_acumuladora: cicloFormData.metrica_acumuladora,
        observacoes: cicloFormData.observacoes || null,
        operador_projeto_id: cicloFormData.operador_projeto_id || null,
        user_id: session.session.user.id,
        projeto_id: projectId,
        numero_ciclo: proximoNumero,
        status: "EM_ANDAMENTO",
        valor_acumulado: 0,
        excedente_anterior: 0,
      };

      const { data: novoCiclo, error } = await supabase
        .from("projeto_ciclos")
        .insert(cicloData)
        .select()
        .single();

      if (error) throw error;

      // Check for investor participation
      const { data: projeto } = await supabase
        .from("projetos")
        .select("investidor_id, percentual_investidor, base_calculo_investidor")
        .eq("id", projectId)
        .single();

      if (projeto?.investidor_id && projeto.percentual_investidor > 0) {
        await supabase
          .from("participacao_ciclos")
          .insert({
            user_id: session.session.user.id,
            projeto_id: projectId,
            ciclo_id: novoCiclo.id,
            investidor_id: projeto.investidor_id,
            percentual_aplicado: projeto.percentual_investidor,
            base_calculo: projeto.base_calculo_investidor || "LUCRO_BRUTO",
            lucro_base: 0,
            valor_participacao: 0,
            status: "AGUARDANDO_CICLO",
            tipo_participacao: "LUCRO_CICLO",
            data_apuracao: new Date().toISOString(),
          });
      }

      toast.success("Ciclo criado com sucesso!");
      await refetchAll();
    } catch (error: any) {
      toast.error("Erro ao salvar: " + error.message);
    } finally {
      setLoading(false);
    }
  };

  // Handle operator selection for cycle
  const handleOperadorChange = (operadorProjetoId: string) => {
    const op = operadoresProjeto.find(o => o.id === operadorProjetoId);
    if (op) {
      const dataFim = addDays(new Date(cicloFormData.data_inicio), op.periodo_maximo_dias || 30);
      setCicloFormData({
        ...cicloFormData,
        operador_projeto_id: operadorProjetoId,
        tipo_gatilho: op.tipo_gatilho || "TEMPO",
        meta_volume: op.meta_volume?.toString() || "",
        metrica_acumuladora: op.metrica_acumuladora || "LUCRO",
        data_fim_prevista: dataFim.toISOString().split("T")[0],
      });
    } else {
      setCicloFormData({ ...cicloFormData, operador_projeto_id: operadorProjetoId });
    }
  };

  const handleClose = () => {
    onOpenChange(false);
  };

  const handleFinish = () => {
    onFinish();
    onOpenChange(false);
  };

  // Filter available users
  const usersDisponiveis = eligibleUsers.filter(
    user => !usersVinculados.includes(user.user_id)
  );

  const showValorFixo = ["FIXO_MENSAL", "HIBRIDO"].includes(operatorFormData.modelo_pagamento);
  const showPercentual = ["PORCENTAGEM", "HIBRIDO", "PROPORCIONAL_LUCRO", "COMISSAO_ESCALONADA"].includes(operatorFormData.modelo_pagamento);
  const showVolumeFields = cicloFormData.tipo_gatilho === "VOLUME" || cicloFormData.tipo_gatilho === "HIBRIDO";

  const getEligibilityBadge = (user: EligibleUser) => {
    if (user.eligible_by_role) {
      return (
        <Badge variant="outline" className="text-xs flex-shrink-0 whitespace-nowrap px-1.5 py-0.5">
          <User className="h-3 w-3 mr-1" />
          {ROLE_LABELS[user.role_base] || user.role_base}
        </Badge>
      );
    }
    if (user.eligible_by_extra) {
      return (
        <Badge variant="secondary" className="text-xs flex-shrink-0 whitespace-nowrap px-1.5 py-0.5">
          <Shield className="h-3 w-3 mr-1" />
          Extra
        </Badge>
      );
    }
    return null;
  };

  // Stepper component
  const WizardStepper = () => (
    <div className="flex items-center justify-center gap-2 mb-6 text-sm">
      {/* Step 1: Choose */}
      <div className={cn(
        "flex items-center gap-1.5 px-3 py-1.5 rounded-full transition-colors",
        step === "choose" ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"
      )}>
        <span className="w-5 h-5 flex items-center justify-center rounded-full bg-background/20 text-xs font-medium">1</span>
        <span className="hidden sm:inline">Escolher</span>
      </div>
      
      <ChevronRight className="h-4 w-4 text-muted-foreground" />
      
      {/* Step 2: Operator */}
      <div className={cn(
        "flex items-center gap-1.5 px-3 py-1.5 rounded-full transition-colors",
        step === "linkOperator" ? "bg-primary text-primary-foreground" : 
        hasOperatorLinked ? "bg-success/20 text-success" : "bg-muted text-muted-foreground"
      )}>
        {hasOperatorLinked ? (
          <Check className="h-4 w-4" />
        ) : (
          <Users className="h-4 w-4" />
        )}
        <span className="hidden sm:inline">Operador</span>
      </div>
      
      <ChevronRight className="h-4 w-4 text-muted-foreground" />
      
      {/* Step 3: Cycle */}
      <div className={cn(
        "flex items-center gap-1.5 px-3 py-1.5 rounded-full transition-colors",
        step === "createCycle" ? "bg-primary text-primary-foreground" : 
        hasCycle ? "bg-success/20 text-success" : "bg-muted text-muted-foreground"
      )}>
        {hasCycle ? (
          <Check className="h-4 w-4" />
        ) : (
          <Calendar className="h-4 w-4" />
        )}
        <span className="hidden sm:inline">Ciclo</span>
      </div>
      
      <ChevronRight className="h-4 w-4 text-muted-foreground" />
      
      {/* Step 4: Done */}
      <div className={cn(
        "flex items-center gap-1.5 px-3 py-1.5 rounded-full transition-colors",
        step === "done" ? "bg-success text-success-foreground" : "bg-muted text-muted-foreground"
      )}>
        <Sparkles className="h-4 w-4" />
        <span className="hidden sm:inline">Concluir</span>
      </div>
    </div>
  );

  // Step: Choose what to do
  const ChooseStep = () => (
    <div className="space-y-4">
      <div className="text-center space-y-2">
        <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-success/10 mb-2">
          <CheckCircle2 className="h-6 w-6 text-success" />
        </div>
        <h3 className="text-lg font-semibold">Projeto "{projectName}" criado!</h3>
        <p className="text-sm text-muted-foreground">
          Essas etapas são opcionais, mas recomendadas para configurar seu projeto.
        </p>
      </div>

      {/* Status badges */}
      <div className="flex justify-center gap-3">
        <Badge variant={hasOperatorLinked ? "default" : "outline"} className="gap-1.5">
          {hasOperatorLinked ? <Check className="h-3 w-3" /> : <Users className="h-3 w-3" />}
          Operador {hasOperatorLinked ? "vinculado" : "pendente"}
        </Badge>
        <Badge variant={hasCycle ? "default" : "outline"} className="gap-1.5">
          {hasCycle ? <Check className="h-3 w-3" /> : <Calendar className="h-3 w-3" />}
          Ciclo {hasCycle ? "criado" : "pendente"}
        </Badge>
      </div>

      <div className="space-y-2 pt-2">
        <Button 
          variant="outline" 
          className="w-full justify-between h-14 px-4"
          onClick={() => setStep("linkOperator")}
        >
          <div className="flex items-center gap-3">
            <div className={cn(
              "p-2 rounded-lg",
              hasOperatorLinked ? "bg-success/10" : "bg-primary/10"
            )}>
              <Users className={cn("h-5 w-5", hasOperatorLinked ? "text-success" : "text-primary")} />
            </div>
            <div className="text-left">
              <p className="font-medium">{hasOperatorLinked ? "Adicionar outro operador" : "Vincular Operador"}</p>
              <p className="text-xs text-muted-foreground">Atribua usuários ao projeto</p>
            </div>
          </div>
          <ArrowRight className="h-4 w-4 text-muted-foreground" />
        </Button>

        <Button 
          variant="outline" 
          className="w-full justify-between h-14 px-4"
          onClick={() => setStep("createCycle")}
        >
          <div className="flex items-center gap-3">
            <div className={cn(
              "p-2 rounded-lg",
              hasCycle ? "bg-success/10" : "bg-primary/10"
            )}>
              <Calendar className={cn("h-5 w-5", hasCycle ? "text-success" : "text-primary")} />
            </div>
            <div className="text-left">
              <p className="font-medium">{hasCycle ? "Criar outro ciclo" : "Criar Primeiro Ciclo"}</p>
              <p className="text-xs text-muted-foreground">Configure o período operacional</p>
            </div>
          </div>
          <ArrowRight className="h-4 w-4 text-muted-foreground" />
        </Button>
      </div>

      <div className="flex justify-between pt-4 border-t">
        <Button variant="ghost" onClick={handleClose} className="gap-2">
          <SkipForward className="h-4 w-4" />
          Fazer Depois
        </Button>
        {(hasOperatorLinked || hasCycle) && (
          <Button onClick={() => setStep("done")} className="gap-2">
            Concluir
            <ArrowRight className="h-4 w-4" />
          </Button>
        )}
      </div>
    </div>
  );

  // Step: Link Operator
  const LinkOperatorStep = () => (
    <div className="space-y-4">
      {hasOperatorLinked && (
        <div className="p-3 rounded-lg bg-success/10 border border-success/20 flex items-center gap-2">
          <Check className="h-4 w-4 text-success" />
          <span className="text-sm text-success">Operador já vinculado ao projeto</span>
        </div>
      )}

      <div className="space-y-4">
        <div className="space-y-2">
          <Label>Usuário Elegível *</Label>
          <Select
            value={operatorFormData.selected_user_id}
            onValueChange={(value) => setOperatorFormData({ ...operatorFormData, selected_user_id: value })}
          >
            <SelectTrigger className="h-11">
              {operatorFormData.selected_user_id ? (
                <div className="flex items-center gap-2 w-full">
                  <span className="truncate">
                    {usersDisponiveis.find(u => u.user_id === operatorFormData.selected_user_id)?.display_name}
                  </span>
                  {usersDisponiveis.find(u => u.user_id === operatorFormData.selected_user_id) && 
                    getEligibilityBadge(usersDisponiveis.find(u => u.user_id === operatorFormData.selected_user_id)!)}
                </div>
              ) : (
                <span className="text-muted-foreground">Selecione um usuário elegível</span>
              )}
            </SelectTrigger>
            <SelectContent>
              {usersDisponiveis.length === 0 ? (
                <SelectItem value="none" disabled>
                  Nenhum usuário elegível disponível
                </SelectItem>
              ) : (
                usersDisponiveis.map((user) => (
                  <SelectItem key={user.user_id} value={user.user_id}>
                    <div className="flex items-center gap-2">
                      <span className="truncate max-w-[160px]">{user.display_name}</span>
                      {getEligibilityBadge(user)}
                    </div>
                  </SelectItem>
                ))
              )}
            </SelectContent>
          </Select>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label>Função no Projeto</Label>
            <Input
              value={operatorFormData.funcao}
              onChange={(e) => setOperatorFormData({ ...operatorFormData, funcao: e.target.value })}
              placeholder="Ex: Trader, Analista"
            />
          </div>
          <div className="space-y-2">
            <Label>Data de Entrada</Label>
            <DatePicker
              value={operatorFormData.data_entrada}
              onChange={(date) => setOperatorFormData({ ...operatorFormData, data_entrada: date })}
            />
          </div>
        </div>

        <div className="space-y-2">
          <Label>Resumo do Acordo</Label>
          <Textarea
            value={operatorFormData.resumo_acordo}
            onChange={(e) => setOperatorFormData({ ...operatorFormData, resumo_acordo: e.target.value })}
            placeholder="Descreva os termos do acordo (opcional)"
            rows={2}
          />
        </div>

        <Collapsible open={acordoExpanded} onOpenChange={setAcordoExpanded}>
          <CollapsibleTrigger asChild>
            <Button variant="outline" className="w-full justify-between" size="sm">
              <div className="flex items-center gap-2">
                <FileText className="h-4 w-4" />
                <span>Referência do Acordo (opcional)</span>
              </div>
              {acordoExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
            </Button>
          </CollapsibleTrigger>
          <CollapsibleContent className="pt-4 space-y-4">
            <div className="p-3 rounded-lg bg-muted/50 border">
              <p className="text-xs text-muted-foreground">
                ℹ️ Campos apenas para referência, não usados em cálculos automáticos.
              </p>
            </div>

            <div className="space-y-2">
              <Label>Modelo de Pagamento</Label>
              <Select
                value={operatorFormData.modelo_pagamento}
                onValueChange={(value) => setOperatorFormData({ ...operatorFormData, modelo_pagamento: value })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {MODELOS_PAGAMENTO.map((modelo) => (
                    <SelectItem key={modelo.value} value={modelo.value}>
                      {modelo.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-2 gap-4">
              {showValorFixo && (
                <div className="space-y-2">
                  <Label>Valor Fixo (R$)</Label>
                  <Input
                    type="number"
                    step="0.01"
                    min="0"
                    value={operatorFormData.valor_fixo}
                    onChange={(e) => setOperatorFormData({ ...operatorFormData, valor_fixo: e.target.value })}
                    placeholder="0,00"
                  />
                </div>
              )}
              {showPercentual && (
                <div className="space-y-2">
                  <Label>Percentual (%)</Label>
                  <Input
                    type="number"
                    step="0.1"
                    min="0"
                    max="100"
                    value={operatorFormData.percentual}
                    onChange={(e) => setOperatorFormData({ ...operatorFormData, percentual: e.target.value })}
                    placeholder="0"
                  />
                </div>
              )}
            </div>

            <div className="space-y-2">
              <Label>Base de Cálculo</Label>
              <Select
                value={operatorFormData.base_calculo}
                onValueChange={(value) => setOperatorFormData({ ...operatorFormData, base_calculo: value })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {BASES_CALCULO.map((base) => (
                    <SelectItem key={base.value} value={base.value}>
                      {base.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </CollapsibleContent>
        </Collapsible>
      </div>

      <div className="flex justify-between pt-4 border-t">
        <Button variant="outline" onClick={() => setStep("choose")} className="gap-2">
          <ChevronLeft className="h-4 w-4" />
          Voltar
        </Button>
        <div className="flex gap-2">
          <Button 
            onClick={handleSaveOperator} 
            disabled={loading || !operatorFormData.selected_user_id}
          >
            {loading ? "Vinculando..." : "Vincular Operador"}
          </Button>
        </div>
      </div>

      {/* Success CTAs */}
      {hasOperatorLinked && (
        <div className="flex flex-col gap-2 pt-2 border-t">
          <p className="text-sm text-muted-foreground text-center">Próximos passos:</p>
          <div className="flex gap-2">
            {!hasCycle && (
              <Button variant="outline" className="flex-1 gap-2" onClick={() => setStep("createCycle")}>
                <Calendar className="h-4 w-4" />
                Criar Primeiro Ciclo
              </Button>
            )}
            <Button variant="default" className="flex-1 gap-2" onClick={() => setStep("done")}>
              Concluir
              <ArrowRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );

  // Step: Create Cycle
  const CreateCycleStep = () => (
    <div className="space-y-4">
      {hasCycle && (
        <div className="p-3 rounded-lg bg-success/10 border border-success/20 flex items-center gap-2">
          <Check className="h-4 w-4 text-success" />
          <span className="text-sm text-success">Já existe um ciclo criado</span>
        </div>
      )}

      <div className="space-y-4">
        {operadoresProjeto.length > 0 && (
          <div className="space-y-2">
            <Label>Operador Vinculado (opcional)</Label>
            <Select
              value={cicloFormData.operador_projeto_id}
              onValueChange={handleOperadorChange}
            >
              <SelectTrigger>
                <SelectValue placeholder="Ciclo geral do projeto" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="">Ciclo geral do projeto</SelectItem>
                {operadoresProjeto.map((op) => (
                  <SelectItem key={op.id} value={op.id}>
                    {op.operador?.nome} - {TIPOS_GATILHO.find(t => t.value === op.tipo_gatilho)?.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}

        <div className="space-y-2">
          <Label>Tipo de Gatilho *</Label>
          <Select
            value={cicloFormData.tipo_gatilho}
            onValueChange={(value) => setCicloFormData({ ...cicloFormData, tipo_gatilho: value })}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {TIPOS_GATILHO.map((tipo) => (
                <SelectItem key={tipo.value} value={tipo.value}>
                  <div className="flex items-center gap-2">
                    <tipo.icon className="h-4 w-4" />
                    {tipo.label}
                  </div>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {showVolumeFields && (
          <>
            <div className="space-y-2">
              <Label>Métrica Acumuladora *</Label>
              <Select
                value={cicloFormData.metrica_acumuladora}
                onValueChange={(value) => setCicloFormData({ ...cicloFormData, metrica_acumuladora: value })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {METRICAS.map((m) => (
                    <SelectItem key={m.value} value={m.value}>
                      {m.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>
                {cicloFormData.metrica_acumuladora === "LUCRO" ? "Meta de Lucro (R$)" : "Meta de Volume (R$)"} *
              </Label>
              <Input
                type="number"
                step="100"
                min="0"
                value={cicloFormData.meta_volume}
                onChange={(e) => setCicloFormData({ ...cicloFormData, meta_volume: e.target.value })}
                placeholder={cicloFormData.metrica_acumuladora === "LUCRO" ? "5000" : "150000"}
              />
            </div>
          </>
        )}

        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label>Data Início *</Label>
            <DatePicker
              value={cicloFormData.data_inicio}
              onChange={(date) => setCicloFormData({ ...cicloFormData, data_inicio: date })}
            />
          </div>
          <div className="space-y-2">
            <Label>{cicloFormData.tipo_gatilho === "VOLUME" ? "Data Limite" : "Data Fim Prevista"} *</Label>
            <DatePicker
              value={cicloFormData.data_fim_prevista}
              onChange={(date) => setCicloFormData({ ...cicloFormData, data_fim_prevista: date })}
            />
          </div>
        </div>

        <div className="space-y-2">
          <Label>Observações</Label>
          <Textarea
            value={cicloFormData.observacoes}
            onChange={(e) => setCicloFormData({ ...cicloFormData, observacoes: e.target.value })}
            placeholder="Notas sobre este ciclo..."
            rows={2}
          />
        </div>
      </div>

      <div className="flex justify-between pt-4 border-t">
        <Button variant="outline" onClick={() => setStep("choose")} className="gap-2">
          <ChevronLeft className="h-4 w-4" />
          Voltar
        </Button>
        <Button onClick={handleSaveCycle} disabled={loading}>
          {loading ? "Criando..." : "Criar Ciclo"}
        </Button>
      </div>

      {/* Success CTAs */}
      {hasCycle && (
        <div className="flex flex-col gap-2 pt-2 border-t">
          <p className="text-sm text-muted-foreground text-center">Próximos passos:</p>
          <div className="flex gap-2">
            {!hasOperatorLinked && (
              <Button variant="outline" className="flex-1 gap-2" onClick={() => setStep("linkOperator")}>
                <Users className="h-4 w-4" />
                Vincular Operador
              </Button>
            )}
            <Button variant="default" className="flex-1 gap-2" onClick={() => setStep("done")}>
              Concluir
              <ArrowRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );

  // Step: Done
  const DoneStep = () => (
    <div className="space-y-6">
      <div className="text-center space-y-2">
        <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-success/10 mb-2">
          <Sparkles className="h-8 w-8 text-success" />
        </div>
        <h3 className="text-xl font-semibold">Projeto Configurado!</h3>
        <p className="text-sm text-muted-foreground">
          Seu projeto está pronto para operação.
        </p>
      </div>

      {/* Summary */}
      <div className="space-y-3 p-4 rounded-lg bg-muted/50 border">
        <h4 className="font-medium text-sm">Resumo da Configuração</h4>
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">Operador vinculado</span>
            <Badge variant={hasOperatorLinked ? "default" : "secondary"} className="gap-1">
              {hasOperatorLinked ? <Check className="h-3 w-3" /> : null}
              {hasOperatorLinked ? "Sim" : "Não"}
            </Badge>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">Ciclo criado</span>
            <Badge variant={hasCycle ? "default" : "secondary"} className="gap-1">
              {hasCycle ? <Check className="h-3 w-3" /> : null}
              {hasCycle ? "Sim" : "Não"}
            </Badge>
          </div>
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <Button onClick={handleFinish} className="w-full gap-2">
          <ArrowRight className="h-4 w-4" />
          Ver Projeto
        </Button>
        <Button variant="outline" onClick={() => setStep("choose")} className="w-full gap-2">
          <ChevronLeft className="h-4 w-4" />
          Adicionar mais configurações
        </Button>
      </div>
    </div>
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {step === "choose" && "Próximos Passos"}
            {step === "linkOperator" && "Vincular Operador"}
            {step === "createCycle" && "Criar Ciclo"}
            {step === "done" && "Configuração Concluída"}
          </DialogTitle>
          {step !== "done" && (
            <DialogDescription>
              {step === "choose" && "Configure seu projeto com operadores e ciclos"}
              {step === "linkOperator" && "Vincule usuários elegíveis ao projeto"}
              {step === "createCycle" && "Configure o primeiro ciclo operacional"}
            </DialogDescription>
          )}
        </DialogHeader>

        <WizardStepper />

        {step === "choose" && <ChooseStep />}
        {step === "linkOperator" && <LinkOperatorStep />}
        {step === "createCycle" && <CreateCycleStep />}
        {step === "done" && <DoneStep />}
      </DialogContent>
    </Dialog>
  );
}
