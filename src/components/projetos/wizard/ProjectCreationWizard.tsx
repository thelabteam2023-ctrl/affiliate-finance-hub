/**
 * Wizard Completo de Criação de Projeto
 * 7 Etapas: Dados → Moeda → Estrutura → Operador → Ciclos → Módulos → Revisão
 */

import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useWorkspace } from "@/hooks/useWorkspace";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { ChevronLeft, ChevronRight, Loader2 } from "lucide-react";

import { WizardStepIndicator } from "./WizardStepIndicator";
import {
  WizardStep,
  WIZARD_STEPS,
  ProjectFormData,
  DEFAULT_FORM_DATA,
} from "./ProjectCreationWizardTypes";
import { StepDadosBasicos } from "./steps/StepDadosBasicos";
import { StepMoedaConsolidacao } from "./steps/StepMoedaConsolidacao";
import { StepEstruturaOperacional } from "./steps/StepEstruturaOperacional";
import { StepOperador } from "./steps/StepOperador";
import { StepCiclos } from "./steps/StepCiclos";
import { StepModulos } from "./steps/StepModulos";
import { StepRevisao } from "./steps/StepRevisao";

interface ProjectCreationWizardProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: (projectId: string) => void;
}

export function ProjectCreationWizard({
  open,
  onOpenChange,
  onSuccess,
}: ProjectCreationWizardProps) {
  const { workspaceId } = useWorkspace();
  const [currentStep, setCurrentStep] = useState<WizardStep>("dados");
  const [completedSteps, setCompletedSteps] = useState<WizardStep[]>([]);
  const [skippedSteps, setSkippedSteps] = useState<WizardStep[]>([]);
  const [formData, setFormData] = useState<ProjectFormData>(DEFAULT_FORM_DATA);
  const [selectedModules, setSelectedModules] = useState<string[]>([]);
  const [modulesNames, setModulesNames] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);

  // Função para verificar se etapa deve ser pulada
  const shouldSkipStep = (step: WizardStep, data: ProjectFormData): boolean => {
    if (step === "estrutura") {
      // Pular Estrutura se BRL e sem crypto
      return data.moeda_consolidacao === "BRL" && !data.tem_investimento_crypto;
    }
    return false;
  };

  // Reset when dialog opens
  useEffect(() => {
    if (open) {
      setCurrentStep("dados");
      setCompletedSteps([]);
      setSkippedSteps([]);
      setFormData(DEFAULT_FORM_DATA);
      setSelectedModules([]);
    }
  }, [open]);

  // Fetch module names for review step
  useEffect(() => {
    const fetchModuleNames = async () => {
      const { data } = await supabase
        .from("project_modules_catalog")
        .select("id, name");
      if (data) {
        const names: Record<string, string> = {};
        data.forEach((m) => (names[m.id] = m.name));
        setModulesNames(names);
      }
    };
    fetchModuleNames();
  }, []);

  const handleFormChange = (data: Partial<ProjectFormData>) => {
    setFormData((prev) => ({ ...prev, ...data }));
  };

  const currentIndex = WIZARD_STEPS.indexOf(currentStep);

  const validateStep = (step: WizardStep): boolean => {
    switch (step) {
      case "dados":
        return !!formData.nome.trim() && !!formData.data_inicio;
      case "moeda":
        // BRL não precisa de cotação, USD precisa
        if (formData.moeda_consolidacao === "BRL") {
          return true;
        }
        return (
          !!formData.moeda_consolidacao &&
          (formData.fonte_cotacao === "PTAX" || formData.cotacao_trabalho !== null)
        );
      case "estrutura":
        return true;
      case "operador":
        // Optional step - always valid
        // If vincular_operador is true, we need a user selected
        if (formData.vincular_operador && !formData.operador_user_id) {
          return false;
        }
        return true;
      case "ciclos":
        if (!formData.criar_ciclo) return true;
        return (
          !!formData.ciclo_nome &&
          !!formData.ciclo_data_inicio &&
          !!formData.ciclo_data_fim &&
          formData.ciclo_meta_volume > 0
        );
      case "modulos":
        return true;
      case "revisao":
        return true;
      default:
        return true;
    }
  };

  const goNext = () => {
    if (!validateStep(currentStep)) {
      if (currentStep === "operador") {
        toast.error("Selecione um operador ou desmarque a opção de vincular");
        return;
      }
      toast.error("Preencha os campos obrigatórios antes de continuar");
      return;
    }
    if (!completedSteps.includes(currentStep)) {
      setCompletedSteps((prev) => [...prev, currentStep]);
    }
    
    // Encontrar próxima etapa válida (pulando as que devem ser puladas)
    let nextIndex = currentIndex + 1;
    while (nextIndex < WIZARD_STEPS.length) {
      const nextStep = WIZARD_STEPS[nextIndex];
      if (shouldSkipStep(nextStep, formData)) {
        // Marcar como pulada
        if (!skippedSteps.includes(nextStep)) {
          setSkippedSteps((prev) => [...prev, nextStep]);
        }
        nextIndex++;
      } else {
        // Remover de puladas se estava antes (mudou contexto)
        if (skippedSteps.includes(nextStep)) {
          setSkippedSteps((prev) => prev.filter(s => s !== nextStep));
        }
        break;
      }
    }
    
    if (nextIndex < WIZARD_STEPS.length) {
      setCurrentStep(WIZARD_STEPS[nextIndex]);
    }
  };

  const goBack = () => {
    // Encontrar etapa anterior válida (pulando as que devem ser puladas)
    let prevIndex = currentIndex - 1;
    while (prevIndex >= 0) {
      const prevStep = WIZARD_STEPS[prevIndex];
      if (shouldSkipStep(prevStep, formData)) {
        prevIndex--;
      } else {
        break;
      }
    }
    
    if (prevIndex >= 0) {
      setCurrentStep(WIZARD_STEPS[prevIndex]);
    }
  };

  const handleCreate = async () => {
    if (!validateStep("dados") || !validateStep("moeda")) {
      toast.error("Preencha todos os campos obrigatórios");
      return;
    }

    setLoading(true);
    try {
      const { data: session } = await supabase.auth.getSession();
      if (!session.session) {
        toast.error("Usuário não autenticado");
        return;
      }

      // Create project
      const projectPayload = {
        nome: formData.nome.trim(),
        descricao: formData.descricao,
        status: formData.status,
        data_inicio: formData.data_inicio,
        data_fim_prevista: formData.data_fim_prevista,
        orcamento_inicial: 0,
        tem_investimento_crypto: formData.tem_investimento_crypto,
        modelo_absorcao_taxas: formData.modelo_absorcao_taxas,
        moeda_consolidacao: formData.moeda_consolidacao,
        fonte_cotacao: formData.fonte_cotacao,
        cotacao_trabalho: formData.cotacao_trabalho,
        investidor_id: formData.investidor_id,
        percentual_investidor: formData.percentual_investidor,
        base_calculo_investidor: formData.base_calculo_investidor,
        tipo_projeto: "INTERNO",
        user_id: session.session.user.id,
        workspace_id: workspaceId!,
      };

      const { data: newProject, error: projectError } = await supabase
        .from("projetos")
        .insert(projectPayload)
        .select("id")
        .single();

      if (projectError) {
        if (projectError.code === "23505") {
          toast.error("Já existe um projeto com este nome");
          return;
        }
        throw projectError;
      }

      const projectId = newProject.id;

      // Vinculate operator if requested
      if (formData.vincular_operador && formData.operador_user_id) {
        await vincularOperador(projectId, session.session.user.id);
      }

      // Create cycle if requested
      if (formData.criar_ciclo && formData.ciclo_nome) {
        await supabase.from("projeto_ciclos").insert({
          projeto_id: projectId,
          nome: formData.ciclo_nome,
          data_inicio: formData.ciclo_data_inicio,
          data_fim_prevista: formData.ciclo_data_fim,
          meta_volume: formData.ciclo_meta_volume,
          metrica_acumuladora: formData.ciclo_metrica,
          status: "ATIVO",
          user_id: session.session.user.id,
          workspace_id: workspaceId!,
        });
      }

      // Activate selected modules
      if (selectedModules.length > 0) {
        const modulesToInsert = selectedModules.map((moduleId, index) => ({
          projeto_id: projectId,
          module_id: moduleId,
          status: "active",
          display_order: index + 1,
          activated_by: session.session.user.id,
          workspace_id: workspaceId!,
        }));

        await supabase.from("project_modules").insert(modulesToInsert);
      }

      toast.success("Projeto criado com sucesso!");
      onOpenChange(false);
      onSuccess(projectId);
    } catch (error: any) {
      toast.error("Erro ao criar projeto: " + error.message);
    } finally {
      setLoading(false);
    }
  };

  // Helper function to vinculate operator
  const vincularOperador = async (projectId: string, currentUserId: string) => {
    if (!workspaceId || !formData.operador_user_id) return;

    try {
      // Check if operador record exists for this user
      const { data: existingOperador } = await supabase
        .from("operadores")
        .select("id")
        .eq("auth_user_id", formData.operador_user_id)
        .eq("workspace_id", workspaceId)
        .maybeSingle();

      let operadorId = existingOperador?.id;

      // If no operador record, create one
      if (!operadorId) {
        // Get profile info
        const { data: profile } = await supabase
          .from("profiles")
          .select("full_name, email, cpf")
          .eq("id", formData.operador_user_id)
          .single();

        const { data: newOperador, error: opError } = await supabase
          .from("operadores")
          .insert({
            auth_user_id: formData.operador_user_id,
            nome: profile?.full_name || "Operador",
            email: profile?.email,
            cpf: profile?.cpf,
            status: "ATIVO",
            user_id: currentUserId,
            workspace_id: workspaceId,
          })
          .select("id")
          .single();

        if (opError) throw opError;
        operadorId = newOperador.id;
      }

      // Create the operador_projetos link
      const { error: linkError } = await supabase
        .from("operador_projetos")
        .insert({
          operador_id: operadorId,
          projeto_id: projectId,
          data_entrada: new Date().toISOString().split("T")[0],
          status: "ATIVO",
          modelo_pagamento: formData.operador_modelo_pagamento,
          percentual: formData.operador_percentual,
          valor_fixo: formData.operador_valor_fixo,
          base_calculo: formData.operador_base_calculo,
          resumo_acordo: formData.operador_resumo_acordo || null,
          user_id: currentUserId,
          workspace_id: workspaceId,
        });

      if (linkError) {
        console.error("Error linking operator:", linkError);
        // Don't throw - project was created, operator link is secondary
        toast.warning("Projeto criado, mas houve erro ao vincular operador");
      }
    } catch (error) {
      console.error("Error in vincularOperador:", error);
      toast.warning("Projeto criado, mas houve erro ao vincular operador");
    }
  };

  const renderStep = () => {
    switch (currentStep) {
      case "dados":
        return <StepDadosBasicos formData={formData} onChange={handleFormChange} />;
      case "moeda":
        return <StepMoedaConsolidacao formData={formData} onChange={handleFormChange} />;
      case "estrutura":
        return <StepEstruturaOperacional formData={formData} onChange={handleFormChange} />;
      case "operador":
        return <StepOperador formData={formData} onChange={handleFormChange} />;
      case "ciclos":
        return <StepCiclos formData={formData} onChange={handleFormChange} />;
      case "modulos":
        return (
          <StepModulos
            selectedModules={selectedModules}
            onSelectionChange={setSelectedModules}
          />
        );
      case "revisao":
        return (
          <StepRevisao
            formData={formData}
            selectedModules={selectedModules}
            modulesNames={modulesNames}
          />
        );
    }
  };

  const isLastStep = currentStep === "revisao";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh]">
        <DialogHeader>
          <DialogTitle>Novo Projeto</DialogTitle>
        </DialogHeader>

        <WizardStepIndicator 
          currentStep={currentStep} 
          completedSteps={completedSteps}
          skippedSteps={skippedSteps}
        />

        <ScrollArea className="h-[450px] pr-4">{renderStep()}</ScrollArea>

        <div className="flex justify-between pt-4 border-t">
          {/* Voltar só aparece a partir da etapa 2 */}
          {currentIndex > 0 ? (
            <Button variant="outline" onClick={goBack}>
              <ChevronLeft className="h-4 w-4 mr-2" />
              Voltar
            </Button>
          ) : (
            <div /> /* Placeholder para manter o layout */
          )}

          <div className="flex gap-2">
            <Button variant="ghost" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>

            {isLastStep ? (
              <Button onClick={handleCreate} disabled={loading}>
                {loading ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Criando...
                  </>
                ) : (
                  "Criar Projeto"
                )}
              </Button>
            ) : (
              <Button onClick={goNext}>
                Continuar
                <ChevronRight className="h-4 w-4 ml-2" />
              </Button>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
