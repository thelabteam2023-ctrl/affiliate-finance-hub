import { AlertTriangle, Gift, Target, X } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { useState } from "react";

interface BonusImpactAlertProps {
  bookmakerId: string | null;
  bookmakerNome: string;
  estrategia: string;
  hasActiveBonus: boolean;
  rolloverProgress?: number;
  rolloverTarget?: number;
  minOdds?: number;
  currentOdd?: number;
}

/**
 * Alerta contextual não-bloqueante exibido quando uma casa com bônus ativo
 * é utilizada em estratégias fora de EXTRACAO_BONUS.
 * 
 * Regra de negócio:
 * - O rollover é impactado normalmente por qualquer aposta
 * - O sistema não ignora a movimentação em nenhuma camada analítica
 * - Este alerta é apenas informativo, não bloqueia a operação
 */
export function BonusImpactAlert({
  bookmakerId,
  bookmakerNome,
  estrategia,
  hasActiveBonus,
  rolloverProgress = 0,
  rolloverTarget = 0,
  minOdds,
  currentOdd,
}: BonusImpactAlertProps) {
  const [isDismissed, setIsDismissed] = useState(false);

  // Não exibir se:
  // - Não há casa selecionada
  // - A casa não tem bônus ativo
  // - A estratégia já é EXTRACAO_BONUS
  // - O alerta foi dispensado pelo usuário
  if (!bookmakerId || !hasActiveBonus || estrategia === "EXTRACAO_BONUS" || isDismissed) {
    return null;
  }

  const rolloverPercent = rolloverTarget > 0 
    ? Math.min((rolloverProgress / rolloverTarget) * 100, 100).toFixed(0) 
    : 0;
  
  const oddMeetsMinimum = !minOdds || !currentOdd || currentOdd >= minOdds;

  return (
    <Alert className="border-amber-500/40 bg-amber-500/10 relative py-2.5 px-3">
      <Button
        variant="ghost"
        size="icon"
        className="absolute top-1.5 right-1.5 h-5 w-5 text-muted-foreground/60 hover:text-foreground"
        onClick={() => setIsDismissed(true)}
      >
        <X className="h-3 w-3" />
      </Button>
      
      <div className="flex items-start gap-2 pr-6">
        <Gift className="h-4 w-4 text-amber-500 mt-0.5 shrink-0" />
        <div className="space-y-1">
          <p className="text-xs font-medium text-amber-500/90">
            Impacto em bônus ativo
          </p>
          <AlertDescription className="text-xs text-muted-foreground leading-relaxed">
            <span className="font-medium text-foreground/80">{bookmakerNome}</span> possui bônus ativo.
            Esta aposta impactará o <strong>rollover</strong> e a <strong>performance de bônus</strong>.
          </AlertDescription>
          
          {rolloverTarget > 0 && (
            <div className="flex items-center gap-2 mt-1.5 text-[10px] text-muted-foreground">
              <Target className="h-3 w-3" />
              <span>Rollover: {rolloverPercent}% ({rolloverProgress.toFixed(0)}/{rolloverTarget.toFixed(0)})</span>
            </div>
          )}
          
          {minOdds && currentOdd && !oddMeetsMinimum && (
            <div className="flex items-center gap-2 mt-1 text-[10px] text-amber-600">
              <AlertTriangle className="h-3 w-3" />
              <span>Odd {currentOdd.toFixed(2)} não atende mínima de {minOdds.toFixed(2)} - não conta para rollover</span>
            </div>
          )}
        </div>
      </div>
    </Alert>
  );
}
