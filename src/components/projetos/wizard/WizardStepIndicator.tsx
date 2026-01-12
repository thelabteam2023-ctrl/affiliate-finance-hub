/**
 * Indicador visual de progresso do wizard
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
    <div className="flex items-center justify-between w-full mb-8">
      {WIZARD_STEPS.map((step, index) => {
        const config = STEP_CONFIG[step];
        const isCompleted = completedSteps.includes(step);
        const isCurrent = step === currentStep;
        const isPast = index < currentIndex;

        return (
          <div key={step} className="flex items-center flex-1 last:flex-none">
            {/* Step Circle */}
            <div className="flex flex-col items-center">
              <div
                className={cn(
                  "w-10 h-10 rounded-full flex items-center justify-center border-2 transition-all",
                  isCompleted && "bg-primary border-primary",
                  isCurrent && !isCompleted && "border-primary bg-primary/10",
                  !isCurrent && !isCompleted && "border-muted-foreground/30 bg-muted/30"
                )}
              >
                {isCompleted ? (
                  <Check className="h-5 w-5 text-primary-foreground" />
                ) : (
                  <span
                    className={cn(
                      "text-sm font-medium",
                      isCurrent ? "text-primary" : "text-muted-foreground"
                    )}
                  >
                    {index + 1}
                  </span>
                )}
              </div>
              <div className="mt-2 text-center">
                <p
                  className={cn(
                    "text-xs font-medium",
                    isCurrent ? "text-foreground" : "text-muted-foreground"
                  )}
                >
                  {config.label}
                </p>
                {!config.required && (
                  <span className="text-[10px] text-muted-foreground/70">Opcional</span>
                )}
              </div>
            </div>

            {/* Connector Line */}
            {index < WIZARD_STEPS.length - 1 && (
              <div
                className={cn(
                  "flex-1 h-0.5 mx-2 transition-colors",
                  isPast || isCompleted ? "bg-primary" : "bg-muted-foreground/20"
                )}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}
