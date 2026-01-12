/**
 * Indicador visual de progresso do wizard
 * Arquitetura: Grid separado para círculos e linhas conectoras
 */

import { Check } from "lucide-react";
import { cn } from "@/lib/utils";
import { WizardStep, WIZARD_STEPS, STEP_CONFIG } from "./ProjectCreationWizardTypes";

interface WizardStepIndicatorProps {
  currentStep: WizardStep;
  completedSteps: WizardStep[];
}

export function WizardStepIndicator({ currentStep, completedSteps }: WizardStepIndicatorProps) {
  const currentIndex = WIZARD_STEPS.indexOf(currentStep);

  return (
    <div className="w-full mb-8">
      {/* Container principal com posicionamento relativo */}
      <div className="relative">
        {/* Camada 1: Linhas conectoras (posição absoluta, atrás dos círculos) */}
        <div 
          className="absolute top-5 left-0 right-0 flex items-center"
          style={{ 
            paddingLeft: 'calc(100% / 14)', // Metade da largura de uma etapa
            paddingRight: 'calc(100% / 14)' 
          }}
        >
          {WIZARD_STEPS.slice(0, -1).map((step, index) => {
            const isCompleted = completedSteps.includes(step);
            const isPast = index < currentIndex;

            return (
              <div
                key={`line-${step}`}
                className={cn(
                  "flex-1 h-0.5 transition-colors duration-300",
                  isPast || isCompleted ? "bg-primary" : "bg-muted-foreground/20"
                )}
              />
            );
          })}
        </div>

        {/* Camada 2: Círculos e labels (grid uniforme) */}
        <div 
          className="relative grid"
          style={{ gridTemplateColumns: `repeat(${WIZARD_STEPS.length}, 1fr)` }}
        >
          {WIZARD_STEPS.map((step, index) => {
            const config = STEP_CONFIG[step];
            const isCompleted = completedSteps.includes(step);
            const isCurrent = step === currentStep;

            return (
              <div key={step} className="flex flex-col items-center">
                {/* Círculo */}
                <div
                  className={cn(
                    "w-10 h-10 rounded-full flex items-center justify-center border-2 transition-all duration-300 bg-background",
                    isCompleted && "bg-primary border-primary",
                    isCurrent && !isCompleted && "border-primary bg-primary/10",
                    !isCurrent && !isCompleted && "border-muted-foreground/30 bg-muted/50"
                  )}
                >
                  {isCompleted ? (
                    <Check className="h-5 w-5 text-primary-foreground" />
                  ) : (
                    <span
                      className={cn(
                        "text-sm font-semibold leading-none",
                        isCurrent ? "text-primary" : "text-muted-foreground"
                      )}
                    >
                      {index + 1}
                    </span>
                  )}
                </div>

                {/* Label */}
                <div className="mt-2 text-center">
                  <p
                    className={cn(
                      "text-xs font-medium transition-colors duration-300",
                      isCurrent ? "text-foreground" : "text-muted-foreground"
                    )}
                  >
                    {config.label}
                  </p>
                  {!config.required && (
                    <span className="text-[10px] text-muted-foreground/60">Opcional</span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
