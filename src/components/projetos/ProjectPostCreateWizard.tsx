import { useState, useEffect, useCallback, useMemo, useRef } from "react";
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
import { Separator } from "@/components/ui/separator";
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
  SkipForward,
  Plus,
  RotateCcw
} from "lucide-react";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { addMonths, addDays, format } from "date-fns";
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

// Memoized Stepper Component
const WizardStepper = ({ 
  step, 
  hasOperatorLinked, 
  hasCycle 
}: { 
  step: WizardStep; 
  hasOperatorLinked: boolean; 
  hasCycle: boolean;
}) => (
  <div className="flex items-center justify-center gap-1 sm:gap-2 py-3 px-2 bg-muted/30 rounded-lg overflow-x-hidden">
    <div className={cn(
      "flex items-center gap-1 px-2 py-1 rounded-full transition-colors text-xs sm:text-sm shrink-0",
      step === "choose" ? "bg-primary text-primary-foreground" : "bg-background text-muted-foreground"
    )}>
      <span className="w-4 h-4 sm:w-5 sm:h-5 flex items-center justify-center rounded-full bg-background/20 text-[10px] sm:text-xs font-medium">1</span>
      <span className="hidden sm:inline">Escolher</span>
    </div>
    
    <ChevronRight className="h-3 w-3 sm:h-4 sm:w-4 text-muted-foreground shrink-0" />
    
    <div className={cn(
      "flex items-center gap-1 px-2 py-1 rounded-full transition-colors text-xs sm:text-sm shrink-0",
      step === "linkOperator" ? "bg-primary text-primary-foreground" : 
      hasOperatorLinked ? "bg-success/20 text-success" : "bg-background text-muted-foreground"
    )}>
      {hasOperatorLinked ? <Check className="h-3 w-3 sm:h-4 sm:w-4" /> : <Users className="h-3 w-3 sm:h-4 sm:w-4" />}
      <span className="hidden sm:inline">Operador</span>
    </div>
    
    <ChevronRight className="h-3 w-3 sm:h-4 sm:w-4 text-muted-foreground shrink-0" />
    
    <div className={cn(
      "flex items-center gap-1 px-2 py-1 rounded-full transition-colors text-xs sm:text-sm shrink-0",
      step === "createCycle" ? "bg-primary text-primary-foreground" : 
      hasCycle ? "bg-success/20 text-success" : "bg-background text-muted-foreground"
    )}>
      {hasCycle ? <Check className="h-3 w-3 sm:h-4 sm:w-4" /> : <Calendar className="h-3 w-3 sm:h-4 sm:w-4" />}
      <span className="hidden sm:inline">Ciclo</span>
    </div>
    
    <ChevronRight className="h-3 w-3 sm:h-4 sm:w-4 text-muted-foreground shrink-0" />
    
    <div className={cn(
      "flex items-center gap-1 px-2 py-1 rounded-full transition-colors text-xs sm:text-sm shrink-0",
      step === "done" ? "bg-success text-success-foreground" : "bg-background text-muted-foreground"
    )}>
      <Sparkles className="h-3 w-3 sm:h-4 sm:w-4" />
      <span className="hidden sm:inline">Concluir</span>
    </div>
  </div>
);

function getEligibilityBadge(user: EligibleUser) {
  if (user.eligible_by_role) {
    return (
      <Badge variant="outline" className="text-xs shrink-0 whitespace-nowrap px-1.5 py-0.5">
        <User className="h-3 w-3 mr-1" />
        {ROLE_LABELS[user.role_base] || user.role_base}
      </Badge>
    );
  }
  if (user.eligible_by_extra) {
    return (
      <Badge variant="secondary" className="text-xs shrink-0 whitespace-nowrap px-1.5 py-0.5">
        <Shield className="h-3 w-3 mr-1" />
        Extra
      </Badge>
    );
  }
  return null;
}

// Created cycle info for success screen
interface CreatedCycleInfo {
  numero_ciclo: number;
  data_inicio: string;
  data_fim_prevista: string;
  tipo_gatilho: string;
  meta_volume: number | null;
  metrica_acumuladora: string;
}

