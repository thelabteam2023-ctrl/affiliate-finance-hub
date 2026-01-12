/**
 * Indicador visual de progresso do wizard
 * Arquitetura: Grid separado para círculos e linhas conectoras
 * Suporta etapas puladas (auto-resolvidas)
 */

import { Check, SkipForward } from "lucide-react";
import { cn } from "@/lib/utils";
import { WizardStep, WIZARD_STEPS, STEP_CONFIG } from "./ProjectCreationWizardTypes";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

interface WizardStepIndicatorProps {
  currentStep: WizardStep;
  completedSteps: WizardStep[];
  skippedSteps?: WizardStep[];
  /** Optional: override which steps to display (for edit mode) */
  steps?: WizardStep[];
  /** Optional: callback when step is clicked (for navigation) */
  onStepClick?: (step: WizardStep) => void;
}

export function WizardStepIndicator({ 
  currentStep, 
  completedSteps,
  skippedSteps = [],
  steps,
  onStepClick,
}: WizardStepIndicatorProps) {
  // Use provided steps or default to all wizard steps
  const displaySteps = steps || WIZARD_STEPS;
  const currentIndex = displaySteps.indexOf(currentStep);

  return (
    <div className="w-full mb-8">
      {/* Container principal com posicionamento relativo */}
      <div className="relative">
        {/* Camada 1: Linhas conectoras (posição absoluta, atrás dos círculos) */}
        <div 
          className="absolute top-5 left-0 right-0 flex items-center"
          style={{ 
            paddingLeft: `calc(100% / ${displaySteps.length * 2})`,
            paddingRight: `calc(100% / ${displaySteps.length * 2})` 
          }}
        >
          {displaySteps.slice(0, -1).map((step, index) => {
            const isCompleted = completedSteps.includes(step);
            const isSkipped = skippedSteps.includes(step);
            const isPast = index < currentIndex;

            return (
              <div
                key={`line-${step}`}
                className={cn(
                  "flex-1 h-0.5 transition-colors duration-300",
                  isSkipped 
                    ? "bg-amber-500/50" 
                    : isPast || isCompleted 
                      ? "bg-primary" 
                      : "bg-muted-foreground/20"
                )}
              />
            );
          })}
        </div>

        {/* Camada 2: Círculos e labels (grid uniforme) */}
        <div 
          className="relative grid"
          style={{ gridTemplateColumns: `repeat(${displaySteps.length}, 1fr)` }}
        >
          <TooltipProvider delayDuration={200}>
            {displaySteps.map((step, index) => {
              const config = STEP_CONFIG[step];
              const isCompleted = completedSteps.includes(step);
              const isSkipped = skippedSteps.includes(step);
              const isCurrent = step === currentStep;
              const isClickable = !!onStepClick && (isCompleted || index <= currentIndex);

              // Handler para clique
              const handleClick = () => {
                if (isClickable && onStepClick) {
                  onStepClick(step);
                }
              };

              // Etapa pulada - visual diferenciado
              if (isSkipped) {
                return (
                  <Tooltip key={step}>
                    <TooltipTrigger asChild>
                      <div className="flex flex-col items-center">
                        {/* Círculo - etapa pulada (amarelo warning) */}
                        <div className="w-10 h-10 rounded-full flex items-center justify-center border-2 border-amber-500/60 bg-amber-500/15">
                          <SkipForward className="h-4 w-4 text-amber-500" />
                        </div>

                        {/* Label */}
                        <div className="mt-2 text-center">
                          <p className="text-xs font-medium text-amber-500/80">
                            {config.label}
                          </p>
                          <span className="text-[10px] text-amber-500/60">Pulada</span>
                        </div>
                      </div>
                    </TooltipTrigger>
                    <TooltipContent side="bottom" className="text-xs">
                      Não aplicável para projeto em BRL sem crypto
                    </TooltipContent>
                  </Tooltip>
                );
              }

              return (
                <div
                  key={step}
                  className={cn(
                    "flex flex-col items-center",
                    isClickable && "cursor-pointer"
                  )}
                  onClick={handleClick}
                >
                  {/* Círculo */}
                  <div
                    className={cn(
                      "w-10 h-10 rounded-full flex items-center justify-center border-2 transition-all duration-300 bg-background",
                      isCompleted && "bg-primary border-primary",
                      isCurrent && !isCompleted && "border-primary bg-primary/10",
                      !isCurrent && !isCompleted && "border-muted-foreground/30 bg-muted/50",
                      isClickable && "hover:scale-105"
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
          </TooltipProvider>
        </div>
      </div>
    </div>
  );
}
