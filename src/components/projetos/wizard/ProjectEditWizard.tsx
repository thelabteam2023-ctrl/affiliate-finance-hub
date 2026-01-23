/**
 * Wizard de Edição de Projeto
 * Reutiliza os mesmos componentes do wizard de criação, com dados pré-preenchidos
 * e campos bloqueados conforme necessário.
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
import { Loader2, Save } from "lucide-react";

import { WizardStepIndicator } from "./WizardStepIndicator";
import {
  WizardStep,
  WIZARD_STEPS,
  ProjectFormData,
  DEFAULT_FORM_DATA,
} from "./ProjectCreationWizardTypes";
import { StepDadosBasicosEdit } from "./steps/StepDadosBasicosEdit";
import { StepMoedaConsolidacaoEdit } from "./steps/StepMoedaConsolidacaoEdit";
import { StepEstruturaOperacional } from "./steps/StepEstruturaOperacional";

// Steps reduzidos para edição - foco em dados, moeda e estrutura
const EDIT_STEPS: WizardStep[] = ["dados", "moeda", "estrutura"];

interface ProjectEditWizardProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projeto: {
    id: string;
    nome: string;
    descricao?: string | null;
    status: string;
    data_inicio: string | null;
    data_fim_prevista: string | null;
    data_fim_real?: string | null;
    tem_investimento_crypto?: boolean;
    investidor_id?: string | null;
    percentual_investidor?: number;
    base_calculo_investidor?: string;
    moeda_consolidacao?: string;
    fonte_cotacao?: string;
    cotacao_trabalho?: number | null;
    modelo_absorcao_taxas?: string;
    conciliado?: boolean;
  };
  onSuccess: () => void;
}

export function ProjectEditWizard({
  open,
  onOpenChange,
  projeto,
  onSuccess,
}: ProjectEditWizardProps) {
  const { workspaceId } = useWorkspace();
  const [currentStep, setCurrentStep] = useState<WizardStep>("dados");
  const [completedSteps, setCompletedSteps] = useState<WizardStep[]>([]);
  const [skippedSteps, setSkippedSteps] = useState<WizardStep[]>([]);
  const [formData, setFormData] = useState<ProjectFormData>(DEFAULT_FORM_DATA);
  const [loading, setLoading] = useState(false);
  const [initialLoading, setInitialLoading] = useState(true);

  // Função para verificar se etapa deve ser pulada
  const shouldSkipStep = (step: WizardStep, data: ProjectFormData): boolean => {
    if (step === "estrutura") {
      // Pular Estrutura se BRL e sem crypto
      return data.moeda_consolidacao === "BRL" && !data.tem_investimento_crypto;
    }
    return false;
  };

  // Carregar dados do projeto
  useEffect(() => {
    if (open && projeto.id) {
      loadProjectData();
    }
  }, [open, projeto.id]);

  const loadProjectData = async () => {
    setInitialLoading(true);
    try {
      const { data, error } = await supabase
        .from("projetos")
        .select("*")
        .eq("id", projeto.id)
        .single();

      if (error) throw error;

      if (data) {
        setFormData({
          ...DEFAULT_FORM_DATA,
          nome: data.nome || "",
          descricao: data.descricao || null,
          status: data.status || "EM_ANDAMENTO",
          tipo_projeto: data.tipo_projeto || "OUTROS",
          data_inicio: data.data_inicio || null,
          data_fim_prevista: data.data_fim_prevista || null,
          tem_investimento_crypto: data.tem_investimento_crypto || false,
          investidor_id: data.investidor_id || null,
          percentual_investidor: data.percentual_investidor || 0,
          base_calculo_investidor: data.base_calculo_investidor || "LUCRO_LIQUIDO",
          moeda_consolidacao: (data.moeda_consolidacao as "BRL" | "USD") || "BRL",
          fonte_cotacao: (data.fonte_cotacao as "TRABALHO" | "PTAX") || "TRABALHO",
          cotacao_trabalho: data.cotacao_trabalho || null,
          modelo_absorcao_taxas: data.modelo_absorcao_taxas || "EMPRESA_100",
        });
      }
    } catch (error) {
      console.error("Erro ao carregar projeto:", error);
      toast.error("Erro ao carregar dados do projeto");
    } finally {
      setInitialLoading(false);
    }
  };

  const handleFormChange = (data: Partial<ProjectFormData>) => {
    setFormData((prev) => ({ ...prev, ...data }));
  };

  // Filtrar steps baseado no contexto
  const getVisibleSteps = (): WizardStep[] => {
    return EDIT_STEPS.filter(step => !shouldSkipStep(step, formData));
  };

  const visibleSteps = getVisibleSteps();
  const currentIndex = visibleSteps.indexOf(currentStep);
  const isLastStep = currentIndex === visibleSteps.length - 1;

  const validateStep = (step: WizardStep): boolean => {
    switch (step) {
      case "dados":
        return !!formData.nome.trim() && !!formData.data_inicio;
      case "moeda":
        if (formData.moeda_consolidacao === "BRL") {
          return true;
        }
        return (
          !!formData.moeda_consolidacao &&
          (formData.fonte_cotacao === "PTAX" || formData.cotacao_trabalho !== null)
        );
      case "estrutura":
        return true;
      default:
        return true;
    }
  };

  const goNext = () => {
    if (!validateStep(currentStep)) {
      toast.error("Preencha os campos obrigatórios antes de continuar");
      return;
    }
    if (!completedSteps.includes(currentStep)) {
      setCompletedSteps((prev) => [...prev, currentStep]);
    }
    
    const nextIndex = currentIndex + 1;
    if (nextIndex < visibleSteps.length) {
      setCurrentStep(visibleSteps[nextIndex]);
    }
  };

  const goBack = () => {
    const prevIndex = currentIndex - 1;
    if (prevIndex >= 0) {
      setCurrentStep(visibleSteps[prevIndex]);
    }
  };

  const handleSave = async () => {
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

      const payload = {
        nome: formData.nome.trim(),
        descricao: formData.descricao,
        status: formData.status,
        tipo_projeto: formData.tipo_projeto || "OUTROS",
        data_inicio: formData.data_inicio,
        data_fim_prevista: formData.data_fim_prevista,
        tem_investimento_crypto: formData.tem_investimento_crypto,
        modelo_absorcao_taxas: formData.modelo_absorcao_taxas,
        moeda_consolidacao: formData.moeda_consolidacao,
        fonte_cotacao: formData.fonte_cotacao,
        cotacao_trabalho: formData.cotacao_trabalho,
        investidor_id: formData.investidor_id,
        percentual_investidor: formData.percentual_investidor,
        base_calculo_investidor: formData.base_calculo_investidor,
      };

      const { error } = await supabase
        .from("projetos")
        .update(payload)
        .eq("id", projeto.id);

      if (error) {
        if (error.code === "23505") {
          toast.error("Já existe um projeto com este nome");
          return;
        }
        throw error;
      }

      toast.success("Projeto atualizado com sucesso!");
      onOpenChange(false);
      onSuccess();
    } catch (error: any) {
      toast.error("Erro ao atualizar projeto: " + error.message);
    } finally {
      setLoading(false);
    }
  };

  // Navigate to specific step
  const handleStepClick = (step: WizardStep) => {
    if (visibleSteps.includes(step)) {
      // Validar steps anteriores
      const targetIndex = visibleSteps.indexOf(step);
      for (let i = 0; i < targetIndex; i++) {
        if (!validateStep(visibleSteps[i]) && !completedSteps.includes(visibleSteps[i])) {
          toast.error("Complete os passos anteriores primeiro");
          return;
        }
      }
      setCurrentStep(step);
    }
  };

  const renderStep = () => {
    if (initialLoading) {
      return (
        <div className="flex items-center justify-center h-64">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      );
    }

    switch (currentStep) {
      case "dados":
        return (
          <StepDadosBasicosEdit
            formData={formData}
            onChange={handleFormChange}
            isEditMode={true}
            projetoId={projeto.id}
          />
        );
      case "moeda":
        return (
          <StepMoedaConsolidacaoEdit
            formData={formData}
            onChange={handleFormChange}
            isEditMode={true}
            canChangeCurrency={false} // Moeda não pode ser alterada após criação
          />
        );
      case "estrutura":
        return (
          <StepEstruturaOperacional
            formData={formData}
            onChange={handleFormChange}
          />
        );
      default:
        return null;
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh]">
        <DialogHeader>
          <DialogTitle>Editar Projeto</DialogTitle>
        </DialogHeader>

        <WizardStepIndicator
          currentStep={currentStep}
          completedSteps={completedSteps}
          skippedSteps={skippedSteps}
          steps={visibleSteps}
          onStepClick={handleStepClick}
        />

        <ScrollArea className="h-[450px] pr-4">{renderStep()}</ScrollArea>

        <div className="flex justify-between pt-4 border-t">
          {currentIndex > 0 ? (
            <Button variant="outline" onClick={goBack}>
              Voltar
            </Button>
          ) : (
            <div />
          )}

          <div className="flex gap-2">
            <Button variant="ghost" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>

            {isLastStep ? (
              <Button onClick={handleSave} disabled={loading}>
                {loading ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Salvando...
                  </>
                ) : (
                  <>
                    <Save className="h-4 w-4 mr-2" />
                    Salvar Alterações
                  </>
                )}
              </Button>
            ) : (
              <Button onClick={goNext}>Continuar</Button>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