export function ProjectPostCreateWizard({
  open,
  onOpenChange,
  projectId,
  projectName,
  onFinish,
}: ProjectPostCreateWizardProps) {
  const { workspaceId } = useWorkspace();
  
  // Stable "today" value to avoid re-renders - computed once on mount
  const todayRef = useRef(new Date().toISOString().split("T")[0]);
  const defaultEndDateRef = useRef(addMonths(new Date(), 1).toISOString().split("T")[0]);
  
  // Wizard state
  const [step, setStep] = useState<WizardStep>("choose");
  const [hasOperatorLinked, setHasOperatorLinked] = useState(false);
  const [hasCycle, setHasCycle] = useState(false);
  const [loading, setLoading] = useState(false);
  
  // Cycle success state (for "create another?" flow)
  const [cycleCreatedSuccess, setCycleCreatedSuccess] = useState(false);
  const [createdCycleInfo, setCreatedCycleInfo] = useState<CreatedCycleInfo | null>(null);
  const [isSubmittingCycle, setIsSubmittingCycle] = useState(false);
  
  // Operator form state
  const [eligibleUsers, setEligibleUsers] = useState<EligibleUser[]>([]);
  const [usersVinculados, setUsersVinculados] = useState<string[]>([]);
  const [acordoExpanded, setAcordoExpanded] = useState(false);
  
  // Separate state for each field to avoid re-renders
  const [opSelectedUserId, setOpSelectedUserId] = useState("");
  const [opFuncao, setOpFuncao] = useState("");
  const [opDataEntrada, setOpDataEntrada] = useState(todayRef.current);
  const [opResumoAcordo, setOpResumoAcordo] = useState("");
  const [opModeloPagamento, setOpModeloPagamento] = useState("FIXO_MENSAL");
  const [opValorFixo, setOpValorFixo] = useState("");
  const [opPercentual, setOpPercentual] = useState("");
  const [opBaseCalculo, setOpBaseCalculo] = useState("LUCRO_PROJETO");
  
  // Cycle form state
  const [operadoresProjeto, setOperadoresProjeto] = useState<OperadorProjeto[]>([]);
  const [cicloOperadorProjetoId, setCicloOperadorProjetoId] = useState("");
  const [cicloDataInicio, setCicloDataInicio] = useState(todayRef.current);
  const [cicloDataFimPrevista, setCicloDataFimPrevista] = useState(defaultEndDateRef.current);
  const [cicloTipoGatilho, setCicloTipoGatilho] = useState("TEMPO");
  const [cicloMetaVolume, setCicloMetaVolume] = useState("");
  const [cicloMetricaAcumuladora, setCicloMetricaAcumuladora] = useState("LUCRO");
  const [cicloObservacoes, setCicloObservacoes] = useState("");

  // Derived values
  const showValorFixo = ["FIXO_MENSAL", "HIBRIDO"].includes(opModeloPagamento);
  const showPercentual = ["PORCENTAGEM", "HIBRIDO", "PROPORCIONAL_LUCRO", "COMISSAO_ESCALONADA"].includes(opModeloPagamento);
  const showVolumeFields = cicloTipoGatilho === "VOLUME" || cicloTipoGatilho === "HIBRIDO";

  const usersDisponiveis = useMemo(() => 
    eligibleUsers.filter(user => !usersVinculados.includes(user.user_id)),
    [eligibleUsers, usersVinculados]
  );

  // Fetch functions
  const fetchProjectStatus = useCallback(async () => {
    if (!projectId) return;
    
    const { data: operators } = await supabase
      .from("operador_projetos")
      .select("id")
      .eq("projeto_id", projectId)
      .eq("status", "ATIVO")
      .limit(1);
    
    setHasOperatorLinked((operators?.length || 0) > 0);
    
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

  // Fetch cycle data - use today as default, or sequential dates if cycles exist
  const fetchCicloData = useCallback(async (forceToday = false) => {
    if (!projectId) return;
    
    // When forceToday is true, we're resetting for a new cycle after success
    if (forceToday) {
      const today = new Date();
      const endDate = addMonths(today, 1);
      setCicloDataInicio(today.toISOString().split("T")[0]);
      setCicloDataFimPrevista(endDate.toISOString().split("T")[0]);
      return;
    }
    
    const { data: lastCycle } = await supabase
      .from("projeto_ciclos")
      .select("data_fim_prevista")
      .eq("projeto_id", projectId)
      .order("numero_ciclo", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (lastCycle) {
      // Sequential dates based on last cycle
      const novaDataInicio = addDays(new Date(lastCycle.data_fim_prevista), 1);
      const novaDataFim = addMonths(novaDataInicio, 1);
      setCicloDataInicio(novaDataInicio.toISOString().split("T")[0]);
      setCicloDataFimPrevista(novaDataFim.toISOString().split("T")[0]);
    } else {
      // First cycle: default to TODAY (not project start date)
      const today = new Date();
      const dataFim = addMonths(today, 1);
      setCicloDataInicio(today.toISOString().split("T")[0]);
      setCicloDataFimPrevista(dataFim.toISOString().split("T")[0]);
    }
  }, [projectId]);

  // Reset forms
  const resetOperatorForm = useCallback(() => {
    setOpSelectedUserId("");
    setOpFuncao("");
    setOpDataEntrada(todayRef.current);
    setOpResumoAcordo("");
    setOpModeloPagamento("FIXO_MENSAL");
    setOpValorFixo("");
    setOpPercentual("");
    setOpBaseCalculo("LUCRO_PROJETO");
    setAcordoExpanded(false);
  }, []);

  // Reset cycle form for "create another" flow
  const resetCycleForm = useCallback(() => {
    setCicloOperadorProjetoId("");
    setCicloTipoGatilho("TEMPO");
    setCicloMetaVolume("");
    setCicloMetricaAcumuladora("LUCRO");
    setCicloObservacoes("");
    setCycleCreatedSuccess(false);
    setCreatedCycleInfo(null);
  }, []);

  useEffect(() => {
    if (open && projectId) {
      setStep("choose");
      setCycleCreatedSuccess(false);
      setCreatedCycleInfo(null);
      fetchProjectStatus();
      fetchEligibleUsers();
      fetchUsersVinculados();
      fetchOperadoresProjeto();
      fetchCicloData();
      resetOperatorForm();
      resetCycleForm();
    }
  }, [open, projectId, fetchProjectStatus, fetchEligibleUsers, fetchUsersVinculados, fetchOperadoresProjeto, fetchCicloData, resetOperatorForm, resetCycleForm]);

  const refetchAll = async () => {
    await Promise.all([
      fetchProjectStatus(),
      fetchUsersVinculados(),
      fetchOperadoresProjeto(),
    ]);
  };

  // Save operator
  const handleSaveOperator = async () => {
    if (!opSelectedUserId) {
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

      const { data: isEligible, error: eligibleError } = await supabase
        .rpc("validate_operator_eligibility", {
          _user_id: opSelectedUserId,
          _workspace_id: workspaceId
        });

      if (eligibleError || !isEligible) {
        toast.error("Usuário não está elegível para vínculo em projetos");
        return;
      }

      const selectedUser = eligibleUsers.find(u => u.user_id === opSelectedUserId);
      let operadorId = selectedUser?.operador_id;

      if (!operadorId) {
        const { data: novoOperador, error: opError } = await supabase
          .from("operadores")
          .insert({
            auth_user_id: opSelectedUserId,
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

      const insertData = {
        operador_id: operadorId,
        projeto_id: projectId,
        funcao: opFuncao || null,
        data_entrada: opDataEntrada,
        status: "ATIVO",
        user_id: session.session.user.id,
        workspace_id: workspaceId,
        resumo_acordo: opResumoAcordo || null,
        modelo_pagamento: opModeloPagamento,
        valor_fixo: opValorFixo ? parseFloat(opValorFixo) : 0,
        percentual: opPercentual ? parseFloat(opPercentual) : 0,
        base_calculo: opBaseCalculo,
      };

      const { error } = await supabase.from("operador_projetos").insert(insertData);

      if (error) throw error;
      
      toast.success("Operador vinculado com sucesso!");
      await refetchAll();
      resetOperatorForm();
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

  // Handle operator selection for cycle
  const handleOperadorChange = (operadorProjetoId: string) => {
    const op = operadoresProjeto.find(o => o.id === operadorProjetoId);
    if (op) {
      const dataFim = addDays(new Date(cicloDataInicio), op.periodo_maximo_dias || 30);
      setCicloOperadorProjetoId(operadorProjetoId);
      setCicloTipoGatilho(op.tipo_gatilho || "TEMPO");
      setCicloMetaVolume(op.meta_volume?.toString() || "");
      setCicloMetricaAcumuladora(op.metrica_acumuladora || "LUCRO");
      setCicloDataFimPrevista(dataFim.toISOString().split("T")[0]);
    } else {
      setCicloOperadorProjetoId(operadorProjetoId);
    }
  };

  // Save cycle with duplicate prevention
  const handleSaveCycle = async () => {
    // Prevent double submit
    if (isSubmittingCycle || loading) return;
    
    if (!cicloDataInicio || !cicloDataFimPrevista) {
      toast.error("Preencha as datas do ciclo");
      return;
    }

    if (cicloTipoGatilho === "VOLUME" || cicloTipoGatilho === "HIBRIDO") {
      if (!cicloMetaVolume) {
        toast.error("Informe a meta para este tipo de ciclo");
        return;
      }
    }

    if (new Date(cicloDataFimPrevista) <= new Date(cicloDataInicio)) {
      toast.error("Data fim deve ser posterior à data início");
      return;
    }

    setIsSubmittingCycle(true);
    setLoading(true);
    try {
      const { data: session } = await supabase.auth.getSession();
      if (!session.session) {
        toast.error("Usuário não autenticado");
        return;
      }

      // Backend duplicate check: prevent creating identical cycle in the last 60 seconds
      const sixtySecondsAgo = new Date(Date.now() - 60000).toISOString();
      const { data: recentDuplicate } = await supabase
        .from("projeto_ciclos")
        .select("id, numero_ciclo")
        .eq("projeto_id", projectId)
        .eq("data_inicio", cicloDataInicio)
        .eq("data_fim_prevista", cicloDataFimPrevista)
        .eq("tipo_gatilho", cicloTipoGatilho)
        .gte("created_at", sixtySecondsAgo)
        .limit(1)
        .maybeSingle();

      if (recentDuplicate) {
        toast.error("Ciclo idêntico já foi criado recentemente. Use 'Criar outro ciclo' para adicionar um novo.");
        return;
      }

      const { data: lastCycle } = await supabase
        .from("projeto_ciclos")
        .select("numero_ciclo")
        .eq("projeto_id", projectId)
        .order("numero_ciclo", { ascending: false })
        .limit(1)
        .maybeSingle();

      const proximoNumero = (lastCycle?.numero_ciclo || 0) + 1;

      if (!workspaceId) {
        throw new Error("Workspace não disponível");
      }

      const cicloData = {
        data_inicio: cicloDataInicio,
        data_fim_prevista: cicloDataFimPrevista,
        tipo_gatilho: cicloTipoGatilho,
        meta_volume: cicloMetaVolume ? parseFloat(cicloMetaVolume) : null,
        metrica_acumuladora: cicloMetricaAcumuladora,
        observacoes: cicloObservacoes || null,
        operador_projeto_id: cicloOperadorProjetoId || null,
        user_id: session.session.user.id,
        workspace_id: workspaceId,
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
            workspace_id: workspaceId,
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

      // Show success state with cycle info
      setCreatedCycleInfo({
        numero_ciclo: proximoNumero,
        data_inicio: cicloDataInicio,
        data_fim_prevista: cicloDataFimPrevista,
        tipo_gatilho: cicloTipoGatilho,
        meta_volume: cicloMetaVolume ? parseFloat(cicloMetaVolume) : null,
        metrica_acumuladora: cicloMetricaAcumuladora,
      });
      setCycleCreatedSuccess(true);
      
      toast.success(`Ciclo ${proximoNumero} criado com sucesso!`);
      await refetchAll();
      await fetchProjectStatus(); // Update hasCycle
    } catch (error: any) {
      toast.error("Erro ao salvar: " + error.message);
    } finally {
      setLoading(false);
      setIsSubmittingCycle(false);
    }
  };

  // Handle "Create another cycle"
  const handleCreateAnotherCycle = async () => {
    resetCycleForm();
    // Fetch new sequential dates based on the cycle we just created
    await fetchCicloData();
  };

  const handleClose = () => {
    onOpenChange(false);
  };

  const handleFinish = () => {
    onFinish();
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[calc(100vw-2rem)] max-w-[720px] max-h-[88vh] p-0 gap-0 overflow-hidden">
        {/* Header */}
        <div className="px-6 pt-6 pb-4 border-b bg-background">
          <DialogHeader className="space-y-1">
            <DialogTitle className="text-lg font-semibold">
              {step === "choose" && "Próximos Passos"}
              {step === "linkOperator" && "Vincular Operador"}
              {step === "createCycle" && "Criar Ciclo"}
              {step === "done" && "Configuração Concluída"}
            </DialogTitle>
            {step !== "done" && (
              <DialogDescription className="text-sm">
                {step === "choose" && "Configure seu projeto com operadores e ciclos"}
                {step === "linkOperator" && "Vincule usuários elegíveis ao projeto"}
                {step === "createCycle" && "Configure o primeiro ciclo operacional"}
              </DialogDescription>
            )}
          </DialogHeader>
          
          <div className="mt-4">
            <WizardStepper step={step} hasOperatorLinked={hasOperatorLinked} hasCycle={hasCycle} />
          </div>
        </div>

        {/* Content - scrollable */}
        <div className="flex-1 overflow-y-auto overflow-x-hidden px-6 py-6">
          {step === "choose" && (
            <div className="space-y-6">
              <div className="text-center space-y-3">
                <div className="inline-flex items-center justify-center w-14 h-14 rounded-full bg-success/10">
                  <CheckCircle2 className="h-7 w-7 text-success" />
                </div>
                <h3 className="text-lg font-semibold">Projeto "{projectName}" criado!</h3>
                <p className="text-sm text-muted-foreground">
                  Essas etapas são opcionais, mas recomendadas para configurar seu projeto.
                </p>
              </div>

              <div className="flex flex-wrap justify-center gap-2">
                <Badge variant={hasOperatorLinked ? "default" : "outline"} className="gap-1.5">
                  {hasOperatorLinked ? <Check className="h-3 w-3" /> : <Users className="h-3 w-3" />}
                  Operador {hasOperatorLinked ? "vinculado" : "pendente"}
                </Badge>
                <Badge variant={hasCycle ? "default" : "outline"} className="gap-1.5">
                  {hasCycle ? <Check className="h-3 w-3" /> : <Calendar className="h-3 w-3" />}
                  Ciclo {hasCycle ? "criado" : "pendente"}
                </Badge>
              </div>

              <div className="space-y-3">
                <Button 
                  variant="outline" 
                  className="w-full justify-between h-16 px-4"
                  onClick={() => setStep("linkOperator")}
                >
                  <div className="flex items-center gap-3">
                    <div className={cn(
                      "p-2.5 rounded-lg",
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
                  className="w-full justify-between h-16 px-4"
                  onClick={() => setStep("createCycle")}
                >
                  <div className="flex items-center gap-3">
                    <div className={cn(
                      "p-2.5 rounded-lg",
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
            </div>
          )}

          {step === "linkOperator" && (
            <div className="space-y-5">
              {hasOperatorLinked && (
                <div className="p-3 rounded-lg bg-success/10 border border-success/20 flex items-center gap-2">
                  <Check className="h-4 w-4 text-success shrink-0" />
                  <span className="text-sm text-success">Operador já vinculado ao projeto</span>
                </div>
              )}

              <div className="space-y-2">
                <Label>Usuário Elegível *</Label>
                <Select value={opSelectedUserId} onValueChange={setOpSelectedUserId}>
                  <SelectTrigger className="h-11">
                    {opSelectedUserId ? (
                      <div className="flex items-center gap-2 w-full overflow-hidden">
                        <span className="truncate">
                          {usersDisponiveis.find(u => u.user_id === opSelectedUserId)?.display_name}
                        </span>
                        {usersDisponiveis.find(u => u.user_id === opSelectedUserId) && 
                          getEligibilityBadge(usersDisponiveis.find(u => u.user_id === opSelectedUserId)!)}
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
                            <span className="truncate max-w-[200px]">{user.display_name}</span>
                            {getEligibilityBadge(user)}
                          </div>
                        </SelectItem>
                      ))
                    )}
                  </SelectContent>
                </Select>
              </div>

              <Separator />

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Função no Projeto</Label>
                  <Input
                    value={opFuncao}
                    onChange={(e) => setOpFuncao(e.target.value)}
                    placeholder="Ex: Trader, Analista"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Data de Entrada</Label>
                  <DatePicker value={opDataEntrada} onChange={setOpDataEntrada} />
                </div>
              </div>

              <div className="space-y-2">
                <Label>Resumo do Acordo</Label>
                <Textarea
                  value={opResumoAcordo}
                  onChange={(e) => setOpResumoAcordo(e.target.value)}
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
                    <Select value={opModeloPagamento} onValueChange={setOpModeloPagamento}>
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

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    {showValorFixo && (
                      <div className="space-y-2">
                        <Label>Valor Fixo (R$)</Label>
                        <Input
                          type="number"
                          step="0.01"
                          min="0"
                          value={opValorFixo}
                          onChange={(e) => setOpValorFixo(e.target.value)}
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
                          value={opPercentual}
                          onChange={(e) => setOpPercentual(e.target.value)}
                          placeholder="0"
                        />
                      </div>
                    )}
                  </div>

                  <div className="space-y-2">
                    <Label>Base de Cálculo</Label>
                    <Select value={opBaseCalculo} onValueChange={setOpBaseCalculo}>
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

              {hasOperatorLinked && (
                <>
                  <Separator />
                  <div className="space-y-2">
                    <p className="text-sm text-muted-foreground text-center">Próximos passos:</p>
                    <div className="flex flex-col sm:flex-row gap-2">
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
                </>
              )}
            </div>
          )}

          {step === "createCycle" && (
            <div className="space-y-5">
              {/* Success state after creating a cycle */}
              {cycleCreatedSuccess && createdCycleInfo ? (
                <div className="space-y-6">
                  <div className="text-center space-y-3">
                    <div className="inline-flex items-center justify-center w-14 h-14 rounded-full bg-success/10">
                      <CheckCircle2 className="h-7 w-7 text-success" />
                    </div>
                    <h3 className="text-lg font-semibold">Ciclo {createdCycleInfo.numero_ciclo} criado com sucesso!</h3>
                    <p className="text-sm text-muted-foreground">
                      Deseja criar outro ciclo agora?
                    </p>
                  </div>

                  {/* Cycle summary */}
                  <div className="space-y-3 p-4 rounded-lg bg-muted/50 border">
                    <h4 className="font-medium text-sm">Resumo do Ciclo Criado</h4>
                    <div className="space-y-2 text-sm">
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Período</span>
                        <span className="font-medium">
                          {format(new Date(createdCycleInfo.data_inicio), "dd/MM/yyyy")} - {format(new Date(createdCycleInfo.data_fim_prevista), "dd/MM/yyyy")}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Gatilho</span>
                        <span className="font-medium">
                          {TIPOS_GATILHO.find(t => t.value === createdCycleInfo.tipo_gatilho)?.label}
                        </span>
                      </div>
                      {createdCycleInfo.meta_volume && (
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Meta</span>
                          <span className="font-medium">
                            R$ {createdCycleInfo.meta_volume.toLocaleString("pt-BR")} ({METRICAS.find(m => m.value === createdCycleInfo.metrica_acumuladora)?.label})
                          </span>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Action buttons */}
                  <div className="flex flex-col gap-2">
                    <Button onClick={handleCreateAnotherCycle} variant="outline" className="w-full gap-2">
                      <Plus className="h-4 w-4" />
                      Criar outro ciclo
                    </Button>
                    {!hasOperatorLinked && (
                      <Button 
                        variant="outline" 
                        className="w-full gap-2" 
                        onClick={() => {
                          setCycleCreatedSuccess(false);
                          setStep("linkOperator");
                        }}
                      >
                        <Users className="h-4 w-4" />
                        Vincular Operador
                      </Button>
                    )}
                    <Button onClick={() => setStep("done")} className="w-full gap-2">
                      Concluir
                      <ArrowRight className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              ) : (
                /* Form state - creating a new cycle */
                <>
                  {hasCycle && !cycleCreatedSuccess && (
                    <div className="p-3 rounded-lg bg-muted/50 border flex items-center gap-2">
                      <Check className="h-4 w-4 text-success shrink-0" />
                      <span className="text-sm text-muted-foreground">Já existe um ciclo criado. Você pode criar outro abaixo.</span>
                    </div>
                  )}

                  {operadoresProjeto.length > 0 && (
                    <div className="space-y-2">
                      <Label>Operador Vinculado (opcional)</Label>
                      <Select value={cicloOperadorProjetoId} onValueChange={handleOperadorChange}>
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

                  <Separator />

                  <div className="space-y-2">
                    <Label>Tipo de Gatilho *</Label>
                    <Select value={cicloTipoGatilho} onValueChange={setCicloTipoGatilho}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {TIPOS_GATILHO.map((tipo) => (
                          <SelectItem key={tipo.value} value={tipo.value}>
                            <span className="flex items-center justify-center gap-2 w-full">
                              <tipo.icon className="h-4 w-4" />
                              {tipo.label}
                            </span>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  {showVolumeFields && (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label>Métrica Acumuladora *</Label>
                        <Select value={cicloMetricaAcumuladora} onValueChange={setCicloMetricaAcumuladora}>
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
                          {cicloMetricaAcumuladora === "LUCRO" ? "Meta de Lucro (R$)" : "Meta de Volume (R$)"} *
                        </Label>
                        <Input
                          type="number"
                          step="100"
                          min="0"
                          value={cicloMetaVolume}
                          onChange={(e) => setCicloMetaVolume(e.target.value)}
                          placeholder={cicloMetricaAcumuladora === "LUCRO" ? "5000" : "150000"}
                        />
                      </div>
                    </div>
                  )}

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>Data Início *</Label>
                      <DatePicker value={cicloDataInicio} onChange={setCicloDataInicio} />
                    </div>
                    <div className="space-y-2">
                      <Label>{cicloTipoGatilho === "VOLUME" ? "Data Limite" : "Data Fim Prevista"} *</Label>
                      <DatePicker value={cicloDataFimPrevista} onChange={setCicloDataFimPrevista} />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label>Observações</Label>
                    <Textarea
                      value={cicloObservacoes}
                      onChange={(e) => setCicloObservacoes(e.target.value)}
                      placeholder="Notas sobre este ciclo..."
                      rows={2}
                    />
                  </div>
                </>
              )}
            </div>
          )}

          {step === "done" && (
            <div className="space-y-6">
              <div className="text-center space-y-3">
                <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-success/10">
                  <Sparkles className="h-8 w-8 text-success" />
                </div>
                <h3 className="text-xl font-semibold">Projeto Configurado!</h3>
                <p className="text-sm text-muted-foreground">
                  Seu projeto está pronto para operação.
                </p>
              </div>

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
          )}
        </div>

        {/* Footer - fixed (hide when in cycle success state) */}
        {step !== "done" && step !== "choose" && !(step === "createCycle" && cycleCreatedSuccess) && (
          <div className="px-6 py-4 border-t bg-muted/30 backdrop-blur-sm flex justify-between items-center">
            <Button 
              variant="outline" 
              onClick={() => {
                if (step === "createCycle") {
                  setCycleCreatedSuccess(false);
                }
                setStep("choose");
              }} 
              className="gap-2"
            >
              <ChevronLeft className="h-4 w-4" />
              Voltar
            </Button>
            {step === "linkOperator" && (
              <Button 
                onClick={handleSaveOperator} 
                disabled={loading || !opSelectedUserId}
              >
                {loading ? "Vinculando..." : "Vincular Operador"}
              </Button>
            )}
            {step === "createCycle" && !cycleCreatedSuccess && (
              <Button 
                onClick={handleSaveCycle} 
                disabled={loading || isSubmittingCycle}
              >
                {loading ? "Criando..." : "Criar Ciclo"}
              </Button>
            )}
          </div>
        )}

        {step === "choose" && (
          <div className="px-6 py-4 border-t bg-muted/30 backdrop-blur-sm flex justify-between items-center">
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
        )}
      </DialogContent>
    </Dialog>
  );
}
